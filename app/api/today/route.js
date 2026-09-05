import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { PROSPECT_COLUMNS } from '@/lib/columns.mjs';
import { buildExceptionQueue, summarise } from '@/lib/exceptions.mjs';
import { listAccounts, publicView } from '@/lib/gmail-store.mjs';

export const dynamic = 'force-dynamic';

// Today, as the exception queue.
//
// Everything here is something automation could not safely finish. Routine
// background progress is deliberately absent: a list that reports the machine
// doing its job is a list nobody reads, and the whole point of the queue
// running every five minutes is that most of the day's work never reaches a
// person at all.
//
// Computed server-side because it needs three tables joined by hand — the
// prospects, their reply events, and any queue job waiting on a decision — and
// shipping all three to the browser to do it there would be slower and would
// leak more than the answer requires.

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const ws = ctx.workspace;
  const db = getDb();

  // Who could possibly be an exception.
  //
  // This used to be `LIMIT 800` with no ordering over five thousand active
  // rows, which is a lottery: the prospect who replied two minutes ago was
  // simply not in the window, and Today showed nothing. A live test on
  // 2026-08-09 landed a real reply that was correctly ingested, correctly
  // staled its draft, and never appeared, because its id was not in the
  // arbitrary first eight hundred.
  //
  // So the rows with a *reason* are fetched by that reason, and the open-ended
  // scan (for video watches, which live in a text column and cannot be
  // queried) is what gets bounded. Nothing that has already happened can fall
  // off the end.
  const ACTIVE = `deleted_at IS NULL AND stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished')`;

  // People who wrote to us, and work that is stuck. Small sets by nature, and
  // the ones that must never be cut off, so they get their own query rather
  // than competing for room with three thousand due cold rows.
  const { results: spoken } = await db
    .prepare(
      `SELECT ${PROSPECT_COLUMNS} FROM prospects
        WHERE workspace = ?1 AND ${ACTIVE}
          AND (
            id IN (SELECT DISTINCT prospect_id FROM reply_events WHERE workspace = ?1 AND prospect_id IS NOT NULL)
            OR id IN (SELECT DISTINCT prospect_id FROM jobs WHERE workspace = ?1 AND prospect_id IS NOT NULL AND status IN ('waiting','failed'))
            OR replied = 1
            OR pending_draft IS NOT NULL
          )
        ORDER BY replied DESC, COALESCE(updated_at, created_at) DESC
        LIMIT 300`
    )
    .bind(ws)
    .all();

  // Everything merely due. Ordered before it is limited, longest overdue
  // first, because an unordered LIMIT over five thousand rows is a lottery and
  // this file has already lost it once.
  const { results: due } = await db
    .prepare(
      `SELECT ${PROSPECT_COLUMNS} FROM prospects
        WHERE workspace = ? AND ${ACTIVE}
          AND next_action_date IS NOT NULL AND next_action_date <= date('now')
        ORDER BY next_action_date ASC, id DESC
        LIMIT 300`
    )
    .bind(ws)
    .all();

  // The rest, most recently touched first, for the reasons that can only be
  // found by reading a row: a video watch sits in the activity log.
  const { results: recent } = await db
    .prepare(
      `SELECT ${PROSPECT_COLUMNS} FROM prospects
        WHERE workspace = ? AND ${ACTIVE}
        ORDER BY COALESCE(updated_at, created_at) DESC
        LIMIT 400`
    )
    .bind(ws)
    .all();

  const byId = new Map();
  for (const p of [...(spoken || []), ...(due || []), ...(recent || [])]) byId.set(p.id, p);
  const prospects = [...byId.values()];

  // Direction, when, what it was — and, now, what they said.
  //
  // This query used to end at `subject` on the principle that the queue only
  // needed to reason, not to read. That was the whole reason Replies could
  // name a person and never quote them: the text existed in `snippet` and was
  // never asked for. It is ~200 characters per row and the queue is capped at
  // 1000, so the cost of carrying it is small and the cost of omitting it was
  // a tab that could not answer its own question.
  //
  // in_reply_to / refs / matched_by come along because they are what separates
  // a reply to us from a newsletter that merely arrived from a known domain.
  // One flat read, and the answered-at derivation happens in JS over the rows
  // already in hand.
  //
  // This used to be a correlated subquery: for every row, SQLite re-scanned
  // reply_events for a later outbound in the same thread. At 90 events that
  // was invisible. On 2026-08-19 a mailbox backfill grew the table to ~4,500
  // rows, and the same query became ~N x M — millions of rows read per call,
  // 8.4 BILLION rows a day across the account, and a real Cloudflare bill at
  // about $8 a day in D1 overage. The answer it computed fits in one pass
  // over rows this query already returns, for free.
  const { results: replies } = await db
    .prepare(
      `SELECT prospect_id, direction, occurred_at, classification, confidence,
              requires_human, subject, snippet, from_address,
              thread_id, in_reply_to, refs, matched_by, answered_at
         FROM reply_events
        WHERE workspace = ? AND prospect_id IS NOT NULL
        ORDER BY occurred_at DESC LIMIT 1000`
    )
    .bind(ws)
    .all();

  // answered_at has one writer and it has never run, so the stored column is
  // almost always null. It is still a fact about the thread: an inbound is
  // answered by the earliest outbound after it in the same thread. Stored
  // value wins when something eventually sets it.
  const outboundByThread = new Map();
  for (const r of replies || []) {
    if (r.direction === 'outbound' && r.thread_id) {
      const list = outboundByThread.get(r.thread_id) || [];
      list.push(r.occurred_at);
      outboundByThread.set(r.thread_id, list);
    }
  }
  for (const list of outboundByThread.values()) list.sort();
  const repliesByProspect = new Map();
  for (const r of replies || []) {
    if (r.direction === 'inbound' && !r.answered_at && r.thread_id) {
      const outs = outboundByThread.get(r.thread_id);
      if (outs) r.answered_at = outs.find((t) => t > r.occurred_at) || null;
    }
    const list = repliesByProspect.get(r.prospect_id) || [];
    list.push(r);
    repliesByProspect.set(r.prospect_id, list);
  }

  // One job per prospect, the most recent that is stuck on something.
  const { results: jobs } = await db
    .prepare(
      `SELECT prospect_id, status, error_kind, last_error, updated_at
         FROM jobs
        WHERE workspace = ? AND prospect_id IS NOT NULL
          AND (status = 'waiting' OR status = 'failed')
        ORDER BY updated_at DESC LIMIT 300`
    )
    .bind(ws)
    .all();
  // Who is actually a client.
  //
  // Read from the clients table rather than trusted from the prospect row,
  // because those two can drift and one of them already did: Good Energy
  // Coach has been a client since 2026-07-17 with a prospect row still
  // reading Interested, so Today put a client in the prospecting queue.
  //
  // Tiny query — clients are counted in single digits — and it is the last
  // thing between a client and a cold email.
  const { results: clientRows } = await db
    .prepare(`SELECT prospect_id FROM clients WHERE workspace = ? AND prospect_id IS NOT NULL`)
    .bind(ws)
    .all()
    .catch(() => ({ results: [] }));
  const clientIds = new Set((clientRows || []).map((c) => c.prospect_id));

  const jobsByProspect = new Map();
  for (const j of jobs || []) {
    if (!jobsByProspect.has(j.prospect_id)) jobsByProspect.set(j.prospect_id, j);
  }

  // Where each of them stands with Ary.
  //
  // Loaded because Today has to tell two things apart that look identical in
  // the prospect columns: somebody who wrote and is waiting, and somebody who
  // wrote three weeks ago to say no to this offer. Both are "replied and
  // nothing has gone back". Only one of them is work.
  //
  // Small by nature — one row per meaningful moment in a conversation, not one
  // per message — so the whole workspace's worth is a cheap read.
  const { results: relEvents } = await db
    .prepare(
      `SELECT prospect_id, id, state, source, occurred_at, defer_until, reason
         FROM relationship_events
        WHERE workspace = ?
        ORDER BY occurred_at ASC, id ASC
        LIMIT 2000`
    )
    .bind(ws)
    .all()
    .catch(() => ({ results: [] }));
  const relationshipByProspect = new Map();
  for (const e of relEvents || []) {
    const list = relationshipByProspect.get(e.prospect_id) || [];
    list.push({
      id: e.id, state: e.state, source: e.source,
      occurredAt: e.occurred_at, deferUntil: e.defer_until, reason: e.reason,
    });
    relationshipByProspect.set(e.prospect_id, list);
  }

  const q = buildExceptionQueue(prospects || [], { repliesByProspect, jobsByProspect, relationshipByProspect, clientIds });

  // Replies that could not be attached to anybody. Kept separate from the
  // prospect queue because the action is different: this is "who is this",
  // not "what do I say".
  const { results: unmatched } = await db
    .prepare(
      `SELECT id, message_id, occurred_at, from_address, subject, reason, candidates
         FROM unmatched_replies WHERE workspace = ? AND resolved_prospect_id IS NULL
        ORDER BY occurred_at DESC LIMIT 20`
    )
    .bind(ws)
    .all();

  // The mailbox, because outbound safety depends on it. A follow-up guard that
  // has not heard about a reply is not a guard, so a broken Gmail connection
  // belongs on the one screen Ary actually opens rather than in Settings where
  // nobody looks until something has already gone wrong.
  const accounts = await listAccounts(db, ws);

  return NextResponse.json({
    summary: summarise(q.counts, q.total),
    counts: q.counts,
    total: q.total,
    totals: q.totals,
    shown: q.shown,
    truncated: q.truncated,
    rows: q.rows,
    unmatchedReplies: unmatched || [],
    gmail: accounts.length ? publicView(accounts[0]) : { connected: false, status: 'not-connected' },
  });
}
