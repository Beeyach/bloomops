import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExceptionQueue, BUCKET } from '../lib/exceptions.mjs';
import { rankProspects } from '../lib/pick.mjs';

// Behaviour at real size.
//
// Ary's workspace holds about five thousand active prospects. Every bug this
// file exists to catch has the same shape: code that is correct on twenty rows
// and silently wrong on five thousand, where "wrong" means the one person who
// replied is not in the answer and nothing anywhere says so.
//
// That is not hypothetical. Today shipped with `LIMIT 800` and no ordering,
// and on 2026-08-09 a real reply was ingested perfectly and never appeared.

const SIZE = 5000;
const NOW = new Date('2026-08-09T12:00:00Z');

// A synthetic workspace shaped like the real one: mostly cold imports, a few
// due, a handful mid-conversation.
function makeProspects(n = SIZE) {
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const due = i % 57 === 0;
    const warm = i % 611 === 0;
    out.push({
      id: i,
      name: `Prospect ${i}`,
      business_name: `Business ${i}`,
      email: i % 13 === 0 ? null : `p${i}@example${i % 400}.com`,
      domain: `example${i % 400}.com`,
      stage: warm ? 'Interested' : 'Email 2',
      rating: i % 7 === 0 ? 3 : null,
      emails_sent: i % 5,
      next_action_date: due ? '2026-08-08' : '2026-12-01',
      last_contact_date: '2026-08-01',
      activity_log: null,
    });
  }
  return out;
}

test('the exception queue stays correct and quick at 5,000 prospects', () => {
  const prospects = makeProspects();

  // One person replied and is waiting. Buried deep on purpose: id 4,913 would
  // never survive an unordered window.
  const replier = prospects[4912];
  replier.replied = 1;
  replier.reply_date = '2026-08-09';
  replier.pending_draft = 'Subject: following up\n\nHi there. Checking in about the booking page.';
  replier.pending_draft_at = '2026-08-09T09:00:00Z';
  replier.pending_draft_stale = 1;

  const started = Date.now();
  const q = buildExceptionQueue(prospects, {
    now: NOW,
    repliesByProspect: new Map([[replier.id, [
      { direction: 'inbound', occurred_at: '2026-08-09T09:05:00Z', classification: 'question', requires_human: 1 },
    ]]]),
  });
  const elapsed = Date.now() - started;

  const row = q.rows.find((r) => r.id === replier.id);
  assert.ok(row, 'the one person waiting must be in the answer');
  assert.equal(row.bucket, BUCKET.NEEDS_REPLY);
  assert.equal(row.draft, null, 'and their stale draft must not travel');

  // Not necessarily first. Several prospects have been mid-conversation since
  // the 1st, and longest-wait-first inside a bucket is the rule. What must be
  // true is that nothing less urgent than a person waiting is above them.
  const above = q.rows.slice(0, q.rows.indexOf(row));
  assert.ok(
    above.every((r) => r.bucket === BUCKET.NEEDS_REPLY),
    'only other people waiting may outrank somebody who replied'
  );
  assert.ok(q.rows.indexOf(row) < 50, 'and they are on the first screen, not page four');
  assert.ok(elapsed < 3000, `ranking 5,000 rows took ${elapsed}ms`);
});

test('the headline still adds up to the work at 5,000 rows', () => {
  // The counts are over everything that matched; the rows are a page. Both
  // numbers are reported, and the page never silently claims to be the total.
  const prospects = makeProspects();
  // `replied = 1` alone no longer makes somebody today's work: a flag with no
  // message behind it is history, not a person waiting. So each of these gets
  // the reply it claims to have.
  const replies = new Map();
  for (let i = 0; i < 120; i += 1) {
    const p = prospects[i * 37];
    p.replied = 1;
    p.reply_date = '2026-08-08';
    replies.set(p.id, [{
      direction: 'inbound', occurred_at: '2026-08-08T10:00:00Z',
      classification: 'question', requires_human: 1, matched_by: 'thread',
      snippet: 'Can you tell me more?',
    }]);
  }
  const q = buildExceptionQueue(prospects, { now: NOW, limit: 50, repliesByProspect: replies });
  assert.equal(q.rows.length, 50);
  assert.ok(q.total > q.shown, 'a long day is a long day');
  assert.equal(q.truncated, q.total - q.shown);
  const counted = Object.values(q.counts).reduce((a, b) => a + b, 0);
  assert.equal(counted, q.total, 'counts describe everything, not just the page');
});

test('Pick ranks 5,000 prospects without falling over', () => {
  const started = Date.now();
  const ranked = rankProspects(makeProspects(), { now: NOW, limit: 10 });
  const elapsed = Date.now() - started;
  assert.equal(ranked.length, 10);
  assert.ok(elapsed < 3000, `ranking took ${elapsed}ms`);
});

// ── The query shapes themselves ───────────────────────────────────────────
//
// Pinned against the source. An unordered LIMIT is invisible in review and
// invisible in a small-data test; it only shows up in production, as silence.

test('no prospect query takes a LIMIT without deciding what it wants first', () => {
  const files = [
    'app/api/today/route.js',
    'app/api/ai/route.js',
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const queries = [...src.matchAll(/`([^`]*?\bFROM\s+prospects\b[^`]*?)`/gis)].map((m) => m[1]);
    for (const q of queries) {
      const flat = q.replace(/\s+/g, ' ');
      if (!/\bLIMIT\b/i.test(flat)) continue;
      // An existence check is allowed to take any row, because any row answers it.
      if (/^\s*SELECT\s+1\b/i.test(flat)) continue;
      assert.match(flat, /\bORDER BY\b/i, `${f}: LIMIT with no ORDER BY -> ${flat.slice(0, 90)}`);
    }
  }
});

test('Today asks for the people who spoke separately from the merely due', () => {
  // They are different sizes and different importance. Letting three thousand
  // due cold rows compete for room with the handful of people who replied is
  // exactly how the reply gets squeezed out.
  const src = readFileSync(new URL('../app/api/today/route.js', import.meta.url), 'utf8');
  assert.match(src, /FROM reply_events/, 'the people who wrote to us are fetched by that fact');
  assert.match(src, /ORDER BY next_action_date ASC/, 'and the due list is ordered before it is cut');
});
