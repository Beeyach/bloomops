# V2 follow-up automation readiness and canary

**Date:** 2026-08-11
**Status:** `CANARY READY — WAITING FOR ARY'S TEST-INBOX APPROVAL`
**Commit:** `d07f003` — deployment `fba9ec40`, Production, Active
**Tests:** 1,591 passing (16 new)
**Emails sent: 0. Send jobs created: 0. Model calls: 1 ($0.00454). Rows written: 0.**

---

## Before

Shadow mode could work out who was owed which email and write it. Two things
stood between that and a send, and the first was not a gap — it was a safety
accident nobody had noticed.

### 1. A follow-up could not be sent at all

`canSendNow` takes an `isFollowup` flag. It uses it twice: to decide **which
auto-send switch applies**, and to decide whether a send is a duplicate:

```js
if (Number(existingSends) > 0 && !isFollowup) → BLOCK.ALREADY_SENT
```

**No caller ever set it.** The queue passes it from a payload nothing populates
yet; the manual "Send now" button never passed it. So every send was judged as a
first email, and **anybody with a recorded send was blocked as "already sent".**

The second email in a sequence could not go out through this app under any
circumstance. It never bit because no second email has ever been attempted.

### 2. The live path still used the retired prompt

`PREPARE_FOLLOWUP` called the legacy generator: no step number, never shown
Email 1, no ceiling, writing into `pending_draft` while Email 1 lived in a
package. The proven V2 generator was wired into exactly one place — the shadow
preview — and nothing else.

> **What prevented the shadow path from being trusted as a real-send path:** the
> guard could not tell a follow-up from a first email, and the live preparation
> job was not running V2 at all.

## Live-path audit

| question | answer |
|---|---|
| does `PREPARE_FOLLOWUP` use the legacy writer | it did; now V2 |
| was V2 wired into any live route | only `/api/followup-preview` (shadow) |
| what does `AUTO_SEND_FOLLOWUPS` gate | the **send**, inside `canSendNow` |
| can a follow-up job exist with it off | no — the only enqueue site sits inside the auto-send branch |
| can manual "Send now" bypass the switch | **yes, by design** — a person pressing send is the consent |
| is the step preserved preparation → send | now yes, and re-derived at send time |
| can a legacy path still generate a follow-up | no — `buildFollowUpParts` throws |
| can Email 4+ be reached | no — bounded at policy, at the write, and at the guard |

## V2 wiring

`PREPARE_FOLLOWUP` now:

1. checks eligibility with the same `nextStepFor` the shadow queue uses
2. refuses if no step is owed, naming the reason
3. **refuses if there is no Email 1 on file** — no angle, no draft
4. builds the prompt with the exact step, the ceiling and Email 1 verbatim
5. runs the same deterministic validators
6. **writes nothing if they fail**, and notes on the prospect that a draft was
   written and rejected

Shadow preview and live preparation share one generation library. Only
persistence differs, which is the whole point: a second generator is how two
sets of rules start disagreeing.

## Legacy retirement

`buildFollowUpParts` is a throw, not a deletion, so anything still reaching for
it fails loudly rather than quietly producing copy that never met the V2 rules.

Moving its tests onto the V2 prompt surfaced **three rules the newer prompt had
silently dropped**:

- the **known-unknowns block** that hands the model what nobody has checked, so
  uncertainty has somewhere to go instead of being filled in
- the ban on **figures of speech** ("fall through the cracks", "slip away")
- the requirement that **every specific claim trace** to the evidence or to
  Email 1

All three are back. That is the argument for migrating tests rather than
deleting them: the assertions were the only record that those rules existed.

`parseFollowUp` stays — it is Email 1's parser, not a follow-up generator.

## Send-time guards

Every one of these is re-checked in the last instant, on the live record, not
trusted from preparation time.

| gate | how |
|---|---|
| exact step | derived from recorded sends, **before** the guard runs |
| is this a follow-up | derived as `step > 1`, never from a caller's flag |
| band ceiling | `effectiveCeiling`, blocks with `PAST_ALLOWED_LENGTH` |
| human reply | `canSendNow` re-reads reply events |
| DNC / unsubscribed / won / lost | blocked |
| contact usable | blocked if the address is gone |
| copy approved | **a step whose words were not in the approved package is blocked** |
| stale approval / fingerprint | blocked |
| wrong name | deterministic greeting guard, no bypass |
| send window | unchanged, still enforced |
| automation off | follow-ups consult the follow-up switch, which is off |

The copy-approval gate is worth calling out: approving a package approves the
words in it, so a follow-up step that was not in those words has had no human
eye on it and cannot go. That is the human-approval requirement enforced by the
send path rather than by convention.

## Dedupe and reconciliation

Unchanged and already proven: one provider success is one event, keyed on the
Gmail message id against a unique index. The attempt key
(`prospect:step:fingerprint`) stops the send itself repeating — a succeeded
attempt returns "already sent", an in-flight one reconciles instead of
re-sending. A missing event repairs from the attempt's own facts without
re-sending.

## Canary design

A dedicated internal record. **No real prospect, and no real prospect's data.**

| | |
|---|---|
| record | `LTB Canary (internal test)` |
| recipient | **awaiting your confirmation** |
| rating | 💚 → P1, ceiling 3 |
| Email 1 | synthetic, about a test booking form |
| step-1 send event | synthetic, dated 2026-08-06 |
| step under test | **Email 2** |
| due | 2026-08-10, overdue by 1 day |
| later step | Email 3 would become due at day 10, not immediately |

The script has **no send flag**. Sending can only happen through the app's own
approve-then-send path, so the canary cannot skip the name guard, the ceiling,
the step derivation or the send event by coming through a side door.

Sarah, Mary Ann and every real prospect are excluded by construction.

## Readiness scorecard

| gate | status |
|---|---|
| V2 eligibility canonical | **PASS** |
| exact step preserved | **PASS** |
| band ceiling enforced | **PASS** |
| reply stop at send time | **PASS** |
| stale package blocked | **PASS** |
| wrong-name guard | **PASS** |
| dedupe | **PASS** |
| send event | **PASS** |
| next-step scheduler | **PASS** |
| send window | **PASS** |
| legacy path retired | **PASS** |
| canary native send | **PENDING** — needs the test inbox |
| canary reply stop | **PENDING** |

Every code gate passes. The two canary rows need a real send, which needs your
approval.

## Pre-send state

Generated by the real V2 path, validated, and written nowhere.

**Email 1, the angle of record (synthetic):**

> Hi Ary,
>
> I had a look at the booking form on the test site and it asks for a phone
> number before it asks what someone actually wants.
>
> Want me to send you a short rundown of what I would change about the order?
> If that is already sorted, ignore me.

**The exact canary — Email 2:**

> **Subject:** quick note on that booking form
>
> Hi Ary,
>
> Just checking on this. If you want that short rundown of what I would change
> about the order on the booking form, say the word and I will send it over.
>
> Thanks,
> Ary

27 words. All validators passed. $0.00454.

| | |
|---|---|
| recipient | **awaiting confirmation** |
| step | Email 2 of 3 |
| prospect / package id | not created yet |
| due status | OVERDUE by 1 day |
| send window | unchanged, will be enforced at send |
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

## Canary result

Not run. Waiting for approval.

## Safety

| | before | after |
|---|---|---|
| `send_attempts` | 4 | **4** |
| `send_events` | 5 | **5** |
| `send-approved` jobs | 1 | **1** |
| `credit_events` | 199 | **199** |
| `ai_usage` | 53 | **53** |
| canary records in production | 0 | **0** |

- **No real prospect contacted.** No Gmail send of any kind.
- Both switches **OFF**, untouched.
- Scanner concurrency **2**.
- Unchanged: Gmail transport, MIME, threading, provider reconciliation, dedupe,
  the relationship model, Hive, the scheduler heartbeat, the daily wake, cron,
  credit pricing, V2 timing, band mapping, the shadow preview and Today's UX.

The single model call was the canary draft, made through the script rather than
`askBackground`, so it does not appear in `ai_usage` — the same script-versus-
product-path distinction recorded last pass.

**A bug in my own canary script, caught before it mattered:** with no `--create`
flag, `indexOf` returns -1 and `argv[at + 1]` landed on `argv[0]`, the node
binary. The recipient read as confirmed and the "contact usable" gate reported
**yes** on a run where no inbox existed. Fixed; the gate now reads PENDING.

## Limited future cohort — design only, not enabled

If the canary passes, the next step is not the global switch. It is a cohort
bounded by: 1–3 explicitly named records, P1 or P2 only, never P3, no reply on
record, current evidence, a valid address, real send events (so no UNCLEAR
timing), at most one follow-up per prospect, a hard daily cap, and an automatic
stop on any anomaly. **Not built here.**

## Tests

**1,591 passing**, up from 1,575. 16 new in `tests/followup-readiness.test.mjs`
covering the live-path wiring, the retirement, the follow-up-versus-first-email
distinction, the copy-approval gate, every send-time block, and assertions that
preparation cannot send and nothing calls Gmail directly.

## Production

Commit `d07f003`, deployment `fba9ec40`, Production, **Active**.

## Remaining gap

**The canary send itself**, then a limited cohort. Global auto-followups stay
off either way.

---

`CANARY READY — WAITING FOR ARY'S TEST-INBOX APPROVAL`

---

# Phase 2 — canary prepared, awaiting the send click

**Date:** 2026-08-11
**Ary's approval:** confirmed in session — *"yes use the same email"* — test inbox
`arylombres@gmail.com`.

## What was created

No send. Three rows, all internal.

| | |
|---|---|
| prospect id | **6567** — `LTB Canary (internal test)` |
| package id | **14**, status APPROVED |
| recipient | `arylombres@gmail.com` |
| sender | `hello@bloomwired.io` (connected mailbox, has `gmail.send`) |
| step under test | **Email 2 of 3** (💚 → P1) |
| Email 1 | synthetic, 2026-08-06, recorded as a **step-1 send event** |
| due | 2026-08-10, **overdue by 1 day** |
| Email 3 would be due | **2026-08-16**, day 10 from Email 1 |

No real prospect was used, and no real prospect's history was invented.

## The gap the canary found

This is why a canary exists.

With everything else correct, the send guard **blocked the follow-up**:

```
blocked: not-due — No follow-up date set, so nothing is due.
```

The V2 scheduler said `Email 2 · due 2026-08-10 · OVERDUE`. The send guard
disagreed, because its due check still reads the legacy `next_action_date` on
the prospect rather than the V2 schedule.

**So the two halves of the system disagree about whether a follow-up is due.**
Shadow scheduling was built on send events and bands; the send guard was never
moved over. Nothing in the readiness pass caught it because every readiness test
exercised `canSendNow` with fixtures that already carried a date.

For the canary the legacy date was set on the **internal test record only**, so
the click can proceed. That is a patch for one test row, not a fix. Until the
send guard consults the V2 schedule, a genuinely due V2 follow-up on a real
prospect would be refused as "not due".

**This is the next gap, and it is ahead of any cohort work.**

## Gate state on the live rows

Run against the real production rows through the real guard:

| gate | result |
|---|---|
| step 2 copy approved in package | **PASS** |
| recorded send events | 1 (step 1) |
| band ceiling | PASS, Email 2 of 3 |
| reply / DNC / unsubscribe | PASS, none |
| contact usable | PASS |
| mailbox send scope | PASS (`gmail.send`) |
| due check | **needed the legacy date** — see above |
| scheduler anchor | PASS, Email 1's real event |

## Why the send has not happened

The send runs through `POST /api/outreach` with `action: 'send'`, which sits
behind the access gate and needs a session from the access code. I do not have
it, and the brief is explicit that the native path must not be bypassed — no
direct Gmail call, no one-off provider call.

So the last step is a person pressing **Send now** on package 14. That is the
canonical path: name guard, ceiling, step derivation, send window, send attempt,
provider, send event.

## Safety at this point

| | before | after |
|---|---|---|
| emails sent | 0 | **0** |
| `send_attempts` | 4 | **4** |
| `send_events` | 5 | **6** (the synthetic step-1 canary anchor) |
| `send-approved` jobs | 1 | **1** |
| `credit_events` | 199 | **199** |
| `ai_usage` | 53 | **53** |

- No real prospect contacted. No Gmail send of any kind.
- `AUTO_SEND_FIRST` **OFF**, `AUTO_SEND_FOLLOWUPS` **OFF**, neither touched.
- Scanner concurrency **2**.
- No model call in this phase: the approved copy was re-validated against the
  current validators without regenerating it.

## Scorecard

| gate | status |
|---|---|
| V2 eligibility canonical | PASS |
| exact step preserved | PASS |
| band ceiling enforced | PASS |
| reply stop at send time | PASS |
| stale package blocked | PASS |
| wrong-name guard | PASS |
| dedupe | PASS |
| send event | PASS |
| next-step scheduler | PASS |
| send window | PASS |
| legacy path retired | PASS |
| **send guard reads V2 due state** | **FAIL — found by this canary** |
| canary native send | PENDING — one click |
| canary delivery | PENDING |
| canary dedupe | PENDING |
| canary reply stop | PENDING |

**No automation expansion is recommended while a row reads FAIL.**

## Remaining gap

**Move the send guard's due check onto the V2 schedule**, then finish the canary
send, delivery, dedupe and reply-stop checks. A limited cohort comes after both.

---

# Due-guard alignment — fixed, deployed, canary unblocked

**Commit:** `0df8329` — deployment `5c18f362`, Production, Active
**Tests:** 1,591 passing · **Emails sent: 0** · **Model calls: 0** (no regeneration)

## The defect

```js
if (!gate.ok && !(gate.stop === STOP.NOT_DUE && !isFollowup)) → block
```

`canProgressOutbound` decides NOT_DUE from the prospect's `next_action_date`.
For a first email that was tolerated, because an approval is its own due date.
For a **follow-up** it was enforced — against a field the cutover cleared from
most rows and which V2 timing does not use at all.

So the scheduler said *Email 2, overdue by a day* and the guard said *nothing is
due*. Every readiness test missed it: each one handed the guard a fixture that
already carried a date.

## The fix

A follow-up now brings its schedule from `nextFollowupSchedule` — the same
helper Today uses — and the guard consumes it:

- may go out only in **`DUE_NOW`** or **`OVERDUE`**
- **no schedule blocks**, rather than defaulting to sending
- the schedule's step must equal the step derived from send history
- **Email 1 is untouched**: the approval is still its own due date

`next_action_date` is unchanged everywhere else. It still carries deferrals and
the reminders the cutover deliberately preserved on people who replied. This
changed only which clock decides a *cold follow-up* is due.

Send window stays a **separate** gate and was not bypassed.

## Legacy patch removed, and the proof

The test-only date on prospect 6567 was cleared to `NULL`, then the real guard
was run against the real rows:

```
next_action_date   null            (patch removed)
V2 schedule        Email 2 · OVERDUE · due 2026-08-10
guard verdict      blocked: outside-window — Outside the send window
                   (8:00 to 17:00 America/Los_Angeles)
```

**The due gate passes from V2 facts alone, with no legacy date present.** The
only remaining block is the clock, which is the send window doing its job.

## Canary status

Ready. Prospect **6567**, package **14**, Email 2 of 3, to
`arylombres@gmail.com` from `hello@bloomwired.io`. Copy unchanged from the
approved wording, so the existing approval still stands.

It needs a click inside **8:00–17:00 Pacific**. The send API sits behind the
access gate, so Claude cannot trigger it, and the brief forbids bypassing the
native path.

## Scorecard

| gate | status |
|---|---|
| **send guard reads V2 due state** | **PASS** — was the FAIL |
| all prior code gates | PASS |
| canary native send | PENDING — one click, in the send window |
| canary delivery / dedupe / reply stop | PENDING |

## Safety

`send_attempts` 4 → **4** · `send_events` 6 → **6** · send jobs 1 → **1** ·
canary `next_action_date` **null** · both switches **OFF** · scanner
concurrency **2** · no model call, no paid work.

---

# Pre-send verification — 2026-08-11, 02:01 Pacific

Window **closed**. Verified once and stopped; no monitor left running.

All fifteen pre-send gates pass against live production rows:

| gate | |
|---|---|
| prospect 6567 is the canary | PASS |
| package 14 APPROVED | PASS |
| recipient `arylombres@gmail.com` | PASS |
| subject is the approved one | PASS |
| body is the approved one | PASS |
| next step derives as 2 | PASS |
| band P1, ceiling 3 | PASS |
| one step-1 event | PASS |
| no step-2 event yet | PASS |
| no reply on record | PASS |
| no DNC or unsubscribe | PASS |
| contact usable | PASS |
| `next_action_date` NULL | PASS |
| V2 schedule says due | PASS — Email 2, OVERDUE, due 2026-08-10 |
| name guard | PASS |

**Failures: 0.** The only remaining block is the send window,
`08:00–17:00 America/Los_Angeles`, which opens in about 6 hours.

Nothing was sent, nothing was written, no model call, no background task.
Both switches remain OFF.

---

# Gmail threading — checked before the click

**Threading result: NOT TESTED, and a real product question underneath it.**

## 1. Does the native follow-up path use the original thread?

**No.** `lib/gmail-send.mjs` fully supports it — `buildMime` accepts
`inReplyTo` and `References`, and `sendMessage` accepts a `threadId` which it
passes straight to Gmail. But `sendApproved` calls neither with those:

```js
const mime = buildMime({ from, fromName, to, subject, body });   // no inReplyTo
result = await sendMessage(token, { mime });                      // no threadId
```

The thread id is only ever **read back** from Gmail's response and stored. It is
never used to continue a conversation.

**So every follow-up LTB sends starts a new Gmail thread — for every prospect,
not just the canary.**

## 2. Does the canary have a real thread to test with?

**No.** Its Email 1 is synthetic: `provider_message_id = 'canary-e1-6567'` and
`provider_thread_id` is NULL. There is no real Gmail thread, so this canary
**cannot honestly exercise same-thread follow-up either way.**

Recording it as "threading verified" would be a claim nothing here supports.

## 3. Is new-thread behaviour intended?

Undetermined from the code. There is no setting, no comment expressing intent,
and nothing that reads a stored thread id back into a send.

One signal points at new-thread being the de facto design: the V2 generator
writes a **fresh subject for each step** ("your booking form" → "quick note on
that booking form"). A same-thread follow-up would normally reuse the original
subject with `Re:`.

**This is a product decision for Ary, not something to infer from code.** It
does not block the Email 2 canary, which is testing send, event, dedupe and
scheduling rather than threading.

## Window status

Checked 2026-08-11, **02:18 Pacific**. Send window `08:00–17:00` is **CLOSED**.
Verified once, stopped cleanly, no monitor left running. Nothing sent, nothing
written, no model call.

---

# Final native Email 2 canary — VERIFIED

Run 2026-08-11. One outbound email, to the internal test address, pressed by
hand. Nothing else was sent.

## Pre-send gates

Every item checked against production before Ary was asked to click. The
decisive one is the guard itself, run on the real rows:

| | |
|---|---|
| `canSendNow(manual: true)` | **ok: true**, no block |
| `canSendNow(manual: false)` | **blocked — automation-off** |

That pair is the whole safety story: a person can send this, a timer cannot.

Also verified: package 14 APPROVED and reviewed; recipient
`arylombres@gmail.com`; sender `hello@bloomwired.io`; the Email 2 copy byte-for-
byte as approved; V2 said OVERDUE by one day against a 2026-08-10 due date
computed from the send event, not from `next_action_date` (still NULL); name
guard **OK** on the actual outgoing body; window open (Tue 09:52 Pacific, 8–17,
Mon–Fri); `gmail.send` granted and the mailbox connected.

⚠️ **One guard was vacuous.** `approved_fingerprint` on package 14 is NULL, and
the staleness check reads `if (pkg.approved_fingerprint && ...)`. On a null it
does not fail — it does not run. The copy was verified by reading it instead,
and it matched, so nothing unapproved went out. But "the fingerprint passed" was
not available to claim, and a guard that silently skips is worth knowing about.

## The send

| | |
|---|---|
| Attempt | id 5 · step 2 · **succeeded** · no error · 17:12:43 → 17:12:44 |
| Gmail message id | `19ff1cff05b6f74a` |
| Event | id 7 · step 2 · package 14 · subject *quick note on that booking form* |
| Message id | event matches attempt exactly |
| Step-2 events | **exactly one** |
| Step-3 events | **none** |
| `emails_sent` | 1 → **2**, incremented once |
| Package 14 | APPROVED → **SENT** |

## Scheduler

After the send: **Email 3 due 2026-08-16**, `NOT_DUE_YET`, anchored to Email 1
(2026-08-06) rather than to Email 2 — spacing runs from the original anchor, so
sending late does not push the rest of the sequence late.

> P1 · 2 of 3 cold emails sent · email 3 due 2026-08-16 · counted from send event

No Email 4 was created. `next_action_date` stayed NULL throughout.

## Dedupe — three barriers, no second provider call

Proven from state and schema rather than by sending a duplicate:

1. **Package state.** APPROVED → SENT, and the guard requires APPROVED. Re-running
   it returns `not-approved`.
2. **Attempt key.** `6567:2:14|1|...` under `UNIQUE INDEX idx_attempt_key
   (workspace, attempt_key)`. A retry derives the identical string and collides.
3. **Message id.** Event `dedupe_key = msg:19ff1cff05b6f74a` under `UNIQUE INDEX
   idx_send_dedupe (workspace, dedupe_key)`. The same Gmail message cannot be
   recorded twice.

## Native reply sync — caught without any manual pasting

Ary replied from the test inbox. The Gmail sync ingested it on its own:

| | |
|---|---|
| Reply event | id 21 · **inbound** · source `gmail` |
| From | `arylombres@gmail.com` |
| Subject | *Re: quick note on that booking form* |
| Snippet | *"Interested — test reply …"* |
| Classification | **interested** |
| `requires_human` | **1** |
| Matched by | **thread** (`19ff1cff05b6f74a`) |
| Detected | 17:18:44, about six minutes after the send |

Nothing was inserted by hand. The sync also recorded the outbound side as event
20, matched by `sent-to`.

## Reply stops the sequence

| | |
|---|---|
| Stage | **Interested** |
| `replied` | **1** |
| Scheduler | step **null**, status **NEEDS_HUMAN** |
| Reason | *"They replied. This is a conversation now, not a sequence."* |
| UI | pile `needs-you` → **Replied** tab · "Interested" · "They want to talk." |

And Email 3 is unreachable even if forced — approved status, manual trigger,
guard invoked directly:

> `copy-not-approved` — *Email 3 was not in the package when it was approved, so
> nobody has read it.*

Two independent reasons it cannot go: the reply stops the sequence, and the copy
was never written or read.

## ⚠️ Threading — NOT TESTED, and now demonstrably so

The new event's `provider_thread_id` **equals its own message id**: Gmail opened
a new thread rather than continuing one. It could not have done otherwise — the
synthetic Email 1 anchor carries `provider_thread_id: null`, so there was no
thread to attach to.

What this run *does* show is that reply matching works on a real thread: the
inbound reply matched **by thread** against Email 2's own thread. What remains
untested is Email 2 threading onto a *real* Email 1. That needs a canary whose
first email was actually sent through Gmail.

## Final scorecard

| Gate | Status |
|---|---|
| V2 due state | **PASS** |
| Exact Email 2 selected | **PASS** |
| Name guard on actual outgoing body | **PASS** |
| Native Gmail send | **PASS** |
| Delivery | **PASS** (confirmed by Ary replying to it) |
| Step-2 send attempt | **PASS** |
| Step-2 send event | **PASS** |
| Dedupe | **PASS** |
| Email 3 due 2026-08-16 | **PASS** |
| Native reply sync | **PASS** — no manual pasting |
| Reply stops Email 3 | **PASS** |
| Threading | **NOT TESTED** — synthetic Email 1 has no Gmail thread |
| AUTO_SEND_FIRST | **OFF** |
| AUTO_SEND_FOLLOWUPS | **OFF** |

## Safety

One outbound email total, to `arylombres@gmail.com`. Zero real prospects
contacted — `other_today` sends outside the canary: **0**. 7 send events and 5
attempts exist across the whole database, of which this canary contributed one
of each. 5,814 prospects unchanged. Both auto-send switches remain OFF. No
duplicate provider call. No unrelated work touched.

## Cleanup — deliberately not done

The canary is already out of reach of cold automation: `replied = 1` routes it
to NEEDS_HUMAN, so no follow-up can be scheduled, and both switches are off
regardless. Soft-deleting it would hide it from the UI but is a mutation of
production data Ary asked not to have changed, so it is left in place pending
her call. All send, event and reply rows are retained as proof either way.
