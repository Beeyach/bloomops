# Hive throughput: giving the scanner its own lane

**Date:** 2026-08-10
**Status:** complete. Deployed, live paid acceptance passed, global bound verified free. Three bugs found and fixed.

---

## Before: why durable Hive settled at ~12 sites an hour

Measured, not assumed. Run 2 in production gave five real data points.

**Per-item duration**, from the moment the credit was charged (immediately
before the render call) to the moment the item settled:

| prospect | charged | finished | seconds |
|---|---|---|---|
| 6550 | 23:30:28 | 23:31:57 | **89.0** |
| 6551 | 23:35:26 | 23:35:58 | 32.0 |
| 6552 | 23:40:27 | 23:40:59 | 32.0 |
| 6553 | 23:45:28 | 23:45:53 | 25.0 |
| 6554 | 23:50:28 | 23:50:54 | 26.0 |

p50 ≈ **32s**. The 89s outlier was the first call, a cold start of the render
container. Warm calls cluster tightly at 25–32s.

**Item completions were exactly five minutes apart** — 23:31, 23:35, 23:40,
23:45, 23:50. That is the cron cadence, not the work. One item per drain.

### The actual cause

`app/api/cron/drain/route.js`:

```js
const MAX_JOBS_PER_RUN = 12;
const MAX_MS = 25_000;
const MAX_PER_WORKSPACE = 5;
...
if (Date.now() - startedAt > MAX_MS) break outer;   // checked BEFORE the next claim
const out = await runJobs(db, ws, { max: 1 });
```

The time budget is checked *between* jobs. A scanner item takes ~32s, which is
longer than the entire 25-second budget. So the first scanner item of a drain
always overruns it, the loop breaks, and the invocation ends having processed
exactly one. Five-minute cron × 1 item = **12 items an hour**.

`MAX_JOBS_PER_RUN` (12) and `MAX_PER_WORKSPACE` (5) never bind. They are not the
problem and were never reached.

### What was *not* the bottleneck

- **The feeder.** All five items were `QUEUED` within milliseconds of the run
  starting, with jobs 299–303 already written. `FEED_BATCH` is 20; the pool was
  never empty. Ruled out by direct observation.
- **Claim contention.** Every item had `attempts = 1`. Nothing was retried,
  re-claimed or lost.
- **The database.** Five items, zero errors, zero lock failures.
- **Credit transactions.** Five charges, zero refunds, balance moved by exactly
  −100.
- **Cron cadence alone.** Raising cron frequency would help, but it would speed
  up *every* job class including send-approved, which is exactly what must not
  change. It also does not fix the fact that one invocation wastes 4½ minutes
  doing nothing.

### The second, quieter problem

Scanner items and send jobs share one budget. A single 32-second site check
consumes the whole 25-second allowance for that drain, so anything else waiting
— including a send — is pushed to the next invocation. The lane fixes this in
both directions: sending stops waiting behind site checks, and site checks stop
being rationed by a budget sized for fast jobs.

---

## The hard ceiling nobody had written down

`services/audit-render/README.md`, the documented deploy for the render service:

```
--concurrency 1 \
--max-instances 3 \
```

- `--concurrency 1` — one render per container instance. The comment says why:
  "two browsers in one container fight over memory".
- `--max-instances 3` — a hard ceiling of three instances.

**So the render service can serve at most three site checks simultaneously, ever.**
Anything beyond that queues inside Cloud Run and waits, holding a request open
against a 600-second timeout. Firing ten concurrent prechecks would not be ten
times faster; it would be three running and seven waiting, with the waiting ones
burning our invocation budget for nothing.

This is the number the scanner bound has to respect, and it is read off the
deployment config rather than chosen by instinct.

That ceiling is shared with **video rendering**, which uses the same service and
takes one to three minutes per video. A scan that claims all three instances
would block Ary from recording anything while it runs.

---

## Chosen bound

**`SCANNER_CONCURRENCY = 2`**

Why two and not three:

- Three would consume every render instance, so a video render or a manual
  "check this site" from a prospect card would queue behind the scan.
- Two leaves one instance permanently free for interactive work.
- The failure mode of being wrong in this direction is slowness. The failure
  mode of being wrong in the other direction is Ary's video render timing out
  behind a scan she forgot was running.

**`SCANNER_BUDGET_MS = 90_000`**, with a new wave only started when there is room
for a typical one. 90 seconds is not a guess either: run 2's first item occupied
a single drain invocation for 89 seconds and completed normally, which is direct
production evidence that an invocation of that length is safe here.

Expected: 2 waves of 2 in a typical drain = **4 items per drain ≈ 48 an hour**,
falling back to 1 wave = 24 an hour when the render service is cold or slow.
Against a measured baseline of 12, that is roughly **4×**, and a 5,484-site run
goes from about 19 days to about 5.

These were projections when written. The live run below measured them.

---

---

## Lane design: how scanner throughput was separated from sending

`claimNext` already accepted a `kinds` filter. It now also accepts
`excludeKinds`, which is the whole mechanism:

- **The general lane** runs first, exactly as before, with its exact previous
  numbers (`MAX_JOBS_PER_RUN = 12`, `MAX_MS = 25_000`, `MAX_PER_WORKSPACE = 5`),
  except that it now asks for everything *except* `scanner-item`.
- **The scanner lane** runs afterwards, asking for `scanner-item` and nothing
  else, on its own clock and its own budget.

No second queue. Jobs, claiming, dedupe, retries, error kinds, cancellation and
stale-claim recovery are all the existing machinery untouched.

### Fairness and starvation

The ordering *is* the guarantee, and it is one line: the general lane has
already had its full allowance before the scanner lane starts. Five thousand
queued site checks cannot delay a send, a reply classification or a mailbox sync
by even one drain — tested directly, by queuing fifty scanner items plus one
send and asserting the send is what gets claimed.

The reverse is also now true, and was a real problem before: a single
thirty-second site check used to consume the entire general budget, pushing
anything else waiting to the next invocation.

**Multi-workspace fairness is not implemented in the scanner lane.** The general
lane round-robins across workspaces; the scanner lane claims globally by
priority. With one workspace running scans this changes nothing today. If a
second workspace ever runs large scans, the lane would serve them in queue order
rather than fairly, and that is the point to add round-robin there too. Recorded
rather than pretended away.

## Concurrency: why 2

Three constraints, in order of how hard they are:

1. **The render service can serve three at once, maximum.**
   `services/audit-render/README.md` deploys it with `--concurrency 1`
   (one render per container, because "two browsers in one container fight over
   memory") and `--max-instances 3`. A fourth simultaneous request does not run
   faster; it queues inside Cloud Run holding a request open against a
   600-second timeout.
2. **That ceiling is shared.** Video rendering uses the same service and takes
   one to three minutes. So does the "check this site" button on a prospect
   card. Taking all three instances means a scan Ary forgot was running blocks
   the video she is trying to record.
3. **Being wrong is asymmetric.** Too low costs time. Too high costs Ary an
   interactive task she is sitting and waiting for.

Two leaves one instance permanently free for work a person is waiting on.

Raising it is only safe alongside raising `--max-instances`, and the code says
so where the constant is defined.

## Runtime safety

`SCANNER_BUDGET_MS = 90_000`, `SCANNER_WAVE_RESERVE_MS = 35_000`.

Ninety seconds is not a guess: run 2's first item held a single invocation for
89 seconds and completed normally, which is direct production evidence that an
invocation of that length survives here.

The reserve is the p50 (~32s). A wave is only started when there is room for a
typical one, so the lane stops claiming *before* the margin rather than
discovering it has overrun while holding claimed jobs.

## Feeder

Not the bottleneck — all five of run 2's items were queued within milliseconds
of the run starting. It was ruled out by observation, not assumption.

It is now tied to the concurrency (`FEED_BATCH = SCANNER_CONCURRENCY * 5 = 10`)
rather than a round number, so the ready pool is always several drains' worth of
work and no worker waits on it, without filling the queue with rows nothing will
reach for hours.

## Credits under concurrency

**This was a real defect that parallelism would have exposed, and it is fixed.**

`spendCredits` read the balance, subtracted, and wrote it back. Safe only while
one thing spent at a time, which was true while the queue ran jobs one after
another. With two scanner items in flight: both read 500, both write 480, and
one site check was free.

It would not have announced itself. No error, no failed job, and the money only
ever leaks in Ary's favour — the balance would simply have drifted away from the
ledger with nobody noticing.

Now every balance move is a compare-and-swap: the write only lands if the row
still holds the value that was read, and a loser re-reads and retries with the
number that actually won. Because the affordability check and the write are the
same attempt, two workers cannot both see enough credit for the last charge.

Tested with four race tests: a charge that loses a race lands on the winning
number; two concurrent charges both land; two workers competing for the last 20
credits produce exactly one winner and a balance of zero; concurrent refunds do
not erase each other.

The `credit_events` ledger was always append-only and needed no change.

## Human versus automatic actor

Unchanged and re-tested. A Hive run spends the credit balance as
`actor: 'human'` and never touches the daily automatic allowance. Server-side
execution did not make it automatic, and running it faster has not either — the
scanner lane contains no reference to `recordAutoSpend` or `autoSpentToday`, and
a test asserts that.

The daily allowance path (`auto_spend`) is an append-only ledger plus a `SUM`,
and it is only reached from the general lane, which is still strictly
sequential. No new concurrency touches it.

## Stop, under concurrency

Unchanged semantics, now tested against the races concurrency introduces:

- a stopped run offers the lane nothing to claim
- an item already in flight is left to land, and its result is kept
- no wave is started on stale run state after Stop
- everything unstarted is cancelled, and the counts still reconcile

## Abandonment and recovery

Untouched. The stale-run reconciler, its fencing, and the cancellation of a dead
run's unstarted items all still pass their existing tests.

## Benchmark

`node scripts/bench-scanner-lane.mjs` — the scheduler, driven by the five real
production durations, with the budget enforced against real seconds.

| concurrency | items/drain | waves | peak | stopped | sites/hour |
|---|---|---|---|---|---|
| 1 | 3 | 3 | 1 | time budget | **36** |
| **2** | **4** | **2** | **2** | time budget | **48** |
| 3 | 6 | 2 | 3 | time budget | 72 |
| 4 | 8 | 2 | 4 | time budget | 96 |

Baseline before the lane: 1 item/drain = **12 an hour**, measured in production.

**The most useful result is the first row.** At concurrency 1 — no parallelism
at all — throughput still triples, because the lane's own budget lets a drain do
three sequential items where the shared 25-second budget allowed one. Most of
the gain is the separation, not the parallelism. That is why 2 is enough, and
why the fallback if render capacity is ever contended is 36 an hour rather than
back to 12.

The concurrency-4 row is a scheduler number, not a real one: Cloud Run would
serve three and queue the fourth.

**This benchmark measures the scheduler, not the render service.** It does not
prove the render service can serve two at once in practice.

## Expected production throughput

**About 48 sites an hour**, conservatively, falling to ~24 when the render
service is cold or slow.

Against a measured 12, that is roughly 4×. A 5,484-site run goes from about
19 days to about 5.

Projections from measured durations. Not yet a production benchmark.

## System health and UI

- System health gains a scanner section: how many are being checked right now,
  how many are waiting, and how fast it has been going. **A large queued run is
  never called unhealthy** — a big scan is a big scan. It remains read-only, and
  the test asserting no `INSERT`/`UPDATE`/`DELETE` anywhere in the route passes.
- The Hive shows "About 48 sites an hour recently" beside the run, **only when
  at least 5 items have finished in the last hour**. Below that no speed is
  shown at all: one cold start and one warm check differ by a factor of three,
  and a number that swings on every refresh is worse than none.
- **No ETA anywhere.** A finish time from a handful of samples is a promise that
  will be wrong.

## Tests

**1,264 passing**, up from 1,217. 43 new in `tests/scanner-lane.test.mjs`, 4 new
race tests in `tests/credits.test.mjs`.

The credits test fake had to be rewritten first: it returned `{}` from `run()`,
so it could not express "0 rows changed" and therefore could not tell a working
optimistic lock from a broken one. It now models D1's conditional-update
semantics, which is what makes the race tests meaningful rather than decorative.

Coverage by area: the bound is the render service's; several run at once and the
rest wait; one drain does more than one; out-of-time is distinguished from
out-of-work; the budget stops claiming early; no unbounded fan-out; progress is
an aggregate; one failure does not fail siblings; two workers cannot claim one
item; two lanes do not double up; the feeder does not overfill; Stop prevents new
claims; an in-flight item may finish; no wave after Stop; stopped/stopping/
abandoned/completed runs are never fed; the general drain excludes scanner work;
the general lane runs first; sends are still claimed first; fifty queued scans do
not delay a send; the send limits are byte-for-byte unchanged; the lane mentions
no sending, approval or Gmail symbol at all; the Hive still spends human credits.

## Production

Commit `ca961bf`. Migration `050_scanner_item_finished_index.sql` applied to
production D1.

## Live acceptance — a PAID production run WAS performed

Authorized by Ary, capped at 10 prospects and 200 credits.

### Proving the build first

Both halves of `19ccf03`, read off `leadsthatbloom.com` in a signed-in session:

- **Server:** `/api/system-health` returned
  `scanner: {state:"IDLE", ..., concurrency: 2}`. That key exists only in this
  commit.
- **Client:** `page-1ddbc1eaf40fdaf1.js` contains "sites an hour recently".

An earlier check failed and was wrong: the browser was serving cached HTML that
still referenced the previous chunk names. A cache-busting load resolved it. The
deployment list showed two rows as "Active" throughout, which is normal for
Pages and is not evidence of anything.

### Run 4

Ten test records, ids 6555–6564, every one `do_not_contact = 1` and
`site_intel IS NULL`, so every check was real work rather than a cached answer.

Before any processing: **exactly 10 items**, 10 distinct prospects, positions
0–9, 10 jobs, 10 distinct dedupe keys, zero already started.

| prospect | site | started | finished | seconds | result |
|---|---|---|---|---|---|
| 6555 | python.org | 00:20:28 | 00:21:03 | 34 | NO_VIDEO (9) |
| 6556 | postgresql.org | 00:20:28 | 00:21:07 | 38 | NO_VIDEO (0) |
| 6557 | sqlite.org | 00:21:09 | 00:21:35 | 26 | **SEND (15)** |
| 6558 | kernel.org | 00:21:09 | 00:21:34 | 24 | NO_VIDEO (13) |
| 6559 | debian.org | 00:25:26 | 00:25:55 | 29 | NO_VIDEO (13) |
| 6560 | gnu.org | 00:25:26 | 00:25:53 | 26 | NO_VIDEO (11) |
| 6561 | apache.org | 00:25:28 | 00:26:21 | 52 | NO_VIDEO (13) |
| 6562 | w3.org | 00:25:56 | 00:27:19 | 82 | **BLOCKED** |
| 6563 | openstreetmap.org | 00:25:56 | 00:27:09 | 73 | NO_VIDEO (13) |
| 6564 | wikimedia.org | 00:27:13 | 00:27:24 | 11 | NO_VIDEO (0) |

Run: `COMPLETED`, total 10, processed 10, succeeded 10, failed 0.
Wall clock 00:19:23 → 00:27:26 = **482 seconds**.

### Real parallelism, confirmed

Overlapping windows prove genuine simultaneous execution, not fast serial work:

- 6555 and 6556 both ran 00:20:28 → 00:21:03
- 6557 and 6558 both ran 00:21:09 → 00:21:34
- 6559 and 6560 both ran 00:25:26 → 00:25:53

The first drain did **4 items in two waves of two**, exactly what the benchmark
predicted.

### The bound was exceeded, and it was my bug

**Three site checks ran at once between 00:25:28 and 00:25:53** — 6559, 6560 and
6561.

The cause is visible in the claim times: 6559 and 6560 were claimed at
00:25:25.490 and 00:25:25.815, and 6561 at 00:25:27.479, while the first two
were still 28 seconds from finishing. Within one invocation the next claim
cannot happen until the previous wave resolves, so a claim 1.7 seconds later can
only be a **second, overlapping drain invocation**.

Each invocation obeyed its own limit of two. Together they used three.

**Bounding the loop is not the same as bounding the resource.** The limit lived
in this function's own arithmetic instead of in the queue, which is the only
thing every worker shares.

Nothing broke — three is exactly what Cloud Run can serve — but the whole point
of choosing 2 was to keep one instance free for Ary's video renders, and that
margin was gone.

**The data also shows why the margin matters.** Items running at a true
concurrency of 2 took 24–38 seconds. The three that ran during the 3-way overlap
took **52, 73 and 82 seconds**. The render service degrades under saturation,
so a third concurrent check does not buy a third more throughput; it slows
everything already running.

#### The fix

`inFlightCount(db, kind)` in `lib/queue.mjs` counts jobs of a kind currently
claimed, excluding claims older than the expiry so a dead worker cannot wedge
the lane shut. The lane now:

1. asks the queue how many are already out, anywhere, and takes only the
   headroom that is left;
2. re-checks after each individual claim, because two workers can still read the
   same headroom a moment apart — but they cannot both hold a claim without
   seeing it;
3. `release`s the job back to `queued` if it finds it overshot, restoring the
   attempt so declining to start is never counted as a failed try.

Three overlapping lanes now peak at 2, asserted by test.

### Accounting: exact

| | before | after | delta |
|---|---|---|---|
| balance | 498,360 | 498,180 | **−180** |
| spent all time | 1,640 | 1,820 | **+180** |

Eleven ledger rows: ten `precheck` charges of 20 (**200**) and one refund of
**−20**, at 00:27:19 — the moment w3.org finished as `BLOCKED`. A site that
refuses to load is a fact about them, so the result is recorded, but the work
was not delivered, so the credit went back.

**Net 180 = nine completed paid checks × 20.** Exactly what the delivered work
justifies, and under the 200 cap.

- 10 charges, 10 distinct prospects, **no duplicate charges**
- every event `actor = 'human'`
- **`auto_spend` for the day: 0** — the daily automatic allowance was not
  touched, confirming a human-triggered Hive run stays human-triggered even when
  it runs on the server and runs in parallel
- 10 jobs, 10 total attempts, 10 done — **no duplicate jobs or results**
- every item `attempts = 1`

#### A second, smaller bug this exposed

The refund row carried `prospect_id: null`, because the precheck path called
`refundCredits` without one. The ledger could say 20 credits came back but not
for whom, which is why the first reconciliation looked like a 20-credit hole
until every row in the window was read by hand. Both refund paths now pass the
prospect id, with a test asserting it.

### One failure did not kill its siblings

w3.org was BLOCKED. 6563 ran alongside it in the same wave and completed
normally; 6564 ran afterwards and completed normally. The blocked site got its
own recorded outcome and its own refund, and nothing else in the run noticed.

### Measured throughput

Individual durations, sorted: 11, 24, 26, 26, 29, 34, 38, 52, 73, 82.

- **p50 ≈ 31.5s**, **p90 = 73s**
- At a true concurrency of 2: **24–38s**, p50 ≈ 29s
- During the 3-way overlap: **52–82s**

Ten sites in 482 seconds of wall clock = **74.7 sites/hour**, but that number is
not sustainable and should not be quoted: it benefited from the accidental third
worker and from only two cron cycles being involved.

**The honest sustained figure is the first drain: 4 items per drain × 12 drains
an hour = 48 sites an hour**, which is exactly what the benchmark projected and
what the fixed global bound will now hold to.

Against the measured baseline of 12, that is **4×**. A 5,484-site run goes from
about 19 days to about 5.

### Send safety during the run

Zero `outcome_events`, zero `outreach_packages`, zero send-related jobs created
at any point. `autoSendApprovedFirstEmails: false` and
`autoSendApprovedFollowups: false` before and after. No email sent.

### Cleanup

All ten test prospects soft-deleted. The audit trail is intact: run 4, its 10
items, its 10 jobs and all 11 credit events remain queryable.

## Global bound acceptance (runs 5 and 6) — free, zero credits

Authorized as a final check that the fixed bound holds across workers.
Commit `351e0d6` confirmed as the one answering production, read from the new
`build` field rather than inferred.

### Cached work cannot prove this, so it was not used

A cached check returns after a single database read — milliseconds — so it can
never stay in flight the five minutes needed to span two cron ticks. Cached work
would have proved nothing about overlapping workers.

Instead the ten throughput prospects, now soft-deleted, were reused.
`runPrecheck` returns SKIPPED for a prospect that is not there **before** it
reaches `spendCredits`, so the whole lane — claim, headroom check, settle — runs
at **zero credits**. Both runs below cost nothing, confirmed by the ledger
staying at 171 events throughout.

### The A/B, and it is an accident that made it convincing

**Run 5** was meant to test the guard and instead invalidated its own setup. The
simulated holds were written with `datetime('now')`, which is space separated;
real claims are written as ISO strings with a T and a Z. Compared as text those
differ at character eleven, so the guard counted **0 in flight** and the drain
proceeded. All ten items were processed within about a minute.

**Run 6** repeated it with the format the queue actually writes. The guard
counted **2 in flight**, and:

| time | in flight | available | done | credit events |
|---|---|---|---|---|
| 00:54:20 | 2 | 8 | 0 | 171 |
| 01:09:02 | 2 | 8 | 0 | 171 |

**Nothing moved for thirteen minutes** — three drain cycles — with eight jobs
sitting available the whole time.

Same prospects, same free work, same drains running throughout. The only
difference was whether the guard could see the held claims:

- guard sees 0 in flight → all ten processed in about a minute
- guard sees 2 in flight → nothing processed in thirteen minutes

That is the property, demonstrated in production: **a worker that sees no
headroom does not start another check.**

### It also proved the abandonment fencing, by accident

Holding run 6 at zero headroom meant no item ever settled, so nothing ever
refreshed its heartbeat, so after fifteen minutes the reconciler closed it:
`ABANDONED`, reason "No progress for over 15 minutes." Its nine unstarted jobs
were cancelled and all ten items became `CANCELLED`, at zero cost.

Correct behaviour, and it ended the planned control step (drop to a headroom of
one and watch a drain take exactly one) before it could run. Run 5 already
serves as that control: it is the same setup with the guard blind, and work
happened immediately.

### What this did and did not prove

**Proved, in production:**

- a worker with no headroom starts nothing, across multiple drains
- the fix changes real behaviour — the same setup gave 0 in flight before and 2
  after
- every durable item settled exactly once (10 items, 10 job attempts, no
  duplicates)
- ABANDONED fencing intact: unstarted work cancelled, claimed work left alone
- zero credits, zero charges, zero automatic allowance
- no email, no send jobs, both switches OFF

**Not proved:** two genuinely independent cron invocations overlapping on real
work. That needs checks that stay in flight for ~30 seconds, which means paid
ones. The minimum honest test is 6 uncached prospects, **120 credits maximum**.
It has not been run and was not authorized.

The ≤2 property under genuine overlap currently rests on the unit test (three
overlapping lanes peak at 2) plus the production evidence that the *old* code
produced 3 — which at least confirms the measurement is real and would catch a
regression.

### A third bug, found on the way

The invalid setup pulled on a thread that was already loose. `claimed_at` holds
an ISO string with a T and a Z, but several queries built their bound with
`datetime('now', '-15 minutes')`, which is space separated. Compared as text
those never agree.

The drain's own workspace query has had that shape since it was written:
*"or a running job whose claim went stale"* **has never matched a row**. A
workspace whose only remaining work was a claim abandoned by a dead worker never
entered the drain's list at all.

Proved against production data: a claim from an hour ago answers 0 to the raw
comparison and 1 once both sides go through `datetime()`.

Fixed in `351e0d6` — `datetime()` on both sides in all three places, plus a test
that fails if a raw comparison is ever added back.

## Known limitation, recorded rather than hidden

A run that waits at zero headroom for fifteen minutes is abandoned, because the
heartbeat only advances when an item settles. Run 6 hit this deliberately.

It cannot happen with one workspace, since only one live run per scanner is
allowed. With two workspaces scanning at once, one could be starved by the other
long enough to be wrongly closed. The fix is for a run waiting on the lane to
refresh its own heartbeat, and it belongs with the multi-workspace fairness work
that is also not yet done.

## Safety

- No send limit changed. `MAX_JOBS_PER_RUN`, `MAX_MS` and `MAX_PER_WORKSPACE`
  hold their exact previous values, asserted by test.
- No Gmail, send, approval, sequence, reply-sync, Strong/Vet/evidence or
  contact-ownership behaviour changed.
- No credit price changed. No daily-allowance policy changed — the credit fix is
  a correctness fix, not a policy one.
- No unauthorized paid run started. No email sent.
- The old abandoned 5,484-item run was not restarted and not touched.
- `AUTO_SEND_FIRST = OFF`
- `AUTO_SEND_FOLLOWUPS = OFF`

## Recommended next tuning step

**Do not raise concurrency.** The live run produced direct evidence against it:
when three checks genuinely overlapped, per-item duration went from 24–38
seconds to 52–82. The render service saturates, so a third concurrent check
does not add a third more throughput — it slows down the two already running
and eats the instance kept free for video rendering.

The one worthwhile next step is instead: **re-run a 10-site test with the global
bound in place** and confirm the first drain's clean profile (4 items, two waves
of two, 24–38s each) holds across every drain rather than just the first. That
needs no code change and costs at most 200 credits.

If more throughput is genuinely needed after that, the change is to the render
service, not to this code: raise `--max-instances` first, then
`SCANNER_CONCURRENCY`, in that order and together.
