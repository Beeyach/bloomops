// How many cold emails a prospect may receive, and who decides.
//
// The ceiling used to be read from `priority_band`, a column written only when
// an outreach package is approved. It was empty on all 5,813 production rows,
// so P1/P2/P3 governed nobody: a ✖️ prospect who should get one email could be
// asked for three. The rating that decides the band was on the same row all
// along.
//
// Two things have to hold now. A real rating must control the real ceiling. And
// an unrated prospect must NOT be cut short by the provisional P2 that bandFor
// hands out to mean "nobody has looked yet".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PRIORITY, RATING, TOUCHES, bandFor, allowedTouches,
  effectiveBand, effectiveCeiling, HARD_TOUCH_CEILING,
} from '../lib/priority.mjs';
import { coldSequenceExhausted, isDueProspect, todayIso } from '../lib/due.mjs';
import { nextStepFor, NEXT } from '../lib/cutover.mjs';

const { GREEN, BLUE, WILT, CROSS } = RATING;
const EVERY_RATING = [GREEN, BLUE, WILT, CROSS, '', null, undefined];

// ── Mapping ──────────────────────────────────────────────────────────────

test('each rating derives the band it is supposed to', () => {
  assert.equal(effectiveBand({ rating: GREEN }).band, PRIORITY.P1);
  assert.equal(effectiveBand({ rating: BLUE }).band, PRIORITY.P2);
  assert.equal(effectiveBand({ rating: WILT }).band, PRIORITY.P2);
  assert.equal(effectiveBand({ rating: CROSS }).band, PRIORITY.P3);
});

test('a real rating gives its real ceiling', () => {
  assert.equal(effectiveCeiling({ rating: GREEN }), 4);
  assert.equal(effectiveCeiling({ rating: BLUE }), 3);
  assert.equal(effectiveCeiling({ rating: WILT }), 3);
  assert.equal(effectiveCeiling({ rating: CROSS }), 1);
});

test('the ceilings come from the band table, never restated', () => {
  assert.equal(allowedTouches(PRIORITY.P1), TOUCHES[PRIORITY.P1]);
  assert.equal(effectiveCeiling({ rating: CROSS }), allowedTouches(PRIORITY.P3));
  const lib = readFileSync(new URL('../lib/due.mjs', import.meta.url), 'utf8');
  assert.ok(!/TOUCHES\s*=/.test(lib), 'due.mjs must not carry its own table');
  assert.ok(!lib.includes("'💚'") && !lib.includes("'✖️'"), 'nor its own rating map');
});

test('an empty band never means unlimited', () => {
  for (const rating of EVERY_RATING) {
    const c = effectiveCeiling({ rating, priority_band: null });
    assert.ok(c >= 1 && c <= HARD_TOUCH_CEILING, `${rating}: ceiling ${c} out of range`);
  }
});

test('a stored band is used when it is there, and ignored when it is nonsense', () => {
  const stored = effectiveBand({ rating: CROSS, priority_band: PRIORITY.P1 });
  assert.equal(stored.band, PRIORITY.P1);
  assert.equal(stored.source, 'stored');

  // Junk in the column falls back to the rating rather than being trusted.
  const junk = effectiveBand({ rating: CROSS, priority_band: 'P9' });
  assert.equal(junk.band, PRIORITY.P3);
  assert.equal(junk.source, 'rating');
});

test('a stored band remembers whether it was provisional when it was set', () => {
  const p = { rating: '', priority_band: PRIORITY.P2, band_was_provisional: 1 };
  assert.equal(effectiveBand(p).provisional, true);
  assert.equal(effectiveCeiling(p), HARD_TOUCH_CEILING, 'a provisional stored band does not cut them short either');
});

// ── Real P2 versus provisional P2 ────────────────────────────────────────

test('an unrated prospect is provisional, and is not held to two', () => {
  const { band, provisional } = bandFor({ rating: '' });
  assert.equal(band, PRIORITY.P2, 'the default is still P2');
  assert.equal(provisional, true, 'but flagged as a placeholder');
  assert.equal(effectiveCeiling({ rating: '' }), HARD_TOUCH_CEILING);
  assert.notEqual(effectiveCeiling({ rating: '' }), allowedTouches(PRIORITY.P2));
});

test('a real P2 IS held to three, and the two cases are distinguishable', () => {
  assert.equal(effectiveBand({ rating: BLUE }).provisional, false);
  assert.equal(effectiveCeiling({ rating: BLUE }), 3);
  assert.equal(coldSequenceExhausted({ rating: BLUE, emails_sent: 3 }), true);
  // Same send count, unrated, still has room.
  assert.equal(coldSequenceExhausted({ rating: '', emails_sent: 3 }), false);
});

// ── Ceilings, walked ─────────────────────────────────────────────────────

const WALK = [
  { rating: GREEN, ceiling: 4 },
  { rating: BLUE, ceiling: 3 },
  { rating: WILT, ceiling: 3 },
  { rating: CROSS, ceiling: 1 },
  { rating: '', ceiling: HARD_TOUCH_CEILING },
];

for (const { rating, ceiling } of WALK) {
  test(`${rating || 'unrated'} is exhausted at exactly ${ceiling} and never before`, () => {
    for (let sent = 0; sent <= 6; sent += 1) {
      assert.equal(
        coldSequenceExhausted({ rating, emails_sent: sent }), sent >= ceiling,
        `${rating || 'unrated'} at ${sent} sent`,
      );
    }
  });
}

test('nobody can reach a fifth cold email, by any route', () => {
  for (const rating of EVERY_RATING) {
    for (const priority_band of [null, '', PRIORITY.P1, PRIORITY.P2, PRIORITY.P3, 'P9']) {
      for (const sent of [4, 5, 7, 20]) {
        const p = { rating, priority_band, emails_sent: sent, band_was_provisional: 1 };
        assert.equal(coldSequenceExhausted(p), true,
          `rating ${rating} band ${priority_band} at ${sent} sent must be finished`);
      }
    }
  }
});

test('a ✖️ prospect who has had one email is done', () => {
  const p = { rating: CROSS, emails_sent: 1, stage: 'Email 1', next_action_date: todayIso() };
  assert.equal(coldSequenceExhausted(p), true);
  assert.equal(isDueProspect(p), false, 'and so never surfaces as due');
});

test('a 💚 prospect with two emails still has the last one coming', () => {
  const p = { rating: GREEN, emails_sent: 2, stage: 'Email 2', next_action_date: todayIso() };
  assert.equal(coldSequenceExhausted(p), false);
  assert.equal(isDueProspect(p), true);
});

// ── Parity: the two policy files must never disagree ─────────────────────

test('cutover and the live cadence agree for every rating, band and send count', () => {
  const recent = todayIso();
  let checked = 0;

  for (const rating of EVERY_RATING) {
    for (const priority_band of [null, '', PRIORITY.P1, PRIORITY.P2, PRIORITY.P3, 'P9']) {
      for (let sent = 1; sent <= 6; sent += 1) {
        const p = { rating, priority_band, emails_sent: sent, email: 'a@b.com', last_contact_date: recent };

        const exhausted = coldSequenceExhausted(p);
        const d = nextStepFor({ prospect: p, contactOk: true });
        const finished = d.next === NEXT.NO_ACTION_COMPLETE || d.next === NEXT.MANUAL_OVERRIDE_ONLY;

        assert.equal(finished, exhausted,
          `rating ${rating} band ${priority_band} at ${sent} sent: cutover says ${d.next}, cadence says exhausted=${exhausted}`);
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 200, `expected a real sweep, only checked ${checked}`);
});

// ── The stops that outrank the ceiling entirely ──────────────────────────

test('a reply, a boundary or a missing address still outranks the band', () => {
  const base = { rating: GREEN, emails_sent: 1, email: 'a@b.com', last_contact_date: todayIso() };
  assert.equal(nextStepFor({ prospect: { ...base, replied: 1 }, contactOk: true }).next, NEXT.NEEDS_HUMAN);
  assert.equal(nextStepFor({ prospect: { ...base, do_not_contact: 1 }, contactOk: true }).next, NEXT.CLOSED);
  assert.equal(nextStepFor({ prospect: { ...base, unsubscribed: 1 }, contactOk: true }).next, NEXT.CLOSED);
  assert.equal(nextStepFor({ prospect: base, contactOk: false }).next, NEXT.HOLD_CONTACT_RECOVERY);
});

// ── What this change is not allowed to do ────────────────────────────────

test('deciding a ceiling never sends, spends, or writes', () => {
  const strip = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['../lib/priority.mjs', '../lib/due.mjs', '../lib/cutover.mjs']) {
    const src = strip(f);
    for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'DELETE ', 'spendCredits', 'askBackground', 'fetch(']) {
      assert.ok(!src.includes(forbidden), `${f} must never ${forbidden}`);
    }
  }
});

test('no backfill: nothing here writes priority_band', () => {
  const strip = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
  for (const f of ['../lib/priority.mjs', '../lib/due.mjs', '../lib/cutover.mjs']) {
    assert.ok(!/SET[\s\S]{0,80}priority_band/.test(strip(f)), `${f} must not write the column`);
  }
});

// ── Auto-finish: the band ends the sequence, not a stage nobody reaches ────

test('a spent band finishes once it has been quiet long enough', async () => {
  const { shouldAutoFinish, FINISHED_AFTER_DAYS, isoShift } = await import('../lib/due.mjs');
  const quiet = isoShift(-(FINISHED_AFTER_DAYS + 1));

  // 💙 is P2: three touches under V3, all gone.
  assert.equal(
    shouldAutoFinish({ stage: 'Email 3', rating: '💙', emails_sent: 3, last_contact_date: quiet }),
    true
  );
  // The old trigger could only ever fire at Email 5. This one fires wherever
  // the band actually ran out, which under V3 is Email 1, 3, or 4.
  assert.equal(
    shouldAutoFinish({ stage: 'Email 1', rating: '✖️', emails_sent: 1, last_contact_date: quiet }),
    true,
    'P3 is finished after its single email'
  );
  assert.equal(
    shouldAutoFinish({ stage: 'Email 4', rating: '💚', emails_sent: 4, last_contact_date: quiet }),
    true
  );
});

test('auto-finish waits, so nobody is closed the morning their last email went', async () => {
  const { shouldAutoFinish, isoShift, todayIso } = await import('../lib/due.mjs');
  const spent = { stage: 'Email 4', rating: '💚', emails_sent: 4 };
  assert.equal(shouldAutoFinish({ ...spent, last_contact_date: todayIso() }), false);
  assert.equal(shouldAutoFinish({ ...spent, last_contact_date: isoShift(-3) }), false);
  assert.equal(shouldAutoFinish({ ...spent, last_contact_date: isoShift(-30) }), true);
  assert.equal(shouldAutoFinish({ ...spent, last_contact_date: null }), false,
    'no date is not the same as a long silence');
});

test('auto-finish leaves room, warm stages and owed videos alone', async () => {
  const { shouldAutoFinish, isoShift } = await import('../lib/due.mjs');
  const quiet = isoShift(-60);

  // 💚 is P1: four touches under V3, two gone. Two more still owed.
  assert.equal(
    shouldAutoFinish({ stage: 'Email 2', rating: '💚', emails_sent: 2, last_contact_date: quiet }),
    false,
    'a band with room left is not finished'
  );
  // A live conversation must never be swept, however spent the cold sequence is.
  for (const stage of ['Interested', 'Replied', 'Engaged', 'Client', 'Snoozed']) {
    assert.equal(
      shouldAutoFinish({ stage, rating: '💙', emails_sent: 5, last_contact_date: quiet }),
      false,
      `${stage} is not a cold stage and must not auto-finish`
    );
  }
  // The recording was paid for and promised; its delivery is allowed past the band.
  assert.equal(
    shouldAutoFinish({
      stage: 'Email 4', rating: '💚', emails_sent: 4, last_contact_date: quiet,
      video_url: 'https://file.gobloomwired.com/video/x', video_sent_at: null,
    }),
    false,
    'still owed a video'
  );
  assert.equal(
    shouldAutoFinish({
      stage: 'Email 4', rating: '💚', emails_sent: 4, last_contact_date: quiet,
      video_url: 'https://file.gobloomwired.com/video/x', video_sent_at: '2026-08-01',
    }),
    true,
    'once it has gone, the spent band applies'
  );
});

test('the old Email-5-only trigger could not fire under V2', async () => {
  const { FINISHED_FROM_STAGE } = await import('../lib/due.mjs');
  const { TOUCHES } = await import('../lib/priority.mjs');
  const maxTouches = Math.max(...Object.values(TOUCHES));
  const oldTriggerStep = Number(String(FINISHED_FROM_STAGE).replace('Email ', ''));
  assert.ok(
    oldTriggerStep > maxTouches,
    'this is why nothing auto-finished: the trigger stage is past every band'
  );
});

// ── A date is not permission ─────────────────────────────────────────────

test('a closed relationship is never due, whatever its date says', async () => {
  const { isDueProspect, isoShift } = await import('../lib/due.mjs');
  const overdue = isoShift(-30);

  // Ary found these sitting in Due today: someone who said no, three addresses
  // that would bounce, and a paying client. Each had a stale next_action_date,
  // and that was the whole reason they appeared.
  for (const stage of ['Rejected', 'Invalid Email', 'Client', 'Lost', 'Not This Offer', 'Finished']) {
    assert.equal(
      isDueProspect({ stage, rating: '💚', emails_sent: 1, next_action_date: overdue }),
      false,
      `${stage} must never be due`
    );
  }
});

test('Snoozed still comes back, because that is what it is for', async () => {
  const { isDueProspect, isoShift } = await import('../lib/due.mjs');
  assert.equal(
    isDueProspect({ stage: 'Snoozed', rating: '💚', emails_sent: 1, next_action_date: isoShift(-1) }),
    true
  );
});

test('an open row with room and an arrived date is still due', async () => {
  const { isDueProspect, isoShift } = await import('../lib/due.mjs');
  // The fix must not swallow the real work.
  assert.equal(
    isDueProspect({ stage: 'Email 1', rating: '💚', emails_sent: 1, next_action_date: isoShift(-2) }),
    true
  );
  // ...but a spent band still stops it, as before.
  assert.equal(
    isDueProspect({ stage: 'Email 2', rating: '✖️', emails_sent: 1, next_action_date: isoShift(-2) }),
    false
  );
});
