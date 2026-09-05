// The prospect row's outreach facts, kept true to the evidence.
//
// reply_events is what actually happened — native guarded sends, the
// sent-mail observer's findings, synced replies. The row's counters
// (emails_sent, last_contact_date, replied) are what every list, tab count,
// follow-up calculation and next-action answer reads. When they disagree,
// the row is lying to the router: a prospect whose two manual sends were
// never counted looks fresher than she is, which is how over-contacting
// happens.
//
// Rules, deliberately asymmetric:
//   1. Counters only ever go UP to meet the evidence. The observer's
//      historical crawl may still be mid-walk, so a low evidence count must
//      never pull a hand-kept counter down.
//   2. Reply flags are only ever SET, never cleared, and reply_type is not
//      touched at all — reading what a reply meant belongs to the
//      classifier and to Ary, not to a reconciliation pass.
//   3. Nothing else on the row is touched. No stage, no do_not_contact, no
//      dates that drive scheduling directly.
//
// Shape: detect first, then update only the drifted rows. The previous
// version ran the ratchet UPDATE against every prospect that ever had an
// outbound event, every drain, so the correlated subqueries re-read the
// event history ~350 times a day whether anything had changed or not —
// 1.2 billion rows a day to change a handful. The detector is one aggregate
// pass over reply_events; in the steady state it returns nothing and no
// UPDATE runs at all.

// Bound one pass. Anything past the cap is picked up by the next drain,
// minutes later — reconciliation is a ratchet, so arriving late is fine.
const DRIFT_CAP = 200;

// What counts as a genuine reply, shared by both inbound passes.
const REAL_REPLY = `direction = 'inbound' AND (in_reply_to IS NOT NULL OR refs IS NOT NULL OR matched_by IS NULL OR matched_by != 'domain')`;

export async function reconcileProspectFacts(db) {
  // rowsRead is this pass's own D1 meter, summed from each statement's meta.
  // The drain hands it to the spend breaker: the first run that reads like
  // the Aug 2026 burns trips the pause flag itself, instead of six days of
  // flat-line burn and an invoice being what finally says something.
  const out = { counters: 0, replies: 0, rowsRead: 0 };
  const meter = (r) => { out.rowsRead += Number(r?.meta?.rows_read) || 0; return r; };

  // Outbound truth → the counter and the last contact date. The native
  // transport's idempotency marker rows are bookkeeping, not emails.
  const { results: drifted } = await db
    .prepare(
      `SELECT p.id FROM prospects p
         JOIN (
           SELECT workspace, prospect_id,
                  COUNT(*) AS sends,
                  substr(MAX(occurred_at), 1, 10) AS last_day
             FROM reply_events
            WHERE direction = 'outbound' AND prospect_id IS NOT NULL
              AND COALESCE(snippet, '') != 'idempotency marker'
            GROUP BY workspace, prospect_id
         ) a ON a.prospect_id = p.id AND a.workspace = p.workspace
        WHERE p.deleted_at IS NULL
          AND (COALESCE(p.emails_sent, 0) < a.sends
               OR COALESCE(p.last_contact_date, '') < COALESCE(a.last_day, ''))
        LIMIT ${DRIFT_CAP}`
    )
    .all()
    .then(meter)
    .catch(() => ({ results: [] }));
  const counterIds = (drifted || []).map((r) => r.id);

  if (counterIds.length) {
    const marks = counterIds.map(() => '?').join(',');
    const r1 = await db
      .prepare(
        `UPDATE prospects SET
           emails_sent = MAX(COALESCE(emails_sent, 0), (
             SELECT COUNT(*) FROM reply_events r
              WHERE r.workspace = prospects.workspace AND r.prospect_id = prospects.id
                AND r.direction = 'outbound'
                AND COALESCE(r.snippet, '') != 'idempotency marker'
           )),
           last_contact_date = MAX(COALESCE(last_contact_date, ''), COALESCE((
             SELECT substr(MAX(r.occurred_at), 1, 10) FROM reply_events r
              WHERE r.workspace = prospects.workspace AND r.prospect_id = prospects.id
                AND r.direction = 'outbound'
                AND COALESCE(r.snippet, '') != 'idempotency marker'
           ), ''))
         WHERE deleted_at IS NULL AND id IN (${marks})`
      )
      .bind(...counterIds)
      .run()
      .then(meter)
      .catch(() => null);
    out.counters = r1?.meta?.changes || 0;
  }

  // Inbound truth → the replied flag, where a genuine reply exists and the
  // row still says nobody wrote. The date recorded is the FIRST real reply.
  //
  // Driven from reply_events with an EXISTS probe, not a JOIN from prospects.
  // The first version of this detector was that join, and D1 ran it as a
  // nested full scan: 24.5 million rows and 13.5 seconds per drain, 7.2
  // billion rows a day — a worse burn than the one this file was rewritten
  // to stop, hidden inside the fix for it. Measured on production, this
  // shape reads 4,569 rows in 4ms for the same answer. The lesson is the
  // file's rule now: every detector starts from reply_events, the small
  // table, and probes prospects by primary key.
  const { results: unreplied } = await db
    .prepare(
      `SELECT DISTINCT r.prospect_id AS id FROM reply_events r
        WHERE r.prospect_id IS NOT NULL AND ${REAL_REPLY}
          AND EXISTS (
            SELECT 1 FROM prospects p
             WHERE p.id = r.prospect_id AND p.workspace = r.workspace
               AND p.deleted_at IS NULL AND COALESCE(p.replied, 0) = 0
          )
        LIMIT ${DRIFT_CAP}`
    )
    .all()
    .then(meter)
    .catch(() => ({ results: [] }));
  const replyIds = (unreplied || []).map((r) => r.id);

  if (replyIds.length) {
    const marks = replyIds.map(() => '?').join(',');
    const r2 = await db
      .prepare(
        `UPDATE prospects SET
           replied = 1,
           reply_date = COALESCE(reply_date, (
             SELECT substr(MIN(r.occurred_at), 1, 10) FROM reply_events r
              WHERE r.workspace = prospects.workspace AND r.prospect_id = prospects.id AND ${REAL_REPLY}
           )),
           reply_at = COALESCE(reply_at, (
             SELECT MIN(r.occurred_at) FROM reply_events r
              WHERE r.workspace = prospects.workspace AND r.prospect_id = prospects.id AND ${REAL_REPLY}
           ))
         WHERE deleted_at IS NULL AND COALESCE(replied, 0) = 0 AND id IN (${marks})`
      )
      .bind(...replyIds)
      .run()
      .then(meter)
      .catch(() => null);
    out.replies = r2?.meta?.changes || 0;
  }

  return out;
}
