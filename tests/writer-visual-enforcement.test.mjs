// A claim nobody can prove must not reach the email, by any route.
//
// This is the end-to-end rule, and the routes it has to hold on are the ones
// that are easy to miss. Filtering the evidence LIST is not enough: the chosen
// angle is written into the system prompt as a sentence of its own
// (`plan.whyContact`), so a visual finding that survives long enough to be
// selected has already leaked, whatever the list underneath it says.
//
// So the screening happens before selection, and these hold that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { planPackage, buildEmailParts, screenEvidence } from '../lib/outreach.mjs';
import { collectEvidence } from '../lib/evidence.mjs';
import { EVIDENCE, VIEWPORT } from '../lib/visual-evidence.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');
const SITE = 'https://kim.example';

const prospect = (keys, reasons) => ({
  id: 1,
  name: 'Kim',
  business_name: 'Kim Co',
  email: 'kim@kim.example',
  domain: 'kim.example',
  country: 'US',
  stage: 'Validated',
  rating: '💚',
  site_intel: JSON.stringify({
    worth: true, score: 6, why: 'checked',
    keys, reasons,
    checkedAt: NOW.toISOString(), source: 'precheck', pagesChecked: [SITE],
    hasForm: true,
  }),
});

// A screenshot that was taken, looked at, and backs the named findings.
const backing = (keys, over = {}) => ({
  tier: EVIDENCE.VISUAL,
  url: SITE,
  viewport: VIEWPORT.DESKTOP,
  capturedAt: NOW.toISOString(),
  blocked: false,
  supportsKeys: keys,
  ...over,
});

const ev = (p) => collectEvidence(p, { now: NOW });

// ── The list ─────────────────────────────────────────────────────────────

test('a visual finding with no picture never reaches the writer', () => {
  const p = prospect(['form-broken', 'cta'], ['The contact form is broken', 'Nothing above the fold to click']);
  const plan = planPackage(p, { now: NOW });
  assert.equal(plan.ok, true, 'the technical finding still carries the prospect');

  const said = plan.evidence.map((e) => e.key).filter(Boolean);
  assert.ok(said.includes('form-broken'));
  assert.ok(!said.includes('cta'), 'the unprovable one is gone from the evidence');

  // And gone from the prompt, which is the thing that actually matters.
  const { system, user } = buildEmailParts({ positioning: 'booking systems' }, p, plan);
  assert.ok(!user.includes('Nothing above the fold'), 'not in the evidence block');
  assert.ok(!system.includes('Nothing above the fold'), 'not in the chosen angle either');
});

test('the same finding with a supporting screenshot does reach it', () => {
  // Paired with a material finding, because a lone cosmetic one has never been
  // enough to earn an email and this pass did not change that rule.
  const p = prospect(['form-broken', 'cta'], ['The contact form is broken', 'Nothing above the fold to click']);

  const blind = planPackage(p, { now: NOW });
  assert.ok(!blind.evidence.some((e) => e.key === 'cta'), 'unproved, so it is dropped');

  const seen = planPackage(p, { now: NOW, visualEvidence: [backing(['cta'])] });
  assert.equal(seen.ok, true);
  assert.ok(seen.evidence.some((e) => e.key === 'cta'), 'proved, so it may be said');
  assert.equal(seen.unsupported.length, 0);

  // Whether the chosen playbook then cites it is a separate, older decision:
  // buildEmailParts hands the writer `plan.supporting` when the playbook named
  // a subset. That narrows further, never wider, so the guarantee holds — a
  // proved claim MAY be used, an unproved one CANNOT be.
  const proved = seen.evidence.map((e) => e.key).filter(Boolean);
  assert.ok(proved.includes('cta'));
  assert.ok(proved.includes('form-broken'));
});

// ── The angle ────────────────────────────────────────────────────────────

test('an unprovable finding cannot become the reason for writing', () => {
  // The leak this is built to stop: `whyContact` is written into the system
  // prompt as the chosen angle, so filtering after selection would put the
  // claim in the email with no evidence line under it.
  const p = prospect(['cta'], ['Nothing above the fold to click']);
  const plan = planPackage(p, { now: NOW });
  assert.equal(plan.ok, false, 'nothing provable is left to write about');
  assert.match(plan.reason, /depends on how it looks/);
  assert.equal(plan.playbook, null, 'and no angle was chosen from it');
  assert.ok(plan.unsupported.some((u) => u.key === 'cta'));
  assert.ok(!plan.evidence.some((e) => e.key === 'cta'), 'and it is not in the evidence either');
});

test('screening runs before the playbook is picked, not after', () => {
  const src = readFileSync(new URL('../lib/outreach.mjs', import.meta.url), 'utf8');
  const screenAt = src.indexOf('const screened = screenEvidence(');
  const selectAt = src.indexOf('const chosen = selectPlaybook(');
  assert.ok(screenAt > -1 && selectAt > -1);
  assert.ok(screenAt < selectAt, 'a claim that cannot be proved must not be selectable');
});

// ── What gets kept, and what never gets screened ─────────────────────────

test('a rejected claim is recorded with its reason, never silently dropped', () => {
  const p = prospect(['form-broken', 'cta', 'mobile-overflow'],
    ['The contact form is broken', 'Nothing above the fold to click', 'Content runs off the screen on a phone']);
  const plan = planPackage(p, { now: NOW });
  const dropped = plan.unsupported.map((u) => u.key).sort();
  assert.deepEqual(dropped, ['cta', 'mobile-overflow']);
  for (const u of plan.unsupported) assert.ok(u.why, 'each says why');
});

test("Ary's own notes are never screened out by a missing screenshot", () => {
  // She looked at the page herself. That is the strongest evidence in the
  // system and a camera requirement must not override a person.
  const p = prospect(['cta'], ['Nothing above the fold to click']);
  p.own_findings = JSON.stringify([{ text: 'The booking link goes to a dead Calendly', where: 'contact' }]);
  const screened = screenEvidence(ev(p), [], { now: NOW, site: SITE });
  assert.ok(screened.kept.some((e) => /dead Calendly/.test(e.text || '')), 'her note survives');
  assert.ok(screened.dropped.some((d) => d.key === 'cta'), 'the probe guess does not');
});

test('a picture of the wrong page does not rescue a claim', () => {
  const p = prospect(['cta'], ['Nothing above the fold to click']);
  const elsewhere = backing(['cta'], { url: 'https://kim.example/about' });
  assert.equal(planPackage(p, { now: NOW, visualEvidence: [elsewhere] }).ok, false);
});

test('a phone claim is not settled by a desktop frame', () => {
  const p = prospect(['form-broken', 'mobile-overflow'],
    ['The contact form is broken', 'Content runs off the screen on a phone']);
  const desktopOnly = planPackage(p, { now: NOW, visualEvidence: [backing(['mobile-overflow'])] });
  assert.ok(desktopOnly.unsupported.some((u) => u.key === 'mobile-overflow'));

  const onPhone = planPackage(p, {
    now: NOW,
    visualEvidence: [backing(['mobile-overflow'], { viewport: VIEWPORT.MOBILE })],
  });
  assert.ok(onPhone.evidence.some((e) => e.key === 'mobile-overflow'));
});

// ── Strong ───────────────────────────────────────────────────────────────

test('a prospect is still Strong on technical evidence with no pictures at all', () => {
  const p = prospect(['form-broken', 'lead-magnet-open'],
    ['The contact form is broken', 'The guide downloads with no email capture']);
  const plan = planPackage(p, { now: NOW });
  assert.equal(plan.ok, true);
  assert.equal(plan.unsupported.length, 0, 'nothing here needed a camera');
  assert.ok(plan.whyContact);
});

test('a visual failure does not become a job for Ary', () => {
  // The prospect either continues on other evidence or stops. What it must not
  // do is arrive in a human queue because a screenshot was missing.
  const p = prospect(['cta'], ['Nothing above the fold to click']);
  const plan = planPackage(p, { now: NOW });
  assert.equal(plan.ok, false);
  const words = `${plan.reason} ${JSON.stringify(plan.unsupported)}`.toLowerCase();
  for (const nag of ['please check', 'manually', 'ary', 'have a look', 'review this site']) {
    assert.ok(!words.includes(nag), `"${nag}" turns a verification failure into human work`);
  }
});

// ── Safety ───────────────────────────────────────────────────────────────

test('screening writes nothing and sends nothing', () => {
  const src = readFileSync(new URL('../lib/outreach.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'fetch(']) {
    assert.ok(!src.includes(forbidden), `the planner must never ${forbidden}`);
  }
});
