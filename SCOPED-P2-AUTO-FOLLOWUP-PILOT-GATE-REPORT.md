# A timer is not a sentence

Date: 2026-08-12 · commit `5c8423e` · Pages `0a57b796` · migration `056` · tests 2,068 passing

Three consents existed. None of them was anybody saying *you may send this
particular email while I am not looking*.

**0 emails sent. 0 credits. 0 packages armed. Both switches still off.**

---

## Part 1 — the current automatic follow-up path

Traced end to end. The finding is smaller and stranger than the brief assumes.

| Stage | What is actually there |
|---|---|
| due selector | `lib/runner.mjs` sweep → ranks prospects → enqueues **`PREPARE_FOLLOWUP`** |
| `PREPARE_FOLLOWUP` | writes a draft into the package. **Never sends.** |
| queue → send job | `KIND.SEND_APPROVED` exists and is handled |
| who enqueues it | **`app/api/outreach/route.js` only**, gated on `policy.autoSendApprovedFirstEmails` — Email 1 |
| global switch check | `lib/send-guard.mjs` `canSendNow` step 1 |
| package selection | none — the job carries a `packageId` given to it |
| send guard | `canSendNow`, then `sendApproved` |
| Gmail transport | `sendMessage` with `threadId` from `threadFor()` |
| thread reuse | Email 1's subject and `In-Reply-To`, so Gmail renders one conversation |
| post-send | `recordSend` / `confirmSend`, `send_events`, package status |

> **Today, setting `AUTO_SEND_FOLLOWUPS=true` would make packages satisfying
> `canSendNow`'s follow-up conditions enter the automatic follow-up path
> because there is **no** second package-level automation permission anywhere
> between the global switch at `send-guard.mjs` step 1 and the Gmail call.**

Where each existing check lives, since the brief asks:

| Check | Where |
|---|---|
| reply freshness | `canProgressOutbound` → `hasUnansweredReply`, plus `REPLY_STATE_STALE` against `maxReplyStalenessMinutes` |
| copy approval / fingerprint | `approvalFingerprint(pkg) === pkg.approved_fingerprint`, and `stepCoveredByApproval` |
| `allowed_length` / `sequence_max_step` | `nextColdStep` via `sequenceCeilingFor`, and `PAST_ALLOWED_LENGTH` |
| package-level automation permission | **did not exist** |

### The honest caveat

**No scheduler enqueues a follow-up send today.** The only `SEND_APPROVED`
enqueue is for Email 1. So flipping the switch this morning would not have sent
anything by itself — the hole is latent, not live, and it would have opened the
moment a follow-up scheduler was written.

That is the right time to close it. A gate added after the scheduler exists is a
gate added after the first unintended send. Said plainly rather than dressed up
as a near miss.

## Part 2 — blast radius, before the fix

Read-only, switch still off, evaluating all 11 live packages as if it were on:

**0 would have sent.** Every one already died on an earlier guard:

| Block | Count |
|---|---|
| `not-approved` | 10 |
| `approval-incomplete` | 1 |

Mostly because their sequences are complete or their step resolves to null. Two
carry a real reply. Package 19 is among them, blocked by Cynthia's decline.

So the pre-fix blast radius was zero **by circumstance**, not by design: no rule
said "not this package", only "not this package *today*". A new P2 package
approved next week, with Email 2 written and Email 1 sent, would have satisfied
every one of those guards.

## Part 3 — the package permission

Migration `056_auto_followup_permission.sql`, applied to production:

```sql
auto_followup_approved     INTEGER NOT NULL DEFAULT 0
auto_followup_approved_at  TEXT
auto_followup_approved_by  TEXT
auto_followup_max_step     INTEGER
auto_followup_revoked_at   TEXT
```

`DEFAULT 0` is the whole safety property. Every one of the 17 existing packages
is off, and nothing infers permission from sequence approval, status, band, or
how complete a package looks — `autoFollowupGranted` reads the stored flag and
nothing else.

Revoking clears the flag and stamps `revoked_at`, deliberately **leaving**
`approved_at` and `approved_by` in place. Who armed it and when is history, and
erasing it on the way out would make the trail agree with whoever looked last.

### The consent model

| Consent | Question it answers | Stored as |
|---|---|---|
| copy approval | do I approve these words? | `approved_fingerprint` |
| sequence approval | do I approve Email 1 and Email 2 as one sequence? | `sequence_approved`, `sequence_max_step` |
| **automation permission** | **may LTB send this one while I am not looking?** | **`auto_followup_approved`** |
| the global switch | does this workspace allow follow-up automation at all? | `autoSendApprovedFollowups` |

Sequence approval does not imply automation permission. They are separate
presses on separate controls, because agreeing to a sentence is not agreeing to
a timer.

## Part 4 — the global switch stays the master kill switch

`mayAutoFollowUp` asks the switch **first**, so a package with permission still
reads `automation-off` while the workspace has automation off.

| Global | Package | Result | Verified |
|---|---|---|---|
| OFF | OFF | `automation-off` | ✅ |
| OFF | ON | `automation-off` | ✅ package permission never outranks it |
| ON | OFF | `automation-not-approved` | ✅ |
| ON | ON | proceeds to the normal guards | ✅ |

Enforced identically through the predicate and through the real `canSendNow`.

## Part 5 — the pilot scope

`pilotEligible` refuses to arm anything outside it, so nobody can switch on
something that would silently do nothing:

- band `P2`
- `allowed_length` 2, `sequence_approved` 1, `sequence_max_step` 2, and the
  ceiling helper agreeing with both
- Email 2 present and non-empty
- `approved_fingerprint` present **and still matching** the current package
- Email 1 actually sent
- a real Gmail thread to reply into, when the caller resolves one

Permission is stored with `auto_followup_max_step = 2`, and step 3 is refused by
the scope check even on an armed package. **No P1 Email 3 automation. P3 has no
follow-up and is never offered the control.**

## Part 6 — every existing guard preserved

Nothing removed, nothing duplicated. The new check is one branch, inserted
between the global switch and the approval check. Verified through the real
guard on an armed package:

| | |
|---|---|
| human reply | `declined` |
| unsubscribe | `unsubscribed` |
| do-not-contact | `do-not-contact` |
| changed Email 2 | `stale-approval` |
| missing Email 2 | cannot be armed; `copy-not-approved` if it were |
| step past the sequence | `past-allowed-length` |
| not due | blocked, after permission passes |
| Sunday | `outside-window` |
| outside hours | `outside-window` |
| no send scope | `no-send-scope` |

## Part 7 — the reply regression

A **synthetic** copy of package 19, armed, against Cynthia's shape:

```
armed + global ON + her decline  ->  blocked: declined
```

Permission does not survive a reply. Package 19 and prospect 4860 were read and
not written: `auto_followup_approved = 0`, status `SENT`, `emails_sent` 1.

## Part 8 — operator UI

A separate control on the approved-package card, never folded into sequence
approval:

> **Allow automatic follow-up**
> If there is no reply and all safety checks still pass when Email 2 is due,
> LeadsThatBloom may send the already-approved follow-up automatically.
>
> *Nothing is sent by pressing this.*

Armed, it reads `Automatic follow-up is on for this package, up to email 2.` and
offers **Turn automatic follow-up off**, with `The copy and the sequence
approval stay exactly as they are.`

Armed while the workspace switch is off, it adds:

> Automatic follow-up is approved for this package, but automation is currently
> turned off globally.

Shown only where it could do something: P2, sequence approved to step 2, Email 2
present, Email 1 sent.

### One thing fixed on the way

The card is rebuilt client-side from the list payload, and the sequence control
once shipped into a branch that could never render because two fields were
missing there. All four fields the automation block reads are now in the list
response, and `autoSendFirst` / `autoSendFollowups` are **read from the
workspace** instead of hardcoded `false` with a comment saying both switches are
off. That comment was true when written and is exactly the kind that outlives
its fact.

## Part 9 — revocation

Immediate. `mayAutoFollowUp` reads the flag on every call, so a revocation
between enqueue and execution blocks the send — tested directly. It does not
touch copy approval, sequence approval, Email 2, or send history.

## Part 10 — audit trail

An `outcome_events` row per change, `auto-followup-granted` / `-revoked`, with
package id, prospect id, timestamp, the session role that made the change, and
the allowed step. Plus a line in the prospect's activity log.

**No email bodies and no credentials**, asserted by test.

## Part 11 — defence in depth

1. **Before expensive work.** The `SEND_APPROVED` job reloads the package and
   asks `mayAutoFollowUp` before `sendApproved` is called at all — no token
   fetch, no mailbox health call, no message build.
2. **In the last instant.** `canSendNow` asks the same predicate again, which is
   the layer that actually protects the recipient, because permission can be
   revoked while a job waits in the queue.

Both call one pure function, so the selector and the guard cannot drift into
enforcing different things. A test asserts they return the same block for the
same inputs.

## Part 12 — the block reason

`automation-not-approved`, distinct from `automation-off`, `declined` and
`not-due`. One is a workspace switch; the other is a decision about one
sequence, and reading them as one is how somebody concludes the feature is
broken when it is working.

## Part 13 — tests

`tests/auto-followup-gate.test.mjs`, 28 behavioural tests covering all 32 points
in the brief: the four-cell truth table through both the predicate and the real
guard, grant and revoke as flag writes, revocation after enqueue, sequence
approval without permission and permission without sequence approval, step-2
scope with step 3 refused, P1/P3 refused, missing Email 2, missing and stale
fingerprint, changed Email 2, human reply, the Cynthia fixture, unsubscribe,
do-not-contact, not due, weekend, send window, missing thread, thread semantics
untouched, audit shape, historical default off, selector/guard agreement, and
both switches off.

Six `strategy-v2` fixtures and two hand-picked migration lists needed updating.
The fixtures now arm the package, because those tests are about what the guard
does *after* permission — an unarmed fixture would block before reaching the
rule under test. The migration lists were caught by the existing schema-drift
guard the moment `056` landed, which is what that guard is for.

Suite: **2,068 passing**, up from 2,040. `next build` clean.

## Part 14 — production acceptance

| | |
|---|---|
| `AUTO_SEND_FIRST` | **false** |
| `AUTO_SEND_FOLLOWUPS` | **false** |
| Packages with automation permission | **0** of 17 |
| Automatic follow-ups eligible now | **0** |
| Would become eligible by flipping the global switch alone | **0** |
| Live packages evaluated against the gate with the switch forced on | 11, **all** `automation-not-approved` |
| `send_events` total | **10, unchanged** |

Proven synthetically, without mutating anything real:

```
structurally eligible P2, permission OFF   ->  automation-not-approved
same fixture, permission ON                ->  past the gate, onto the real guards
Cynthia's shape, permission ON             ->  declined
```

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Packages created or approved | 0 |
| Real packages opted in | **0** |
| Cynthia / package 19 mutated | **no** |
| Contacts adopted | 0 |
| Site intel refreshed | 0 |
| Credits | **0** |
| P1 Email 3 automation | not enabled, not built |
| Guards removed or weakened | **none** |
| Global switches touched | **neither** |

### One thing worth knowing

`lib/send-guard.mjs` reads as a binary file to `grep`. It contains two literal
`\x00`/`\x01` bytes used as field separators inside the fingerprint template.
Deliberate and correct — unambiguous delimiters that cannot appear in email
copy — but it means searching that file needs `grep -a`. Noted because it looks
alarming and is not.

## The next task

> **Find one real P2 seed prospect for the first scoped automatic Email 2
> canary.**

Not started. No prospect found, no package prepared, nothing approved, nothing
armed, no switch flipped.
