import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBloomApi } from '../lib/bloom-api.mjs';
import { AUTO_EMAIL_STAGES, todayIso, isoShift, VIDEO_FOLLOWUP_DAYS } from '../lib/due.mjs';

// A live in-memory store shaped like the component's: immutable array swaps
// on every write, exactly what the WeakMap caches key on.
function makeStore(rows) {
  let arr = rows;
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  return {
    getAllProspects: () => arr,
    updateProspectById: async (id, patch) => {
      arr = arr.map((p) => (p.id === id ? { ...p, ...patch } : p));
      return arr.find((p) => p.id === id);
    },
    createProspect: async (data) => {
      const row = { id: nextId++, ...data };
      arr = [...arr, row];
      return row;
    },
    refresh: async () => {},
  };
}

function makeApi(rows) {
  const store = makeStore(rows);
  return makeBloomApi({
    stages: ['New', 'Email 1', 'Email 2', 'Email 5', 'Replied', 'Interested', 'Finished', 'Snoozed'],
    ratings: ['💚', '💙', '✖️'],
    countries: ['US', 'CA', 'AU', 'NZ', 'UK'],
    sources: ['Cold email'],
    replyTypes: ['interested', 'defer', 'decline'],
    autoEmailStages: AUTO_EMAIL_STAGES,
    ...store,
  });
}

const ROWS = [
  { id: 1, name: 'Kym', business_name: 'HSW', email: 'kym@hsw.com', stage: 'Email 1', emails_sent: 1, last_contact_date: isoShift(-3), country: 'AU' },
  { id: 2, name: '', business_name: null, email: '', stage: 'New' },
  { id: 3, name: 'Bo', email: 'bo@x.com', stage: 'Finished', emails_sent: 5, video_url: null },
];

test('reads: getProspects enriches, lookups work by email and id', () => {
  const api = makeApi(ROWS);
  const all = api.getProspects();
  assert.equal(all.length, 3);
  assert.equal(all[0].business, 'HSW');
  assert.equal(all[0].timezone, 'Australia/Sydney');
  assert.equal(api.findByEmail('  KYM@hsw.com \n').id, 1);
  assert.equal(api.findById(2).id, 2);
  assert.ok(api.getStats().total === 3);
  assert.ok(Array.isArray(api.getDueAuto()));
  assert.ok(Array.isArray(api.getWarmWaiting()));
  assert.ok(Array.isArray(api.getDue({ days: 2 })));
  assert.equal(api.COUNTRY_TIMEZONES.UK, 'Europe/London');
});

test('setStage on an auto-email stage stamps + bumps + schedules, in the envelope', async () => {
  const api = makeApi(ROWS);
  const r = await api.setStage('kym@hsw.com', 'Email 2');
  assert.equal(r.ok, true);
  assert.equal(r.prospect.stage, 'Email 2');
  assert.equal(r.prospect.emails_sent, 2);
  assert.equal(r.prospect.last_contact_date, todayIso());
  assert.equal(r.prospect.next_action_date, isoShift(4));
  // The reliability wrapper turns setter throws into { ok:false, error }.
  const invalid = await api.setStage('kym@hsw.com', 'Bogus');
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Invalid stage/);
  const missing = await api.setStage('nobody@x.com', 'Email 2');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /not found/i);
});

test('setFields skips filled values unless overwrite', async () => {
  const api = makeApi(ROWS);
  const first = await api.setFields(2, { name: 'Ana', business: 'Blooms', country: 'us' });
  assert.equal(first.ok, true);
  assert.deepEqual(first.set, { name: 'Ana', business: 'Blooms', country: 'US' });
  const second = await api.setFields(2, { name: 'Overwrite Me' });
  assert.deepEqual(second.skipped, { name: 'Ana' });
  const third = await api.setFields(2, { name: 'Ana Real' }, { overwrite: true });
  assert.equal(third.set.name, 'Ana Real');
});

test('sequence, video, reply, and log setters run end to end', async () => {
  const api = makeApi(ROWS);
  await api.setEmailSequence('kym@hsw.com', [{ number: 1, subject: 'S', body: 'B' }]);
  await api.updateEmail('kym@hsw.com', 1, { subject: 'S2' });
  assert.equal(api.getEmailByNumber('kym@hsw.com', 1).subject, 'S2');

  await api.setVideo('kym@hsw.com', 'SEND', 7, ['slow']);
  assert.deepEqual(api.getVideo('kym@hsw.com').reasons, ['slow']);
  const bad = await api.setVideoUrl('kym@hsw.com', 'https://loom.com/x');
  assert.equal(bad.ok, false);

  // A post-sequence prospect getting a video is pulled onto the due list.
  await api.setVideoUrl('bo@x.com', 'https://file.gobloomwired.com/video/bo.mp4');
  assert.equal(api.findByEmail('bo@x.com').next_action_date, isoShift(VIDEO_FOLLOWUP_DAYS));
  await api.setVideoSentEmail('bo@x.com', 'Sub', 'Body');
  const bo = api.findByEmail('bo@x.com');
  assert.equal(bo.video_sent_at, todayIso());
  assert.equal(bo.next_action_date, null);
  assert.equal(bo.video_sent_email.subject, 'Sub');

  const reply = await api.setReplyType('kym@hsw.com', 'interested');
  assert.equal(reply.prospect.replied, 1);
  assert.equal(reply.prospect.reply_date, todayIso());

  await api.addLog('kym@hsw.com', 'note', 'called her');
  const log = api.getLog('kym@hsw.com');
  assert.equal(log[log.length - 1].text, 'called her');
});

test('addProspect creates through the shared path with normalized values', async () => {
  const api = makeApi(ROWS);
  const r = await api.addProspect({ email: 'new@x.com', country: 'gb', rating: 'strong' });
  assert.equal(r.ok, true);
  assert.equal(r.prospect.country, 'UK');
  assert.equal(r.prospect.rating, '💚');
  const dup = await api.addProspect({ email: 'new@x.com' });
  assert.equal(dup.ok, false);
});
