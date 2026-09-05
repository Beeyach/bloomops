import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { identity, contextFor, contextHash, TASK, HASHED_FIELDS, NOT_HASHED } from '../lib/hive-context.mjs';
import { shortHash, buildEmailParts, GENERATOR_VERSION } from '../lib/outreach.mjs';
import { buildFollowupParts } from '../lib/followup-v2.mjs';
import { buildReplyCoachParts, buildContentScriptsParts } from '../lib/bee-prompts.mjs';

const ARY = {
  operatorName: 'Ary',
  businessName: 'Bloomwired',
  offer: 'fixes the form, booking, reminders and follow-up path',
  positioning: 'I help small service businesses answer every inquiry',
  audience: 'small service businesses',
  voiceSamples: ['Hi Bill. Got your email.'],
  greenRules: ['leads going cold'],
  redRules: ['looks like a scam'],
  aiKey: 'sk-ant-secret',
  aiModel: 'claude-sonnet-5',
};

// ── Identity ─────────────────────────────────────────────────────────────

test('identity reads the workspace, and says so plainly when it is blank', () => {
  assert.equal(identity(ARY).who, 'Ary, who runs Bloomwired');
  assert.equal(identity({ operatorName: 'Sam' }).who, 'Sam');
  assert.equal(identity({ businessName: 'Northgate' }).who, 'Northgate');
  // The important one. A workspace that filled in nothing must not have a
  // name invented for it, and must not stop working either.
  assert.equal(identity({}).who, 'this workspace');
  assert.equal(identity({}).operator, null);
});

// ── The leak ─────────────────────────────────────────────────────────────

test('no product prompt module names a specific person or business', () => {
  // The prompts used to open "You write one first-contact email for Ary, who
  // builds booking and follow-up systems for small businesses." That is a
  // workspace fact welded into a product module: it made the offer exist in
  // two places, and only the wrong one was editable.
  //
  // Comments are stripped first. This file's own comments quote the leak they
  // describe, and so do the modules'; a naive search finds the explanation and
  // calls it the defect. Same trap the middleware and ai-cost tests hit.
  const strip = (src) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const mod of ['outreach.mjs', 'followup.mjs', 'bee-prompts.mjs', 'playbooks.mjs', 'evidence.mjs']) {
    const src = strip(readFileSync(new URL(`../lib/${mod}`, import.meta.url), 'utf8'));
    assert.ok(!/\bAry\b/.test(src), `${mod} still names Ary outside a comment`);
    assert.ok(!/Bloomwired/.test(src), `${mod} still names Bloomwired outside a comment`);
  }
});

test('no prompt-facing string assumes the operator is a woman', () => {
  // "Ary" and "Bloomwired" were searched for and removed; "she" survived,
  // because a name search does not find a pronoun. It reached a real prompt:
  // the own-finding playbook's CTA read "Ask how they handle the thing she
  // noticed", which a second workspace would have received verbatim.
  const strip = (src) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const mod of ['outreach.mjs', 'followup.mjs', 'bee-prompts.mjs', 'playbooks.mjs', 'evidence.mjs']) {
    const src = strip(readFileSync(new URL(`../lib/${mod}`, import.meta.url), 'utf8'));
    for (const [, quoted] of src.matchAll(/'([^'\\]{12,})'/g)) {
      assert.ok(!/\b(she|her|hers|he|him|his)\b/i.test(quoted), `${mod} assumes a gender: "${quoted}"`);
    }
  }
});

test('a workspace that is not Ary gets prompts about itself', () => {
  const other = {
    operatorName: 'Dana',
    businessName: 'Northgate Studio',
    positioning: 'I set up online booking for driving instructors',
    audience: 'driving instructors',
  };
  const plan = {
    playbook: { label: 'Booking takes more steps than it needs to', cta: 'Ask how a booking reaches their calendar today.' },
    whyContact: 'Booking is a plain form.',
    evidence: [], supporting: [],
  };
  const { system, user } = buildEmailParts(other, { name: 'Pat' }, plan);
  assert.match(system, /Dana, who runs Northgate Studio/);
  assert.match(system, /CURRENT WORKSPACE OFFER: I set up online booking for driving instructors/);
  assert.match(user, /driving instructors/);
  assert.ok(!/Ary|Bloomwired|booking and follow-up systems for small businesses/.test(system + user));
});

test('every prompt that names somebody reads it from settings', () => {
  const other = { operatorName: 'Dana', businessName: 'Northgate Studio', offer: 'booking setup' };
  const built = [
    buildReplyCoachParts(other, 'ctx', 'hello').system,
    buildContentScriptsParts(other, '').system,
    buildFollowupParts(other, { name: 'Pat' }, { step: 2, ceiling: 3, firstEmail: { subject: 's', body: 'Hi Pat, your form.' } }).system,
  ];
  for (const s of built) {
    assert.match(s, /Dana/, 'the configured name is used');
    assert.ok(!/\bAry\b/.test(s));
  }
});

// ── Context minimisation ─────────────────────────────────────────────────

test('each task gets only what it declared', () => {
  // The opposite mistake to the leak, and the easy one to make while fixing
  // it: handing every call the whole Hive record.
  const outreach = contextFor(TASK.OUTREACH, ARY);
  assert.ok(outreach.voiceSamples.length, 'first contact needs the voice');
  assert.ok(outreach.audience, 'and who they sell to');

  const followup = contextFor(TASK.FOLLOWUP, ARY);
  assert.equal(followup.voiceSamples, undefined, 'a follow-up reuses the thread');
  assert.equal(followup.audience, undefined);

  const voiceNote = contextFor(TASK.VOICE_NOTE, ARY);
  assert.deepEqual(voiceNote, {}, 'turning speech into fields needs nothing about the business');

  // The qualification rules reach exactly one task.
  assert.ok(contextFor(TASK.SCORE, ARY).greenRules);
  for (const t of [TASK.OUTREACH, TASK.FOLLOWUP, TASK.CALL_PREP, TASK.PROPOSAL, TASK.BEST5]) {
    assert.equal(contextFor(t, ARY).greenRules, undefined, `${t} must not carry qualification rules`);
  }
});

test('no credential ever reaches a task context', () => {
  for (const t of Object.values(TASK)) {
    const ctx = JSON.stringify(contextFor(t, ARY));
    assert.ok(!ctx.includes('sk-ant-secret'), `${t} leaked the API key`);
  }
});

// ── The hash ─────────────────────────────────────────────────────────────

test('the hash moves when the writing could change', () => {
  const base = contextHash(ARY, shortHash);
  const changes = {
    operatorName: 'Someone Else',
    businessName: 'Another Co',
    offer: 'something different',
    positioning: 'a different sentence',
    audience: 'dentists',
    voiceSamples: ['a different message'],
    greenRules: ['a different rule'],
    redRules: ['a different rule'],
  };
  for (const [field, v] of Object.entries(changes)) {
    assert.notEqual(contextHash({ ...ARY, [field]: v }, shortHash), base, `${field} must invalidate a package`);
  }
});

test('the hash holds still for settings that cannot change a word', () => {
  const base = contextHash(ARY, shortHash);
  // Rotating a key must not invalidate every package in the database.
  for (const [field, why] of Object.entries(NOT_HASHED)) {
    const changed = contextHash({ ...ARY, [field]: 'something-else' }, shortHash);
    assert.equal(changed, base, `${field} moved the hash, and it should not: ${why}`);
  }
});

test('the hash ignores whitespace edits and key order', () => {
  const spaced = { ...ARY, offer: `  ${ARY.offer}  ` };
  assert.equal(contextHash(spaced, shortHash), contextHash(ARY, shortHash));
  const reordered = {};
  for (const k of Object.keys(ARY).reverse()) reordered[k] = ARY[k];
  assert.equal(contextHash(reordered, shortHash), contextHash(ARY, shortHash));
});

test('every hashed and excluded field is a real setting', () => {
  // A typo in either list is silent: the field simply never contributes, and
  // packages stop being invalidated by a change that should invalidate them.
  const src = readFileSync(new URL('../lib/engine-prompts.mjs', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('DEFAULT_ENGINE_SETTINGS = {'));
  for (const f of [...HASHED_FIELDS, ...Object.keys(NOT_HASHED)]) {
    assert.match(block, new RegExp(`^\\s*${f}:`, 'm'), `${f} is listed but is not a setting`);
  }
});

test('the generator version moved with the prompt', () => {
  // The prompts were rewritten in this pass. A package written by the old
  // wording and one written by the new must not be counted together later.
  assert.notEqual(GENERATOR_VERSION, 'outreach-2026-08-09.2');
});
