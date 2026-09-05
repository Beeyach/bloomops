// What we actually know about a prospect's website, kept.
//
// services/audit-render runs a real headless browser over a site: it visits
// subpages, checks whether the contact form submits, follows dead links,
// measures load time, reads the platform, and returns keyed findings with the
// evidence behind each one. The app stored three columns of that — a tier, a
// number, and a list of strings — and dropped the rest.
//
// Two things that cost:
//
//   Nothing recorded WHEN a site was last looked at. So a prospect checked an
//   hour ago and one never checked looked identical, and the only safe move
//   was to spend the credits again.
//
//   Every bee that wanted to know something about the site had to be told in
//   its prompt, retyped out of free-text audit notes, because there was no
//   fact to read.
//
// A finding with no date is not evidence, it is a rumour. Everything here
// carries when it was seen and where it came from.

// How long a probe's answer is worth trusting. A small business website does
// not change weekly; two weeks is long enough to stop paying twice for the
// same answer and short enough that a redesign is not missed for a quarter.
export const FRESH_DAYS = 14;

// The shape stored in prospects.site_intel. Deliberately a JSON blob: what
// the probe checks is the render service's business, and pinning every check
// into its own column would mean a migration each time one is added.
export function buildSiteIntel(probe = {}, { source = 'precheck', at = null } = {}) {
  const now = at || new Date().toISOString();
  const facts = probe.facts || {};
  const checks = probe.checks || {};
  return {
    // Verdict: does this site earn a video, and why.
    worth: Boolean(probe.worth),
    score: Math.round(Number(probe.score) || 0),
    why: String(probe.why || '').slice(0, 400),
    // Keys are the machine-readable form. Reasons are the same findings in
    // plain words, in the order the video would raise them. Both are kept:
    // keys so code can reason about them, reasons so a human can read them.
    keys: Array.isArray(probe.keys) ? probe.keys.slice(0, 12) : [],
    reasons: Array.isArray(probe.reasons) ? probe.reasons.slice(0, 12) : [],
    // Facts about the site itself. These are what the bees kept being told in
    // prose and can now simply read.
    platform: facts.platform || null,
    title: facts.title || null,
    hasForm: facts.form ?? null,
    hasBooking: facts.booking ?? null,
    contactPage: facts.contactPage || null,
    // Whether the probe could see the site at all, and why not.
    blocked: probe.blocked ? { reason: probe.blocked.reason || 'unknown', host: probe.blocked.host || null, status: probe.blocked.status ?? null } : null,
    // Provenance. Without these three the rest is a rumour.
    pagesChecked: Array.isArray(probe.pagesChecked) ? probe.pagesChecked.slice(0, 12) : (Number(probe.pagesChecked) || null),
    checkedAt: now,
    source,
    // Anything the probe reported that this version does not model. Kept so a
    // new check added to the render service is not silently lost before the
    // app is taught about it.
    extra: pickExtra(probe, checks),
  };
}

function pickExtra(probe, checks) {
  const out = {};
  for (const k of ['medianLoadMs', 'mobileOverflowPx', 'deadLinks', 'onGhl', 'deadFeed', 'mailtoForm']) {
    const v = probe[k] ?? checks[k];
    if (v !== undefined && v !== null) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function parseSiteIntel(raw) {
  if (!raw) return null;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

// How old the stored answer is, in days, or null when there is no answer.
export function ageInDays(intel, now = new Date()) {
  const at = intel?.checkedAt;
  if (!at) return null;
  const ms = now.getTime() - Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  return ms / 86400000;
}

// Whether the stored answer is still worth using instead of paying again.
// A blocked result is treated as fresh too: a parked domain does not become
// un-parked because somebody clicked the button twice.
export function isFresh(intel, { days = FRESH_DAYS, now = new Date() } = {}) {
  const age = ageInDays(intel, now);
  return age != null && age >= 0 && age < days;
}

// Did the probe actually do its job, whatever it found?
//
// This is a DIFFERENT question from whether there is enough to write an email
// about, and conflating the two is a trap. A thorough probe that found nothing
// wrong has answered the question and must not be re-bought. A shallow record
// that only knows the homepage exists has not, however recently it was written.
//
// Coverage, not yield: pages visited, and facts actually read off the page.
export function isThorough(intel) {
  if (!intel) return false;
  // A blocked result is a complete answer: the site could not be read, and
  // looking again this week will not change that.
  if (intel.blocked) return true;
  const pages = Array.isArray(intel.pagesChecked) ? intel.pagesChecked.length : Number(intel.pagesChecked) || 0;
  // Reading a fact off the page proves the probe got in and inspected it, so
  // either signal is enough on its own. Requiring both meant a record with no
  // pagesChecked (which older probe versions did not return) would be
  // re-bought forever, which is the exact waste this file exists to stop.
  // A single page with no facts read is the shallow case: it knows the
  // homepage exists and nothing else.
  const readFacts = intel.platform != null || intel.hasForm != null || intel.hasBooking != null;
  return readFacts || pages >= 2;
}

// The line the UI shows so a stored fact never passes for a fresh one.
export function freshnessLabel(intel, now = new Date()) {
  const age = ageInDays(intel, now);
  if (age == null) return 'Never checked';
  if (age < 0.042) return 'Checked just now';
  if (age < 1) return `Checked ${Math.max(1, Math.round(age * 24))}h ago`;
  const d = Math.round(age);
  if (d === 1) return 'Checked yesterday';
  if (d < FRESH_DAYS) return `Checked ${d} days ago`;
  return `Checked ${d} days ago, worth redoing`;
}

// The facts a prompt should be given, as short lines. This is what replaces
// "paste the audit notes and hope": the bee reads measured facts with a date
// on them rather than prose somebody typed months ago.
//
// Returns [] when there is nothing stored, so a caller can tell the
// difference between "the site is fine" and "we never looked".
export function intelLines(intel) {
  if (!intel) return [];
  const out = [];
  if (intel.blocked) {
    out.push(`SITE COULD NOT BE READ: ${intel.blocked.reason}${intel.blocked.status ? ` (HTTP ${intel.blocked.status})` : ''}`);
    out.push(`checked: ${String(intel.checkedAt).slice(0, 10)}`);
    return out;
  }
  if (intel.platform) out.push(`platform: ${intel.platform}`);
  if (intel.hasBooking != null) out.push(`booking on site: ${intel.hasBooking ? 'yes' : 'no'}`);
  if (intel.hasForm != null) out.push(`contact form: ${intel.hasForm ? 'yes' : 'no'}`);
  if (Array.isArray(intel.reasons) && intel.reasons.length) {
    out.push('verified problems:');
    for (const r of intel.reasons.slice(0, 5)) out.push(`  - ${r}`);
  } else {
    out.push('verified problems: none found by the probe');
  }
  out.push(`video verdict: ${intel.worth ? 'earns one' : 'does not earn one'} (severity ${intel.score})`);
  out.push(`checked: ${String(intel.checkedAt).slice(0, 10)} by ${intel.source || 'probe'}`);
  return out;
}
