import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLog, appendEntry, infoTimeline, mergedTimeline, withAutoLog } from '../lib/activity-log.mjs';

test('parseLog handles string, array, null, and garbage without throwing', () => {
  assert.deepEqual(parseLog('[{"ts":"2026-08-06T09:00:00Z","tag":"note","text":"hi"}]'),
    [{ ts: '2026-08-06T09:00:00Z', tag: 'note', text: 'hi' }]);
  assert.deepEqual(parseLog(null), []);
  assert.deepEqual(parseLog('not json'), []);
  assert.deepEqual(parseLog('{"tag":"x"}'), []); // object, not array
  assert.deepEqual(parseLog([{ tag: 'a', text: 'b' }, { bad: true }]), [{ tag: 'a', text: 'b' }]);
});

test('appendEntry appends chronologically and validates input', () => {
  const one = appendEntry(null, 'reply', 'Kym said yes', '2026-08-06T09:00:00Z');
  const two = appendEntry(one, 'call', 'booked Friday', '2026-08-06T10:00:00Z');
  assert.deepEqual(JSON.parse(two), [
    { ts: '2026-08-06T09:00:00Z', tag: 'reply', text: 'Kym said yes' },
    { ts: '2026-08-06T10:00:00Z', tag: 'call', text: 'booked Friday' },
  ]);
  assert.throws(() => appendEntry(null, '', 'x'), /tag must be/);
  assert.throws(() => appendEntry(null, 'tag', 42), /text must be/);
});

test('appendEntry survives a corrupted existing column (starts fresh)', () => {
  const out = appendEntry('corrupted{{{', 'note', 'still works', '2026-08-06T09:00:00Z');
  assert.deepEqual(JSON.parse(out), [{ ts: '2026-08-06T09:00:00Z', tag: 'note', text: 'still works' }]);
});

test('infoTimeline lifts the four known markers from a multi-line info blob', () => {
  const info = 'PRESCREEN strong lead, florist niche\nREPLYSYNC:18c2f4a9 synced from Gmail\nVIDTEST:A\nDECLINED said no via email\nAry note: quotes take 2 days';
  const t = infoTimeline(info);
  assert.deepEqual(t.map((e) => e.tag), ['prescreen', 'replysync', 'vidtest', 'declined']);
  assert.equal(t[0].text, 'strong lead, florist niche');
  assert.equal(t[1].text, '18c2f4a9 synced from Gmail');
  assert.equal(t[2].text, 'A');
  assert.equal(t[3].text, 'said no via email');
  assert.ok(t.every((e) => e.fromInfo && e.ts === null));
});

test('infoTimeline ignores ordinary notes and empty input', () => {
  assert.deepEqual(infoTimeline('niche: florist\nlocation: Perth'), []);
  assert.deepEqual(infoTimeline(null), []);
  assert.deepEqual(infoTimeline(''), []);
});

// ── Auto-log ───────────────────────────────────────────────────────────
const TS = '2026-08-08T09:00:00Z';

test('withAutoLog appends a stage-move entry in the same patch', () => {
  const prev = { id: 1, stage: 'Email 2', activity_log: null };
  const out = withAutoLog(prev, { stage: 'Email 3', last_contact_date: '2026-08-08' }, TS);
  assert.equal(out.stage, 'Email 3');
  assert.deepEqual(parseLog(out.activity_log), [{ ts: TS, tag: 'stage', text: 'Email 2 → Email 3' }]);
});

test('withAutoLog logs replies and video sends, several in one patch', () => {
  const prev = { id: 1, stage: 'Email 3', reply_type: null, video_sent_at: null, activity_log: null };
  const out = withAutoLog(prev, { reply_type: 'interested', video_sent_at: '2026-08-08' }, TS);
  assert.deepEqual(parseLog(out.activity_log).map((e) => [e.tag, e.text]),
    [['reply', 'interested'], ['video', 'audit video sent']]);
});

test('withAutoLog leaves boring patches and addLog writes untouched', () => {
  const prev = { id: 1, stage: 'Email 2', activity_log: null };
  const boring = { audit_notes: 'x' };
  assert.equal(withAutoLog(prev, boring, TS), boring);
  const explicit = { activity_log: '[]' };
  assert.equal(withAutoLog(prev, explicit, TS), explicit); // no double-log
  const same = { stage: 'Email 2' };
  assert.equal(withAutoLog(prev, same, TS), same); // no-op stage write
  assert.equal(withAutoLog(null, boring, TS), boring); // unknown row
});

test('withAutoLog preserves existing history when appending', () => {
  const prev = { id: 1, stage: 'Email 1', activity_log: appendEntry(null, 'note', 'called her', TS) };
  const out = withAutoLog(prev, { stage: 'Email 2' }, '2026-08-08T10:00:00Z');
  assert.deepEqual(parseLog(out.activity_log).map((e) => e.text), ['called her', 'Email 1 → Email 2']);
});

test('mergedTimeline: dated entries newest-first, info markers trailing', () => {
  const raw = JSON.stringify([
    { ts: '2026-08-01T09:00:00Z', tag: 'email', text: 'sent 3' },
    { ts: '2026-08-06T09:00:00Z', tag: 'reply', text: 'she answered' },
  ]);
  const t = mergedTimeline(raw, 'VIDTEST:B\nnotes here');
  assert.deepEqual(t.map((e) => e.text), ['she answered', 'sent 3', 'B']);
});
