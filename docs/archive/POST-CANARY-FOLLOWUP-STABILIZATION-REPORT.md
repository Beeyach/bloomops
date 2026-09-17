# One place that knows what SENT means

**Date:** 2026-08-11
**Commit:** `9a15eb3`
**Tests:** 1,811 passing, 0 failing
**Emails sent: 0. Prospects contacted: 0. Both auto-send switches: OFF. No cohort enabled.**

---

## Why this pass existed

The canary chapter ended with the follow-up path working and a bad taste: it had
taken five separate fixes to get one email out, because five places written at
different times each decided for themselves what a package status meant. Fixing
them one at a time worked and proved nothing about the sixth.

This pass removes the category rather than the instances.

---

## 1. The semantic layer

`lib/sequence-state.mjs` is now the only place that answers these:

| Question | Helper |
|---|---|
| Was this approved as a sequence? | `isSequenceApproved` |
| How many emails does the approval permit? | `approvedLength` |
| Which steps did a person actually read? | `approvedSteps` |
| Has every approved step gone out? | `isSequenceComplete` |
| Is a step still owed? | `isSequenceInFlight` |
| May a screen offer a send at all? | `mayOfferSend` |
| May a screen offer one **to this prospect**? | `mayOfferSendFor` |
| May this step continue under this approval? | `mayContinueToStep` |
| May a finished-looking package still act? | `mayActOnSent` |

Nothing here decides whether a send may happen — that stays in the send guard,
which weighs replies, timing, contact state, caps and the mailbox. These are
about the package alone.

**The deciding distinction:** completeness is counted from **real sends**, not
from the status. A status only ever says "at least one has gone". A two-step
approval with one send is not finished, and that difference is the entire bug.

---

## 2. Every load-bearing site changed

| Site | Was | Now |
|---|---|---|
| `lib/send-guard.mjs` | `status === 'APPROVED'` plus an inline SENT exception | `mayOfferSend` — **status only**, so the specific reasons below it still speak |
| `app/api/outreach/route.js` — queue SQL | `status IN (...)` | plus sequence-approved and under the approved length |
| `app/api/outreach/route.js` — item mapping | inline `status === 'SENT' && sequence_approved` | `mayOfferSendFor` **and** `isSequenceInFlight` |
| `app/api/outreach/route.js` — terminal gate | `!LIVE.has(status)` | `mayActOnSent` |
| `app/api/outreach/route.js` — send action | `status !== APPROVED` | `mayOfferSend` |
| `components/ApprovalQueue.jsx` — bucket split | `ACTIONABLE.has(status)` | `isActionable`, which includes a sequence in flight |
| `components/ApprovalQueue.jsx` — card body | `status === 'APPROVED'` | plus `sequenceInFlight`, with honest copy |
| `components/ApprovalQueue.jsx` — review controls | `status !== 'APPROVED'` | also hidden for a send-only card |
| `lib/send-runner.mjs` | consulted the canary timing override | override deleted |

### Two regressions caught while wiring it

**`approvedLength` defaulted to 1** when neither `allowed_length` nor
`sequence_max_step` was set. That is *stricter* than the rule it replaced, and it
refused legitimate follow-ups on packages that never set a length. It now falls
back to what the approval actually contains: its own email plus the follow-ups
prepared with it.

**Folding step coverage into the status question swallowed the good reasons.**
*"Email 3 was not in the package when it was approved, so nobody has read it"*
became a flat *"This package has not been approved."* The guard now asks the
status question only, and the specific checks below it keep their own voices.

---

## 3. Test-schema drift, permanently

Two test files built their database from hand-picked migration lists, and both
stopped before the migration that added `send_events.approval_fingerprint`. A
write to that column worked in production and failed in tests — the wrong way
round for a test to be wrong, because it looks like a bug in new code rather
than a gap in the harness.

- `allMigrationNames()` is derived from the directory, so a new migration is
  included by existing rather than by being remembered.
- `tests/schema-drift.test.mjs` fails when a hand-picked list **creates a table
  and then stops before a later migration that alters it**.

**The guard was proved by breaking it.** Removing 047 from one list produced:

> `./native-send.test.mjs creates outreach_packages but stops at 044_native_send.sql, missing 047_strategy_v2.sql which adds a column to it`

A guard that cannot fail is worth nothing, so it was made to fail on purpose
before being trusted.

---

## 4. The canary timing override is gone

Deleted from the runtime, not moved behind a door. It was narrow and well
tested — manual only, one exact business name, one exact recipient, step 2 only,
unable to invent a step or revive a stopped sequence — but a timing bypass with
no remaining job does not get to keep living in the send path on the strength of
being well behaved.

`tests/sequence-surfaces.test.mjs` asserts the module is gone and that nothing in
the send path can force a schedule due. The P1/P2/P3 cadence is asserted
unchanged: `[0, 4, 10]`, `[0, 4]`, `[0]`.

---

## 5. Cross-layer agreement

`tests/cross-layer-agreement.test.mjs` runs **one package through every layer at
the same moment** and asserts they say the same thing:

| State | Listed | Card | Scheduler | Guard (manual) | Guard (auto) |
|---|---|---|---|---|---|
| Before Email 1 | yes | offers | step 1 | **allows** | `automation-off` |
| After Email 1 | yes | offers | **step 2** | **allows** | `automation-off` |
| After Email 2 | no | none | complete | refuses | refuses |
| Replied | — | **none** | `NEEDS_HUMAN` | refuses | refuses |
| Unsubscribed | — | none | — | refuses | refuses |

Plus: Email 1 is never resendable, a stopped sequence cannot be restarted by a
schedule handed in as due, and an edit after approval blocks with
`stale-approval` on the exact step.

**The invariant:** the card never offers what the guard forbids — except for
timing, where a card may be listed while the step is not yet due and the guard
says so in its own words.

---

## 6. Production shadow audit — read-only

`scripts/shadow-audit.mjs` runs the queue, card, scheduler and both guard paths
against real production rows. It reads JSON dumps from disk, so it cannot touch
the database even by accident.

**11 packages audited. 4 skipped (prospect in the trash).**

### What it found, and what was fixed because of it

⚠️ **`replied-still-offered` — the one that mattered.** The earlier canary
(prospect 6567) had replied. The guard refused the send. **The card would still
have drawn a Send now button over a person who had written back.**

The guard being right is not enough when the screen disagrees. `mayOfferSendFor`
is now the single predicate the API item mapping *and* the audit both call —
re-deriving it in two places is exactly how this chapter started.

### What remains, all explained

| Finding | Package | Prospect | Why it is not a defect |
|---|---|---|---|
| `approved-without-fingerprint` | 5 | 6545 *Bloomwired (send trace)* | Deliberately left NULL — its copy cannot be proved unchanged since approval, so it fails closed and needs re-approval. Internal record, addressed to `hello@bloomwired.io`. |
| `complete-still-offered` | 5 | 6545 | Same package. Guard blocks it on the missing fingerprint. |
| `fingerprint-mismatch` | 6 | 6546 *Bloomwired (native send)* | Historical: already SENT, copy edited afterwards. The guard would refuse. Internal record. |

**Zero unexplained disagreements. Zero findings on a real prospect.**

Also checked and clean across all 11: no P3 offered Email 2, no P2 offered
Email 3, no Email 4+, no legacy `next_action_date` steering V2, no automatic
path that would send, no pre-native thread record mistaken for threading
support.

---

## 7. The first real cohort — and why it cannot be formed yet

⚠️ **There are zero candidates, and the reason is not a defect.**

The cohort design requires a prospect whose **real native Email 1 has already
been sent by LTB**, with a real Gmail thread id. Every prospect that has ever
received a native send is an internal test record:

| Prospect | Name | Address |
|---|---|---|
| 6545 | Bloomwired (send trace) | `hello@bloomwired.io` |
| 6546 | Bloomwired (native send) | `hello+nativesend@bloomwired.io` |
| 6547 / 6548 / 6549 | Bloomwired internal test | `arylombres@gmail.com` (trashed) |
| 6567 | LTB Canary (internal test) | `arylombres@gmail.com` |
| 6568 | LTB Threading Canary (internal test) | `arylombres@gmail.com` |

The four real prospects with packages — Center for True Health, Strongbyliv,
Brett Pace, Payette Counseling — sit in `READY_FOR_APPROVAL` or
`NEEDS_DECISION`.

⚠️ **Corrected 2026-08-11:** this said all four have 0 sends. Three do. Center
for True Health has **six**, last contact 2026-08-05, with zero native send
events — a legacy sequence that ran before LTB could send. I read a truncated
view of the audit output and did not check the remaining rows; the audit itself
was right. It changes nothing about the conclusion below, and it disqualifies
that prospect twice over rather than once. See
`FIRST-REAL-EMAIL1-SEED-COHORT-REPORT.md`.

**A P2 auto-followup cohort cannot exist before a real Email 1 does.** The
sequence is: approve and send some real first emails by hand, wait for the P2
gap, and the cohort forms itself from prospects who then genuinely qualify.
Proposing names today would mean proposing prospects who have never been
contacted, which is a first-contact decision wearing a follow-up costume.

---

## Scorecard

| Gate | Status |
|---|---|
| Package/sequence semantics centralized | **PASS** |
| Raw status assumption sweep complete | **PASS** |
| Test DB uses canonical migrations | **PASS** |
| Test schema drift guard exists | **PASS** (proved by breaking it) |
| Canary timing override removed | **PASS** (deleted, not quarantined) |
| UI / list / route / scheduler / send guard agree | **PASS** |
| Reply-stop invariant cross-layer | **PASS** |
| Fingerprint invariant cross-layer | **PASS** |
| Production shadow audit: zero unexplained disagreements | **PASS** |
| P2 cohort candidates identified | **NOT READY** — no real prospect has a native Email 1 |
| AUTO_SEND_FIRST | **OFF** |
| AUTO_SEND_FOLLOWUPS | **OFF** |

---

## Verdict

`GO — READY TO PREPARE A TINY, EXPLICIT P2 AUTO-FOLLOWUP COHORT`

The machinery is ready and consistent. The cohort itself is empty, and that is a
supply problem rather than a safety one: **the next step is sending a few real
first emails by hand, not enabling anything.**

## Safety

Zero outbound emails. Zero real prospects contacted. No cohort enabled. Both
auto-send switches OFF throughout. No provider calls, no model calls, no website
audits. No prospect history rewritten, no fingerprints fabricated, no thread ids
invented. The audit is read-only by construction.
