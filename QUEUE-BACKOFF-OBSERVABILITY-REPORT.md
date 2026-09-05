# A job waiting for its retry is not a stuck job

Date: 2026-08-12 · commit `6c9017c` · tests 1,967 passing

Job 522 was reported as a stuck queue. It was retrying on schedule the whole
time. The queue behaved correctly; the reporting could not tell the two apart.
This changes only the reporting.

**Spend: 0 credits. No queue semantics changed.**

---

## Part 1 — the state model as it stands

The `jobs` table, and who writes each field:

| Field | Written by | Meaning |
|---|---|---|
| `status` | `claimNext`, `finish`, `retry` | `queued`, `running`, `waiting`, `done`, `failed`, `cancelled` |
| `attempts` | `claimNext`, incremented on every claim | attempts started, not attempts failed |
| `max_attempts` | `enqueue`, default 3 | the ceiling |
| `run_after` | the retry path | when the next attempt becomes eligible |
| `claimed_at` | `claimNext` | when the current attempt started |
| `last_error`, `error_kind` | the retry and fail paths | why the last attempt stopped |
| `created_at`, `updated_at` | insert and every transition | |

The engine's own constants, not invented here:

- `CLAIM_TTL_MINUTES = 15` — past this, `claimNext` reclaims a running job
- `backoffMinutes = min(60, 5 ** (attempt - 1))` — 1, then 5, then 25
- cron `*/5 * * * *` — the drain wakes every five minutes
- `MAX_JOBS_PER_RUN = 12`, `MAX_PER_WORKSPACE = 5` — one tick drains at most
  five jobs for one workspace

Eligibility, from `claimNext`:

```sql
(status = 'queued' OR (status = 'running' AND datetime(claimed_at) < datetime(?)))
AND (run_after IS NULL OR run_after <= ?)
```

And the surface an operator reads, from `/api/system-health`:

```sql
SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) queued
```

> **A healthy job in backoff was indistinguishable from a stuck job in the
> system-health queue panel, because both were counted as `queued`, even though
> `run_after` proves the retry is already scheduled.**

The column that holds the answer was never read by anything an operator sees.

## Part 2 — job 522, reconstructed from the preserved row

Nothing was mutated. The row still reads:

```json
{ "id": 522, "kind": "prepare-outreach", "status": "done",
  "attempts": 3, "max_attempts": 3,
  "run_after": "2026-08-12T05:25:36.455Z",
  "claimed_at": "2026-08-12T05:35:26.948Z",
  "created_at": "2026-08-12 05:13:04",
  "updated_at": "2026-08-12 05:35:35",
  "last_error": null }
```

| Time (UTC) | What happened |
|---|---|
| 05:13:04 | enqueued |
| ~05:15 | attempt 1 — `parseFollowUp is not defined` |
| 05:20:36 | attempt 2, same error. Retry written for **05:25:36** |
| ~05:27 | the fix went live |
| **05:29:58** | I looked: `queued`. Called it stuck |
| **05:31:53** | I looked again: `queued`. Reported it as a defect |
| 05:35:26 | claimed, attempt 3 |
| 05:35:35 | done, package 16 written |

The backoff after a second attempt is five minutes and the cron ticks every
five, so due-at-05:25:36 meant the 05:25 tick was too early and the next real
chance was 05:30 or 05:35. Both of my observations fell inside that gap, and the
only word on screen was `queued`.

`last_error` is now null because the successful attempt cleared it. The two
failure messages are not preserved on the row — that is the only thing missing
from this reconstruction, and it is stated rather than filled in.

## Part 3 — the derived states

One module, `lib/queue-state.mjs`, read by the API. Storage semantics are
untouched; these are labels derived from the same columns the runner writes.

| State | Predicate | Shown as |
|---|---|---|
| `READY` | queued, `run_after` null or passed | Ready to run |
| `RUNNING` | running, claimed within the lease | Running |
| `WAITING_FOR_RETRY` | queued, `attempts > 0`, `run_after` in the future | **Waiting for retry** |
| `WAITING_ON_BUDGET` | waiting, `error_kind = budget` | Waiting for budget |
| `WAITING_ON_HUMAN` | waiting, `error_kind = human` | Waiting on a person |
| `TERMINAL_FAILED` | failed | Failed — no retries remaining |
| `DELAYED` | queued, eligible, waiting past the cadence | Delayed |
| `POSSIBLY_STUCK` | running past the lease | Possibly stuck |
| `COMPLETE` / `CANCELLED` | done / cancelled | Completed / Cancelled |

## Part 4 — retry timing is not recomputed

`nextAttemptAt` is the stored `run_after`, passed through verbatim in UTC. The
backoff calculator is not reimplemented anywhere near the UI: a second opinion
about when a job runs would eventually disagree with the runner, and the runner
is the one that actually runs it.

History is preserved. Nothing rewrites a past attempt.

## Part 5 — the thresholds, and why those numbers

**Running past the lease → `POSSIBLY_STUCK`, at 15 minutes.** Not chosen: it is
`CLAIM_TTL_MINUTES`, the queue's own reclaim window. Past it, `claimNext` will
hand the job to another worker, and the health page already counted such a row
as stuck. Anything else would be the screen disagreeing with the engine.

**Eligible and still waiting → `DELAYED`, at 30 minutes.** Derived from the real
cadence: the cron fires every five minutes and takes at most five jobs per
workspace, so a backlog drains in five-job steps. Thirty minutes is six ticks —
up to thirty jobs of head start. Normal on a busy queue, clearly abnormal on a
quiet one.

It is reported as **delayed, not stuck**. A queue behind on work is not a broken
queue, and calling it broken is the mistake this whole task exists to stop.

## Part 6 — API

`/api/system-health` now splits the counter that was hiding the difference:

```
queued        -> readyNow + waitingRetry
```

and returns a `retrying` list, each entry carrying `state`, `label`, `detail`,
`nextAttemptAt` (UTC), `attempt`, `maxAttempts`, `eligibleNow`, `possiblyStuck`.

**No payload and no error text is exposed.** A `last_error` can carry a key —
one real failure message in this system contains an environment variable name —
so the derived state deliberately carries neither, and a test asserts it.

## Part 7 — UI

The queue panel in `components/SystemHealth.jsx` counted "queued". It now counts
**ready to run** and **waiting for a retry** separately, and below them lists
each waiting job:

```
Waiting for a retry. Nothing is wrong and nothing needs doing.
  prepare-outreach — next attempt at 05:35 (attempt 2 of 3 so far)
```

Neutral styling, in a plain bordered block rather than the section headed by the
word attention. A scheduled retry is not an error and must not look like one.

Times are returned as UTC and rendered with `toLocaleTimeString`, so the
operator sees their own clock. No timezone is hardcoded anywhere in the state
logic, and a test runs the predicates under UTC, Los Angeles and Manila to prove
the state does not move.

## Part 8 — tests

`tests/queue-state.test.mjs`, 18 behavioural tests against the real function
with time frozen at `2026-08-12T06:00:00Z`:

- each of the six states from a real row shape
- the exact boundary: `run_after` one minute out is waiting, at zero is ready
- attempts below the ceiling stay waiting; exhausted becomes terminal
- a claim past the lease is possibly stuck; inside it is running
- a ready job at 6, 10, 20 and 29 minutes is **not** called stuck
- at 35 minutes it is called delayed, not stuck
- **job 522's preserved row, replayed at the exact instants I looked at it** —
  waiting for retry at 05:20:40, 05:22, 05:25, then ready at 05:29:58 and
  05:31:53, and never `possiblyStuck` at any of them
- `nextAttemptAt` returns an odd stored timestamp unchanged
- both stored timestamp shapes parse
- the same job in three timezones gives the same state
- malformed and missing timestamps fail safely rather than throwing
- neither payload nor error text appears in the derived state
- counts group a mixed queue correctly

Suite: **1,967 passing**, up from 1,949. `next build` clean.

## Part 9 — the live queue audit

Read-only, over the 200 most recent jobs, using the new classifier:

| State | Count |
|---|---|
| COMPLETE | 186 |
| TERMINAL_FAILED | 9 |
| CANCELLED | 4 |
| WAITING_ON_HUMAN | 1 |
| READY | 0 |
| RUNNING | 0 |
| WAITING_FOR_RETRY | 0 |
| DELAYED | 0 |
| **POSSIBLY_STUCK** | **0** |

**No job is genuinely stuck, and none is delayed.** Nothing was retried,
repaired or deleted.

## Part 10 — production acceptance

Deployed to Pages, commit `6c9017c`. Cloud Run was not touched; nothing in the
renderer changed.

| Fixture | Result |
|---|---|
| Completed job | 186 of them, classified COMPLETE |
| Terminal failed | 9, classified TERMINAL_FAILED |
| Waiting on a person | 1, classified WAITING_ON_HUMAN |
| Job 522 in backoff | replayed from its preserved row at the exact instants it was misread |
| `/api/system-health` unauthenticated | 401, unchanged |

**One honest gap.** There is no job currently in backoff, so the new "Waiting for
retry" block has not been seen rendering against live data. Creating one would
mean enqueuing work purely for display, which the brief rules out and which I am
not going to do to a production queue. The classifier is proved against job
522's real row and against all 200 live rows; the render path is proved by the
build. If a retry happens naturally, the panel will show it.

## Safety

| | |
|---|---|
| Queue semantics changed | **none** — no retry, backoff, cadence, ordering or execution change |
| Jobs retried, repaired or deleted | 0 |
| Emails sent | 0 |
| `send_events` | unchanged |
| Package 19 | untouched |
| Cynthia | not mutated, refreshed, approved or sent |
| Packages created or approved | 0 |
| Prospect refreshes | 0 |
| Credits | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

## Remaining backlog

1. `select[name*=date i]` remains a weak calendar signal beyond the birthday filter
2. failure messages are cleared from `last_error` on eventual success, so a
   job's earlier errors are not recoverable from the row afterwards
