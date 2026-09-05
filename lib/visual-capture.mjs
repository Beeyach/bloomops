// Which pages are worth photographing, and turning the pictures into evidence.
//
// The expensive mistake here is obvious and easy to make: screenshot every page
// of every site, hand them all to a vision model, and call it verification. A
// full visual design audit per prospect is a cost nobody can run at five
// thousand rows, and most of it would prove nothing, because most findings are
// not about appearance at all. A 404 on the booking page is settled by the
// status code.
//
// So the rule is the other way round. A picture is taken only where a claim
// actually depends on what somebody sees, and only of the page that claim is
// about. Everything else stays on the cheap path it was already on.

import { EVIDENCE, VIEWPORT, CLAIM, claimFor, soundsMobile } from './visual-evidence.mjs';

// Normalised for comparison: host and path, lowercased, no query, no trailing
// slash. The same rule validateClaim uses, so a claim and its picture agree
// about what "the same page" means.
export function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw));
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
  } catch {
    return String(raw || '').trim().toLowerCase() || null;
  }
}

// What has to be photographed to settle these claims, and nothing else.
//
// Returns one entry per page-and-viewport that is genuinely needed. A claim
// whose evidence is technical or rendered contributes nothing: it is already
// provable, and a screenshot of it is spend with no answer attached.
export function captureTargets(claims = []) {
  const wanted = new Map();

  for (const claim of claims) {
    const category = claim.category || claimFor(claim.key);
    if (category !== CLAIM.VISUAL_UX && category !== CLAIM.MOBILE_VISUAL_UX) continue;
    const url = claim.url;
    if (!url) continue;

    const key = normalizeUrl(url);
    if (!key) continue;

    const entry = wanted.get(key) || { url, normalizedUrl: key, viewports: new Set(), keys: new Set() };
    entry.keys.add(claim.key || category);

    // A phone claim needs a phone. A claim that could differ on a phone gets
    // both, because "the button is buried" is a different question at 390px
    // and answering it from the desktop frame is the same error one layer up.
    if (category === CLAIM.MOBILE_VISUAL_UX || soundsMobile(claim.text)) entry.viewports.add(VIEWPORT.MOBILE);
    else { entry.viewports.add(VIEWPORT.DESKTOP); entry.viewports.add(VIEWPORT.MOBILE); }

    wanted.set(key, entry);
  }

  return [...wanted.values()].map((e) => ({
    url: e.url,
    normalizedUrl: e.normalizedUrl,
    viewports: [...e.viewports],
    keys: [...e.keys],
  }));
}

// How many pages one prospect may cost, whatever the findings say.
//
// A site that trips six visual checks on six pages is not six times more worth
// verifying than one that trips two. Past a small number the marginal picture
// stops changing the outreach and starts being a bill.
export const MAX_PAGES_PER_PROSPECT = 3;

export function boundTargets(targets = [], max = MAX_PAGES_PER_PROSPECT) {
  return targets.slice(0, max);
}

// One artifact row, from what the render service returned.
//
// Nothing is inferred. A capture that came back blocked stays blocked, a
// capture that could not be stored keeps its error, and neither is quietly
// dropped — "we could not see it" is a finding, and pretending it did not
// happen is how a claim ends up unsupported without anybody noticing.
export function artifactFrom(shot = {}, { workspace, prospectId = null, runId = null } = {}) {
  const viewport = shot.viewport === VIEWPORT.MOBILE ? VIEWPORT.MOBILE : VIEWPORT.DESKTOP;
  const size = viewport === VIEWPORT.MOBILE ? { w: 390, h: 844 } : { w: 1920, h: 1080 };
  return {
    workspace,
    prospectId,
    runId,
    url: shot.url,
    normalizedUrl: normalizeUrl(shot.url),
    viewport,
    viewportWidth: size.w,
    viewportHeight: size.h,
    capturedAt: shot.capturedAt || new Date().toISOString(),
    httpStatus: shot.status ?? null,
    blocked: Boolean(shot.blocked),
    overlay: Boolean(shot.overlay),
    pageTitle: shot.title || null,
    storedAt: shot.storedAt || null,
    storeError: shot.storeError || null,
    sha256: shot.sha256 || null,
    bytes: Number(shot.bytes) || 0,
  };
}

// An artifact, as the claim validator wants to read it.
//
// The tier is VISUAL only when there is actually an image to look at. A capture
// that failed to store is a record that something was attempted, and it must
// not be able to prove anything: without the picture, nobody can check the
// claim, which is the whole point of requiring one.
export function asEvidence(artifact = {}) {
  return {
    tier: artifact.storedAt ? EVIDENCE.VISUAL : EVIDENCE.RENDERED,
    url: artifact.url,
    normalizedUrl: artifact.normalizedUrl,
    viewport: artifact.viewport,
    capturedAt: artifact.capturedAt,
    blocked: Boolean(artifact.blocked),
    artifactId: artifact.id ?? null,
    storedAt: artifact.storedAt || null,
  };
}
