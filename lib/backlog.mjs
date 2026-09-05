// What is actually in the pile, before spending anything on it.
//
// There are several thousand prospects nobody has worked. The expensive
// mistake would be to point the research budget at them in row order: a
// scraped map listing with no email and a prospect Ary rated 💚 herself cost
// the same to check and are worth wildly different amounts.
//
// Everything here is deterministic and free. It reads columns that already
// exist and spends nothing, because the entire purpose is deciding where the
// money goes, and a classification that costs money to produce has defeated
// itself.

import { PROVIDER, providerFor } from './sources.mjs';

// Why a prospect is not worth spending on, decided from what is already known.
export const STOP = {
  TERMINAL: 'terminal',           // already answered one way or another
  NO_CONTACT: 'no-contact',       // nothing to write to and nothing to look up
  NOT_THEIR_SITE: 'not-their-site',
  DEAD_SITE: 'dead-site',
  DUPLICATE: 'duplicate',
};

export const BUCKET = {
  READY: 'ready',                 // has everything a package needs
  NEEDS_WEBSITE: 'needs-website', // has contact, no site checked yet
  NEEDS_CONTACT: 'needs-contact', // has a site, no address
  NEEDS_PROVENANCE: 'needs-provenance',
  NEEDS_HUMAN: 'needs-human',
  STOPPED: 'stopped',
};

const TERMINAL = new Set(['Client', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished']);
const LINK_PAGE = /^(www\.)?(linktr\.ee|linkin\.bio|beacons\.ai|bio\.link|solo\.to|campsite\.bio|facebook\.com|instagram\.com|m\.me)/i;

// One prospect's cheap classification. No probes, no model, no credits.
export function classify(p = {}, { seenEmails = null } = {}) {
  const stage = p.stage || 'New';
  const email = String(p.email || '').trim().toLowerCase();
  const domain = String(p.domain || '').trim();
  const rated = Boolean(p.rating);
  const provider = String(p.source_provider || '').trim() || providerFor(p.source);

  let intel = null;
  try { intel = p.site_intel ? JSON.parse(p.site_intel) : null; } catch { intel = null; }
  const researched = Boolean(intel);
  const manual = Boolean(p.own_findings || p.audit_notes);
  const qualified = Boolean(p.qualification);

  const out = {
    id: p.id,
    provider,
    rated,
    hasContact: Boolean(email),
    hasWebsite: Boolean(domain),
    researched,
    manual,
    sourceQualified: qualified,
    warm: Boolean(p.replied) || Boolean(p.call_booked) || Boolean(p.proposal_sent),
  };

  // ── Stops, cheapest and most certain first ──────────────────────────────
  if (TERMINAL.has(stage) || p.do_not_contact || p.unsubscribed) {
    return { ...out, bucket: BUCKET.STOPPED, stop: STOP.TERMINAL, why: `Already ${stage}.` };
  }
  if (seenEmails && email && seenEmails.get(email) > 1) {
    return { ...out, bucket: BUCKET.STOPPED, stop: STOP.DUPLICATE, why: 'Another row has the same address.' };
  }
  if (domain && LINK_PAGE.test(domain)) {
    return { ...out, bucket: BUCKET.STOPPED, stop: STOP.NOT_THEIR_SITE, why: 'That is a links page, not their site.' };
  }
  if (intel?.blocked || p.rating === '🥀') {
    return { ...out, bucket: BUCKET.STOPPED, stop: STOP.DEAD_SITE, why: 'The site could not be read.' };
  }
  if (!email && !domain) {
    // Nothing to write to and nothing to look at. Not deleted: a person can
    // still find the address by hand, and deleting somebody because a scraper
    // was thin is a decision the product does not get to make.
    return { ...out, bucket: BUCKET.STOPPED, stop: STOP.NO_CONTACT, why: 'No address and no website. Nothing to work with.' };
  }

  // ── What each one needs next ───────────────────────────────────────────
  if (manual || (researched && email)) {
    return { ...out, bucket: BUCKET.READY, why: 'Has evidence and an address. A package can be prepared.' };
  }
  if (email && domain) return { ...out, bucket: BUCKET.NEEDS_WEBSITE, why: 'Has an address. The site has not been checked.' };
  if (domain && !email) return { ...out, bucket: BUCKET.NEEDS_CONTACT, why: 'Has a site. No address found yet.' };
  if (email && !domain) {
    return provider === PROVIDER.UNKNOWN
      ? { ...out, bucket: BUCKET.NEEDS_PROVENANCE, why: 'An address, and nothing about where they came from.' }
      : { ...out, bucket: BUCKET.NEEDS_CONTACT, why: 'An address but no website to check.' };
  }
  return { ...out, bucket: BUCKET.NEEDS_HUMAN, why: 'Does not fit any of the cheap categories.' };
}

// ── Priority ─────────────────────────────────────────────────────────────
//
// Bands, not a score, for the same reason Pick uses bands: a number invites
// arithmetic on things nobody measured, and "83/100" would be a decimal point
// wearing a lab coat. Within a band the order is by how much is already known,
// so the cheapest wins come first.

export const BAND = {
  ARY_RATED: 100,        // she looked at this one herself
  WARM: 90,              // a conversation already happened
  MANUAL_EVIDENCE: 80,   // somebody wrote down a finding
  SOURCE_QUALIFIED: 70,  // qualified from what they wrote
  RESEARCHED: 60,        // a probe already paid for
  GOOD_ORIGIN: 50,       // a real listing with contact and site
  THIN: 30,              // one of the two
  UNKNOWN_ORIGIN: 10,    // no idea where it came from
  STOPPED: 0,
};

export function priority(c) {
  if (c.bucket === BUCKET.STOPPED) return { band: BAND.STOPPED, why: c.why };
  if (c.rated) return { band: BAND.ARY_RATED, why: 'Rated by hand, so somebody has already judged it.' };
  if (c.warm) return { band: BAND.WARM, why: 'A conversation has already happened here.' };
  if (c.manual) return { band: BAND.MANUAL_EVIDENCE, why: 'A finding was written down by a person.' };
  if (c.sourceQualified) return { band: BAND.SOURCE_QUALIFIED, why: 'Qualified from something they wrote.' };
  if (c.researched) return { band: BAND.RESEARCHED, why: 'A site check has already been paid for.' };
  if (c.hasContact && c.hasWebsite && c.provider !== PROVIDER.UNKNOWN) {
    return { band: BAND.GOOD_ORIGIN, why: 'Known origin, an address and a website.' };
  }
  if (c.provider === PROVIDER.UNKNOWN) return { band: BAND.UNKNOWN_ORIGIN, why: 'Nothing recorded about where this came from.' };
  return { band: BAND.THIN, why: 'Only one of an address and a website.' };
}

// The whole pile, counted. Rows in, summary out; nothing is written and
// nothing is spent.
export function summarise(rows = []) {
  // Duplicate addresses, counted once up front rather than per row.
  const seenEmails = new Map();
  for (const p of rows) {
    const e = String(p.email || '').trim().toLowerCase();
    if (e) seenEmails.set(e, (seenEmails.get(e) || 0) + 1);
  }

  const byProvider = new Map();
  const byBucket = new Map();
  const byStop = new Map();
  const byBand = new Map();
  const data = { hasWebsite: 0, noWebsite: 0, hasContact: 0, noContact: 0, researched: 0, rated: 0, sourceQualified: 0, warm: 0, manual: 0 };

  const classified = [];
  for (const p of rows) {
    const c = classify(p, { seenEmails });
    const band = priority(c);
    classified.push({ ...c, band: band.band, bandWhy: band.why });

    const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    bump(byProvider, c.provider);
    bump(byBucket, c.bucket);
    if (c.stop) bump(byStop, c.stop);
    bump(byBand, band.band);
    data[c.hasWebsite ? 'hasWebsite' : 'noWebsite'] += 1;
    data[c.hasContact ? 'hasContact' : 'noContact'] += 1;
    if (c.researched) data.researched += 1;
    if (c.rated) data.rated += 1;
    if (c.sourceQualified) data.sourceQualified += 1;
    if (c.warm) data.warm += 1;
    if (c.manual) data.manual += 1;
  }

  const asList = (m) => [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
  const workable = classified.filter((c) => c.bucket !== BUCKET.STOPPED);

  return {
    total: rows.length,
    byProvider: asList(byProvider),
    byBucket: asList(byBucket),
    byStop: asList(byStop),
    byBand: [...byBand.entries()].map(([band, n]) => ({ band: Number(band), n })).sort((a, b) => b.band - a.band),
    data,
    workable: workable.length,
    stopped: rows.length - workable.length,
    // What the paid research would actually be spent on, in order.
    order: workable.sort((a, b) => b.band - a.band || (b.hasWebsite ? 1 : 0) - (a.hasWebsite ? 1 : 0) || a.id - b.id)
      .slice(0, 50).map((c) => ({ id: c.id, band: c.band, bucket: c.bucket, why: c.bandWhy })),
  };
}

// ── Backpressure ─────────────────────────────────────────────────────────
//
// The system must not spend money producing a hundred packages a day when the
// person reviewing them clears eight. A package sitting unread for a week is
// worse than one never written: the evidence behind it goes stale, and it gets
// approved on the strength of research that no longer describes the site.

export const QUEUE_SOFT_LIMIT = 15;
export const QUEUE_HARD_LIMIT = 30;

// How much preparation should run, given how much is already waiting.
//
// Prescreen is never throttled. It is free, it is what stops money being spent
// on the wrong prospect, and slowing down the cheap step to protect the
// expensive one is backwards.
export function preparationAllowance({ readyForApproval = 0, dailyDraftCap = 10 } = {}) {
  const waiting = Number(readyForApproval) || 0;
  if (waiting >= QUEUE_HARD_LIMIT) {
    return {
      drafts: 0,
      research: false,
      reason: `${waiting} packages are already waiting to be reviewed. Preparing more would spend money on work that goes stale before anybody reads it.`,
    };
  }
  if (waiting >= QUEUE_SOFT_LIMIT) {
    const room = Math.max(0, QUEUE_HARD_LIMIT - waiting);
    return {
      drafts: Math.min(dailyDraftCap, room),
      research: true,
      reason: `${waiting} waiting. Slowing preparation to what the queue has room for.`,
    };
  }
  return { drafts: dailyDraftCap, research: true, reason: null };
}
