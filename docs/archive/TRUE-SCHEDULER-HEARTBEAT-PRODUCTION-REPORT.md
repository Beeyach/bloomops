# Knowing the cron actually fired

**Date:** 2026-08-11
**Status:** complete, proven in production against two real scheduled invocations
**Commit:** `ec00f33`
**Migration:** `052_system_heartbeats.sql`, applied to production D1
**Tests:** 1,325 passing
**Credits spent: 0**

---

## Before: what System Health was guessing

Every other signal on the page is downstream of one fact — a cron fires every
five minutes and calls the drain. Nothing recorded that it had.

So health inferred it, from three proxies:

- jobs changing state
- mailbox `last_sync_at` going stale
- scanner run heartbeats

All three say the same thing when the answer is *"nothing changed"*: the
scheduler ran and found nothing to do, or everything was waiting on something,
or it has not fired since Tuesday. Identical picture, and only one of those is a
problem.

Worse, the page could be entirely silent about the one failure that would
explain everything else at once. **"Scheduler alive" was not represented
anywhere in the architecture.**

## Audit of the scheduler path

| question | answer |
|---|---|
| scheduled routes | one: `/api/cron/drain` |
| entry points | `POST` (the drain, every 5 min) and `PUT` (the daily wake, 04:00) |
| the route that drains the queue | `POST /api/cron/drain` |
| configured cadence | `crons = ["*/5 * * * *", "0 4 * * *"]` in `workers/bloomwired-review/wrangler.toml` |
| who invokes it | Cloudflare calls the Worker's `scheduled()` handler, which calls the app over HTTP with `x-cron-secret` |
| same route for invocation and drain | yes |
| can it exit before queue work | **yes** — 503 if `CRON_SECRET` is unconfigured, 401 on a bad secret, both before anything |
| failures possible before the queue | yes: mailbox reconcile, scanner reconcile and the feeder all run first (each `.catch()`-guarded) |
| existing system heartbeat store | none. `settings` is per-workspace (`workspace NOT NULL`) |
| what health used as a proxy | queue counts, mailbox staleness, scanner heartbeats — no scheduler signal at all |

## Scheduler ownership: global

One Worker, one schedule, one drain that walks every workspace itself. So the
heartbeat is global.

A row in `settings` was rejected: that table is per-workspace by construction,
and inventing a fake workspace to hold a global fact is a lie some later query
would eventually believe. A test asserts the migration contains no workspace
column.

## Heartbeat design

`system_heartbeats(name PRIMARY KEY, last_invoked_at, last_completed_at,
updated_at)` — one row per named schedule, overwritten in place. Deliberately
**not** a history of cron runs: latest truth only. A log of every invocation
would be thousands of rows a week answering a question nobody asks.

Producer: the drain itself, and only the drain.

## Invocation vs completion — both, and why

Two clocks, because they answer different questions and the route shape makes
both meaningful:

- **`last_invoked_at`** — written immediately after the secret check and before
  any work. Means *the cron fired*, not *the cron succeeded*.
- **`last_completed_at`** — written last, on the success path only, after the
  drain has finished its intended control flow.

| invoked | completed | what it means |
|---|---|---|
| fresh | fresh | healthy |
| fresh | stale | being triggered, but drains are dying partway — a different problem with a different fix |
| stale | stale | the cron itself is not firing |

A drain that threw has not completed. A test asserts the completion stamp is not
inside a `catch` block and sits after the scanner lane, on the main path.

**Deliberate separation:** a cron firing on time while every job it touches fails
is a *healthy scheduler* and a *queue full of problems*. Collapsing those would
mean fixing the wrong thing. Tested.

## Authentication: arbitrary requests cannot fake health

The invocation stamp is written **after** `secretMatches()`. An unauthenticated
request gets a 401 and never reaches it; a deployment with no `CRON_SECRET` gets
a 503 and never reaches it.

A test asserts the stamp appears after the `Not authorised` branch in the file,
and that no secret name ever appears in the health output.

**Nothing else may write it.** A test walks the health route, the scanner-runs
route, `ArmyPanel`, the runner, scanner-items and the queue, and fails if any of
them calls the stamp helpers or touches the table directly. A heartbeat anything
can write is one that reads healthy because somebody opened a page.

Proven live: reading `/api/system-health` twice, eight seconds apart, the
reported age **grew** from 1.054 to 1.218 minutes. A GET that stamped it would
have reset the age to zero.

## Stale threshold: derived, not typed

```js
CRON_EVERY_MINUTES = 5              // matches wrangler.toml
SCHEDULER_STALE_MINUTES = CRON_EVERY_MINUTES * 2 + 2   // 12
```

Two whole missed runs plus a couple of minutes of slack, because Cloudflare does
not promise to fire on the second and one late run is not news.

A test reads `workers/bloomwired-review/wrangler.toml` and fails if the cron
expression and the constant ever disagree — a staleness rule derived from a
cadence that has quietly changed is worse than no rule.

**Not the scanner's `HEARTBEAT_STALE_MINUTES` (15).** Different question,
different number; a test asserts the scheduler module never imports it, and that
no second copy of the threshold exists in the route, the health model or the
drain.

## What Ary sees

| state | copy |
|---|---|
| healthy | *"Background scheduler is checking in normally. It last ran 2 minutes ago and runs about every 5 minutes."* |
| stale | *"The background scheduler has not checked in. It normally runs about every 5 minutes and the last one was 40 minutes ago. Nothing has been lost. Work will simply sit still until it starts again."* |
| incomplete | *"The scheduler is running, but not finishing."* |
| unknown | *"Waiting for the first check-in… normal for a few minutes after a new version goes out."* |

No cron jargon. The stale copy says what it means for her and that nothing is
lost, because the first question anybody has is whether something broke.
Timestamps stay in the response for the technical detail panel; secrets never
appear.

## Proxy cleanup: one outage, one warning

A stale scheduler now leads the health headline, ranked above job failures and
below only a dead service. If the cron has stopped, then jobs sitting still,
mailboxes going quiet and Hive runs not progressing are one incident wearing
three costumes — leading with the cause means one warning instead of three
mysteries.

Guarded in both directions by test:

- a healthy scheduler does **not** mask a real job failure underneath it
- waiting for budget or capacity is **never** the scheduler failing
- an idle queue with a live scheduler is simply *quiet*
- a dead service still outranks the scheduler

## Tests

**1,325 passing**, up from 1,301. 24 new in `tests/scheduler-health.test.mjs`:
who may write it, ordering against the auth check, completion never on a failure
path, the two clocks as separate facts, empty queue not looking ill, a
fired-and-failed drain still healthy, staleness, incomplete drains, fresh
deploys, cadence matching `wrangler.toml`, no duplicated threshold, the severity
integration in both directions, no secrets in output, one bounded write, one row
not a history, global not per-workspace, and the build marker intact.

## Production

Commit `ec00f33`, migration 052 applied. Served commit verified from the
server's own `build.commit`, never the dashboard.

## Live acceptance

**Served commit:** `ec00f33`, reported by production.

**Heartbeat before:** no row existed at all. That made the test unambiguous — any
timestamp appearing could only come from a real authenticated scheduled
invocation.

**Two real cron invocations observed, neither triggered by hand:**

| tick | invoked | completed | gap |
|---|---|---|---|
| 1 | 03:00:30 | 03:00:31 | 1s |
| 2 | 03:05:24 | 03:05:25 | 1s |

Interval between ticks: **4m54s** — the five-minute cadence with normal jitter.
Completion one second after invocation each time, so the whole drain ran cleanly.

The cron secret was never exposed or used by hand; the real schedule did this.

**Health after:** `HEALTHY` — *"Background scheduler is checking in normally. It
last ran less than a minute ago and runs about every 5 minutes."*, `attention:
false`.

**Heartbeat advanced with the queue effectively idle**, which is the case the old
inference could never distinguish.

**Credits before / after:** 171 credit events either side, balance 498,180
unchanged, `auto_spend` today 0.

**Send switches:** `autoSendApprovedFirstEmails: false`,
`autoSendApprovedFollowups: false`. No email sent.

### Stale behaviour

Proven by unit test only, deliberately. Production cron was not disabled to
demonstrate a warning.

## Safety

- Scanner concurrency still **2**. Hive logic untouched — no scanner, queue,
  claim-limit, cadence or budget behaviour changed.
- Queue claim limits, send caps, send windows unchanged.
- Gmail, sending, approval and sequence untouched.
- No paid scan started. No email sent. **Zero credit spend.**
- `AUTO_SEND_FIRST = OFF`
- `AUTO_SEND_FOLLOWUPS = OFF`
- Build marker unchanged and still working.

## Remaining gap

One, and it is small: **the daily 04:00 wake (`PUT /api/cron/drain`) has no
heartbeat.** Only the five-minute drain is tracked. If the daily sweep stopped
firing while the drain kept going, health would still read healthy, and the
symptom would be subtle — nothing new entering the queue rather than nothing
moving through it.

The fix is one more named row (`cron-daily`) with a 26-hour threshold. It was
left out to keep this pass to one truthful signal rather than two, and it is the
next thing worth doing here.
