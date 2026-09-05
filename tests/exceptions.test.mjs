import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExceptionQueue, reasonsFor, summarise, BUCKET, BUCKET_RANK, ago } from '../lib/exceptions.mjs';

// Today shows exceptions, not work. And one prospect appears once: showing
// somebody twice makes a queue of nine feel like fourteen.

const NOW = new Date('2026-08-09T12:00:00Z');
const base = { id: 1, name: 'Kym', email: 'k@x.com', stage: 'Email 2', next_action_date: '2026-08-09' };

const replied = {
  ...base, id: 2, name: 'Leah', replied: 1, reply_type: 'interested',
  reply_date: '2026-08-09', last_contact_date: '2026-08-01',
};
const repliedEvents = [{
  direction: 'inbound', occurred_at: '2026-08-09T11:18:00Z',
  classification: 'interested', requires_human: 1, subject: 'Re: your booking page',
}];

test('a reply outranks a watched video', () => {
  const watcher = {
    ...base, id: 3, name: 'Otis',
    activity_log: JSON.stringify([{ ts: '2026-08-09T09:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' }]),
  };
  const q = buildExceptionQueue([watcher, replied], {
    now: NOW,
    repliesByProspect: new Map([[2, repliedEvents]]),
  });
  assert.equal(q.rows[0].name, 'Leah');
  assert.equal(q.rows[0].bucket, BUCKET.NEEDS_REPLY);
  assert.ok(BUCKET_RANK[BUCKET.NEEDS_REPLY] > BUCKET_RANK[BUCKET.ENGAGEMENT]);
});

test('the headline reads the way a person would say it', () => {
  const q = buildExceptionQueue([replied], { now: NOW, repliesByProspect: new Map([[2, repliedEvents]]) });
  assert.match(q.rows[0].headline, /^Replied interested \d+ minutes ago$/);
});

test('the row quotes what they said, not the subject we chose', () => {
  // The detail line used to be "Re: <subject>" — our own words, sent back to
  // us, on every row of the tab. What Ary needs is the message.
  const withText = [{
    ...repliedEvents[0],
    snippet: 'Yes, send it over. I&#39;m curious what you&#39;d change.',
  }];
  const q = buildExceptionQueue([replied], { now: NOW, repliesByProspect: new Map([[2, withText]]) });
  assert.equal(q.rows[0].detail, "Yes, send it over. I'm curious what you'd change.");
  assert.equal(q.rows[0].quote, true, 'the row marks this as the person speaking');
  assert.ok(!/Re: your booking page/.test(q.rows[0].detail), 'the subject is gone');
});

test('an old record with no stored text says so instead of quoting nothing', () => {
  const q = buildExceptionQueue([replied], { now: NOW, repliesByProspect: new Map([[2, repliedEvents]]) });
  assert.equal(q.rows[0].detail, 'Reply text not synced yet');
  assert.equal(q.rows[0].quote, false, 'never drawn as a quote');
});

test('one prospect appears once, with the other reasons folded in', () => {
  const both = {
    ...replied, id: 4, name: 'Judy',
    activity_log: JSON.stringify([{ ts: '2026-08-09T08:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' }]),
  };
  const q = buildExceptionQueue([both], { now: NOW, repliesByProspect: new Map([[4, repliedEvents]]) });
  assert.equal(q.rows.length, 1, 'not one row per reason');
  assert.equal(q.rows[0].bucket, BUCKET.NEEDS_REPLY);
  assert.ok(q.rows[0].also.some((a) => /Watched the video/.test(a)), 'the watch is still mentioned');
});

test('a stale draft is a decision, never an approval', () => {
  // The race: a draft prepared at 9am, a reply at 9:05. Offering a green
  // Send on that is the worst email in the sequence.
  const stale = { ...base, id: 5, pending_draft: 'Hi Kym...', pending_draft_at: '2026-08-09T09:00:00Z', pending_draft_stale: 1 };
  const rs = reasonsFor(stale, { now: NOW });
  const draft = rs.find((r) => /draft/i.test(r.headline));
  assert.equal(draft.bucket, BUCKET.NEEDS_DECISION);
  assert.match(draft.detail, /reply came in after this was prepared/);
});

test('a fresh draft is an OLD draft, not something waiting on approval', () => {
  // These predate Strategy V2 and are plain text for pasting into Gmail. They
  // used to share a pile with real outreach packages, which left Ary guessing
  // which system a card belonged to.
  const fresh = { ...base, id: 6, pending_draft: 'Hi Kym...', pending_draft_at: '2026-08-09T09:00:00Z' };
  const rs = reasonsFor(fresh, { now: NOW });
  assert.equal(rs.some((r) => r.bucket === BUCKET.READY_FOR_APPROVAL), false);
  const draft = rs.find((r) => r.bucket === BUCKET.LEGACY_DRAFT);
  assert.ok(draft);
  assert.equal(draft.headline, 'Old draft');
  assert.match(draft.detail, /before the new outreach flow/i);
});

test('an unreadable reply asks for a decision', () => {
  const rs = reasonsFor({ ...base, id: 7 }, {
    now: NOW,
    replies: [{ direction: 'inbound', occurred_at: '2026-08-09T10:00:00Z', classification: 'unknown', requires_human: 1 }],
  });
  assert.ok(rs.some((r) => r.bucket === BUCKET.NEEDS_DECISION && /nobody could read/i.test(r.headline)));
});

test('a waiting Vet job and a failed job both surface, differently', () => {
  const amb = reasonsFor({ ...base, id: 8 }, {
    now: NOW,
    job: { error_kind: 'human', last_error: 'Ambiguous: Never checked.', updated_at: '2026-08-09T10:00:00Z' },
  });
  assert.equal(amb[0].bucket, BUCKET.NEEDS_DECISION);
  assert.equal(amb[0].detail, 'Never checked.', 'the Ambiguous: prefix is noise');

  const budget = reasonsFor({ ...base, id: 9 }, {
    now: NOW,
    job: { status: 'waiting', error_kind: 'budget', last_error: "Today's allowance is used up.", updated_at: '2026-08-09T10:00:00Z' },
  });
  assert.ok(budget.some((r) => r.bucket === BUCKET.BLOCKED && /credits/i.test(r.headline)));
});

test('a deferred window that opened is its own bucket', () => {
  const woke = { ...base, id: 10, stage: 'Snoozed', reply_type: 'defer', next_action_date: '2026-08-09', replied: 1, reply_date: '2026-06-01', last_contact_date: '2026-06-02' };
  const rs = reasonsFor(woke, { now: NOW });
  assert.ok(rs.some((r) => r.bucket === BUCKET.RESURFACED));
});

test('routine progress does not appear at all', () => {
  // A prospect the machine is quietly handling is not an exception, and a
  // list that reports the machine doing its job is one nobody reads.
  const quiet = { id: 11, name: 'Quiet', email: 'q@x.com', stage: 'Email 1', next_action_date: '2026-09-01' };
  const q = buildExceptionQueue([quiet], { now: NOW });
  assert.equal(q.rows.length, 0);
  assert.equal(q.total, 0);
});

test('an old watch is not an exception any more', () => {
  const old = {
    ...base, id: 12,
    activity_log: JSON.stringify([{ ts: '2026-07-01T09:00:00Z', tag: 'VIDEOVIEW', text: 'Watched 75% of the video' }]),
  };
  assert.equal(buildExceptionQueue([old], { now: NOW }).rows.length, 0);
});

test('longest wait first inside a bucket', () => {
  const older = { ...replied, id: 20, name: 'Older', reply_date: '2026-08-05' };
  const newer = { ...replied, id: 21, name: 'Newer', reply_date: '2026-08-09' };
  const q = buildExceptionQueue([newer, older], {
    now: NOW,
    repliesByProspect: new Map([
      [20, [{ direction: 'inbound', occurred_at: '2026-08-05T10:00:00Z', classification: 'interested', requires_human: 1 }]],
      [21, [{ direction: 'inbound', occurred_at: '2026-08-09T10:00:00Z', classification: 'interested', requires_human: 1 }]],
    ]),
  });
  assert.equal(q.rows[0].name, 'Older');
});

test('the summary leads with people', () => {
  assert.match(summarise({ [BUCKET.NEEDS_REPLY]: 2, [BUCKET.READY_FOR_APPROVAL]: 5 }), /^2 people need your reply/);
  assert.match(summarise({ [BUCKET.NEEDS_REPLY]: 1 }), /^1 person needs your reply/);
  assert.match(summarise({}), /Nothing needs you/);
});

test('ago reads in minutes when it is minutes, and counts singular properly', () => {
  assert.match(ago('2026-08-09T11:18:00Z', NOW), /^42 minutes ago$/);
  assert.match(ago('2026-08-09T06:00:00Z', NOW), /^6 hours ago$/);
  assert.equal(ago('2026-08-08T12:00:00Z', NOW), 'yesterday');
  // "Replied 1 minutes ago" appeared in the real queue. A person reads this
  // line before deciding whether to drop what they are doing.
  assert.equal(ago('2026-08-09T11:59:20Z', NOW), '1 minute ago');
  assert.equal(ago('2026-08-09T11:00:00Z', NOW), '1 hour ago');
  assert.equal(ago('2026-08-07T12:00:00Z', NOW), '2 days ago');
});

test('the headline accounts for every card on the screen', () => {
  // A headline reading "4 people need your reply" above five cards is the same
  // class of bug as a count that disagrees with the list: the reader has to
  // work out which number is lying. Every bucket that produced a card is in
  // the sentence.
  const counts = {
    'needs-reply': 4, 'needs-decision': 1, 'ready-for-approval': 2,
    resurfaced: 1, 'automation-blocked': 1, engagement: 3,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const line = summarise(counts, total);
  const mentioned = [...line.matchAll(/(\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  assert.equal(mentioned, total, `"${line}" must add up to ${total}`);
});

test('a single person reads as a person, not as a count', () => {
  assert.match(summarise({ 'needs-reply': 1 }, 1), /1 person needs your reply/);
  assert.match(summarise({ 'needs-decision': 1 }, 1), /1 needs a decision/);
});

test('an empty queue says the machine has it, rather than nothing', () => {
  assert.match(summarise({}, 0), /machine is handling/);
});

// ── The stale draft is refused by the server, not just hidden by the UI ────
//
// "The UI blocks it" is not a safety property: the UI is one client of an API
// that anybody with a session can call. The draft text itself must not come
// back down the wire once a reply has overtaken it.

test('a stale draft is not returned to any client', () => {
  const now = new Date('2026-08-09T12:00:00Z');
  const prepared = {
    id: 5, name: 'Kym', email: 'kym@x.com', stage: 'Email 2',
    next_action_date: '2026-08-09',
    pending_draft: 'Subject: following up\n\nHi Kym. Just checking in about the form.',
    pending_draft_at: '2026-08-09T09:00:00Z',
  };

  const fresh = buildExceptionQueue([prepared], { now });
  assert.equal(fresh.rows[0].bucket, BUCKET.LEGACY_DRAFT);
  assert.ok(fresh.rows[0].draft, 'a good draft is handed over to be read');

  // Now a reply lands after it was written.
  const overtaken = buildExceptionQueue(
    [{ ...prepared, pending_draft_stale: 1, replied: 1, reply_date: '2026-08-09', last_contact_date: '2026-08-01' }],
    { now, repliesByProspect: new Map([[5, [
      { direction: 'inbound', occurred_at: '2026-08-09T09:05:00Z', classification: 'question', requires_human: 1 },
    ]]]) }
  );
  const row = overtaken.rows[0];
  assert.equal(row.bucket, BUCKET.NEEDS_REPLY, 'the person waiting outranks the prepared work');
  assert.equal(row.draft, null, 'the draft text must not travel once it is stale');
  assert.ok(row.also.some((a) => /out of date/i.test(a)), 'and the staleness is stated');
});

test('a stale draft never carries a send action, whatever the bucket', () => {
  const now = new Date('2026-08-09T12:00:00Z');
  // Stale, but nothing else wrong: no reply recorded on the row itself.
  const q = buildExceptionQueue([{
    id: 6, name: 'Dana', email: 'd@x.com', stage: 'Email 3', next_action_date: '2026-08-09',
    pending_draft: 'Subject: x\n\nHi Dana.', pending_draft_at: '2026-08-08T09:00:00Z', pending_draft_stale: 1,
  }], { now });
  assert.equal(q.rows[0].bucket, BUCKET.NEEDS_DECISION);
  assert.equal(q.rows[0].draft, null, 'only ready-for-approval hands over text');
  assert.match(q.rows[0].headline, /out of date/i);
});

// ── Measured against production, 2026-08-09 ───────────────────────────────

test('a prospect with no email address is not an exception', () => {
  // It is a correct outbound stop and a wrong Today card: nothing was
  // attempted and nothing failed, the row just has a blank field. This one
  // rule was putting 371 rows into the queue under a heading that says
  // something is stuck.
  const q = buildExceptionQueue([
    { id: 1, name: 'No address', email: null, stage: 'Email 1', next_action_date: '2026-08-09' },
  ], { now: new Date('2026-08-09T12:00:00Z') });
  assert.equal(q.total, 0, 'a blank field is a table problem, not an automation exception');
});

test('a real automation failure is still surfaced', () => {
  // The bucket must not become decorative. A job that actually broke belongs
  // in front of a person.
  const q = buildExceptionQueue([
    { id: 2, name: 'Broke', email: 'a@b.com', stage: 'Email 2', next_action_date: '2026-08-09' },
  ], {
    now: new Date('2026-08-09T12:00:00Z'),
    jobsByProspect: new Map([[2, { status: 'failed', error_kind: 'transient', last_error: 'the site would not load', updated_at: '2026-08-09T11:00:00Z' }]]),
  });
  assert.equal(q.rows[0].bucket, BUCKET.BLOCKED);
  assert.match(q.rows[0].headline, /failed/i);
});
