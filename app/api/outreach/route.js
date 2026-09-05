import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, loadEngineSettings } from '@/lib/workspace.mjs';
import { STATUS, LIVE, REVIEW, EDIT_REASON } from '@/lib/outreach.mjs';
import { isSequenceInFlight, mayActOnSent, mayOfferSend, mayOfferSendFor } from '@/lib/sequence-state.mjs';
import { canProgressOutbound } from '@/lib/outbound.mjs';
import { guardView } from '@/lib/prospect-view.mjs';
import { approvalFingerprint } from '@/lib/send-guard.mjs';
import { sendPolicy, insideSendWindow, nextWindowOpen } from '@/lib/send-policy.mjs';
import { enqueue, KIND, PRIORITY } from '@/lib/queue.mjs';
import { appendEntry } from '@/lib/activity-log.mjs';
import { recordOutcome, KIND as OUTCOME } from '@/lib/outcomes.mjs';
import { reconcileForApproval, approvalSummary } from '@/lib/approval.mjs';
import { sendApproved } from '@/lib/send-runner.mjs';
import { grantPatch, revokePatch, AUTO_FOLLOWUP_EVENT, autoFollowupGranted } from '@/lib/auto-followup.mjs';
import { pilotEligible } from '@/lib/auto-followup-eligibility.mjs';
import { threadFor } from '@/lib/send-events.mjs';
import { LATE_FOLLOWUP_GENERATOR_VERSION } from '@/lib/late-followup.mjs';
import { SEQUENCE_STAGE_PLAYBOOK } from '@/lib/sequence-stage.mjs';

export const dynamic = 'force-dynamic';

// The approval queue, and what approving means.
//
// Approving is accepting a package, not sending it. Nothing here sends
// anything, and the state is deliberately shaped so that a future scheduled
// sender can consume APPROVED without any of this being redesigned.
//
// The rule that matters most: approval is not permission to ignore new
// information. The outbound engine is checked again at read time and again at
// approval time, because a package approved on Monday and sent on Wednesday
// has had two days to become the worst email in the sequence.

const revalidate = (pkg, prospect, events) => {
  // Through the boundary, always. Passing a joined row here is what blocked
  // every package in the queue for a week: `p.email` arrived aliased, the
  // guard read `undefined`, and "column not selected" and "no email address"
  // became the same answer. guardView throws on the first instead.
  const gate = canProgressOutbound(prospect, { events: events?.length ? events : null });
  // NOT_DUE is fine: a package prepared before the date is the point.
  if (!gate.ok && gate.stop !== 'not-due') {
    return { blocked: true, reason: gate.reason, stop: gate.stop };
  }
  return { blocked: false };
};

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const ws = ctx.workspace;
  const db = getDb();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 60);

  const { results: rows } = await db
    .prepare(
      // Every column the outbound guard reads, because it is re-run below on
      // this row. It used to select five of them, and the guard answered from
      // the ones it could see: `email` arrives aliased as prospect_email, so
      // the guard found no address and marked EVERY package BLOCKED with "No
      // email address on the record" while displaying the address beside it.
      // Nothing could be approved, and the queue had been that way since it
      // shipped. The same omission hid do_not_contact and unsubscribed, which
      // fails the other way and is the more dangerous half.
      `SELECT k.*, p.name, p.business_name, p.email AS prospect_email, p.domain, p.rating,
              p.stage, p.country, p.replied, p.reply_type, p.reply_date, p.last_contact_date,
              p.next_action_date,
              p.do_not_contact, p.unsubscribed, p.video_url, p.review_url
         FROM outreach_packages k
         JOIN prospects p ON p.id = k.prospect_id
        WHERE k.workspace = ? AND p.deleted_at IS NULL
          -- APPROVED is included so an approved package does not vanish.
          -- It used to drop straight out of this query, which meant that after
          -- pressing Approve there was nothing on screen to send and no way to
          -- see it had happened.
          AND (
            k.status IN ('READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')
            -- A sequence that is part way through. The package flips to SENT
            -- when its FIRST email goes out, so without this a sequence-
            -- approved package vanished from the only screen in the app with a
            -- send button on it, and the follow-up it had already authorised
            -- could never be sent by anybody. Exactly the bug the APPROVED line
            -- above was added to fix, one step later in the sequence.
            --
            -- Bounded by the approved length: once every authorised step has
            -- been sent, it drops off again.
            OR (
              k.status = 'SENT'
              AND k.sequence_approved = 1
              AND (SELECT COUNT(*) FROM send_events se
                    WHERE se.workspace = k.workspace AND se.prospect_id = k.prospect_id)
                  < COALESCE(k.allowed_length, k.sequence_max_step, 1)
            )
          )
        ORDER BY
          CASE k.status WHEN 'READY_FOR_APPROVAL' THEN 0 ELSE 1 END,
          COALESCE(p.rating, 0) DESC,
          k.updated_at ASC
        LIMIT ?`
    )
    .bind(ws, limit)
    .all();

  // Reply events for exactly these prospects, so the guard can be re-run
  // against real message order rather than a date column.
  const ids = (rows || []).map((r) => r.prospect_id);
  const eventsBy = new Map();
  if (ids.length) {
    const { results: evs } = await db
      .prepare(
        `SELECT prospect_id, direction, occurred_at, classification FROM reply_events
          WHERE workspace = ? AND prospect_id IN (${ids.map(() => '?').join(',')})`
      )
      .bind(ws, ...ids).all().catch(() => ({ results: [] }));
    for (const e of evs || []) {
      const list = eventsBy.get(e.prospect_id) || [];
      list.push(e);
      eventsBy.set(e.prospect_id, list);
    }
  }

  const parse = (v, fallback) => { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

  const items = (rows || []).map((r) => {
    // The alias has to be undone before the guard sees it. Passing the joined
    // row straight in is what caused the bug above.
    const check = revalidate(r, guardView(r, { aliases: { email: 'prospect_email', id: 'prospect_id' }, where: 'approval queue' }), eventsBy.get(r.prospect_id));
    return {
      id: r.id,
      prospectId: r.prospect_id,
      version: r.version,
      status: check.blocked ? STATUS.BLOCKED : r.status,
      // Recomputed, not trusted from when it was written. A package that has
      // gone unsafe says so here even if the row still reads READY.
      blockedReason: check.blocked ? check.reason : null,
      statusReason: r.status_reason,
      name: r.name || r.business_name || r.prospect_email,
      business: r.business_name && r.business_name !== r.name ? r.business_name : null,
      rating: r.rating,
      stage: r.stage,
      playbook: r.playbook,
      whyContact: r.why_contact,
      evidence: parse(r.evidence, []),
      evidenceLevel: r.evidence_level,
      contact: { email: r.contact_email || r.prospect_email, source: r.contact_source },
      email: { subject: r.email_subject, body: r.email_body, flags: parse(r.email_flags, []) },
      followupPlan: r.followup_plan,
      pdf: { decision: r.pdf_decision, reason: r.pdf_reason },
      video: { decision: r.video_decision, reason: r.video_reason },
      creditsSpent: r.credits_spent,
      estimatedAssetCredits: r.estimated_asset_credits,
      // What one approval actually authorises, recomputed against the rating
      // on the record right now. Ary should never approve one email believing
      // it is two touches while the system reads it as three.
      authorises: approvalSummary(r, r, { rating: r.rating }),
      preparedBy: r.prepared_by || 'native',
      ctaClass: r.cta_class || null,
      promiseMade: r.promise_made || null,
      // The late-follow-up pilot set, marked so the approval screen can offer
      // its batch review. A marker only: these approve, skip and send through
      // exactly the same actions as every other package.
      lateFollowup: r.generator_version === LATE_FOLLOWUP_GENERATOR_VERSION,
      // Skill-staged sequences join the same batch review: written for free
      // in Claude Code, staged whole, approved with the same one tap.
      stagedSequence: r.playbook === SEQUENCE_STAGE_PLAYBOOK,
      evidenceAgeDays: r.created_at
        ? Math.floor((Date.now() - Date.parse(String(r.created_at).replace(' ', 'T'))) / 86400000)
        : null,
      fingerprint: r.approved_fingerprint ? 'recorded' : 'not-yet-approved',
      // Whether the wider consent was given. Without this the card cannot
      // tell an approval that covers one email from one that covers the
      // sequence, and it drew the same thing for both.
      sequenceApproved: Number(r.sequence_approved) === 1,
      // A sequence mid-flight: the first email has gone and an approved
      // follow-up is still owed. The card needs this because `status` is SENT
      // by then, and a screen that keys the send button off APPROVED alone
      // shows this row with nothing to press.
      // Asked through the canonical helper, which also checks the sequence is
      // not already finished — the inline version here did not, so a completed
      // sequence still read as in flight.
      //
      // And a sequence a person has replied to is not in flight in the sense
      // the card cares about. The shadow audit caught this: the earlier canary
      // had replied, the guard refused the send, and the card would still have
      // drawn a Send now button over it. The guard being right is not enough
      // when the screen disagrees — that gap is the whole reason this pass
      // exists.
      sequenceInFlight: mayOfferSendFor(r, r, { sent: r.emails_sent }) && isSequenceInFlight(r, { sent: r.emails_sent }),
      // The fourth consent, and the three fields the card needs to decide
      // whether to offer it at all. Every one of these is read by
      // approvalCard's `automation` block; omitting any of them would draw
      // nothing and look like the feature was never built.
      priorityBand: r.priority_band || null,
      sequenceMaxStep: r.sequence_max_step ?? null,
      emailsSent: r.emails_sent ?? 0,
      autoFollowup: {
        approved: Number(r.auto_followup_approved) === 1,
        maxStep: r.auto_followup_max_step ?? null,
        at: r.auto_followup_approved_at || null,
        by: r.auto_followup_approved_by || null,
        revokedAt: r.auto_followup_revoked_at || null,
      },
    };
  });

  const counts = items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {});
  // Read, never assumed. The per-package automation control says whether the
  // global switch is on, and a hardcoded answer would go quietly wrong the day
  // it changes.
  const policy = sendPolicy(await loadEngineSettings(db, ws));
  return NextResponse.json({
    items,
    counts,
    total: items.length,
    automation: {
      followups: policy.autoSendApprovedFollowups === true,
      firstEmails: policy.autoSendApprovedFirstEmails === true,
    },
  });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const ws = ctx.workspace;
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  const action = String(body?.action || '');
  if (!id || !action) return NextResponse.json({ error: 'Which package, and what should happen to it?' }, { status: 400 });

  const pkg = await db
    .prepare(`SELECT * FROM outreach_packages WHERE id = ? AND workspace = ?`)
    .bind(id, ws).first();
  if (!pkg) return NextResponse.json({ error: 'That package does not exist.' }, { status: 404 });

  // The prospect is loaded before the status gate now, because "is this
  // sequence finished" is answered from how many emails have actually gone out,
  // and that count lives here rather than on the package.
  const prospect = await db
    .prepare(`SELECT * FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(pkg.prospect_id, ws).first();
  if (!prospect) return NextResponse.json({ error: 'That prospect is gone.' }, { status: 404 });
  const prospectSends = Number(prospect.emails_sent) || 0;

  // A sequence part way through is not finished with. SENT means its FIRST
  // email has gone, and a sequence-approved package may still owe an approved
  // follow-up. Sending that one is the single action that stays open — approve,
  // edit and skip are all done with this package, so the gate stays closed for
  // them.
  //
  // Asked through sequence-state rather than compared here: this was the fourth
  // of five places that each answered it their own way and disagreed.
  const sequenceInFlight = isSequenceInFlight(pkg, { sent: prospectSends });
  if (!LIVE.has(pkg.status) && !mayActOnSent(pkg, action, { sent: prospectSends })) {
    return NextResponse.json({ error: `That package is already ${pkg.status}.` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const setStatus = async (status, fields = {}) => {
    const cols = ['status = ?', 'updated_at = ?'];
    const vals = [status, now];
    for (const [k, v] of Object.entries(fields)) { cols.push(`${k} = ?`); vals.push(v); }
    await db.prepare(`UPDATE outreach_packages SET ${cols.join(', ')} WHERE id = ? AND workspace = ?`)
      .bind(...vals, id, ws).run();
  };
  const noteOn = async (text) => {
    await db.prepare(`UPDATE prospects SET activity_log = ?, updated_at = ? WHERE id = ? AND workspace = ?`)
      .bind(appendEntry(prospect.activity_log, 'auto', text), now, prospect.id, ws).run().catch(() => {});
  };

  if (action === 'approve') {
    // The guard runs again, here, at the moment of approval. Between
    // preparation and this click the prospect may have replied, unsubscribed
    // or become a client, and approval must never be the thing that overrides
    // that.
    const { results: events } = await db
      .prepare(`SELECT direction, occurred_at, classification FROM reply_events WHERE workspace = ? AND prospect_id = ?`)
      .bind(ws, prospect.id).all().catch(() => ({ results: [] }));
    const check = revalidate(pkg, guardView(prospect, { where: 'approve' }), events);
    if (check.blocked) {
      await setStatus(STATUS.BLOCKED, { status_reason: check.reason });
      await noteOn(`Approval refused: ${check.reason}`);
      return NextResponse.json({ ok: false, status: STATUS.BLOCKED, reason: check.reason }, { status: 409 });
    }

    // The rating Ary applies at approval decides the band, and the band decides
    // how many emails this approval authorises. A package prepared as a
    // provisional P2 that she then rates green needs its third email written
    // and READ before any of this is valid, and one she marks with a cross must
    // shed the follow-up it was carrying. Neither can be fixed afterwards:
    // generating copy after approval is copy nobody read.
    const applying = typeof body.rating === 'string' ? body.rating : undefined;
    if (applying !== undefined && applying !== prospect.rating) {
      await db.prepare(`UPDATE prospects SET rating = ?, updated_at = datetime('now') WHERE id = ? AND workspace = ?`)
        .bind(applying || null, prospect.id, ws).run().catch(() => {});
    }
    const recon = reconcileForApproval(pkg, { ...prospect, rating: applying ?? prospect.rating });
    if (!recon.canApprove) {
      await setStatus(pkg.status, { status_reason: recon.reason });
      return NextResponse.json({
        ok: false,
        status: recon.status,
        reason: recon.reason,
        missingSteps: recon.missingSteps,
        finalBand: recon.finalBand,
        finalLength: recon.finalLength,
      }, { status: 409 });
    }

    const edited = typeof body.subject === 'string' || typeof body.bodyText === 'string';
    const outcome = edited ? REVIEW.EDITED : REVIEW.APPROVED_UNCHANGED;
    const reason = EDIT_REASON.includes(body.reason) ? body.reason : null;

    // Approving the first email and approving the sequence are separate
    // consents. Silence on the second means no.
    const sequenceApproved = body.approveSequence === true;

    // Asking to approve a sequence whose emails do not all exist is refused,
    // not quietly downgraded to approving the first one. A silent downgrade
    // would leave Ary believing she had authorised two touches when the record
    // said one, and she would find out weeks later when the second never went.
    if (sequenceApproved && !recon.canApproveSequence) {
      await setStatus(pkg.status, { status_reason: recon.reason });
      return NextResponse.json({
        ok: false,
        status: recon.status,
        reason: `${recon.reason} Approve the first email on its own, or send it back so the missing ${recon.missingSteps.length === 1 ? 'email' : 'emails'} can be written.`,
        missingSteps: recon.missingSteps,
        finalBand: recon.finalBand,
        finalLength: recon.finalLength,
      }, { status: 409 });
    }

    // What is actually written to the row.
    //
    // The fingerprint is then computed from THIS, rather than from a nearby
    // object that resembles it. The previous version built a separate
    // `approvedPkg` and the two drifted in three places: sequence_max_step
    // (the final length there, null here unless the sequence was approved
    // too), the edited fields (uncapped there, sliced here), and contact_email
    // (filled in from the prospect there, not written at all here).
    //
    // The first difference fired on every ordinary approval. So every approved
    // package was stale the instant it was approved, and the send guard refused
    // it saying the package had changed after approval when nothing had
    // changed. Nothing caught it because until now nothing could reach a send
    // at all; it would have silently blocked automatic sending too, on the day
    // that switch was first turned on.
    const approvedFields = {
      reviewed_at: now,
      review_outcome: outcome,
      review_reason: reason,
      sequence_approved: sequenceApproved ? 1 : 0,
      // The app owns how long a sequence runs. The caller does not get to name
      // a number, and there is no "or 5" fallback any more.
      sequence_max_step: sequenceApproved ? recon.finalLength : null,
      priority_band: recon.finalBand,
      allowed_length: recon.finalLength,
      band_was_provisional: 0,
      // Reconciled: everything past the final allowed length is demoted to a
      // draft rather than deleted, so a later re-rating does not mean rewriting
      // copy we already have.
      followups: JSON.stringify(recon.followups),
      contact_email: pkg.contact_email || prospect.email,
      // The original is kept alongside the edit. Overwriting it would destroy
      // the only record of what the generator actually produced, which is the
      // thing worth studying later.
      edited_subject: edited ? String(body.subject ?? pkg.email_subject).slice(0, 300) : null,
      edited_body: edited ? String(body.bodyText ?? pkg.email_body).slice(0, 8000) : null,
    };

    await setStatus(STATUS.APPROVED, {
      ...approvedFields,
      // Stored so that a package edited or regenerated afterwards can be told
      // apart from the one she read: the send guard refuses when this no
      // longer matches what the row says.
      approved_fingerprint: approvalFingerprint({ ...pkg, ...approvedFields }),
    });
    // Two different consents leave two different marks. Approving the draft and
    // approving the whole sequence used to write the same line, so the history
    // could not answer which one had been given.
    const scope = sequenceApproved
      ? `the whole sequence, all ${recon.finalLength} emails`
      : 'the first email only';
    await noteOn(
      `${edited ? 'Outreach approved, with your edits' : 'Outreach approved as written'}: ${scope}.`
    );
    await recordOutcome(db, {
      workspace: ws, prospectId: prospect.id, kind: OUTCOME.VET, value: `review:${outcome}`,
      context: {
        playbook: pkg.playbook, reason, flags: pkg.email_flags,
        sequenceApproved, allowedLength: recon.finalLength,
      },
    });
    // Schedule the send only when this workspace has actually turned native
    // sending on. Off by default, and the guard checks again at execution:
    // the queue is a scheduler, never an authority.
    let scheduled = null;
    const settings = await loadEngineSettings(db, ws);
    const policy = sendPolicy(settings);
    if (policy.autoSendApprovedFirstEmails) {
      const earliest = new Date(Date.now() + policy.minimumDelayAfterApprovalMinutes * 60_000);
      // Their window, not ours: the schedule is for a business in their country.
      const at = insideSendWindow(policy, earliest, prospect).ok
        ? earliest
        : nextWindowOpen(policy, earliest, prospect);
      if (at) {
        await db.prepare(`UPDATE outreach_packages SET scheduled_send_at = ? WHERE id = ? AND workspace = ?`)
          .bind(at.toISOString(), id, ws).run().catch(() => {});
        await enqueue(db, {
          workspace: ws, kind: KIND.SEND_APPROVED, prospectId: prospect.id,
          priority: PRIORITY.VET, runAfter: at.toISOString(),
          payload: { packageId: id, prospectId: prospect.id },
        }).catch(() => {});
        scheduled = at.toISOString();
      }
    }

    return NextResponse.json({ ok: true, status: STATUS.APPROVED, outcome, sequenceApproved, scheduled, band: recon.finalBand, allowedLength: recon.finalLength, demotedSteps: recon.demotedSteps });
  }

  // ── automatic follow-up permission ─────────────────────────────────────
  //
  // The fourth consent, and the only one that authorises the machine to act
  // while nobody is watching. Kept apart from approving the words and approving
  // the sequence, because agreeing to a sentence is not agreeing to a timer.
  //
  // This action never sends anything. It writes one flag.
  if (action === 'auto-followup') {
    const grant = body?.allow !== false;
    const stamp = new Date().toISOString();

    let fit = null;
    if (grant) {
      // A package can only be armed if it is a shape automation covers, so
      // nobody arms something that would silently do nothing.
      const thread = await threadFor(db, ws, pkg.prospect_id).catch(() => null);
      fit = pilotEligible(pkg, prospect, { threadId: thread?.threadId || null });
      if (!fit.ok) {
        return NextResponse.json({ ok: false, error: fit.reason }, { status: 409 });
      }
    }

    // How far the permission reaches comes from the fitted shape, so a P2
    // pilot package arms to Email 2 and a P1 final close arms to Email 3.
    const maxStep = grant ? fit.shape.STEP : null;
    const patch = grant
      ? grantPatch({ at: stamp, by: ctx.role || 'operator', maxStep })
      : revokePatch({ at: stamp });
    const cols = Object.keys(patch);
    await db
      .prepare(`UPDATE outreach_packages SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ?
                 WHERE id = ? AND workspace = ?`)
      .bind(...cols.map((c) => patch[c]), stamp, id, ws)
      .run();

    await noteOn(grant
      ? `Automatic follow-up switched on for this package, up to email ${maxStep}. Every send check still runs when it is due.`
      : 'Automatic follow-up switched off for this package. The copy and the sequence approval are unchanged.');

    // The audit event. Package, prospect, when, who, and how far it reaches.
    // No email bodies, no credentials.
    await recordOutcome(db, {
      workspace: ws,
      prospectId: prospect.id,
      kind: OUTCOME.OUTREACH,
      value: grant ? AUTO_FOLLOWUP_EVENT.GRANTED : AUTO_FOLLOWUP_EVENT.REVOKED,
      context: {
        packageId: id,
        maxStep,
        by: ctx.role || 'operator',
        at: stamp,
      },
    });

    return NextResponse.json({ ok: true, autoFollowupApproved: grant, maxStep, sent: false });
  }

  // ── send ───────────────────────────────────────────────────────────────
  //
  // A person pressing send, which is not automation. It runs the same
  // sendApproved path the scheduler uses, so there is exactly one sending
  // system and one set of guards; the only difference is that the automation
  // switch does not apply to a human.
  if (action === 'send') {
    // ...or a sequence whose first email has gone and whose next approved step
    // has not. The send guard still decides whether it may actually go.
    // Which step it is, and whether it may go, are the send guard's business.
    // The route only asks whether this package can offer a send at all.
    if (!mayOfferSend(pkg, { sent: prospectSends })) {
      return NextResponse.json({ ok: false, error: 'Approve it first.' }, { status: 409 });
    }
    const env = typeof process !== 'undefined' && process.env ? process.env : {};
    const r = await sendApproved(db, env, { workspace: ws, packageId: id, manual: true });

    if (r.sent) {
      await noteOn(`Sent from Leads That Bloom to ${pkg.contact_email || prospect.email}.`);
      return NextResponse.json({
        ok: true, sent: true, messageId: r.messageId, threadId: r.threadId || null, step: r.step,
      });
    }
    if (r.duplicate) {
      return NextResponse.json({ ok: false, duplicate: true, reason: r.reason, messageId: r.messageId || null }, { status: 409 });
    }
    // The real reason, in her words, whatever it is. A blocked send is the
    // guard working and it says so rather than failing silently.
    return NextResponse.json({ ok: false, block: r.block, reason: r.reason }, { status: 409 });
  }

  if (action === 'skip') {
    await setStatus(STATUS.SKIPPED, {
      reviewed_at: now,
      review_outcome: REVIEW.SKIPPED_PROSPECT,
      review_reason: EDIT_REASON.includes(body.reason) ? body.reason : null,
    });
    await noteOn('Outreach skipped.');
    await recordOutcome(db, {
      workspace: ws, prospectId: prospect.id, kind: OUTCOME.VET, value: 'review:SKIPPED_PROSPECT',
      context: { playbook: pkg.playbook, reason: body.reason || null },
    });
    return NextResponse.json({ ok: true, status: STATUS.SKIPPED });
  }

  if (action === 'research') {
    await setStatus(STATUS.SKIPPED, { reviewed_at: now, review_outcome: REVIEW.RESEARCHED_MORE });
    await enqueue(db, { workspace: ws, kind: KIND.SIGNALS, prospectId: prospect.id, priority: PRIORITY.SIGNALS });
    await noteOn('Sent back for more research.');
    return NextResponse.json({ ok: true, status: STATUS.SKIPPED, requeued: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
