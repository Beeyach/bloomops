# The wake ran, and told us exactly what was wrong

Date: 2026-08-13 04:17 UTC · wake `04:00:26` · outcome **partial** · fix `ac3c1bd` / Pages `229cf5ed`

The daily wake fired naturally on the hardened code. It did every piece of work
the pipeline depends on, one maintenance stage failed, and — unlike yesterday —
it said which one and why.

> **DAILY WAKE ACCEPTANCE STILL PENDING**

**0 emails sent. 0 credits. 0 packages armed. Package 23 unchanged. Both switches OFF.**

---

## Part 1 — the natural wake

| | |
|---|---|
| `last_invoked_at` | **2026-08-13 04:00:26 UTC** |
| `last_finished_at` | **2026-08-13 04:00:27 UTC** |
| `last_outcome` | **`partial`** |
| `last_completed_at` | **null** — partial does not claim completion |
| `last_error` | `ReferenceError: needsRenewal is not defined` |

**Natural, not forced.** It fired at `04:00:26` on the `0 4 * * *` schedule, the
same second-offset as every previous day (04:00:28, 04:00:35, 04:00:50). No cron
was triggered, no sweep enqueued, nothing manufactured. It ran on `b9a3ee2`,
deployed 2026-08-12 21:02 UTC, roughly seven hours before.

### The stages, recorded

```
budget-waiters        ok    { ary: 0 }
sweep-enqueue:ellen   ok    queued
sweep-enqueue:ary     ok    queued
watch-renewal         FAILED  ReferenceError: needsRenewal is not defined
```

This is the hardening working exactly as designed. Yesterday the same failure
produced *"started, but did not finish"* and nothing more. Today it names the
stage, keeps the proof that both sweeps were enqueued, and refuses to claim
completion.

## Part 3 — the sweeps

| Job | Workspace | Status | Attempts | Created | Error |
|---|---|---|---|---|---|
| **601** | `ary` | `done` | 1 | 2026-08-13 04:00:27 | none |
| **600** | `ellen` | `done` | 1 | 2026-08-13 04:00:27 | none |

Both enqueued by the wake and both completed. Daily-wake completion and queue-job
completion are separate facts: the wake finished at 04:00:27 with a failed stage,
and the sweeps it created ran to `done` afterwards.

## Part 4 — the auto-followup stage did zero work

The `ary` sweep's own result, recorded in `outcome_events`:

```json
{ "scanned": 500, "paused": 7, "reconsider": 0, "drafting": 10,
  "researching": 8, "waiting": 1, "autoFollowupsQueued": 0 }
```

**`autoFollowupsQueued: 0`.** The scheduler stage ran, on the schedule,
unattended, with automation off, and queued nothing.

The rest of that line is ordinary sweep work — 10 drafts, 8 research jobs, 7
paused for replies — and is unrelated to the auto-followup stage.

| Counter | Expected | Actual |
|---|---|---|
| `AUTO_SEND_FOLLOWUPS` | false | **false** |
| `AUTO_SEND_FIRST` | false | **false** |
| Packages armed | 0 | **0** |
| Follow-up `SEND_APPROVED` jobs | 0 | **0** |
| `auto-followup-queued` events | 0 | **0** |
| `send_events` total | 10 | **10** |

## Part 6 — package 23

**27 of 27 checks pass.** v3, `READY_FOR_APPROVAL`, P2, `allowed_length` 2, both
emails byte-exact, no Email 3, `sequence_approved` 0, `sequence_max_step` null,
`auto_followup_approved` 0, no fingerprint, `reviewed_at` null, `emails_sent` 0,
`send_events` 0. `updated_at` still `2026-08-13T01:00:38.133Z`.

## The failing stage, diagnosed

> **`app/api/cron/drain/route.js:334` calls `needsRenewal(a)`. That function is
> exported from `lib/gmail-store.mjs` and imported by `lib/runner.mjs` — and
> never by the route.**

So `renewWatches` has thrown a `ReferenceError` on **every daily wake since it
was written**. Yesterday's missing completion mark is now evidence rather than
inference: same stage, same error, no longer invisible.

### What it cost

**Zero `gmail-watch` jobs have ever been created.** Renewal never ran once.

| | |
|---|---|
| Watch expires | **2026-08-16T17:40:29Z** |
| Renewal is meant to fire at | 48 hours left → **2026-08-14 17:40** |
| Margin remaining when found | about **37 hours** |

Gmail drops a watch after seven days. Had this stayed broken, the watch would
have lapsed and replies would have stopped arriving by push — the exact failure
the daily renewal exists to prevent. The five-minute reconcile would still have
caught replies eventually, so this was degradation rather than silence, but the
primary path was going to stop.

### The fix

One import.

```js
import { needsRenewal } from '@/lib/gmail-store.mjs';
```

Nothing else in the stage changed. No retry semantics, no queue behaviour, no
scheduler logic.

### The guard that should have caught it, and missed twice

`tests/missing-imports.test.mjs` exists for precisely this bug — it was written
after `parseFollowUp is not defined` blocked every first-contact package. It
failed here in two independent ways:

1. **It scanned `lib/` only.** The route lives in `app/api/`, which was never
   looked at.
2. **Its call regex consumed the character before the name.** The pattern was
   `(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(` — so in `if (needsRenewal(a))` the
   opening bracket was eaten by the `if (` match, and `needsRenewal` was never
   examined. **Every nested call in the codebase was invisible to it**, including
   in `lib/`, where it was supposedly working.

Both fixed: a lookbehind `(?<![.\w$])`, and `app/` and `components/` are now
scanned as consumers.

**Verified by reverting.** With the import removed the guard fails:

```
app\api\cron\drain\route.js calls needsRenewal(), exported by gmail-store.mjs,
without importing it
```

With it restored, green. A guard that passes while the bug is present is worse
than no guard, so this one was tested in both directions before being trusted.

## Deployment

| | |
|---|---|
| Commit | `ac3c1bd` |
| Pages | `229cf5ed`, `deploy:success` |
| Tests | **2,143 passing**, `next build` clean |
| Migrations | none |
| Scheduler, queue, send guards | unchanged |

## Release decision

Acceptance requires `last_outcome = completed`. It is **`partial`**.

> **Package 23 remains unreleased.**

Everything else passed: the wake was natural, both sweeps ran, the auto-followup
stage did zero work with automation off, every counter held, and package 23 is
byte-for-byte intact. The single blocker is a maintenance stage that has now
been diagnosed and fixed.

The next natural wake is **2026-08-14 04:00 UTC**, on `ac3c1bd`. If it records
`completed`, package 23 is released.

I did not force a run to turn this green. Manufacturing a passing wake would
prove nothing about the schedule, which is the only thing this acceptance is
actually testing.

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Approvals / sequence approvals / automation grants | **0** |
| Switch changes | **none** |
| Sweeps or crons forced | **none** |
| Credits | **0** |
| Cynthia / package 19 | untouched |
| Prospect 3163 / package 23 | untouched |
| Billing, queue, send-guard semantics | unchanged |

## The next human action

**None.** Wait for the 04:00 UTC wake tomorrow and re-run this verification.

---

# Re-verified 2026-08-13 09:58 UTC

Six hours after the wake, and five hours after the fix went out. Read-only. The
conclusion is unchanged, and every number above still holds.

## Nothing drifted

| | At 04:17 | At 09:58 |
|---|---|---|
| `daily-wake` outcome | `partial` | **`partial`** — unchanged, no second run |
| `last_completed_at` | null | **null** |
| Packages armed | 0 | **0** |
| Follow-up `SEND_APPROVED` jobs | 0 | **0** |
| `auto-followup-queued` events | 0 | **0** |
| `send_events` total | 10 | **10** |
| Package 23 `updated_at` | `2026-08-13T01:00:38.133Z` | **same** |
| `site_intel_at` for 3163 | — | `2026-08-12T21:46:26.239Z`, not refreshed |
| Both switches | false / false | **false / false** |

Package 23 re-read in full: v3, `READY_FOR_APPROVAL`, `priority_band` P2,
`allowed_length` 2, Email 1 present at 523 bytes, `followups` holding **exactly
one entry at `step: 2`** — *"booking form steps, still open"* — and no Email 3.
`sequence_approved` 0, `sequence_max_step` null, `auto_followup_approved` 0,
`approved_fingerprint` null, `reviewed_at` null. Prospect 3163: contact
`brianda@aztherapyquest.com`, `unsubscribed` 0, `replied` 0, stage `New`, and
0 send / reply / relationship events. Exactly one live package.

## One counter worth explaining rather than glossing

A whole-table count of `send-approved` jobs returns **1**, not 0. It is not a
follow-up:

```
job 118 · workspace ary · prospect 6546 · created 2026-08-09 17:50
payload: { "sent": true, "messageId": "…", "step": 1, "terminal": true }
```

`step: 1` — a first email from four days ago. **Follow-up (step 2) send jobs,
ever: still zero.**

## Why the fix has not been tested yet

The deployment order is the whole story, and it is worth stating plainly:

| Time (UTC) | Event |
|---|---|
| ~01:58 | `b9a3ee2` / Pages `12d1ceb1` — heartbeat hardening live |
| **04:00:26** | **the natural wake fires on `b9a3ee2`** → `partial` |
| ~04:58 | `ac3c1bd` / Pages `229cf5ed` — the missing import, live |
| ~04:58 | `5fd234e` / Pages `1eb3cb51` — its report, identical code |
| 09:58 | this re-verification |

**The fix landed roughly an hour after the wake it repairs.** Confirmed present
in the deployed source: `git show 5fd234e:app/api/cron/drain/route.js` carries
`import { needsRenewal } from '@/lib/gmail-store.mjs';` at line 12 and the call
at line 339.

So the corrected code exists in production and has simply not been reached by
the schedule yet.

The five-minute drain is healthy meanwhile — `cron-drain` invoked `09:55:25`,
completed `09:55:26`.

> **Next required acceptance: 2026-08-14 04:00 UTC**, on `5fd234e` / Pages
> `1eb3cb51`.

## Release decision, restated

> **Package 23 remains unreleased.**

Ten of the eleven release conditions pass. The failing one is
`last_outcome = completed`, and no amount of re-reading changes a recorded
outcome. Nothing was forced to make it green.

**This re-verification wrote nothing.** No sweep, no cron, no queue row, no
approval, no grant, no credit, no email, and no deploy — deliberately not even
a docs push, because the acceptance is waiting on a scheduled run against a
stable deployment.
