// The angle each cold email takes, so no two emails say the same thing.
//
// V3's core rule: every touch approaches the prospect from a different
// direction, built from their audit facts. The angle is decided at package
// preparation time and stamped on the send event so the history is readable.

import { PRIORITY, TOUCHES } from './priority.mjs';

export const ANGLE = {
  PAIN_MICRO_OFFER: 'PAIN_MICRO_OFFER',
  FIX_SKETCH: 'FIX_SKETCH',
  VIDEO: 'VIDEO',
  BREAKUP: 'BREAKUP',
};

export const ANGLE_LABEL = {
  [ANGLE.PAIN_MICRO_OFFER]: 'Pain + micro-offer',
  [ANGLE.FIX_SKETCH]: 'Specific fix sketch',
  [ANGLE.VIDEO]: 'Video',
  [ANGLE.BREAKUP]: 'Short breakup',
};

const ROTATION = {
  [PRIORITY.P1]: [ANGLE.PAIN_MICRO_OFFER, ANGLE.FIX_SKETCH, ANGLE.VIDEO, ANGLE.BREAKUP],
  [PRIORITY.P2]: [ANGLE.PAIN_MICRO_OFFER, ANGLE.FIX_SKETCH, ANGLE.BREAKUP],
  [PRIORITY.P3]: [ANGLE.PAIN_MICRO_OFFER],
};

export function defaultRotation(band) {
  return ROTATION[band] || [];
}

// The angle for step N in a band's default rotation. 1-indexed.
export function angleForStep(band, step) {
  const rot = defaultRotation(band);
  const i = Number(step) - 1;
  return i >= 0 && i < rot.length ? rot[i] : null;
}

// Validate that a list of angles has no repeats and every angle is known.
export function validateAngles(angles = []) {
  const problems = [];
  const seen = new Set();
  const known = new Set(Object.values(ANGLE));

  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    if (!a) { problems.push(`Step ${i + 1} has no angle.`); continue; }
    if (!known.has(a)) problems.push(`Step ${i + 1} uses unknown angle "${a}".`);
    if (seen.has(a)) problems.push(`Step ${i + 1} repeats angle "${a}".`);
    seen.add(a);
  }

  return { ok: problems.length === 0, problems };
}

// Does a set of steps cover the full rotation for a band?
export function coversRotation(band, angles = []) {
  const expected = defaultRotation(band);
  if (angles.length < expected.length) return false;
  return expected.every((a) => angles.includes(a));
}
