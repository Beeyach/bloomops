// "Later", with nobody having written down when.
//
// Three prospects in production said that and nothing recorded a date. They are
// not due today and they will not be due tomorrow, so they sit on Today for
// ever. Making them visible was right; leaving them unresolvable from the
// screen they are visible on was not.
//
// What these hold: the wait is only work while it has no date, a date given
// takes it off Today until that date, and no single button can quietly turn
// "later" into a rejection.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { prospectActionState, PILE, viewFor, VIEW } from '../lib/prospect-action.mjs';
import { todaySections } from '../lib/today-sections.mjs';
import { REL, currentState, CLOSED_TO_OUTREACH } from '../lib/relationship.mjs';
import { defer, isDeferred } from '../lib/deferral.mjs';
import { buildExceptionQueue } from '../lib/exceptions.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');
const iso = (d) => new Date(NOW.getTime() + d * 86400000).toISOString().slice(0, 10);

// The shape of the three real ones: parked at Snoozed, replied, no date
// anywhere — not on the row, not on an event.
const parked = (extra = {}) => ({
  id: 1, name: 'Irina Ertel', business_name: 'Nobody’s Perfect Parenting', country: 'AU',
  email: 'irina@example.com', rating: '💚', stage: 'Snoozed',
  emails_sent: 2, replied: 1, reply_type: 'defer', reply_date: iso(-31),
  last_contact_date: iso(-32), deferred_until: null, next_action_date: null, ...extra,
});

const state = (p) => prospectActionState(p, { now: NOW });
const onToday = (p) => todaySections([p], { now: NOW }).needsYou.total === 1;

// ── The wait, and whether it is work ─────────────────────────────────────

test('a wait with no date is work, and says so in words', () => {
  const s = state(parked());
  assert.equal(s.label, 'Deferred');
  assert.equal(s.relationship.state, REL.DEFERRED);
  assert.equal(s.relationship.deferredUntil, null);
  assert.equal(s.relationship.needsPerson, true);
  assert.match(s.context, /^No date was given/);
  assert.equal(onToday(parked()), true);
  // No enum, no null, no code.
  for (const text of [s.label, s.detail, s.context]) {
    assert.ok(!/DEFERRED|null|undefined/.test(text), `"${text}" leaked something internal`);
  }
});

test('a wait with a date ahead of it is not work', () => {
  assert.equal(onToday(parked({ next_action_date: iso(21) })), false);
  assert.equal(state(parked({ next_action_date: iso(21) })).relationship.needsPerson, false);
});

test('a wait whose date has come round is work again', () => {
  assert.equal(onToday(parked({ next_action_date: iso(-2) })), true);
  assert.equal(state(parked({ next_action_date: iso(-2) })).relationship.needsPerson, true);
});

test('setting a date takes them off Today until it arrives', () => {
  // What the endpoint writes, from the module that owns it.
  const d = defer({ until: iso(21) });
  assert.equal(d.ok, true);
  const after = parked({ ...d.patch });
  assert.equal(isDeferred(after), true);
  assert.equal(onToday(after), false);
  assert.match(state(after).context, /^Waiting until/);
  // And still in Replied, which is the promise the whole trim was made on.
  assert.equal(viewFor(state(after)), VIEW.REPLIED);
});

test('setting today or a past date leaves them due', () => {
  for (const day of [iso(0), iso(-5)]) {
    const after = parked({ ...defer({ until: day }).patch });
    assert.equal(onToday(after), true, `${day} should still be due`);
  }
});

test('a date is validated by the one module that owns what a date is', () => {
  for (const bad of ['', null, 'soon', 'later', 'next quarter', '2026-13-45x']) {
    assert.equal(defer({ until: bad }).ok, false, `"${bad}" is not a date`);
  }
  const good = defer({ until: iso(30) });
  // Both fields move together: the structured promise and the operational date.
  assert.equal(good.patch.deferred_until, iso(30));
  assert.equal(good.patch.next_action_date, iso(30));
});

// ── The server queue offers the same resolution ──────────────────────────

test('the exception queue marks the dateless wait and only that one', () => {
  const q = buildExceptionQueue([
    parked(),
    parked({ id: 2, business_name: 'Dated Co', next_action_date: iso(21) }),
  ], { now: NOW });
  const rows = new Map(q.rows.map((r) => [r.id, r]));
  assert.equal(rows.get(1)?.datelessDeferral, true);
  assert.equal(rows.has(2), false, 'a wait that is not over is not in the queue at all');
});

// ── "Not interested" is not a close ──────────────────────────────────────

test('not this offer leaves Needs you and keeps the relationship open', () => {
  const corrected = currentState({
    events: [{ id: 1, state: REL.NO_TO_THIS_OFFER, occurredAt: '2026-08-11 09:00:00' }],
    now: NOW,
  });
  assert.equal(corrected.needsPerson, false, 'off Today');
  assert.equal(corrected.closed, false, 'and not closed');
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_THIS_OFFER), false);

  const s = prospectActionState(parked(), { relationship: corrected, now: NOW });
  assert.equal(s.pile, PILE.NEEDS_YOU, 'still a reply conversation');
  assert.equal(viewFor(s), VIEW.REPLIED, 'so still in the Replied tab');
  assert.equal(todaySections([parked()], { now: NOW, skip: new Set([1]) }).needsYou.total, 0);
});

test('closing the relationship is a different state, and stays out of one click', () => {
  const closed = currentState({
    events: [{ id: 1, state: REL.NO_TO_US, occurredAt: '2026-08-11 09:00:00' }],
    now: NOW,
  });
  assert.equal(closed.closed, true);
  assert.equal(closed.needsPerson, false);

  // The card offers a date, a reply, and the soft no. It must not offer the
  // hard one: "no follow-up" reads as both, and one of them is irreversible.
  const src = readFileSync(new URL('../components/DeferralResolver.jsx', import.meta.url), 'utf8');
  assert.ok(!src.includes('NO_TO_US'), 'the card must not be able to close a relationship');
  assert.ok(!src.includes('do_not_contact'), 'nor mark do-not-contact');
  assert.ok(src.includes('REL.NO_TO_THIS_OFFER'), 'the soft no is the only no here');
  assert.ok(src.includes('REL.DEFERRED'), 'and a date is recorded as a deferral');
  assert.match(src, /correction menu/, 'and it says where the stronger action lives');
});

// ── What the card actually draws ─────────────────────────────────────────

test('the card offers three ways out and no jargon', async () => {
  const { default: DeferralResolver } = await import('../components/DeferralResolver.jsx');
  const html = renderToString(React.createElement(DeferralResolver, {
    prospectId: 1, onReply: () => {}, onResolved: () => {},
  })).replace(/<!--.*?-->/g, '');

  for (const expected of ['Set a date', 'Reply now', 'Not interested']) {
    assert.ok(html.includes(expected), `the card is missing "${expected}"`);
  }
  // Chapter 12 shortened this. It sits under a row that already says who
  // this is and how long they have waited, so it only has to say the one
  // thing the row does not: there is no date.
  assert.match(html, /no date was recorded/i);
  for (const leak of ['DEFERRED', 'NO_TO_THIS_OFFER', 'null', 'deferred_until', 'next_action_date']) {
    assert.ok(!html.includes(leak), `"${leak}" reached the screen`);
  }
});

test('reply now writes nothing at all', () => {
  const src = readFileSync(new URL('../components/DeferralResolver.jsx', import.meta.url), 'utf8');
  // The reply path is a callback the page owns. The card never posts for it.
  const replyBlock = src.slice(src.indexOf('onReply ?'), src.indexOf('Not interested'));
  assert.ok(!replyBlock.includes('fetch('), 'Reply now must not write anything');
  assert.ok(!replyBlock.includes('send('), 'nor record a state');
});

// ── History, and everything this was not allowed to touch ────────────────

test('a correction is appended, never an edit of what came before', () => {
  const store = readFileSync(new URL('../lib/relationship-store.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(store.includes('INSERT OR IGNORE INTO relationship_events'));
  assert.ok(!store.includes('UPDATE relationship_events'), 'events are never edited');
  assert.ok(!store.includes('DELETE FROM relationship_events'), 'nor deleted');
  // The date rides on the appended event, so the timeline says what was promised.
  assert.match(store, /correctTo\([\s\S]*?deferUntil/, 'a correction can carry its date');
});

test('the original deferral survives a correction', () => {
  const events = [
    { id: 1, state: REL.DEFERRED, occurredAt: '2026-07-11 09:00:00', deferUntil: null },
    { id: 2, state: REL.DEFERRED, occurredAt: '2026-08-11 09:00:00', deferUntil: iso(21) },
  ];
  const now = currentState({ events, now: NOW });
  assert.equal(now.state, REL.DEFERRED);
  assert.equal(now.deferredUntil, iso(21), 'the newer promise wins');
  assert.equal(events.length, 2, 'and the older one is still there');
});

test('nothing in this pass can send, queue or change a cold sequence', () => {
  for (const f of ['../components/DeferralResolver.jsx', '../lib/deferral.mjs',
    '../app/api/prospects/[id]/conversation/route.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['sendApproved', 'enqueue(', 'buildMime', 'gmail', 'emails_sent',
      'send_events', 'outreach_packages', 'autoSendApproved']) {
      assert.ok(!src.includes(forbidden), `${f} must never touch ${forbidden}`);
    }
  }
});

test('a woken deferral is still not a cold email', async () => {
  const { rejoinsColdSequence, dueToday } = await import('../lib/deferral.mjs');
  assert.equal(rejoinsColdSequence(), false);
  const [row] = dueToday([parked({ ...defer({ until: iso(-1) }).patch })], { now: NOW });
  assert.equal(row.autoSend, false, 'the module says so about its own rows');
});
