# Durable Hive: the scan that survives a closed tab

**Date:** 2026-08-10
**Commit:** `375273c` — *feat: the Hive scan keeps going after you close the tab*
**Migration:** `049_scanner_run_items.sql`, applied to production D1 `bloomtrack-pro`
**Tests:** 1,217 passing (was 1,178; 39 new)
**Build:** `npm run build` clean

---

## What was wrong

A Hive precheck run asked for 5,484 websites. It finished 70. Then a laptop
slept.

Two separate failures, and both had the same cause: the run only ever existed
inside a browser tab.

**The work stopped with the tab.** The loop was a `for` loop in
`components/ArmyPanel.jsx`. It held the list of prospects in a JavaScript array,
called `/api/audit-video/precheck` once per site, and reported progress to the
server as it went. Everything about that is fine until the tab closes, and then
there is nothing left running.

**Nothing could say what was left.** The run row stored a *requested total*
(5,484) and a *processed count* (70). It never stored the list. 5484 − 70 is
arithmetic, not a set: the eligible prospects change as sites get checked by
other means, so the difference cannot be reconstructed afterwards. Offering a
"Resume" button would have meant quietly scanning a different 5,414.

---

## What changed

### 1. The list is rows

`migrations/049_scanner_run_items.sql` adds `scanner_run_items`: one row per
prospect per run, written at start, before any work begins.

- Unique on `(workspace, scanner_run_id, prospect_id)`, so a double-pressed
  Start, a retried HTTP call or a feeder that runs twice cannot put the same
  business in a run twice and charge for it twice.
- Indexed on `(workspace, scanner_run_id, state)`, because "what is left" and
  "how far along" are asked constantly and must never become "load five thousand
  rows and count them in JavaScript".
- **No backfill.** Run 1 keeps saying total 5,484, processed 70, membership
  unknown. Writing 5,414 invented rows would turn "we do not know" into a list
  somebody could act on.

Normalised rather than a JSON blob of ids on the run row: five thousand ids in
one column cannot be indexed, cannot be claimed one at a time, and cannot record
a per-item error.

### 2. The work is the queue's

`lib/scanner-items.mjs` owns the item lifecycle. `lib/runner.mjs` gains one
handler, `KIND.SCANNER_ITEM`.

The feeder is **bounded** — `FEED_BATCH = 20` jobs in the queue for a run at any
one time, topped up as they land. Not one job per item. A 5,484-item run would
otherwise put 5,484 rows in a table every drain scans, would let one Hive run
monopolise the queue against every other kind of work, and would mean rewriting
all of them to stop a run. The *items* are all stored; only their *jobs* are
rationed.

`app/api/cron/drain/route.js` calls `feedLiveRuns(db)` on every drain, right
after the stale-run reconciler. The response now reports `scannerItemsFed` and
`scannerRunsSettled`.

### 3. One implementation of the actual work

`lib/precheck.mjs` is new, extracted from `app/api/audit-video/precheck/route.js`
verbatim. The route now calls it. The queue worker calls it. There is no second
copy, and a test asserts the route no longer contains `fetch(${service}/precheck)`
or `spendCredits(` of its own.

Two copies would have been two ideas about what gets charged, and the one that
drifted would have been the one spending money.

### 4. The credit class did not change

This is the one thing that was easy to get wrong. `KIND.VERIFY_SITE` already
does this exact work server-side, but through `canSpendAutomatically` and
`actor: 'auto'` — the 160-per-day unattended allowance.

The Hive path deliberately does **not** adopt that. Ary pressing Start spends the
credit balance as `actor: 'human'`, the same as it always did from the button. If
it had silently become automatic spending, a manual Hive run would exhaust the
sweep's daily allowance and then park itself, and the sweep's ceiling would stop
meaning what it says.

A test slices the `SCANNER_ITEM` handler out of `runner.mjs` and asserts it
contains neither `canSpendAutomatically` nor `recordAutoSpend`.

### 5. The browser cannot execute scanner work

The `for` loop is gone from `ArmyPanel.jsx`. The Hive page now:

- sends the list of prospect ids at Start,
- shows "You can close this page. LTB keeps working in the background.",
- polls the run every 5 seconds while it is alive,
- picks a live run back up on mount, so coming back an hour later on a different
  device shows the scan still going,
- and asks the *server* to stop, rather than setting a flag in the page.

Two guards make double-processing impossible rather than unlikely:

- A static test asserts `ArmyPanel.jsx` contains no reference to
  `audit-video/precheck` at all.
- `GET/POST /api/scanner-runs` refuses `progress` and `finish` outright for a
  durable run. Its numbers are counted from items; anything a browser posts is
  ignored. A page watching a run cannot report progress on work it is not doing,
  and a closed tab cannot declare a run over that the queue is still working
  through.

### 6. Stopping means stopping

`stopRun()` is one function, used by the Stop button and by the out-of-credits
path, so there cannot be three different ideas of what stopped means:

1. the run goes to `STOPPING` (conditional update),
2. every item that never started is `CANCELLED`, along with its queued jobs,
3. the run settles to `STOPPED` the moment the last in-flight item lands — or
   immediately, if nothing was in flight.

Work already in a worker's hands is left to finish. Killing it halfway leaves a
half-written answer nothing downstream can tell from a whole one. Finished work
is never relabelled: a stopped run is `STOPPED`, never `COMPLETED`.

The stale-run reconciler shipped in `25b87e2` cancels the *jobs* a dead run
owned. It now cancels that run's unstarted *items* too, through the same
`cancelUnstarted` rule, so an abandoned run does not leave rows saying a worker
is about to pick them up. Both callers of the reconciler do it — the cron and the
Hive page — and a test asserts both.

### 7. Running out of credits stops the run once

Previously, out of credits on site 3 of 40 meant 37 more doomed requests. Under
the queue it would have been worse: five thousand items each failing separately
with the same message. Now the item is cancelled and the run is stopped with
"You are out of credits" as its stop reason.

### 8. The heartbeat means something again

`syncRunCounters` refreshes the run's cached counters after every item, and that
write *is* the heartbeat. Server work happening is the liveness signal, so a live
run looks alive with no tab open anywhere.

This is what makes the stale-run reconciler shipped in `25b87e2` correct rather
than merely present: before, a healthy run with no tab open was indistinguishable
from a dead one.

System health says so out loud: a durable run reads
*"Working through 30 of 5,484. It keeps going whether or not the page is open."*
The route computes that with one indexed count, and only for a run that is still
live. `GET /api/system-health` remains read-only — the test asserting no
`INSERT`/`UPDATE`/`DELETE` anywhere in the file still passes.

---

## Test coverage

37 new assertions in `tests/durable-hive.test.mjs`, plus one updated in
`tests/scanner-recovery.test.mjs`.

| Area | What is proven |
|---|---|
| Snapshot | membership is written exactly and in order; duplicates never become rows; a retried start is a no-op; the total comes from the rows that landed, not the list hoped for; `null` in the list does not become prospect zero |
| Progress | counted from items; cancelled work is not counted as done; the unfinished set is exact; a legacy run reports nothing rather than guessing |
| Feeder | bounded to `FEED_BATCH`; does not top up a full queue; two feeders racing produce one job per item; a `STOPPING` run is never fed; a finished run is never fed; the cron feeds live runs and settles finished ones |
| Finishing | a run with nothing left finishes itself; a stopped run settles `STOPPED`, never `COMPLETED`; a run still working is not settled |
| Stopping | only unstarted work is cancelled; the in-flight item is left to land; queued jobs are cancelled; a run with nothing in flight ends immediately; stopping twice is a no-op |
| One item | a second worker cannot claim a claimed item; a late worker cannot revive a cancelled one; attempts are counted on the row; server work refreshes the heartbeat; a closed run is not rewritten by a late worker |
| Boundaries | the browser cannot call the precheck endpoint; the page starts a run by handing over the list; one precheck implementation; the Hive spends the human credit class; the cron feeds every drain; a durable run never takes numbers from a browser; total is written after the snapshot; the migration refuses to backfill |

---

## One thing worth knowing: throughput

The cron drains every 5 minutes, bounded to 25 seconds per invocation. A site
check takes about a minute, so in practice **one site per drain, about 12 an
hour, about 288 a day** — running continuously, with nobody watching.

The old browser loop did roughly 60 an hour, but only while the tab stayed open,
and lost everything past that point with no record of where it got to.

For a 5,484-site scan that is roughly 19 days of unattended work. That is slower
per hour than the old loop and faster in practice than any run that depends on a
laptop staying awake. I have not touched the queue's bounds to speed it up —
`MAX_JOBS_PER_RUN`, `MAX_MS` and `MAX_PER_WORKSPACE` govern every kind of job,
including sending, and raising them for the Hive would change all of them. If a
full scan needs to finish sooner, that is a deliberate decision to make on its
own, not a side effect of this change.

---

## Not touched

Gmail send, approval, approval fingerprints, send guards, send windows, sequence
policy, Strategy V2, reply sync, prospecting policy, `AUTO_SEND_FIRST`,
`AUTO_SEND_FOLLOWUPS`. Both automatic-send switches remain OFF.

The other Hive bees (`score-all`, `draft-all`) still run their loops in the tab.
They are AI calls of a few seconds each, not minute-long site probes, and they
were not in scope. Their code path is unchanged.

---

## Rollout order followed

1. durable item schema — `migrations/049`
2. server item execution — `lib/precheck.mjs`, `lib/scanner-items.mjs`, the
   `SCANNER_ITEM` handler
3. server-derived progress — `durableView()` in `app/api/scanner-runs/route.js`
4. tests — 37 new
5. Hive start switched to durable mode
6. browser execution loop retired
7. proof the browser no longer executes scanner work — static assertion

## Live production acceptance — passed

Authorized by Ary on 2026-08-10, capped at 5 test prospects.

### First: proving the build was actually being served

The deployment status column has lied before, so it was not used as evidence.
Two independent proofs, both taken from `leadsthatbloom.com` itself:

- **Client.** In a real signed-in session, the Hive view loaded
  `page-f915bdda617dc4db.js`, and that chunk contains the string
  `LTB keeps working in the background` — text that exists only in this build.
- **Server.** `POST /api/scanner-runs {action:'reconcile'}` returned
  `{"closed":0,"ids":[],"cancelledJobs":0,"cancelledItems":0}`. The
  `cancelledItems` key was added in `e70b07a` and does not exist in any earlier
  deployment. That call spends nothing and starts nothing.

Deployment `4a4cb52f-085a-417b-adf8-74d485a60d51` = commit `e70b07a`.

An earlier automated check reported NOT LIVE and was wrong: it read only the
chunks linked from `/gate`, and the app's bundle is behind the gate, so it was
looking somewhere the string could never appear.

### The test records

| id | name | domain | do_not_contact |
|---|---|---|---|
| 6550 | TEST RECORD - Durable Hive 1 | smithsonianmag.com | 1 |
| 6551 | TEST RECORD - Durable Hive 2 | mozilla.org | 1 |
| 6552 | TEST RECORD - Durable Hive 3 | gutenberg.org | 1 |
| 6553 | TEST RECORD - Durable Hive 4 | iana.org | 1 |
| 6554 | TEST RECORD - Durable Hive 5 | rfc-editor.org | 1 |

All five were created with `do_not_contact = 1` so neither the nightly sweep nor
any send path could reach them, and with no stored `site_intel`, so every check
was real work rather than a cached answer.

The Vet Bee button was **not** pressed: it scans every prospect with a website,
which is 5,813 of them. The run was started through the same `action: 'start'`
path the button uses, with a five-id list.

### Run 2 — the durability proof

Started `2026-08-10 23:30:08`, finished `2026-08-10 23:50:54`.

**Membership was stored before any processing.** Immediately after start, before
a single site had been opened: 5 rows in `scanner_run_items`, prospects
6550–6554 at positions 0–4, one job each (299–303), every one tagged
`scanner_run_id = 2`, each with its own dedupe key
(`ary:scanner-item:6550:1` … `:6554:5`).

**Then the page was closed.** The tab that started the run was closed at 23:30,
and a few minutes later every remaining browser tab on the app was closed too.
The first poll after closing already showed one item `RUNNING` — a server worker
had claimed it with nothing open anywhere.

Items settled one at a time, roughly one per five-minute drain, with no browser
present for any of them:

| position | prospect | state | attempts | finished |
|---|---|---|---|---|
| 0 | 6550 | SUCCEEDED | 1 | 23:31:57 |
| 1 | 6551 | SUCCEEDED | 1 | 23:35:58 |
| 2 | 6552 | SUCCEEDED | 1 | 23:40:59 |
| 3 | 6553 | SUCCEEDED | 1 | 23:45:53 |
| 4 | 6554 | SUCCEEDED | 1 | 23:50:54 |

**The run closed itself.** `state = COMPLETED`, `finished_at = 23:50:54`, set by
the last item landing rather than by any page.

**Totals reconcile exactly.** Run row: `total 5, processed 5, succeeded 5,
failed 0`. Items: 5 SUCCEEDED, 0 FAILED, 0 CANCELLED. Every item attempted
exactly once.

**No duplicates.** 5 job rows for 5 distinct prospects, all `done`, total
attempts across all of them = 5. Zero jobs were created for these prospects
outside run 2.

**Credits: exactly as expected, no duplicate charges.**

| | before | after | delta |
|---|---|---|---|
| balance | 498,460 | 498,360 | −100 |
| spent all time | 1,540 | 1,640 | +100 |

Five `credit_events` (ids 156–160), 20 credits each, **100 total**, five distinct
prospects, **zero refunds**, and every one recorded with `actor = 'human'` — the
credit balance, not the unattended daily allowance, which is the budget class
this had to keep.

**Real work happened.** All five prospects came back with fresh probe results
written by the worker: one `SEND` (score 15) and four `NO_VIDEO` (scores 6–13),
each with `site_intel_source = 'precheck'` and 400–471 bytes of stored intel.

**Progress reads from the database.** A browser opened fresh, long after the run
had finished and with no memory of it, asked for run 2 and got the full picture
back — `total 5, processed 5, succeeded 5`, plus the item-level breakdown — all
counted from `scanner_run_items`.

### Run 3 — the Stop proof

Started `23:53:27` over the same five prospects. Because run 2 had just written
fresh `site_intel` for all of them, every item would have short-circuited as
cached, so this cost nothing to run.

Stop was called ten seconds later. Result:

- run `state = STOPPED`, never COMPLETED, with
  `stop_reason = 'Acceptance test: server-side stop'`
- all 5 items `CANCELLED`, each carrying that reason
- all 5 jobs `cancelled`
- **0 credit events, balance unchanged at 498,360**
- run 2 untouched: still `COMPLETED, processed 5, succeeded 5`

### No email was sent

Zero `outcome_events`, zero `outreach_packages`, zero prospects with
`emails_sent > 0`, zero with a `last_contact_date`, and zero `send-approved` /
`prepare-outreach` / `prepare-followup` jobs created at any point during the
test.

Both switches were OFF before the test and OFF after it:
`autoSendApprovedFirstEmails: false`, `autoSendApprovedFollowups: false`.

### Cleanup

The five test prospects were soft-deleted (`deleted_at` stamped). The audit
history survives in full, as it did for the Gmail acceptance records: 2 runs, 10
items, 10 jobs and 5 credit events are all still queryable.
