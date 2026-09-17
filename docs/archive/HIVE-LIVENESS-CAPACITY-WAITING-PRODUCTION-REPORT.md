# Waiting your turn is not the same as being dead

**Date:** 2026-08-11
**Status:** complete, proven in production, free
**Commits:** `56ee9cd` (the rule), `7db6076` (the health page), `a917149` (the second clock)
**Migration:** `051_scanner_run_scheduler_seen.sql`, applied to production D1
**Tests:** 1,301 passing
**Credits spent proving all of it: 0**

---

## Root cause

`heartbeat_at` is written in exactly three places: the INSERT at start,
`stopRun`, and `syncRunCounters` after an item settles.

So **the only thing that counted as being alive was a site check finishing.**

A run that is perfectly healthy but cannot start its next check, because both
scanner slots are busy, finishes nothing. Its heartbeat freezes. The
abandonment rule's only test was heartbeat age. Fifteen minutes of patience and
fifteen minutes of being dead were, in the data, the same thing.

That is why the previous pass's concurrency test closed a run that had done
nothing wrong: it was held at zero headroom for fifteen minutes on purpose, and
the reconciler did the only thing it could with the information it had.

## The current liveness model, before this change

| question | where it was answered |
|---|---|
| when did this run last make progress | `heartbeat_at`, moved only by `syncRunCounters` |
| how long is too long | `HEARTBEAT_STALE_MINUTES = 15` |
| what closes a run | `reconcileStaleScannerRuns`, a conditional UPDATE on state + heartbeat age |
| how much scanner work is in flight | `inFlightCount(db, KIND.SCANNER_ITEM)` |
| what does the queue know about waiting | `jobs.status = 'waiting'`, `error_kind = 'budget'` |

Nothing joined the last two to the first. The reconciler could not see that a
run's silence had a reason.

## Derived waiting, and the one thing that needed schema

"No progress" is a symptom. The causes were already written down:

| cause | mode | abandonable |
|---|---|---|
| STOPPING with something still landing | `STOP_SETTLING` | no |
| jobs parked by the queue's budget rule | `WAITING_BUDGET` | no |
| every scanner slot taken | `WAITING_CAPACITY` | no |
| its own work in a worker's hands | `ACTIVE` | no |
| already over | `TERMINAL` | no |
| none of the above, quiet past the threshold | `STALE` | **yes** |

`lib/scanner-liveness.mjs` is a pure function over counts the caller already
has. **No new run states were added** — these are derived, not stored.

### Why one column was needed after all

The first attempt (`56ee9cd`) added no schema, on the reasoning that a fresh
claim is itself proof the scheduler is alive: `inFlightCount` ignores claims
older than the expiry, so "capacity is full" cannot be true unless somebody
claimed a slot in the last fifteen minutes. If the machine stops, claims age
out, capacity frees, and a waiting run becomes closeable on its own. Waiting can
never outlive the thing doing the waiting.

That reasoning is sound and it is still the load-bearing safety property. But it
was only half the problem, and **production found the other half within an
hour**: sparing a waiting run is not enough, because *its silence keeps
accumulating the whole time it waits*. The instant capacity freed, run 7's
protection lifted and the very next reconcile saw seventy minutes of quiet with
work to do and a checker free, and closed it — one step before the lane would
have handed it work. It was killed for silence it built up while it was
protected.

So a run carries a second clock, `last_scheduler_seen_at`, written only when the
drain has just proved the run is waiting on something real. Staleness reads the
later of the two:

```sql
MAX(datetime(COALESCE(heartbeat_at, started_at)),
    datetime(COALESCE(last_scheduler_seen_at, '1970-01-01 00:00:00')))
```

**Kept separate from `heartbeat_at` rather than overloading it**, exactly as the
brief required: "a check finished" and "the server parked this" stay different
facts, so a dead run is still unmistakably dead. A test asserts that parking a
run never writes `heartbeat_at`.

**It cannot keep a dead run alive.** Nothing stamps the new clock if the machine
is down, so the clock stops and abandonment works as before. Tested directly: a
run with a ninety-minute-old parking stamp is still closed.

## Capacity waiting rule

A run is `WAITING_CAPACITY` when it has unfinished items, none of its own in
flight, no budget-parked jobs, and `globalInFlight >= SCANNER_CONCURRENCY`.

## Budget waiting rule

`WAITING_BUDGET` when the run has jobs the queue itself parked
(`status = 'waiting' AND error_kind = 'budget'`). Read back, never re-derived —
budget is the queue's decision and it already wrote it down. Budget outranks
capacity, being the more specific reason.

## Stopping

Unchanged. `STOPPING` with work in flight is `STOP_SETTLING`; with nothing in
flight it is still `STOP_SETTLING`, because `settleIfFinished` is about to close
it and abandoning it in that window would say the wrong thing on the page.
Neither is abandonable. A genuinely orphaned STOPPING still becomes abandonable
once its claims expire and capacity frees.

## True abandonment

Unchanged in spirit and still enforced inside the WHERE clause, so a run that
reports in between the read and the write keeps its life. It now excludes runs
proved to be waiting, and measures silence from the later clock. Terminal states
are never reconsidered.

## Shared global headroom

`scannerInFlight` is exported from `lib/scanner-items.mjs` and is the same
`inFlightCount(db, KIND.SCANNER_ITEM)` the lane uses. One definition, asserted by
test — two counts with slightly different filters would mean the reconciler
closing runs the lane believes are waiting, which is the whole bug.

`SCANNER_CONCURRENCY` stays **2**. No second concurrency constant, no second
stale timeout; the liveness module imports both.

## Timestamp normalisation

Every liveness comparison wraps both sides in `datetime()`. A test walks
`scanner-run.mjs`, `scanner-items.mjs`, `queue.mjs` and the drain route and fails
if a raw `heartbeat_at`/`claimed_at` comparison is ever added back.

## System health and the Hive

- Health reports a capacity wait as *"Waiting for a site checker. This run is
  ready to carry on. LTB will continue automatically when a checker is free."*
  with `attention: false`. Waiting is never an incident, however long it waits.
- The Hive shows the same wording during a run. **No force-run button** — there
  is no queue to jump.
- A test asserts no healthy mode may use the words "unexpectedly", "failed",
  "error", "stuck", "problem" or "abandoned".
- React implements no staleness rule of its own; it reads what the server
  decided.
- Health remains read-only, asserted.

### A second bug this exposed

The rule was right and the page still said "stopped unexpectedly". The Hive
query selected a run row **without its `workspace` column**, so `livenessOf`
bound `undefined`, D1 threw, and the route's own `.catch(() => null)` turned the
throw straight back into the old wording. A silent catch made a bug look exactly
like the behaviour it replaced.

Every unit test passed throughout — they call `livenessOf` with a complete row,
which is precisely what the route was not doing. Only looking at production
while a run sat in the state found it. Fixed at both ends (`7db6076`): the column
is selected *and* passed explicitly, and `livenessOf` now says what is missing
rather than guessing.

## Credits

Waiting does nothing, so it costs nothing. A test slices the liveness gathering
and fails if it ever contains `spendCredits`, `refundCredits`,
`recordAutoSpend`, `enqueue(`, `INSERT INTO` or an `UPDATE`.

Proven in production: **credit_events was 171 before the first case and 171
after the last**. Balance unchanged at 498,180. `auto_spend` for the day: 0.

## Tests

**1,301 passing**, up from 1,264. 39 in `tests/scanner-liveness.test.mjs`
covering: capacity waiting at 15/30/60/240 minutes; the reconciler sparing it;
two workspaces; workspace-scoped reconcile still seeing global capacity; budget
waiting and its precedence; a genuinely dead run still closed; waiting not
outliving the waiter; terminal states never reconsidered; STOPPING; the words
never borrowing failure vocabulary; both clocks staying separate facts; only
proved-waiting runs being stamped; an old stamp granting no immortality; Start
joining a parked run instead of closing it; and the workspace-column regression.

## Production acceptance — free, three cases

Build verified from the server's own `build.commit`, never the dashboard.

### Case A — a healthy capacity wait

Run 8, six items, both scanner slots occupied by another run's claims in the
real ISO format, heartbeat backdated to 50 minutes and `last_scheduler_seen_at`
cleared to NULL: the exact state that killed run 7.

| time | state | parked | queued | settled | credit events |
|---|---|---|---|---|---|
| 02:17:28 | RUNNING | no | 6 | 0 | 171 |
| 02:20:44 | RUNNING | **yes** | 6 | 0 | 171 |
| 02:30:30 | RUNNING | yes | 6 | 0 | 171 |

Held across ~12 minutes of real drain cycles. At the end:

```
state:                  RUNNING
heartbeat_at:           2026-08-11 01:27:05    (64 minutes old, untouched)
last_scheduler_seen_at: 2026-08-11 02:30:30    (stamped by the drain)
```

An earlier identical case (run 7, before the second clock) survived **70
minutes** of the same conditions and reported
`liveness.mode = WAITING_CAPACITY`, with health showing the waiting wording and
`attention: false`.

### Case B — capacity frees

Slots deleted at 02:30:41 with the heartbeat still an hour stale and nothing
reset by hand.

```
02:31:14  RUNNING,   6 queued, 0 settled, 171 credit events
02:35:38  COMPLETED, 0 queued, 6 settled, 171 credit events
```

**Resumed and finished on its own.** This is the step that failed before the
second clock: run 7, in the same position, was abandoned within one drain.

### Case C — a genuinely dead run

Run 9: 90 minutes quiet, capacity free, no budget wait, no parking stamp, three
items outstanding. Nothing legitimate explained the silence.

```
02:36:40  RUNNING
02:41:03  ABANDONED, "No progress for over 15 minutes.", 3 items cancelled
```

Dead-run recovery still works. The fix did not go too far.

### Final state

| run | state | meaning |
|---|---|---|
| 7 | ABANDONED | the bug, before the second clock — kept as the record of it |
| 8 | COMPLETED | waited an hour, then resumed and finished by itself |
| 9 | ABANDONED | genuinely dead, correctly closed |

No fabricated hold jobs remain in the queue.

## Safety

- **Scanner concurrency = 2**, unchanged.
- No paid run started. **Zero credits spent**: 171 credit events before and
  after, balance 498,180 either side, `auto_spend` today 0.
- No email sent. Zero send-related jobs created at any point.
- Gmail, sending, approval, sequence, send caps, send windows and the general
  queue lane all untouched.
- `AUTO_SEND_FIRST = OFF`
- `AUTO_SEND_FOLLOWUPS = OFF`

## Remaining genuine Hive correctness issue

One, recorded rather than hidden: **multi-workspace fairness in the scanner lane
is still not implemented.** The general lane round-robins across workspaces; the
scanner lane claims globally in priority order. Liveness now handles the
*symptom* correctly — a starved workspace's run is `WAITING_CAPACITY` and is
never abandoned for it, tested both ways round — but with two workspaces
scanning heavily, one could wait a long time in queue order rather than getting
a fair share. With one workspace scanning this changes nothing today.

That is the next thing worth fixing in this area, and it is a scheduling change
rather than a correctness one.
