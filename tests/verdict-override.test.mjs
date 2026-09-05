import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHumanDecided, statusForVerdict } from '../lib/engine-prompts.mjs';

// You looked at Coach Kai Tan, found an AI-generated persona with a scam
// review, and skipped him. The AI's green stood anyway. Your call has to be
// able to beat the model's, and it has to survive a re-score.

test('a lead the AI decided is not human decided', () => {
  assert.equal(isHumanDecided({ verdict: 'green', verdict_source: 'ai' }), false);
  assert.equal(isHumanDecided({ verdict: 'green' }), false);
});

test('a lead you decided is human decided', () => {
  assert.equal(isHumanDecided({ verdict: 'red', verdict_source: 'you' }), true);
});

test('an unscored lead is not human decided', () => {
  assert.equal(isHumanDecided({}), false);
  assert.equal(isHumanDecided(null), false);
});

test('your verdict always lands with full confidence', () => {
  // You verified it yourself, so it never wears the "unverified guess" badge.
  assert.equal(statusForVerdict('green', 'high'), 'qualified');
  assert.equal(statusForVerdict('red', 'high'), 'skipped');
});
