// Turning a stored email sequence into an approvable package.
//
// The sequences come from Ary's own skills running in Claude Code on her
// plan, so the app spends no AI money here: this module only reshapes what
// the skill already wrote into the canonical package the approval queue and
// the send guard understand. Nothing here sends and nothing here calls a
// model — the staged package waits in Today's approvals like every other,
// and every send-time refusal applies to it unchanged.
//
// The V2 allowance is enforced at the door. A stored sequence may hold five
// emails from the old strategy; the package takes the first `allowedTouches`
// for the band and no more, so emails 4 and 5 stay stored but can never be
// approved or sent.

import { canProgressOutbound, STOP } from './outbound.mjs';
import { effectiveBand, allowedTouches } from './priority.mjs';
import { parseEmailSequence } from './prospect-parse.mjs';
import { isInternalTest } from './canary.mjs';
import { STATUS } from './outreach.mjs';
import { validateAngles, angleForStep } from './email-angles.mjs';

export const SEQUENCE_STAGE_GENERATOR_VERSION = 'skill-sequence-2026-08.1';
export const SEQUENCE_STAGE_PLAYBOOK = 'skill-sequence';

// The corporate family, the same net the reply prompt and the late composer
// carry. The skill writes in Ary's voice already; this is the cheap server
// backstop for the phrases she has rejected by name.
const CORPORATE = /clos(?:e|ing) the loop|circl\w* back|touch(?:ing|es|ed)? base|bump\w* (?:this|it)|on your radar|per my (?:last|previous)|hope this (?:email )?finds you well/i;

// May this prospect's stored sequence become a package, and in what shape?
//
// Pure. The route loads the row and the recent events; this function answers
// from them alone, so the refusals are testable without a database.
export function stageableSequence(prospect = {}, { now = new Date(), events = null } = {}) {
  const no = (reason) => ({ ok: false, reason });
  const p = prospect || {};

  if (!p.id) return no('No prospect.');
  if (p.deleted_at) return no('The prospect is deleted.');
  if (isInternalTest(p)) return no('Internal test record. Never part of real outreach.');
  if (!String(p.email || '').trim()) return no('No address to write to.');

  // The safety gate, not the evidence gate. Replied, declined, unsubscribed,
  // do-not-contact and closed stages all refuse here; how well-evidenced the
  // copy is stays the skill's job and Ary's approval. NOT_DUE does not apply:
  // staging is not sending, and staging ahead of the date is the point.
  const gate = canProgressOutbound(p, { now, events: events?.length ? events : null });
  if (!gate.ok && gate.stop !== STOP.NOT_DUE) return no(gate.reason);

  // A fresh sequence for somebody already written to would restart a
  // conversation that exists. Their remaining touches belong to the
  // follow-up machinery, not to a new Email 1.
  if (Number(p.emails_sent) > 0) {
    return no(`${p.emails_sent} email${Number(p.emails_sent) === 1 ? ' has' : 's have'} already gone to this person. A staged sequence starts at Email 1, and theirs already happened.`);
  }

  const seq = parseEmailSequence(p.email_sequence);
  if (!Array.isArray(seq) || !seq.length) return no('No stored email sequence on this prospect. Write it with the skill first.');

  const { band, provisional } = effectiveBand(p);
  const allowed = allowedTouches(band);
  if (seq.length < allowed) {
    return no(`${band} allows ${allowed} emails and the stored sequence has ${seq.length}. Write the full allowance so one approval covers the whole sequence.`);
  }

  // The video wording rides along where a step has it. It is an alternative
  // body for a step the band already allows, never an extra step, so it is
  // carried here rather than being scheduled anywhere: the send picks between
  // the two depending on whether the render finished in time.
  const steps = seq.slice(0, allowed).map((e, i) => ({
    step: i + 1,
    subject: String(e?.subject || '').trim(),
    body: String(e?.body || '').trim(),
    subjectVideo: String(e?.subject_video ?? e?.subjectVideo ?? '').trim(),
    bodyVideo: String(e?.body_video ?? e?.bodyVideo ?? '').trim(),
    angle: String(e?.angle || angleForStep(band, i + 1) || '').trim() || null,
  }));

  // V3: every touch a different angle. Repeated angles mean the sequence
  // says the same thing twice, which is the failure this exists to prevent.
  const angles = steps.map((s) => s.angle).filter(Boolean);
  if (angles.length) {
    const av = validateAngles(angles);
    if (!av.ok) return no(`Angle problem: ${av.problems.join(' ')}`);
  }

  for (const s of steps) {
    if (!s.subject) return no(`Email ${s.step} has no subject.`);
    if (!s.body) return no(`Email ${s.step} has no body.`);
    // Both wordings face the same checks. Copy that can go out is copy that
    // gets read, and a video variant slipping past the phrase ban because it
    // lives on a different field would be the same bug with a longer fuse.
    const text = s.subject + s.body + s.subjectVideo + s.bodyVideo;
    const hit = text.match(CORPORATE);
    if (hit) return no(`Email ${s.step} says "${hit[0]}", which Ary never writes. Fix the draft and stage again.`);
    if (/[—–]/.test(text)) return no(`Email ${s.step} uses an em dash, which Ary never does.`);
    // A video subject with no video body is a step that would send its
    // standard wording under a subject line promising a video.
    if (s.subjectVideo && !s.bodyVideo) {
      return no(`Email ${s.step} has a video subject but no video body.`);
    }
  }

  return { ok: true, band, provisional: Boolean(provisional), steps, dropped: seq.length - steps.length };
}

// The canonical package shape, mirroring the late composer's fields exactly,
// so reconciliation, approval, the fingerprint and the send guard treat a
// staged sequence like any other. model stays null: no model ran here.
export function sequencePackageFields(prospect = {}, { band, provisional, steps, dropped = 0 } = {}) {
  const [one, ...rest] = steps;
  const audit = String(prospect.audit_notes || '').trim();
  return {
    status: STATUS.READY,
    statusReason: `Sequence written by Ary's skill in Claude Code and staged for approval. ${steps.length} emails, the full ${band} allowance${dropped > 0 ? `; ${dropped} stored beyond the cap stay unsent` : ''}. No app AI spend.`,
    playbook: SEQUENCE_STAGE_PLAYBOOK,
    whyContact: audit ? `From the website audit: ${audit.slice(0, 160)}` : "Cold sequence preloaded by Ary's skill.",
    contactEmail: String(prospect.email || '').trim(),
    contactSource: 'skill-import',
    emailSubject: one.subject,
    emailBody: one.body,
    followups: rest.map((s) => ({
      step: s.step,
      subject: s.subject,
      body: s.body,
      ...(s.bodyVideo ? { bodyVideo: s.bodyVideo } : {}),
      ...(s.subjectVideo ? { subjectVideo: s.subjectVideo } : {}),
      ...(s.angle ? { angle: s.angle } : {}),
      approved: true,
    })),
    angle: one.angle || null,
    allowedLength: allowedTouches(band),
    priorityBand: band,
    bandWasProvisional: provisional ? 1 : 0,
    generatorVersion: SEQUENCE_STAGE_GENERATOR_VERSION,
    model: null,
  };
}
