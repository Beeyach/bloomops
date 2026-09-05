# A job that succeeds on the third try remembers the first two

Date: 2026-08-12 · commit `5c7b2ea` · migration `055_job_events.sql` · tests 1,994 passing

Job 522 failed twice with `parseFollowUp is not defined` and worked on attempt
three. Afterwards the row read `status=done`, `last_error=null`: the right
answer to what is true now, and no answer at all to what happened. Diagnosing it
meant reading a transcript rather than the database.

**Spend: 0 credits. Queue execution semantics unchanged.**

---

## Part 1 — the write paths, and where history went

Every transition, from `lib/queue.mjs`:

| Path | Writes | Effect on history |
|---|---|---|
| `enqueue` | inserts the row | — |
| `claimNext` | `status=running`, `claimed_at`, `attempts + 1` | — |
| `complete` | `status=done`, **`last_error = NULL`**, `error_kind = NULL` | **erases it** |
| `fail` transient | `status=queued`, `last_error`, `run_after` | **overwrites the previous one** |
| `fail` permanent / attempts exhausted | `status=failed`, `last_error` | keeps only the last |
| `fail` budget | `status=waiting`, `attempts − 1`, `run_after` +6h | overwrites |
| `fail` human | `status=waiting`, `run_after = NULL` | overwrites |
| `release` | `status=queued`, `attempts − 1`, `claimed_at = NULL` | — |
| `wakeBudgetWaiters` | `status=queued`, `run_after = NULL` | — |
| stale reclaim | handled inside `claimNext` by the lease window | — |

> **A successful attempt erased recoverable failure history because
> `complete()` sets `last_error = NULL` and `error_kind = NULL` on the jobs row,
> and no durable attempt or event record existed anywhere. Each `fail()` also
> overwrote the previous `last_error`, so even mid-flight only the most recent
> failure had ever existed.**

Two losses, not one. The second is the worse of the two: a job that failed three
different ways never recorded the first two, whether or not it later succeeded.

## Part 2 — what already existed

| Table | Shape | Suitable? |
|---|---|---|
| `outcome_events` | workspace, prospect_id, kind, value, context | **No.** Prospect-shaped: no job id, no attempt number. Its stated purpose is "what did we know about this prospect when we decided", and half the jobs in this queue — `gmail-sync`, `signals`, `scanner-item` — have no prospect at all |
| `send_events` | sends only | No, and the brief rules it out |
| `credit_events` | ledger entries | No |
| `reply_events`, `relationship_events` | prospect conversation state | No |
| `send_shadow_log` | a rehearsal of the send guard | No |
| `activity_log` on `prospects` | human-readable notes | No — written for people, and prospect-scoped |

Nothing existing carried a job id or an attempt number. Overloading
`outcome_events` would have put two unrelated meanings in one table, so a new
one was added rather than bent.

## Part 3 — the model

**Option B, append-only transition events.** One row per material transition:
`claimed`, `succeeded`, `retry_scheduled`, `terminal_failed`,
`waiting_on_human`, `waiting_on_budget`, `released`, `cancelled`.

Chosen over one-row-per-attempt because the runner already performs discrete
transitions, each in a single function. A row is appended exactly where the
state change is already written, so there is nothing to keep in step. The
per-attempt model needs a second write to close the row, and would drift the
first time a path forgot to — a lease that expires and is reclaimed never
returns to close anything.

### Stored

`workspace`, `job_id`, `kind`, `attempt`, `event`, `error_kind`, sanitized
`error`, the exact `run_after` written for retries, `occurred_at`.

### Not stored

The job payload. No API keys, bearer tokens, cookies, authorization headers,
render secrets, Gmail or OAuth tokens, or sealed credentials — see sanitization
below, and a test asserts a payload containing a key never reaches a row.

## Part 4 — atomicity

D1 runs `db.batch()` atomically, and the project already relies on that in the
prospect import. Each transition now writes the job update and its history event
in one batch, so the row and its story cannot disagree because one landed and
the other did not.

A handle without `batch` falls back to writing the state change first and the
event after. The job row is what matters; a lost history row shows as a gap,
whereas a lost state change would be a wrong job. That path is tested.

`claimed` is the exception: it is written after the claim, because the claim is
a conditional update that can lose the race, and a history row for an attempt
that never started would be a lie.

## Part 5 — idempotency

A unique index on `(job_id, attempt, event)`, with `INSERT OR IGNORE`.

A transition replayed for the same job, attempt and event writes nothing the
second time. **Two attempts that failed with identical messages remain two
rows**, because their attempt numbers differ — tested explicitly, since that is
exactly job 522's shape.

One honest wrinkle: a budget wait decrements `attempts`, so repeated budget
waits can land on the same attempt number and dedupe into one row. The rows
would be identical in content, and treating them as one transition is defensible
— but it is a real consequence of the key and is written down rather than
discovered later.

## Part 6 — sanitization

No canonical sanitizer existed. `friendlyError` rewrites failures for humans and
is not a redactor, so `sanitizeError` was added in `lib/job-events.mjs`.

Deliberately narrow. The whole point of keeping history is reading
`parseFollowUp is not defined` three weeks later, so it targets the shapes
secrets actually arrive in rather than anything that looks technical:

- `Bearer …`, `Authorization: …`
- any `…key=`, `…secret=`, `…token=`, `password=`, `cookie=`, `credential=`
- Google OAuth access and refresh tokens
- this project's `enc:v1:` sealed prefix
- `?token=`, `?access_token=`, `?sig=` in a URL
- any unbroken 40-character-plus blob, labelled or not

Then flattened to one line and capped at 300 characters: a stack trace belongs
in the logs, not in a row somebody scans.

Tested both ways — six credential shapes removed, four real error messages
preserved byte for byte.

## Part 7 — current state stays clean

`complete()` still clears `last_error`. That is correct: a job that failed twice
and then worked is a job that worked, and the health page must not show it as
unhealthy. The derived queue states from the previous task are untouched, and an
old historical failure does not change what `queueStateOf` returns.

The row answers *what is true now*. The events answer *what happened*.

## Part 8 — operator UI

The smallest thing that helps, on the surface that already lists these jobs. No
new dashboard.

Each entry in the health page's attention list now carries its attempt history,
behind a disclosure that only appears when there is more than one attempt to
explain:

```
3 attempts
  Attempt 1 — failed; retry scheduled for 05:20 — parseFollowUp is not defined
  Attempt 2 — failed; retry scheduled for 05:25 — parseFollowUp is not defined
  Attempt 3 — completed
```

A job that worked first time shows nothing. Raw payloads are not exposed;
the errors shown were sanitized when they were written.

## Part 9 — job 522

**Job 522 cannot be fully reconstructed from canonical persisted data.**

Its row survives and is not mutated: `status=done`, `attempts=3`,
`run_after=2026-08-12T05:25:36.455Z`, `claimed_at=2026-08-12T05:35:26.948Z`,
`last_error=null`. The two failure messages are gone from the database. They are
known only from a session transcript, which is not an authoritative source, so
**no history rows were fabricated for it**. Its transition shape is used as the
test fixture instead, proving that an equivalent future fail/fail/succeed job
retains everything.

## Part 10 — retention and indexing

- forward migration `055_job_events.sql`, applied to production
- unique index on `(job_id, attempt, event)` for deduplication
- index on `(job_id, id)` for reading one job in order
- index on `(workspace, occurred_at)` for recent activity
- the health page loads history only for the jobs already on screen, so nothing
  added scans the table
- **no cleanup added.** History that disappears on a schedule nobody remembers
  is the same problem in slower motion

## Part 11 — tests

`tests/job-events.test.mjs`, 18 behavioural tests through the real `complete`,
`fail` and `release` against a fake D1 handle that honours prepared statements,
bound parameters, an atomic batch, and the unique index:

- **fail, fail, succeed keeps both failures after `last_error` clears** — job
  522's exact shape
- two attempts with the same error stay two facts
- the same transition replayed writes one row
- a first-attempt success still leaves a record
- a retry stores the exact `run_after` the row was given, not a recomputed one
- terminal failure, waiting-on-human, waiting-on-budget and release are each
  distinguishable
- the update and the event go in one batch; a handle without batch still writes
  the state change
- four real error messages survive sanitization unchanged
- six credential shapes are removed while the sentence still reads
- a payload containing a key never reaches a row
- a summary reads one line per attempt in order; a first-try success shows
  nothing

Suite: **1,994 passing**, up from 1,976. `next build` clean.

## Part 12 — production acceptance

| | |
|---|---|
| Migration applied | yes, 33 tables |
| Existing queue reads and writes | unchanged, suite green |
| Pages deploy | `5c7b2ea`, confirmed live |
| Cloud Run | not touched |

**No production failure was manufactured.** Deliberately: the only way to
produce a live fail/retry/succeed sequence would be to break a real prospecting
job, and there is no no-op job kind to use instead. The behavioural tests cover
that path against the real transition functions.

### The first live rows

Written by the next naturally scheduled job. Nothing was enqueued to force it:

```json
{"job_id":557,"kind":"gmail-sync","attempt":1,"event":"claimed",   "occurred_at":"2026-08-12 16:25:27"}
{"job_id":557,"kind":"gmail-sync","attempt":1,"event":"succeeded","occurred_at":"2026-08-12 16:25:29"}
```

And the job row agrees: `status=done`, `attempts=1`, `last_error=null`. Clean
current state, and the history beside it.

Three earlier watchers reported nothing and one reported a false positive. The
false positive was a shell loop matching on a string, which read an expired D1
token as a discovery; the empty ones were sized by iteration count on the
assumption that a query took about a second, when it takes about 130ms, so each
expired within two or three minutes. The queue was idle throughout and no job
had run on the new code, so nothing was ever wrong with the write path — but
three of those four results were an artefact of how they were measured rather
than of what was there.

## Part 13 — the historical boundary

Read-only audit of all 539 jobs:

| | |
|---|---|
| Completed with more than one attempt | **5** — ids 54, 127, 128, 204, 522 |
| Currently terminal failed | 12, all of which still carry their `last_error` |
| Jobs whose retry history is irrecoverable | **5** |
| Secondary source that could reconstruct them authoritatively | **none** |

The 12 terminal failures kept their last error because nothing clears it on that
path. The five completed-with-retries lost theirs to `complete()`. Nothing was
invented for any of them.

> **Queue attempt history is canonical from 2026-08-12 16:00:10 UTC forward**,
> the moment migration `055_job_events.sql` was applied to production. Anything
> before that boundary has only whatever survives on the job row itself.

## Safety

| | |
|---|---|
| Queue execution semantics changed | **none** — no retry, backoff, claim or cadence change |
| Jobs retried, repaired, deleted or deliberately failed | 0 |
| History fabricated for old jobs | 0 |
| Emails sent | 0 |
| `send_events` | unchanged |
| Package 19 | untouched |
| Cynthia | not mutated, refreshed, approved or sent |
| Packages created or approved | 0 |
| Contacts adopted | 0 |
| Prospect refreshes | 0 |
| Credits | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |
