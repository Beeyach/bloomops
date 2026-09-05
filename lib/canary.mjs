// The internal test row, kept out of the day's work.
//
// One prospect (6567 in production) exists so the send path can be exercised
// end to end without writing to a stranger. It is a real row in a real table,
// so every count includes it and every list shows it, and Ary has no way to
// tell it apart from a lead.
//
// No migration was needed to fix that: the row already carries `source =
// 'canary'` and a domain nobody can own. Both were set when it was created, so
// this reads a marker that exists rather than inventing one.

const clean = (v) => String(v ?? '').trim().toLowerCase();

export const INTERNAL_LABEL = 'Internal test';

export function isInternalTest(prospect = {}) {
  return clean(prospect.source) === 'canary' || clean(prospect.domain) === 'example.invalid';
}

// Everything except the test rows. Used wherever a count or a list is meant to
// be about real people.
export function withoutInternalTest(prospects = []) {
  return prospects.filter((p) => !isInternalTest(p));
}
