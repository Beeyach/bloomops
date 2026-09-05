# Job 522, and Cynthia's package

Date: 2026-08-12 · commit `7e24432`

**There was no queue bug.** Job 522 was never stuck. It ran on its third
attempt at 05:35:26 and finished at 05:35:35, three and a half minutes after
the last time I looked at it. Package **16** exists for prospect 4860, written
by the production queue with no bypass and no hand-writing.

**Correction to the previous report.** It listed "job 522 is due and not being
claimed" as defect 4. That was wrong. The job was retrying normally the whole
time; every poll I ran happened to end just before a cron tick, and I reported
the gap between my observations as a property of the system. Defect 4 does not
exist and has been withdrawn.

---

## Part 1 — job 522, live

| Field | Value |
|---|---|
| id | 522 |
| kind | `prepare-outreach` |
| workspace | ary |
| prospect_id | 4860 |
| status | **done** |
| attempts / max | 3 / 3 |
| created_at | 2026-08-12 05:13:04 |
| updated_at | 2026-08-12 05:35:35 |
| claimed_at | 2026-08-12T05:35:26.948Z |
| run_after | 2026-08-12T05:25:36.455Z |
| last_error | null |
| error_kind | null |
| dedupe_key | `ary:prepare-outreach:4860:` |
| priority | 55 |
| payload | `{"prepared":true,"packageId":16,"playbook":"lead-capture-gap","pdf":"none","video":"none","flags":[],"terminal":true}` |

There is no lease, locked_by, dead-letter, shard or dependency column on this
table. `claimed_at` plus a staleness window is the whole lease mechanism.

## Part 2 — the claim predicate

From `claimNext` in `lib/queue.mjs`:

```sql
SELECT id FROM jobs
 WHERE (status = 'queued' OR (status = 'running' AND datetime(claimed_at) < datetime(?)))
   AND (run_after IS NULL OR run_after <= ?)
   AND workspace = ?
   AND kind NOT IN (?)          -- the drain excludes scanner-item only
 ORDER BY priority DESC, id ASC LIMIT 1
```

Evaluated against job 522 at the moment it was claimed:

| Claim condition | Required | Job 522 | Pass |
|---|---|---|---|
| status | `queued`, or `running` past the stale window | `queued` | pass |
| run_after | null or `<= now` | 05:25:36Z vs 05:35:26Z | pass |
| workspace | matches the drain's workspace | `ary` | pass |
| kind exclusion | not `scanner-item` | `prepare-outreach` | pass |
| attempts | not checked at claim time; the ceiling is applied on failure | 2 at claim | pass |
| dedupe_key | only enforced on insert, not on claim | unique | pass |
| priority ordering | highest first | 55 | pass |

**Job 522 was not claimed earlier because it was not yet due, and after it
became due it was claimed on the next cron tick.** Nothing evaluated false.

Timeline:

| Time (UTC) | Event |
|---|---|
| 05:13:04 | enqueued |
| 05:15 / 05:20 | attempts 1 and 2, both `parseFollowUp is not defined` |
| 05:20:36 | retry written, `run_after` 05:25:36 |
| ~05:27 | fix `7e24432` live in production |
| 05:29:58, 05:31:53 | my checks: still queued, and I called it stuck |
| **05:35:26** | claimed, attempt 3 |
| **05:35:35** | done, package 16 written |

The backoff after attempt 2 is five minutes and the cron ticks every five
minutes, so due-at-05:25:36 meant the 05:25 tick was too early and the next
real chance was 05:30 or 05:35. I stopped watching at 05:31:53.

## Part 3 — against a job that did run

`521`, `gmail-sync`, claimed and completed at 05:10:29, while 522 sat queued.

| Column | 521 | 522 (at 05:10) | Difference that mattered |
|---|---|---|---|
| status | queued | queued | none |
| kind | gmail-sync | prepare-outreach | none, neither is excluded |
| workspace | ary | ary | none |
| priority | — | 55 | none |
| **run_after** | **null** | **05:25:36Z** | **this one** |

The only claim-relevant difference was `run_after`. 521 had none and was taken
immediately; 522 had a backoff that had not expired.

## Part 4 — failure class

**G. OBSERVABILITY ONLY.**

The job was being retried correctly. What was missing was a way to see that
from outside, so a job in backoff and a job that is genuinely stuck look
identical in the row: both read `status = queued` with an old `last_error`.

Not A: the state was correct. Not B: the backoff was consistent with the claim
logic and worked. Not C: the ceiling was not reached until the successful
attempt. Not D: the dedupe key is only enforced on insert. Not E: the selector
handled this kind normally. Not F: `prepare-outreach` has no extra claim guard.

## Part 5 — scope

- jobs currently `queued`: **0**
- jobs stuck behind an unexpired backoff: **0**
- prospect packages blocked: **0**
- follow-up or automatic jobs affected: **none**

The queue is empty and healthy. Nothing was systemic, so nothing needed a
central fix.

## Part 6 — fix

**No code changed.** There was no defect to fix in the queue, and relaxing
eligibility to make a correctly-backed-off job claimable sooner would be
breaking working behaviour to satisfy a misreading.

The one real bug in this chapter, `parseFollowUp` never being imported, was
already fixed in `7e24432` before this task. Job 522's third attempt is that
fix working in production, which is the behavioural proof the previous report
could not yet show.

## Part 7 — regression tests

None added. The failure class was observability, not behaviour, and the
behaviour the brief asks to pin is already covered:

- the missing-import defect is guarded by `tests/missing-imports.test.mjs`,
  verified by reverting the fix and watching it fail
- retry, backoff, attempt ceiling and single-claim behaviour are the paths job
  522 exercised in production across three attempts

Suite unchanged at **1,839 passing**.

## Part 8 — deployment

Nothing to deploy. Production is on `7e24432`, which is the build that ran
attempt 3. The queue claimed the job naturally; no worker was invoked by hand
and the package writer was never called directly.

## Part 9 — package state

| | |
|---|---|
| Prospect | 4860, Cynthia A. Criss, LPC |
| Package id | **16**, version 1 |
| Produced by | job 522, `prepare-outreach` |
| Status | **READY_FOR_APPROVAL** (unapproved) |
| `approved_fingerprint` | **null** — none fabricated |
| `sequence_approved` | 0 |
| `allowed_length` | null before approval, by design: the approval route writes `recon.finalLength` from the band at the moment Ary approves |
| Playbook | `lead-capture-gap` |
| Why contact | Contact page has no form |
| Evidence level | strong |
| Contact | `cynthia.criss@openheartsopenmindscounseling.com` |
| Model | `claude-sonnet-5` |
| Packages for 4860 | exactly **1** |
| `emails_sent` | **0** |
| send_events | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

Evidence stored on the package:

```json
{"tier":"verified","text":"Contact page has no form",
 "source":"https://www.openheartsopenmindscounseling.com",
 "observedAt":"2026-08-12T05:06:51.079Z","confidence":"high",
 "method":"browser check, precheck","key":"contact-page-no-form"}
```

## Part 10 — the copy

### Email 1

**Subject:** `quick question about your contact page`

**Body:**

> Hi Cynthia.
>
> I looked at your contact page and noticed there is no form on it, just what
> looks like a way to email you directly. That caught my attention because for
> a lot of practices, that is the only spot where someone actually reaches out.
> One thing I could not tell from the outside is what happens after someone
> sends that email. If you already have a clear process for catching and
> responding to those, then this is not something you need to think about. What
> happens to an enquiry once somebody sends it to you?

### Email 2

**Does not exist.** This is not a failure of the job; it is how the app is
built. `prepare-outreach` writes the first email only. Follow-up copy comes
from the V2 generator in a `prepare-followup` job, and `nextFollowupStep` does
not owe a step until the first email has actually been sent. The package's
`followups` column is null.

`reconcileForApproval` is explicit that this is approvable as it stands: *"A
band is a CEILING, not a quota, so a short package is approvable."* Approving
the first email and approving the sequence are separate consents, and silence
on the second means no. So Ary can approve Email 1 today; approving a two-touch
sequence would need Email 2 to exist first, because the code deliberately
refuses to generate copy after approval.

### Safety and correctness check on Email 1

| Check | Result |
|---|---|
| Reason matches the verified contact-page gap | pass |
| No unsupported calendar or booking claim | pass |
| No invented pain | pass. It says outright what it could not tell from outside, and offers her the exit: "If you already have a clear process ... this is not something you need to think about" |
| No visual claim | pass |
| No fake urgency | pass |
| No generic agency language | pass |
| **Concrete micro-offer CTA** | ⚠️ **no.** The CTA is a question, not an offer. Compare the earlier package: "Want me to send you a short rundown of what I would change about the order?" |
| **Signature `Thanks,` / `Ary`** | ⚠️ **missing.** The body ends on the question. Other real packages in this database carry the sign-off in the body, so it is not appended at send time |

Neither deviation is an evidence or capability violation, which is the stated
trigger for marking a package stale, so the package was left alone and not
rewritten by hand. Both are ordinary editorial calls, and the approval route
accepts an edited subject and body, so they are Ary's to make in review.

## Separate backlog, recorded and not chased

1. `hasCalendar` can false-positive on CSS icon classes such as `icon-calendar-plus-o`
2. `clientsecure.me` is missing from the scheduling-host list
3. `contact-page-no-form` can ignore a working off-site enquiry or appointment path
4. the production debug passthrough should be access-restricted if it is not already
5. a job in backoff is indistinguishable from a stuck job in the row, which is what caused the false alarm above

## Safety

Zero outbound emails. Zero prospect contact. No approval, no auto-approval, no
auto-send, no cohort. No manual package-writing bypass and no direct call to
the writer. Exactly one package for 4860, no duplicates. No unrelated queue row
mutated. `emails_sent` 0, send_events 0. Both switches **OFF**.
