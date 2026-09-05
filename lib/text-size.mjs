// Text size, as a local preference.
//
// Chapter 8 raised the type scale once and Chapter 9 raised it again, and both
// times the right size was a guess about somebody else's eyes on somebody
// else's monitor. This stops guessing: three settings, stored in this browser,
// applied as one attribute on <html>. Every surface already reads the semantic
// roles, and the roles read one token, so nothing else in the app has to know
// this exists.
//
// Deliberately not in the database. It is a property of the screen you are
// looking at, not of the workspace — the same person on a laptop and a 27"
// monitor wants different answers, and a synced preference would be wrong on
// one of them.

export const TEXT_SIZES = [
  {
    id: 'compact',
    label: 'Compact',
    hint: 'The default. More on screen, body text at 15px — as small as it goes.',
  },
  {
    id: 'comfortable',
    label: 'Comfortable',
    hint: 'One step up. Body text at 16px.',
  },
  {
    id: 'large',
    label: 'Large',
    hint: 'Three steps up. Body text at 18px.',
  },
];

// Compact is the default. Chapters 8 and 9 raised the scale twice on the
// strength of "the fonts are too thin and small", and overshot: on a real
// screen full of real rows it reads as wasted space. The three steps are
// unchanged — what changed is which one you start on.
export const DEFAULT_TEXT_SIZE = 'compact';

// v1: there was no earlier key. Versioned anyway, because the last two
// chapters both moved the scale under a saved value, and the next one might.
export const TEXT_SIZE_KEY = 'ltb_textsize_v1';

const VALID = new Set(TEXT_SIZES.map((t) => t.id));

// Anything unrecognised is Comfortable. A stored value from a future version,
// a typo, a half-written string: none of them should leave the app unreadable.
export function normalizeTextSize(value) {
  return VALID.has(value) ? value : DEFAULT_TEXT_SIZE;
}

// The attribute the stylesheet keys off. The default carries no attribute at
// all, so it costs nothing and needs no CSS rule of its own.
export function textSizeAttr(value) {
  const v = normalizeTextSize(value);
  return v === DEFAULT_TEXT_SIZE ? null : v;
}
