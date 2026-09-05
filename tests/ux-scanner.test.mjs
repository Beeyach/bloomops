// Two things Ary hit after a day with V2: a screen showing two systems as one,
// and a scanner she could start but not stop.

import test from 'node:test';
import assert from 'node:assert/strict';

import { BUCKET, BUCKET_RANK, BUCKET_LABEL, buildExceptionQueue } from '../lib/exceptions.mjs';
import { RUN, mayContinue, stopTransition, settleState, isStale, isLive, isTerminal, describe as describeRun, HEARTBEAT_STALE_MINUTES } from '../lib/scanner-run.mjs';
import { SEND_DEFAULTS, sendPolicy } from '../lib/send-policy.mjs';

const base = (over = {}) => ({
  id: 1,
  name: 'Test Studio',
  stage: 'Email 1',
  email: 'hi@example.com',
  replied: 0,
  reply_type: null,
  reply_date: null,
  next_action_date: null,
  do_not_contact: 0,
  unsubscribed: 0,
  ...over,
});

const queue = (rows, opts = {}) => buildExceptionQueue(rows, { now: new Date('2026-08-10T12:00:00Z'), ...opts });

// ── Legacy drafts are not V2 approvals ───────────────────────────────────

test('an old draft lands in its own bucket, never in Ready for approval', () => {
  const r = queue([base({ pending_draft: 'Hi there, just following up.', pending_draft_at: '2026-08-01 10:00:00' })]);
  const row = r.rows.find((x) => x.id === 1);
  assert.ok(row);
  assert.equal(row.bucket, BUCKET.LEGACY_DRAFT);
  assert.notEqual(row.bucket, BUCKET.READY_FOR_APPROVAL);
  assert.equal(row.legacy, true);
});

test('an old draft is labelled as old, and never as current work', () => {
  const r = queue([base({ pending_draft: 'Old copy', pending_draft_at: '2026-08-01 10:00:00' })]);
  const row = r.rows.find((x) => x.id === 1);
  assert.equal(row.headline, 'Old draft');
  assert.match(row.detail, /before the new outreach flow/i);
  assert.equal(BUCKET_LABEL[BUCKET.LEGACY_DRAFT], 'Old drafts');
  // The strings that used to make it read as current.
  assert.notEqual(row.headline, 'Follow-up ready');
  assert.equal(/Prepared automatically/.test(row.detail), false);
});

test('old drafts rank below everything current', () => {
  for (const b of [BUCKET.NEEDS_REPLY, BUCKET.NEEDS_DECISION, BUCKET.READY_FOR_APPROVAL, BUCKET.RESURFACED, BUCKET.BLOCKED, BUCKET.ENGAGEMENT]) {
    assert.ok(BUCKET_RANK[BUCKET.LEGACY_DRAFT] < BUCKET_RANK[b], `${b} must outrank an old draft`);
  }
});

test('a dismissed draft leaves the list without touching the prospect', () => {
  const withDraft = base({ pending_draft: 'Old copy', pending_draft_at: '2026-08-01 10:00:00' });
  assert.equal(queue([withDraft]).rows.length, 1);

  // Dismissal is one column. The stage, rating and reply state are untouched,
  // because "not today" is not "rejected".
  const dismissed = { ...withDraft, pending_draft_dismissed_at: '2026-08-10 09:00:00' };
  assert.equal(queue([dismissed]).rows.length, 0);
  assert.equal(dismissed.stage, withDraft.stage);
  assert.equal(dismissed.pending_draft, withDraft.pending_draft, 'the draft text is kept');
  assert.equal(dismissed.do_not_contact, 0);
  assert.equal(dismissed.unsubscribed, 0);
  assert.equal(dismissed.reply_type, null);
});

test('a stale draft is still a decision, not an old draft', () => {
  const r = queue([base({ pending_draft: 'x', pending_draft_stale: 1, pending_draft_at: '2026-08-01 10:00:00' })]);
  assert.equal(r.rows[0].bucket, BUCKET.NEEDS_DECISION);
});

test('the draft body only rides along on an old-draft row', () => {
  const r = queue([base({ pending_draft: 'Old copy', pending_draft_at: '2026-08-01 10:00:00' })]);
  assert.equal(r.rows[0].draft, 'Old copy');

  // A row that is really about an unanswered reply carries no draft, because a
  // send button next to somebody who is waiting is the worst button on Today.
  // The reply has to exist as a message now, not just as a flag on the row:
  // "replied = 1" with nothing behind it is history, not somebody waiting.
  const waiting = base({ pending_draft: 'Old copy', pending_draft_at: '2026-08-01 10:00:00', replied: 1, reply_date: '2026-08-09' });
  const replied = queue([waiting], {
    repliesByProspect: new Map([[waiting.id, [{
      direction: 'inbound', occurred_at: '2026-08-09T10:00:00Z',
      classification: 'question', requires_human: 1, matched_by: 'thread',
      snippet: 'One more thing —',
    }]]]),
  });
  assert.equal(replied.rows[0].bucket, BUCKET.NEEDS_REPLY);
  assert.equal(replied.rows[0].draft, null);
});

// ── Scanner runs ─────────────────────────────────────────────────────────

test('a running scanner may continue, and exposes Stop', () => {
  const run = { state: RUN.RUNNING };
  assert.equal(mayContinue(run).ok, true);
  assert.equal(isLive(run.state), true);
  assert.equal(isTerminal(run.state), false);
});

test('stopping prevents the next item from starting', () => {
  const t = stopTransition(RUN.RUNNING);
  assert.equal(t.changed, true);
  assert.equal(t.next, RUN.STOPPING);

  // The loop asks this before every item, so an item in flight finishes and
  // its answer is kept.
  const stopping = mayContinue({ state: RUN.STOPPING });
  assert.equal(stopping.ok, false);
  assert.equal(stopping.stopping, true);
  assert.match(stopping.reason, /after the current one finishes/i);
});

test('stop is idempotent from every state', () => {
  assert.equal(stopTransition(RUN.STOPPING).changed, false);
  assert.equal(stopTransition(RUN.STOPPED).changed, false);
  assert.equal(stopTransition(RUN.COMPLETED).changed, false);
  assert.equal(stopTransition(RUN.FAILED).changed, false);
  assert.equal(stopTransition(RUN.ABANDONED).changed, false);
  // And none of them moves anything.
  for (const st of [RUN.STOPPING, RUN.STOPPED, RUN.COMPLETED, RUN.FAILED, RUN.ABANDONED]) {
    assert.equal(stopTransition(st).next, st);
  }
});

test('STOPPING settles to STOPPED, and never to COMPLETED', () => {
  assert.equal(settleState(RUN.STOPPING), RUN.STOPPED);
  assert.equal(settleState(RUN.STOPPING, { error: true }), RUN.STOPPED, 'a stop is a stop even if the last item failed');
  assert.equal(settleState(RUN.RUNNING), RUN.COMPLETED);
  assert.equal(settleState(RUN.RUNNING, { error: true }), RUN.FAILED);
});

test('a stopped run never claims the work finished', () => {
  const stopped = describeRun({ state: RUN.STOPPED, processed: 12, total: 50 });
  assert.match(stopped.text, /Stopped/);
  assert.match(stopped.text, /kept/);
  assert.match(stopped.text, /12 of 50/);
  assert.equal(/finished all/i.test(stopped.text), false);

  const done = describeRun({ state: RUN.COMPLETED, processed: 50, total: 50 });
  assert.match(done.text, /Finished all 50/);
});

test('a running scanner reports where it is', () => {
  const d = describeRun({ state: RUN.RUNNING, processed: 18, total: 50, current_item: 'example.com' });
  assert.equal(d.text, 'Scanning 18 of 50');
  assert.equal(d.detail, 'example.com');
  assert.equal(d.done, false);
});

test('a run whose tab went away is stale, and a fresh one is not', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  const fresh = { state: RUN.RUNNING, heartbeat_at: '2026-08-10 11:58:00' };
  const gone = { state: RUN.RUNNING, heartbeat_at: '2026-08-10 10:00:00' };
  assert.equal(isStale(fresh, { now }), false);
  assert.equal(isStale(gone, { now }), true);

  // Finished runs are never stale: there is nothing to reconcile.
  assert.equal(isStale({ state: RUN.COMPLETED, heartbeat_at: '2026-01-01 00:00:00' }, { now }), false);
  assert.ok(HEARTBEAT_STALE_MINUTES >= 10, 'generous enough that a slow site check is not mistaken for a dead tab');
});

test('a stopped run can be started again', () => {
  // Nothing about STOPPED blocks a new run: it is terminal for that run only.
  assert.equal(isTerminal(RUN.STOPPED), true);
  assert.equal(isLive(RUN.STOPPED), false);
  assert.equal(mayContinue({ state: RUN.STOPPED }).ok, false);
  // A new run starts in RUNNING, which may continue.
  assert.equal(mayContinue({ state: RUN.RUNNING }).ok, true);
});

test('a run that does not exist cannot be continued or stopped into existence', () => {
  assert.equal(mayContinue(null).ok, false);
  assert.equal(stopTransition(undefined).next, null);
});

// ── Scanners and sending stay separate concerns ──────────────────────────

test('nothing in the scanner state model touches the send switches', () => {
  // Belt and braces: the run states are research, the switches are outreach,
  // and the only way they could meet is if somebody wired them together.
  const before = { first: SEND_DEFAULTS.autoSendApprovedFirstEmails, follow: SEND_DEFAULTS.autoSendApprovedFollowups };
  stopTransition(RUN.RUNNING);
  settleState(RUN.STOPPING);
  const p = sendPolicy({});
  assert.equal(before.first, false);
  assert.equal(before.follow, false);
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);
});

test('stopping a scanner has no vocabulary for approval or sequence state', () => {
  const keys = Object.keys(describeRun({ state: RUN.STOPPED }));
  for (const forbidden of ['approved', 'sequence', 'stage', 'rating', 'skipped']) {
    assert.equal(keys.includes(forbidden), false);
  }
  assert.equal(Object.values(RUN).includes('SKIPPED'), false);
});
