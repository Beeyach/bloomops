// The moment an outreach email actually left.
//
// This product does not send. The sweep skill does, from Ary's own mailbox,
// which is a deliberate design decision and also the reason the outcome chain
// stopped one step short of useful: the database knew a package was APPROVED
// and had no idea whether anything happened next.
//
// Approved is not sent. Reading it as sent would have inflated every funnel
// silently, and the inflation would have been largest exactly where it matters
// most, on the days she approved a batch and then ran out of time.
//
// Three ways a send becomes known, in descending order of how much we trust it:
//
//   skill-callback    the sender told us, with the Gmail message id
//   gmail-reconcile   the callback was lost, and the sent mail proves it anyway
//   manual            a person recorded it
//
// All three converge on one table and one idempotency key, so the same send
// arriving by two routes is one row.

import { recordOutcome, KIND } from './outcomes.mjs';
import { HARD_TOUCH_CEILING } from './priority.mjs';

// The highest cold step that can exist, from the band table rather than a
// number typed here. Nothing outside 1..this may ever be filed as a cold send,
// which is what keeps a conversational reply from becoming "Email 4".
export const MAX_SEQUENCE_STEP = HARD_TOUCH_CEILING;

export const VIA = {
  // The product sent it itself, through the Gmail API. The provider id comes
  // back in the same response, so this is the only route where a send is
  // strongly identified from the first instant.
  NATIVE: 'native',
  CALLBACK: 'skill-callback',
  RECONCILE: 'gmail-reconcile',
  MANUAL: 'manual',
};

// How strongly we know WHICH message this event is, strongest first.
//
// The distinction the send record needs and did not have: "Gmail gave us this
// id when it accepted the message" and "an email went to that address around
// then" are different claims. Both are worth recording; filing the second as
// the first is what turns a reasonable inference into fabricated history.
export const IDENTITY = {
  // The provider handed us an id at send time. Nothing beats this.
  PROVIDER_MESSAGE_ID: 'provider-message-id',
  // The RFC 5322 Message-ID from the headers. As stable, one hop later.
  RFC_MESSAGE_ID: 'rfc-message-id',
  // A thread plus a position in it. Good, and only as good as the thread match.
  THREAD_CHRONOLOGY: 'thread-chronology',
  // Recipient, timing and an approved package. A real send, weakly identified.
  DERIVED: 'derived',
};

// Ordered strongest to weakest, so an upgrade is a comparison rather than a
// pile of if-statements.
const IDENTITY_RANK = [
  IDENTITY.PROVIDER_MESSAGE_ID,
  IDENTITY.RFC_MESSAGE_ID,
  IDENTITY.THREAD_CHRONOLOGY,
  IDENTITY.DERIVED,
];

export const strongerThan = (a, b) => IDENTITY_RANK.indexOf(a) < IDENTITY_RANK.indexOf(b);

// What the caller actually supplied decides the claim, not what it says it is.
export function identityOf({ providerMessageId, rfcMessageId, providerThreadId }) {
  if (providerMessageId) return IDENTITY.PROVIDER_MESSAGE_ID;
  if (rfcMessageId) return IDENTITY.RFC_MESSAGE_ID;
  if (providerThreadId) return IDENTITY.THREAD_CHRONOLOGY;
  return IDENTITY.DERIVED;
}

// What makes two send reports the same send.
//
// The provider's message id when there is one: Gmail assigns it at send time
// and it survives everything. Without one, the fallback is the tuple that
// cannot legitimately repeat — this prospect, this step, this day. A retry
// after a dropped connection lands on the same key; a genuine second email
// tomorrow does not.
export function dedupeKey({ providerMessageId, rfcMessageId, prospectId, sequenceStep = 1, sentAt }) {
  const id = String(providerMessageId || '').trim();
  if (id) return `msg:${id}`;
  // The RFC Message-ID identifies the same message one hop later, so it has to
  // produce the SAME key as the provider id would not: a callback carrying
  // neither and a later sync carrying both must still collapse to one event,
  // which is what the derived key below is for. Using rfc here as its own key
  // space would create a second event for the same send.
  const day = String(sentAt || '').slice(0, 10) || 'undated';
  return `derived:${prospectId}:${sequenceStep}:${day}`;
}

// Record that a message went out. Idempotent by construction.
//
// Returns { recorded: true } the first time and { recorded: false, duplicate:
// true } on every repeat. The caller needs to know which, because everything
// downstream — advancing the sequence, incrementing emails_sent, charging
// anything — must happen exactly as often as the send did.
export async function recordSend(db, {
  workspace,
  prospectId,
  packageId = null,
  packageVersion = null,
  generatorVersion = null,
  playbook = null,
  sequenceStep = 1,
  channel = 'email',
  provider = 'gmail',
  providerMessageId = null,
  rfcMessageId = null,
  providerThreadId = null,
  subject = null,
  sentAt = null,
  via = VIA.CALLBACK,
  // The approval fingerprint that the guard actually compared before this went
  // out. Passed in rather than recomputed here: recomputing after the send
  // would record what the package says NOW, which is not the question. The
  // question is what was checked, and only the caller that ran the check knows.
  //
  // The column has existed since this table shipped and was never written, so
  // every historical row is NULL. Those rows stay NULL: they are truthful about
  // what was recorded at the time, and inventing values for them would turn an
  // audit gap into an audit lie.
  approvalFingerprint = null,
}) {
  if (!workspace || !prospectId) {
    return { recorded: false, error: 'A send needs a workspace and a prospect.' };
  }
  // The bound lives at the write, not only at the caller. A cold sequence has
  // three steps at most, so a row outside that range is not a cold send and
  // must never be counted as one by anything reading this table.
  const stepNum = Number(sequenceStep);
  if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > MAX_SEQUENCE_STEP) {
    return { recorded: false, error: `Step ${sequenceStep} is not a cold sequence step.` };
  }
  const when = sentAt || new Date().toISOString();
  const key = dedupeKey({ providerMessageId, rfcMessageId, prospectId, sequenceStep, sentAt: when });
  const identity = identityOf({ providerMessageId, rfcMessageId, providerThreadId });
  // A send whose identity is only "somebody at that address, around then" is
  // still a real send. It is recorded, and flagged, so anything that needs to
  // know WHICH message can tell that this row cannot answer that.
  const weak = identity === IDENTITY.DERIVED ? 1 : 0;

  // INSERT OR IGNORE against the unique index rather than SELECT-then-INSERT.
  // Two callbacks arriving together would both pass a read check and both
  // insert; the index is the only thing that can actually decide.
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO send_events
        (workspace, prospect_id, package_id, package_version, generator_version, playbook,
         sequence_step, channel, provider, provider_message_id, provider_thread_id,
         subject, sent_at, recorded_via, dedupe_key, identity, needs_reconciliation,
         approval_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      workspace, prospectId, packageId, packageVersion, generatorVersion, playbook,
      sequenceStep, channel, provider, providerMessageId || rfcMessageId, providerThreadId,
      subject, when, via, key, identity, weak, approvalFingerprint || null
    )
    .run();

  if (!res.meta.changes) {
    return { recorded: false, duplicate: true, dedupeKey: key, identity };
  }

  // The outcome event is written only on a real insert, so the two tables can
  // never disagree about how many sends happened.
  await recordOutcome(db, {
    workspace,
    prospectId,
    kind: KIND.SEND,
    value: `step-${sequenceStep}`,
    context: { playbook, generatorVersion, packageVersion, provider, via, threadId: providerThreadId },
  });

  return { recorded: true, dedupeKey: key, sentAt: when, identity, needsReconciliation: Boolean(weak) };
}

// The mailbox found a message. Attach it to the send we already recorded.
//
// This is the half the first version got wrong. The skill records a send the
// moment Gmail's compose window closes, with no message id, because the UI
// never gives it one. The native sync sees the same message minutes later WITH
// its id, and calling recordSend there produced a second row: same email, two
// sends, and a prospect that looked twice as contacted as they were.
//
// Mailbox observation confirms. It does not create.
export const RECONCILE = {
  CONFIRMED: 'CONFIRMED',       // matched one existing send, ids attached
  ALREADY: 'ALREADY',           // that message is already on a send
  RECORDED: 'RECORDED',         // no prior send existed; this is the record
  AMBIGUOUS: 'AMBIGUOUS',       // more than one candidate. Refused
  NO_MATCH: 'NO_MATCH',         // nothing to attach it to
};

// Attach provider identifiers to an existing send, or refuse.
//
// Refusing is the feature. When two sends to the same person sit inside the
// window, picking one is a coin flip written into the record as a fact, and
// nothing downstream could ever tell it was a guess.
export async function confirmSend(db, workspace, {
  prospectId,
  providerMessageId = null,
  rfcMessageId = null,
  providerThreadId = null,
  sentAt = null,
  windowHours = 48,
}) {
  const msgId = providerMessageId || rfcMessageId;
  if (!msgId) return { status: RECONCILE.NO_MATCH, why: 'Nothing to attach: the message carried no identifier.' };

  // Already attached somewhere? Then this is a re-observation, not a send.
  const existing = await db
    .prepare(`SELECT id, prospect_id FROM send_events WHERE workspace = ? AND provider_message_id = ?`)
    .bind(workspace, msgId)
    .first();
  if (existing) return { status: RECONCILE.ALREADY, sendId: existing.id, prospectId: existing.prospect_id };

  const when = sentAt || new Date().toISOString();
  const { results } = await db
    .prepare(
      `SELECT id, sequence_step, sent_at, identity FROM send_events
        WHERE workspace = ? AND prospect_id = ?
          AND provider_message_id IS NULL
          AND sent_at >= datetime(?, ?)
          AND sent_at <= datetime(?, ?)
        ORDER BY sent_at DESC`
    )
    .bind(workspace, prospectId, when, `-${Number(windowHours) || 48} hours`, when, `+${Number(windowHours) || 48} hours`)
    .all();

  const candidates = results || [];
  if (candidates.length > 1) {
    // Flag every candidate rather than picking. A person can see all of them.
    for (const c of candidates) {
      await db.prepare(`UPDATE send_events SET needs_reconciliation = 1 WHERE id = ?`).bind(c.id).run();
    }
    return {
      status: RECONCILE.AMBIGUOUS,
      candidates: candidates.map((c) => ({ sendId: c.id, step: c.sequence_step, sentAt: c.sent_at })),
      why: `${candidates.length} unidentified sends to this prospect inside the window. Which one this message is cannot be established without guessing.`,
    };
  }
  if (!candidates.length) return { status: RECONCILE.NO_MATCH, why: 'No unidentified send is waiting for an id on this prospect.' };

  const hit = candidates[0];
  const identity = identityOf({ providerMessageId, rfcMessageId, providerThreadId });
  await db
    .prepare(
      `UPDATE send_events
          SET provider_message_id = ?, provider_thread_id = COALESCE(?, provider_thread_id),
              identity = ?, needs_reconciliation = 0, dedupe_key = ?
        WHERE id = ?`
    )
    .bind(msgId, providerThreadId, identity, `msg:${msgId}`, hit.id)
    .run();

  return { status: RECONCILE.CONFIRMED, sendId: hit.id, identity, upgradedFrom: hit.identity };
}

// Attach identifiers the mailbox already has, in whichever order they arrived.
//
// Found by the first real production send. The Pub/Sub push saw the outbound
// message at 17:01:40 and the skill reported the send at 17:01:54, so
// confirmSend ran fourteen seconds before there was anything to confirm and
// correctly did nothing. The derived row then sat unidentified forever, even
// though the mailbox had recorded the message id the whole time.
//
// Confirmation cannot only run when a message arrives. It also has to run from
// the other side: a send that wants an id, looking for a message that already
// has one. Same refusal rules.
export async function reconcileFromMailbox(db, workspace, { windowHours = 48 } = {}) {
  const pending = await needingReconciliation(db, workspace);
  const out = { pending: pending.length, confirmed: 0, ambiguous: [], noMatch: 0 };

  for (const s of pending) {
    const { results } = await db
      .prepare(
        `SELECT message_id, thread_id, rfc_message_id, occurred_at
           FROM reply_events
          WHERE workspace = ? AND prospect_id = ? AND direction = 'outbound'
            AND occurred_at >= datetime(?, ?) AND occurred_at <= datetime(?, ?)
            AND message_id NOT IN (SELECT COALESCE(provider_message_id, '') FROM send_events WHERE workspace = ?)`
      )
      .bind(
        workspace, s.prospect_id,
        s.sent_at, `-${windowHours} hours`, s.sent_at, `+${windowHours} hours`,
        workspace
      )
      .all()
      // Not swallowed into an empty result. A query that cannot run and a
      // mailbox with nothing in it are indistinguishable once both return no
      // rows, and the difference is "this is broken" against "nothing to do".
      // The first version caught this and reported a quiet no-match; the test
      // schema was missing a column and it looked like normal operation.
      .catch((e) => ({ results: null, error: e?.message || 'query failed' }));

    if (!results) { out.failed = (out.failed || 0) + 1; continue; }
    const msgs = results;
    if (!msgs.length) { out.noMatch += 1; continue; }
    if (msgs.length > 1) {
      // Two of our own messages to this prospect inside the window. Which one
      // this send is cannot be settled without guessing, so it is not.
      out.ambiguous.push({ sendId: s.id, prospectId: s.prospect_id, candidates: msgs.map((m) => m.message_id) });
      continue;
    }

    const m = msgs[0];
    const r = await confirmSend(db, workspace, {
      prospectId: s.prospect_id,
      providerMessageId: m.message_id,
      rfcMessageId: m.rfc_message_id || null,
      providerThreadId: m.thread_id || null,
      sentAt: s.sent_at,
    });
    if (r.status === RECONCILE.CONFIRMED) out.confirmed += 1;
    else if (r.status === RECONCILE.AMBIGUOUS) out.ambiguous.push({ sendId: s.id, ...r });
    else out.noMatch += 1;
  }

  return out;
}

// Sends that are real and whose identity nobody could establish.
export async function needingReconciliation(db, workspace) {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.prospect_id, s.sequence_step, s.sent_at, s.subject, s.identity, p.name, p.email
         FROM send_events s LEFT JOIN prospects p ON p.id = s.prospect_id
        WHERE s.workspace = ? AND s.needs_reconciliation = 1
        ORDER BY s.sent_at DESC`
    )
    .bind(workspace)
    .all();
  return results || [];
}

// Everything already recorded for a prospect, oldest first.
export async function sendsFor(db, workspace, prospectId) {
  const { results } = await db
    .prepare(`SELECT * FROM send_events WHERE workspace = ? AND prospect_id = ? ORDER BY sent_at ASC`)
    .bind(workspace, prospectId)
    .all();
  return results || [];
}

// ── Reconciliation ───────────────────────────────────────────────────────
// The callback is the fast path, not the safe one. A skill that sends
// successfully and then fails to report it would lose the send forever, and
// the loss would be invisible: no error, no gap, just a prospect that looks
// like it was never contacted.
//
// Gmail already holds the proof. Every message she sent is in the mailbox with
// its own id and thread id, so the sent side of a thread we know about is
// enough to establish that a send happened and roughly when.

// Which packages were approved and have no send recorded? These are the ones
// worth looking for in the mailbox.
export async function awaitingSend(db, workspace, { olderThanMinutes = 30 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT pk.id AS package_id, pk.prospect_id, pk.version, pk.generator_version,
              pk.playbook, pk.email_subject, pk.reviewed_at, p.email, p.name
         FROM outreach_packages pk
         JOIN prospects p ON p.id = pk.prospect_id
        WHERE pk.workspace = ?
          AND pk.status = 'APPROVED'
          AND pk.reviewed_at IS NOT NULL
          AND pk.reviewed_at <= datetime('now', ?)
          AND NOT EXISTS (
            SELECT 1 FROM send_events s
             WHERE s.workspace = pk.workspace AND s.prospect_id = pk.prospect_id
               AND s.sent_at >= pk.reviewed_at
          )
        ORDER BY pk.reviewed_at ASC`
    )
    .bind(workspace, `-${Number(olderThanMinutes) || 30} minutes`)
    .all();
  return results || [];
}

// Turn one outbound Gmail message into a send record, if it belongs to a
// prospect we are waiting on.
//
// Matching is deliberately narrow: the recipient address has to be the
// prospect's. A subject-line match would be a guess, and a wrong guess here
// writes a false send into the causal chain that nothing later can detect.
export function matchOutbound(message, pending) {
  const to = String(message?.to || '').toLowerCase();
  if (!to) return { match: null, why: 'The message had no recipient.' };
  const hits = pending.filter((p) => p.email && to.includes(String(p.email).toLowerCase()));
  if (!hits.length) return { match: null, why: 'No approved package is waiting for a send to that address.' };
  if (hits.length > 1) {
    // Recipient alone is not enough when more than one thing could be it. The
    // brief's rule, and the right one: a subject line would break the tie and
    // would be a guess, because subjects repeat across a sequence.
    return { match: null, ambiguous: hits, why: `${hits.length} approved packages are waiting for a send to that address.` };
  }
  return { match: hits[0] };
}

// Reconcile a batch of outbound messages against the approved-but-unrecorded
// list. Returns what it did, in counts, because this runs unattended and the
// only way to know it is working is that the numbers move.
export async function reconcileSends(db, workspace, outboundMessages = [], { olderThanMinutes = 30 } = {}) {
  const summary = { pending: 0, confirmed: 0, alreadyKnown: 0, recorded: 0, ambiguous: [], unmatched: 0 };

  // Confirmation first, on every message, whether or not a package is pending.
  //
  // This is the ordering that stops the double-count. The skill records a send
  // with no message id the moment Gmail's compose window closes; the sync sees
  // the same message later WITH its id. Recording again there produced a second
  // row for one email. Attaching the id to the row that already exists is both
  // correct and the only version that leaves one event behind.
  const leftover = [];
  for (const msg of outboundMessages) {
    if (!msg?.prospectId) { leftover.push(msg); continue; }
    const r = await confirmSend(db, workspace, {
      prospectId: msg.prospectId,
      providerMessageId: msg.id || null,
      rfcMessageId: msg.rfcMessageId || null,
      providerThreadId: msg.threadId || null,
      sentAt: msg.sentAt || null,
    });
    if (r.status === RECONCILE.CONFIRMED) summary.confirmed += 1;
    else if (r.status === RECONCILE.ALREADY) summary.alreadyKnown += 1;
    else if (r.status === RECONCILE.AMBIGUOUS) summary.ambiguous.push({ prospectId: msg.prospectId, ...r });
    else leftover.push(msg);
  }

  // What is left is recovery: a send the product never heard about at all.
  const pending = await awaitingSend(db, workspace, { olderThanMinutes });
  summary.pending = pending.length;
  if (!pending.length) {
    summary.unmatched = leftover.length;
    return summary;
  }

  for (const msg of leftover) {
    const { match, ambiguous, why } = matchOutbound(msg, pending);
    if (ambiguous) {
      summary.ambiguous.push({ messageId: msg.id || null, candidates: ambiguous.map((a) => a.prospect_id), why });
      continue;
    }
    if (!match) { summary.unmatched += 1; continue; }

    // A confirm pass first, in case a send for this prospect already exists
    // and simply was not linked by prospectId on the message.
    const c = await confirmSend(db, workspace, {
      prospectId: match.prospect_id,
      providerMessageId: msg.id || null,
      rfcMessageId: msg.rfcMessageId || null,
      providerThreadId: msg.threadId || null,
      sentAt: msg.sentAt || null,
    });
    if (c.status === RECONCILE.CONFIRMED) { summary.confirmed += 1; continue; }
    if (c.status === RECONCILE.ALREADY) { summary.alreadyKnown += 1; continue; }
    if (c.status === RECONCILE.AMBIGUOUS) { summary.ambiguous.push({ prospectId: match.prospect_id, ...c }); continue; }

    const r = await recordSend(db, {
      workspace,
      prospectId: match.prospect_id,
      packageId: match.package_id,
      packageVersion: match.version,
      generatorVersion: match.generator_version,
      playbook: match.playbook,
      sequenceStep: 1,
      providerMessageId: msg.id || null,
      rfcMessageId: msg.rfcMessageId || null,
      providerThreadId: msg.threadId || null,
      subject: msg.subject || match.email_subject || null,
      sentAt: msg.sentAt || null,
      via: VIA.RECONCILE,
    });
    if (r.recorded) summary.recorded += 1;
  }

  return summary;
}

// ── Which cold step is going out ─────────────────────────────────────────
//
// The step used to be `emails_sent + 1` when a caller said "this is a
// follow-up", and 1 whenever nobody said anything. Both callers of
// sendApproved left it unsaid, so every send recorded as step 1. Nothing had
// gone wrong yet because every send so far HAS been a first email, but the
// first real Email 2 would have been filed as an Email 1, and the scheduler
// would then have read its date as the start of the sequence and moved Email 3
// forward by however long the gap was.
//
// So the step is counted from what actually went out, not from a flag.

// How many cold emails this prospect has really had, as recorded.
export async function coldSendCount(db, workspace, prospectId) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM send_events
               WHERE workspace = ? AND prospect_id = ? AND sequence_step BETWEEN 1 AND ?`)
    .bind(workspace, prospectId, MAX_SEQUENCE_STEP)
    .first()
    .catch(() => null);
  return Number(row?.n) || 0;
}

// The step this send is, and whether it may be sent at all.
//
// Recorded events are the authority. `emails_sent` is consulted only when a
// prospect has no events, which is every prospect contacted before LTB could
// send: without that fallback their next email would record as step 1 and
// restart a sequence that is already two thirds done.
export async function nextColdStep(db, workspace, prospect, { ceiling, declared = null } = {}) {
  const recorded = await coldSendCount(db, workspace, prospect.id);
  const legacy = Math.max(0, Number(prospect.emails_sent) || 0);
  const already = recorded || legacy;
  const step = already + 1;
  const source = recorded ? 'recorded sends' : legacy ? 'the legacy sent count' : 'nothing sent yet';

  if (step > MAX_SEQUENCE_STEP) {
    return { ok: false, step, reason: `${already} cold emails have already gone. There is no step ${step}.` };
  }
  if (Number.isFinite(ceiling) && step > ceiling) {
    return { ok: false, step, reason: `Their band allows ${ceiling} cold ${ceiling === 1 ? 'email' : 'emails'}, and ${already} have gone.` };
  }
  // A caller that thinks it knows the step must agree. Disagreement means one
  // of the two is wrong, and recording either would be recording a guess.
  if (declared != null && Number(declared) !== step) {
    return { ok: false, step, reason: `This was sent as step ${declared}, but ${already} cold emails are on record, which makes it step ${step}.` };
  }
  return { ok: true, step, already, source };
}

// ── Repairing a send that recorded no event ──────────────────────────────
//
// The dangerous shape: Gmail accepts the message, the attempt is marked
// succeeded, and the event insert then fails. The email is gone and nothing
// downstream knows it exists.
//
// The attempt row already holds every fact needed to write the event: the
// provider id Gmail returned, the step, and when it finished. So the repair is
// local and exact, and it never re-sends anything. Idempotent because the
// dedupe key is derived from the provider message id.
export async function succeededWithoutEvent(db, workspace) {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.prospect_id, a.package_id, a.sequence_step, a.provider_message_id,
              a.provider_thread_id, a.finished_at
         FROM send_attempts a
        WHERE a.workspace = ? AND a.state = 'succeeded'
          AND a.provider_message_id IS NOT NULL AND a.provider_message_id != ''
          AND NOT EXISTS (
            SELECT 1 FROM send_events e
             WHERE e.workspace = a.workspace AND e.provider_message_id = a.provider_message_id
          )
        ORDER BY a.finished_at ASC`
    )
    .bind(workspace)
    .all()
    .catch(() => ({ results: [] }));
  return results || [];
}

export async function repairMissingEvents(db, workspace, { write = false } = {}) {
  const rows = await succeededWithoutEvent(db, workspace);
  const repaired = [];
  const unrepairable = [];

  for (const a of rows) {
    const step = Number(a.sequence_step);
    // A step that is not on record cannot be invented here. Better a visible
    // gap than a confident wrong number in the sequence history.
    if (!Number.isInteger(step) || step < 1 || step > MAX_SEQUENCE_STEP) {
      unrepairable.push({ attemptId: a.id, prospectId: a.prospect_id, why: `The attempt records step ${a.sequence_step}, which is not a cold step.` });
      continue;
    }
    if (!a.finished_at) {
      unrepairable.push({ attemptId: a.id, prospectId: a.prospect_id, why: 'The attempt has no finish time, so the send time is unknown.' });
      continue;
    }

    const plan = {
      attemptId: a.id,
      prospectId: a.prospect_id,
      step,
      sentAt: a.finished_at,
      providerMessageId: a.provider_message_id,
    };
    if (!write) { repaired.push({ ...plan, written: false }); continue; }

    const r = await recordSend(db, {
      workspace,
      prospectId: a.prospect_id,
      packageId: a.package_id,
      sequenceStep: step,
      providerMessageId: a.provider_message_id,
      providerThreadId: a.provider_thread_id,
      // The provider's own success time, kept exactly. Not now, not approval.
      sentAt: a.finished_at,
      via: VIA.RECONCILE,
    });
    repaired.push({ ...plan, written: Boolean(r.recorded), duplicate: Boolean(r.duplicate) });
  }

  return { found: rows.length, repaired, unrepairable, wrote: write };
}

// The Gmail conversation this prospect's sequence already lives in.
//
// Only real provider values. A thread cannot be derived from a subject, a
// recipient or a timestamp: those guesses would put a follow-up into somebody
// else's conversation, which is worse than starting a new one.
//
// Returns nulls when no native send ever recorded a thread, which is every
// prospect contacted before LTB could send. That is a legacy data limit, not a
// failure, and the caller is expected to say so rather than fake it.
//
// Also returns nulls when the thread is stale: a follow-up replying to a
// conversation from months ago reads as odd, not professional. The caller
// sends a fresh email instead of threading into a forgotten conversation.
export const THREAD_FRESH_DAYS = 45;

// How old the conversation is, in days, or null when nothing has been sent.
//
// Deliberately its own function rather than three lines inside threadFor. The
// thread id may only ever come from a provider value, and that rule is enforced
// by a test reading threadFor's own source for date arithmetic and string
// slicing. Keeping the clock out here means the guard stays strict instead of
// being loosened to accommodate a freshness check that never touches the id.
export function threadAgeDays(lastSentAt, now = Date.now()) {
  if (!lastSentAt) return null;
  const t = new Date(lastSentAt).getTime();
  if (!Number.isFinite(t)) return null;
  return (now - t) / 86400000;
}

export async function threadFor(db, workspace, prospectId) {
  const row = await db
    .prepare(
      `SELECT provider_thread_id, provider_message_id, subject, sequence_step, sent_at
         FROM send_events
        WHERE workspace = ? AND prospect_id = ?
          AND provider_thread_id IS NOT NULL AND provider_thread_id != ''
        ORDER BY sequence_step ASC, sent_at ASC
        LIMIT 1`
    )
    .bind(workspace, prospectId)
    .first()
    .catch(() => null);

  if (!row?.provider_thread_id) {
    return { threadId: null, messageId: null, subject: null, threaded: false, why: 'No native send ever recorded a Gmail thread for this prospect.' };
  }

  const newest = await db
    .prepare(
      `SELECT MAX(sent_at) AS last_sent FROM send_events
        WHERE workspace = ? AND prospect_id = ? AND sent_at IS NOT NULL`
    )
    .bind(workspace, prospectId)
    .first()
    .catch(() => null);

  const ageDays = threadAgeDays(newest?.last_sent);
  if (ageDays != null && ageDays > THREAD_FRESH_DAYS) {
    return {
      threadId: null, messageId: null, subject: null, threaded: false,
      why: `Last send was ${Math.round(ageDays)} days ago. Starting fresh instead of replying to a forgotten thread.`,
    };
  }

  return {
    threadId: String(row.provider_thread_id),
    messageId: row.provider_message_id ? String(row.provider_message_id) : null,
    subject: row.subject || null,
    threaded: true,
  };
}
