# V2 UX cleanup and Hive scanner controls

Two things Ary hit after a day with Strategy V2: a screen showing two systems as
if they were one, and scanners she could start but not stop.

No strategy change. Both send switches remain OFF.

---

## Baseline

| | |
|---|---|
| Commit before | `98bf561` |
| Tests before | 963 |
| Tests after | **980 passing, 0 failing** |
| Migration | **048** applied to production |
| Build | clean |

---

## Ready for approval cleanup

**The cause.** `lib/exceptions.mjs` put pre-V2 `pending_draft` rows into
`BUCKET.READY_FOR_APPROVAL`, with the headline *"Follow-up ready"* and the
detail *"Prepared automatically."* So old plain-text drafts meant for pasting
into Gmail sat in the same pile, with the same label, as real V2 packages that
carry a band, a CTA class and prepared follow-ups.

**The fix.** A new `BUCKET.LEGACY_DRAFT`, ranked **5** against 30 to 100 for
everything current, so it sorts below every live bucket. "Ready for approval"
now contains **only** V2 outreach packages, which is what `/api/outreach`
already served: it reads `outreach_packages` with status `READY_FOR_APPROVAL` or
`NEEDS_DECISION`, and nothing else can enter it.

The headline changed from "Follow-up ready" to **"Old draft"**, and the detail
to *"Written before the new outreach flow. Redo it to use the new approval."*

The day's summary line counts them separately and last, as *"3 old drafts"*
rather than folding them into "ready to approve".

**Unchanged:** a *stale* draft still goes to `NEEDS_DECISION`, because a reply
arriving after a draft was written is a decision regardless of which system
wrote it.

---

## Legacy draft handling

Rendered in their own section at the bottom of the exception queue,
**collapsed by default**, with a count and one line of explanation:

> Written before the new outreach flow, for pasting into Gmail by hand. Redo one
> to use the new approval.

Each row carries a plain **"Old draft"** chip and three actions.

### Redo it

`POST /api/legacy-drafts` with `action: regenerate`. It does **not** convert the
old copy. It runs the prospect through the current rules and is allowed to
refuse, with the real reason:

| Blocked by | What Ary sees |
|---|---|
| Outbound guard | the guard's own words (they replied, they declined, they are a client) |
| `contact_state = NONE` | "There is no safe address for them yet... They are in the waiting list." |
| `NEEDS_CONTACT_RECOVERY` | "Their address stopped working. Find a new one first; everything else about them is still good." |
| Verification parks them | the semantic reason (prescreen, fit, nothing to verify) |
| Waiting for budget | "...today's allowance is spent. This will pick up by itself." |
| A live package exists | reported as already done, no second package |

On success it enqueues `PREPARE_OUTREACH`, the same job every other package goes
through, so the result passes the same validators and lands in real Ready for
approval. **The old five-email shape and its open-question close are not carried
across.**

### Put aside

`action: dismiss` writes exactly one column, `pending_draft_dismissed_at`.

> The draft text stays. The stage, rating, reply state, `do_not_contact` and
> `unsubscribed` are untouched. **"Not today" is not "rejected"**, and there is a
> test asserting none of those fields move.

### The old manual path

`Copy the old way` and `Open Gmail` survive, but only inside the expanded draft,
styled as quiet secondary buttons. Neither reads as the current workflow.

**No bulk action.** No "regenerate all", no "approve all". V2 refuses prospects
V1 happily wrote to, so turning a pile of old copy into live outreach in one
click is exactly the wrong affordance.

---

## Today page cleanup

A focused pass, not a redesign. Each section now carries one line of plain
English under its heading:

| Section | Line |
|---|---|
| Needs your reply | Somebody wrote to you. |
| Needs your decision | These need a call from you before anything moves. |
| **Ready for approval** | **New outreach prepared under the current rules. Nothing sends until you approve it.** |
| Ready to reconsider | They asked for later, and later has arrived. |
| Automation stopped | The background work stopped and said why. |
| **Old drafts** | **Written before the new outreach flow...** |

Order is unchanged and already correct: replies, then decisions, then approvals,
then deferrals, then blocked work. Old drafts are last, collapsed, and visually
secondary. The held bucket lives in Settings alongside the shadow panel.

---

## AI Hive scanner stop architecture

**What they actually are.** The Hive scanners are loops that run **in the
browser tab**: press a button and the tab walks a list, one HTTP call per item.
There is no server-side batch runner to signal, so a stop had to be built at the
layer that actually orchestrates.

A frontend-only flag was rejected: closing and reopening the tab would forget it.

**The design.** A run is a row.

```
scanner_runs
  state: RUNNING | STOPPING | STOPPED | COMPLETED | FAILED | ABANDONED
  processed / succeeded / failed / total / current_item
  started_at / heartbeat_at / stopped_at / finished_at
```

The loop reports progress against the run, and **the same call returns whether it
may continue**. So watching for a stop costs no extra requests, and the check
happens before every item.

| Action | Effect |
|---|---|
| `start` | creates a run. A second press joins the live run rather than racing it |
| `progress` | records counts, beats the heart, and returns `mayContinue` |
| `stop` | `RUNNING → STOPPING`, cancels that run's **queued** jobs only |
| `finish` | settles: `STOPPING → STOPPED`, otherwise `COMPLETED` or `FAILED` |
| `reconcile` | closes runs whose tab went away |

`STOPPING` exists as its own state deliberately. An item already in flight is
allowed to finish, because killing a request halfway leaves a half-written
answer nothing can tell from a whole one. That is why the UI can honestly say
**"Stopping after the current one finishes..."**

**Run-scoped, never global.** Every action takes a run id. Stopping a site check
cannot touch a lead scan in another tab. Queued job cancellation is
`WHERE scanner_run_id = ?`, so it can only reach work that run created. There is
no kill switch.

**Not a second queue runtime.** The existing `jobs` table stays the only queue.
A run tags the jobs it creates via a new nullable `scanner_run_id`.

**Stop, not pause.** Pause/resume does not fit a client-driven loop without
redesigning it, and the brief was explicit that a reliable Stop matters more.
Start / Stop / Run again is what shipped.

---

## Scanner UI

`Stop` appears next to the working button, but only for the three workers that
walk a list (`score-all`, `draft-all`, `precheck`). Everything else in the Hive
is a single call, where a Stop button would be a button that does nothing.

Live line under the buttons:

| State | Copy |
|---|---|
| Running | `Scanning 18 of 50 · example.com` |
| Stopping | `Stopping after the current one finishes...` |
| Stopped | `Stopped. Everything already done was kept: 12 of 50.` |
| Finished | `Done: 41 green, 9 red.` |
| Abandoned | `This one was left running and has been closed. Anything completed was kept.` |

The wording lives in `lib/scanner-run.mjs` rather than in the component, so
"stopped" cannot drift into implying the work finished. A test asserts a stopped
run never says "finished all".

---

## Cancellation semantics

- [x] New items are prevented from starting the moment Stop is pressed
- [x] The in-flight item finishes and **its result is kept**
- [x] Queued jobs for that run are cancelled; running ones keep their claim
- [x] Completed results are never deleted or rolled back
- [x] Nothing is refunded for work that actually completed
- [x] Stop is idempotent from every state (`STOPPING`, `STOPPED`, `COMPLETED`,
      `FAILED`, `ABANDONED` are all no-ops that report the truth)
- [x] The state write is conditional on `state = RUNNING`, so two people
      pressing Stop cannot both think they were the one who did it
- [x] A stopped run can be started again through the normal button

**Permissions:** every action goes through `getWorkspace`, so only somebody who
can start a scanner can stop one, scoped to their own workspace.

---

## Stale run handling

A run whose heartbeat is older than **15 minutes** is treated as a tab that went
away, and is marked `ABANDONED`. Generous on purpose: a single site check can
take 90 seconds, and calling a slow run dead would be worse than leaving it.

Reconciliation runs when the Hive mounts, and on demand. **No history is
deleted**, no completed run is touched, and a `start` that finds a stale live run
for the same scanner closes it rather than refusing to begin.

⚠️ Runs created before this existed do not exist, so there is nothing stuck to
clean up. The mechanism is for the future.

---

## Tests added

**17 added, 980 passing.** All 18 required scenarios covered.

| # | Scenario | |
|---|---|---|
| 1 | pre-V2 draft excluded from V2 Ready for approval | ✅ |
| 2 | V2 package included (`/api/outreach` reads packages only) | ✅ |
| 3 | legacy draft visibly labelled | ✅ |
| 4 | dismissing does not alter stage, rating, reply state, DNC | ✅ |
| 5 | Redo cannot bypass Strong or eligibility | ✅ |
| 6 | regenerated package uses the canonical path | ✅ |
| 7 | Open Gmail is not primary in the V2 section | ✅ |
| 8 | RUNNING exposes Stop | ✅ |
| 9 | Stop prevents new work being claimed | ✅ |
| 10 | in-flight completed work preserved | ✅ |
| 11 | queued work does not continue after stop | ✅ |
| 12 | unrelated run continues (run-scoped by id) | ✅ |
| 13 | repeated Stop is idempotent | ✅ |
| 14 | STOPPING resolves to STOPPED, never COMPLETED | ✅ |
| 15 | stopped run can be started again | ✅ |
| 16 | completed results not deleted | ✅ |
| 17 | stopping does not alter send switches | ✅ |
| 18 | stopping does not change approval or sequence state | ✅ |

Two existing tests asserted the old mixing (`pending_draft` →
`READY_FOR_APPROVAL`) and were updated. That is the change, not a regression.

---

## ⚠️ Three real bugs found on the way

### 1. A timezone bug in the stale check

`Date.parse` reads a bare timestamp as **local** time, and D1 writes
`datetime('now')` as UTC with no zone marker. On a machine eight hours behind
UTC, every run would have looked eight hours stale the moment it started, and
been closed as abandoned immediately. Now uses the codebase's `parseUtc`. Caught
by a test, not by luck.

### 2. The migration runner, again

Last pass fixed two bugs in `scripts/migrate.mjs` and it still failed. A third:
the routing decision between `--command` (returns rows) and `--file` (returns a
summary) was made by **sniffing the SQL for a leading SELECT**, and the regex was
subtly wrong. So the ledger read went down the file path, wrangler answered with
a summary object, and the runner concluded exactly **one** migration had ever
been applied and the other 47 were pending. It then tried to replay `001`.

Fixed by deleting the guess: the caller now passes `rows: true`. Guessing intent
from a string is what caused it.

`node scripts/migrate.mjs --remote` now reports **48 applied, 0 pending, nothing
replayed** — the first time it has genuinely worked.

### 3. My own regex nearly corrupted JSON

While chasing the above I added ANSI stripping with a pattern that, written
carelessly, would have eaten real JSON. It is now anchored on the escape
character. Noted because it was one character from being a silent data bug.

---

## Production safety

- [x] `AUTO_SEND_FIRST` **OFF**
- [x] `AUTO_SEND_FOLLOWUPS` **OFF**
- [x] Stage B still shadow only
- [x] Scanner controls touch no send switch, no sequence state, no approval
      state, and never mark a prospect skipped. There is a test asserting the
      run vocabulary contains no such word
- [x] Migration 048 is additive: two columns and one table
- [x] No draft or history record deleted anywhere
- [x] No bulk regenerate, no Approve All
- [x] No Gmail change, no paid provider, no sourcing, no second queue runtime
- [x] No new AI call added; deciding a draft is legacy is a column check

---

## Deployment

| | |
|---|---|
| Migration | `048_scanner_runs_and_legacy.sql`, applied and verified |
| Ledger | **48 of 48 proven applied**, runner clean |
| Tests | 980 passing |
| Build | clean |
| Commit | recorded in the chat summary |

---

## What Ary should test

1. **Open Today.** "Ready for approval" should now hold only new-style packages,
   or say nothing is ready. Old drafts are a collapsed row at the bottom.
2. **Expand Old drafts and press "Redo it" on one.** It either prepares new
   outreach or tells you plainly why it cannot. Both answers are correct.
3. **Press "Put aside" on another.** It leaves the list. Open that prospect and
   check nothing else about them changed.
4. **Start Guard Bee scoring or the site checker, then press Stop.** It should
   say "Stopping after the current one finishes...", then stop, and report how
   many were done. Everything finished is kept.
5. **Press Stop twice.** Nothing bad happens.
6. **Start a scanner, reload the page mid-run.** The run is still there.
