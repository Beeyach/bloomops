// Chapter 11A: the two things Chapter 11 said it did and had not.
//
// Its own report is the source here. It claimed the redundant Replies copy
// was handled and then said the phrase "is still on each row, no longer as a
// badge" — which is the tab's name printed under the tab. And it claimed the
// Hive emphasised the next useful step while reporting six expanded cards
// against two compact ones, which is not emphasis.
//
// Both are narrow. These tests exist so neither can quietly come back.

import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { TAB_PILES, TAB_BUCKETS, PILE_OWNER, BUCKET_OWNER } from '../lib/today-tabs.mjs';
import { TODAY_TAB_KIND, kindOf } from '../lib/semantic.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const HIVE = src('components/ArmyPanel.jsx');
const ROW = src('components/ProspectListRow.jsx');

const loadRow = async () => (await import('../components/ProspectListRow.jsx')).default;

// The row a Replies tab actually draws: the exception queue's reply bucket,
// whose headline is the phrase in question.
const replyRow = (over = {}) => ({
  prospect: { id: 7, name: 'Leo', business_name: 'Hearthside Bakery', domain: null, ...(over.prospect || {}) },
  state: { label: 'A conversation is open', context: null, tone: 'high' },
  kind: 'reply',
  tabKind: 'reply',
  waitingDays: 12,
  onOpen() {},
  ...over,
});

// ── 1-3. Miss 1: Replies stop repeating their own tab ────────────────────

test('an ordinary Replies row does not contain the phrase in any form', async () => {
  const Row = await loadRow();
  const html = renderToString(React.createElement(Row, replyRow()));
  // Not as a pill, not as a sentence, not as a subtitle, and not as a title
  // attribute either — a tooltip is still the app saying it.
  assert.ok(!html.includes('A conversation is open'), 'the phrase is absent from the markup entirely');
  assert.equal((html.match(/class="pill/g) || []).length, 0, 'and there is no pill');
});

test('the row still says who this is and how long they have waited', async () => {
  const Row = await loadRow();
  const html = renderToString(React.createElement(Row, replyRow()));
  assert.ok(html.includes('Hearthside Bakery'), 'the business is still the strongest line');
  assert.ok(html.includes('Leo'), 'and the person');
  assert.ok(html.includes('12d'), 'and the waiting age, compact');
  assert.match(html, /class="tile/, 'the message tile still says what kind of work this is');
  // The tile is what carries the meaning now, so it must be the reply glyph.
  assert.equal(kindOf(TODAY_TAB_KIND.replies).icon, 'message');
});

test('the phrase survives where it is not redundant', async () => {
  const Row = await loadRow();
  // Same row, seen from a tab that is NOT Replies: there the words are news.
  const html = renderToString(React.createElement(Row, replyRow({ tabKind: 'followup' })));
  assert.ok(html.includes('A conversation is open'), 'not deleted globally, only where it repeats');
  assert.equal((html.match(/class="pill/g) || []).length, 1);
  // And the source of the phrase is untouched, so nothing else that shows it
  // lost it either.
  assert.match(src('lib/exceptions.mjs'), /headline: 'A conversation is open'/);
});

test('nothing moved tabs to achieve this', () => {
  // The copy change is presentation only: ownership is exactly as Chapter 11
  // left it.
  // Replies later became bucket-only; see the one-source-of-truth pass.
  assert.deepEqual(TAB_PILES.replies, []);
  assert.deepEqual(TAB_BUCKETS.replies, ['replies']);
  assert.equal(PILE_OWNER.warm, 'followups');
  assert.equal(PILE_OWNER.hotViewers, 'followups');
  assert.equal(PILE_OWNER.videoReady, 'approvals');
  assert.equal(BUCKET_OWNER.deferrals, 'followups');
  assert.equal(BUCKET_OWNER.legacy, 'approvals');
});

// ── 4-8. Miss 2: one featured helper per lane ────────────────────────────

test('each lane features exactly one helper, and the rule is written down', () => {
  assert.match(HIVE, /function featuredFor\(lane\) \{/);
  assert.match(HIVE, /const featured = Object\.fromEntries\(GROUPS\.map\(\(g\) => \[g\.id, featuredFor\(g\.id\)\]\)\);/);
  // One entry per lane, and a lane can only name one helper.
  assert.match(HIVE, /const withWork = inLane\.find\(/);
  assert.match(HIVE, /const anyReady = inLane\.find\(\(e\) => readiness\(e\)\.ready\);/);
});

test('the featured helper is the earliest with real work, then the earliest that can run', () => {
  const fn = HIVE.slice(HIVE.indexOf('function featuredFor(lane)'), HIVE.indexOf('function readiness(emp)'));
  assert.match(fn, /\.sort\(\(a, b\) => a\.step - b\.step\)/, 'earliest by step');
  assert.match(fn, /r\.ready && Number\(r\.pending\) > 0/, 'real work first');
  // `pending` is only ever a count the app already had. Exactly two helpers
  // know one; none of the others is given a made-up number.
  const counts = HIVE.match(/pending: \w+\.length/g) || [];
  assert.equal(counts.length, 2, 'only the two helpers with a real count report one');
  assert.ok(!/pending: (true|1|Infinity)/.test(HIVE), 'and nobody is handed a fabricated one');
});

test('being able to run is no longer enough to be expanded', () => {
  // The old rule expanded everything that was ready.
  assert.ok(!/!r\.ready && !isRunning && !done \? \(/.test(HIVE), 'the ready-means-expanded rule is gone');
  assert.match(HIVE, /!\(emp\.id === featured\[emp\.group\] \|\| isRunning\) \? \(/);
});

test('only a run in progress may exceed the one-per-lane cap', () => {
  // `done` used to expand a helper as well, which quietly undid the cap:
  // `status` has a single writer and is never cleared, so after running
  // three helpers three cards sat open on top of the featured one. At most
  // one helper can run at a time, so the cap is now "one per lane, plus the
  // one that is actually running".
  assert.match(HIVE, /emp\.id === featured\[emp\.group\] \|\| isRunning\) \? \(/);
  assert.ok(!/featured\[emp\.group\] \|\| isRunning \|\| done/.test(HIVE), 'done no longer expands');
  // The reason `done` accumulates: exactly one call site, and it merges.
  assert.equal((HIVE.match(/setStatus\(\(prev\)/g) || []).length, 1, 'status has a single writer');
  assert.ok(!/setStatus\(\{\}\)/.test(HIVE), 'and it is never cleared');
});

test('a finished helper keeps what it had to say, in its compact row', () => {
  const from = HIVE.indexOf('!(emp.id === featured[emp.group] || isRunning) ? (');
  const compact = HIVE.slice(from, HIVE.indexOf('            ) : (', from));
  assert.match(compact, /done && st\?\.msg \? st\.msg :/, 'it reports what it did');
  assert.match(compact, /\{emp\.resultsLabel\}/, 'and still offers the results');
});

test('a compact helper keeps its action, quietly', () => {
  const from = HIVE.indexOf('!(emp.id === featured[emp.group] || isRunning) ? (');
  const compact = HIVE.slice(from, HIVE.indexOf('            ) : (', from));
  assert.ok(compact.includes('Step {emp.step}'), 'it still says where in the run it sits');
  assert.ok(compact.includes('{emp.name}'), 'and which helper it is');
  assert.ok(compact.includes('(r.text || emp.job)'), 'and a short status');
  assert.ok(!compact.includes('btn-bloom'), 'no giant call to action');
  // "No giant CTA" is about weight, not about taking the button away — a
  // helper that is compact only because something earlier is more useful can
  // still be run.
  assert.match(compact, /onClick=\{\(\) => run\(emp\)\}/, 'it can still be run');
  assert.match(compact, /\{emp\.action\}/, 'under its real action name');
});

test('a quiet day says so once', () => {
  assert.match(HIVE, /const nothingToRun = Object\.values\(featured\)\.every\(\(id\) => !id\);/);
  assert.match(HIVE, /Nothing needs running right now\./);
});

// ── 9-10. Nothing else changed ───────────────────────────────────────────

test('no helper lost functionality and no endpoint moved', () => {
  // Every employee still declares its task and its action.
  const block = HIVE.slice(HIVE.indexOf('const EMPLOYEES'), HIVE.indexOf('const GROUPS'));
  // Either quote style: one action contains an apostrophe and is written with
  // double quotes, which a single-quote-only count reads as a missing field.
  const field = (name) => (block.match(new RegExp(`\\n {4}${name}: ['"]`, 'g')) || []).length;
  assert.equal(field('task'), 8, 'all eight still have a task');
  assert.equal(field('action'), 8, 'and an action');
  assert.equal(field('job'), 8, 'and a job');
  // The workflow strip and its numbering are exactly as Chapter 11 left them.
  assert.match(HIVE, /Lead workflow<\/h3>/);
  assert.match(HIVE, /const WORKFLOW_STEPS = 5;/);
  assert.match(HIVE, /step: emp\.step/);
});

test('the row component changed only where the tab already says it', () => {
  // The suppression is still gated on the row's kind matching the tab's, so
  // no other surface lost a state line.
  assert.match(ROW, /const redundant = !!tabKind && !!kind && kind === tabKind;/);
  assert.match(ROW, /\{state\?\.label && !redundant && \(/);
  // A row with no tabKind at all — the Prospects list — is untouched.
  // The pixel review put the person, the state and the age on one line, so
  // the guard now includes the secondary identity too.
  assert.match(ROW, /\(id\.secondary \|\| \(state\?\.label && !redundant\) \|\| waitingDays != null\)/);
});

test('a Prospects row, which has no tab context, still shows its state', async () => {
  const Row = await loadRow();
  const html = renderToString(React.createElement(Row, {
    prospect: { id: 9, name: 'Tess', business_name: 'Blue Door Interiors', domain: null },
    state: { label: 'Email 2 due', context: '1 email sent', tone: 'action' },
    onOpen() {},
  }));
  assert.ok(html.includes('Email 2 due'), 'no tabKind means nothing is redundant');
  assert.equal((html.match(/class="pill/g) || []).length, 1);
});
