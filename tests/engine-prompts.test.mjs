import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScoringPrompt,
  buildVerdictPrompt,
  buildVerdictParts,
  buildMessageWriterPrompt,
  buildMessageWriterParts,
  parseScoringResult,
  DEFAULT_ENGINE_SETTINGS,
  LEAD_PLATFORMS,
  LEAD_STATUSES,
} from '../lib/engine-prompts.mjs';

test('constants have the expected shape', () => {
  assert.ok(LEAD_PLATFORMS.includes('Facebook'));
  assert.ok(LEAD_STATUSES.includes('promoted'));
  assert.ok(Array.isArray(DEFAULT_ENGINE_SETTINGS.greenRules));
  assert.ok(DEFAULT_ENGINE_SETTINGS.greenRules.length >= 3);
});

test('buildScoringPrompt includes offer, rules, post text, and the JSON instruction', () => {
  const settings = {
    ...DEFAULT_ENGINE_SETTINGS,
    offer: 'social media management',
    greenRules: ['asking for help'],
    redRules: ['scam'],
  };
  const lead = { platform: 'Facebook', post_url: 'https://fb.com/p/1', post_text: 'Need someone to run my IG' };
  const prompt = buildScoringPrompt(settings, lead);
  assert.match(prompt, /social media management/);
  assert.match(prompt, /- asking for help/);
  assert.match(prompt, /- scam/);
  assert.match(prompt, /Need someone to run my IG/);
  assert.match(prompt, /"verdict"/);
  assert.match(prompt, /suggested_first_line/);
});

test('buildScoringPrompt tolerates missing settings fields', () => {
  const prompt = buildScoringPrompt({}, { post_text: 'hello' });
  assert.match(prompt, /hello/);
  assert.match(prompt, /GREEN signals/);
});

test('parseScoringResult: clean JSON', () => {
  const res = parseScoringResult(
    '{"verdict":"green","reasons":["hiring now"],"confidence":"high","suggested_first_line":"Saw your post about IG"}'
  );
  assert.equal(res.ok, true);
  assert.equal(res.data.verdict, 'green');
  assert.deepEqual(res.data.reasons, ['hiring now']);
  assert.equal(res.data.confidence, 'high');
  assert.equal(res.data.suggestedFirstLine, 'Saw your post about IG');
});

test('parseScoringResult: markdown-fenced JSON', () => {
  const res = parseScoringResult('```json\n{"verdict":"red","reasons":["another provider advertising"]}\n```');
  assert.equal(res.ok, true);
  assert.equal(res.data.verdict, 'red');
});

test('parseScoringResult: chatty preamble before JSON', () => {
  const res = parseScoringResult(
    'Sure! Based on your rules, here is my assessment:\n{"verdict":"green","reasons":["asking for rates"],"confidence":"low"}'
  );
  assert.equal(res.ok, true);
  assert.equal(res.data.verdict, 'green');
  assert.equal(res.data.confidence, 'low');
});

test('parseScoringResult: garbage input fails cleanly', () => {
  const res = parseScoringResult('I think this lead looks pretty good overall, go for it!');
  assert.equal(res.ok, false);
  assert.ok(res.error.length > 0);
});

test('parseScoringResult: JSON with invalid verdict fails cleanly', () => {
  const res = parseScoringResult('{"verdict":"maybe","reasons":[]}');
  assert.equal(res.ok, false);
});

test('parseScoringResult: empty input fails cleanly', () => {
  const res = parseScoringResult('');
  assert.equal(res.ok, false);
});

test('buildVerdictPrompt routes ads to the ad rubric, posts to the post rubric', () => {
  const ad = buildVerdictPrompt({}, { lead_kind: 'ad', post_text: 'x' });
  assert.ok(ad.includes('PAYING to run Facebook ads'), 'ad lead gets the ad rubric');
  const post = buildVerdictPrompt({}, { lead_kind: 'post', post_text: 'x' });
  assert.ok(post.includes('social media post'), 'post lead gets the post rubric');
  assert.ok(!post.includes('PAYING to run Facebook ads'));
});

test('parts builders join back to the exact one-string prompts', () => {
  const settings = {
    offer: 'web design', audience: 'coaches',
    voiceSamples: ['hey! loved your post'], positioning: 'I fix booking flows',
  };
  const post = { platform: 'Facebook', post_text: 'need a website person', post_url: 'https://fb.com/x', lead_kind: 'post' };
  const ad = { ...post, lead_kind: 'ad', author_name: 'Sam', dest_url: 'https://x.com' };

  const sp = buildVerdictParts(settings, post);
  assert.equal(`${sp.system}\n\n${sp.user}`, buildVerdictPrompt(settings, post));
  const ap = buildVerdictParts(settings, ad);
  assert.equal(`${ap.system}\n\n${ap.user}`, buildVerdictPrompt(settings, ad));
  const wp = buildMessageWriterParts(settings, post);
  assert.equal(`${wp.system}\n${wp.user}`, buildMessageWriterPrompt(settings, post));

  // The whole point of the split: the system half is lead-independent.
  const other = buildVerdictParts(settings, { ...post, post_text: 'different post' });
  assert.equal(sp.system, other.system);
})
