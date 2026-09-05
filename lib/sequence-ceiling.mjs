// How many cold emails this sequence may ever contain — asked precisely.
//
// There were three different questions wearing one name. `effectiveCeiling()`
// answered whichever the caller happened to mean, and for an unrated prospect
// it answered the widest one:
//
//   effectiveCeiling = band && !provisional ? allowedTouches(band) : HARD_TOUCH_CEILING
//
// Cynthia is unrated, so her band is P2 *provisional* and the helper returned 3.
// Her package was prepared and approved with allowed_length 2 and
// sequence_max_step 2. The schedule then told an operator "P2 allows 3; 1 sent,
// so email 2 is the next and only one" — a sentence that contradicts itself in
// nine words, about a package that allows exactly two.
//
// Nothing could have sent a third email: it does not exist, and both
// `copy-not-approved` and `sequence_max_step` refuse it independently. The
// defect was that the product said something untrue about its own decision.
//
// So the three questions get three names.

import { effectiveBand, allowedTouches, HARD_TOUCH_CEILING } from './priority.mjs';

// 1. Before a package exists.
//
// How many touches preparation may plan for. An unrated prospect keeps the
// widest cap, because the rating that would narrow it has not happened yet and
// planning short would throw away work. This is a preparation cap and nothing
// else: it never means "P2 allows 3".
export function prospectPreparationCeiling(prospect = {}, opts = {}) {
  const { band, provisional } = effectiveBand(prospect, opts);
  return band && !provisional ? allowedTouches(band) : HARD_TOUCH_CEILING;
}

// 2. Once a package is prepared.
//
// The length the package was actually written to. Null when there is no package
// or it never recorded one.
export function packageAllowedLength(pkg = null) {
  const n = Number(pkg?.allowed_length);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 3. Once a sequence is approved.
//
// What may actually be sent. Without sequence approval the answer is one: the
// first email is the only thing anybody consented to, whatever the package is
// long enough for. With it, the narrower of the two recorded numbers wins, so
// neither can widen the other.
export function approvedSequenceCeiling(pkg = null) {
  if (!pkg) return null;
  if (Number(pkg.sequence_approved) !== 1) return 1;
  const caps = [packageAllowedLength(pkg), Number(pkg.sequence_max_step)]
    .filter((n) => Number.isFinite(Number(n)) && Number(n) > 0)
    .map(Number);
  return caps.length ? Math.min(...caps) : 1;
}

// Did this package record a ceiling at all?
//
// Legacy packages predate all three fields. A package that never recorded a
// length has not made a decision, and treating its silence as "1" would
// retroactively cut short sequences nobody shortened.
export function packageRecordsCeiling(pkg = null) {
  if (!pkg) return false;
  return packageAllowedLength(pkg) != null
    || pkg.sequence_approved != null
    || pkg.sequence_max_step != null;
}

// The one to ask when a package is in hand.
//
// A package that recorded a ceiling wins over the prospect-level cap, because
// it is a decision somebody made and stored rather than a default waiting to be
// narrowed. A package that recorded nothing does not get a vote.
export function sequenceCeilingFor(prospect = {}, pkg = null, opts = {}) {
  if (packageRecordsCeiling(pkg)) return approvedSequenceCeiling(pkg);
  return prospectPreparationCeiling(prospect, opts);
}

// Has this prospect already had every cold email their band allows?
//
// Strategy V2 moved sequence length into lib/priority.mjs, banded by rating:
// P1 gets 3, P2 gets 2, P3 gets 1. The stage strings still run to "Email 5"
// because they have years of history behind them and renaming them would break
// every skill and saved view. So the stage names stay and the POLICY moves: a
// row whose band is spent is not due for another cold email, whatever its stage
// says.
//
// This lived in lib/due.mjs, which made it look like a date question. It is a
// ceiling question, and the file that owns ceilings is this one. It moved here
// so lib/today.mjs could ask it too: "Due today (auto)" was surfacing 223
// production prospects whose allowance was already spent, one of them a 💙
// (two touches) sitting at five sent, because that list asked about the date
// and never about the band. due.mjs re-exports it, so every existing caller is
// untouched.
export function coldSequenceExhausted(p, pkg = null) {
  const max = sequenceCeilingFor(p, pkg);
  if (!max) return true;
  const sent = Number(p?.emails_sent);
  return Number.isFinite(sent) && sent >= max;
}

// How to say it to a person.
//
// Never "P2 allows 3". Either the sequence somebody approved, or a plan that
// has not been approved yet.
export function ceilingWording(prospect = {}, pkg = null, opts = {}) {
  if (packageRecordsCeiling(pkg) && Number(pkg.sequence_approved) === 1) {
    const n = approvedSequenceCeiling(pkg);
    return `This approved sequence allows ${n} email${n === 1 ? '' : 's'}.`;
  }
  if (packageRecordsCeiling(pkg)) return 'Only the first email is approved. Anything after it is outside this approval.';
  const n = prospectPreparationCeiling(prospect, opts);
  const { provisional } = effectiveBand(prospect, opts);
  return provisional
    ? `Not rated yet, so up to ${n} emails may be planned until somebody looks.`
    : `Up to ${n} email${n === 1 ? '' : 's'} may be planned.`;
}
