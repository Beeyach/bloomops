// Motion tokens for Leads That Bloom.
//
// The audit found 604 elements sharing one duration and one curve — Tailwind's
// 0.15s cubic-bezier(.4,0,.2,1). Nothing was wrong with any single transition;
// the problem was that a delete confirm and a nav hover moved identically, so
// motion carried no meaning. These tokens exist to give motion hierarchy:
// bigger, more consequential, or further-travelling things take longer.

// Durations. The rule: distance and consequence buy time. A colour change on
// hover is nearly instant; a panel arriving from off-screen is not.
export const DUR = {
  instant: 90,    // colour/opacity on small controls
  quick: 140,     // hover, chip toggles
  base: 200,      // most state changes
  settle: 280,    // panels, drawers, reveals
  slow: 460,      // full-surface transitions
  bloom: 900,     // the loader's growth beats
};

// Easing. Named for what they're for, not what they look like, so call sites
// read as intent.
export const EASE = {
  // Standard UI travel: leaves quickly, arrives softly. Replaces the default.
  glide: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
  // Entrances: decelerates hard into place, no bounce.
  enter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  // Exits: accelerates away, because leaving should not be admired.
  exit: 'cubic-bezier(0.55, 0, 1, 0.45)',
  // Organic growth — stem, leaves, petals. Slightly late start, long tail,
  // like something unfurling rather than sliding.
  grow: 'cubic-bezier(0.34, 0.02, 0.2, 1)',
  // The single place overshoot is physically believable: a small living thing
  // settling onto a surface. Used only by the butterfly landing.
  alight: 'cubic-bezier(0.34, 1.28, 0.64, 1)',
};

// Travel distances. Small on purpose — motion that announces itself is the
// thing that reads as generated.
export const DIST = {
  hair: 2,
  nudge: 4,
  reveal: 10,
};

// Stagger between siblings. Long enough to read as sequence, short enough
// that a list of twelve does not become a performance.
export const STAGGER = { tight: 24, base: 40 };

// Below this, a completion animation is worse than none: the eye registers a
// flash rather than a landing. Fast runs skip straight to the result.
export const FAST_COMPLETION_MS = 600;

// ── Growth mapping ────────────────────────────────────────────────────────
// Turns real progress into what the loader draws. Kept pure and separate from
// the component so the honesty of the mapping is testable: the stem may only
// represent work that actually happened.

export function growthFor({ done = 0, total = 0, indeterminate = false } = {}) {
  // Unknown-length work (an Apify run) has no honest fraction. The stem
  // breathes at a fixed length instead of implying a position.
  if (indeterminate || !total || total < 0) {
    return { determinate: false, ratio: null, leaves: 0, stemPct: 100 };
  }
  const safeDone = Math.max(0, Math.min(done, total));
  const ratio = total > 0 ? safeDone / total : 0;
  return {
    determinate: true,
    ratio,
    // One leaf per completed unit of real work, capped so a 200-lead run
    // doesn't draw 200 leaves.
    leaves: Math.min(safeDone, MAX_LEAVES),
    stemPct: Math.round(ratio * 100),
  };
}

export const MAX_LEAVES = 7;

// Where along the stem leaf N sits, and which side it grows from. Spaced
// unevenly on purpose — evenly spaced leaves read as a progress bar with
// decoration, not as a plant.
const LEAF_OFFSETS = [14, 27, 39, 52, 63, 76, 88];

export function leafAt(index) {
  return {
    pct: LEAF_OFFSETS[index % LEAF_OFFSETS.length],
    side: index % 2 === 0 ? 'up' : 'down',
    // Slight per-leaf variation so no two are identical.
    tilt: (index % 3) * 7 - 7,
  };
}
