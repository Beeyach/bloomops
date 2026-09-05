// Whether we can write to somebody, kept apart from whether we should.
//
// The first draft of Strategy V2 sent a bounced prospect back to HELD, and HELD
// is defined as "viable, not yet verified, no contact". So a prospect who had
// been probed, vetted, found Strong, banded and approved would have had all of
// that erased the day their inbox filled up.
//
// Contactability and qualification are different facts about a person. This
// module owns the first one and touches none of the second.

export const CONTACT_STATE = {
  OK: 'OK',                                   // a safe address is current
  NONE: 'NONE',                               // never found one. This is what makes a prospect HELD
  NEEDS_CONTACT_RECOVERY: 'NEEDS_CONTACT_RECOVERY', // it worked, then it did not
};

const clean = (v) => String(v || '').trim().toLowerCase();
const looksLikeEmail = (v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(clean(v));

// What state a record is in right now.
//
// Reads the stored state when there is one, because NEEDS_CONTACT_RECOVERY is a
// fact about history that the presence of an address cannot tell you: a bounced
// address is still sitting in the column.
export function contactStateOf(p = {}) {
  const stored = String(p.contact_state || '').trim();
  if (stored === CONTACT_STATE.NEEDS_CONTACT_RECOVERY) return CONTACT_STATE.NEEDS_CONTACT_RECOVERY;
  // The legacy stage carries the same meaning and predates the column.
  if (p.stage === 'Invalid Email') return CONTACT_STATE.NEEDS_CONTACT_RECOVERY;
  if (stored === CONTACT_STATE.OK || stored === CONTACT_STATE.NONE) {
    // Stored NONE with an address since added means discovery worked.
    if (stored === CONTACT_STATE.NONE && looksLikeEmail(p.email)) return CONTACT_STATE.OK;
    return stored;
  }
  return looksLikeEmail(p.email) ? CONTACT_STATE.OK : CONTACT_STATE.NONE;
}

// Can anything be sent to this prospect at all?
export const isContactable = (p = {}) => contactStateOf(p) === CONTACT_STATE.OK;

// HELD: viable, but nothing paid may run because we cannot write to them.
//
// Deliberately not a judgement and deliberately not Strong. It sits at pipeline
// step 3, long before Strong is evaluated at step 9.
export const isHeld = (p = {}) => contactStateOf(p) === CONTACT_STATE.NONE;

// The patch a bounce produces.
//
// Everything it does not mention is everything it must not touch: evidence,
// site intel, the Vet result, the Strong verdict, the band, and every package
// ever written. Those were true, and a dead address does not make them false.
export function onBounce({ at = null, reason = 'The address bounced.' } = {}) {
  return {
    contact_state: CONTACT_STATE.NEEDS_CONTACT_RECOVERY,
    contact_state_at: at || new Date().toISOString().replace('T', ' ').slice(0, 19),
    contact_state_reason: reason,
  };
}

// The patch a successful discovery produces.
export function onContactFound({ at = null, reason = null } = {}) {
  return {
    contact_state: CONTACT_STATE.OK,
    contact_state_at: at || new Date().toISOString().replace('T', ' ').slice(0, 19),
    contact_state_reason: reason,
  };
}

// The patch a discovery run that found nothing produces.
export function onNoContactFound({ at = null, reason = 'No safe address found on their own site.' } = {}) {
  return {
    contact_state: CONTACT_STATE.NONE,
    contact_state_at: at || new Date().toISOString().replace('T', ' ').slice(0, 19),
    contact_state_reason: reason,
  };
}

// A recovered prospect must not resume on the old approval.
//
// The address they were approved for is not the address they now have, so the
// package fingerprint is stale by definition. Saying so here means the send
// guard does not have to infer it.
export function needsReapprovalAfterRecovery(p = {}, pkg = null) {
  if (contactStateOf(p) !== CONTACT_STATE.OK) return false;
  if (!pkg || pkg.status !== 'APPROVED') return false;
  const approvedTo = clean(pkg.contact_email);
  const current = clean(p.email);
  return Boolean(approvedTo && current && approvedTo !== current);
}
