// Rebuilding the finding keys that were never stored.
//
// `/precheck` computed `verdict.keys` and returned only `reasons`, so every
// prospect probed before 2026-08-09 has real, correct findings written in
// English and nothing a machine can reason about. Keys are what decide
// material versus cosmetic, which outreach angle the evidence supports, and
// whether a finding is worth a video, so all three answered "nothing" on those
// rows.
//
// The repair is deterministic and free. The render service turns a key into a
// sentence through one lookup table; this inverts that table. No model is
// asked to guess, no website is revisited, and nothing is written for a
// sentence that does not match a known pattern.
//
// The rule that matters: a phrase that cannot be matched confidently is left
// alone. Inventing a key would be worse than the missing one, because the
// missing key makes a prospect look unverified while a wrong key makes them
// look verified for something that was never found.

// Mirrors PLAIN in services/audit-render/findings.mjs. Fixed strings match
// exactly; templated ones match their stable prefix.
const EXACT = {
  'Free download asks for no email': 'lead-magnet-open',
  'Every button goes to the same place': 'ctas-collapse',
  'Two booking systems both live': 'two-schedulers',
  'Booking is a request form, not a calendar': 'booking-is-a-form',
  'No way to book from the site': 'no-booking',
  'Quote form asks nothing about the job': 'quote-form-thin',
  'No opening hours on the site': 'no-hours',
  'No reviews or testimonials on the site': 'no-reviews',
  'No description for search results': 'no-meta-description',
  'Served over http, marked Not secure': 'insecure',
  'Some assets load insecurely and get blocked': 'mixed-content',
  'Layout runs off the screen on a phone': 'mobile-overflow',
  'Not sized for phones at all': 'viewport',
  'Site told Google not to list it': 'noindex',
  'Page has no title': 'no-title',
};

// The templated ones. Anchored at the start so a sentence that merely mentions
// a form somewhere cannot match a form finding.
const PATTERNS = [
  [/^Template text still on the page:/i, 'placeholder-text'],
  [/^Browser tab still says/i, 'default-title'],
  [/ icon goes to .+, not their page$/i, 'social-stub'],
  [/^Footer still says/i, 'stale-copyright'],
  [/^Still showing /i, 'expired-date'],
  [/^Contact form asks for .+ things$/i, 'long-form'],
  [/^Running .+, years out of date$/i, 'stale-stack'],
  [/^Took .+ seconds to load$/i, 'slow'],
];

const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');

// One sentence to one key, or null. Never a guess.
export function keyForReason(reason) {
  const text = squash(reason);
  if (!text) return null;
  if (EXACT[text]) return EXACT[text];
  for (const [re, key] of PATTERNS) {
    if (re.test(text)) return key;
  }
  return null;
}

// Rebuilds the key list for one stored intel blob.
//
// Returns what it could do and what it could not, so an ambiguous row is
// visible rather than silently half-repaired.
export function rebuildKeys(intel) {
  let parsed;
  try {
    parsed = typeof intel === 'string' ? JSON.parse(intel) : intel;
  } catch {
    return { ok: false, why: 'unreadable' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, why: 'unreadable' };

  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
  const existing = Array.isArray(parsed.keys) ? parsed.keys.filter(Boolean) : [];

  // Already fine, or nothing to work from.
  if (existing.length) return { ok: false, why: 'already-has-keys' };
  if (!reasons.length) return { ok: false, why: 'no-findings' };

  const keys = [];
  const unmatched = [];
  for (const r of reasons) {
    const k = keyForReason(r);
    if (k) { if (!keys.includes(k)) keys.push(k); }
    else unmatched.push(squash(r));
  }

  if (!keys.length) return { ok: false, why: 'nothing-recognised', unmatched };

  return {
    ok: true,
    keys,
    unmatched,
    // A row where some sentences matched and some did not is repaired for what
    // matched and flagged for the rest. Partial truth beats none, and the
    // count is reported rather than buried.
    partial: unmatched.length > 0,
    intel: JSON.stringify({ ...parsed, keys, keysBackfilledAt: new Date().toISOString() }),
  };
}

// The same job for the older `video_reasons` column, which is a plain JSON
// array of sentences from the pre-site_intel path.
export function keysFromVideoReasons(raw) {
  let list;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return { keys: [], unmatched: [] }; }
  if (!Array.isArray(list)) return { keys: [], unmatched: [] };

  const keys = [];
  const unmatched = [];
  for (const r of list) {
    const k = keyForReason(typeof r === 'string' ? r : r?.text);
    if (k) { if (!keys.includes(k)) keys.push(k); }
    else if (r) unmatched.push(squash(typeof r === 'string' ? r : r?.text));
  }
  return { keys, unmatched };
}
