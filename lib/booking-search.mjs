// Booking-link search. Finds businesses that already use a scheduling tool, by
// searching for pages hosted on the booking platforms. A business with a live
// Calendly or Acuity page takes bookings seriously, which is a warm signal.
//
// Uses the Brave Search API. Serper's free tier refused the site: dork pattern
// ("Query pattern not allowed for free accounts") and its paid minimum is $50;
// Brave allows the pattern and its free tier gives $5 of credit a month, about
// a thousand searches, which is far more than this needs.
//
// The key lives where the other secrets do. When it is missing this returns a
// clear "add a key" error rather than a broken scan. Set BRAVE_API_KEY.

const BOOKING_SITES = ['calendly.com', 'acuityscheduling.com', 'squareup.com', 'youcanbook.me'];

// Turns a plain niche into the search. "life coach" becomes a query for coach
// booking pages across the platforms. A raw pattern with site: in it is passed
// through untouched, for anyone who wants to write their own.
function buildQuery(input) {
  if (/site:/i.test(input)) return input;
  const sites = BOOKING_SITES.map((s) => `site:${s}`).join(' OR ');
  return `(${sites}) "${input}"`;
}

// Hosts that are the booking platform itself, never the prospect's own site.
const PLATFORM_HOST = new RegExp(
  BOOKING_SITES.map((s) => s.split('/')[0].replace(/\./g, '\\.')).join('|'),
  'i'
);

// Hosts that are never a business's own site: the booking platforms, the big
// socials, directories, and link aggregators. Used when enriching a lead into
// a real domain.
const NOT_OWN_SITE =
  /calendly|acuityscheduling|squareup|youcanbook|facebook|instagram|linkedin|twitter|x\.com|tiktok|youtube|linktr\.ee|beacons\.ai|yelp|google\.|wikipedia|eventbrite|meetup|psychologytoday|thumbtack|bark\.com/i;

// A booking or podcast lead is a name, not a domain, so it cannot be audited or
// emailed as-is. This turns the name into their real website by searching for
// it and taking the first result that is plainly their own site. Returns null
// when nothing confident comes back, rather than guessing a wrong domain onto a
// prospect, which would be worse than leaving it blank.
export async function enrichBusinessSite(name, env) {
  const key = String((env && env.BRAVE_API_KEY) || '').trim();
  const clean = String(name || '').replace(/,.*$/, '').trim(); // drop the ", Life Coach" tail
  if (!key || clean.length < 3) return null;
  try {
    const url =
      'https://api.search.brave.com/res/v1/web/search?count=5&country=us&q=' +
      encodeURIComponent(`"${clean}"`);
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const web = Array.isArray(data?.web?.results) ? data.web.results : [];
    for (const r of web) {
      let host;
      try {
        host = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase();
      } catch {
        continue;
      }
      if (NOT_OWN_SITE.test(host)) continue;
      return { domain: host, url: `https://${host}` };
    }
  } catch {
    // Network or timeout. Leave the lead un-enriched; it still imports as a name.
  }
  return null;
}

export async function runBookingSearch(input, env) {
  const key = String((env && env.BRAVE_API_KEY) || '').trim();
  if (!key) {
    return {
      error:
        'Booking search needs a search API key. Add BRAVE_API_KEY (from brave.com/search/api, free tier) to the server and try again.',
      status: 424,
    };
  }

  let data;
  try {
    // Brave is a GET with the query in the URL. count max is 20 per call;
    // that is plenty of booking pages to review in one scan.
    const url =
      'https://api.search.brave.com/res/v1/web/search?count=20&country=us&q=' +
      encodeURIComponent(buildQuery(input));
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': key },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = body.slice(0, 140);
      // Brave nests its error under error.detail or error.meta; surface
      // whichever is there rather than a bare status code.
      try {
        const j = JSON.parse(body);
        detail = j?.error?.detail || j?.error?.meta?.[0]?.detail || j?.message || detail;
      } catch {}
      return { error: `Search API returned HTTP ${res.status}: ${detail}`, status: 424 };
    }
    data = await res.json();
  } catch (e) {
    return { error: `Could not reach the search API: ${String(e.message || e).slice(0, 80)}`, status: 424 };
  }

  const web = Array.isArray(data?.web?.results) ? data.web.results : [];
  const results = [];
  const seenSlug = new Set();
  for (const r of web) {
    const link = String(r?.url || '');
    let u;
    try {
      u = new URL(link);
    } catch {
      continue;
    }
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '');

    // The platforms host help docs, community forums and blog posts, and the
    // dork returns all of them. None are prospects. Drop them by subdomain and
    // by path so "Acuity Scheduling Forum" and "How to Become a Life Coach"
    // stop coming back as leads.
    if (/^(help|support|community|forum|blog|developer|docs|status)\./i.test(u.hostname)) continue;
    if (/\/(help|support|blog|community|forum|hc|articles?|guide)\b/i.test(path)) continue;
    const title = String(r?.title || '').trim();
    if (/^(how to|re:|\[|guide|tutorial)\b/i.test(title) || /\bforum\b/i.test(title)) continue;

    // The real signal is the booking-page slug, not the title: a Calendly page
    // is titled "Select a time", but its URL is /rhonda-empowered-well, which
    // is the business. Prefer a name built from the slug, fall back to the
    // title only when the slug is not name-like.
    // Acuity puts the business in ?owner= rather than the path, whose slug is
    // just "schedule.php". Prefer the owner param, fall back to the first path
    // segment, and reject anything that is a script name or a generic word.
    const rawSlug =
      u.searchParams.get('owner') ||
      u.searchParams.get('name') ||
      (path.split('/').filter(Boolean)[0] || '');
    const slug = rawSlug.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ').trim();
    const slugName =
      slug &&
      slug.length >= 3 &&
      /[a-z]/i.test(slug) &&
      // No digits: a real coach's slug is words, "rhonda-empowered-well". A
      // slug like "xyz123" or "user4821" is an auto-generated handle, not a
      // name, and reads as junk in the list.
      !/\d/.test(slug) &&
      !/^(book|schedule|meet|appointment|calendar|widget|embed|d|s|schedule php)$/i.test(slug)
        ? slug.replace(/\b\w/g, (c) => c.toUpperCase())
        : null;
    // Acuity titles its pages "Schedule Appointment with <business>", which
    // carries the real name but buries it under boilerplate. Strip the lead-in
    // so the row reads as the coach, not the button.
    const cleanTitle = title
      .replace(/^(schedule|book)(\s+an?)?\s+(appointment|meeting|call|session|a\s+time)\s+with\s+/i, '')
      .replace(/^(appointments?|booking|schedule)\s+(with|for)\s+/i, '')
      .trim();
    // Purely generic, no business anywhere in it: "Select a time", "Select a
    // meeting", a bare "Schedule". Nothing to reach out to, so it is dropped.
    const stillGeneric = /^(select a|schedule|book|appointment|calendar|meeting|new appointment|choose a)/i.test(cleanTitle) || !cleanTitle;
    if (stillGeneric && !slugName) continue;
    const name = ((stillGeneric && slugName) || cleanTitle || slugName || host).slice(0, 120);

    // Dedupe on the slug, not the host, or every Calendly page collapses to one.
    const dedupeKey = `${host}${path}`.toLowerCase();
    if (seenSlug.has(dedupeKey)) continue;
    seenSlug.add(dedupeKey);

    results.push({
      name,
      bookingUrl: link.slice(0, 400),
      // A booking page has no separate domain to audit, so website stays empty
      // and the row lands as a name plus its booking link. That is the real
      // limit of this source: these are contact points, not sites to review.
      website: PLATFORM_HOST.test(host) ? '' : link,
      platform: (BOOKING_SITES.find((s) => host.includes(s.split('/')[0])) || host).split('/')[0],
      snippet: String(r?.description || '')
        .replace(/<[^>]+>/g, '')
        .slice(0, 300),
    });
  }
  return { results };
}
