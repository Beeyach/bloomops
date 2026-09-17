# A run that did the important part is not a run that did nothing

Date: 2026-08-13 01:38 UTC · commit `b9a3ee2` · Pages `12d1ceb1` · migration `057` · tests 2,143 passing

**0 emails sent. 0 credits. Package 23 untouched. No sweep forced. Both switches OFF.**

---

## First, the premise

This task was written to run after **2026-08-13 04:00 UTC**. It is **01:38 UTC**.
The 04:00 wake has not happened and cannot have — it is about 2h20m away.

So neither branch's precondition is met. The wake is not missing; it is not due.
Branch A cannot be verified, and Branch B's trigger ("no wake after a reasonable
post-04:00 grace period") has not been reached.

What *has* been outstanding since yesterday is real and blocks acceptance under
this task's own reasoning:

> an unattended scheduler whose health heartbeat says it did not complete cannot
> be considered accepted until the discrepancy is understood.

That is diagnosed and fixed here. Natural acceptance still waits for the cron.

## Part 1 — what production actually shows

| | |
|---|---|
| Latest daily-wake invocation | **2026-08-12 04:00:28 UTC** |
| Latest daily-wake completion | **never** (`last_completed_at` null) |
| Latest sweep, `ary` | job **487**, created 04:00:29, `done` |
| Latest sweep, `ellen` | job **486**, created 04:00:29, `done` |
| Both sweeps completed | **yes**, no errors |
| Wake ran after scheduler deploy (21:02 UTC) | **no** |
| Any job created after 03:00 today | **none** |
| `cron-drain` heartbeat | invoked **and** completed, minutes ago |

The five-minute drain is healthy. The daily wake fired once, yesterday, and did
not mark itself finished.

## Part 2B — the diagnosis

The handler's order is: `markSchedulerInvoked` → wake budget waiters → enqueue a
`SWEEP` per workspace → `renewWatches` → `markSchedulerCompleted`.

> **The 2026-08-12 wake performed the budget-waiter wake and enqueued both
> workspace sweeps (jobs 486 and 487 at 04:00:29, both of which completed) but
> failed to mark completion because something between that enqueue and
> `markSchedulerCompleted` did not return — and no error from that run was
> persisted anywhere, so the exact cause is not recoverable.**

Only `renewWatches` sits in that gap. What can be said about it from data:

- the mailbox is `connected`, watch expiry `2026-08-16T17:40:29Z`
- on 2026-08-12 that was four days out, and renewal triggers at 48 hours
- **zero** `gmail-watch` jobs have ever been created, so the loop body never ran
- the account query is `.catch()`-guarded and cannot throw

So the stage had nothing to do, and I cannot show what stopped it. **No
historical exception is invented.** The control flow is reproduced in tests
instead.

`markSchedulerCompleted` carries a comment saying it is never written from a
failure path, because a run that threw has not completed and saying otherwise
would hide exactly this case. That is correct and stays. The problem is not that
it refused to lie — it is that it was the only thing recorded.

## Part 3B — truthful completion semantics

Migration `057` adds four columns to `system_heartbeats` (no new table):
`last_outcome`, `last_stages`, `last_error`, `last_finished_at`.

| Outcome | Meaning | Advances `last_completed_at` |
|---|---|---|
| `completed` | every stage succeeded | **yes** |
| `partial` | the sweep enqueue worked, a later stage did not | **no** |
| `failed` | the sweep enqueue itself failed | **no** |

`partial` exists for exactly what happened. Calling it a failure sends somebody
hunting a broken sweep that worked perfectly; calling it success hides a real
error. It is neither, and it deliberately does not claim completion.

The four states an operator must tell apart, now distinguishable from the
heartbeat alone:

| | Signal |
|---|---|
| cron never invoked | `last_invoked_at` stale or null |
| invoked, sweep enqueued, later maintenance failed | `outcome = partial`, sweep stages `ok: true` |
| invoked, sweep enqueue failed | `outcome = failed`, that stage `ok: false` |
| full success | `outcome = completed`, completion advanced |

## Part 4B — failure isolation

Each stage runs through `runStage`, which catches, records and continues. **Errors
are not swallowed**: every one reaches the heartbeat sanitized and the HTTP
response verbatim, and a failed run answers 500. Being caught only stops one
stage destroying the record of another.

Per-workspace isolation too: each workspace's sweep enqueue is its own stage, so
`ellen` failing cannot cost `ary` its sweep. Previously one throw in that loop
ended the request.

Errors are passed through `sanitizeError` — a test asserts a stage failing with
`token=ya29.…` records the message and not the token.

## Part 5B — tests

`tests/daily-wake-stages.test.mjs`, 10 behavioural tests against a real database
with the real migrations, driving the handler's actual control flow:

1. full wake → invoked **and** completed, outcome `completed`
2. no invocation → no heartbeat, and health reads `UNKNOWN` without alarm
3. **the 2026-08-12 shape** — sweeps enqueued, watch renewal throws → `partial`, completion not claimed, and both sweep stages still recorded as successful
4. one workspace failing does not cost the other its sweep
5. a budget-waiter failure is recorded and the sweep still runs
6. mark-completed never written on a failed run
7. partial work never labelled full success
8. all four operator cases distinguishable from the heartbeat alone
9. a stage error reaches the heartbeat with the secret stripped
10. nothing here can send, arm or approve

Suite: **2,143 passing**, up from 2,133. `next build` clean.

### Two test guards corrected, not deleted

- Two heartbeat fixtures hand-copied the table schema inline and fell behind the
  moment a column was added. They now build from the real migration files.
- A guard counted `FROM system_heartbeats` occurrences and expected exactly one.
  The deploy-window fallback read is a second query against the *same* table, not
  a second mechanism, and counting statements could not tell the difference. It
  now checks the real property: one table, one exported reader, and no later
  migration creating another.

## Part 6B — deployment

| | |
|---|---|
| Migration `057` applied to production | **before** the deploy, at 01:35 UTC |
| Commit | `b9a3ee2` |
| Pages | `12d1ceb1`, `deploy:success` |
| Daily wake forced | **no** |

Ordering mattered: the new read selects columns that did not exist, so the
migration went first. The reader also falls back to the two original columns, so
the health page survives any window where code and schema disagree.

**The daily wake was not triggered to make this report green.** There is no safe
test mode for it that does real work, and inventing one to manufacture a passing
acceptance would defeat the point.

## Package 23 — untouched

| | |
|---|---|
| id / version / status | 23 / v3 / `READY_FOR_APPROVAL` |
| `sequence_approved` | 0 |
| `sequence_max_step` | null |
| `auto_followup_approved` | 0 |
| `approved_fingerprint` | null |
| `reviewed_at` | null |
| `updated_at` | `2026-08-13T01:00:38.133Z` — the regeneration, nothing since |
| `emails_sent` | 0 |
| `send_events` total | **10** |
| Packages armed | **0** |
| Follow-up `SEND_APPROVED` jobs | **0** |

**Package 23 remains unreleased.**

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Approvals / sequence approvals / automation grants | **0** |
| Switch changes | **none** |
| Sweeps or wakes forced | **none** |
| Prospect work forced | **none** |
| Site intel refreshed | 0 |
| Paid prechecks | 0 |
| Credits | **0** |
| Cynthia / package 19 | untouched |
| Package 23 | untouched |

## What happens next

At **04:00 UTC** the daily wake fires on the new code. It will record one of
`completed`, `partial` or `failed`, with per-stage detail either way.

Re-run the acceptance after that. If the outcome is `completed` and the
auto-followup stage did zero work, package 23 is released for review.
