# The daily wake gets its own heartbeat

**Date:** 2026-08-11
**Status:** deployed and served. **The first real daily-wake check-in has not happened yet.**
**Commit:** `2654599`
**Migration:** none — the existing table already supported named rows
**Tests:** 1,346 passing
**Credits spent by this work: 0**

---

## Before: why the daily wake was invisible

The five-minute drain heartbeat shipped last pass and works. It left one blind
spot, and it is the worst possible shape for a failure: **the drain can stay
perfectly healthy while the 04:00 wake goes dark.**

If the daily wake stops, nothing new ever enters the queue. The drain then finds
an empty table every five minutes, completes in a second, and reports excellent
health — for ever. The symptom of this failure is *silence*, and silence was
exactly what the old page read as fine.

Nothing in health reflected it, even indirectly. Gmail watches lapsing after
seven days would eventually show as a stale mailbox, but that is a week late and
points at the wrong thing.

## What the daily wake actually does

`PUT /api/cron/drain`, grounded in the code and nothing more:

1. **`wakeBudgetWaiters`** for every workspace with waiting jobs. Jobs parked on
   budget are woken *only* here — nothing else in the app clears that state.
2. **Enqueues `KIND.SWEEP`** for every workspace that has prospects. This is the
   top of the whole chain: the sweep applies the pre-send guard, wakes deferred
   prospects, queues drafts for whoever is due, and feeds research up to what the
   day's budget allows.
3. **`renewWatches`** — renews Gmail push watches before they lapse. Gmail drops
   a watch after seven days and renewal happens at 48 hours left.

> **What would silently stop:** new work would stop being lined up. Existing
> queued work would keep draining normally, which is precisely why the drain's
> heartbeat cannot detect it.

The UI label stays **"Daily wake"** rather than inventing a product-sounding
name for a route whose responsibilities are mixed and technical.

## Storage: the existing table, reused

`system_heartbeats.name` was already a `PRIMARY KEY`, and the helpers already
took a `{ name }` option. So this is one more named row and **no migration at
all**:

| name | schedule |
|---|---|
| `cron-drain` | `*/5 * * * *` |
| `daily-wake` | `0 4 * * *` |

Global, because the scheduler is global — one Worker, one schedule, one route
that walks every workspace itself. No per-workspace wake health was invented.

A test asserts there is one read path and one table.

## Invocation vs completion

Same two clocks and the same helpers as the drain:

- **`last_invoked_at`** — written immediately after the secret check, before any
  work.
- **`last_completed_at`** — written only after all three responsibilities have
  actually run. A test asserts `wakeBudgetWaiters`, `KIND.SWEEP` and
  `renewWatches` all appear before the completion stamp, and that the stamp is
  not inside a `catch` block.

So a wake that fires and dies partway leaves invoked fresh and completed old,
which reads as *"started, but did not finish"* — a different problem with a
different fix.

## Authentication

The stamp sits after `secretMatches()`. An unauthenticated `PUT` gets a 401 and
never reaches it. Tested by asserting the stamp appears after the
`Not authorised` branch in the file.

Tests also assert that the health route, the scanner-runs route, `ArmyPanel`,
the runner, scanner-items and the queue contain neither stamp helper nor any
direct write to the table, and that the five-minute drain never writes the daily
row.

## Cadence and stale threshold

Configured in `workers/bloomwired-review/wrangler.toml`:
`crons = ["*/5 * * * *", "0 4 * * *"]`.

The Worker routes them by matching the **drain** expression, so anything else is
the daily wake — moving the daily schedule can never silently turn it into a
second drain. Tested.

```js
DAILY_WAKE_EVERY_HOURS = 24
DAILY_WAKE_GRACE_HOURS = 2
DAILY_WAKE_STALE_MINUTES = (24 + 2) * 60     // 26 hours
```

One expected run plus slack for a late schedule or a deployment landing across
the hour. Deliberately **not** the drain's 12 minutes (which would call it dead
a quarter of an hour after every successful run) and not the scanner's 15.

Two tests guard it: one reads `wrangler.toml` and fails if `0 4 * * *` drifts;
another fails if `26 * 60` or `1560` is ever hand-typed anywhere.

## First-run behaviour

No row exists until the first wake *after* a deployment, which can be most of a
day away. That reads as:

> **Waiting for the first daily check-in.** The daily wake runs once a day, at
> 04:00 UTC. Nothing has been recorded since this version went out, which is
> normal until the next one.

Neutral, `attention: false`. **Nothing was faked at migration time** to paper
over the gap — an invented initial timestamp would be a lie that made the first
real check-in unverifiable.

## What Ary sees

| state | copy |
|---|---|
| healthy | *"Daily wake checked in normally. It last ran 6 hours ago and runs once a day, at 04:00 UTC."* |
| waiting | *"Waiting for the first daily check-in."* |
| incomplete | *"The daily wake started, but did not finish."* |
| stale | *"The daily wake has not checked in. It runs once a day, at 04:00 UTC and the last one was 30 hours ago. Nothing has been lost, but no new work will be lined up until it runs again."* |

The stale copy names the real consequence: not broken, **starved**. Timestamps
live in the response for the technical panel; no secret appears anywhere.

### Severity

A stale daily wake leads the page, because the empty queue underneath it is the
symptom rather than the story. If **both** schedules are stale, the drain leads
— one warning, and the simpler explanation. A healthy daily wake hides nothing
underneath it, and a first-run neutral state never raises attention. All four
directions tested.

## Tests

**1,346 passing**, up from 1,325. 21 new in `tests/daily-wake-heartbeat.test.mjs`.

## Production

Commit `2654599`, served build verified from the server's own `build.commit`:

```json
"build": { "commit": "2654599", "branch": "main" }
```

## Live acceptance — what is and is not proven

**Deployed and served:** yes. Production reports `2654599`.

**The five-minute scheduler still advances:** yes, verified after this deploy —
`cron-drain` invoked `04:35:26`, completed `04:35:47`, and health read
`HEALTHY`, *"Background scheduler is checking in normally"*.

**The daily wake heartbeat:** **not yet observed, and not claimed.** Its row does
not exist, and health correctly shows the neutral waiting state.

The reason is timing, and it is worth stating precisely. Today's 04:00 UTC wake
**did** fire — at 04:00 production was still serving `ec00f33`, which had no
daily stamp. This commit went live at roughly 04:35. So the first stamped wake
will be **tomorrow's 04:00 UTC**.

That today's wake fired is not in doubt, and its effects are visible in the
database — which is itself a neat demonstration of why this signal was needed,
since the effects are all the evidence there was:

- 12 jobs created after 03:00: 10 `prepare-followup`, 2 `prepare-outreach`, all
  `done` — the sweep queuing drafts
- 4 `precheck` charges at 04:15, 04:20, 04:30 and 04:35, every one
  `actor: 'auto'` — the unattended research allowance, exactly as designed

**The next real daily wake has not happened yet. This is not called verified.**

## Credits

**This work spent nothing.** The heartbeat is one bounded write per invocation:
no credits, no allowance, no model call, no render call, and the daily wake's
existing behaviour is unchanged.

Separately and honestly: the workspace balance moved 498,180 → 498,100 (−80)
during the session, and `credit_events` went 171 → 175. **That is the app's own
overnight automation**, four automatic site checks at 20 credits each, spent by
the unattended daily allowance under `actor: 'auto'`. It is the daily wake doing
its job, not this pass doing anything.

## Safety

- **No email sent.** Verified rather than assumed: all 22 outcome events since
  03:00 are `vet` decisions; the only `send-approved` job that has ever existed
  is id 118 from 2026-08-09; the most recent send event of any kind is
  2026-08-10 15:49; zero prospects have a `last_contact_date` of today.
- `AUTO_SEND_FIRST = OFF`, `AUTO_SEND_FOLLOWUPS = OFF` — unchanged.
- Scanner concurrency still **2**. Hive logic untouched.
- Queue claim limits, send caps, send windows, Gmail, approval and sequences all
  untouched. Neither cron schedule changed.
- No paid scan started.
- **No monitor tasks left running from this pass.** The one deploy watch was
  bounded and has ended; nothing is polling.

## Closeout

> Scheduler-health infrastructure work is complete after the first real
> daily-wake heartbeat is observed. Do not add more observability features
> unless a real operational gap appears.

The single outstanding item is an observation, not a code change: confirm that
tomorrow's 04:00 UTC wake advances the `daily-wake` row. Until then this is
deployed, not verified.
