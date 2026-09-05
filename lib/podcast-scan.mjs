// Podcast-guest scan. Podcast RSS is open XML with no auth and no rate limit,
// so this fetches the feeds directly rather than through Apify. A coach who
// guests on a show is a warm, named lead, and the feed names them.
//
// Runs on the Cloudflare edge, which has no XML parser, so this reads the feed
// with targeted regexes over the well-formed subset podcast feeds actually use.
// It is not a general XML parser and does not try to be.

const FEED_CAP = 15; // feeds per scan, the spend and time guard
const ITEMS_PER_FEED = 40; // recent episodes only; older guests are colder

// One <tag>…</tag>, CDATA-aware, first match.
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return decode(m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')).trim();
}

function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ') // strip any HTML that rode along in a description
    .replace(/\s+/g, ' ')
    .trim();
}

// The guest name out of an episode title or the first line of its notes.
// Podcasts phrase this a dozen ways; these are the ones that actually recur.
// When nothing matches, return null and keep the episode title, rather than
// guess a name — a wrong name is worse than an unresolved row.
// The name portion stays case-sensitive on purpose. A guest name is Titlecase
// in every feed, and an /i flag makes [A-Z] match lowercase, so "Ana Ruiz on
// client intake" captured "Ana Ruiz on". The keyword before the name carries
// both cases explicitly instead. A trailing lowercase word like "on" therefore
// cannot join the name.
const NAME = String.raw`((?:Dr\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,2})`;
const GUEST_PATTERNS = [
  new RegExp(String.raw`\b[Ww]ith\s+` + NAME + String.raw`\b`),
  new RegExp(String.raw`\b[Ff]eat(?:uring|\.)?\s+` + NAME + String.raw`\b`),
  new RegExp(String.raw`\b[Gg]uest[:\s]+` + NAME + String.raw`\b`),
  new RegExp(String.raw`\b[Ff]t\.?\s+` + NAME + String.raw`\b`),
  // "Ep 12: Jane Smith on burnout" — a name right after the number and colon.
  new RegExp(String.raw`^(?:[Ee]p(?:isode)?\.?\s*\d+\s*[:\-–]\s*)` + NAME + String.raw`\b`),
];

// Words that look like a name but are the show talking about itself.
const NOT_A_GUEST = /\b(the|our|your|my|this|host|team|show|podcast|part|season|series)\b/i;

// News and topic podcasts Title-Case their headlines, so "with Deadly Results"
// reads as a name. A real guest name is almost never built from common words
// like these. Not exhaustive; the review step is the real filter, this just
// keeps the obvious junk out of the list she reviews.
const HEADLINE_WORD =
  /\b(results?|crumbling|rising|falling|growing|coming|keeps|update|special|breaking|deadly|latest|money|success|failure|crisis|future|episode|guide|tips|secrets?|truth|story|lessons?|reasons?|ways?|steps?)\b/i;

function extractGuest(title, summary) {
  for (const src of [title, summary]) {
    if (!src) continue;
    for (const re of GUEST_PATTERNS) {
      const m = src.match(re);
      if (m && m[1] && !NOT_A_GUEST.test(m[1]) && !HEADLINE_WORD.test(m[1])) return m[1].trim();
    }
  }
  return null;
}

// Feed URLs as a human pastes them, one per line or comma separated.
// Whether a pasted URL is safe for the server to fetch. The scan runs on our
// side, so whatever is typed here becomes a request made from our network
// position: http://169.254.169.254/ or http://localhost:8080/admin would have
// been fetched and the result reported back to whoever pasted it. Public hosts
// only, no credentials in the URL, nothing private or loopback.
const PRIVATE_HOST = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?f[cd]/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
];

export function isFetchableFeedUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname;
  // A bare name with no dot is either a loopback alias or an internal host.
  if (!host || !host.includes('.')) return false;
  return !PRIVATE_HOST.some((re) => re.test(host));
}

export function parseFeedUrls(raw) {
  return [
    ...new Set(
      String(raw || '')
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(isFetchableFeedUrl)
    ),
  ].slice(0, FEED_CAP);
}

// Pull the episodes and their guests out of one feed's XML. Exported so it can
// be tested against a saved feed without a network call.
export function parseFeed(xml, feedUrl) {
  const show = tag(xml, 'title') || feedUrl;
  const items = [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, ITEMS_PER_FEED)
    .map((m) => m[1]);
  const rows = [];
  for (const item of items) {
    const title = tag(item, 'title');
    if (!title) continue;
    const summary = tag(item, 'itunes:summary') || tag(item, 'description');
    const pubDate = tag(item, 'pubDate');
    const guest = extractGuest(title, summary);
    rows.push({
      // name drives the review card header. The guest when we found one, the
      // episode title when we did not, so a human can still read who it was.
      name: guest || title.slice(0, 80),
      show: show.slice(0, 120),
      episode: title.slice(0, 200),
      guest,
      pubDate: pubDate.slice(0, 40),
      feedUrl,
    });
  }
  return rows;
}

// Fetch every feed and return the flattened guest rows, newest-guest-first
// where a guest was found. Never throws on one bad feed; it is skipped and the
// rest still return.
export async function runPodcastScan(feedUrls) {
  const all = [];
  const errors = [];
  for (const url of feedUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'BloomwiredScan/1.0', Accept: 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        errors.push(`${url}: that feed did not answer (HTTP ${res.status}).`);
        continue;
      }
      const xml = await res.text();
      all.push(...parseFeed(xml, url));
    } catch (e) {
      errors.push(`${url}: ${String(e.message || e).slice(0, 80)}`);
    }
  }
  // Rows with a named guest first; those are the leads. The rest keep their
  // episode title so a human can read who the guest was.
  all.sort((a, b) => (b.guest ? 1 : 0) - (a.guest ? 1 : 0));
  return { rows: all, errors };
}
