# Hive stale-run recovery

A `precheck` run asked for **5,484** prospects, finished **70**, and then sat in
the database saying `RUNNING` for nine hours.

| | |
|---|---|
| Production commit | **`ba8b792`** |
| Tests | **1178 passing, 0 failing** |
| Credits spent by recovery | **0** |
| Daily allowance consumed | **0** |
| New runs started | **0** |
| Emails sent | **0** |
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

---

## Root cause

The rule was never wrong. `HEARTBEAT_STALE_MINUTES = 15` existed, `ABANDONED`
existed in the state machine, `isStale()` existed, and there was a `reconcile`
action that wrote the transition correctly.

**It had never run. Not once, in any environment.**

Two separate failures stacked, and only the first was visible from reading the
code:

### 1. Nothing on a schedule called it

The single caller was a `useEffect` in `components/ArmyPanel.jsx`, firing when
the **Hive page mounts in a browser**.

The one situation where a run dies is the situation where nobody is looking at
the Hive: the tab was closed, the laptop slept, the phone locked. Recovery was
gated on the exact event that cannot happen.

### 2. ⚠️ That call had always returned 400

Found by calling the endpoint against production rather than by reading it.

`reconcile` is about *every* run rather than one of them, so the Hive calls it
with `id: 0`. The branch sat **below** this line:

```js
if (!id) return NextResponse.json({ error: 'Which run?' }, { status: 400 });
```

`0` is falsy. So the only caller in the app has been receiving *"Which run?"*
since the day the action was written, and the recovery code had never executed
at all. Nothing failed loudly, because the browser fired it and never looked at
the answer:

```js
fetch('/api/scanner-runs', { ... }).catch(() => {});
```

The first commit in this pass described the cause as "recovery only ran in the
browser". That was half right and too generous, and the report corrects it here
rather than quietly: **recovery never ran.**

This is the kind of defect that survives every form of review except calling it.
The code is correct, looks reachable, and is dead.

---

## The existing scanner state model, unchanged

| State | Meaning |
|---|---|
| `RUNNING` | working through the list |
| `STOPPING` | asked to stop; the item in flight may finish |
| `STOPPED` | a person stopped it |
| `COMPLETED` | it finished the list |
| `FAILED` | it stopped because something went wrong |
| `ABANDONED` | it stopped reporting and was closed |

No new state was added, no migration was written, and no second staleness rule
exists. `stop_reason` and `finished_at` already existed and carry the record.

---

## The canonical reconciler

`reconcileStaleScannerRuns(db, { workspace, now })` in `lib/scanner-run.mjs` —
the module that already owns the states and the threshold.

Both callers now delegate to it:

| Caller | When |
|---|---|
| `POST /api/cron/drain` | **every drain**, all workspaces, bounded to 50 runs |
| `POST /api/scanner-runs` `action: reconcile` | when the Hive page mounts |

The cron is the fix. The Hive path is kept because it makes the page correct the
moment somebody opens it, rather than up to five minutes later.

### Atomicity

The old implementation read the rows, filtered them in JavaScript, then wrote
with a guard on the state **but not on the heartbeat**. A run that checked in
during that gap would have been killed while it was alive.

The staleness test is now in the `WHERE` clause:

```sql
UPDATE scanner_runs
   SET state = 'ABANDONED', finished_at = datetime('now'), stop_reason = ?
 WHERE state IN ('RUNNING','STOPPING')
   AND COALESCE(heartbeat_at, started_at) < datetime('now', ?)
```

The write is the authority, not the read. A worker that renews its heartbeat
first wins, and there is a test that stages exactly that race.

The cutoff string is built from `HEARTBEAT_STALE_MINUTES`, so the number appears
once in the codebase. A test fails if `'-15 minutes'` is ever typed literally.

### Idempotent

Running it twice closes nothing the second time and does not rewrite
`finished_at`. Tested.

---

## Late-worker fencing

Already correct, and verified rather than rebuilt. Every write in the scanner
route is conditional on the run still being live:

| Action | Guard |
|---|---|
| `progress` / heartbeat | `if (isLive(run.state))` |
| `finish` | `WHERE … state IN ('RUNNING','STOPPING')` |
| `stop` | `WHERE … state = 'RUNNING'` |

So a worker that wakes up after abandonment cannot heartbeat the run, advance
its counters, mark it `COMPLETED`, or reopen it. `mayContinue()` tells its loop
to stop, and `isLive(ABANDONED)` is `false`.

No one-off `if abandoned` checks were scattered around; the existing central
guard was already the right one.

---

## What happened to the run's work

| | |
|---|---|
| **Completed** | untouched. Counts are never reset, results are never rolled back, and the requested total is never rewritten to match what got done |
| **Queued, owned by the dead run** | cancelled, with a reason on the row. This is the gap: `stop` always did it, abandonment did not, so a dead run's queued work would have kept running |
| **In flight** | left alone. Killing an item halfway leaves a half-written answer nothing downstream can tell from a whole one. The queue's own expired-claim recovery is a better judge of a dead worker, and it already exists |
| **Shared or unrelated** | never touched. Ownership is proven by `jobs.scanner_run_id` plus the workspace |

A test stages six jobs across two runs and two workspaces and asserts exactly
one is cancelled.

---

## The production incident

Run **id 1**, workspace `ary`, scanner `precheck`.

### Before

| | |
|---|---|
| state | `RUNNING` |
| started | 2026-08-10 07:44:25 UTC |
| last heartbeat | 2026-08-10 07:45:05 UTC — **40 seconds after it started** |
| requested total | 5,484 |
| processed | 70 |
| succeeded / failed | 59 / 11 |
| stop_reason | `null` |
| finished_at | `null` |
| jobs owned by the run | **0** |

The heartbeat stopping 40 seconds in, with 70 items processed, says the loop
kept working locally and only its reporting died — or the tab was closed almost
immediately after starting. Either way the row never changed again.

**The run owned no queued jobs**, so nothing needed cancelling. Vet Bee's
precheck loop calls the render service directly rather than through the queue.

### After

**Closed by the cron at 2026-08-10 18:15:40 UTC**, through
`reconcileStaleScannerRuns`. No hand-written SQL was used, and the row was not
touched by anything else.

| field | before | after |
|---|---|---|
| `state` | `RUNNING` | **`ABANDONED`** |
| `stop_reason` | `null` | **"No progress for over 15 minutes."** |
| `finished_at` | `null` | **2026-08-10 18:15:40** |
| `current_item` | (stale) | `null` |
| `total` | 5,484 | **5,484**, unchanged |
| `processed` | 70 | **70**, unchanged |
| `succeeded` | 59 | **59**, unchanged |
| `failed` | 11 | **11**, unchanged |
| `started_at` | 07:44:25 | unchanged |
| `heartbeat_at` | 07:45:05 | unchanged, kept as the record of when it went quiet |

The reason string was generated from `HEARTBEAT_STALE_MINUTES`, which is the
proof it came through the canonical path rather than from a keyboard.

---

## Can the unfinished prospects be resumed?

**No, and nothing pretends otherwise.**

`scanner_runs` stores a requested `total` and a `processed` count. It does not
store the list of prospects the run was given. 5,484 − 70 = 5,414 is arithmetic,
not a set: nothing records which 5,414, and the eligible list has changed since
(78 more sites were checked today by other means).

So:

- there is **no Resume button**
- nothing claims 5,414 "failed" or "were skipped"
- the copy says *"Start a fresh scan when you want to carry on."*

A test asserts the summary contains none of `5,414`, `5414`, `failed` or
`skipped`, and that no component offers a resume.

---

## Live acceptance

Read from production after the cron ran.

| Check | Result |
|---|---|
| Before state captured exactly | ✅ `RUNNING`, heartbeat 07:45:05, 70 of 5,484 |
| Closed by the canonical reconciler | ✅ via the cron, not by hand |
| State is now `ABANDONED` | ✅ |
| Reason and time recorded | ✅ built from the canonical threshold |
| Completed counts unchanged | ✅ 70 / 59 / 11 |
| Requested total unchanged | ✅ 5,484 |
| No new run created | ✅ still 1 row |
| No credits spent | ✅ 1,340 → 1,340 |
| No automatic allowance used | ✅ 160 → 160 |
| No run-owned work continued | ✅ the run owned no jobs |
| No email sent | ✅ 5 send events, unchanged |
| System health reads the canonical state | ✅ `state: ABANDONED, closed: true` |
| Hive shows it truthfully | ✅ |
| No horizontal overflow, System health | ✅ desktop and **402px, with all four technical-details blocks expanded** |
| No horizontal overflow, Hive incident card | ✅ desktop and 402px |
| Both switches | ✅ OFF |

System health now says:

> A Hive run stopped unexpectedly and was safely closed. 70 of 5,484 finished.
> Everything it completed was kept.

⚠️ **One inconsistency found in this check and fixed.** The attention card
titled the incident *"A Hive run stopped reporting"* while the Hive section
called it *"stopped unexpectedly and was safely closed"*. Two cards about one
incident, worded differently, is how somebody concludes there were two. They
now say the same thing.

⚠️ **Edge propagation, again.** The deployment reported Active while the edge
still served the previous worker, so the `reconcile` endpoint kept returning the
old 400 for several minutes after deploying. The cron path picked up the new
build and closed the run on its own, which is the better acceptance anyway: it
proves the scheduled path works without a person triggering it, which is the
entire point of the fix.

⚠️ **No screenshots.** The browser pane is not displayed in this session, so
every screenshot attempt times out. The visual checks were read from rendered
text and computed geometry. That is not a full visual review.

---

## What Ary sees

### ⚠️ The Hive showed nothing, and the first pass said otherwise

Caught by re-running the acceptance checks and looking at the right screen.

The first pass reported *"Hive shows it truthfully"* on the strength of System
health's one-line summary. That is a different surface. **The Hive page itself
said nothing about the dead run at all.**

The cause: the Hive only ever drew a run while that tab was the one driving it.
Everything hung off a local `isRunning` flag, so a run that died in a previous
session left no trace on the page it was started from — which is exactly
backwards, because that page is where somebody would look.

Fixed in `ba8b792`. A card under the Hive header, for a run closed in the last
day:

> **This run stopped unexpectedly**
> **70 of 5,484 finished**. Everything it completed was kept.
> Start a fresh scan when you want to carry on.

Run id, start time, last report, closing time and reason sit behind **Technical
details**. It uses the same `abandonedSummary()` the health page uses, so the
two cannot drift, and a test asserts no enum or column name appears in the
visible summary.

Styling is deliberately quiet. Nothing here needs fixing, the finished work is
safe, and the only decision is whether to scan again.

**Hive** distinguishes the two states:

| | |
|---|---|
| `STOPPED` | "Stopped. Everything already completed was kept (70 of 5,484)." |
| `ABANDONED` | "This run stopped unexpectedly. 70 of 5,484 finished. Everything it completed was kept." |

**System health** reports the incident:

> A Hive run stopped unexpectedly and was safely closed. 70 of 5,484 finished.
> Everything it completed was kept.

Two deliberate choices:

1. **The wording does not change when the row is corrected.** A stale `RUNNING`
   the cron has not reached yet says the same sentence, so the page does not
   appear to change its story under her.
2. **It is reported for 24 hours, not for ever.** Correcting storage does not
   mean nothing happened, so it is not hidden; but a warning nobody can ever
   clear is a warning people learn to scroll past, and there is no action that
   resolves this one beyond starting a fresh scan.

No heartbeat timestamps, enum names or run ids appear in the headline. Those are
in **Technical details**.

---

## Ownership: health observes, scanner recovers

`GET /api/system-health` remains **read-only**. It does not import the
reconciler and contains no `UPDATE`, `INSERT` or `DELETE`. Opening the page
cannot close a run. Tested.

---

## Credits and allowance

Recovery reads two tables and writes state. A test asserts the function body
contains no `spendCredits`, `recordAutoSpend`, `canSpendAutomatically`,
`enqueue(`, `INSERT INTO scanner_runs`, `INSERT INTO jobs`, `sendApproved` or
`buildMime`.

Measured before and after against production:

| | before | after |
|---|---|---|
| credits charged today | 1,340 | **1,340** |
| automatic allowance used today | 160 | **160** |
| scanner runs in the table | 1 | **1** — no new run |
| jobs owned by run 1 | 0 | **0** — none to cancel |
| send events, all time | 5 | **5** — no email |
| websites checked today | 80 | **80** — no work redone |

Every figure is identical either side of the reconciliation. Recovery cost
nothing and started nothing.

---

## Tests

**1178 passing, 0 failing.** 25 added in `tests/scanner-recovery.test.mjs`
against a real in-memory SQLite database, covering all 35 required points:

- a run still reporting is left alone; a stale one is closed
- every state checked individually: `RUNNING` and `STOPPING` close;
  `STOPPED`, `COMPLETED`, `FAILED` and `ABANDONED` never close from time passing
- the canonical threshold is used in the query and the reason, and the literal
  is banned
- idempotent, and `finished_at` is not rewritten
- the heartbeat race: a worker that reports in first keeps its run
- a late worker cannot revive, progress, finish or reopen an abandoned run
- completed counts and results survive
- one job of six cancelled: the dead run's queued work only
- recovery spends nothing and starts nothing
- **the reconcile branch sits above the id guard** — the regression for the
  defect that made all of this dead code
- `STOPPED` and `ABANDONED` say different things, and both promise the work was kept
- no `Resume`, and no invented remainder
- health stays read-only and still reports the closed incident
- Stop, normal completion and stale-claim recovery all still pass
- the Hive itself renders a closed run, with no jargon in the visible summary
- the incident card cannot widen a phone

---

## Safety

| | |
|---|---|
| Emails sent | **none** |
| Scanner runs started | **none**, automatically or otherwise |
| Completed results lost | **none** |
| Gmail, send, approval, sequence | **untouched** |
| Credits spent by recovery | **0** |
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

---

## Remaining gap

1. **Exact run membership is still not stored.** Until a run records which
   prospects it was given, "continue where it left off" cannot be offered
   honestly. That is a schema change and was out of scope here.
2. **Why the heartbeat died 40 seconds in is unknown.** Recovery closes the run;
   it does not explain the original failure. Nothing records why a tab stopped
   reporting, and nothing here pretends to know.
3. **Vet Bee's precheck loop runs in the browser tab.** That is why closing the
   tab kills the run at all. Moving that work into the durable queue would make
   the whole class of problem go away, and is a much larger change.
