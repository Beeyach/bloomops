// Maps Apify dataset items into lead rows. Apify actors output wildly
// different shapes (Instagram posts, IG profiles, Facebook pages, Google
// Maps places, Reddit posts), so this is a best-effort field guesser over
// the field names those popular actors actually use. The goal is a decent
// import you then score and edit — not a perfect parse.

const PLATFORM_BY_HOST = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)facebook\.com$/i, 'Facebook'],
  [/(^|\.)fb\.com$/i, 'Facebook'],
  [/(^|\.)threads\.net$/i, 'Threads'],
  [/(^|\.)linkedin\.com$/i, 'LinkedIn'],
  [/(^|\.)upwork\.com$/i, 'Upwork'],
  [/(^|\.)reddit\.com$/i, 'Reddit'],
  [/(^|\.)(x|twitter)\.com$/i, 'X'],
];

// First non-empty string from a list of candidate values.
function firstStr(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function platformFromUrl(url) {
  if (!url) return 'Other';
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'Other';
  }
  for (const [re, name] of PLATFORM_BY_HOST) {
    if (re.test(host)) return name;
  }
  return 'Other';
}

// Map one raw Apify item to a lead-shaped object, or null if there's not
// enough to be a lead (no url AND no text).
export function mapApifyItem(item, { platformOverride } = {}) {
  if (!item || typeof item !== 'object') return null;

  const post_url = firstStr(
    item.url, item.postUrl, item.pageUrl, item.link, item.permalink, item.website, item.profileUrl
  ).slice(0, 2000);

  const post_text = firstStr(
    item.caption, item.text, item.postText, item.description, item.biography,
    item.bio, item.info, item.snippet, item.title
  );

  const username = firstStr(item.ownerUsername, item.username, item.handle, item.authorName);
  const author_name = firstStr(
    item.ownerFullName, item.fullName, item.name, item.title,
    item.user && item.user.name, item.author && item.author.name, username
  ).slice(0, 200);

  const author_handle = username
    ? (username.startsWith('@') ? username : '@' + username).slice(0, 500)
    : firstStr(item.profileUrl, item.ownerProfileUrl).slice(0, 500);

  // A url that is just a profile link isn't a post link, but it's still a
  // usable lead target, so we keep it. Require at least one of url/text.
  if (!post_url && !post_text) return null;

  const isHttp = /^https?:\/\//i.test(post_url);
  const safeUrl = isHttp ? post_url : '';

  const platform =
    (platformOverride && platformOverride !== 'auto' && platformOverride) ||
    platformFromUrl(safeUrl);

  return {
    platform,
    post_url: safeUrl,
    post_text,
    author_name,
    author_handle,
  };
}

// Turn a raw Apify dataset array into deduped, insert-ready lead rows.
// Dedupes within the batch and against existingUrls (a Set). Items with a
// url already present are skipped and counted. Text-only items (no url)
// can't be deduped, so they always pass through.
export function itemsToLeads(items, { existingUrls = new Set(), platformOverride, limit = 200 } = {}) {
  const leads = [];
  const seen = new Set();
  let skippedDuplicate = 0;
  let skippedEmpty = 0;

  for (const raw of Array.isArray(items) ? items : []) {
    if (leads.length >= limit) break;
    const lead = mapApifyItem(raw, { platformOverride });
    if (!lead) {
      skippedEmpty++;
      continue;
    }
    if (lead.post_url) {
      const key = lead.post_url.toLowerCase();
      if (existingUrls.has(key) || seen.has(key)) {
        skippedDuplicate++;
        continue;
      }
      seen.add(key);
    }
    leads.push(lead);
  }

  return { leads, skippedDuplicate, skippedEmpty };
}
