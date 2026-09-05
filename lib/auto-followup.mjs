// May the machine send THIS package's follow-up on its own?
//
// Three consents already existed and none of them answers this question:
//
//   copy approval      I approve these words
//   sequence approval  I approve Email 1 and Email 2 as one sequence
//   the global switch  this workspace allows automatic follow-ups at all
//
// The gap is between the last two. Sequence approval is a judgement about
// words; the global switch is a judgement about the workspace. Neither is
// anybody saying "and you may send this particular one while I am not looking".
//
// Without a fourth permission, turning the global switch on would hand that
// authority to every historical package at once, retroactively, on the strength
// of a decision nobody made about them. Sequence approval must never imply
// automation permission, so this is stored separately, defaults off, and has to
// be granted per package.
//
// Deliberately narrow: an enumerated list of shapes, not a formula. P3 has no
// follow-up to send, and a shape earns its place here by being reviewed as a
// whole — who it writes to, which step, under which approval.


// The original pilot's scope: a P2 sequence whose Email 2 is due.
export const PILOT = {
  BAND: 'P2',
  STEP: 2,
  LENGTH: 2,
};

// The late-close shape, added when Ary chose auto-send for the follow-up
// batch: a P1 sequence whose first two touches are already recorded from the
// mailbox, leaving exactly the approved Email 3 to send.
export const LATE_CLOSE = {
  BAND: 'P1',
  STEP: 3,
  LENGTH: 3,
};

export const ARMABLE_SHAPES = [PILOT, LATE_CLOSE];

// Which armed shape a package is, or null when it is neither. The identity
// columns only — approval, fingerprint and due-ness stay with the callers that
// already own them.
export function armShapeFor(pkg = {}) {
  return ARMABLE_SHAPES.find((s) =>
    String(pkg?.priority_band || '') === s.BAND
    && Number(pkg?.allowed_length) === s.LENGTH
    && Number(pkg?.sequence_max_step) === s.STEP
  ) || null;
}

// Has a person granted this package automatic follow-up permission?
//
// Strictly the stored flag. Nothing infers it from sequence approval, the
// status, the band, or how complete the package looks.
export function autoFollowupGranted(pkg = {}) {
  return Number(pkg?.auto_followup_approved) === 1;
}

// The highest step that permission covers. Null when nothing was granted.
export function autoFollowupScope(pkg = {}) {
  if (!autoFollowupGranted(pkg)) return null;
  const n = Number(pkg.auto_followup_max_step);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The canonical answer, used by the scheduler and re-asked by the send guard.
//
// Pure: the same package, policy and step always give the same answer, so the
// selector that filters work and the guard that runs in the last instant cannot
// disagree about what they are enforcing.
//
// Order matters. The global switch is the master kill switch and is asked
// first, so a package with permission still reads as `automation-off` while the
// workspace has automation turned off. Package permission never overrides it.
export function mayAutoFollowUp({ pkg = {}, policy = {}, step = null, manual = false } = {}) {
  // A person pressing send is the authorisation. This whole file is about what
  // happens when nobody is looking.
  if (manual) return { ok: true, manual: true };

  if (!policy.autoSendApprovedFollowups) {
    return { ok: false, block: 'automation-off', reason: 'Automatic follow-up sending is off for this workspace.' };
  }
  if (!autoFollowupGranted(pkg)) {
    return {
      ok: false,
      block: 'automation-not-approved',
      reason: 'Automatic follow-up was never switched on for this package, so nothing sends without you.',
    };
  }
  const scope = autoFollowupScope(pkg);
  const n = Number(step);
  if (Number.isFinite(n) && scope !== null && n > scope) {
    return {
      ok: false,
      block: 'automation-not-approved',
      reason: `Automatic sending was approved up to email ${scope}, and this is email ${n}.`,
    };
  }
  return { ok: true };
}

// What to write on the record when permission changes.
export const AUTO_FOLLOWUP_EVENT = {
  GRANTED: 'auto-followup-granted',
  REVOKED: 'auto-followup-revoked',
};

// The columns a grant writes, and the ones a revocation writes.
//
// Revoking clears the permission and stamps when. It deliberately leaves
// `auto_followup_approved_at` and `_by` in place: who armed it and when is
// history, and erasing that on the way out would make the audit trail agree
// with whoever looked at it last.
export function grantPatch({ at, by = 'operator', maxStep = PILOT.STEP }) {
  return {
    auto_followup_approved: 1,
    auto_followup_approved_at: at,
    auto_followup_approved_by: String(by).slice(0, 80),
    auto_followup_max_step: maxStep,
    auto_followup_revoked_at: null,
  };
}

export function revokePatch({ at }) {
  return {
    auto_followup_approved: 0,
    auto_followup_max_step: null,
    auto_followup_revoked_at: at,
  };
}
