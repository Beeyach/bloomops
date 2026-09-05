// Reconciliation stays a ratchet, and stops re-reading the world.
//
// The counter pass used to run its UPDATE against every prospect that ever
// had an outbound event, every drain — the correlated subqueries re-read the
// event history ~350 times a day whether anything had changed or not, which
// was 1.2 billion rows a day (12% of the Aug 25 D1 burn). The shape is now
// detect-then-update: one aggregate pass finds drifted rows, and in the
// steady state no UPDATE runs at all. These tests pin the shape and the
// semantics that must survive it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../lib/prospect-facts.mjs', import.meta.url), 'utf8');

test('updates are gated behind a drift detector, not run unconditionally', () => {
  // The detector aggregates reply_events once...
  assert.match(src, /GROUP BY workspace, prospect_id/);
  // ...and the UPDATEs only ever target explicit ids from it.
  assert.match(src, /if \(counterIds\.length\)/);
  assert.match(src, /if \(replyIds\.length\)/);
  assert.ok(!/id IN \(\s*SELECT DISTINCT prospect_id FROM reply_events/.test(src),
    'no UPDATE sweeps every prospect that ever had an event');
});

test('the ratchet semantics are intact', () => {
  // Counters only ever rise to meet the evidence.
  assert.match(src, /emails_sent = MAX\(COALESCE\(emails_sent, 0\)/);
  assert.match(src, /last_contact_date = MAX\(COALESCE\(last_contact_date, ''\)/);
  // Reply facts are only ever set, never cleared.
  assert.match(src, /reply_date = COALESCE\(reply_date,/);
  assert.match(src, /reply_at = COALESCE\(reply_at,/);
  assert.match(src, /COALESCE\(replied, 0\) = 0/);
  // Bookkeeping rows still do not count as emails.
  assert.match(src, /!= 'idempotency marker'/);
});

test('the detector asks the same question the ratchet answers', () => {
  // Drift means: evidence count above the counter, or a later contact day.
  assert.match(src, /COALESCE\(p\.emails_sent, 0\) < a\.sends/);
  assert.match(src, /COALESCE\(p\.last_contact_date, ''\) < COALESCE\(a\.last_day, ''\)/);
  // One pass is bounded; the next drain finishes the tail.
  assert.match(src, /DRIFT_CAP = 200/);
});

test('nothing beyond the three facts is touched', () => {
  assert.ok(!/stage\s*=/.test(src), 'stage is never written');
  assert.ok(!/do_not_contact\s*=/.test(src), 'do_not_contact is never written');
  assert.ok(!/reply_type\s*=/.test(src), 'reply_type belongs to the classifier and Ary');
});

test('every detector drives from reply_events and probes prospects by key', () => {
  // The replies detector shipped as a JOIN starting from prospects and D1 ran
  // it as a nested full scan: 24.5M rows per drain, 7.2B a day, worse than
  // the burn it replaced. Small table drives; big table is probed.
  assert.ok(!/FROM prospects p\s*\n\s*JOIN reply_events/.test(src),
    'no detector starts from prospects and joins the event table');
  assert.match(src, /FROM reply_events r\s*\n\s*WHERE r\.prospect_id IS NOT NULL/,
    'the replies detector starts from reply_events');
  assert.match(src, /EXISTS \(\s*\n\s*SELECT 1 FROM prospects p/,
    'prospects is reached by EXISTS probe, not scanned');
});
