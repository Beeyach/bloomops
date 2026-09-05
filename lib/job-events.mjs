// The queue's memory of what happened, as opposed to what is true now.
//
// `jobs` answers "what is true now and what happens next", and it should stay
// clean: a job that failed twice and then worked is a job that worked. This
// answers "what happened along the way", which the row cannot, because
// `complete()` clears the error and every `fail()` overwrites the one before.
//
// Append-only. Nothing here updates or deletes.

export const JOB_EVENT = {
  CLAIMED: 'claimed',
  SUCCEEDED: 'succeeded',
  RETRY_SCHEDULED: 'retry_scheduled',
  TERMINAL_FAILED: 'terminal_failed',
  WAITING_ON_HUMAN: 'waiting_on_human',
  WAITING_ON_BUDGET: 'waiting_on_budget',
  RELEASED: 'released',
  CANCELLED: 'cancelled',
};

// Anything that looks like a credential, removed while leaving the sentence
// readable.
//
// The point of keeping history is being able to read "parseFollowUp is not
// defined" three weeks later. A sanitizer that reduces every failure to
// "an error occurred" would preserve the row and lose the reason, so these are
// deliberately narrow: they target the shapes secrets actually arrive in, not
// anything that merely looks technical.
const SECRET_PATTERNS = [
  // Authorization headers and bearer tokens.
  [/\b(bearer)\s+[\w.\-~+/]+=*/gi, '$1 [redacted]'],
  [/\b(authorization|proxy-authorization)\s*[:=]\s*\S+/gi, '$1: [redacted]'],
  // Anything named like a secret, however it is spelled.
  [/\b([\w.-]*(?:api[_-]?key|apikey|secret|token|password|passwd|cookie|credential|auth)[\w.-]*)\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi, '$1=[redacted]'],
  // Google OAuth access and refresh tokens.
  [/\bya29\.[\w.\-]+/g, '[redacted]'],
  [/\b1\/\/[\w.\-]{20,}/g, '[redacted]'],
  // This project's own sealed-credential prefix.
  [/\benc:v1:[\w+/=.\-]+/gi, 'enc:v1:[redacted]'],
  // A query string carrying one.
  [/([?&](?:key|token|secret|access_token|api_key|sig|signature)=)[^&\s]+/gi, '$1[redacted]'],
  // A long unbroken blob is either a key or a hash, and neither is worth the
  // risk of keeping. Bounded to things with no word breaks so ordinary English
  // is untouched.
  [/\b[A-Za-z0-9_\-]{40,}\b/g, '[redacted]'],
];

export function sanitizeError(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  for (const [re, to] of SECRET_PATTERNS) s = s.replace(re, to);
  // One line, bounded. A stack trace belongs in the logs, not in a history row
  // somebody scans.
  return s.replace(/\s+/g, ' ').slice(0, 300) || null;
}

// One transition, as a prepared statement rather than a write.
//
// Returned unexecuted so the caller can put it in the same `db.batch()` as the
// state change it describes. D1 runs a batch atomically, which is what keeps
// the job row and its history from disagreeing when one of the two fails.
//
// `INSERT OR IGNORE` against the unique index does the deduplication: a
// transition replayed for the same job, attempt and event writes nothing the
// second time. Two attempts that failed with identical messages stay two rows,
// because their attempt numbers differ.
export function jobEventStatement(db, job = {}, event, {
  error = null, errorKind = null, runAfter = null, attempt = null,
} = {}) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO job_events
         (workspace, job_id, kind, attempt, event, error_kind, error, run_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      job.workspace || '',
      job.id,
      job.kind || null,
      Number(attempt ?? job.attempts) || 0,
      event,
      errorKind || null,
      sanitizeError(error),
      runAfter || null
    );
}

// The story of one job, oldest first.
export async function jobHistory(db, jobId, { limit = 40 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT attempt, event, error_kind, error, run_after, occurred_at
         FROM job_events WHERE job_id = ? ORDER BY id ASC LIMIT ?`
    )
    .bind(jobId, limit)
    .all()
    .catch(() => ({ results: [] }));
  return results || [];
}

// One line per attempt, for a person reading a finished job.
//
// A job that worked first time produces nothing worth showing, and says so by
// returning an empty list rather than a row saying it was fine.
export function summariseHistory(events = []) {
  const byAttempt = new Map();
  for (const e of events || []) {
    const n = Number(e.attempt) || 0;
    if (!byAttempt.has(n)) byAttempt.set(n, { attempt: n, events: [] });
    byAttempt.get(n).events.push(e);
  }
  const attempts = [...byAttempt.values()].sort((a, b) => a.attempt - b.attempt);
  return attempts.map(({ attempt, events: list }) => {
    const outcome = list.find((e) => e.event !== JOB_EVENT.CLAIMED) || list[0];
    return {
      attempt,
      event: outcome?.event || null,
      error: outcome?.error || null,
      errorKind: outcome?.error_kind || null,
      runAfter: outcome?.run_after || null,
      at: outcome?.occurred_at || null,
    };
  });
}
