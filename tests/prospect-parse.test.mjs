import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEmailSequence, parseVideoReasons, parseSentEmail, buildSentEmail,
  replyPatch,
} from '../lib/prospect-parse.mjs';
import { todayIso } from '../lib/due.mjs';

test('parseEmailSequence: string, passthrough, and garbage', () => {
  assert.deepEqual(parseEmailSequence('[{"number":1}]'), [{ number: 1 }]);
  const arr = [{ number: 2 }];
  assert.equal(parseEmailSequence(arr), arr);
  assert.equal(parseEmailSequence('{"not":"array"}'), null);
  assert.equal(parseEmailSequence('not json'), null);
  assert.equal(parseEmailSequence(null), null);
  assert.equal(parseEmailSequence(42), null);
});

test('parseVideoReasons never returns null', () => {
  assert.deepEqual(parseVideoReasons('["slow site"]'), ['slow site']);
  assert.deepEqual(parseVideoReasons(null), []);
  assert.deepEqual(parseVideoReasons('broken{'), []);
  assert.deepEqual(parseVideoReasons('{"a":1}'), []);
});

test('parseSentEmail normalizes shape, rejects non-objects', () => {
  assert.deepEqual(
    parseSentEmail('{"subject":"Hi","body":"Yo","sent_at":"2026-08-01"}'),
    { subject: 'Hi', body: 'Yo', sent_at: '2026-08-01' }
  );
  assert.deepEqual(parseSentEmail({ subject: 'A' }), { subject: 'A', body: '', sent_at: null });
  assert.equal(parseSentEmail('[1,2]'), null);
  assert.equal(parseSentEmail('oops'), null);
  assert.equal(parseSentEmail(null), null);
});

test('buildSentEmail round-trips through parseSentEmail', () => {
  const raw = buildSentEmail('setVideo', 'Sub', 'Body', '2026-08-08');
  assert.deepEqual(parseSentEmail(raw), { subject: 'Sub', body: 'Body', sent_at: '2026-08-08' });
  assert.throws(() => buildSentEmail('setVideo', null, 'Body', null), /subject and body/);
});

test('replyPatch: type stamps, null clears, existing stamps win', () => {
  const p = replyPatch({ stage: 'Email 3' }, 'interested');
  assert.equal(p.replied, 1);
  assert.equal(p.reply_type, 'interested');
  assert.equal(p.reply_date, todayIso());
  assert.equal(p.replied_at_email, 3);

  const kept = replyPatch(
    { stage: 'Email 3', reply_date: '2026-08-01', reply_at: 'T', replied_at_email: 2 },
    'defer'
  );
  assert.equal(kept.reply_date, '2026-08-01');
  assert.equal(kept.reply_at, 'T');
  assert.equal(kept.replied_at_email, 2);

  assert.deepEqual(replyPatch({}, null), { reply_type: null, replied: 0 });
});
