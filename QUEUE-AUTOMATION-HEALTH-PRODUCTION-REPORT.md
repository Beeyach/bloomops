# System health — queue and automation

A page that answers one question Today never could: **is any of this actually
running?**

| | |
|---|---|
| Production commit | **`f21732f`** |
| Route | `#health`, labelled **System health** |
| Endpoint | `GET /api/system-health`, read-only |
| Tests | **1153 passing, 0 failing** |
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |
| Emails sent | **none** |
| Paid runs started | **none** |

---

## Before

Today answers *"what needs me"*. Nothing answered *"is the machine behind Today
still running"*, and from the outside those look identical: a quiet Today means
everything is fine, or it means nothing has run since Tuesday. There was no way
to tell without opening the database.

What existed: **Automation stopped** on Today (a per-prospect exception queue),
the **Held** bucket, the **Hive** with its own live progress, and the credits
badge. Each answers part of a question about one prospect or one run. None of
them answers whether the queue is moving, whether the cron fired, or whether the
mailbox has been read this hour.

This page does not replace any of those. It counts and links; the exception
queue on Today remains the one place work is claimed and cleared.

---

## Telemetry audit

Done against production before a line of the page was designed.

### Reliable, and used

| Signal | Source | Evidence it is real |
|---|---|---|
| Queue depth by state | `jobs.status` | 242 rows, live and retained |
| Job kind breakdown | `jobs.kind` | grouped, capped at 30 |
| Failed jobs and their errors | `jobs.status='failed'`, `last_error`, `error_kind` | 2 live, both `transient` |
| Stuck work | `jobs.claimed_at` vs `CLAIM_TTL_MINUTES` | the same 15 minutes the runner reclaims on |
| Waiting on budget | `jobs.error_kind='budget'` | 1 live |
| Waiting on a person | `jobs.error_kind='human'` | 4 live, the ambiguous vets |
| Jobs finished today | `jobs.status='done'` + `updated_at` | **jobs are retained**, so this is countable: 94 today |
| Daily automatic allowance | `auto_spend` by day + `autoCreditsPerDay` | 160 of 160 used today |
| Credit balance and spend | `settings.credits`, `credit_events` | workspace level only |
| Hive run state | `scanner_runs.state`, `heartbeat_at` | 1 run, `RUNNING`, heartbeat 9 hours old |
| Mailbox sync | `gmail_accounts.last_sync_at` | 16 minutes old at the time of writing |
| Website checker | `MAX(prospects.site_intel_at)` | proves a real check wrote a real result |
| Contact backlog | aggregate `COUNT(*)` over `contact_state` | 4,130 |

### Incomplete, and deliberately not shown

**Per-prospect credit spend.** Measured during the prospect-detail pass and
re-checked here: **12 of 153 credit events carry a `prospect_id`**, and only 240
of 1,300 credits were attributable. Batch scans and model calls charge without
one. A per-prospect figure would read 0 on almost every record. The page says
credits are workspace totals and explains why, rather than dividing an
unreliable number.

### Unavailable, and not faked

| Wanted | Why it is not there |
|---|---|
| A dedicated cron heartbeat | Nothing records "the cron fired". The closest honest proxies are the last job state change and the last mailbox read, and the page labels them as exactly that rather than as a cron |
| Render service health | `RENDER_URL` responds only to a secret this page must not hold. The last successful site check is used instead, and is described as what it is |
| Job history beyond the current table | Not retained past what is in `jobs`. No trend, no chart |
| Per-run Hive cost | Not stored against a run |

**No service is called healthy because an environment variable exists, a token
is stored, or a route returns 200.** Where there is no heartbeat, the row reads
**Not measured**.

---

## Health model

`lib/system-health.mjs`. Pure, mutates nothing, imports the canonical constants
rather than restating them: `CLAIM_TTL_MINUTES` from the queue,
`HEARTBEAT_STALE_MINUTES` from the scanner.

Five states, in precedence order:

| | when | why it outranks the next |
|---|---|---|
| `DEGRADED` | a service is provably down | the failed jobs below may be symptoms of it |
| `ATTENTION` | something could not finish | "it is busy" is not an answer to "something broke" |
| `HEALTHY` | work is in flight | |
| `WAITING` | paused on budget, a queue turn, or a person | |
| `IDLE` | nothing to do | |

**No score, no percentage, no gauge.** A 97/100 is invented, and it makes people
ask what the missing three is instead of reading the sentence that says what is
wrong. A test asserts no such field exists.

The distinction the whole design rests on:

- **Waiting for budget is a pause, not a rejection.** Said in the model and
  again on the page next to the number.
- **A prospect with no address is pipeline inventory**, not a fault.
- **A scanner somebody stopped is not a failure.** One whose heartbeat died is.
- **An empty queue is allowed to be perfectly healthy.**
- **A quiet mailbox is not a broken mailbox.** Only a stored reconnect flag says
  down; silence says quiet.

---

## What the page shows, in order

1. **The answer** — one headline, one sentence
2. **Right now** — running, queued, waiting for budget, waiting on you. Zeroes are not rendered
3. **Needs attention** — only failures and stuck work
4. **Today's work** — six counts
5. **Budget and credits** — kept apart
6. **Contact recovery** — counts, and a link
7. **Hive** — one line
8. **Background services** — each with its evidence
9. **Technical details** — collapsed

---

## Needs attention

Only two things qualify: a job that **failed**, and a job whose **claim expired**.
A job waiting on budget or on a person has not failed at anything and is not in a
list headed by the word attention.

Each item says what happened, who it affects, and that nothing was sent or lost.
Raw errors go through the existing `friendlyError()` translation, and the raw
text sits behind **Technical details**.

**Retry reuses `POST /api/jobs/retry`**, the app's existing per-prospect path,
with every guard, budget check and dedupe intact. It is offered only where the
canonical translation says the failure is retryable and there is a prospect to
retry. **There is deliberately no retry-everything**: a button that replays two
hundred failures spends two hundred credits by accident.

---

## Today's work, and exactly how it is counted

| Metric | Rule |
|---|---|
| websites checked | prospects whose `site_intel_at` is today |
| contact searches | prospects whose `contact_searched_at` is today |
| addresses found | as above, where the result was `FOUND` |
| drafts prepared | packages created today |
| vet decisions | `outcome_events` of kind `vet` today |
| jobs finished | `jobs` done today |

**Counted per prospect, not per job.** A job that ran twice on one business is
one website checked; counting job rows would make a retry look like progress.
The one operations count is labelled *jobs finished* so it cannot be mistaken
for unique prospects.

**Deleted rows are excluded** from every prospect count, which matters this week:
the three Gmail acceptance test prospects are soft-deleted and would otherwise
appear in throughput.

---

## Budget and credits, kept apart

Three different things get called money here and only one is a balance:

- the **daily automatic allowance**, which bounds what the unattended sweep may spend
- the **credit balance**, which is what the workspace has
- a **hand-run check**, which spends the balance and does not touch the allowance

They are never added into one bar. A test asserts they are not summed.

---

## Services, and the signal behind each claim

| Service | State proved by |
|---|---|
| Queue worker | the last time any job changed state. Nothing else can move a job |
| Mailbox sync | the last time the mailbox was actually read. A stored token proves consent, not health |
| Website checker | the last time a site was read and written back to a prospect |

A service with no timestamp is **UNKNOWN**, never OK. A test asserts that
`process.env`, `RENDER_SECRET` and `refresh_token` appear nowhere in the
endpoint, because none of them is evidence of anything working.

---

## API and performance

`GET /api/system-health`, workspace-scoped, **read-only by construction**: no
`INSERT`, `UPDATE`, `DELETE`, `enqueue`, send or spend appears in it, and there
is no `POST` handler. A test strips comments and checks.

Roughly ten queries, every one an aggregate or capped:

- the queue is a single `SUM(CASE WHEN …)` row, not nine counts
- the attention list has `LIMIT ?` in the query and is capped at **25**, with a
  flag saying when it truncated
- prospect names for attention rows are one `IN (…)` query, never one per row
- the 4,130-strong contact backlog is `COUNT(*)`. **Loading it to count it would
  make the cheapest page in the app the most expensive**

Refresh is **45 seconds**, plus a manual button. No websockets, no sub-second
polling, no new infrastructure.

---

## Live production acceptance

Read from the live authenticated site.

### What it says right now

> **3 things could not finish.** Nothing was sent by mistake and no prospect data
> was lost. The rest of the work carried on.

| | |
|---|---|
| Running / queued | 0 / 0 |
| Waiting for budget | 1 |
| Waiting on you | 4 |
| Failed jobs | 2, both website checks that timed out or would not resolve |
| Abandoned Hive run | 1 |

⚠️ **The page found a real problem on its first load.** A `precheck` run was
started on **5,484 prospects**, got through **70**, and its heartbeat stopped
**9 hours ago**. The run row still says `RUNNING`; nothing else in the app would
have said otherwise. Everything it finished was kept, and the page says so.

### Today's throughput, reconciled against source queries

| | |
|---|---|
| websites checked | 80 |
| contact searches | 1 |
| drafts prepared | 5 |
| vet decisions | 35 |
| jobs finished | 94 |

### Budget and credits

160 of 160 of the automatic allowance used, resetting midnight UTC, 1 job
waiting on it. Balance 498,460, 2,220 spent today.

### Services

| | |
|---|---|
| Queue worker | Working, 17 minutes ago |
| Mailbox sync | Working, 17 minutes ago |
| Website checker | Working, 9 hours ago |

### Checks passed

| | |
|---|---|
| Budget waiting styled as a pause, not a failure | ✅ |
| Contact backlog not counted as unhealthy | ✅ 4,130 shown as inventory |
| Failed work visible without a stack trace | ✅ friendly titles, raw text collapsed |
| Hive truth shown without starting a run | ✅ |
| Refresh works | ✅ |
| Desktop overflow | ✅ none at 1280px |
| Mobile overflow | ✅ none at 402px, **including with all four technical-details blocks expanded**, which was the biggest layout risk |
| Start here still works | ✅ |
| Prospect detail still works | ✅ |
| Today still works | ✅ |
| `Send now` still in the served build | ✅ |
| Both switches | ✅ OFF |

### Two defects found by looking, and fixed

Both were invisible in tests and obvious against real data:

1. The abandoned Hive run had no title of its own, so it fell through to the
   generic one and rendered **"It could not finish"** above a sentence about a
   scanner. Two problems stacked on one card.
2. The credit balance rendered as **`498460`**. On a page whose entire job is
   being glanced at, that is a number somebody has to count digits on. Grouped
   now, along with every other count. The budget line also read *"160 of 160 of
   today's automatic allowance used"*.

### ⚠️ On deployment verification, for the third time

The deployment list reported the new commit while the edge was still serving the
previous build. It has now done this on every deploy this session.

**The only check that works is content.** Both times it was caught by fetching
the served page chunk and grepping it for a string only the new build contains,
and both times the status column would have let a false "deployed" through.

### ⚠️ On screenshots

**None taken.** The browser pane is not displayed in this session, so it
composites no frames and every screenshot attempt times out. Everything above
was read from rendered text, the accessibility tree and computed geometry.
That covers content, structure and overflow. **It is not a visual review** and
does not rule out a colour or spacing defect.

---

## Tests

**1153 passing, 0 failing.** 29 added in `tests/system-health.test.mjs`,
covering all 35 required points, including:

- budget waiting is `WAITING` and never `ATTENTION` or `DEGRADED`
- an empty queue is `IDLE`, not broken
- a failed job outranks work in flight
- the stale-claim rule equals `CLAIM_TTL_MINUTES` and no magic number appears in the model
- an abandoned scanner is attention; one stopped by a person is not
- a service without telemetry is `UNKNOWN`, never OK
- a quiet mailbox is `STALE`, never `DOWN`
- no health score field exists
- the attention list is bounded in the query, not just the response
- retry only where the canonical path allows it, and no bulk retry
- throughput excludes deleted rows and counts prospects rather than jobs
- credits never claim per-prospect attribution
- the contact backlog is counted, not loaded
- refresh is ≥ 30 seconds
- no model call, no send, no approval or queue-engine change

---

## Safety

| | |
|---|---|
| Emails sent | **none** |
| Scanner runs started | **none** |
| Gmail, send, approval, sequence behaviour | **untouched** |
| Qualification, evidence, Strong, Vet, priority, contact ownership | **untouched** |
| Send windows, caps, credit prices, budget rules, migrations | **untouched** |
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

Tests assert the send guard, send runner, approval and queue modules do not
import the health module, and that the health surface contains no path to
`/api/outreach`, the scanner, or a paid check.

---

## Remaining observability gaps

Honest list of what this page still cannot tell you:

1. **No true cron heartbeat.** If the cron stops, the page shows the queue worker
   going quiet, which is a symptom rather than the cause. A single row stamped
   on every cron invocation would fix it.
2. **No render-service health.** Only the last successful site check, which is
   a lagging indicator and goes quiet whenever there is simply no work.
3. **No history.** Everything is a snapshot. There is no way to see that the
   queue was stuck for six hours overnight and recovered.
4. **Per-prospect cost is still unattributable.** The fix is to pass a prospect
   id at the point of spend, which is a backend change and was out of scope here.
5. **The abandoned Hive run is reported but not repairable from this page.** No
   control was added to mark it abandoned or resume it, because that would be
   changing scanner behaviour.
