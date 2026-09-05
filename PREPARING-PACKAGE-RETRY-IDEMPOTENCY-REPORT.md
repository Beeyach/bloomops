# A half-written package blocked its own repair

Date: 2026-08-13 · commit `e5ecf8f` · Pages `8e4050f9` · tests 2,133 passing

The preparation handler deliberately lets a retry through to finish an
incomplete package. The write it came back to do was then refused by the
database.

**0 emails sent. 0 credits. Package 23 untouched. Both switches OFF.**

---

## Part 1 — the failure path

| Step | What happens |
|---|---|
| `PREPARE_OUTREACH` | loads the prospect |
| existing-package lookup | filters on `ACTIONABLE_STATUSES` = `READY_FOR_APPROVAL`, `NEEDS_DECISION`, `APPROVED` |
| `PREPARING` | **deliberately excluded**, with a comment saying so, "precisely so the retry can finish the job" |
| P2 completion check | Email 2 missing → `write(STATUS.PREPARING, …)` then `throw`, so the queue retries |
| `savePackage` | **always INSERT**, `version = MAX(version) + 1` |
| `idx_pkg_live` | `UNIQUE ON (workspace, prospect_id) WHERE status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')` |

> **A retry collides because the `PREPARE_OUTREACH` handler's existing-package
> lookup ignores the `PREPARING` row — by design, so the retry may proceed —
> while `savePackage` always INSERTs a new live package, and `idx_pkg_live`
> allows only one.**

The handler opens the door and the write path walks into a wall.

### Package 22, reconstructed from canonical data

```
00:41  attempt 1  rejected: claims an outcome the evidence does not support: "booking faster"
00:45  attempt 2  package 22 INSERTed, version 2, status PREPARING
                  email_body 618 bytes, followups NULL
                  last_error: "Email 2 could not be written, so the P2 package is not complete."
00:55  attempt 3  D1_ERROR: UNIQUE constraint failed:
                  outreach_packages.workspace, outreach_packages.prospect_id
                  job 589 -> failed
```

Package 22 held Email 1 and no Email 2, occupied the single live slot, and every
retry that existed to fill it was refused by the index. The operator cleared the
row by hand. **That workaround is not the fix and has not been kept.**

## Part 2–3 — the retry contract, and how ownership is proven

| Live slot holds | Behaviour |
|---|---|
| nothing | INSERT one `PREPARING` package, next version |
| `PREPARING` | **resume it** — same id, same version |
| `READY_FOR_APPROVAL` / `NEEDS_DECISION` | never overwritten, never duplicated; returns that package |
| `APPROVED` | same — an explicit reprepare retires it first, which frees the slot |
| `SENT` | not a live status, so a fresh preparation is honestly a new version |

**No new identity column was added, and none is needed.** `idx_pkg_live` already
guarantees at most one live package per prospect, so "the `PREPARING` row for
this prospect" is unambiguous *by construction*. Two distinct explicit
preparations cannot both be live — the database forbids it — so prospect id plus
`PREPARING` is a proof, not a guess. No timestamp proximity, no heuristics.

## Part 4 — partial package semantics

An incomplete package stays `PREPARING`, which is not in `ACTIONABLE_STATUSES`,
so nothing can approve or send it. `sequence_approved` 0, `sequence_max_step`
null, `auto_followup_approved` 0, no fingerprint.

The resume writes **every column**, not the changed ones. A package must never
hold Email 1 from one attempt and Email 2 from another: each was written against
whatever the rules were at the time, and a row stitched from both is a package
nobody generated. `PACKAGE_COLUMNS` and `packageValues()` are shared by the
insert and the resume so the two cannot drift into writing different shapes.

## Part 5 — version semantics

| | |
|---|---|
| retry of the same incomplete preparation | **same id, same version, no increment, no gap** |
| explicit reprepare after a completed package | new version |
| retired rows | preserved |

Packages 20 (v1), 22 (v2) and 23 (v3) keep their history exactly as it happened.
That sequence is the regression, and rewriting it would erase the evidence.

## Part 6 — atomicity

`READY_FOR_APPROVAL` is still only written once every required piece validates.
The partial path writes `PREPARING` and throws; nothing reaches an approvable
status on one valid message, and no fingerprint exists before approval.

## Part 8 — concurrency

Two protections, and the index remains the last word.

The resume is a **conditional update**: `WHERE id = ? AND workspace = ? AND
status = 'PREPARING'`. A worker whose lease expired, whose job was reclaimed and
finished by a newer run, matches nothing and writes nothing — proven by a test
that approves the package underneath the stale worker and checks the approved
words survive.

Two workers racing to create the *first* package both find the slot empty and
both write. One wins; the loser's `UNIQUE` error is caught, the winning row is
re-read, and its id returned. A lost race is not a crash.

### Two cases the first version of this fix still got wrong

Both found by the tests, not by reading:

1. A live package that is **not** ours to resume still blocks an insert. The
   first version checked only for `PREPARING` and fell through to INSERT for
   anything else, producing a raw `UNIQUE constraint failed` instead of a
   decision.
2. The create-create race threw rather than answering.

Fixed by asking one question — what holds the live slot — instead of two.

## Part 9 — retry exhaustion

After the attempts run out the package stays `PREPARING`: non-actionable, no
approval path, no send path. **Recovery needs no SQL.** A later
`PREPARE_OUTREACH` resumes the same row and completes it, which is exactly the
step that used to require hand-clearing. Tested.

## Part 11 — tests

`tests/preparing-retry.test.mjs`, 12 behavioural tests against a **real SQLite
database carrying the real `idx_pkg_live`**, so the collision is reproduced
rather than described:

1. no package → one `PREPARING` row, version 1
2. Email 1 written, Email 2 refused, retry resumes — **one row, same id, same version, no collision**
3. the resumed row is regenerated whole, never stitched from two attempts
4. a completed retry is approvable-shaped and nothing more — no fingerprint, `sequence_approved` 0, `auto_followup_approved` 0
5. an `APPROVED` package is never resumed and never duplicated
6. a `SENT` package is never resumed, and a fresh preparation versions past it
7. explicit reprepare after a completed package → new version, history preserved
8. two executions racing cannot create two live packages
9. a stale worker cannot clobber a package that has moved on
10. retry exhaustion leaves it non-actionable, and a later run recovers it without SQL
11. P1 and P3 preparations are unaffected
12. **`idx_pkg_live` was not loosened** — the index is re-read and asserted

Suite: **2,133 passing**, up from 2,121. `next build` clean.

## Part 10 + 12 — production acceptance

Package 23, read-only before and after:

| | |
|---|---|
| status | `READY_FOR_APPROVAL` |
| version | 3 |
| P2, `allowed_length` 2 | ✅ |
| `sequence_approved` | **0** |
| `sequence_max_step` | **null** |
| `auto_followup_approved` | **0** |
| `approved_fingerprint` | **null** |
| `reviewed_at` | **null** |
| `updated_at` | `2026-08-13T01:00:38.133Z` — the regeneration, not this task |
| Email 1 / Email 2 | 523 / 269 bytes, unchanged |
| `emails_sent` | 0 |
| `send_events` for 3163 | **0** |

**Package 23 was never used as a mutation fixture.** Every test above runs
against an in-memory database.

Read-only scan of live rows:

| | |
|---|---|
| Rows currently stuck in `PREPARING` | **0** |
| Prospects with more than one live package | **0** |
| Rows silently repaired by me | **0** |

No natural failure exists to observe, so the behavioural tests carry the proof.
No real package was deliberately broken to manufacture one.

## Part 13 — sweep status

> **LIVE SWEEP ACCEPTANCE STILL PENDING**

Last sweep `2026-08-12 04:00:29 UTC`. Now `2026-08-13 01:13 UTC`. The next
natural one is `04:00 UTC` today. Not forced.

0 packages armed, 0 follow-up send jobs, `send_events` **10**.

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Package 23 approved or armed | **no** |
| Email 1 or Email 2 sent | **no** |
| Cynthia / package 19 | untouched |
| Contact changes | 0 |
| Site intel refreshed | 0 |
| Paid prechecks | 0 |
| Credits | **0** |
| `idx_pkg_live` loosened | **no** — asserted by test |
| Unrelated packages retired or repaired | **0** |
| `AUTO_SEND_FIRST` / `AUTO_SEND_FOLLOWUPS` | **false / false** |
