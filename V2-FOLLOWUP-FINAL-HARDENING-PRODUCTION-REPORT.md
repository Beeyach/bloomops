# The follow-up nobody could send

**Date:** 2026-08-11
**Commits:** `dade305` · `d72db0c` · `3c44834` · `86a5073` · `77ecad4` · `0e420f3` · `ab6dfda`
**Tests:** 1,809 passing, 0 failing
**Real prospects contacted: 0. Test emails sent: 2, both to Ary's own inbox. Both auto-send switches: OFF.**

---

## What this pass was for, and what it found instead

It was meant to close two known gaps: an approval fingerprint that could be
NULL, and Gmail threading that had never been proved on a real sequence.

Both closed. But proving the second one required sending a **real** first email,
and the moment that happened the whole follow-up feature stopped working. Five
separate places, written at different times, each assumed a package sends
exactly once. Together they meant **no native follow-up could ever be sent, by
anyone, through any screen** — while every test passed and the previous canary
reported success.

The previous canary reported success because its Email 1 was synthetic. Nothing
moved the package to SENT before Email 2, so the state that breaks everything
was never entered. That is the argument for a canary whose first email is real,
and it is the most useful thing in this report.

---

## Gap 1 — the approval fingerprint that did not have to exist

### What was wrong

The send guard read, in effect:

```js
if (stored && stored !== current) block
```

On a NULL, that does not fail — **it does not run**. The stale-copy guard was
silently absent for any package without a fingerprint. Package 14 sent that way
during the earlier canary and was safe only because a person had read the body
first, which is not a control that survives unattended sending.

### The counts, before anything was changed

| Status | Fingerprint | Count |
|---|---|---:|
| APPROVED | **NULL** | **1** |
| SENT | present | 4 |
| SENT | NULL | 1 (package 14, historical) |
| NEEDS_DECISION / READY / SKIPPED | NULL | 6 |

Two distinct causes: package 5 was approved fifty minutes before the fingerprint
write existed, and package 14 was created already-approved by canary setup,
bypassing the approval route. The route itself has always written it correctly.

### What it does now

| Case | Result |
|---|---|
| Missing, empty or blank | **`approval-incomplete`** — *"Needs review — this approval record is incomplete. Review and approve the email again before sending."* |
| Mismatch | `stale-approval` — kept distinct, because one says the copy changed and the other says nobody can tell |
| Malformed | can never equal the computed value, so it blocks as a mismatch |
| Manual send | **does not bypass it** — pressing the button authorises sending what was approved, not sending something unprovable |
| At send time | **nothing is auto-created** — generating a fingerprint then would let the thing being sent approve itself |

### Legacy: repaired nothing, deliberately

Package 5 stays NULL. Its copy cannot be proved unchanged since approval, and
the rule was no guessing. It fails closed and needs re-approval. It is an
internal record addressed to `hello@bloomwired.io`, so no real prospect is
affected. Package 14 is untouched; its own report keeps the record that the
guard was vacuous at send time.

⚠️ **A dozen existing tests broke, and that was the useful part.** They built
APPROVED packages with no fingerprint and expected sends to succeed — the
permissiveness itself, written into the suite.

---

## Gap 2 — threading, and the test-only due mechanism it needed

Threading cannot be proved without a real Email 1 and a real Email 2 in one
conversation, and P1 puts four days between them. Waiting four days to learn
whether a header is set is not a plan; backdating the provider's send timestamp
would falsify the one record meant to be provider truth; a general force-due
switch is a loaded gun on the table.

`lib/canary-due.mjs` relaxes exactly one thing for exactly one record:
`NOT_DUE_YET` becomes `DUE_NOW`.

### Why a real prospect cannot use it

All seven conditions must hold:

| Condition | Why it is a wall |
|---|---|
| Business name is exactly `LTB Threading Canary (internal test)` | |
| Recipient is exactly `arylombres@gmail.com` | **Ary's own inbox** |
| Sender is exactly `hello@bloomwired.io` | |
| `manual === true` | automation can never reach it |
| Step is exactly 2 | cannot create Email 3, 4, anything |
| The **real scheduler** already says Email 2 is next | cannot invent a touch |
| Status is `NOT_DUE_YET` | a reply is not a timing problem; stopped stays stopped |

It does no IO, writes no timestamp, never mentions `next_action_date`, and
leaves `SPACING` untouched. The schedule it returns carries
`testOverride: 'threading-canary'`, so a run that used it says so.

**14 tests, and the negative ones are the point:** real prospect refused, canary
name on a stranger's address refused, stranger's name on Ary's inbox refused,
wrong sending mailbox refused, automation refused, steps 1/3/4/5 refused,
stopped sequences stay stopped, P1/P2/P3 cadence asserted unchanged.

---

## The threading canary

| | |
|---|---|
| Prospect | **6568** — `LTB Threading Canary (internal test)` |
| Package | **15** — two steps, `allowed_length: 2` |
| Recipient / sender | `arylombres@gmail.com` / `hello@bloomwired.io` |
| Fingerprint | present and matching |
| Step coverage | 1 yes · 2 yes · **3 no** |

Copy written by hand, no model, no cost. Email 1: *"This is the first message in
the LTB threading test. No action needed."* Email 2: *"This is the second
message in the LTB threading test. It should appear in the same Gmail
conversation as the first one."*

---

## ⚠️ The real-path defect: five gates, one assumption

Email 1 sent cleanly. Email 2 then failed, repeatedly, at a different layer each
time. Every one of these had been written independently, and every one encoded
*a package sends exactly once*:

| # | Gate | Effect | Fixed |
|---|---|---|---|
| 1 | Send guard: status must be APPROVED | the send was illegal | `3c44834` |
| 2 | Queue query: only READY / NEEDS_DECISION / APPROVED listed | the row vanished from the only screen with a send button | `86a5073` |
| 3 | Card sorting: actionable set keyed on status | the row rendered as a bare name over "Open prospect" | `77ecad4` |
| 4 | Route: terminal-status check rejects **every** action | *"That package is already SENT."* | `0e420f3` |
| 5 | Route: send action re-checks status is APPROVED | *"Approve it first."* | `0e420f3` |

**A package becomes SENT when its FIRST email goes out.** So the entire
follow-up feature — guard, list, sorting, route — treated a sequence with one
email sent as finished business.

### How this was made worse

I fixed these one at a time, and each fix looked complete because it removed the
error I could see. Ary pressed Send three times and failed three times. The
correct move after the second failure was to trace the whole path from button to
Gmail before touching anything; that is what finally found gates 4 and 5
together, and confirmed there is no sixth.

Two of these gates sit directly beneath comments describing the *same bug*
happening one step earlier — the queue query's comment records that APPROVED had
to be added because approved packages dropped out leaving nothing to send, and
the card's comment records the same about sorting. I read both and walked into
the identical hole.

### ⚠️ And a near-miss worth recording

The first version of the gate 4/5 fix compared against `STATUS.SENT` — **a
constant that did not exist**. Four places in the codebase compare against the
literal string while the STATUS map never defined it. Comparing a status to
`undefined` is permanently false, so the fix would have shipped, changed
nothing, and failed Ary's fourth click with the identical message. It has a name
now, and a test asserts it, because a missing constant fails silently.

### What stayed closed

The exception is scoped to the **send** action on a **sequence-approved**
package at **step above 1**. Approve, edit and skip remain closed on a sent
package. Verified against live production rows:

| Case | Block |
|---|---|
| Automatic while switch OFF | `automation-off` |
| Resend Email 1 | `not-approved` |
| Step 3 (not in package) | `copy-not-approved` |
| Never sequence-approved | `not-approved` |
| Fingerprint missing | `approval-incomplete` |
| Fingerprint mismatched | `stale-approval` |
| Prospect replied | `unanswered-reply` |
| Do-not-contact / unsubscribed | `do-not-contact` / `unsubscribed` |

---

## Email 1 — real native send

| | |
|---|---|
| Attempt | **6** · step 1 · succeeded · no error |
| Event | **8** · step 1 · package 15 |
| Provider message id | **`19ff220477868206`** |
| Provider thread id | **`19ff220477868206`** |
| Subject | `threading test from LTB` |
| Fingerprint | matched before send; stripping it returned `approval-incomplete` |
| Dedupe key | `msg:19ff220477868206` |

## Thread source

The resolver's exact query, run against production, returned event 8 — thread
`19ff220477868206`, message `19ff220477868206`, subject `threading test from
LTB`. Email 2 therefore inherited that subject, set `In-Reply-To` and
`References` to Email 1's real message id, and handed Gmail that thread id.

## Email 2 — real native send

| | |
|---|---|
| Attempt | **7** · step 2 · succeeded · no error |
| Event | **9** · step 2 · package 15 |
| Provider message id | **`19ff25fe4d98d069`** — its own, new |
| Provider thread id | **`19ff220477868206`** |
| Subject | `threading test from LTB` — preserved |
| Fingerprint | matched |
| Dedupe key | `msg:19ff25fe4d98d069` |

## Gmail conversation — stated plainly

**Email 1 and Email 2 share thread `19ff220477868206`.**

Across both events: **1 distinct thread id, 2 distinct message ids.** That is
Gmail's own returned value, not an inference from headers — which was the
explicit acceptance condition. Two messages, one conversation.

## Dedupe

Distinct dedupe keys under the unique send-event index; distinct attempt keys
under the unique attempt index; one attempt and one event per step;
`emails_sent` incremented once per send, 0 to 1 to 2. No second provider call
was made to prove any of this.

## Override cleanup

Nothing to clear — it holds no persisted state and is computed at send time from
identity. It is now inert on its own terms: the sequence is complete at 2 of 2,
so the real scheduler returns no next step and the override passes it through
untouched. The module remains in the codebase, tested and narrow, and can be
deleted on request.

---

## The approval-fingerprint audit gap

The `approval_fingerprint` column on send events has existed since the table
shipped and was **never written** — all 9 historical rows are NULL. The guard did
run; the record simply could not show what it had checked, which makes an audit
a matter of trusting whoever describes it.

`recordSend` now writes the value the caller validated. **Passed in, not
recomputed**: recomputing at write time would record what the package hashes to
*now*, which is a different question from what passed the guard, and would
quietly turn a real check into a tautology.

**Forward-only.** Historical rows stay NULL, because they are truthful about
what was recorded at the time and a value inferred today would claim a check
nobody can show happened.

⚠️ **This failed its tests for a reason worth keeping:** both test files build
their schema from **hand-picked migration lists** that stop before the migration
where the column was added. The write worked in production and failed in tests.
One of those lists sits directly under a test whose own comment explains that a
partial list only checks what somebody remembered; the other carries a note
about a migration having been left out once already for the same reason.

---

## Final scorecard

| Gate | Status |
|---|---|
| V2 Email 2 native send | **PASS** |
| Native reply sync | **PASS** (earlier canary) |
| Reply stops sequence | **PASS** (earlier canary) |
| Email 3 scheduler anchor | **PASS** (earlier canary) |
| Dedupe | **PASS** |
| Missing approval fingerprint blocks | **PASS** |
| New approval always fingerprints | **PASS** |
| Edit-after-approval blocked | **PASS** |
| Native Email 1 records real thread | **PASS** |
| Native Email 2 reuses real thread | **PASS** |
| Gmail shows one conversation | **PASS** |
| Threading subject ownership | **PASS** |
| Internal canaries excluded from real automation | **PASS** |
| Approval fingerprint recorded on new sends | **PASS** |
| AUTO_SEND_FIRST | **OFF** |
| AUTO_SEND_FOLLOWUPS | **OFF** |

---

## Safety

Only `arylombres@gmail.com` was contacted. **Zero real prospects** — send events
outside the canary during this window: 0. Exactly **two** new test emails. Both
auto-send switches OFF throughout. No cadence weakened: the spacing table is
unchanged and asserted so. No provider timestamp falsified. No real cohort
enabled, and none is recommended in this pass.

## What is honestly still unproven

- **Threading onto a sequence older than native sending.** Any prospect
  contacted before LTB could send has no recorded thread id, so their follow-ups
  will correctly start a new conversation. That is a data limit, not a bug, and
  the code says so rather than faking it.
- **Email 3 in a real thread.** This canary was capped at two steps. The third
  step's behaviour is inferred from the same code path, not observed.
- **Reply matching on a native thread across a longer sequence.** The earlier
  canary proved reply-stop; this one proved threading. Nothing has run both at
  length.
