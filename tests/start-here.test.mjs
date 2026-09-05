// The help has to be true, and it has to stay true when a setting moves.
//
// The failure this guards against is not a broken page. It is a page that
// reads perfectly and lies: "approving never sends" printed above a workspace
// where approving does send. So most of what follows is about the sending
// panel deriving from settings rather than from a sentence somebody typed.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { sendingState, willApprovingSend, MODE } from '../lib/sending-state.mjs';
import { GLOSSARY, BUCKET_HELP, CHECKLIST, AUTOMATIC, YOURS, DAILY, FLOW } from '../lib/help-copy.mjs';
import { BUCKETS } from '../lib/today-buckets.mjs';

const load = async (name) => (await import(`../components/${name}.jsx`)).default;
// Dynamic, like every other component import here: the JSX hook is registered
// at runtime by _jsx.mjs, and a static import is resolved before it takes hold.
const navItems = async () => (await import('../components/GlassRail.jsx')).NAV;

function visibleText(html) {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

// The page fetches its settings on mount. Server rendering never runs effects,
// so the settled state is reached the same way the approval tests reach theirs:
// stub fetch, let the microtask queue drain, render again.
async function renderStartHere(settings) {
  const StartHerePage = await load('StartHerePage');
  global.fetch = async () => ({ ok: true, json: async () => ({ settings }) });
  return visibleText(renderToString(
    React.createElement(StartHerePage, { onNavigate() {}, initialSettings: settings })
  ));
}

const OFF = { autoSendApprovedFirstEmails: false, autoSendApprovedFollowups: false };
const FIRST_ON = { autoSendApprovedFirstEmails: true, autoSendApprovedFollowups: false };
const BOTH_ON = { autoSendApprovedFirstEmails: true, autoSendApprovedFollowups: true };

// ── 1, 2. The route and the way in ───────────────────────────────────────

test('Start here is a real view with a real hash', () => {
  const src = readFileSync(new URL('../components/ProspectsApp.jsx', import.meta.url), 'utf8');
  assert.match(src, /'start'/, 'the view key has to be valid or the hash resolves to nothing');
  assert.match(src, /view === 'start' \? \(\s*<StartHerePage/, 'and something has to render for it');
});

test('the navigation contains the page as Help', async () => {
  const item = (await navItems()).find((n) => n.key === 'start');
  assert.ok(item, 'a page nobody can find is a page nobody reads');
  assert.equal(item.label, 'Help', 'Chapter 1: one Help door instead of four guide entries');
  assert.equal(item.section, 'More', 'Chapter 8: reading material is behind More, not a peer of Today');
  assert.ok(item.desc, 'the hover line is the one-sentence answer for somebody who has not clicked yet');
});

test('the explanation lives behind Help in the rail, not as prose on Today', () => {
  const today = readFileSync(new URL('../components/TodayView.jsx', import.meta.url), 'utf8');
  assert.ok(!/How Today works/.test(today), 'Chapter 1 removed the explainer paragraph from the work surface');
  const links = readFileSync(new URL('../components/StartHerePage.jsx', import.meta.url), 'utf8');
  assert.match(links, /go\('guide-automation'\)/, 'and Help still reaches the deeper guides');
});

// ── 3, 4. The sections that have to exist ────────────────────────────────

test('the page carries the daily loop and the split of labour', async () => {
  const text = await renderStartHere(OFF);
  assert.match(text, /What you do each day/);
  for (const d of DAILY) assert.ok(text.includes(d.title), `missing daily step: ${d.title}`);
  assert.match(text, /What the app does, and what only you can do/);
  assert.ok(text.includes(AUTOMATIC[0].what), 'the automatic column has to list something');
  assert.ok(text.includes(YOURS[0].what), 'and so does the human one');
  for (const f of FLOW) assert.ok(text.includes(f.step), `missing model step: ${f.step}`);
});

// ── 5, 6, 7. The sending panel tells the truth about the switches ────────

test('with automatic first sending off, approving does not send', () => {
  const s = sendingState(OFF);
  assert.equal(s.first.mode, MODE.MANUAL);
  assert.equal(s.first.approvalSends, false);
  assert.equal(willApprovingSend(OFF), false);
  assert.match(s.first.detail, /Send now/, 'it has to name the press that does send');
  assert.equal(s.anythingAutomatic, false);
});

test('with automatic first sending on, the page stops saying approval is safe', () => {
  const s = sendingState(FIRST_ON);
  assert.equal(s.first.mode, MODE.AUTOMATIC);
  assert.equal(s.first.approvalSends, true);
  assert.equal(willApprovingSend(FIRST_ON), true);
  assert.ok(!/does not send/i.test(s.first.detail), 'this is the sentence that must never survive the switch');
  assert.equal(s.anythingAutomatic, true);
});

test('follow-ups have three honest states and never claim to send while off', () => {
  assert.equal(sendingState(OFF).followups.mode, MODE.WATCHING);
  assert.equal(sendingState(OFF).followups.approvalSends, false);
  assert.match(sendingState(OFF).followups.detail, /not sent/);
  assert.equal(sendingState(BOTH_ON).followups.mode, MODE.AUTOMATIC);
  assert.equal(sendingState(BOTH_ON).followups.approvalSends, true);
  // Three distinct words, so the panel can never render two states that read
  // the same.
  assert.equal(new Set([MODE.MANUAL, MODE.AUTOMATIC, MODE.WATCHING]).size, 3);
});

test('the sending panel prints exactly what sendingState says, not a copy of it', async () => {
  assert.match(await renderStartHere(OFF), /What will actually send an email/);

  // The words on the screen are the module's words, character for character.
  // Anything else and the page can drift away from the settings it claims to
  // be reading, which is the whole failure this file exists to prevent.
  for (const settings of [OFF, FIRST_ON, BOTH_ON]) {
    const text = await renderStartHere(settings);
    const s = sendingState(settings);
    assert.ok(text.includes(s.first.detail), `first-email copy not rendered for ${JSON.stringify(settings)}`);
    assert.ok(text.includes(s.followups.detail), `follow-up copy not rendered for ${JSON.stringify(settings)}`);
    assert.ok(text.includes(s.first.mode), 'the mode word itself has to be on the screen');
    assert.ok(text.includes(s.window.text), 'and so does the real window');
  }

  // The specific sentence Ary has been reading. It survives while the switch
  // is off and must be gone the moment it is on.
  assert.match(await renderStartHere(OFF), /approving a draft does not send it/i);
  assert.ok(!/approving a draft does not send it/i.test(await renderStartHere(FIRST_ON)));
});

test('the window and the caps are read, not written down', () => {
  const s = sendingState({ ...OFF, sendWindowStartHour: 9, sendWindowEndHour: 18, sendDays: [1, 2, 3, 4, 5], dailySendLimit: 7, hourlySendLimit: 2 });
  assert.equal(s.window.text, '9am to 6pm, Monday to Friday');
  assert.equal(s.caps.text, '7 a day, 2 an hour');
  const weekend = sendingState({ ...OFF, sendDays: [6, 0] });
  assert.match(weekend.window.text, /Sunday and Saturday/);
});

// ── 8, 9. The two definitions that have been getting misread ─────────────

test('Held is never described as rejected, skipped or bad', () => {
  const held = GLOSSARY.find((g) => g.term === 'Held');
  const blob = `${held.short} ${held.body} ${BUCKET_HELP.held}`.toLowerCase();
  // The word may appear, but only being denied. "Held is not a rejection" is
  // the sentence Ary needed; forbidding the word outright would have banned it.
  for (const claim of [/is rejected/, /were rejected/, /skipped/, /bad prospect/, /not worth/]) {
    assert.ok(!claim.test(blob), `Held must not be claimed to be ${claim}`);
  }
  assert.match(blob, /not a rejection/);
  assert.match(blob, /nobody has been rejected/);
  assert.match(blob, /recoverable|still worth/);
});

test('the green heart is never described as creating evidence or Strong', () => {
  const green = GLOSSARY.find((g) => g.term === '💚');
  const blob = `${green.short} ${green.body}`;
  assert.match(blob, /does not make anything true|cannot turn/i);
  const strong = GLOSSARY.find((g) => g.term === 'Strong');
  assert.match(strong.body, /not a prediction/i, 'Strong is not a forecast');
  assert.match(strong.body, /afford/i, 'and it says nothing about ability to pay');
});

test('the cross is not presented as do not contact', () => {
  const cross = GLOSSARY.find((g) => g.term === '✖️');
  assert.match(cross.body, /not the same as do not contact/i);
  assert.match(cross.body, /still get one email/i);
});

// ── 10. Empty states teach ───────────────────────────────────────────────

test('every actionable bucket says what happens next when it is empty', () => {
  for (const b of BUCKETS.filter((x) => x.alwaysShow)) {
    assert.ok(b.empty.length > 30, `${b.id} empty state is too short to say anything`);
    assert.equal(b.empty.split('. ').length >= 2, true, `${b.id} says it is empty but not what happens next`);
  }
});

test('every bucket has a why-is-this-here line and the page shows it', () => {
  for (const b of BUCKETS) {
    assert.ok(BUCKET_HELP[b.id], `no explanation for the ${b.id} bucket`);
  }
  const src = readFileSync(new URL('../components/BucketPage.jsx', import.meta.url), 'utf8');
  assert.match(src, /Why is this here\?/);
  assert.match(src, /bucketHelp\(def\.id\)/, 'read from the shared copy, not typed into the page');
});

// ── 11. The checklist is a nudge, not a gate ─────────────────────────────

test('the checklist is short, dismissible and never asks for a send', async () => {
  const Checklist = await load('OnboardingChecklist');
  assert.ok(CHECKLIST.length <= 5, 'five items is the ceiling');
  for (const c of CHECKLIST) {
    // Knowing what sends is a step. Sending is not, and never becomes one:
    // onboarding that only completes by emailing a stranger is onboarding that
    // pressures somebody into a send they have not thought about.
    const blob = `${c.title} ${c.detail} ${c.action}`;
    assert.ok(!/send (a|an|your|the|one)/i.test(blob), `onboarding must not require sending: ${c.title}`);
    assert.ok(!/send now/i.test(blob), `onboarding must not point at the send button: ${c.title}`);
  }
  const src = readFileSync(new URL('../components/OnboardingChecklist.jsx', import.meta.url), 'utf8');
  assert.match(src, /Hide this/, 'it has to be dismissible');
  assert.match(src, /dismissed: true/, 'and the dismissal has to persist');
  // Nothing about it can block: it renders as a sibling, never a wrapper.
  const html = renderToString(React.createElement(Checklist, { onNavigate() {}, prospectCount: 0 }));
  assert.equal(html, '', 'it stays hidden until the client has read the stored preference, so it can never block first paint');
});

test('an established workspace is not welcomed to an app it has used for a year', async () => {
  const Checklist = await load('OnboardingChecklist');
  const html = renderToString(React.createElement(Checklist, { onNavigate() {}, prospectCount: 900, established: true }));
  assert.equal(html, '');
});

// ── 12, 13, 14. What this pass was not allowed to do ─────────────────────

test('no help copy is generated, and nothing here calls a model', () => {
  for (const file of ['../lib/help-copy.mjs', '../lib/sending-state.mjs', '../components/StartHerePage.jsx', '../components/OnboardingChecklist.jsx', '../components/SendingSummary.jsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const forbidden of ['askBackground', 'anthropic', '/api/ai', 'callAI']) {
      assert.ok(!src.includes(forbidden), `${file} must not reach a model for help text (${forbidden})`);
    }
  }
});

test('both send switches are still off by default and nothing here changed them', () => {
  const s = sendingState({});
  assert.equal(s.first.mode, MODE.MANUAL);
  assert.equal(s.followups.mode, MODE.WATCHING);
  assert.equal(s.anythingAutomatic, false);
  // And no help component may write a setting.
  for (const file of ['../components/StartHerePage.jsx', '../components/SendingSummary.jsx', '../components/OnboardingChecklist.jsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/method:\s*'(PUT|POST|PATCH|DELETE)'/.test(src), `${file} must only read`);
  }
});

test('the help pass did not touch sending, approval or the queue', () => {
  const guard = readFileSync(new URL('../lib/send-guard.mjs', import.meta.url), 'latin1');
  assert.ok(guard.includes('AUTOMATION_OFF'), 'the guard is intact');
  const runner = readFileSync(new URL('../lib/send-runner.mjs', import.meta.url), 'utf8');
  assert.match(runner, /canSendNow/, 'sending still runs through the one guard');
  // The help modules must not be reachable from the send path at all.
  for (const file of ['../lib/send-guard.mjs', '../lib/send-runner.mjs', '../lib/send-policy.mjs']) {
    const src = readFileSync(new URL(file, import.meta.url), 'latin1');
    assert.ok(!src.includes('help-copy'), `${file} must not depend on help text`);
    assert.ok(!src.includes('sending-state'), `${file} must not depend on the explanation of itself`);
  }
});

// ── 15. Mobile ───────────────────────────────────────────────────────────

test('nothing on Start here is pinned wider than a phone', async () => {
  const src = readFileSync(new URL('../components/StartHerePage.jsx', import.meta.url), 'utf8');
  // A fixed min-width above a small phone is the usual cause of a sideways
  // scroll, and the old welcome card had one: a 560px SVG rail.
  const mins = [...src.matchAll(/min-w-\[(\d+)px\]/g)].map((m) => Number(m[1]));
  for (const w of mins) assert.ok(w <= 200, `min-w-[${w}px] will scroll a 320px screen sideways`);
  assert.ok(!/overflow-x/.test(src), 'no part of the page should need its own sideways scroller');
});

test('the retired welcome cards are gone rather than merely unmounted', () => {
  for (const gone of ['../components/Orientation.jsx', '../components/StartHere.jsx']) {
    assert.throws(() => readFileSync(new URL(gone, import.meta.url), 'utf8'), `${gone} described a workflow the app no longer has`);
  }
});
