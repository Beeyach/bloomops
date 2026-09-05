import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { loadLimits, scansUsedThisWeek } from '@/lib/limits.mjs';
import { spendExact, refundCredits, scanPrice, OUT_OF_CREDITS } from '@/lib/credits.mjs';
import { openSecret } from '@/lib/secret-box.mjs';
import { scoreProfile } from '@/lib/ig-checklist.mjs';
import { normalizeRelatedProfile, dedupeHandles } from '@/lib/ig-discovery.mjs';
import { filterPosts } from '@/lib/post-filter.mjs';
import { parseFeedUrls, runPodcastScan } from '@/lib/podcast-scan.mjs';
import { runBookingSearch } from '@/lib/booking-search.mjs';
import { siteEmailAndSignals, signalsInText } from '@/lib/extract-email.mjs';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// In-app scans. The server runs Apify actors on a shared token (env
// LTB_SHARED_APIFY_TOKEN, falling back to the workspace's own saved token),
// so users never touch Apify — they fill one small form and press Scan.
//
// Types:
//   fb-ads   — Facebook Ad Library search → unique advertising pages → LEADS
//   fb-posts — Facebook post search on a buyer phrase → posts → LEADS
//   maps     — Google Maps business search → businesses → PROSPECTS (New)
//
// POST { type, query, country?, location?, count } -> starts a run
// GET  ?id=<scanId> -> polls; on success imports results and finalizes

const MIN_FOLLOWERS = 1000; // fb-ads: Ellen's standard

// Bounds on the per-scan email lookup off ad landing pages. The cap stops a big
// scan fanning out into hundreds of fetches; the concurrency keeps them to a few
// rounds so the scan-finalize request does not sit open for minutes.
const AD_EMAIL_LOOKUP_CAP = 25;
const AD_EMAIL_CONCURRENCY = 5;
const COUNT_CHOICES = new Set([20, 50, 100]);
const AD_COUNTRIES = new Set(['US', 'CA', 'AU', 'NZ', 'GB', 'ALL']);

const ACTORS = {
  'fb-ads': 'curious_coder~facebook-ads-library-scraper',
  'fb-posts': 'powerai~facebook-post-search-scraper',
  maps: 'compass~crawler-google-places',
  // Input schema verified against the actor's published docs: it takes
  // `usernames` (array of handles, ids or urls) and returns followersCount,
  // biography, externalUrl, postsCount, highlightReelCount and latestPosts.
  'ig-profiles': 'apify~instagram-profile-scraper',
  // Discovery: give it accounts that already worked and it returns the ones
  // Instagram considers similar, with the follower/engagement/bio/link data
  // the Dream Client Checklist needs in the same pass.
  'ig-discover': 'afanasenko~instagram-related-profiles-scraper',
};

// How many handles one run may carry. Each profile is billed, so this is
// the spend guard for this scan type.
const IG_MAX_PROFILES = 40;
// Discovery is billed per profile analysed (~$0.01), so this is the real
// spend guard. 30 keeps a full week of scans inside a $29 Apify plan.
// searchDepth stays at "1" and is not reachable from the UI: the actor's own
// docs say depth 2 "can yield hundreds to thousands of profiles per seed",
// which is an accidental way to empty the account in one run.
const IG_DISCOVER_MAX = 30;
const IG_DISCOVER_SEEDS = 5;

// Every Instagram handle this workspace has already been shown, gathered
// from its own past scans. Apify does not remember across runs, so the
// only place this can live is here.
async function seenHandles(db, workspace) {
  const { results } = await db
    .prepare(
      `SELECT results FROM scan_runs
       WHERE workspace = ? AND type IN ('ig-profiles','ig-discover') AND results IS NOT NULL`
    )
    .bind(workspace)
    .all();
  const out = new Set();
  for (const row of results || []) {
    try {
      for (const p of JSON.parse(row.results) || []) {
        if (p?.handle) out.add(String(p.handle).toLowerCase());
      }
    } catch {}
  }
  return out;
}

// Handles as a human pastes them: one per line, comma separated, with or
// without @, or as full profile URLs. Shared by both Instagram scan types.
function parseHandles(raw) {
  const handles = String(raw || '')
    .split(/[\n,;\s]+/)
    .map((h) => h.trim())
    .map((h) => h.replace(/^@/, ''))
    .map((h) => {
      const m = h.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      return m ? m[1] : h;
    })
    .map((h) => h.replace(/\/+$/, ''))
    .filter((h) => /^[A-Za-z0-9._]{1,40}$/.test(h));
  return [...new Set(handles)];
}

function env() {
  try { return getRequestContext().env || {}; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

async function resolveToken(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`)
    .bind(workspace)
    .first();
  let own = '';
  if (row && row.value) {
    try { own = (await openSecret(env(), String(JSON.parse(row.value).apifyToken || ''))).trim(); } catch {}
  }
  return own || String(env().LTB_SHARED_APIFY_TOKEN || '').trim();
}

// Non-Apify scans. Fetch, parse, store the results on the scan row as 'done',
// and return the scanId. The GET poller sees 'done' on its first check and
// hands the results straight to the review list, so the frontend flow is
// identical to a maps scan that finished.
async function runLocalScan(db, ctx, body, type) {
  // Shares the weekly quota with every other scan type. Admins are unlimited.
  if (ctx.role !== 'admin') {
    const limits = await loadLimits(db, ctx.workspace);
    if (limits.adScansPerWeek <= 0) {
      return NextResponse.json({ error: 'Scans are not turned on for your workspace yet. Ask Ary.' }, { status: 403 });
    }
    if ((await scansUsedThisWeek(db, ctx.workspace)) >= limits.adScansPerWeek) {
      return NextResponse.json({ error: `You've used all ${limits.adScansPerWeek} scans this week.` }, { status: 429 });
    }
  }

  let results = [];
  let query = '';
  let regionLabel = null;
  let softErrors = [];

  if (type === 'podcast') {
    const feeds = parseFeedUrls(body?.query || body?.feeds);
    if (!feeds.length) {
      return NextResponse.json({ error: 'Paste at least one podcast RSS feed URL.' }, { status: 400 });
    }
    const { rows, errors } = await runPodcastScan(feeds);
    results = rows;
    softErrors = errors;
    query = `${feeds.length} feed${feeds.length === 1 ? '' : 's'}`;
    regionLabel = `${rows.filter((r) => r.guest).length} named guests`;
  } else {
    // booking-search
    const q = String(body?.query || '').trim().slice(0, 160);
    if (!q) return NextResponse.json({ error: 'Type a niche or a search pattern first.' }, { status: 400 });
    const out = await runBookingSearch(q, env());
    if (out.error) return NextResponse.json({ error: out.error }, { status: out.status || 424 });
    results = out.results;
    query = q;
    regionLabel = `${results.length} sites`;
  }

  const ins = await db
    .prepare(
      `INSERT INTO scan_runs (workspace, type, query, country, apify_run_id, status, items_found, results)
       VALUES (?, ?, ?, ?, NULL, 'done', ?, ?)`
    )
    .bind(ctx.workspace, type, query, regionLabel, results.length, JSON.stringify(results))
    .run();

  return NextResponse.json(
    {
      scanId: ins?.meta?.last_row_id,
      status: 'done',
      summary: { landsIn: 'review', found: results.length, results, errors: softErrors },
    },
    { status: 201 }
  );
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  // Podcast and booking search are not Apify actors. They do their work here in
  // the request rather than starting a run to poll, because a fetch-and-parse
  // finishes in seconds. They still write a scan_runs row and land in the same
  // review-then-import flow. Available to every workspace, not admin-gated.
  const NON_APIFY = new Set(['podcast', 'booking-search']);
  if (NON_APIFY.has(body?.type)) return runLocalScan(db, ctx, body, body.type);

  const type = ACTORS[body?.type] ? body.type : 'fb-ads';
  // The Instagram types are driven by handles, not a search phrase, so the
  // handles stand in as the query. Without this the run is rejected before
  // it starts — the same trap the Instagram scan button fell into before.
  const isHandleScan = type === 'ig-profiles' || type === 'ig-discover';
  const query = String((isHandleScan ? body?.query || body?.handles : body?.query) || '')
    .trim()
    .slice(0, 120);
  if (!query) {
    return NextResponse.json(
      { error: isHandleScan ? 'Paste at least one Instagram handle first.' : 'Type what to search for first.' },
      { status: 400 }
    );
  }
  let count = COUNT_CHOICES.has(Number(body?.count)) ? Number(body.count) : 50;
  // Spend guard: contact enrichment is the one option that costs real money
  // per place (website crawl per result), so it can never run at 100. The UI
  // recommends 20; this is the hard ceiling behind it.
  const CONTACTS_MAX = 25;
  if (type === 'maps' && body?.contacts && count > CONTACTS_MAX) count = CONTACTS_MAX;

  // Every reason to say no runs BEFORE the money moves. The charge used to sit
  // above these three gates, so a workspace with no scan allowance, or one on
  // a deployment with no lead source configured, paid the full price of the
  // scan and was then told it could not run one. None of those returns handed
  // the credits back.
  if (ctx.role !== 'admin') {
    const limits = await loadLimits(db, ctx.workspace);
    if (limits.adScansPerWeek <= 0) {
      return NextResponse.json({ error: 'Scans are not turned on for your workspace yet. Ask Ary.' }, { status: 403 });
    }
    const used = await scansUsedThisWeek(db, ctx.workspace);
    if (used >= limits.adScansPerWeek) {
      return NextResponse.json(
        { error: `You've used all ${limits.adScansPerWeek} scans for this week. The counter resets 7 days after each scan.` },
        { status: 429 }
      );
    }
  }

  const token = await resolveToken(db, ctx.workspace);
  if (!token) {
    return NextResponse.json({ error: 'No Apify token is set up on the server yet. Ask Ary.' }, { status: 424 });
  }

  // A scan is the only job that buys data from outside, and what it costs out
  // there scales with how many results were asked for. Charged once the size
  // is known, and given straight back if the run never starts.
  const charge = await spendExact(db, ctx.workspace, scanPrice(count));
  if (!charge.ok) {
    return NextResponse.json(
      {
        error: `${OUT_OF_CREDITS} This scan costs ${charge.price.toLocaleString()} credits for ${count} results and there are ${charge.balance.toLocaleString()} left.`,
        outOfCredits: true,
      },
      { status: 402 }
    );
  }
  const refundScan = () => refundCredits(db, ctx.workspace, charge.price).catch(() => {});

  // Build the actor input per type. Field names verified against each
  // actor's published input schema — do not "fix" them from memory.
  let input;
  let regionLabel = null;
  // fb-ads page-size cap. Free — the Ad Library scan returns the same items
  // either way; the cap only decides which pages we KEEP. Solo practices
  // sit in the 1k–10k band; 100k-like pages are brands with agencies.
  let maxLikes = null;
  if (type === 'fb-ads') {
    const ml = Number(body?.maxLikes);
    if (Number.isFinite(ml) && ml > MIN_FOLLOWERS) maxLikes = Math.min(ml, 10_000_000);
    const country = AD_COUNTRIES.has(String(body?.country || '').toUpperCase())
      ? String(body.country).toUpperCase()
      : 'US';
    regionLabel = country;
    let adLibUrl =
      'https://www.facebook.com/ads/library/?active_status=active&ad_type=all' +
      `&country=${country}` +
      `&q=${encodeURIComponent(query)}&search_type=keyword_unordered&media_type=all`;
    // "Running 30+ days" = the strongest budget signal an ad can give:
    // ads whose start date is at least a month back have survived a month
    // of the advertiser paying for them.
    if (body?.longRunning) {
      const d = new Date(Date.now() - 30 * 86400000);
      const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      adLibUrl += `&start_date[min]=2018-01-01&start_date[max]=${iso}`;
    }
    input = { urls: [{ url: adLibUrl }], count, 'scrapePageAds.activeStatus': 'active' };
  } else if (type === 'ig-profiles') {
    // The query field carries the handles for this type: newline or comma
    // separated, @ and profile URLs both fine.
    const unique = parseHandles(body?.handles || query).slice(0, IG_MAX_PROFILES);
    if (!unique.length) {
      await refundScan();
      return NextResponse.json({ error: 'Paste at least one Instagram handle.' }, { status: 400 });
    }
    regionLabel = `${unique.length} profiles`;
    input = { usernames: unique };
  } else if (type === 'ig-discover') {
    const seeds = parseHandles(body?.handles || query).slice(0, IG_DISCOVER_SEEDS);
    if (!seeds.length) {
      await refundScan();
      return NextResponse.json(
        { error: 'Paste 1 to 5 Instagram handles of clients like the ones you want more of.' },
        { status: 400 }
      );
    }
    regionLabel = `like ${seeds.map((h) => '@' + h).join(', ')}`;
    input = {
      startUsernames: seeds,
      searchDepth: '1',
      maxCountExpansion: IG_DISCOVER_MAX,
      // Only the follower floor is enforced at the source, and only because
      // each profile returned is billed — spending paid slots on 200-follower
      // accounts helps nobody, and it's her own hard must-have anyway.
      //
      // Deliberately NOT filtering on hasWebsite here. Whether a link goes
      // somewhere you can buy is a judgement the checklist already grades in
      // three levels, and a near-miss is exactly the kind of profile worth a
      // human look. Filtering it at the actor would mean those never come
      // back at all.
      minFollowers: MIN_FOLLOWERS,
      // Everything the Dream Client Checklist reads.
      extractWebsiteUrl: true,
      extractEmail: true,
      extractBusinessCategory: true,
      extractPosts: true,
      analyzeQuality: true,
    };
  } else if (type === 'fb-posts') {
    // recent_posts alone still returned year-old threads, and stale asks are
    // already solved by whoever answered them. start_date is a real field on
    // this actor (country is not — see the note in the UI).
    const days = Number(body?.days) === 90 ? 90 : Number(body?.days) === 7 ? 7 : 30;
    const from = new Date(Date.now() - days * 86400000);
    const iso = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}-${String(from.getUTCDate()).padStart(2, '0')}`;
    regionLabel = `last ${days} days`;
    input = { query, recent_posts: true, start_date: iso, maxResults: Math.max(10, count) };
  } else {
    const location = String(body?.location || '').trim().slice(0, 80);
    regionLabel = location || null;
    // Up to 4 comma-separated niches per scan ("life coach, therapist").
    // Each search string gets its own maxCrawledPlacesPerSearch quota.
    const keywords = query.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
    // Actor-level junk filters — same run, fewer bad rows.
    const STAR_CHOICES = new Set(['three', 'threeAndHalf', 'four', 'fourAndHalf']);
    const minStars = STAR_CHOICES.has(body?.minStars) ? body.minStars : null;
    const SITE_CHOICES = new Set(['withWebsite', 'withoutWebsite']);
    const siteFilter = SITE_CHOICES.has(body?.siteFilter) ? body.siteFilter : null;
    // maxCrawledPlacesPerSearch is PER search string, so 4 niches at 100
    // would bill 400 places while the form said 100. Split the budget so
    // "Results: 100" means 100 total, which is what the number promises.
    const perSearch = Math.max(5, Math.floor(count / Math.max(1, keywords.length || 1)));
    input = {
      searchStringsArray: keywords.length ? keywords : [query],
      ...(location ? { locationQuery: location } : {}),
      maxCrawledPlacesPerSearch: perSearch,
      language: 'en',
      // Permanently-closed places are never leads.
      skipClosedPlaces: true,
      ...(minStars ? { placeMinimumStars: minStars } : {}),
      ...(siteFilter ? { website: siteFilter } : {}),
      // Opt-in email/social enrichment — costs real money per place, so the
      // UI prices it before letting anyone tick it.
      ...(body?.contacts ? { scrapeContacts: true } : {}),
    };
  }

  let run;
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTORS[type]}/runs?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message || `Apify returned HTTP ${res.status}`;
      await refundScan();
      return NextResponse.json({ error: `Could not start the scan: ${msg}` }, { status: 424 });
    }
    run = data?.data;
  } catch (err) {
    await refundScan();
    return NextResponse.json({ error: 'Could not reach the lead source. Nothing was charged.' }, { status: 424 });
  }
  if (!run?.id) {
    await refundScan();
    return NextResponse.json({ error: 'The lead source did not start a run. Nothing was charged.' }, { status: 424 });
  }

  const ins = await db
    .prepare(
      `INSERT INTO scan_runs (workspace, type, query, country, apify_run_id, status, max_likes) VALUES (?, ?, ?, ?, ?, 'running', ?)`
    )
    .bind(ctx.workspace, type, query, regionLabel, run.id, maxLikes)
    .run();

  return NextResponse.json({ scanId: ins?.meta?.last_row_id, status: 'running' }, { status: 201 });
}

// ── fb-ads item helpers ────────────────────────────────────────────────
// The landing page an ad points at. Facebook exposes this in several shapes
// depending on the ad format (single image, carousel, video), so we walk the
// known paths and take the first real URL. Tracking-only and Facebook-internal
// links are skipped — we want the advertiser's own site, since the whole
// point is to see the page their paid traffic actually lands on.
export function adDestination(item) {
  const snap = item?.snapshot || {};
  const cards = Array.isArray(snap.cards) ? snap.cards : [];
  const candidates = [
    snap.link_url,
    snap.linkUrl,
    item?.link_url,
    item?.linkUrl,
    ...cards.map((c) => c?.link_url || c?.linkUrl),
  ];
  for (const raw of candidates) {
    const url = String(raw || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    let host;
    try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { continue; }
    // l.facebook.com and fb.me are redirect wrappers, not their website.
    if (host.endsWith('facebook.com') || host === 'fb.me' || host.endsWith('instagram.com')) continue;
    return url;
  }
  return null;
}

function likesOf(item) {
  const cands = [
    item?.page_like_count,
    item?.snapshot?.page_like_count,
    item?.pageLikeCount,
    item?.page?.likes,
    item?.pageInfo?.likes,
  ];
  for (const c of cands) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
function adTextOf(item) {
  return (
    item?.snapshot?.body?.text ||
    item?.snapshot?.body_text ||
    item?.ad_creative_body ||
    item?.adText ||
    ''
  );
}
// Page/author profile picture, when the actor returns one. Only http(s)
// survives (these render as <img> src). CDN links can expire later — the
// UI's monogram fallback covers that.
function avatarOf(item) {
  const cands = [
    item?.snapshot?.page_profile_picture_url,
    item?.page_profile_picture_url,
    item?.snapshot?.page_profile_picture?.uri,
    item?.author?.profile_pic,
    item?.author?.profilePicture,
    item?.author?.profile_picture_url,
  ];
  for (const c of cands) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c.slice(0, 1000);
  }
  return null;
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { searchParams } = new URL(req.url);

  // ?list=maps → recent reviewable scans (results stay retrievable, so a review
  // list the user navigated away from is never lost).
  //
  // Every type that lands in a review list belongs here, and podcast and
  // booking-search were added to that set without being added to this one. Their
  // results were written to scan_runs exactly like the others and then never
  // offered back, so switching tabs after a booking scan lost the results for
  // good — the one thing this endpoint exists to prevent.
  //
  // `type` rides along because reopening has to know which shape the rows are.
  if (searchParams.get('list') === 'maps') {
    const { results: rows } = await db
      .prepare(
        `SELECT id, type, query, country, status, items_found, leads_added, created_at
         FROM scan_runs
         WHERE workspace = ? AND type IN ('maps','ig-profiles','ig-discover','podcast','booking-search')
           AND status <> 'failed'
         ORDER BY id DESC LIMIT 10`
      )
      .bind(ctx.workspace)
      .all();
    return NextResponse.json({ scans: rows || [] });
  }

  const scanId = Number(searchParams.get('id'));
  if (!scanId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const scan = await db
    .prepare(`SELECT * FROM scan_runs WHERE id = ? AND workspace = ?`)
    .bind(scanId, ctx.workspace)
    .first();
  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  if (scan.status !== 'running') {
    let results = null;
    const REVIEW_TYPES = new Set(['maps', 'ig-profiles', 'ig-discover', 'podcast', 'booking-search']);
    if (REVIEW_TYPES.has(scan.type) && scan.results) {
      try { results = JSON.parse(scan.results); } catch {}
    }
    return NextResponse.json({ scan, results });
  }

  const token = await resolveToken(db, ctx.workspace);
  // A network hiccup while polling used to throw out of the route as a 500,
  // and the panel treats a 500 as the scan having died. It has not: the run is
  // still going out there. Saying "still running" is both true and what the
  // next poll will correct.
  let runData = null;
  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${scan.apify_run_id}?token=${encodeURIComponent(token)}`
    );
    runData = (await runRes.json().catch(() => null))?.data;
  } catch {
    return NextResponse.json({ scan: { ...scan, status: 'running' } });
  }
  if (!runData) return NextResponse.json({ scan });

  if (['READY', 'RUNNING'].includes(runData.status)) {
    return NextResponse.json({ scan: { ...scan, status: 'running' } });
  }
  if (runData.status !== 'SUCCEEDED') {
    await db
      .prepare(`UPDATE scan_runs SET status='failed', error=?, updated_at=datetime('now') WHERE id=?`)
      .bind(`Apify run ${runData.status}`, scanId)
      .run();
    return NextResponse.json({ scan: { ...scan, status: 'failed', error: `Apify run ${runData.status}` } });
  }

  let items = [];
  try {
    const itemsRes = await fetch(
      `https://api.apify.com/v2/datasets/${runData.defaultDatasetId}/items?clean=true&format=json&limit=500&token=${encodeURIComponent(token)}`
    );
    items = await itemsRes.json().catch(() => []);
  } catch {
    // The run succeeded; only the fetch of its results failed. Left as
    // running so the next poll tries again rather than losing the whole scan.
    return NextResponse.json({ scan: { ...scan, status: 'running' } });
  }
  const list = Array.isArray(items) ? items : [];
  const type = scan.type || 'fb-ads';

  let found = 0;
  let added = 0;
  let summaryExtra = {};

  if (type === 'ig-profiles' || type === 'ig-discover') {
    // Review-first, same as maps: the scored profiles wait on the scan row
    // and only what the user picks gets inserted. Every profile carries the
    // checklist verdict so the picker can sort qualified ones to the top.
    let source;
    let alreadySeen = 0;
    if (type === 'ig-discover') {
      // Discovery returns its own field names, so normalize into the shape
      // the profile scraper uses and the mapping below works unchanged.
      const normalized = list
        .map(normalizeRelatedProfile)
        .filter(Boolean)
        .map((p) => ({
          ...p,
          username: p.handle,
          profilePicUrl: p.avatar || '',
          postsCount: p.latestPosts.length,
        }));
      // Never show the same account twice. A profile you looked at and passed
      // on last week reappearing as a fresh find wastes the scarcest thing
      // here, which is your attention.
      const seen = await seenHandles(db, ctx.workspace);
      const split = dedupeHandles(normalized, seen);
      source = split.fresh;
      alreadySeen = split.repeats.length;
    } else {
      source = list.filter((it) => it && it.username);
    }
    const profiles = source
      .map((it) => {
        const score = scoreProfile(it);
        return {
          handle: String(it.username),
          name: String(it.fullName || it.username).slice(0, 120),
          url: `https://www.instagram.com/${it.username}/`,
          website: String(it.externalUrl || '').slice(0, 300),
          bio: String(it.biography || '').slice(0, 600),
          followers: Number(it.followersCount) || 0,
          posts: Number(it.postsCount) || 0,
          avatar: String(it.profilePicUrl || '').slice(0, 1000),
          private: Boolean(it.private),
          mustHaves: score.mustHavesPass ? 'Y' : 'N',
          mustHaveDetail: [score.mustHaves.audience, score.mustHaves.identity, score.mustHaves.offer]
            .map((m) => ({ label: m.label, pass: m.pass, detail: m.detail })),
          revenueScore: score.revenueScore,
          signals: score.signals.filter((sg) => sg.hit).map((sg) => sg.label),
          qualifies: score.qualifies,
        };
      })
      // Her line first: must-haves Y and 2+ signals. Then by signal count.
      .sort((a, b) => (b.qualifies - a.qualifies) || (b.revenueScore - a.revenueScore) || (b.followers - a.followers));
    found = profiles.length;
    await db
      .prepare(`UPDATE scan_runs SET results=?, updated_at=datetime('now') WHERE id=?`)
      .bind(JSON.stringify(profiles), scanId)
      .run();
    summaryExtra = {
      landsIn: 'review',
      results: profiles,
      qualified: profiles.filter((p) => p.qualifies).length,
      alreadySeen,
    };
  } else if (type === 'maps') {
    // Review-first: nothing is inserted here. The parsed places wait on the
    // scan row; /api/scan/import adds only what the user picks.
    const places = list
      .filter((it) => it && (it.title || it.name))
      .slice(0, 400)
      .map((it) => {
        const emails = Array.isArray(it.emails) ? it.emails : (it.email ? [it.email] : []);
        return {
          name: String(it.title || it.name).trim().slice(0, 120),
          website: String(it.website || '').trim(),
          email: emails.length ? String(emails[0]).trim().slice(0, 200) : '',
          phone: it.phone ? String(it.phone) : '',
          category: it.categoryName ? String(it.categoryName) : '',
          city: it.city ? String(it.city) : '',
          address: it.address ? String(it.address) : '',
          score: it.totalScore || null,
          reviews: it.reviewsCount || 0,
          mapsUrl: it.url ? String(it.url) : '',
        };
      });
    found = places.length;
    await db
      .prepare(`UPDATE scan_runs SET results=?, updated_at=datetime('now') WHERE id=?`)
      .bind(JSON.stringify(places), scanId)
      .run();
    summaryExtra = { landsIn: 'review', results: places };
  } else if (type === 'fb-posts') {
    // Posts → leads. The post text is the evidence Guard Bee scores.
    const { results: existing } = await db
      .prepare(`SELECT post_url FROM leads WHERE workspace = ?`)
      .bind(ctx.workspace)
      .all();
    const seen = new Set((existing || []).map((r) => (r.post_url || '').toLowerCase()));
    // Sub-80-char posts are almost never a real ask — link drops, "DM me",
    // marketplace one-liners. Real asks describe a problem.
    const sized = list.filter((it) => it && it.url && (it.message || '').trim().length >= 80);
    // Then the real triage. Facebook's post search matches nouns, so a query
    // like "manage my calendar and client intake" returns the people who DO
    // that far more than the people who NEED it. Left unfiltered this put 41
    // leads in the inbox and roughly none were buyers.
    const { kept: posts, dropped } = filterPosts(sized, (it) => it.message);
    found = sized.length;
    for (const it of posts) {
      const url = String(it.url).toLowerCase();
      if (seen.has(url)) continue;
      seen.add(url);
      await db
        .prepare(
          `INSERT INTO leads (platform, post_url, post_text, author_name, author_handle, notes, avatar_url, workspace)
           VALUES ('Facebook', ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          String(it.url),
          String(it.message).slice(0, 2000),
          it.author?.name ? String(it.author.name).slice(0, 120) : null,
          it.author?.url ? String(it.author.url) : null,
          `Post scan: "${scan.query}"`,
          avatarOf(it),
          ctx.workspace
        )
        .run();
      added += 1;
    }
    // Report the triage so a small result set is explainable rather than
    // looking like the scan failed.
    summaryExtra = { landsIn: 'inbox', scanned: sized.length, dropped };
  } else {
    // fb-ads: ads → unique advertising pages → leads (>=1000 likes when
    // the count is readable; unknown counts kept but labeled).
    const pages = new Map();
    for (const it of list) {
      const pageId = it?.page_id || it?.pageId || it?.snapshot?.page_id;
      const pageName = it?.page_name || it?.pageName || it?.snapshot?.page_name;
      if (!pageId || !pageName) continue;
      const cur = pages.get(pageId) || {
        pageId,
        pageName,
        pageUrl:
          it?.snapshot?.page_profile_uri ||
          it?.page_profile_uri ||
          `https://www.facebook.com/${pageId}`,
        likes: null,
        adCount: 0,
        adText: '',
        avatar: null,
        destUrl: null,
      };
      // Where the ad sends people. The Ad Library keeps this on the snapshot,
      // and on multi-image ads it hides in the first card instead. Every path
      // is optional on purpose: a missing link leaves destUrl null rather than
      // breaking the scan, exactly like before this field existed.
      if (!cur.destUrl) cur.destUrl = adDestination(it);
      cur.adCount += 1;
      const l = likesOf(it);
      if (l != null) cur.likes = Math.max(cur.likes || 0, l);
      if (!cur.adText) {
        const t = adTextOf(it);
        if (t) cur.adText = String(t).slice(0, 600);
      }
      if (!cur.avatar) cur.avatar = avatarOf(it);
      pages.set(pageId, cur);
    }
    found = pages.size;
    // Floor (Ellen's 1k standard) + optional ceiling (the scan's page-size
    // cap). Unknown counts are kept but labeled — better a checkable maybe
    // than a silent drop.
    const cap = Number(scan.max_likes) || null;
    // Biz-op sellers, not service businesses — the tier that made a whole
    // scan batch skippable. Deliberately narrow: coaches ADVERTISING
    // COACHING are targets; people selling "make money" schemes are not.
    const JUNK_WORDS = [
      'passive income', 'make money online', '6-figure', '7-figure', 'six figure', 'seven figure',
      'forex', 'crypto', 'dropshipping', 'drop shipping', 'amazon fba',
      'free training', 'free masterclass', 'join my free', 'watch my free',
      'agency owners', 'smma', 'earn $', 'make $',
    ];
    const isJunk = (p) => {
      const hay = `${p.pageName} ${p.adText}`.toLowerCase();
      return JUNK_WORDS.some((w) => hay.includes(w));
    };
    const qualified = [...pages.values()].filter(
      (p) => (p.likes == null || (p.likes >= MIN_FOLLOWERS && (!cap || p.likes <= cap))) && !isJunk(p)
    );

    // The email off each advertiser's own landing page, since the Ad Library
    // never carries one and Ellen reaches people by email. Bounded three ways:
    // only the qualified pages that actually captured a landing page, a hard cap
    // so a big scan cannot fan out into hundreds of fetches, and a small
    // concurrency so they run in a few rounds rather than all at once. A fetch
    // that fails or finds nothing leaves the email null, and the lead still
    // lands as a match.
    // The same fetch also reads the high-ticket clues off the page — a program,
    // an apply-or-call funnel, an income claim, a figure if shown — with the ad
    // copy folded in, so a clue named in the ad still counts. One request per
    // page, no extra cost over the email lookup it already does.
    const withDest = qualified.filter((p) => p.destUrl).slice(0, AD_EMAIL_LOOKUP_CAP);
    for (let i = 0; i < withDest.length; i += AD_EMAIL_CONCURRENCY) {
      const batch = withDest.slice(i, i + AD_EMAIL_CONCURRENCY);
      await Promise.all(
        batch.map(async (p) => {
          const r = await siteEmailAndSignals(p.destUrl, { extraText: p.adText || '' }).catch(() => ({ email: null, signals: [] }));
          p.email = r.email;
          p.signals = r.signals;
        })
      );
    }
    // Pages with no landing page can still show clues from their ad copy.
    for (const p of qualified) {
      if (!p.signals) p.signals = signalsInText(p.adText || '');
    }

    const { results: existing } = await db
      .prepare(`SELECT post_url FROM leads WHERE workspace = ?`)
      .bind(ctx.workspace)
      .all();
    const seen = new Set((existing || []).map((r) => (r.post_url || '').toLowerCase()));
    let alreadyInInbox = 0;
    for (const p of qualified) {
      const url = p.pageUrl.toLowerCase();
      if (seen.has(url)) { alreadyInInbox += 1; continue; }
      seen.add(url);
      const likesLabel = p.likes != null ? `~${p.likes.toLocaleString()} page likes` : 'page likes unknown — check the page';
      const destLabel = p.destUrl ? ` · ads point to ${p.destUrl}` : ' · no landing page captured';
      await db
        .prepare(
          `INSERT INTO leads (platform, post_url, post_text, author_name, author_handle, notes, avatar_url, lead_kind, dest_url, email, signals, workspace)
           VALUES ('Facebook', ?, ?, ?, ?, ?, ?, 'ad', ?, ?, ?, ?)`
        )
        .bind(
          p.pageUrl,
          p.adText || `(ad creative text not captured — see their ads: https://www.facebook.com/ads/library/?view_all_page_id=${p.pageId})`,
          p.pageName,
          p.pageUrl,
          `Runs FB ads (${p.adCount} seen) · ${likesLabel}${destLabel} · ad scan: "${scan.query}" ${scan.country || ''}`,
          p.avatar,
          p.destUrl,
          p.email || null,
          p.signals && p.signals.length ? JSON.stringify(p.signals) : null,
          ctx.workspace
        )
        .run();
      added += 1;
    }
    // The funnel, so "10 added" reads as working rather than broken. One
    // advertiser runs many ads, so the ad count collapses to far fewer
    // businesses; then the ones already in the inbox and the ones under the
    // follower floor or flagged as junk come off, and what is left is new.
    summaryExtra = {
      landsIn: 'inbox',
      qualified: qualified.length,
      funnel: {
        ads: list.length,
        businesses: pages.size,
        belowBarOrJunk: pages.size - qualified.length,
        alreadyInInbox,
        added,
      },
    };
  }

  await db
    .prepare(
      `UPDATE scan_runs SET status='done', items_found=?, leads_added=?, updated_at=datetime('now') WHERE id=?`
    )
    .bind(found, added, scanId)
    .run();

  return NextResponse.json({
    scan: { ...scan, status: 'done', items_found: found, leads_added: added },
    summary: { itemsSeen: list.length, found, added, ...summaryExtra },
  });
}
