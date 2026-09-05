import test from 'node:test';
import assert from 'node:assert/strict';
import {
  costOf, modelForTask, priceFor, summarise, TASK_TIER, USD_PER_CREDIT,
} from '../lib/ai-cost.mjs';

// The app charged credits for eleven AI tasks and had no idea what any of them
// cost: callAI read the usage block off every response and dropped it. These
// pin the arithmetic that replaced the guess.

test('cost is input plus output at the model rate', () => {
  // Sonnet: $3/M in, $15/M out.
  const c = costOf('claude-sonnet-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 });
  assert.equal(Math.round(c * 100) / 100, 18);
});

test('a cache read bills at a tenth of input', () => {
  const plain = costOf('claude-sonnet-5', { input_tokens: 1_000_000 });
  const cached = costOf('claude-sonnet-5', { cache_read_input_tokens: 1_000_000 });
  assert.equal(Math.round((plain / cached) * 10) / 10, 10);
});

test('a cache write bills above plain input, so caching a prompt used once loses', () => {
  const plain = costOf('claude-sonnet-5', { input_tokens: 1_000_000 });
  const written = costOf('claude-sonnet-5', { cache_creation_input_tokens: 1_000_000 });
  assert.ok(written > plain, 'a cache write must cost more than not caching');
  assert.equal(Math.round((written / plain) * 100) / 100, 1.25);
});

test('an unknown model is costed as Sonnet, never as free', () => {
  const c = costOf('some-model-we-have-not-heard-of', { input_tokens: 1_000_000 });
  assert.equal(c, 3);
  assert.deepEqual(priceFor('nonsense'), { input: 3, output: 15 });
});

test('extraction and classification route to the cheap model', () => {
  // Reply classification is the highest-volume job once a sequence runs, and
  // the cheapest: spending a reasoning model to discover "not interested" is
  // the waste that makes AI features expensive for nothing.
  assert.equal(modelForTask('classify-reply', 'claude-sonnet-5'), 'claude-haiku-4-5');
  assert.equal(modelForTask('voice-note', 'claude-sonnet-5'), 'claude-haiku-4-5');
  assert.equal(modelForTask('score', 'claude-sonnet-5'), 'claude-haiku-4-5');
  assert.equal(modelForTask('phrases', 'claude-sonnet-5'), 'claude-haiku-4-5');
});

test('reading the whole pipeline stays on the configured model', () => {
  for (const task of ['analyze', 'best5', 'objections', 'proposal', 'reply-coach']) {
    assert.equal(modelForTask(task, 'claude-sonnet-5'), 'claude-sonnet-5', task);
  }
});

test('the configured model is a ceiling, never raised', () => {
  // A workspace on Haiku does not get silently upgraded.
  assert.equal(modelForTask('analyze', 'claude-haiku-4-5'), 'claude-haiku-4-5');
  // An unknown task is treated as standard rather than cheap.
  assert.equal(modelForTask('some-new-task', 'claude-opus-5'), 'claude-opus-5');
});

test('a non-Anthropic model is left alone', () => {
  // The workspace picked it; we do not substitute an Anthropic id into an
  // OpenAI request.
  assert.equal(modelForTask('voice-note', 'gpt-4o-mini'), 'gpt-4o-mini');
});

test('every task in the tier map is a real task name', () => {
  const REAL = new Set([
    'score', 'draft', 'phrases', 'analyze', 'reply-coach', 'call-prep',
    'proposal', 'voice-note', 'best5', 'objections', 'content-scripts',
    'classify-reply',
    // Looks at one screenshot and answers one closed question about what is
    // visibly on it. Background work like classify-reply — it has no user-facing
    // AI route, and routing it as cheap is the difference between visual
    // verification being affordable and being switched off.
    'visual-evidence',
  ]);
  for (const t of Object.keys(TASK_TIER)) {
    assert.ok(REAL.has(t), `${t} is routed but is not a task the AI route handles`);
  }
});

test('summarise reports margin per task and flags one sold at a loss', () => {
  const s = summarise([
    // 5 credits = $0.005 charged. Cost below is deliberately higher.
    { task: 'score', cost_usd: 0.0062, credits_charged: 5, input_tokens: 250, output_tokens: 360 },
    { task: 'best5', cost_usd: 0.033, credits_charged: 60, input_tokens: 3000, output_tokens: 1600 },
  ]);
  assert.equal(s.calls, 2);
  assert.equal(s.credits, 65);
  assert.equal(Math.round(s.chargedUsd * 1000) / 1000, 0.065);
  const score = s.byTask.find((t) => t.task === 'score');
  assert.ok(score.margin < 1, 'scoring one lead is charged less than it costs');
  const best5 = s.byTask.find((t) => t.task === 'best5');
  assert.ok(best5.margin > 1);
  // Ordered by what actually costs the most.
  assert.equal(s.byTask[0].task, 'best5');
});

test('summarise on an empty ledger reports zeros, not NaN', () => {
  const s = summarise([]);
  assert.equal(s.calls, 0);
  assert.equal(s.costUsd, 0);
  assert.equal(s.margin, null);
  assert.deepEqual(s.byTask, []);
});

test('a credit is a tenth of a cent', () => {
  assert.equal(USD_PER_CREDIT, 0.001);
});

test('the background caller reads the same model setting as the request path', async () => {
  // `aiModel` is what Settings writes and what /api/ai reads. lib/ai-call.mjs
  // read `stored.model`, which does not exist, so every background job ignored
  // the workspace's configured model and fell back to the hardcoded default.
  // One setting, two paths, two behaviours, and nothing failed loudly.
  const { readFileSync } = await import('node:fs');
  // Comments here quote the bug they describe, so a naive search finds the
  // explanation and calls it the defect. Same trap as the middleware tests.
  const bg = readFileSync(new URL('../lib/ai-call.mjs', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
  const route = readFileSync(new URL('../app/api/ai/route.js', import.meta.url), 'utf8');
  assert.match(bg, /stored\.aiModel/, 'background must read aiModel');
  assert.ok(!/stored\.model\b/.test(bg), 'and must not read a field that does not exist');
  assert.match(route, /settings\.aiModel/, 'the request path already did');
});
