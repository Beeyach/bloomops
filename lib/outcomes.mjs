// Recording what happened, so that one day it can be learned from.
//
// This is not analytics. Nothing reads these to produce a number, and with a
// pipeline of thirty prospects nothing should: a percentage off n=3 is a
// decimal point wearing a lab coat.
//
// It exists now because these events are unrecoverable. A Vet verdict that was
// never written down cannot be scored against the reply that arrived three
// weeks later, and by the time there is enough history to learn from, the
// early months are gone. The cost of writing them is one insert; the cost of
// not writing them is that the question can never be asked.

export const KIND = {
  VET: 'vet',
  OUTREACH: 'outreach',
  // An outreach email actually left. Distinct from OUTREACH, which records
  // that one was approved. See lib/send-events.mjs for why the difference
  // matters more than it sounds like it should.
  SEND: 'send',
  REPLY: 'reply',
  VIDEO_SENT: 'video-sent',
  VIDEO_WATCHED: 'video-watched',
  STAGE: 'stage',
  // The first time a prospect became a client. Once, ever.
  CLIENT: 'client',
};

// Stages worth an event. Deliberately short: event-sourcing every move a row
// makes would fill the table with New-to-Contacted noise and make the terminal
// transitions harder to find, not easier.
//
// Everything here is an end state, and an end state is the only kind of stage
// change a later analysis actually needs a timestamp for.
export const TERMINAL_STAGES = new Set([
  'Client', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished', 'Do Not Contact',
]);

// Where a transition came from. A person moving a row and an integration
// moving it are different evidence, and "we do not know" has to stay sayable.
export const SOURCE = { HUMAN: 'human', INTEGRATION: 'integration', OTHER: 'other' };

// Record a move into a terminal stage, and stamp the first time a prospect
// became a client.
//
// The client stamp is write-once. Editing a client's record next March must not
// move the date they became one, and an UPDATE guarded on IS NULL is the only
// version of this that survives somebody flipping a row back and forth.
export async function recordTransition(db, { workspace, prospect = {}, to, from = null, source = SOURCE.HUMAN }) {
  const stage = String(to || '').trim();
  if (!stage || !TERMINAL_STAGES.has(stage)) return { recorded: false };
  const prospectId = prospect.id;
  if (!prospectId) return { recorded: false };

  let firstClient = false;
  if (stage === 'Client') {
    try {
      const res = await db
        .prepare(`UPDATE prospects SET first_client_at = datetime('now') WHERE id = ? AND workspace = ? AND first_client_at IS NULL`)
        .bind(prospectId, workspace)
        .run();
      firstClient = Boolean(res.meta.changes);
    } catch {
      // A missing column on an un-migrated database must not stop the stage
      // change the user actually asked for.
    }
    if (firstClient) {
      await recordOutcome(db, {
        workspace,
        prospectId,
        kind: KIND.CLIENT,
        value: source,
        context: snapshot(prospect, { from: from || prospect.stage || null }),
      });
    }
  }

  await recordOutcome(db, {
    workspace,
    prospectId,
    kind: KIND.STAGE,
    value: stage,
    context: snapshot(prospect, { from: from || null, source }),
  });

  return { recorded: true, firstClient };
}

// Never throws. Losing an event costs a row in a report nobody is reading yet;
// throwing would cost the user the thing they were actually doing.
export async function recordOutcome(db, { workspace, prospectId = null, kind, value = null, context = null }) {
  try {
    await db
      .prepare('INSERT INTO outcome_events (workspace, prospect_id, kind, value, context) VALUES (?, ?, ?, ?, ?)')
      .bind(
        workspace,
        prospectId,
        kind,
        value == null ? null : String(value).slice(0, 120),
        context ? JSON.stringify(context).slice(0, 2000) : null
      )
      .run();
  } catch {
    // Deliberately silent.
  }
}

// What was true about a prospect at the moment a decision was made. Snapshotted
// rather than looked up later, because the record changes and the question is
// always "what did we know when we decided", not "what do we know now".
export function snapshot(p = {}, extra = {}) {
  return {
    stage: p.stage || 'New',
    emailsSent: Number(p.emails_sent) || 0,
    replied: Boolean(p.replied),
    replyType: p.reply_type || null,
    hasVideo: Boolean(p.video_url),
    videoSent: Boolean(p.video_sent_at),
    niche: p.niche || null,
    country: p.country || null,
    source: p.source || null,
    ...extra,
  };
}

// Counting, with the sample size attached to every line. The rule this file
// enforces on its readers: a rate is never returned without the n that
// produced it, so nobody can quote "40%" without seeing it was two out of five.
export function tally(events = [], { kind, by = 'value' } = {}) {
  const rows = kind ? events.filter((e) => e.kind === kind) : events;
  const counts = new Map();
  for (const e of rows) {
    let key;
    if (by === 'value') key = e.value || 'unknown';
    else {
      let ctx = {};
      try { ctx = JSON.parse(e.context || '{}'); } catch {}
      key = ctx[by] == null ? 'unknown' : String(ctx[by]);
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = rows.length;
  return {
    total,
    // Sorted by count so the biggest bucket reads first.
    buckets: [...counts.entries()]
      .map(([key, n]) => ({ key, n, share: total ? n / total : 0 }))
      .sort((a, b) => b.n - a.n),
  };
}

// Whether a comparison is worth showing at all. Deliberately blunt: below this
// the honest answer is "not enough yet", and saying so is more useful than a
// number that will reverse next week.
export const MIN_SAMPLE = 20;

export function readable(bucket, total) {
  if (total < MIN_SAMPLE) {
    return `${bucket.n} of ${total}. Too few to draw anything from yet.`;
  }
  return `${bucket.n} of ${total} (${Math.round(bucket.share * 100)}%)`;
}
