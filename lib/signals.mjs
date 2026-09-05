// Structured signals: things about a business that answer "why now?" or
// "why them?" — never trivia.
//
// The detection already existed. lib/extract-email.mjs has been finding
// contact emails and high-ticket clues (a named program, an apply-or-call
// funnel, a stated price, an income claim) on landing pages for months, and
// only ad-scan leads could reach it. Everything else got nothing.
//
// This does not reimplement any of that. It wraps the existing detector in a
// record that carries where a signal came from and when it was seen, so a
// signal is evidence rather than a label, and normalises what the site probe
// already knows into the same shape.

import { signalsInText, siteEmailAndSignals } from './extract-email.mjs';
import { classifyRenderability } from './renderability.mjs';
import { parseSiteIntel, isFresh } from './site-intel.mjs';

export const SIGNAL_TYPE = {
  OFFER: 'offer',           // a program, a funnel, a price, an income claim
  LEAD_FLOW: 'lead-flow',   // how enquiries actually reach them
  TECH: 'tech',             // platform and tooling
  CONTACT: 'contact',       // a way to reach a human
  ENGAGEMENT: 'engagement', // something they did
};

// How long a signal is worth repeating. Past this it is history, not news.
export const SIGNAL_FRESH_DAYS = 30;

function signal({ type, text, source = null, observedAt, confidence = 'medium', method }) {
  return { type, text, source, observedAt, confidence, method };
}

// The existing high-ticket clues, given provenance. `signalsInText` returns
// {key,label} and knows nothing about where the text came from, which is why
// it could not be evidence on its own.
export function offerSignals(text, { source = null, observedAt = null } = {}) {
  return signalsInText(text).map((s) =>
    signal({
      type: SIGNAL_TYPE.OFFER,
      text: s.label,
      source,
      observedAt,
      // These are regex hits on page copy. Real, repeatable, and not the same
      // thing as a person having read the page.
      confidence: 'medium',
      method: 'page copy match',
    })
  );
}

// What the site probe already established, as signals rather than as a blob.
// Nothing new is fetched: this reads what precheck already paid for.
export function signalsFromIntel(intel) {
  const i = parseSiteIntel(intel);
  if (!i || i.blocked) return [];
  const out = [];
  const at = i.checkedAt;
  const conf = isFresh(i) ? 'high' : 'low';
  if (i.platform) {
    out.push(signal({ type: SIGNAL_TYPE.TECH, text: `Site runs on ${i.platform}`, observedAt: at, confidence: conf, method: 'browser check' }));
  }
  if (i.hasBooking === false) {
    out.push(signal({
      type: SIGNAL_TYPE.LEAD_FLOW,
      text: 'No booking system on the site, so enquiries arrive as messages somebody has to answer',
      observedAt: at,
      confidence: conf,
      method: 'browser check',
    }));
  } else if (i.hasBooking === true) {
    out.push(signal({ type: SIGNAL_TYPE.LEAD_FLOW, text: 'They already have a booking system', observedAt: at, confidence: conf, method: 'browser check' }));
  }
  if (i.hasForm === true) {
    out.push(signal({ type: SIGNAL_TYPE.LEAD_FLOW, text: 'Contact form on the site', observedAt: at, confidence: conf, method: 'browser check' }));
  } else if (i.hasForm === false) {
    out.push(signal({ type: SIGNAL_TYPE.LEAD_FLOW, text: 'No contact form found', observedAt: at, confidence: conf, method: 'browser check' }));
  }
  return out;
}

export function contactSignal(email, { source = null, observedAt = null } = {}) {
  if (!email) return [];
  return [signal({
    type: SIGNAL_TYPE.CONTACT,
    text: `Public contact address on their site: ${email}`,
    source,
    observedAt,
    confidence: 'high',
    method: 'read from their own page',
  })];
}

// Fetches a prospect's own site once and returns the contact address plus any
// offer signals, in the structured shape. This is the path that was only ever
// available to ad leads.
//
// One request, an 8 second ceiling, and it never throws: a prospect whose site
// will not load is still a prospect.
export async function gatherSiteSignals(domain, { extraText = '', timeoutMs = 8000 } = {}) {
  const d = String(domain || '').trim();
  if (!d) return { email: null, signals: [], checkedAt: null, reachable: false, status: null };
  const url = /^https?:\/\//i.test(d) ? d : `https://${d}`;
  const at = new Date().toISOString();
  const { email, signals, reachable, status, html } = await siteEmailAndSignals(url, { extraText, timeoutMs });
  // Judged on the page we already have, so deciding whether a browser probe
  // could learn anything costs nothing at all.
  const render = classifyRenderability({ status, html, finalUrl: url });
  return {
    email,
    checkedAt: at,
    // Passed up so the paid stage can decline a dead address rather than
    // discovering it is dead at the cost of a probe.
    reachable,
    status,
    render,
    signals: [
      ...contactSignal(email, { source: url, observedAt: at }),
      ...signals.map((s) =>
        signal({ type: SIGNAL_TYPE.OFFER, text: s.label, source: url, observedAt: at, confidence: 'medium', method: 'page copy match' })
      ),
    ],
  };
}

// Everything known, deduplicated, strongest first. Stored signals come from
// the prospect row; intel signals are derived free.
export function collectSignals(p = {}) {
  const stored = parseStored(p.signals);
  const all = [...stored, ...signalsFromIntel(p.site_intel)];
  const seen = new Set();
  const out = [];
  const rank = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => (rank[a.confidence] ?? 3) - (rank[b.confidence] ?? 3));
  for (const s of all) {
    const key = `${s.type}|${s.text}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function parseStored(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((s) => s && s.text) : [];
  } catch {
    return [];
  }
}

// Signal lines for a prompt. Typed and dated, so a model can tell a measured
// fact from a regex hit on marketing copy.
export function signalLines(signals = []) {
  if (!signals.length) return [];
  return signals.map((s) => `  * [${s.type}] ${s.text} (${s.method}${s.observedAt ? `, ${String(s.observedAt).slice(0, 10)}` : ''})`);
}
