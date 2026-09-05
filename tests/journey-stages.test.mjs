// The journey partition: every prospect in exactly one place, every count
// able to explain itself.
//
// The day this was designed, the app said "3 due" while 26 more waited
// between days and 14 sat hidden behind inflated counters, with no way to
// learn any of that from the screen. These tests are the contract that ends
// it: stage membership is total, and per tab, shown + hidden always equals
// the stage population.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  JOURNEY_TABS, JOURNEY_PRIORITY, openingJourneyTab,
  journeyStage, journeyPartition, hiddenSummary, recordingEarned,
} from '../lib/journey-stages.mjs';

const ctx = (over = {}) => ({ clientIds: new Set(), livePackageIds: new Set(), ...over });

// ── The counting proof ────────────────────────────────────────────────────

test('every synthetic prospect lands in exactly one stage, and totals sum', () => {
  const stages = ['New', 'Prescreen', 'Validated', 'Email 1', 'Email 2', 'Email 3', 'Finished',
    'Replied', 'Interested', 'Snoozed', 'Not This Offer', 'Client', 'Rejected', 'Invalid Email', 'Engaged'];
  const rows = [];
  let id = 1;
  for (const stage of stages)
    for (const emails_sent of [0, 1, 3])
      for (const replied of [0, 1])
        for (const rating of ['', '💚', '✖️'])
          for (const video_tier of ['', 'SEND'])
            rows.push({ id: id++, stage, emails_sent, replied, rating, video_tier,
              email: 'x@y.z', domain: 'y.z', last_contact_date: '2026-08-01' });
  rows.push({ id: id++, stage: 'New', deleted_at: '2026-08-01' }); // never counted

  const c = ctx({ clientIds: new Set([1]), livePackageIds: new Set([2]) });
  const seen = new Map();
  for (const p of rows) {
    if (p.deleted_at) continue;
    const s = journeyStage(p, c);
    assert.ok(JOURNEY_TABS.some((t) => t.id === s), 'unknown stage ' + s);
    seen.set(s, (seen.get(s) || 0) + 1);
  }
  const live = rows.filter((p) => !p.deleted_at).length;
  const sum = [...seen.values()].reduce((a, b) => a + b, 0);
  assert.equal(sum, live, 'every live prospect classified exactly once');

  const part = journeyPartition(rows, c);
  const partSum = JOURNEY_TABS.reduce((a, t) => a + part.stages[t.id].total, 0);
  assert.equal(partSum, live, 'partition totals cover the population');
});

test('per tab, shown plus hidden equals the stage total — always', () => {
  const rows = [
    { id: 1, stage: 'Client', emails_sent: 3 },                                    // drift: no card
    { id: 2, stage: 'Email 2', emails_sent: 2, rating: '💚', last_contact_date: '2026-08-01' },
    { id: 3, stage: 'Replied', emails_sent: 1, replied: 1 },
    { id: 4, stage: 'New', email: '', domain: '' },
    { id: 5, stage: 'New', rating: '🥀', email: 'a@b.c' },
    { id: 6, stage: 'Validated', video_tier: 'SEND', rating: '💚', email: 'a@b.c' },
    { id: 7, stage: 'Finished', emails_sent: 3, rating: '✖️' },
    { id: 8, stage: 'Snoozed', reply_type: 'defer', replied: 1, next_action_date: '2030-01-01' },
    { id: 9, stage: 'Invalid Email', emails_sent: 2 },
  ];
  const part = journeyPartition(rows, ctx());
  for (const t of JOURNEY_TABS) {
    const s = part.stages[t.id];
    const hidden = s.hidden.reduce((n, g) => n + g.count, 0);
    assert.equal(s.shown.length + hidden, s.total, t.id + ': shown+hidden=total');
  }
});

// ── Meanings ──────────────────────────────────────────────────────────────

test('the clients table is the authority, and a bare stage string is drift', () => {
  const carded = { id: 10, stage: 'Interested', replied: 1 };
  assert.equal(journeyStage(carded, ctx({ clientIds: new Set([10]) })), 'clients');
  const claimed = { id: 11, stage: 'Client' };
  assert.equal(journeyStage(claimed, ctx()), 'clients');
  const part = journeyPartition([claimed], ctx());
  assert.equal(part.stages.clients.shown.length, 0);
  assert.equal(part.stages.clients.hidden[0].key, 'drift');
});

test('a declined conversation is warm, named under declined - not vanished', () => {
  const p = { id: 12, reply_type: 'decline', replied: 1, emails_sent: 2 };
  assert.equal(journeyStage(p, ctx()), 'warm');
  const part = journeyPartition([p], ctx());
  assert.equal(part.stages.warm.hidden.find((g) => g.key === 'declined').count, 1);
});

test('a deferral whose date arrived is shown; a future one is parked', () => {
  const arrived = { id: 13, stage: 'Snoozed', reply_type: 'defer', replied: 1, next_action_date: '2020-01-01' };
  const future = { id: 14, stage: 'Snoozed', reply_type: 'defer', replied: 1, next_action_date: '2099-01-01' };
  const part = journeyPartition([arrived, future], ctx());
  assert.equal(part.stages.warm.shown.length, 1);
  assert.equal(part.stages.warm.shown[0].id, 13);
  assert.equal(part.stages.warm.hidden.find((g) => g.key === 'deferred').count, 1);
});

test('mid-sequence rows split into due-or-imminent shown and named hidden groups', () => {
  const finished = { id: 15, stage: 'Email 3', emails_sent: 4, rating: '💚', last_contact_date: '2026-01-01' };
  const bounced = { id: 16, stage: 'Invalid Email', emails_sent: 1 };
  const part = journeyPartition([finished, bounced], ctx());
  assert.equal(part.stages.following.shown.length, 0);
  const keys = part.stages.following.hidden.map((g) => g.key).sort();
  assert.deepEqual(keys, ['bounced', 'finished']);
});

test('ready means staged work: package, sequence, owed video, or earned recording', () => {
  assert.equal(journeyStage({ id: 20, stage: 'Validated' }, ctx({ livePackageIds: new Set([20]) })), 'ready');
  assert.equal(journeyStage({ id: 21, stage: 'Validated', email_sequence: '[{"step":1}]' }, ctx()), 'ready');
  assert.equal(journeyStage({ id: 22, stage: 'Validated', video_url: 'x.mp4' }, ctx()), 'ready'); // owed
  assert.equal(journeyStage({ id: 23, stage: 'Validated', video_tier: 'SEND' }, ctx()), 'ready');
  assert.equal(journeyStage({ id: 24, stage: 'Validated' }, ctx()), 'unprocessed');
  // A dead verdict never counts as staged work.
  assert.equal(journeyStage({ id: 25, stage: 'New', rating: '🥀', video_tier: 'SEND' }, ctx()), 'unprocessed');
});

test('recording worklist: SEND and MAYBE earn, a recorded or skipped row does not', () => {
  assert.equal(recordingEarned({ video_tier: 'SEND' }), true);
  assert.equal(recordingEarned({ video_tier: 'MAYBE' }), true);
  assert.equal(recordingEarned({ video_tier: 'SEND', video_url: 'x' }), false);
  assert.equal(recordingEarned({ video_tier: 'SKIP' }), false);
  assert.equal(recordingEarned({ video_tier: 'SEND', rating: '✖️' }), false);
});

// ── The strip ─────────────────────────────────────────────────────────────

test('hiddenSummary names every group and drops empty stages to null', () => {
  const part = journeyPartition([{ id: 30, reply_type: 'decline', replied: 1 }], ctx());
  const s = hiddenSummary(part.stages.warm);
  assert.equal(s.total, 1);
  assert.match(s.parts[0].text, /said no/);
  assert.equal(hiddenSummary(part.stages.clients), null);
});

test('a person talking to you outranks everything in the opening order', () => {
  assert.equal(JOURNEY_PRIORITY[0], 'warm');
  assert.equal(openingJourneyTab({ warm: 0, ready: 2 }), 'ready');
  assert.equal(openingJourneyTab({ warm: 1, ready: 2 }, 'clients'), 'clients');
  assert.equal(openingJourneyTab({}), 'warm');
});

// ── Wiring pins ───────────────────────────────────────────────────────────

test('the view is mounted, navigable, and reads the shared region list', () => {
  const app = fs.readFileSync(new URL('../components/ProspectsApp.jsx', import.meta.url), 'utf8');
  assert.ok(app.includes("'journey',"), 'journey is a valid view');
  assert.ok(app.includes('<JourneyView'), 'journey renders');
  assert.ok(app.includes("from '@/lib/regions.mjs'"), 'classic view shares the region list');
  const nav = fs.readFileSync(new URL('../lib/nav-structure.mjs', import.meta.url), 'utf8');
  assert.ok(nav.includes("key: 'journey'"), 'journey is on the rail');
  const view = fs.readFileSync(new URL('../components/JourneyView.jsx', import.meta.url), 'utf8');
  assert.ok(view.includes('HiddenAccounting'), 'the accounting line renders');
  assert.ok(!view.includes('fetchGmailConversation'), 'the journey reads no Gmail');
});
