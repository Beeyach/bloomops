// The screens, not the router.
//
// The routing pass proved the app knows what is happening with every prospect.
// This one is about whether a person can see it: what Today shows and what it
// refuses to show, which six lists Prospects offers, what a row leads with, and
// what has been moved behind a closed disclosure.
//
// Written against the pure modules wherever possible, and against the rendered
// components where the guarantee is about what reaches a screen.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { todaySections, NEEDS_YOU_LIMIT, DUE_LIMIT, UPCOMING_PREVIEW } from '../lib/today-sections.mjs';
import { TABS, classify, tabCounts, inTab, actionFilters } from '../lib/prospect-tabs.mjs';
import { VIEW, PILE, prospectActionState } from '../lib/prospect-action.mjs';
import { isInternalTest, withoutInternalTest } from '../lib/canary.mjs';
import { listIdentity } from '../lib/row-identity.mjs';
import { systemDetails } from '../lib/system-details.mjs';
import { cachedActionState } from '../lib/prospect-state-cache.mjs';

const iso = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// A prospect that has had exactly one email, N days ago. P1 spacing puts Email
// 2 four days later, so -9 is overdue and -1 is not due yet.
const oneSent = (id, daysAgo) => ({
  id, name: `Person ${id}`, business_name: `Business ${id}`, country: 'AU',
  email: `p${id}@example.com`, rating: '💚', stage: 'Email 1',
  emails_sent: 1, last_contact_date: iso(-daysAgo),
});

const noAddress = (id) => ({ id, business_name: `Untouched ${id}`, stage: 'New', emails_sent: 0 });
const finished = (id) => ({
  id, business_name: `Done ${id}`, email: `d${id}@example.com`, rating: '💚',
  stage: 'Email 5', emails_sent: 5, last_contact_date: iso(-40),
});
const replied = (id) => ({
  id, name: `Talker ${id}`, business_name: `Talking ${id}`, email: `t${id}@example.com`,
  rating: '💚', stage: 'Email 2', emails_sent: 2, replied: 1, reply_type: 'interested',
  last_contact_date: iso(-3),
});
const lostAddress = (id) => ({
  id, business_name: `Lost ${id}`, rating: '💚', stage: 'Email 1',
  emails_sent: 1, last_contact_date: iso(-9),
});
const canary = () => ({
  id: 6567, name: 'Ary Lombres', business_name: 'LTB canary',
  email: 'ary@example.com', domain: 'example.invalid', source: 'canary',
  stage: 'Email 1', emails_sent: 1, last_contact_date: iso(-9),
});

// ── Today shows a day's work, not the database ───────────────────────────

test('Today refuses the two piles that are not work', () => {
  const rows = [
    ...Array.from({ length: 30 }, (_, i) => noAddress(100 + i)),
    ...Array.from({ length: 30 }, (_, i) => finished(200 + i)),
    oneSent(1, 9),
  ];
  const s = todaySections(rows);

  assert.equal(s.needsYou.total, 0, 'nobody wrote back');
  assert.equal(s.followups.due.total, 1, 'the one real follow-up is there');
  // 60 rows of inventory and history reached the page as nothing at all.
  assert.equal(s.attention.total, 0);
  const drawn = s.needsYou.rows.length + s.followups.due.rows.length
    + s.followups.upcoming.rows.length;
  assert.equal(drawn, 1, 'one row drawn out of sixty-one');
});

test('the exception pile is counted, never listed', () => {
  const rows = Array.from({ length: 220 }, (_, i) => lostAddress(300 + i));
  const s = todaySections(rows);

  assert.equal(s.attention.total, 220);
  assert.deepEqual(s.attention.kinds.map((k) => k.label), ['Needs email address']);
  assert.equal(s.attention.kinds[0].count, 220);
  // The section carries counts and hints, and no rows at all.
  for (const k of s.attention.kinds) {
    assert.ok(!('rows' in k), 'a summary line has no rows to render');
    assert.ok(k.hint, 'and it says what the problem is, in words');
  }
});

test('a long pile is capped and says how many are hidden', () => {
  const many = Array.from({ length: 40 }, (_, i) => replied(400 + i));
  const s = todaySections(many);
  assert.equal(s.needsYou.total, 40);
  assert.equal(s.needsYou.rows.length, NEEDS_YOU_LIMIT);
  assert.equal(s.needsYou.hidden, 40 - NEEDS_YOU_LIMIT);
});

test('coming up is a number and three rows, not thirty-two rows', () => {
  const soon = Array.from({ length: 32 }, (_, i) => oneSent(500 + i, 1));
  const s = todaySections(soon);
  assert.equal(s.followups.upcoming.total, 32);
  assert.equal(s.followups.upcoming.rows.length, UPCOMING_PREVIEW);
  assert.equal(s.followups.upcoming.hidden, 32 - UPCOMING_PREVIEW);
  assert.ok(s.followups.upcoming.withinDays >= 1, 'and it says how far ahead it looked');
});

test('due follow-ups are capped too, longest overdue first', () => {
  const due = Array.from({ length: 20 }, (_, i) => oneSent(600 + i, 6 + i));
  const s = todaySections(due);
  assert.equal(s.followups.due.total, 20);
  assert.equal(s.followups.due.rows.length, DUE_LIMIT);
  const overdue = s.followups.due.rows.map((r) => r.state.schedule.overdueDays);
  assert.deepEqual([...overdue].sort((a, b) => b - a), overdue, 'worst waits get the visible slots');
});

test('the exception queue claims a prospect and Today does not repeat them', () => {
  const p = replied(1);
  const withoutSkip = todaySections([p]);
  assert.equal(withoutSkip.needsYou.total, 1);
  const withSkip = todaySections([p], { skip: new Set([1]) });
  assert.equal(withSkip.needsYou.total, 0, 'the server already has them');
});

// ── The internal test row ────────────────────────────────────────────────

test('the canary is recognised without a migration', () => {
  assert.ok(isInternalTest(canary()), 'source = canary is the marker that already existed');
  assert.ok(isInternalTest({ domain: 'example.invalid' }), 'so is a domain nobody can own');
  assert.ok(!isInternalTest(oneSent(1, 9)), 'and a real prospect is not one');
  assert.equal(withoutInternalTest([canary(), oneSent(1, 9)]).length, 1);
});

test('the canary is not work, and is not hidden either', () => {
  const s = todaySections([canary(), oneSent(1, 9)]);
  assert.equal(s.followups.due.total, 1, 'the test row is not a follow-up to do');

  const rows = [canary(), oneSent(1, 9)];
  const c = classify(rows);
  const counts = tabCounts(rows, c);
  assert.equal(counts[VIEW.ALL], 1, 'and it is out of every count');
  // Out of every list too, so no number on the screen is one higher than the
  // work actually is. Search is the way back to it.
  for (const t of TABS) assert.ok(!inTab(canary(), c, t.id), `the test row is not in ${t.label}`);
});

// ── Six lists, and what belongs in each ──────────────────────────────────

test('there are exactly six lists and none of them is a stage', () => {
  assert.equal(TABS.length, 6);
  // Chapter 8 reordered them by urgency and pushed All to the end. Same six
  // questions; the one that wants something from you is simply first now.
  assert.deepEqual(TABS.map((t) => t.label),
    ['Needs attention', 'Replied', 'In outreach', 'Not contacted', 'Finished', 'All']);
  assert.equal(TABS[TABS.length - 1].label, 'All', 'browse-everything is last');
  for (const t of TABS) {
    assert.ok(!/Email \d/.test(t.label), `"${t.label}" is a stage, not a question`);
    assert.ok(t.blurb, 'every tab says what it holds');
  }
});

test('every prospect lands in exactly one tab, and the counts add up', () => {
  const rows = [
    noAddress(1), oneSent(2, 9), oneSent(3, 1), replied(4), lostAddress(5), finished(6),
  ];
  const c = classify(rows);
  const counts = tabCounts(rows, c);

  const inSome = rows.map((p) => TABS.filter((t) => t.id !== VIEW.ALL && inTab(p, c, t.id)).length);
  assert.deepEqual(inSome, [1, 1, 1, 1, 1, 1], 'one tab each, never two, never none');

  const sum = TABS.filter((t) => t.id !== VIEW.ALL).reduce((n, t) => n + counts[t.id], 0);
  assert.equal(sum, counts[VIEW.ALL], 'the six numbers reconcile');
});

test('In outreach holds only live cold outreach', () => {
  const rows = [finished(1), replied(2), lostAddress(3), noAddress(4), oneSent(5, 9), oneSent(6, 1)];
  const c = classify(rows);
  const live = rows.filter((p) => inTab(p, c, VIEW.IN_OUTREACH)).map((p) => p.id);
  assert.deepEqual(live, [5, 6], 'finished, replied, timing-unknown and untouched all sit elsewhere');
});

test('a written first email waiting on approval is Not contacted, not In outreach', () => {
  const p = { id: 1, business_name: 'Ready Co', email: 'r@example.com', stage: 'Validated', emails_sent: 0 };
  const state = prospectActionState(p, { readyPackages: 1 });
  assert.equal(state.pile, PILE.READY);
  const c = classify([p]);
  // classify runs without package counts, so this asserts the mapping directly.
  assert.equal(inTab(p, c, VIEW.NOT_CONTACTED), true);
});

test('the narrowing chips are built from the rows, never from a fixed list', () => {
  const rows = [oneSent(1, 9), oneSent(2, 9), lostAddress(3)];
  const c = classify(rows);
  const filters = actionFilters(rows, c);
  assert.deepEqual(filters, [
    { label: 'Email 2 due', count: 2 },
    { label: 'Needs email address', count: 1 },
  ]);
  for (const f of filters) assert.ok(!/_/.test(f.label), `"${f.label}" is an enum`);
});

// ── What a row leads with ────────────────────────────────────────────────

test('the business is the biggest thing in a row', () => {
  const id = listIdentity(
    { name: 'Mary', business_name: 'Peak Development Strategies', country: 'AU' },
    { countryLabel: (c) => ({ AU: 'Australia' })[c] }
  );
  assert.equal(id.primary, 'Peak Development Strategies');
  assert.equal(id.secondary, 'Mary · Australia');
});

test('a row never says the same name twice', () => {
  const id = listIdentity({ name: 'A Merry Mind', business_name: 'A Merry Mind', country: 'US' });
  assert.equal(id.primary, 'A Merry Mind');
  assert.equal(id.secondary, 'US', 'the person line is dropped, not duplicated');
});

test('a business with no person still identifies itself', () => {
  assert.equal(listIdentity({ business_name: 'Old Row' }).primary, 'Old Row');
  assert.equal(listIdentity({ business_name: 'Old Row' }).secondary, null);
  assert.equal(listIdentity({ name: 'Solo Trader' }).primary, 'Solo Trader');
});

test('the row context carries no jargon', () => {
  const s = prospectActionState(oneSent(1, 9), {});
  assert.match(s.context, /1 email sent/);
  assert.ok(!/\bP[123]\b/.test(s.context), 'the priority band is explained in words elsewhere');
  assert.ok(!/Never contacted · last contact/.test(s.context), 'and it never contradicts itself');
});

test('a row with a last-contact date but no sends says which it was', () => {
  const s = prospectActionState({ id: 1, email: 'a@b.c', emails_sent: 0, last_contact_date: iso(-3) }, {});
  assert.match(s.context, /No emails sent yet/);
});

test('the rendered row shows the action, never the stage', async () => {
  const { default: ProspectListRow } = await import('../components/ProspectListRow.jsx');
  const p = { ...oneSent(1, 9), stage: 'Email 5' };
  const html = renderToString(React.createElement(ProspectListRow, {
    prospect: p, state: prospectActionState(p, {}), onOpen: () => {},
  })).replace(/<!--.*?-->/g, '');

  assert.ok(html.includes('Business 1'), 'business renders');
  assert.ok(html.includes('Person 1'), 'person renders');
  assert.ok(html.includes('Email 2 due'), 'the action renders');
  assert.ok(!html.includes('Email 5'), 'the stage does not');
  for (const leak of ['prospect_id', 'package_id', 'provider_thread', 'fingerprint', 'FINGERPRINT', 'UNCLEAR', 'HOLD_']) {
    assert.ok(!html.includes(leak), `"${leak}" must never reach a list row`);
  }
});

test('the internal test row says so on its face', async () => {
  const { default: ProspectListRow } = await import('../components/ProspectListRow.jsx');
  const c = canary();
  const html = renderToString(React.createElement(ProspectListRow, {
    prospect: c, state: prospectActionState(c, {}), onOpen: () => {},
  }));
  assert.ok(html.includes('Internal test'));
});

// ── Where the technical record went ──────────────────────────────────────

test('System details holds the identifiers a row must not', () => {
  const groups = systemDetails(oneSent(1, 9), {
    state: prospectActionState(oneSent(1, 9), {}),
    sends: [{ id: 12, sequence_step: 1, sent_at: '2026-07-11T09:00:00Z', package_id: 14,
      provider_message_id: 'abc123', provider_thread_id: '199c', approval_fingerprint: 'ff00' }],
    packages: [{ id: 14, version: 2, status: 'APPROVED' }],
    jobs: [{ id: 3, kind: 'prepare-outreach', status: 'waiting', error_kind: 'human' }],
  });
  const flat = groups.flatMap((g) => g.rows.map((r) => `${r.label}=${r.value}`)).join('|');
  for (const needed of ['Prospect id=1', 'Internal stage=Email 1', 'Send event id=12', 'Package id=14',
    'Provider message id=abc123', 'Provider thread id=199c', 'Approval fingerprint=ff00',
    'Queue status=waiting', 'Schedule status=']) {
    assert.ok(flat.includes(needed), `System details lost "${needed}"`);
  }
});

test('System details prints nothing rather than a screen of empty labels', () => {
  const groups = systemDetails({ id: 9 }, {});
  assert.equal(groups.length, 1, 'only the record group');
  for (const r of groups[0].rows) assert.ok(r.value !== '' && r.value != null);
});

test('the disclosure is closed until somebody opens it', () => {
  const src = readFileSync(new URL('../components/SystemDetails.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes('<details'), 'it is a disclosure');
  assert.ok(!/<details[^>]*\bopen\b/.test(src), 'and it does not start open');
});

// ── The Replied pile says what the relationship is ───────────────────────

test('a replied prospect is labelled by the relationship, not by "reply"', () => {
  // Thirty-six people in production sit at the old "Rejected" stage and are
  // routed to Needs-you because they wrote back. Calling all of them "Needs
  // your reply" says they are waiting on Ary, and they are not.
  const said = (stage) => prospectActionState(
    { id: 1, business_name: 'B', email: 'a@b.c', stage, emails_sent: 2, replied: 1,
      last_contact_date: iso(-4) }, {}).label;

  assert.equal(said('Rejected'), 'Not interested');
  assert.equal(said('Interested'), 'Interested');
  assert.equal(said('Snoozed'), 'Deferred');
  assert.equal(said('Lost'), 'Lost');
  // Nothing to recover from, but the row says a person wrote: that is a reply
  // nobody has read yet, which is what AMBIGUOUS means.
  assert.equal(said('Email 2'), 'Replied, needs you');
});

test('recovering the label does not move anybody between piles', () => {
  for (const stage of ['Rejected', 'Interested', 'Snoozed', 'Lost', 'Email 2', 'Client']) {
    const s = prospectActionState(
      { id: 1, business_name: 'B', email: 'a@b.c', stage, emails_sent: 2, replied: 1,
        last_contact_date: iso(-4) }, {});
    assert.equal(s.pile, PILE.NEEDS_YOU, `${stage} changed pile`);
  }
});

// ── The cost of asking ───────────────────────────────────────────────────

test('the same row is only worked out once', () => {
  const p = oneSent(1, 9);
  const first = cachedActionState(p);
  assert.equal(cachedActionState(p), first, 'the same object gets the same answer object');
  // The store replaces one row and keeps the identity of the rest, so an edit
  // must cost one recomputation rather than 5,814.
  const edited = { ...p, rating: '💙' };
  assert.notEqual(cachedActionState(edited), first, 'a changed row is a new answer');
  assert.equal(cachedActionState(p), first, 'and the untouched ones keep theirs');
});

test('classifying a big list twice costs almost nothing the second time', () => {
  const rows = Array.from({ length: 2000 }, (_, i) => oneSent(1000 + i, 3 + (i % 12)));
  const t0 = process.hrtime.bigint();
  classify(rows);
  const cold = Number(process.hrtime.bigint() - t0);
  const t1 = process.hrtime.bigint();
  classify(rows);
  const warm = Number(process.hrtime.bigint() - t1);
  assert.ok(warm * 3 < cold, `second pass ${warm}ns is not meaningfully cheaper than ${cold}ns`);
});

// ── What this pass was not allowed to do ─────────────────────────────────

test('nothing added here can send, queue or write a prospect', () => {
  const files = [
    '../lib/today-sections.mjs', '../lib/prospect-tabs.mjs', '../lib/system-details.mjs',
    '../lib/canary.mjs', '../components/ProspectListRow.jsx', '../components/ProspectTabs.jsx',
    '../components/ProspectHeadline.jsx', '../components/SystemDetails.jsx',
    '../components/OutreachHistory.jsx', '../components/NeedsAttention.jsx',
  ];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'DELETE ',
      'askBackground', 'anthropic', 'callAI', "method: 'POST'", "method: 'PUT'", "method: 'PATCH'"]) {
      assert.ok(!src.includes(forbidden), `${f} must never ${forbidden}`);
    }
  }
});

test('the outreach read is a read', () => {
  const src = readFileSync(new URL('../app/api/prospects/[id]/outreach/route.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['INSERT', 'UPDATE', 'DELETE', 'export async function POST']) {
    assert.ok(!src.includes(forbidden), `the outreach route must never ${forbidden}`);
  }
});

// Comments are stripped first. Both files talk ABOUT the wording they must not
// use ("not 'queued', not 'sends itself'"), and a scan that cannot tell an
// explanation from a string fails on the explanation.
const code = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('Today never promises a send that cannot happen while the switches are off', () => {
  for (const f of ['../components/Followups.jsx', '../components/TodayView.jsx']) {
    const src = code(f);
    for (const lie of ['Sends itself', 'sends itself', 'Ready to auto-send', 'auto-send']) {
      assert.ok(!src.includes(lie), `${f} says "${lie}" while nothing sends automatically`);
    }
  }
});

test('Today no longer leads with the cadence or the import pile', () => {
  const src = code('../components/TodayView.jsx');
  for (const gone of ['groupByDue', 'unscheduledActive', 'On the cadence', 'Needs a date', 'StageChip']) {
    assert.ok(!src.includes(gone), `"${gone}" was the old stage-led Today`);
  }
});
