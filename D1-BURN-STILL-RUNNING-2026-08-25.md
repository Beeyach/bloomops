# The D1 burn did not stop

Checked 2026-08-25, ~22:55 UTC, against live production and live Cloudflare
analytics. Production is `6ccdbcf` / `LTB 2026.08.25`, confirmed via
`/api/version`.

## Headline

`rows_read_24h` is **8,363,148,477**. That is the same order the handoff
describes as the bug. Hourly analytics show a dead-flat ~350 million rows an
hour for the last 40 hours, including the hour after `6ccdbcf` went live.

The `/api/today` fix is real and did land. It was not the thing spending the
money.

```
hour (UTC)          rowsRead      readQ   per query
2026-08-25 19:00   350007095      348    1005768
2026-08-25 20:00   350069367      339    1032653
2026-08-25 21:00   350225644      418     837860
2026-08-25 22:00   320994899      312    1028830   <- fix live at 22:00:53Z
```

Flat around the clock is the signature of a timer, not of people using the
app. Human traffic has a day and a night.

## Where the money actually goes

From `wrangler d1 insights`, last 24h:

| # | Query | Rows read /day | Share | Runs | Avg ms |
|---|---|---|---|---|---|
| 1 | `refreshStaleConversations` unseeded-conversation seek | **8,672,101,680** | 87% | 349 | 15,176 |
| 2 | `reconcileProspectFacts` counter rebuild | **1,226,469,557** | 12% | 286 | 2,329 |
| | everything else combined | ~40,000,000 | <1% | | |

Those two are 99% of the spend. Both run on **every** `/api/cron/drain`
invocation, at [app/api/cron/drain/route.js:109](app/api/cron/drain/route.js)
and [:119](app/api/cron/drain/route.js). Drain fires roughly every four
minutes, so this repeats about 350 times a day and has done for days.

Query 1 also spends **88 minutes of database time per day** (5,296,255 ms
total, 15.2 seconds per run).

## Why query 1 costs 24.8 million rows to return 4

In [lib/conversation-store.mjs:154](lib/conversation-store.mjs):

```sql
SELECT r.workspace, r.prospect_id
  FROM reply_events r
  JOIN prospects p ON p.id = r.prospect_id AND p.workspace = r.workspace AND p.deleted_at IS NULL
  LEFT JOIN gmail_messages g ON g.workspace = r.workspace AND g.prospect_id = r.prospect_id
 WHERE r.thread_id IS NOT NULL AND g.message_id IS NULL
 GROUP BY r.workspace, r.prospect_id
 LIMIT ?
```

The arithmetic identifies the plan exactly:

```
reply_events   4,522 rows
prospects      5,495 rows
4,522 x 5,495 = 24,848,390
measured avgRowsRead = 24,848,428
```

Every `reply_events` row is being matched against the whole `prospects` table.
`LIMIT` is applied after the join and the `GROUP BY`, so the full cross product
is materialised before anything is discarded. The limit is `seedMax`, which
defaults to **4**. Twenty-five million rows read to return four.

This is not a missing index. `idx_gmail_messages_prospect (workspace,
prospect_id, occurred_at)` exists, `prospects.id` is the INTEGER primary key,
and `reply_events.prospect_id` is INTEGER, so there is no type mismatch
defeating a lookup. The shape of the query is the problem.

### The second half, which matters as much

Seeding four prospects per run, 349 runs a day, is 1,396 seeds a day. The
backlog should have drained in about two days. It has not drained in days,
which means the same rows keep coming back: `syncConversation` returns nothing
for them, so nothing is written to `gmail_messages`, so the next run finds them
again. Making the query cheap without fixing this leaves a cron that spins on
the same unseedable rows for ever.

## Suggested fix

Two parts, and the first is worthless without the second.

1. Replace the join with index seeks so the cost is bounded by `reply_events`:

```sql
SELECT DISTINCT r.workspace, r.prospect_id
  FROM reply_events r
 WHERE r.thread_id IS NOT NULL
   AND r.prospect_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM gmail_messages g
                    WHERE g.workspace = r.workspace AND g.prospect_id = r.prospect_id)
   AND EXISTS (SELECT 1 FROM prospects p
                WHERE p.id = r.prospect_id AND p.workspace = r.workspace
                  AND p.deleted_at IS NULL)
 LIMIT ?
```

2. Record a seed attempt that produced nothing, and stop reconsidering those
   rows, so the backlog can actually reach zero.

Query 2 wants the same treatment: it rebuilds counters for every prospect that
has ever had an outbound `reply_events` row, on every drain, rather than for
the few that changed since the last pass.

## Cost

At 8.4 billion rows a day this is roughly **$8/day** of D1 overage. The $21
invoice is about 2.5 days of it. Nothing has slowed down, so the meter is still
running at that rate right now.

Not fixed here: this is a change to production cron behaviour and needs a
decision before it ships.

---

# Status of the parked list

| # | Item | Status |
|---|---|---|
| 1 | Confirm D1 burn stopped | **It has not.** See above. Different query than assumed. |
| 2 | Sarah (927) should be Client | Still `Interested`. `first_client_at` is already `2026-07-17`. |
| 3 | OpenNext migration | Branch `migration/opennext-cloudflare-preview` present locally and on origin. Untouched. |
| 4 | Demote "Compose in Gmail" | Not done. Still at [components/prospects/EmailSequenceModal.jsx:622](components/prospects/EmailSequenceModal.jsx). |
| 5 | `emails_sent` disagrees with Gmail | **Worse, and actively getting worse.** |
| 6 | Cloudflare billing alert | Dashboard action, cannot verify from here. |

## Item 5 has moved, and query 2 is why

| Prospect | Stage | emails_sent |
|---|---|---|
| Sarah (927) | Interested | **62** |
| Mary Ann Johnson (1317) | Snoozed | **13** |

The handoff recorded Mary Ann at 1 against 8 real sends. She now reads 13.

`reconcileProspectFacts` takes `MAX(emails_sent, count of outbound
reply_events)` every four minutes, and `reply_events` holds the 4,361
backfilled Gmail messages. So every manual email Ary ever sent is being counted
as a cold touch, and the counter only ever ratchets upward. Sixty-two is not a
cold sequence.

The direction is safe rather than dangerous: an inflated counter trips
`coldSequenceExhausted`, so those people are never emailed again. But it is
silently retiring prospects, and it is the same query that costs 1.2 billion
rows a day. Fixing the cost and fixing the counter are one job.

## Verified, and not

Verified against live production or live analytics: the version and sha, the
hourly burn rate, the query attribution, the row counts, the index list, the
column types, both prospect rows, the branch, the modal line.

Not verified: whether `syncConversation` fails for a specific reason, which
would need a drain run traced. The seeding backlog not draining in days is
strong evidence but not the mechanism.

---

# Resolution (same day)

Shipped in the commit carrying this file. Two shape changes, no behaviour
changes:

1. **Seed query** ([lib/conversation-store.mjs](lib/conversation-store.mjs)):
   the events × prospects join became correlated NOT EXISTS / EXISTS probes.
   Dry-run against production: **9,031 rows in 6.7ms** where the old shape
   read 24,848,428 in 15.2s. An empty seed attempt now leaves a marker row
   (`message_id = 'seed-empty'`, invisible to every reader, retried weekly)
   so a failing prospect cannot occupy a seed slot on every drain.

2. **Fact reconcile** ([lib/prospect-facts.mjs](lib/prospect-facts.mjs)):
   detect-then-update. One aggregate pass finds drifted rows (16,663 rows in
   12ms on production, currently zero drifted); the ratchet UPDATE runs only
   against those ids. Semantics byte-identical: counters still only rise,
   reply flags still only set, idempotency markers still excluded.

The dry-runs also corrected one thing this report said: the seed backlog is
not stuck — it is already empty. Both queries were returning nothing. The
money went on computing "nothing to do" 350 times a day at 25 million rows a
pass.

Expected steady state: ~30k rows per drain, ~10M/day, comfortably inside the
free 25B/day D1 allowance. Overage stops.

Tests: 2,578 passing (7 new pinning the query shapes and the preserved
ratchet semantics).

The emails_sent inflation (Sarah at 62, Mary Ann at 13) is NOT corrected by
this: lowering counters changes cold cadence and stays a decision for Ary.
This fix only stops the re-reading.

---

# Verification (23:12 to 00:0x UTC)

The deploy went live at 23:12 (`/api/version` → `13968c8`). Verifying the burn
actually stopped turned into its own investigation, because Cloudflare's two
analytics feeds contradicted each other for an hour.

**What said the burn stopped:**

- `d1 insights` (query-level): a fully post-deploy 15-minute window contained
  no large query at all, while showing the new detector running at 16.6K rows.
  The detector is from the same build as the seed fix, so the live bundle
  provably contains both.
- Workers invocations: exactly two scripts served anything in 2 hours — the
  app (248 requests) and the cron worker (23, one per 5 minutes). No old
  deployment, no preview URL, no OpenNext worker. One script, new code.
- Dry-runs before shipping: 9,031 rows where the old shape read 24.8M.

**What said it continued:**

- `d1AnalyticsAdaptiveGroups` kept emitting ~24.57M-row five-minute buckets
  after the deploy, and `d1 info`'s `rows_read_24h` (computed from the same
  feed) kept rising.

**The tell:** the "ongoing" buckets repeated to the exact digit — 24,572,583
four times in a row. Real independent five-minute sums do not do that. The
adaptive dataset extrapolates from samples, and it was replaying the giant
query's history into buckets where, per the query-level feed, nothing ran.

**Red herrings burned along the way:** the cron worker has no `APP_URL`
override (calls the production alias); the only Claude scheduled task is
one-time and disabled; a 17-second drain heartbeat is normal, because the
drain's job lane has a 25-second budget and its wall time includes Gmail
calls.

If `rows_read_24h` has not collapsed by the next session, the meter itself is
wrong and this section is the evidence pack for a Cloudflare support ticket:
single serving script, new bundle proven live, query-level feed clean, and
phantom buckets repeating to the digit.

---

# Final receipt (2026-08-27)

The third act and the close, in order:

1. **The replies detector** shipped inside the first fix was itself a burn:
   a JOIN driven from prospects that D1 ran as a nested full scan, 24.5M
   rows and 13.5 seconds per drain, 7.19B rows a day. Rewritten to drive
   from reply_events with an EXISTS probe (`0427e62`): 4,569 rows in 3.9ms,
   measured on production before shipping.
2. **The shutdown** (`16a7a54`, Ary's instruction): the app no longer reads
   Gmail or composes email at all. Skills do both; the app stores, stages,
   and sends approved copy only.
3. **The spend breaker** (`b7f5241`): an Emergency stop in Settings pauses
   every autonomous behavior within five minutes, and the drain meters its
   own rows_read and trips the same flag at 2M rows/run. Both burns read
   24.5M/run; normal is 20-40K. The next bug of this class costs one drain.

The measured close, Cloudflare's hourly rows-read:

```
02:00-05:00   ~295,000,000/hour   the burn
06:00           73,975,088        fixes land 06:06 and 06:23
07:00              251,359        first clean hour  (1,173x drop)
```

Steady state ≈ 6M rows/day ≈ 0.02% of the free 25B/month. Recurring bill:
the $5/month Workers Paid base. One already-accrued invoice (~$25-35)
remains for Aug 22-27.

The lesson that outlives the incident is in the tests now: every detector
drives from the small table and probes the big one by key; the wiring tests
pin the shutdown; and verification means settled hours from the meter, not
the first minutes after a deploy.
