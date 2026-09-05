// What one approval actually authorises, once Ary has rated the prospect.
//
// The edge case this exists for is quiet and would have been expensive.
//
// A package is prepared overnight for an unrated prospect, so it runs as
// provisional P2 and contains Email 1 and Email 2. At approval Ary rates the
// prospect 💚, which makes it P1, which allows three cold emails. Stage B only
// ever sends copy that was in the package at approval, so either Email 3 never
// exists (and the 💚 quietly bought nothing) or something generates it
// afterwards and sends copy she never read. Both are wrong.
//
// The reverse is worse. Same package, Ary marks ✖️, the band becomes P3 and the
// allowed length becomes one. Email 2 is sitting there approved and
// schedulable, and it would go out to somebody she just said no to.
//
// So the package is reconciled against the FINAL band, and the count that
// approval actually covers is stated rather than implied.
//
// What this does NOT do is refuse to approve a short package. A band is a
// ceiling: the strategy's own table reads "up to 3" for P1, and `allowedTouches`
// is documented as how many emails a prospect may ever receive. Reading that as
// a quota blocked every package in production. The safeguard that matters lives
// in the send guard, which refuses any step whose copy did not exist at
// approval.

import { PRIORITY, RATING, bandFor, allowedTouches, SPACING } from './priority.mjs';
import { preparedFollowups, approvalFingerprint } from './send-guard.mjs';

export const RECONCILE = {
  // The prepared sequence already matches the final band.
  READY: 'READY',
  // Fewer emails are written than the band allows. Approvable, and reported,
  // because a band is a ceiling and not a quota.
  PARTIAL: 'PACKAGE_PARTIAL',
  // Ary rated down. Extra copy is demoted rather than deleted, and approval
  // can proceed, because removing an email needs nobody's judgement.
  TRIMMED: 'PACKAGE_TRIMMED',
  // Nothing usable.
  INVALID: 'INVALID',
};

// Every follow-up on the package, approved or not.
//
// `preparedFollowups` deliberately returns only the approved ones, because that
// is what the send guard must see. This is the raw list, for reconciliation and
// for showing Ary what exists.
export function allFollowups(pkg = {}) {
  let raw = pkg.followups;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => ({
      step: Number(f?.step) || 0,
      subject: String(f?.subject ?? ''),
      body: String(f?.body ?? ''),
      // Absent means approved, so every package written before this existed
      // keeps behaving exactly as it did.
      approved: f?.approved !== false,
    }))
    .filter((f) => f.step > 1)
    .sort((a, b) => a.step - b.step);
}

// Reconcile a package against the band the rating produces.
//
// Pure: it decides and reports, and the caller writes. Nothing here generates
// copy, because generating copy after approval is the thing being prevented.
export function reconcileForApproval(pkg = {}, prospect = {}, { rating = undefined } = {}) {
  // The rating Ary is applying right now wins over whatever is on the record.
  const applied = rating === undefined ? String(prospect.rating || '').trim() : String(rating || '').trim();
  const withRating = { ...prospect, rating: applied };

  const band = bandFor(withRating, { strong: true });
  const finalBand = band.band;
  const finalLength = allowedTouches(finalBand);

  const existing = allFollowups(pkg);
  const hasFirst = Boolean(String(pkg.edited_body ?? pkg.email_body ?? '').trim());

  if (!hasFirst) {
    return {
      status: RECONCILE.INVALID,
      finalBand, finalLength,
      reason: 'The package has no first email.',
      canApprove: false,
      canApproveSequence: false,
      missingSteps: [],
      demotedSteps: [],
      followups: existing,
    };
  }

  // Steps 2..finalLength are the ones this band is allowed to send.
  const wanted = [];
  for (let s = 2; s <= finalLength; s += 1) wanted.push(s);

  const present = new Set(existing.map((f) => f.step));
  const missingSteps = wanted.filter((s) => !present.has(s));
  const demotedSteps = existing.filter((f) => f.step > finalLength).map((f) => f.step);

  // Approved means: within the final allowed length. Everything past it is kept
  // as draft, visible and un-sendable, because Ary may rate the prospect back
  // up tomorrow and rewriting an email we already have would be silly.
  const followups = existing.map((f) => ({ ...f, approved: f.step <= finalLength }));

  // A band is a CEILING, not a quota, so a short package is approvable.
  //
  // The strategy is explicit: the priority table reads "up to 3" for P1, and
  // `allowedTouches` is documented as how many emails a prospect MAY EVER
  // receive. Every stop condition can end a sequence early too, so a sequence
  // is never obliged to reach its length. An earlier version read the ceiling
  // as a requirement and refused to approve anything short of it, which
  // blocked every package in production, because none of them carry follow-ups
  // at all.
  //
  // The safeguard that actually matters is elsewhere and is untouched: Stage B
  // may only send copy that existed at approval, enforced by
  // `stepCoveredByApproval` in the send guard. An email nobody wrote cannot go
  // out whatever this function says.
  //
  // What is owed here is honesty about the count, which the card states next
  // to the button rather than hiding.
  if (missingSteps.length) {
    return {
      status: RECONCILE.PARTIAL,
      finalBand, finalLength,
      reason: `This covers ${existing.length + 1} of the ${finalLength} emails ${finalBand} allows. `
        + `The ${missingSteps.length === 1 ? 'other one has' : 'others have'} not been written, and nothing can send an email that does not exist.`,
      canApprove: true,
      // The first email may be approved. The SEQUENCE may not.
      //
      // Approving "two touches" when only one was ever written records a
      // consent to something nobody read. The send guard would refuse the
      // missing email anyway, so nothing unsafe could ship — but the approval
      // record would say two and mean one, and that is the number every later
      // decision is made against.
      canApproveSequence: false,
      missingSteps,
      demotedSteps,
      followups,
    };
  }

  if (demotedSteps.length) {
    return {
      status: RECONCILE.TRIMMED,
      finalBand, finalLength,
      reason: `${finalBand} allows ${finalLength} cold ${finalLength === 1 ? 'email' : 'emails'}. `
        + `Email ${demotedSteps.join(' and ')} stays on the record as a draft and will not be sent.`,
      canApprove: true,
      canApproveSequence: true,
      missingSteps: [],
      demotedSteps,
      followups,
    };
  }

  return {
    status: RECONCILE.READY,
    finalBand, finalLength,
    reason: `${finalBand}: ${finalLength} cold ${finalLength === 1 ? 'email' : 'emails'}, all prepared.`,
    canApprove: true,
    canApproveSequence: true,
    missingSteps: [],
    demotedSteps: [],
    followups,
  };
}

// The package fields an approval writes, including the fingerprint.
//
// Returns null when the package is not approvable, so a caller cannot get a
// patch out of an unreconciled package by accident.
export function approvalPatch(pkg = {}, prospect = {}, { rating = undefined, at = null } = {}) {
  const r = reconcileForApproval(pkg, prospect, { rating });
  if (!r.canApprove) return { ok: false, ...r, patch: null };

  const next = {
    ...pkg,
    priority_band: r.finalBand,
    allowed_length: r.finalLength,
    sequence_max_step: r.canApproveSequence ? r.finalLength : null,
    band_was_provisional: 0,
    rating_at_prepare: pkg.rating_at_prepare ?? null,
    followups: JSON.stringify(r.followups),
  };

  // Computed from the reconciled package, so the fingerprint covers the final
  // band, the final length and exactly the copy that may send.
  const fingerprint = approvalFingerprint(next);

  return {
    ok: true,
    ...r,
    patch: {
      status: 'APPROVED',
      reviewed_at: at || new Date().toISOString().replace('T', ' ').slice(0, 19),
      priority_band: r.finalBand,
      allowed_length: r.finalLength,
      // Identical to the value the fingerprint was computed over, above. These
      // two drifting apart is what made every approved package stale the
      // instant it was approved the last time somebody changed one of them.
      sequence_max_step: r.canApproveSequence ? r.finalLength : null,
      band_was_provisional: 0,
      followups: next.followups,
      approved_fingerprint: fingerprint,
      sequence_approved: r.canApproveSequence ? 1 : 0,
    },
    fingerprint,
  };
}

// What Ary is being asked to authorise, in one object for the approval screen.
//
// Deliberately explicit about the count. She should never approve one email
// believing it is two touches while the system reads it as three.
export function approvalSummary(pkg = {}, prospect = {}, { rating = undefined } = {}) {
  const r = reconcileForApproval(pkg, prospect, { rating });
  const sendable = r.followups.filter((f) => f.approved);
  return {
    band: r.finalBand,
    allowedLength: r.finalLength,
    // 1 for Email 1, plus every follow-up that may actually go.
    authorising: 1 + sendable.length,
    steps: [
      { step: 1, subject: pkg.edited_subject ?? pkg.email_subject ?? '', body: pkg.edited_body ?? pkg.email_body ?? '', approved: true },
      ...r.followups,
    ],
    spacing: SPACING[r.finalBand] || [],
    status: r.status,
    canApprove: r.canApprove,
    reason: r.reason,
    missingSteps: r.missingSteps,
    demotedSteps: r.demotedSteps,
    ctaClass: pkg.cta_class || null,
    promiseMade: pkg.promise_made || null,
    preparedBy: pkg.prepared_by || 'native',
  };
}

export { PRIORITY, RATING };

// ── What the card should say ─────────────────────────────────────────────
//
// One function, called by the API and by the component, because the last
// version had the rule written twice and the two copies disagreed in
// production: the server would have accepted an approval that the client had
// already disabled the button for. A prospect sat there permanently
// unapprovable with a red paragraph explaining why, and no way forward.
//
// Everything Ary needs is at the top level. Everything internal is under
// `details`, which the card keeps collapsed.

export const CARD = {
  // A draft exists and can be approved.
  READY: 'READY',
  // Fewer emails written than the band allows. Still approvable, and the count
  // is stated rather than implied.
  PARTIAL: 'PARTIAL',
  // Nothing was written, because nothing was verified.
  NOT_WRITTEN: 'NOT_WRITTEN',
};

// The opening of the email, short enough to scan.
//
// Splitting on newlines is not enough on its own: these bodies are usually one
// paragraph, so the "preview" came out as the entire email and the card was a
// wall of text again. Capped by characters too, cut on a word.
const PREVIEW_CHARS = 150;

const firstLines = (body, n = 2) => {
  const text = String(body || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n)
    .join(' ');
  if (text.length <= PREVIEW_CHARS) return text;
  const cut = text.slice(0, PREVIEW_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 80 ? space : PREVIEW_CHARS).trimEnd()}…`;
};

export function approvalCard(pkg = {}, prospect = {}, {
  rating = undefined, autoSendFirst = false,
  // Whether the workspace allows automatic follow-ups at all. The per-package
  // control is still shown when this is off, with a line saying so, because
  // hiding it would make the global switch look like the only thing there is.
  autoSendFollowups = false,
} = {}) {
  const r = reconcileForApproval(pkg, prospect, { rating });
  const subject = pkg.edited_subject ?? pkg.email_subject ?? '';
  const body = pkg.edited_body ?? pkg.email_body ?? '';

  const mode = !String(body).trim()
    ? CARD.NOT_WRITTEN
    : r.status === RECONCILE.PARTIAL ? CARD.PARTIAL : CARD.READY;

  // The label has to match what the button does. With automatic first sending
  // off, approving records a decision and sends nothing at all, so promising
  // otherwise would be a lie the first time she pressed it.
  const approve = autoSendFirst
    ? { label: 'Approve and send', note: `This will send the email to ${pkg.contact_email || 'them'}.` }
    : { label: 'Approve draft', note: 'Nothing will be sent yet.' };

  // Approving the draft is not approving the sequence, and the card has to say
  // so rather than leave it to be inferred.
  //
  // Package 19 is why this exists. It held both touches, the button said
  // "Approve draft", Ary pressed it, and the route did exactly the right thing:
  // it approved Email 1 and left sequence_approved at 0, because the caller
  // never asked for the sequence. Nothing was wrong except that the screen gave
  // her no way to say the other thing, so the only consent she could give was
  // the narrower one, and there was no sign the wider one existed.
  const stored = r.followups.filter((f) => f.approved);
  const already = Number(pkg.sequence_approved) === 1;
  const sequence = stored.length
    ? {
      touches: 1 + stored.length,
      // Already consented to, so the card states it rather than asking again.
      approved: already,
      // False when a step is missing. A sequence nobody wrote cannot be agreed.
      canApprove: Boolean(r.canApproveSequence),
      steps: stored.map((f) => ({ step: f.step, subject: f.subject, body: f.body })),
      firstOnly: {
        label: 'Approve Email 1 only',
        note: `Email ${stored.map((f) => f.step).join(' and ')} stays on the record and cannot be sent.`,
      },
      full: {
        label: `Approve all ${1 + stored.length} emails`,
        note: 'Nothing sends now. Later touches still pass every send check first.',
      },
      // The upgrade, for a package already approved for its first email only.
      upgrade: !already && String(pkg.status) === 'APPROVED'
        ? {
          label: `Approve the follow-up too`,
          note: 'Same copy, nothing rewritten. It records the wider consent and nothing is sent.',
        }
        : null,
    }
    : null;

  // The fourth consent: may the machine send the approved follow-up on its own?
  //
  // Offered only where it could actually do something, so the card never asks a
  // question whose answer changes nothing. Deliberately not folded into the
  // sequence block above: agreeing to the words and agreeing to a timer are two
  // decisions, and one control for both would collect only the weaker one.
  const armed = Number(pkg.auto_followup_approved) === 1;
  const inPilot = String(pkg.priority_band || '') === 'P2'
    && Number(pkg.sequence_approved) === 1
    && Number(pkg.sequence_max_step) === 2
    && stored.some((f) => f.step === 2)
    && Number(prospect?.emails_sent) >= 1;

  const automation = inPilot
    ? {
      approved: armed,
      maxStep: armed ? (Number(pkg.auto_followup_max_step) || null) : null,
      label: 'Allow automatic follow-up',
      note: 'If there is no reply and all safety checks still pass when Email 2 is due, '
        + 'LeadsThatBloom may send the already-approved follow-up automatically.',
      revoke: { label: 'Turn automatic follow-up off', note: 'The copy and the sequence approval stay exactly as they are.' },
      // Armed, but the workspace switch is off, so nothing would go anyway.
      // Said plainly rather than leaving her to infer it from two screens.
      globallyOff: armed && !autoSendFollowups
        ? 'Automatic follow-up is approved for this package, but automation is currently turned off globally.'
        : null,
    }
    : null;

  return {
    mode,
    automation,
    // One plain recommendation, said once.
    recommendation: mode === CARD.NOT_WRITTEN
      ? 'Nothing verified yet'
      : 'Worth contacting',
    // One verified finding, said once. The card must not repeat it lower down.
    finding: pkg.why_contact || null,
    email: mode === CARD.NOT_WRITTEN ? null : { subject, preview: firstLines(body), body },
    approve,
    // Null when there is nothing but a first email, so a P3 is never offered a
    // choice that would mean nothing.
    sequence,
    // Follows the reconciliation, not the display mode: a partial draft is
    // approvable, it just says so.
    canApprove: r.canApprove && mode !== CARD.NOT_WRITTEN,
    // Said, not blocked, and with no action attached.
    //
    // The previous version offered a "Finish draft" button wired to the
    // research action, which set the package to SKIPPED and queued a fresh site
    // scan. A button labelled finish threw the draft away. Nothing in the
    // product writes follow-ups into a package yet, so until that exists this
    // states the position and offers nothing it cannot do.
    coverage: mode === CARD.PARTIAL
      ? {
          text: `This draft is ${1 + r.followups.filter((f) => f.approved).length} of the ${r.finalLength} emails allowed. `
            + `${r.missingSteps.length === 1 ? 'The other one has' : 'The others have'} not been written yet, and nothing sends an email that does not exist.`,
        }
      : null,
    // Everything below is debugging data and lives behind a disclosure.
    details: {
      band: r.finalBand,
      allowedLength: r.finalLength,
      authorising: 1 + r.followups.filter((f) => f.approved).length,
      preparedBy: pkg.prepared_by || 'native',
      ctaClass: pkg.cta_class || null,
      promiseMade: pkg.promise_made || null,
      evidenceLevel: pkg.evidence_level || null,
      creditsSpent: pkg.credits_spent ?? null,
      playbook: pkg.playbook || null,
      missingSteps: r.missingSteps,
      demotedSteps: r.demotedSteps,
    },
  };
}
