import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAdScoringPrompt, parseScoringResult, statusForVerdict } from '../lib/engine-prompts.mjs';

// A green the AI isn't sure about is a guess, not a lead. The Coach Kai Tan
// case: no ad copy, no landing page, "assuming best case" — and the app
// filed him under Qualified anyway.

test('a confident green qualifies', () => {
  assert.equal(statusForVerdict('green', 'high'), 'qualified');
});

test('an unsure green stays in review instead of qualifying', () => {
  assert.equal(statusForVerdict('green', 'low'), 'new');
});

test('red is skipped regardless of confidence', () => {
  assert.equal(statusForVerdict('red', 'high'), 'skipped');
  assert.equal(statusForVerdict('red', 'low'), 'skipped');
});

test('a missing confidence is treated as unsure, not confident', () => {
  // Defaulting to "high" would reintroduce the bug for any model that
  // omits the field.
  assert.equal(statusForVerdict('green', undefined), 'new');
  assert.equal(statusForVerdict('green', null), 'new');
});

test('parseScoringResult keeps the confidence the model returned', () => {
  const r = parseScoringResult('{"verdict":"green","reasons":["a"],"confidence":"low","suggested_first_line":"hi"}');
  assert.equal(r.ok, true);
  assert.equal(r.data.confidence, 'low');
});

test('ad prompt forbids assuming best case when nothing can be verified', () => {
  const p = buildAdScoringPrompt({ offer: 'x', audience: 'y' }, { lead_kind: 'ad', author_name: 'Coach Someone' });
  assert.match(p, /cannot verify|can't verify|do not assume|confidence.*low/i);
});

test('ad prompt names the no-copy-no-landing-page case explicitly', () => {
  const p = buildAdScoringPrompt({ offer: 'x', audience: 'y' }, { lead_kind: 'ad', author_name: 'Coach Someone' });
  // The exact situation that produced a false green.
  assert.match(p, /no ad copy/i);
});
