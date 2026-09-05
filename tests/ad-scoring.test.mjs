import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScoringPrompt, buildAdScoringPrompt, buildVerdictPrompt } from '../lib/engine-prompts.mjs';

const settings = {
  offer: 'Booking and follow-up systems',
  audience: 'Coaches, therapists, med spas',
  redRules: ['the post sells instead of asks: we help, our team', 'ends on a call to action instead of a question'],
  greenRules: ['inquiries going cold before they book'],
};

const adLead = {
  lead_kind: 'ad',
  platform: 'Facebook',
  author_name: 'Bright Path Therapy',
  post_text: 'Book your free consult today. Link in bio. Limited spots this month.',
  dest_url: 'https://brightpaththerapy.com/book',
};

test('ad prompt tells the model it is looking at an advertisement', () => {
  const p = buildAdScoringPrompt(settings, adLead);
  assert.match(p, /advertisement/i);
});

test('ad prompt says the ad copy itself is not a red flag', () => {
  const p = buildAdScoringPrompt(settings, adLead);
  // The whole bug: sales language in an ad is expected, not disqualifying.
  assert.match(p, /not a red flag|do not treat|expected/i);
});

test('ad prompt does NOT inherit the post red rules', () => {
  const p = buildAdScoringPrompt(settings, adLead);
  // These would mark every ad red, since ads sell by definition.
  assert.ok(!p.includes('the post sells instead of asks'), 'post rule leaked into ad prompt');
  assert.ok(!p.includes('ends on a call to action instead of a question'), 'post rule leaked into ad prompt');
});

test('post prompt still DOES use the red rules', () => {
  const p = buildScoringPrompt(settings, { post_text: 'anyone know a good booking system' });
  assert.ok(p.includes('the post sells instead of asks: we help, our team'));
});

test('ad prompt carries the offer and audience', () => {
  const p = buildAdScoringPrompt(settings, adLead);
  assert.ok(p.includes('Booking and follow-up systems'));
  assert.ok(p.includes('Coaches, therapists, med spas'));
});

test('ad prompt includes the landing page when captured', () => {
  const p = buildAdScoringPrompt(settings, adLead);
  assert.ok(p.includes('https://brightpaththerapy.com/book'));
});

test('ad prompt survives a missing landing page', () => {
  const p = buildAdScoringPrompt(settings, { ...adLead, dest_url: null });
  assert.ok(p.length > 0);
  assert.ok(!p.includes('null'));
});

test('ad prompt asks for the same JSON contract as the post prompt', () => {
  const p = buildAdScoringPrompt(settings, adLead);
  assert.match(p, /"verdict"/);
  assert.match(p, /suggested_first_line/);
});

test('buildVerdictPrompt routes ad leads to the ad rubric', () => {
  const ad = buildVerdictPrompt(settings, adLead);
  assert.match(ad, /advertisement/i);
});

test('buildVerdictPrompt routes normal leads to the post rubric', () => {
  const post = buildVerdictPrompt(settings, { post_text: 'anyone know a good booking system' });
  assert.ok(post.includes('the post sells instead of asks: we help, our team'));
});

test('a lead with no kind is treated as a post', () => {
  const p = buildVerdictPrompt(settings, { post_text: 'help' });
  assert.ok(!/advertisement/i.test(p));
});
