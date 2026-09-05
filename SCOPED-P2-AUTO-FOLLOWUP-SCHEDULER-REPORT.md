# The half that was missing

Date: 2026-08-12 · commit `6d84c0a` · Pages `b8ad42e8` · tests 2,105 passing

Every permission was in place. Nothing ever asked for one.

**0 emails sent. 0 credits. 0 packages armed. Both switches still off.**

---

## Part 1 — the gap, proven

The daily cron enqueues one `SWEEP` per workspace. The sweep gates every active
prospect, collects the ones owed a follow-up, and hands them to `queueDrafts`,
which enqueues **`PREPARE_FOLLOWUP`** — a job whose entire contract is to write
a draft and stop.

Every place `SEND_APPROVED` could be created, before this task:

| Where | Gated on | Which email |
|---|---|---|
| `app/api/outreach/route.js` approve action | `policy.autoSendApprovedFirstEmails` | Email 1 |

That is the complete list.

> **A due approved P2 follow-up cannot currently send automatically because
> `lib/runner.mjs`'s `KIND.SWEEP` handler, via `queueDrafts`, only enqueues
> `PREPARE_FOLLOWUP`, while `SEND_APPROVED` is only enqueued by
> `app/api/outreach/route.js`'s approve action — which is gated on the
> first-email switch and therefore never fires for a follow-up.**

Confirmed against production: **one** `send-approved` job has ever existed, id
118 from 2026-08-09, step 1.

### A second thing found on the way

`PRIORITY.SEND_APPROVED` **had no entry in the priority map.** `enqueue` falls
back to `PRIORITY[kind.toUpperCase()...]`, which was `undefined`, which sorts as
0 — below prescreen, below research, behind every stranger in the queue. Nothing
had noticed because nothing ever enqueued one on a schedule.

Now `70`: below the reply lanes, because finding out somebody wrote back
outranks writing to them, and above everything that only produces a draft,
because a message whose window closes at five is not work that can wait.

## Part 2–3 — the contract, and who owns what

**`lib/followup-scheduler.mjs`** — `autoFollowupCandidate()`, pure, no database.

Every condition is delegated to the helper that already owns it. Nothing is
re-implemented, because a cheap selector with its own idea of "safe to send"
would be a second definition, and the two would drift:

| Condition | Delegated to |
|---|---|
| global switch, package permission, step scope | `mayAutoFollowUp` |
| band, length, sequence fields agreeing | `approvedSequenceCeiling` + explicit field checks |
| replies, declines, unsubscribe, DNC, deferral, terminal stage | `canProgressOutbound` |
| due, step, day-4 anchor | `nextFollowupSchedule` |
| Email 2 exists and was approved | `stepCoveredByApproval` |
| copy unchanged since approval | `approvalFingerprint` |
| send window | `insideSendWindow` / `nextWindowOpen` |

### The one stop deliberately not honoured

`canProgressOutbound` returns `not-due` from **`next_action_date`** — the
legacy hand-written date. Part 4 forbids that as a due source, and honouring it
would mean the scheduler never selected anybody, because a prospect with no
`next_action_date` is not "not due", she is a prospect nobody wrote a date on.

So that single stop is skipped and due-ness comes from real send history.
**Every stop that protects a person still applies.** This is a cadence answer,
not a safety one, and it is written down rather than left to be discovered.

### Responsibilities

| Scheduler | Runner |
|---|---|
| is this worth bringing to a worker | may this actually be sent |
| cheap, pure, no transport | reloads live state, calls Gmail |
| may be wrong by the time it runs | is right at the instant it runs |

A scheduler decision is never send authorisation.

## Part 4 — day 4, from the real send

`nextFollowupSchedule` anchors on the step-1 `send_events` row. Verified on the
canary fixture:

```
anchorSource: "send event"   anchor: 2026-08-12   dueAt: 2026-08-16
```

Not the package's creation date, not its approval date, not `next_action_date`,
not a hand-written due date.

Day 4 lands on Sunday. The candidate is still real work, and `runAfter` becomes
**Monday 2026-08-17** inside the window. Cadence and window policy unchanged.

## Part 5 — one job, ever

Dedupe key `ary:send-approved:4860:followup:2`, from the queue's existing unique
partial index over queued, running and waiting jobs.

| | |
|---|---|
| first eligible sweep | one job |
| second sweep before execution | still one — same key, `already queued` |
| a retrying job | the same row, so a sweep during backoff adds nothing |
| sweep after a successful send | zero — the selector sees step 2 in `send_events` and returns `sequence-complete` |
| Email 2 vs a future Email 3 | different keys, so they are different work |

Not "cron probably will not overlap". A unique index.

## Part 6 — revocation after enqueue

1. scheduler sees permission on → 2. enqueues → 3. operator revokes →
4. job runs → 5. **`automation-not-approved`** → 6. nothing sends.

Both layers refuse: the job's pre-flight before spending a token fetch, and
`canSendNow` in the last instant. `auto_followup_revoked_at` is stamped and
`approved_at` / `approved_by` are left alone — history is not deleted because
somebody changed their mind.

## Part 7 — reply after enqueue

1. scheduler queues → 2. she replies → 3. reply sync records it → 4. the runner
returns **`declined`** → 5. the cold sequence stops.

Tested with Cynthia's exact shape as a fixture. **She was not mutated**:
package 19 is `SENT`, `auto_followup_approved = 0`, her stage is
`Not This Offer`, `emails_sent` 1.

## Part 8 — where it runs

Last stage of the existing `KIND.SWEEP` handler. No new service, no new cron, no
coupling to a page load or an API call.

```js
const autoFollowups = await enqueueDueApprovedFollowups(db, ws, { now, mailboxOk: health.safeToPrepare });
```

Cheap by construction. With the switch off it reads the switch and returns
**before touching a package row** — verified by running the real function
against a fake handle:

```
switch OFF -> {"queued":0,"considered":0,"reason":"automation-off"}
switch ON, nothing armed -> {"queued":0,"considered":0,"skipped":{}}
```

With the switch on, it queries only `auto_followup_approved = 1` packages, using
the index migration `056` added.

## Part 9 — `PREPARE_FOLLOWUP` interaction

They cannot collide. `canPrepareFollowUp` decides drafting and only runs where a
follow-up is *owed and unwritten*; an armed package already has an approved
Email 2, which is a precondition of arming it at all.

The scheduler creates no copy. It carries identifiers and the runner sends the
stored approved words. If preparation ever did run on an armed package, the
fingerprint check in both the selector and the runner would refuse anything it
had changed — which is the behaviour wanted, not a regression.

`tests/followup-readiness.test.mjs` asserts the `PREPARE_FOLLOWUP` handler
contains no send path and no call to the new scheduler.

### One test rewritten

That guard used to slice the runner's source between the first mention of
`PREPARE_FOLLOWUP` and the first mention of `PREPARE_OUTREACH` — which is not a
function, it is whatever text lies between two markers. Adding an unrelated
function in that range failed it for a reason unconnected to what it guards. The
property is right and kept; it now extracts the actual handler body by brace
matching, and a second test asserts the scheduler has exactly one caller and it
is the sweep.

## Part 10 — the job payload

```json
{ "packageId": 42, "prospectId": 4860, "step": 2, "isFollowup": true }
```

Four identifiers. No subject, no body, no token. The runner reloads live package
state, because words in a queue payload are a snapshot of what was approved an
hour ago and the whole point of the last-instant recheck is that they may not be
current.

## Part 11 — observability

The job is a normal `send-approved` row, so the queue-state work already
shipped covers ready / delayed / running / stuck / failed / done and the attempt
history from migration `055`.

What is new for an operator: the dedupe key reads
`ary:send-approved:4860:followup:2`, so the kind, the prospect and the **step**
are legible from the row itself. Deliberately surgical — no dashboard redesign.

## Part 12 — audit

One `outcome_events` row per enqueue, `auto-followup-queued`:

```json
{ "packageId": 42, "step": 2, "jobId": 91, "dueAt": "2026-08-16",
  "runAfter": "2026-08-17T15:00:00.000Z", "insideWindowNow": false,
  "packagePermission": true, "globalAutomation": true }
```

Answers why it was selected, which package and step, when it was queued, and
that both permissions were present. **No bodies, no secrets** — asserted by
test. Plus a line in the prospect's activity log.

The send itself stays recorded by `send_events`. The scheduler event is not a
second send event.

## Part 13 — tests

`tests/followup-scheduler.test.mjs`, 36 behavioural tests against the real
selector, the real queue helpers and the real send guard — covering all 35
points: the permission table, dedupe identity, P1/P3 refusal, missing and empty
Email 2, absent sequence approval, `sequence_max_step` below 2, stale
fingerprint at both boundaries, human reply, NO_TO_THIS_OFFER, NO_TO_US, DNC,
unsubscribe, not due, day-4-on-a-weekday, Sunday deferral, out-of-window
deferral plus the runner's refusal, missing thread, all four
after-enqueue races, already-sent, complete sequence, retry identity and
priority ordering, payload and audit contents, purity, unhealthy mailbox, and
both switches off.

Suite: **2,105 passing**, up from 2,068. `next build` clean.

## Part 14 — synthetic end-to-end

The future canary's shape, as a fixture. Nothing real armed, nothing mutated.

| | |
|---|---|
| global OFF | selects **zero** |
| global ON in memory | **exactly one** candidate, step 2, `runAfter` Monday |
| execution rechecks permission | `automation-not-approved` when revoked |
| execution rechecks reply | `declined` |
| execution rechecks fingerprint | `stale-approval` |
| everything clean | `canSendNow` returns `ok: true` |

Stopped there, before the transport. Nothing in that test file can reach Gmail.

## Part 15 — production acceptance, zero work

| | |
|---|---|
| `AUTO_SEND_FIRST` | **false** |
| `AUTO_SEND_FOLLOWUPS` | **false** |
| Packages armed | **0** |
| `send-approved` jobs ever | 1 — id 118, step 1, from 2026-08-09 |
| Follow-up send jobs | **0** |
| `auto-followup-queued` audit events | **0** |
| `send_events` | **10**, latest 2026-08-12T16:35:41Z — unchanged |
| Scheduler code live | yes, `6d84c0a` / `b8ad42e8` |

**The sweep has not run since the deploy.** It is enqueued once a day by the
daily wake at 04:00 UTC; the deploy landed at 21:02 UTC. No sweep was forced, so
there is no live zero-work sweep result to show — only the code path exercised
directly, above, and the deployed commit confirmed.

That is the honest state: the scheduler is live and will run at the next daily
sweep, where with the switch off it will read the switch and stop.

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Real packages armed | **0** |
| Packages created or approved | 0 |
| Cynthia / package 19 mutated | **no** |
| Contacts adopted | 0 |
| Site intel refreshed | 0 |
| Credits | **0** |
| P1 Email 3 | not enabled, not built |
| Guards removed or weakened | **none** |
| Cadence or send-window policy changed | **no** |
| Switches touched | **neither** |

## The next task

> **Find one real P2 seed prospect for the first scoped automatic Email 2
> canary.**

Not started. No prospect found, no package prepared, nothing approved, nothing
armed, no switch flipped.
