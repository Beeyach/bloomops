import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { enrichBusinessSite } from '@/lib/booking-search.mjs';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function env() {
  try { return getRequestContext().env || {}; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

// Import the user's PICKS from a finished maps scan. Nothing enters the
// Prospects table without an explicit selection. Rows with an email arrive
// as 'Prescreen' (found, unvetted — Validated is earned by a strong rating
// after screening); the rest arrive as 'New'. Imported/duplicate picks are
// flagged back onto the stored results so a reopened review list shows
// what's already in Prospects.

function hostOf(url) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const scanId = Number(body?.scanId);
  const indices = Array.isArray(body?.indices) ? body.indices.map(Number).filter(Number.isInteger) : [];
  if (!scanId || indices.length === 0) {
    return NextResponse.json({ error: 'Pick at least one result first.' }, { status: 400 });
  }

  const scan = await db
    .prepare(
      `SELECT * FROM scan_runs WHERE id = ? AND workspace = ? AND type IN ('maps','ig-profiles','ig-discover','podcast','booking-search')`
    )
    .bind(scanId, ctx.workspace)
    .first();
  if (!scan || !scan.results) {
    return NextResponse.json({ error: 'Scan not found (or has no results).' }, { status: 404 });
  }
  let places = [];
  try { places = JSON.parse(scan.results); } catch {}

  // Podcast guests are raw leads with no domain yet, so they land in the leads
  // inbox, the same table the Facebook post scan feeds. Deduped on the person's
  // name, which is all a podcast row has.
  if (scan.type === 'podcast') {
    const { results: existingLeads } = await db
      .prepare(`SELECT author_name FROM leads WHERE workspace = ?`)
      .bind(ctx.workspace)
      .all();
    const seenGuests = new Set((existingLeads || []).map((r) => (r.author_name || '').trim().toLowerCase()).filter(Boolean));
    let added = 0, skipped = 0;
    for (const i of indices) {
      const p = places[i];
      if (!p || !p.guest) continue; // rows without an extracted guest are not imported
      const key = p.guest.trim().toLowerCase();
      if (seenGuests.has(key)) { skipped += 1; p.imported = 'duplicate'; continue; }
      seenGuests.add(key);
      await db
        .prepare(
          `INSERT INTO leads (platform, author_name, notes, status, workspace)
           VALUES ('Other', ?, ?, 'new', ?)`
        )
        .bind(
          p.guest.slice(0, 120),
          `Podcast guest on "${p.show}" — ${p.episode}${p.pubDate ? ` (${p.pubDate})` : ''}`,
          ctx.workspace
        )
        .run();
      p.imported = true;
      added += 1;
    }
    await db
      .prepare(`UPDATE scan_runs SET results=?, leads_added = COALESCE(leads_added,0) + ?, updated_at=datetime('now') WHERE id=?`)
      .bind(JSON.stringify(places), added, scanId)
      .run();
    return NextResponse.json({ added, toInbox: added, skippedDuplicate: skipped, results: places });
  }

  // Booking-search results are a name plus a scheduler link, which is not a
  // domain anyone can audit, video or email. So on import each PICKED one is
  // enriched: its name is searched for its real website, and that becomes the
  // domain. Only the picks are enriched, one search each, to keep the Brave
  // credit spend to what the user actually chose. A lead whose site could not
  // be found still imports, with the booking link as its only address.
  //
  // Its own loop rather than reshaping into the maps path, which was the bug
  // behind "Uses undefined": that path overwrote the stored results with a
  // maps-shaped object, dropping platform and bookingUrl, so a second view of
  // the review list had nothing to show. The original result shape is kept in
  // storage, with only an imported flag added.
  if (scan.type === 'booking-search') {
    const { results: existingP } = await db
      .prepare(`SELECT name, domain FROM prospects WHERE workspace = ? AND deleted_at IS NULL`)
      .bind(ctx.workspace)
      .all();
    const seenH = new Set((existingP || []).map((r) => hostOf(r.domain || '')).filter(Boolean));
    const seenN = new Set((existingP || []).map((r) => (r.name || '').trim().toLowerCase()).filter(Boolean));
    let added = 0, skipped = 0;
    for (const i of indices) {
      const p = places[i];
      if (!p || !p.name) continue;
      let domain = p.website || '';
      if (!domain) {
        const site = await enrichBusinessSite(p.name, env());
        if (site) domain = site.url;
      }
      const host = domain ? hostOf(domain) : '';
      const nameKey = p.name.trim().toLowerCase();
      if ((host && seenH.has(host)) || seenN.has(nameKey)) { skipped += 1; p.imported = 'duplicate'; continue; }
      if (host) seenH.add(host);
      seenN.add(nameKey);
      const info = [
        p.platform ? `Books through ${p.platform}` : null,
        p.snippet || null,
        p.bookingUrl || null,
        domain ? null : 'Site not found automatically — check the booking link for their address.',
        `Booking search: "${scan.query}"`,
      ].filter(Boolean).join('\n');
      await db
        .prepare(
          `INSERT INTO prospects (name, business_name, domain, stage, info, gmail_labels, workspace)
           VALUES (?, ?, ?, 'New', ?, 'booking-scan', ?)`
        )
        .bind(p.name, p.name, domain || p.bookingUrl || null, info, ctx.workspace)
        .run();
      p.imported = true;
      added += 1;
    }
    await db
      .prepare(`UPDATE scan_runs SET results=?, leads_added = COALESCE(leads_added,0) + ?, updated_at=datetime('now') WHERE id=?`)
      .bind(JSON.stringify(places), added, scanId)
      .run();
    return NextResponse.json({ added, toScreen: added, fresh: 0, skippedDuplicate: skipped, results: places });
  }

  const { results: existing } = await db
    .prepare(`SELECT name, domain, email FROM prospects WHERE workspace = ? AND deleted_at IS NULL`)
    .bind(ctx.workspace)
    .all();
  const seenHosts = new Set((existing || []).map((r) => hostOf(r.domain || '')).filter(Boolean));
  const seenNames = new Set((existing || []).map((r) => (r.name || '').trim().toLowerCase()).filter(Boolean));
  const seenEmails = new Set((existing || []).map((r) => (r.email || '').trim().toLowerCase()).filter(Boolean));

  // Instagram profiles carry the Dream Client Checklist verdict, so they
  // import with must_haves and revenue_score already filled. Qualifying
  // rows land in Prescreen (they still deserve her eyes); the rest land in
  // New so nothing is silently promoted by a keyword match.
  if (scan.type === 'ig-profiles') {
    let added = 0, skipped = 0;
    for (const i of indices) {
      const p = places[i];
      if (!p || !p.handle) continue;
      const host = p.website ? hostOf(p.website) : '';
      const nameKey = (p.name || p.handle).trim().toLowerCase();
      if ((host && seenHosts.has(host)) || seenNames.has(nameKey)) {
        skipped += 1;
        p.imported = 'duplicate';
        continue;
      }
      if (host) seenHosts.add(host);
      seenNames.add(nameKey);

      const bits = [
        `Instagram: @${p.handle} (${(p.followers || 0).toLocaleString()} followers)`,
        p.url,
        p.bio ? `Bio: ${p.bio}` : null,
        `Checklist: must-haves ${p.mustHaves}, ${p.revenueScore}/6 revenue signals`,
        (p.signals || []).length ? `Signals: ${(p.signals || []).join(', ')}` : null,
        'Still to check by hand: is she running ads? (Meta Ad Library)',
        `IG scan: "${scan.query}"`,
      ].filter(Boolean);

      await db
        .prepare(
          `INSERT INTO prospects (name, business_name, domain, stage, source, info, must_haves, revenue_score, gmail_labels, workspace)
           VALUES (?, ?, ?, ?, 'Instagram', ?, ?, ?, 'ig-scan', ?)`
        )
        .bind(
          p.name || p.handle,
          p.name || p.handle,
          p.website || null,
          p.qualifies ? 'Prescreen' : 'New',
          bits.join('\n'),
          p.mustHaves === 'Y' ? 'Y' : 'N',
          Number(p.revenueScore) || 0,
          ctx.workspace
        )
        .run();
      p.imported = true;
      added += 1;
    }
    await db
      .prepare(`UPDATE scan_runs SET results=?, leads_added = COALESCE(leads_added,0) + ?, updated_at=datetime('now') WHERE id=?`)
      .bind(JSON.stringify(places), added, scanId)
      .run();
    return NextResponse.json({ added, toScreen: added, fresh: 0, skippedDuplicate: skipped, results: places });
  }

  let toScreen = 0, fresh = 0, skippedDuplicate = 0;
  for (const i of indices) {
    const p = places[i];
    if (!p || !p.name) continue;
    const host = p.website ? hostOf(p.website) : '';
    const emailLc = (p.email || '').toLowerCase();
    if ((host && seenHosts.has(host)) || (!host && seenNames.has(p.name.toLowerCase())) || (emailLc && seenEmails.has(emailLc))) {
      skippedDuplicate += 1;
      p.imported = 'duplicate';
      continue;
    }
    if (host) seenHosts.add(host);
    seenNames.add(p.name.toLowerCase());
    if (emailLc) seenEmails.add(emailLc);

    const stage = p.email ? 'Prescreen' : 'New';
    const bits = [
      p.category || null,
      [p.city, p.address].filter(Boolean).join(' · ') || null,
      p.phone ? 'Phone: ' + p.phone : null,
      p.score ? `Google: ${p.score}★ (${p.reviews || 0} reviews)` : null,
      p._bookingSnippet || null,
      p.mapsUrl || null,
      scan.type === 'booking-search' && p._foundSite === false
        ? 'Site not found automatically — check the booking link for their address.'
        : null,
      scan.type === 'booking-search'
        ? `Booking search: "${scan.query}"`
        : `Maps scan: "${scan.query}"${scan.country ? ' near ' + scan.country : ''}`,
    ].filter(Boolean);
    await db
      .prepare(
        `INSERT INTO prospects (name, business_name, email, domain, stage, info, gmail_labels, workspace)
         VALUES (?, ?, ?, ?, ?, ?, 'maps-scan', ?)`
      )
      .bind(p.name, p.name, p.email || '', p.website || null, stage, bits.join('\n'), ctx.workspace)
      .run();
    p.imported = true;
    if (p.email) toScreen += 1; else fresh += 1;
  }

  await db
    .prepare(`UPDATE scan_runs SET results=?, leads_added = COALESCE(leads_added,0) + ?, updated_at=datetime('now') WHERE id=?`)
    .bind(JSON.stringify(places), toScreen + fresh, scanId)
    .run();

  return NextResponse.json({ added: toScreen + fresh, toScreen, fresh, skippedDuplicate, results: places });
}
