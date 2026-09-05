// Actually sending one approved message, safely enough to retry.
//
// The whole file exists for one scenario. The request leaves, Gmail accepts
// it, and the connection dies before the response arrives. Retrying sends a
// second email to a stranger. Not retrying loses the send. Both are wrong.
//
// So the intent is written down BEFORE the provider is called. An attempt left
// `in-flight` means exactly "the request went out and nobody knows what
// happened", and the next run refuses to send: it reconciles from the mailbox,
// because Gmail's Sent folder is the only thing that knows the answer.
//
// Every other protection stacks on top of that: the queue's conditional claim
// stops two workers taking the job, the send_events unique index stops two
// records of one message, and the guard runs again in the last instant before
// the call.

import { canSendNow, approvalFingerprint, preparedFollowups, BLOCK } from './send-guard.mjs';
import { checkGreeting, blocksSend } from './name-guard.mjs';
import { guardView } from './prospect-view.mjs';
import { buildMime, sendMessage, senderName, SendFailed } from './gmail-send.mjs';
import { recordSend, confirmSend, nextColdStep, threadFor, VIA, RECONCILE } from './send-events.mjs';
import { sequenceCeilingFor } from './sequence-ceiling.mjs';
import { nextFollowupSchedule } from './followup-schedule.mjs';
import { accessTokenFor, getAccount, noteError, markNeedsReconnect } from './gmail-store.mjs';
import { sendPolicy, workspaceDay } from './send-policy.mjs';
import { appendEntry } from './activity-log.mjs';
import { buildSentEmail } from './prospect-parse.mjs';
import { parseUtc } from './tz.mjs';
import { videoCopyFor } from './video-copy.mjs';
import { VIDEO_DELIVERY_PLAYBOOK } from './video-delivery.mjs';

export const ATTEMPT = {
  IN_FLIGHT: 'in-flight',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  // The outcome was never learned and the mailbox could not settle it either.
  ABANDONED: 'abandoned',
};

export const attemptKey = ({ prospectId, sequenceStep, fingerprint }) =>
  `${prospectId}:${sequenceStep}:${fingerprint}`;

// How many sends have already gone out, for the two ceilings.
async function sentCounts(db, workspace, policy, now) {
  const day = workspaceDay(policy, now);
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const a = await db
    .prepare(`SELECT COUNT(*) n FROM send_events WHERE workspace = ? AND date(sent_at) = ?`)
    .bind(workspace, day).first().catch(() => ({ n: 0 }));
  const b = await db
    .prepare(`SELECT COUNT(*) n FROM send_events WHERE workspace = ? AND sent_at >= ?`)
    .bind(workspace, hourAgo).first().catch(() => ({ n: 0 }));
  return { sentToday: Number(a?.n) || 0, sentThisHour: Number(b?.n) || 0 };
}

// Send one approved package. Returns a result rather than throwing for the
// expected cases, because "not yet" is the normal answer and a queue that
// treats it as a failure burns its retries on the clock.
export async function sendApproved(db, env, {
  workspace, packageId, now = new Date(), isFollowup = false, manual = false,
  // Only pass this when the caller genuinely knows which step it is sending.
  // Left null, the step is counted from recorded sends, which is the safer
  // default: `isFollowup` is kept for compatibility and is no longer what
  // decides the number.
  step: declaredStep = null,
}) {
  const pkg = await db
    .prepare(`SELECT * FROM outreach_packages WHERE id = ? AND workspace = ?`)
    .bind(packageId, workspace).first();
  if (!pkg) return { sent: false, block: BLOCK.NOT_APPROVED, reason: 'That package is gone.', terminal: true };

  const prospect = await db
    .prepare(`SELECT * FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(pkg.prospect_id, workspace).first();
  if (!prospect) return { sent: false, block: BLOCK.NOT_APPROVED, reason: 'That prospect is gone.', terminal: true };

  const settingsRow = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'engine'`)
    .bind(workspace).first();
  let settings = {};
  if (settingsRow?.value) { try { settings = JSON.parse(settingsRow.value); } catch {} }

  const account = await getAccount(db, workspace);
  const policy = sendPolicy(settings);

  const { results: events } = await db
    .prepare(`SELECT direction, occurred_at, classification FROM reply_events WHERE workspace = ? AND prospect_id = ?`)
    .bind(workspace, pkg.prospect_id).all().catch(() => ({ results: [] }));

  const existing = await db
    .prepare(`SELECT COUNT(*) n FROM send_events WHERE workspace = ? AND prospect_id = ?`)
    .bind(workspace, pkg.prospect_id).first().catch(() => ({ n: 0 }));

  const counts = await sentCounts(db, workspace, policy, now);

  // Which cold step is going out, worked out BEFORE the guard rather than
  // after it, because the guard's answer depends on it.
  //
  // `isFollowup` was a parameter no caller ever set, so every send was judged
  // as a first email. That consulted the wrong switch, and worse, tripped the
  // "a send is already recorded for this prospect" rule: with it always false,
  // any prospect who had ever been emailed was blocked from every later email.
  // A follow-up could not be sent through this app at all. Derived from what
  // has really gone out, the same way the step is.
  const stepCall = await nextColdStep(db, workspace, prospect, {
    ceiling: sequenceCeilingFor(prospect, pkg),
    declared: declaredStep,
  });
  if (!stepCall.ok) {
    await db
      .prepare(`UPDATE outreach_packages SET send_block_reason = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(stepCall.reason, packageId).run().catch(() => {});
    return { sent: false, block: BLOCK.PAST_ALLOWED_LENGTH, reason: stepCall.reason, terminal: true, step: stepCall.step };
  }
  const step = stepCall.step;
  const followup = step > 1;

  // The words that will actually go out, resolved here because the name guard
  // below has to check them and it runs before the message is built.
  //
  // The body used to be read as `pkg.edited_body || pkg.email_body` for every
  // step, which is Email 1's text. A follow-up's approved copy lives in the
  // package's `followups`, and nothing looked at it, so pressing send on an
  // approved Email 2 would have sent Email 1 again. The copy-approval gate did
  // not catch it: that checks the step's words are IN the package, not that
  // they are the ones being sent.
  const approvedStep = followup ? preparedFollowups(pkg).find((f) => f.step === step) : null;
  if (followup && !String(approvedStep?.body || '').trim()) {
    return { sent: false, block: BLOCK.COPY_NOT_APPROVED, reason: `Email ${step} has no approved body in the package.`, terminal: true };
  }
  // Which wording this step actually sends. A follow-up written to carry the
  // audit video uses that wording only when the render finished and the
  // prospect has not already had one; otherwise the standard body goes out and
  // nobody is promised a video they cannot watch.
  const videoPick = followup
    ? videoCopyFor(approvedStep, prospect)
    : { useVideo: false, subject: null, body: null, url: null };
  const outgoingBody = followup
    ? (videoPick.useVideo ? videoPick.body : approvedStep.body)
    : (pkg.edited_body || pkg.email_body || '');

  // Whether the next cold step is actually due, from the same helper Today
  // uses. Worked out here and passed in, so there is one schedule rather than
  // the guard's idea of one and the page's.
  const rel = await db
    .prepare(`SELECT state FROM relationship_events WHERE workspace = ? AND prospect_id = ?
               ORDER BY occurred_at DESC, id DESC LIMIT 1`)
    .bind(workspace, pkg.prospect_id).first().catch(() => null);
  const { results: priorSends } = await db
    .prepare(`SELECT sequence_step, sent_at FROM send_events WHERE workspace = ? AND prospect_id = ? ORDER BY sent_at ASC`)
    .bind(workspace, pkg.prospect_id).all().catch(() => ({ results: [] }));
  const schedule = followup
    ? nextFollowupSchedule(prospect, {
      relationship: rel?.state ? { state: rel.state, deferredUntil: prospect.deferred_until } : null,
      sendEvents: priorSends || [],
      now,
      pkg,
    })
    : null;

  // The decision, in the last instant. Nothing on the approval record
  // overrides it.
  // A delivery package is its own mode. The playbook is what says so, and
  // the guard refuses the mode outright unless a real unsent recording backs
  // it, so a mislabelled package cannot buy an extra email.
  const isVideoDelivery = String(pkg.playbook || '') === VIDEO_DELIVERY_PLAYBOOK;

  const verdict = canSendNow({
    pkg, prospect, events, settings, account, now, manual,
    isFollowup: followup,
    isVideoDelivery,
    step,
    schedule,
    existingSends: Number(existing?.n) || 0,
    ...counts,
  });

  if (!verdict.ok) {
    await db
      .prepare(`UPDATE outreach_packages SET send_block_reason = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(verdict.reason, packageId).run().catch(() => {});
    return { sent: false, block: verdict.block, reason: verdict.reason, retryable: Boolean(verdict.retryable) };
  }

  // Is this greeting the right person?
  //
  // Here rather than at approval, because this is the last moment before the
  // words leave, and because every native send comes through this function.
  // Bolting it to one button would leave the other paths open.
  //
  // Deterministic string comparison, never a model. It blocks only on a clear
  // mismatch and stays quiet about anything it cannot be sure of: a false block
  // costs ten seconds, a false pass costs a stranger's first impression.
  const nameCheck = checkGreeting({
    // `pkg.body` is not a column on outreach_packages. This read undefined, so
    // the guard checked an empty string and could never have blocked anything.
    // It now reads the words actually going out, which for a follow-up are the
    // approved step's rather than Email 1's.
    body: outgoingBody,
    expectedName: prospect.contact_name || prospect.name || '',
    businessName: prospect.business_name || '',
  });
  if (blocksSend(nameCheck)) {
    await db
      .prepare(`UPDATE outreach_packages SET send_block_reason = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(nameCheck.reason, packageId).run().catch(() => {});
    // Never silently corrected. Ary decides what the email says.
    return { sent: false, block: BLOCK.WRONG_NAME, reason: nameCheck.reason, terminal: true, nameCheck };
  }

  const key = attemptKey({ prospectId: pkg.prospect_id, sequenceStep: step, fingerprint: verdict.fingerprint });

  // ── The pre-write ──────────────────────────────────────────────────────
  // Recorded before the provider is called, so a crash between here and the
  // response leaves evidence that a request went out.
  const claimed = await db
    .prepare(
      `INSERT OR IGNORE INTO send_attempts (workspace, prospect_id, package_id, sequence_step, attempt_key, state)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(workspace, pkg.prospect_id, packageId, step, key, ATTEMPT.IN_FLIGHT)
    .run();

  if (!claimed.meta.changes) {
    const prior = await db
      .prepare(`SELECT * FROM send_attempts WHERE workspace = ? AND attempt_key = ?`)
      .bind(workspace, key).first();

    if (prior?.state === ATTEMPT.SUCCEEDED) {
      return { sent: false, duplicate: true, reason: 'This exact message was already sent.', messageId: prior.provider_message_id, terminal: true };
    }
    if (prior?.state === ATTEMPT.IN_FLIGHT) {
      // The dangerous one. A previous run called Gmail and never learned the
      // outcome. Sending again is the only action that could produce a second
      // email, so it is the one action not taken.
      const recovered = await recoverInFlight(db, workspace, prior, { now });
      return recovered;
    }
    // Failed before, and a failure is allowed to be retried.
    await db
      .prepare(`UPDATE send_attempts SET state = ?, error = NULL, started_at = datetime('now'), finished_at = NULL WHERE id = ?`)
      .bind(ATTEMPT.IN_FLIGHT, prior.id).run();
  }

  // ── The call ───────────────────────────────────────────────────────────
  let token;
  try {
    token = await accessTokenFor(db, env, account);
  } catch (e) {
    await failAttempt(db, workspace, key, `Could not get a token: ${e.message}`);
    return { sent: false, block: BLOCK.MAILBOX_UNHEALTHY, reason: e.message, retryable: true };
  }
  if (token?.needsReconnect) {
    await markNeedsReconnect(db, account.id, 'Token refresh failed').catch(() => {});
    await failAttempt(db, workspace, key, 'The mailbox needs reconnecting.');
    return { sent: false, block: BLOCK.MAILBOX_UNHEALTHY, reason: 'The mailbox needs reconnecting.' };
  }

  // The conversation this sequence already lives in, if it has one.
  const thread = followup ? await threadFor(db, workspace, pkg.prospect_id) : null;

  // A threaded follow-up keeps Email 1's subject, because that is what makes
  // Gmail render one conversation rather than two. Without a real thread there
  // is nothing to join, so the follow-up carries its own subject and honestly
  // starts a new one.
  const subject = followup
    ? (thread?.threaded && thread.subject
        ? thread.subject
        : (videoPick.useVideo && videoPick.subject) || approvedStep.subject || pkg.email_subject || '')
    : (pkg.edited_subject || pkg.email_subject || '');
  const body = outgoingBody;

  const mime = buildMime({
    from: account.email_address,
    // Both names, because "Ary" on its own told a stranger nothing.
    fromName: senderName(settings),
    to: pkg.contact_email || prospect.email,
    subject,
    body,
    // Real provider values or nothing. A fabricated reference would file this
    // message into a conversation it does not belong to.
    inReplyTo: thread?.messageId || null,
    references: thread?.messageId || null,
  });

  let result;
  try {
    result = await sendMessage(token.accessToken || token, { mime, threadId: thread?.threadId || null });
  } catch (e) {
    if (e instanceof SendFailed && e.needsReconnect) {
      await markNeedsReconnect(db, account.id, e.message).catch(() => {});
    }
    // A network error is NOT recorded as failed: we do not know that it
    // failed. It stays in-flight, and the next run reconciles instead of
    // resending.
    const knownFailure = e instanceof SendFailed && e.status && e.status < 500;
    if (knownFailure) {
      await failAttempt(db, workspace, key, e.message);
      return { sent: false, block: 'send-failed', reason: e.message, retryable: !e.permanent };
    }
    await noteError(db, account.id, `Send outcome unknown: ${e.message}`).catch(() => {});
    return {
      sent: false,
      block: 'outcome-unknown',
      reason: 'Gmail did not answer. Whether the message went is unknown, so nothing will be resent until the mailbox settles it.',
      retryable: true,
    };
  }

  // ── The record ─────────────────────────────────────────────────────────
  await db
    .prepare(`UPDATE send_attempts SET state = ?, provider_message_id = ?, provider_thread_id = ?, finished_at = datetime('now') WHERE workspace = ? AND attempt_key = ?`)
    .bind(ATTEMPT.SUCCEEDED, result.messageId, result.threadId, workspace, key).run();

  const recorded = await recordSend(db, {
    // Exactly the value canSendNow compared. Not recomputed: what matters is
    // what passed the guard, not what the row would hash to afterwards.
    approvalFingerprint: pkg.approved_fingerprint || null,
    workspace,
    prospectId: pkg.prospect_id,
    packageId: pkg.id,
    packageVersion: pkg.version,
    generatorVersion: pkg.generator_version,
    playbook: pkg.playbook,
    sequenceStep: step,
    providerMessageId: result.messageId,
    providerThreadId: result.threadId,
    subject,
    sentAt: new Date().toISOString(),
    via: VIA.NATIVE,
  });

  await db
    .prepare(
      `UPDATE outreach_packages SET status = 'SENT', send_block_reason = NULL, scheduled_send_at = NULL, updated_at = datetime('now')
        WHERE id = ? AND workspace = ?`
    )
    .bind(packageId, workspace).run();

  if (recorded.recorded) {
    // The video is stamped in the same write that counts the send. Two
    // writes could leave a prospect recorded as having had the email but not
    // the video it carried, and the next follow-up would send a second one.
    // A delivery package IS the video, so it stamps too. Without this the
    // recording stays marked unsent and could be handed over a second time.
    const stamp = videoPick.useVideo || String(pkg.playbook || '') === VIDEO_DELIVERY_PLAYBOOK;
    await db
      .prepare(
        `UPDATE prospects
            SET emails_sent = COALESCE(emails_sent, 0) + 1,
                last_contact_date = date('now'), last_contact_at = datetime('now'),
                ${stamp ? "video_sent_at = datetime('now'), video_sent_email = ?," : ''}
                activity_log = ?, updated_at = datetime('now')
          WHERE id = ? AND workspace = ?`
      )
      .bind(
        ...(stamp ? [buildSentEmail('send-runner', subject, body, new Date().toISOString())] : []),
        appendEntry(
          prospect.activity_log, 'auto',
          `Email ${step} sent by the product.${stamp ? " It carried the audit video." : ""}`
        ),
        pkg.prospect_id, workspace
      )
      .run().catch(() => {});
  }

  return {
    sent: true,
    messageId: result.messageId,
    threadId: result.threadId,
    step,
    recorded: recorded.recorded,
    duplicate: Boolean(recorded.duplicate),
  };
}

async function failAttempt(db, workspace, key, error) {
  await db
    .prepare(`UPDATE send_attempts SET state = ?, error = ?, finished_at = datetime('now') WHERE workspace = ? AND attempt_key = ?`)
    .bind(ATTEMPT.FAILED, String(error).slice(0, 500), workspace, key)
    .run().catch(() => {});
}

// An attempt whose outcome was never learned.
//
// The mailbox is the only place that knows. If a message to this prospect
// appears in our own sent mail after the attempt started, the send happened;
// if not, it stays unresolved rather than being retried, because a retry is
// the only action that can produce a second email.
export async function recoverInFlight(db, workspace, prior, { now = new Date(), graceMinutes = 10 } = {}) {
  const started = parseUtc(prior.started_at);
  const ageMinutes = Number.isFinite(started) ? (now.getTime() - started) / 60000 : Infinity;
  if (ageMinutes < graceMinutes) {
    return { sent: false, block: 'in-flight', reason: 'A send for this message is already in progress.', retryable: true };
  }

  const msg = await db
    .prepare(
      `SELECT message_id, thread_id, occurred_at FROM reply_events
        WHERE workspace = ? AND prospect_id = ? AND direction = 'outbound'
          AND occurred_at >= datetime(?, '-5 minutes')
        ORDER BY occurred_at ASC LIMIT 2`
    )
    .bind(workspace, prior.prospect_id, prior.started_at)
    .all()
    .catch(() => ({ results: [] }));

  const found = msg.results || [];
  if (found.length === 1) {
    await db
      .prepare(`UPDATE send_attempts SET state = ?, provider_message_id = ?, provider_thread_id = ?, finished_at = datetime('now') WHERE id = ?`)
      .bind(ATTEMPT.SUCCEEDED, found[0].message_id, found[0].thread_id, prior.id).run();
    const r = await recordSend(db, {
      workspace,
      prospectId: prior.prospect_id,
      packageId: prior.package_id,
      sequenceStep: prior.sequence_step,
      providerMessageId: found[0].message_id,
      providerThreadId: found[0].thread_id,
      sentAt: found[0].occurred_at,
      via: VIA.RECONCILE,
    });
    return { sent: false, recovered: true, reason: 'The message had already gone. Recorded from the mailbox rather than resent.', messageId: found[0].message_id, recorded: r.recorded };
  }
  if (found.length > 1) {
    return { sent: false, block: 'needs-human', reason: 'More than one of our own messages to this prospect since the attempt started. Which one this was cannot be settled without guessing.', terminal: true };
  }

  // Nothing in the mailbox. It probably never left, but "probably" is not good
  // enough to send again on, so a person decides.
  await db
    .prepare(`UPDATE send_attempts SET state = ?, error = ?, finished_at = datetime('now') WHERE id = ?`)
    .bind(ATTEMPT.ABANDONED, 'Outcome never established from the mailbox.', prior.id).run();
  return {
    sent: false,
    block: 'outcome-unknown',
    reason: 'A send request went out and no matching message appeared in the mailbox. Not resent: a duplicate is worse than a delay.',
    terminal: true,
  };
}
