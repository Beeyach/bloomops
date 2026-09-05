// The one door every outreach package comes through.
//
// Two things prepare packages now. The app calls Sonnet on a cron with nobody
// present; the auto-prospect skill prepares them inside Cowork without spending
// an API call at all. Both are first-class, because they buy back different
// resources: one buys attention, the other buys money.
//
// That only stays safe if neither is privileged. A package is validated the
// same way whichever wrote it, and a skill-prepared package that breaks a rule
// is rejected exactly as a native one would be. There is no fast path, and
// there is no cheap side door for a low-priority prospect either: a P3 gets one
// email, and that email is a canonical validated package like every other.

import { CTA_CLASS, classifyEmail, promiseFrom } from './cta.mjs';
import { allowedTouches, PRIORITY } from './priority.mjs';
import { RUNG } from './asset-ladder.mjs';

export const PREPARED_BY = { NATIVE: 'native', SKILL: 'skill' };

// Everything a package must carry to be sendable, regardless of who wrote it.
export const REQUIRED = ['prospect_id', 'contact_email', 'email_subject', 'email_body', 'playbook', 'priority_band'];

const str = (v) => String(v ?? '').trim();
const email = (v) => str(v).toLowerCase();

// Parse whatever the caller supplied for follow-ups into the canonical shape.
function normaliseFollowups(raw) {
  let list = raw;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return { ok: false, error: 'followups is not valid JSON.' }; }
  }
  if (list == null) return { ok: true, followups: [] };
  if (!Array.isArray(list)) return { ok: false, error: 'followups must be a list.' };

  const out = [];
  for (const f of list) {
    const step = Number(f?.step);
    if (!Number.isFinite(step) || step < 2) {
      return { ok: false, error: 'Every follow-up needs a step of 2 or more. Step 1 is the first email.' };
    }
    if (out.some((x) => x.step === step)) {
      return { ok: false, error: `Two different emails are both step ${step}.` };
    }
    if (!str(f?.subject) || !str(f?.body)) {
      return { ok: false, error: `Step ${step} is missing a subject or a body.` };
    }
    out.push({ step, subject: str(f.subject), body: str(f.body) });
  }
  out.sort((a, b) => a.step - b.step);

  // No gaps. A package with steps 2 and 4 would let step 4 send while step 3
  // never existed, which is not a sequence anybody approved.
  for (let i = 0; i < out.length; i += 1) {
    if (out[i].step !== i + 2) {
      return { ok: false, error: `Follow-ups have to run 2, 3, 4 with no gaps. Found step ${out[i].step} where ${i + 2} was expected.` };
    }
  }
  return { ok: true, followups: out };
}

// Validate a package against the app's own policy.
//
// `prospect` and `strong` come from the app, never from the package. A skill
// asserting "this prospect is Strong" would be a second brain deciding the one
// thing the app is meant to own.
export function validatePackage(pkg = {}, { prospect = null, strong = null, offerAccepted = false, aryRequestedAsset = false } = {}) {
  const errors = [];
  const warnings = [];

  for (const f of REQUIRED) {
    if (!str(pkg[f])) errors.push(`Missing ${f}.`);
  }

  const preparedBy = str(pkg.prepared_by) || PREPARED_BY.NATIVE;
  if (preparedBy !== PREPARED_BY.NATIVE && preparedBy !== PREPARED_BY.SKILL) {
    errors.push(`prepared_by must be "${PREPARED_BY.NATIVE}" or "${PREPARED_BY.SKILL}".`);
  }

  // The address has to be the one the prospect actually has now. A package
  // written against a stale address would be approved for somewhere else.
  if (prospect) {
    const want = email(prospect.email);
    const got = email(pkg.contact_email);
    if (want && got && want !== got) {
      errors.push('The package is addressed somewhere other than the prospect’s current address.');
    }
  }

  // Strong is the app's answer and the package does not get a vote.
  if (strong === false) {
    errors.push('Not Strong. A package cannot be prepared for a prospect that has not passed the gate.');
  }

  const band = str(pkg.priority_band);
  if (band && !Object.values(PRIORITY).includes(band)) {
    errors.push(`${band} is not a priority band.`);
  }

  // Sequence length is the app's, and a package may not exceed it or invent
  // its own. This is the check that makes "no sender can exceed the allowed
  // length" true rather than merely intended.
  const allowed = allowedTouches(band);
  const declared = Number(pkg.allowed_length);
  if (band) {
    if (!Number.isFinite(declared)) {
      errors.push('allowed_length is missing. The app decides how long a sequence runs.');
    } else if (declared !== allowed) {
      errors.push(`allowed_length is ${declared}, but ${band} allows ${allowed}.`);
    }
  }

  const fu = normaliseFollowups(pkg.followups);
  if (!fu.ok) {
    errors.push(fu.error);
  } else if (band) {
    const past = fu.followups.filter((f) => f.step > allowed);
    if (past.length) {
      errors.push(`${band} allows ${allowed} cold ${allowed === 1 ? 'email' : 'emails'}, but the package prepares step ${past[0].step}.`);
    }
  }

  // The close. Classified semantically, never by punctuation: a concrete yes/no
  // offer is usually a question, and rejecting question marks would reject the
  // best-performing CTA in the database.
  const cta = classifyEmail(pkg.edited_body ?? pkg.email_body ?? '');
  if (cta.cls === CTA_CLASS.OTHER) {
    errors.push('The email does not close on a clear next step.');
  }
  if (cta.cls === CTA_CLASS.OPEN_QUESTION) {
    // Not an error. An open question is a fine sentence and Ary may choose one
    // knowingly. It is simply never the default.
    warnings.push('Closes on an open question. A concrete offer converted ten times better.');
  }
  if (!cta.escapeHatch) {
    warnings.push('No escape hatch. "If that is already handled, ignore me" belongs in every cold email.');
  }

  // Assets are fulfilment. Reaching a step is not a trigger and cannot become
  // one, so a package that attaches an asset without an accepted offer or an
  // explicit request is rejected whichever mode wrote it.
  const wantsAsset = [pkg.video_decision, pkg.pdf_decision]
    .map(str)
    .some((v) => v && v !== 'none' && v !== 'no' && v !== 'skip');
  if (wantsAsset && !offerAccepted && !aryRequestedAsset) {
    errors.push('An asset is attached without an accepted offer. Video and PDF are fulfilment, not sequence steps.');
  }

  const normalized = errors.length ? null : {
    ...pkg,
    prepared_by: preparedBy,
    contact_email: email(pkg.contact_email),
    allowed_length: Number.isFinite(declared) ? declared : allowed,
    followups: JSON.stringify(fu.followups || []),
    cta_class: cta.cls,
    promise_made: str(pkg.promise_made) || promiseFrom(cta.closer) || null,
  };

  return { ok: errors.length === 0, errors, warnings, cta, followups: fu.followups || [], normalized };
}

// Accept a package from either mode.
//
// The only difference between the two paths is the value of `prepared_by`,
// which exists to measure them rather than to privilege either.
export function acceptPackage(pkg = {}, ctx = {}) {
  const r = validatePackage(pkg, ctx);
  if (!r.ok) {
    return {
      accepted: false,
      errors: r.errors,
      // Said plainly, because a skill author reading this is debugging without
      // the app's stack trace.
      reason: `Rejected: ${r.errors.join(' ')}`,
    };
  }
  return { accepted: true, package: r.normalized, warnings: r.warnings, cta: r.cta, followups: r.followups };
}

// Which asset rungs a package is allowed to name at preparation time.
//
// Cold packages get none of them. This is asserted rather than assumed, so a
// generator that starts producing video decisions again fails a test instead of
// quietly costing money.
export const COLD_ALLOWED_RUNGS = [RUNG.PLAIN_TEXT];
