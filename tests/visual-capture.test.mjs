// Which pages get photographed, what the picture becomes, and what a model is
// allowed to conclude from it.
//
// The cost failure mode is the one to hold hardest. Screenshot every page of
// every site and hand them all to a vision model and you have a full design
// audit per prospect, which at five thousand rows is a feature nobody switches
// on. A picture is taken only where a claim depends on what somebody sees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CLAIM, EVIDENCE, VIEWPORT, validateClaim } from '../lib/visual-evidence.mjs';
import {
  normalizeUrl, captureTargets, boundTargets, artifactFrom, asEvidence, MAX_PAGES_PER_PROSPECT,
} from '../lib/visual-capture.mjs';
import {
  QUESTIONS, questionFor, parseVerdict, supports, VISION_TASK,
} from '../lib/visual-review.mjs';
import { TASK_TIER, modelForTask } from '../lib/ai-cost.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');

// ── Targeting: only what a claim actually needs ──────────────────────────

test('technical and rendered claims cost no pictures at all', () => {
  const targets = captureTargets([
    { key: 'insecure', url: 'https://example.com/' },
    { key: 'calendar-not-loading', url: 'https://example.com/book' },
    { key: 'no-contact', url: 'https://example.com/contact' },
  ]);
  assert.deepEqual(targets, [], 'nothing here is settled by looking');
});

test('a visual claim asks for the page it is about, on both viewports', () => {
  const [t] = captureTargets([{ key: 'cta', url: 'https://example.com/book', text: 'Nothing to click above the fold.' }]);
  assert.equal(t.url, 'https://example.com/book');
  assert.deepEqual([...t.viewports].sort(), ['desktop', 'mobile']);
});

test('a phone claim asks only for the phone', () => {
  const [t] = captureTargets([{ key: 'mobile-overflow', url: 'https://example.com/', text: 'Content runs off the screen.' }]);
  assert.deepEqual(t.viewports, [VIEWPORT.MOBILE], 'a desktop frame answers nothing here');
});

test('two claims about one page are one page to photograph', () => {
  const targets = captureTargets([
    { key: 'cta', url: 'https://example.com/book' },
    { key: 'ctas-collapse', url: 'https://example.com/book?utm=x' },
  ]);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0].keys.sort(), ['cta', 'ctas-collapse']);
});

test('one prospect cannot turn into a whole-site photoshoot', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((p) => ({ key: 'cta', url: `https://example.com/${p}` }));
  assert.equal(captureTargets(many).length, 6, 'the need is counted honestly');
  assert.equal(boundTargets(captureTargets(many)).length, MAX_PAGES_PER_PROSPECT, 'and then bounded');
  assert.ok(MAX_PAGES_PER_PROSPECT <= 3);
});

test('the same page is the same page', () => {
  assert.equal(normalizeUrl('https://Example.com/contact/?utm=1'), 'https://example.com/contact');
  assert.equal(normalizeUrl('https://example.com'), 'https://example.com/');
});

// ── The artifact ─────────────────────────────────────────────────────────

const shotBack = (over = {}) => ({
  url: 'https://example.com/book',
  viewport: 'desktop',
  capturedAt: NOW.toISOString(),
  status: 200,
  blocked: false,
  overlay: false,
  title: 'Book a call',
  storedAt: 'https://file.gobloomwired.com/shot/example-com-book-desktop-abc123',
  sha256: 'a'.repeat(64),
  bytes: 240_000,
  ...over,
});

test('an artifact records the viewport in numbers, not just a word', () => {
  const desktop = artifactFrom(shotBack(), { workspace: 'ary', prospectId: 7, runId: 'run-1' });
  assert.equal(desktop.viewportWidth, 1920);
  assert.equal(desktop.viewportHeight, 1080);
  const mobile = artifactFrom(shotBack({ viewport: 'mobile' }), { workspace: 'ary' });
  assert.equal(mobile.viewportWidth, 390);
  assert.equal(mobile.viewportHeight, 844);
  assert.equal(mobile.normalizedUrl, 'https://example.com/book');
});

test('a capture with no stored image is not visual evidence', () => {
  // It happened, and nobody can check it. Without the picture the claim cannot
  // be audited, which is the entire reason a picture is required.
  const failed = artifactFrom(shotBack({ storedAt: null, storeError: 'upload failed 500' }), { workspace: 'ary' });
  assert.equal(asEvidence(failed).tier, EVIDENCE.RENDERED);
  assert.equal(failed.storeError, 'upload failed 500');
  assert.equal(asEvidence(artifactFrom(shotBack(), { workspace: 'ary' })).tier, EVIDENCE.VISUAL);
});

test('a blocked page is recorded rather than discarded, and proves nothing', () => {
  const blocked = artifactFrom(shotBack({ blocked: true, status: 403, title: 'Just a moment...' }), { workspace: 'ary' });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.httpStatus, 403);
  const v = validateClaim(
    { key: 'cta', url: 'https://example.com/book', text: 'Nothing to click.' },
    [{ ...asEvidence(blocked), supportsKeys: ['cta'] }],
    { now: NOW }
  );
  assert.equal(v.ok, false);
  assert.match(v.reason, /blocked or showed a challenge/);
});

test('a naturally appearing popup is recorded, never dismissed first', () => {
  assert.equal(artifactFrom(shotBack({ overlay: true }), { workspace: 'ary' }).overlay, true);
  const src = readFileSync(new URL('../services/audit-render/capture.mjs', import.meta.url), 'utf8');
  const shots = src.slice(src.indexOf('async function shootOne'));
  assert.ok(!shots.includes('sweepOverlays'), 'the shutter must not clear the page first');
  assert.ok(!shots.includes('dismissOverlays'), 'a photograph of a page nobody sees is not evidence');
});

// ── The questions ────────────────────────────────────────────────────────

test('every question is closed and about what is on screen', () => {
  for (const [key, q] of Object.entries(QUESTIONS)) {
    assert.ok(q.ask.length > 20, `${key} has no real question`);
    assert.ok(Object.values(CLAIM).includes(q.category), `${key} has no claim category`);
    for (const vague of ['what is wrong', 'anything wrong', 'improve', 'better', 'how good']) {
      assert.ok(!q.ask.toLowerCase().includes(vague), `${key} asks for opinion, not evidence`);
    }
  }
  assert.equal(questionFor('nothing-like-this'), null);
});

test('the model is told to record, not to consult', () => {
  const src = readFileSync(new URL('../lib/visual-review.mjs', import.meta.url), 'utf8');
  assert.match(src, /Do not comment on design quality/);
  assert.match(src, /Do not suggest improvements/);
  assert.match(src, /"unclear" is a correct answer/);
});

// ── The verdict ──────────────────────────────────────────────────────────

test('a verdict is structured, and anything unparseable is unclear', () => {
  const good = parseVerdict('{"answer":"no","visible":"","observation":"No action is visible.","confidence":"high"}');
  assert.equal(good.answer, 'no');
  assert.equal(good.confidence, 'high');
  assert.equal(good.parsed, true);

  for (const junk of ['', 'I think the page looks fine', '{broken', null]) {
    const v = parseVerdict(junk);
    assert.equal(v.answer, 'unclear', `"${junk}" must not become an answer`);
    assert.equal(v.parsed, false);
  }
  // A model inventing its own answer word does not get one.
  assert.equal(parseVerdict('{"answer":"probably"}').answer, 'unclear');
});

test('support runs the right way round for each finding', () => {
  // The polarity is the part that would silently turn this into a rubber stamp.
  // `cta` claims there is NOTHING to click, so a "no" supports it.
  assert.equal(supports('cta', { answer: 'no', confidence: 'high' }), true);
  assert.equal(supports('cta', { answer: 'yes', confidence: 'high' }), false);
  // The others claim a thing IS there.
  assert.equal(supports('ctas-collapse', { answer: 'yes', confidence: 'high' }), true);
  assert.equal(supports('mobile-overflow', { answer: 'yes', confidence: 'medium' }), true);
  assert.equal(supports('mobile-overflow', { answer: 'no', confidence: 'high' }), false);
});

test('an unclear or unconfident look never supports a claim', () => {
  assert.equal(supports('cta', { answer: 'unclear', confidence: 'high' }), false);
  assert.equal(supports('cta', { answer: 'no', confidence: 'low' }), false, 'a guess is the geometry heuristic again');
});

// ── Cost ─────────────────────────────────────────────────────────────────

test('looking at a screenshot gets the workspace model, not the cheap one', () => {
  // This asserted the opposite until the cheap tier was challenged. Haiku 4.5
  // predates high-resolution vision and caps images at 1568px, so a 1920px
  // desktop capture lost about a fifth of its detail before the model saw it —
  // and small buttons and thin nav links are the whole question.
  assert.equal(TASK_TIER[VISION_TASK], 'standard');
  assert.equal(modelForTask(VISION_TASK, 'claude-sonnet-5'), 'claude-sonnet-5');
  // The configured model stays the ceiling: a workspace on Sonnet never
  // silently gets Opus because one task would like it.
  assert.equal(modelForTask(VISION_TASK, 'claude-opus-5'), 'claude-opus-5');
});

test('the model is handed image bytes, never a link to fetch', () => {
  // This asserted the opposite until the first real production run, where both
  // screenshots came back "Unable to download the file" while those exact URLs
  // served 200 and the right byte count from everywhere else. Whatever refuses
  // that fetch is not reachable from here, so the bytes travel instead.
  //
  // Comments stripped: the file explains the history, and a scan that cannot
  // tell an explanation from code fails on the explanation.
  const src = readFileSync(new URL('../lib/ai-call.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /type: 'base64'/, 'the image block carries data');
  assert.match(src, /media_type: img\.mediaType \|\| 'image\/png'/, 'with a real media type');
  assert.ok(!/type: 'url'/.test(src), 'and never asks Anthropic to go and fetch one');
});

test('bytes that disagree with the recorded hash are never looked at', () => {
  const src = readFileSync(new URL('../lib/visual-review.mjs', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function imageBytes'), src.indexOf('// Look at one artifact'));
  assert.match(fn, /crypto\.subtle\.digest\('SHA-256'/, 'the fetched bytes are hashed');
  assert.match(fn, /does not match the hash that was recorded/, 'and a mismatch throws');
  assert.match(fn, /startsWith\('image\/'\)/, 'an error page served as 200 is not an image');
  assert.match(fn, /is empty/, 'nor is zero bytes');
  // The hash is passed in from the artifact rather than recomputed and trusted.
  assert.match(src, /expectSha256: artifact\.sha256/);
});

test('a picture that cannot be fetched stops before the model', () => {
  const src = readFileSync(new URL('../lib/visual-review.mjs', import.meta.url), 'utf8');
  // imageBytes throws, and it is awaited BEFORE askBackground — so a fetch
  // failure can never produce a verdict, and a verdict is what supports a claim.
  assert.ok(src.indexOf('await imageBytes(') < src.indexOf('await askBackground('));
});

// ── Safety ───────────────────────────────────────────────────────────────

test('capture clicks nothing and submits nothing', () => {
  const src = readFileSync(new URL('../services/audit-render/capture.mjs', import.meta.url), 'utf8');
  const shots = src.slice(src.indexOf('async function shootOne'));
  for (const forbidden of ['.click(', '.fill(', '.type(', 'submit', 'press(']) {
    assert.ok(!shots.includes(forbidden), `the shutter must never ${forbidden}`);
  }
});

test('nothing in the visual path can send or queue', () => {
  for (const f of ['../lib/visual-capture.mjs', '../lib/visual-review.mjs', '../lib/visual-evidence.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'DELETE ']) {
      assert.ok(!src.includes(forbidden), `${f} must never ${forbidden}`);
    }
  }
});
