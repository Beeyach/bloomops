import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByDue, unscheduledActive, warmWaiting, dueAuto, isAutoDue, WARM_SILENCE_DAYS, UPCOMING_WINDOW_DAYS } from '../lib/today.mjs';

// dueFn stub: each fake prospect carries its own due value.
const dueFn = (p) => p.due;
const P = (name, due) => ({ name, due });

test('splits prospects into overdue, due today, and upcoming', () => {
  const groups = groupByDue(
    [P('over', -3), P('now', 0), P('soon', 2), P('off', null)],
    dueFn
  );
  assert.equal(groups.overdue.length, 1);
  assert.equal(groups.overdue[0].prospect.name, 'over');
  assert.equal(groups.overdue[0].overdueBy, 3);
  assert.deepEqual(groups.dueToday.map((p) => p.name), ['now']);
  assert.equal(groups.upcomingByDay.length, 1);
  assert.equal(groups.upcomingByDay[0].inDays, 2);
});

test('sorts overdue most-overdue-first', () => {
  const groups = groupByDue([P('a', -1), P('b', -9), P('c', -4)], dueFn);
  assert.deepEqual(groups.overdue.map((x) => x.prospect.name), ['b', 'c', 'a']);
  assert.deepEqual(groups.overdue.map((x) => x.overdueBy), [9, 4, 1]);
});

test('groups upcoming by day in ascending order', () => {
  const groups = groupByDue([P('d3a', 3), P('d1', 1), P('d3b', 3)], dueFn);
  assert.deepEqual(groups.upcomingByDay.map((g) => g.inDays), [1, 3]);
  assert.deepEqual(groups.upcomingByDay[1].items.map((p) => p.name), ['d3a', 'd3b']);
});

test('window includes day 7 and excludes day 8', () => {
  const groups = groupByDue([P('in', UPCOMING_WINDOW_DAYS), P('out', UPCOMING_WINDOW_DAYS + 1)], dueFn);
  assert.deepEqual(groups.upcomingByDay.flatMap((g) => g.items.map((p) => p.name)), ['in']);
});

test('handles empty and null input', () => {
  assert.deepEqual(groupByDue([], dueFn).dueToday, []);
  assert.deepEqual(groupByDue(null, dueFn).overdue, []);
});

// ── Unscheduled active work ────────────────────────────────────────────
// "You're all caught up" was a lie: a workspace can hold 1,700 active
// prospects and still show it, because none of them carry a date.

test('collects active prospects that have no next action', () => {
  const rows = [
    { id: 1, name: 'no date', stage: 'Email 1' },
    { id: 2, name: 'dated', stage: 'Email 1', next_action_date: '2026-07-20' },
    { id: 3, name: 'client', stage: 'Client' },
    { id: 4, name: 'lost', stage: 'Lost' },
    { id: 5, name: 'rejected', stage: 'Rejected' },
    { id: 6, name: 'finished', stage: 'Finished' },
    { id: 7, name: 'invalid', stage: 'Invalid Email' },
    { id: 8, name: 'new no date', stage: 'New' },
  ];
  const un = unscheduledActive(rows);
  assert.deepEqual(un.map((p) => p.name), ['no date', 'new no date']);
});

test('unscheduled ignores blank-string dates, counts them as missing', () => {
  const un = unscheduledActive([{ id: 1, name: 'blank', stage: 'Email 2', next_action_date: '' }]);
  assert.deepEqual(un.map((p) => p.name), ['blank']);
});

test('unscheduled sorts most-contacted first so the warmest surface', () => {
  const rows = [
    { id: 1, name: 'cold', stage: 'New', emails_sent: 0 },
    { id: 2, name: 'warm', stage: 'Email 3', emails_sent: 3 },
    { id: 3, name: 'mid', stage: 'Email 1', emails_sent: 1 },
  ];
  assert.deepEqual(unscheduledActive(rows).map((p) => p.name), ['warm', 'mid', 'cold']);
});

test('unscheduled handles empty and null input', () => {
  assert.deepEqual(unscheduledActive([]), []);
  assert.deepEqual(unscheduledActive(null), []);
});

// ── Due today (auto) ───────────────────────────────────────────────────
// The sweep's job: Email 1-5 that have come due, plus any row still owed its
// audit video (owed = a video link exists and hasn't been sent). Reuses the
// dueFn stub declared at the top of this file.
test('auto-due is Email 1-5 that are due now', () => {
  const rows = [
    { id: 1, name: 'e1-due', stage: 'Email 1', due: 0 },
    { id: 2, name: 'e3-overdue', stage: 'Email 3', due: -2 },
    { id: 3, name: 'e2-notyet', stage: 'Email 2', due: 3 },
    { id: 4, name: 'interested', stage: 'Interested', due: -5 }, // human stage, not auto
    { id: 5, name: 'snoozed', stage: 'Snoozed', due: -1 },       // not auto
  ];
  assert.deepEqual(dueAuto(rows, dueFn).map((p) => p.name), ['e1-due', 'e3-overdue']);
});

test('a row still owed a video is auto-due whatever its stage or date', () => {
  const rows = [
    { id: 1, name: 'owed', stage: 'Finished', due: null, video_url: 'x' },
    { id: 2, name: 'sent', stage: 'Email 4', due: 5, video_url: 'x', video_sent_at: '2026-08-01' },
    { id: 3, name: 'owed-interested', stage: 'Interested', due: null, video_url: 'x' },
  ];
  assert.deepEqual(dueAuto(rows, dueFn).map((p) => p.name), ['owed', 'owed-interested']);
  assert.equal(isAutoDue({ stage: 'Email 4', due: 5, video_url: 'x', video_sent_at: 'y' }, dueFn), false);
});

test('a spent band is never auto-due, however overdue the date looks', () => {
  // The two "due" answers used to disagree. `isDueProspect` asked about the
  // band and this list did not, so the sweep's own worklist offered 223
  // production prospects whose allowance was already gone.
  const rows = [
    // 💙 is P2: two touches. Five have gone.
    { id: 1, name: 'spent-p2', stage: 'Email 4', due: -30, rating: '💙', emails_sent: 5 },
    // ✖️ is P3: one touch. Two have gone.
    { id: 2, name: 'spent-p3', stage: 'Email 2', due: -10, rating: '✖️', emails_sent: 2 },
    // 💚 is P1: three touches, two gone, so the third is genuinely owed.
    { id: 3, name: 'room-p1', stage: 'Email 2', due: -1, rating: '💚', emails_sent: 2 },
    // Unrated keeps the widest cap until somebody looks.
    { id: 4, name: 'unrated', stage: 'Email 2', due: -1, emails_sent: 2 },
  ];
  assert.deepEqual(dueAuto(rows, dueFn).map((p) => p.name), ['room-p1', 'unrated']);
});

test('an owed video still goes after the band is spent', () => {
  // The cap counts cold emails. A recording that already exists was promised
  // on a touch that already happened, so it is not a new one.
  const spentButFilmed = {
    stage: 'Email 4', due: 5, rating: '💙', emails_sent: 5,
    video_url: 'https://file.gobloomwired.com/video/x', video_sent_at: null,
  };
  assert.equal(isAutoDue(spentButFilmed, dueFn), true);
  assert.equal(isAutoDue({ ...spentButFilmed, video_sent_at: '2026-08-01' }, dueFn), false,
    'and once it has gone, the spent band applies again');
});

// ── Needs you (the human worklist) ─────────────────────────────────────
const ny = (rows) => warmWaiting(rows, {
  daysSince: (p) => p.days ?? null,
  pastDue: (p) => p.past ?? null,
  dueFn,
});

test('needs-you: warm stages and replied leads quiet past the threshold', () => {
  const rows = [
    { id: 1, name: 'interested', stage: 'Interested', days: 4 },
    { id: 2, name: 'engaged', stage: 'Engaged', days: 3 },
    { id: 3, name: 'replied-email', stage: 'Email 2', replied: 1, days: 6, due: null },
    { id: 4, name: 'fresh', stage: 'Interested', days: WARM_SILENCE_DAYS - 1 }, // too fresh
  ];
  assert.deepEqual(ny(rows).map((w) => w.prospect.name), ['replied-email', 'interested', 'engaged']);
});

test('needs-you: Setup Check always qualifies; Snoozed/defer only once their date arrives', () => {
  const rows = [
    { id: 1, name: 'setup', stage: 'Setup Check', days: 0 },
    { id: 2, name: 'snooze-due', stage: 'Snoozed', past: 2 },
    { id: 3, name: 'snooze-future', stage: 'Snoozed', past: -10 },
    { id: 4, name: 'defer-due', stage: 'Email 3', reply_type: 'defer', past: 0, due: null },
  ];
  assert.deepEqual(ny(rows).map((w) => w.prospect.name).sort(), ['defer-due', 'setup', 'snooze-due']);
});

test('needs-you: catches other due stages so nothing vanishes (Rekindled, DMs)', () => {
  const rows = [
    { id: 1, name: 'dm', stage: 'DM 1', due: -1, past: 1 },
    { id: 2, name: 'rekindled', stage: 'Rekindled', due: 0 },
    { id: 3, name: 'voice', stage: 'Voice Note', due: -3, past: 3 },
  ];
  assert.deepEqual(ny(rows).map((w) => w.prospect.name), ['voice', 'dm', 'rekindled']);
});

test('needs-you: excludes the sweep\'s own rows and closed leads', () => {
  const rows = [
    { id: 1, name: 'e1-due', stage: 'Email 1', due: 0 },           // auto, excluded
    { id: 2, name: 'owed-video', stage: 'Interested', video_url: 'x', days: 9 }, // auto (video), excluded
    { id: 3, name: 'won', stage: 'Client', replied: 1, days: 9 },  // closed
    { id: 4, name: 'rejected', stage: 'Rejected', replied: 1, days: 9 },
  ];
  assert.deepEqual(ny(rows), []);
});

test('needs-you: a proposal out 4+ days quiet surfaces; fresher ones wait', () => {
  const rows = [
    { id: 1, name: 'hot', stage: 'Proposal Sent', days: 4 },
    { id: 2, name: 'patient', stage: 'Proposal Sent', days: 3 },
    { id: 3, name: 'stale', stage: 'Proposal Sent', days: 12 },
    { id: 4, name: 'undated', stage: 'Proposal Sent', days: null },
  ];
  assert.deepEqual(ny(rows).map((w) => w.prospect.name), ['stale', 'hot']);
});

test('needs-you: sorts oldest-waiting first and handles empty/null', () => {
  const rows = [
    { id: 1, name: 'a', stage: 'Interested', days: 3 },
    { id: 2, name: 'b', stage: 'Interested', days: 20 },
    { id: 3, name: 'c', stage: 'Engaged', days: 7 },
  ];
  assert.deepEqual(ny(rows).map((w) => w.prospect.name), ['b', 'c', 'a']);
  assert.deepEqual(warmWaiting([], {}), []);
  assert.deepEqual(warmWaiting(null, {}), []);
});
