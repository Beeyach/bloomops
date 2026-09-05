import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The three files that decide what a video says and shows have to agree, and
// nothing but a test keeps them agreeing. A finding that can be spoken needs
// wording in narrate.mjs, something on screen in capture.mjs, and a weight in
// findings.mjs. When one is missing the video talks about a thing it never
// shows, shows a thing it never explains, or ranks a finding at zero and buries
// it. All three have happened.

const read = (p) => readFileSync(new URL(`../services/audit-render/${p}`, import.meta.url), 'utf8');
const FINDINGS = read('findings.mjs');
const NARRATE = read('narrate.mjs');
const CAPTURE = read('capture.mjs');

// Keys that deriveFindings can add at severity 'real' — the only ones that
// can ever be spoken.
// Literal adds, plus keys handed to add() through a helper (quoteFinding and
// friends return a key name, so the literal never appears next to add).
// Anything quoted in findings.mjs that the wording table also knows is a real
// linkage; anything else in there is prose.
const literalReal = [...FINDINGS.matchAll(/add\('real',\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
const quotedInFindings = new Set([...FINDINGS.matchAll(/'([a-z][a-z0-9-]{2,})'/g)].map((m) => m[1]));

// Wording, by key, in the REAL table.
const realBlock = NARRATE.slice(NARRATE.indexOf('const REAL = {'));
const spokenKeys = new Set(
  [...realBlock.matchAll(/^\s{2}'?([a-z0-9-]+)'?:/gm)].map((m) => m[1])
);

// Something on screen: either a case in the beat loop or a silent card.
const beatKeys = new Set([...CAPTURE.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]));
const silentBlock = CAPTURE.slice(CAPTURE.indexOf('const SILENT_BEAT = {'), CAPTURE.indexOf('const SILENT_BEAT = {') + 3000);
const cardKeys = new Set([...silentBlock.matchAll(/^\s{2}'?([a-z0-9-]+)'?:/gm)].map((m) => m[1]));

const IMPACT_BLOCK = FINDINGS.slice(FINDINGS.indexOf('const IMPACT = {'), FINDINGS.indexOf('const IMPACT = {') + 2500);
const impactKeys = new Set([...IMPACT_BLOCK.matchAll(/^\s{2}'?([a-z0-9-]+)'?:/gm)].map((m) => m[1]));

// Every key that can actually be spoken: it has wording AND findings.mjs can
// reach it. Built after both sides are known so helper-added keys count.
const REAL_KEYS = [...new Set([
  ...literalReal,
  ...[...spokenKeys].filter((k) => k !== '_default' && quotedInFindings.has(k)),
])];

test('every spoken finding has wording', () => {
  const missing = REAL_KEYS.filter((k) => !spokenKeys.has(k));
  assert.deepEqual(missing, [], `findings with no line in REAL: ${missing.join(', ')}`);
});

test('every spoken finding has something on screen', () => {
  const missing = REAL_KEYS.filter((k) => !beatKeys.has(k) && !cardKeys.has(k));
  assert.deepEqual(missing, [], `findings with nothing to show: ${missing.join(', ')}`);
});

test('every spoken finding carries a weight, so none is silently ranked last', () => {
  const missing = REAL_KEYS.filter((k) => !impactKeys.has(k));
  assert.deepEqual(missing, [], `findings with no IMPACT weight: ${missing.join(', ')}`);
});

test('nothing is worded that findings.mjs can never produce', () => {
  // A line in REAL whose key appears nowhere in findings.mjs is dead weight:
  // it can never be spoken, but it still shows up in the voice cache list and
  // gets recorded and paid for.
  const orphans = [...spokenKeys].filter((k) => k !== '_default' && !quotedInFindings.has(k));
  assert.deepEqual(orphans, [], `wording with no finding behind it: ${orphans.join(', ')}`);
});
