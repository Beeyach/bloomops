# Shut, not bolted

Date: 2026-08-12 · commit `2af6086` · Pages `4400ca93` · tests 2,040 passing

`Rejected` meant two things. "I prefer my contact page the way it is" and
"remove me from your list" landed on the same word, and that word was terminal
in a dozen places. Meanwhile the relationship layer had always read `Rejected`
as `NO_TO_THIS_OFFER`, which `CLOSED_TO_OUTREACH` deliberately excludes.

Two layers, same person, opposite answers.

**0 emails sent. 0 credits. Package 19 unchanged. 5 relationship events written,
1 stage corrected, 36 legacy rows untouched.**

---

## Part 1 — the conflict, proven

Run against Cynthia's shape through the real `canProgressOutbound`:

```
as she was (stage Rejected, reply_type decline)   BLOCKED  stop=declined
stage Rejected, reply_type cleared                BLOCKED  stop=terminal-stage   <—
stage Replied,  reply_type decline                BLOCKED  stop=declined
stage Replied,  reply flags all cleared           BLOCKED  stop=not-due
```

The second line is the finding. **The stage blocks her independently of the
decline.** Clear every reply flag and `Rejected` alone still returns
`terminal-stage`, permanently, with no path back.

And the relationship layer, reading the same stage:

```
legacyStage=Rejected  ->  NO_TO_THIS_OFFER   closed? false
legacyStage=Lost      ->  LOST               closed? true
```

> **Cynthia's relationship is conceptually open because `relationship.mjs`
> reads `Rejected` as `NO_TO_THIS_OFFER`, which `CLOSED_TO_OUTREACH` excludes —
> while in practice it was closed, because stage `Rejected` is consumed as
> terminal by `canProgressOutbound`, `pick`, `vet`, `backlog`, `deferral`,
> `today` and eight raw SQL selections, none of which consult the relationship
> at all.**

Every consumer of the word, found and checked:

| Where | What it does with `Rejected` |
|---|---|
| `lib/outbound.mjs` `TERMINAL_STAGES` | refuses all outbound, `stop=terminal-stage` |
| `lib/pick.mjs` `CLOSED` | `rankOne` returns null — never picked |
| `lib/vet.mjs` `CLOSED` | `prescreen` returns SKIP — never researched |
| `lib/backlog.mjs` `TERMINAL` | bucket `stopped` |
| `lib/deferral.mjs` `CLOSED` | never resurfaces |
| `lib/today.mjs` `CLOSED_STAGES` | no unscheduled work |
| `lib/outcomes.mjs` `TERMINAL_STAGES` | records an end-state outcome |
| `lib/friendly-errors.mjs` | not actionable |
| `lib/stage-groups.mjs` | filed under **Closed** |
| 8 raw SQL `stage NOT IN (…)` | excluded from Today, contact discovery, held, system health, and two runner sweeps |

## Part 2 — the contract

| State | Current offer | Current sequence | Future outreach |
|---|---|---|---|
| **NO_TO_THIS_OFFER** | dead | stopped | possible only with a new legitimate reason, through normal policy and approval |
| **NO_TO_US** | dead | stopped | **closed** |
| **DEFERRED** | paused | stopped | resurfaces on the allowed date only |

Stage, relationship and gate must agree. They now do.

## Part 3 — the stage fix chosen

**A new stage: `Not This Offer`.**

No existing stage could carry the meaning honestly. `Snoozed` means a dated
wait she never asked for. `Rekindled` means a cold lead re-approached.
`Interested` is untrue and the brief forbids overloading it. `Replied` is not in
the canonical `STAGES` list at all.

The second option — softening `Rejected` itself — was rejected for the reason
Part 9 anticipates. **36 prospects sit at `Rejected` with no stored reply text
whatsoever.** Changing what the word means would have reopened all of them on
evidence nobody has. Adding a new word changes only what *new* declines write,
so the legacy rows keep the exact treatment they have today. Fail-closed by
construction rather than by a check.

| | Before | After |
|---|---|---|
| ordinary `decline` | `Rejected` | **`Not This Offer`** |
| `unsubscribe` | `Rejected` + DNC + unsubscribed | unchanged |
| group | Closed | **Parked** |
| in `outbound.TERMINAL_STAGES` | yes | **no** |
| in pick / vet / backlog / deferral / today / 8 SQL selections | yes | **yes** |

That last pair of rows is the whole design. She is out of every automatic
selection, sweep and queue, so nothing re-offers her the same thing. But the
stage no longer casts an independent permanent veto, so a deliberate human
decision about a genuinely different reason is not silently overruled.

**Shut, not bolted.** The machine never opens it; a person can.

### What honestly did not change

Her gate result is still `BLOCKED`. It was `declined` before and it is
`declined` now. The visible differences are narrower than the code change:
she is filed as Parked rather than Closed, her timeline says the true thing,
and the stage has stopped independently vetoing a future human decision. Worth
saying plainly rather than dressing up as more.

## Part 4 — the current offer stays dead

```
this offer, as she is now                    BLOCKED  stop=declined
rankOne(Cynthia)                             null      — never picked
prescreen(Cynthia).verdict                   SKIP      — "Already Not This Offer"
classify(Cynthia).bucket                     stopped
shouldResurface(Cynthia)                     false
schedule                                     NEEDS_HUMAN, step null
```

Package 19 cannot restart: it is `SENT`, and Email 2 is refused by the decline
on her row before any package field is consulted. The same offer cannot be
recreated as fresh cold outreach because `pick` and `vet` both return early on
the stage.

## Part 5 — NO_TO_US stays terminal

| Words | State | Result |
|---|---|---|
| "Please don't contact me again." | `NO_TO_US` | closed |
| "Remove me from your list." | `NO_TO_US` | closed |
| unsubscribe classification | `NO_TO_US` | stage `Rejected`, DNC + unsubscribed set |
| "Yes, I prefer it this way." (Cynthia) | `NO_TO_THIS_OFFER` | this offer closed, relationship open |
| Maj 1317's decline | `NO_TO_THIS_OFFER` | same |

Gate ordering, unchanged and verified: `do_not_contact` outranks `unsubscribed`
outranks `declined`.

## Part 6 — the five candidates, re-derived

Every row re-read from `reply_events` and run through the same
`relationshipFromReply` the live path now uses. **The canonical mapping agreed
with the expected taxonomy on all five.**

| Event | Prospect | Class | Confidence | occurred_at | → state |
|---|---|---|---|---|---|
| 8 | 6547 | interested | high | 2026-08-10T15:24:35Z | `INTERESTED` |
| 21 | 6567 | interested | high | 2026-08-11T17:18:44Z | `INTERESTED` |
| 23 | 2595 | not-now | high | 2026-08-11T20:13:11Z | `DEFERRED` |
| 29 | 1317 | question | medium | 2026-08-11T22:58:50Z | `INTERESTED` |
| 31 | **4860** | decline | high | 2026-08-12T18:16:58Z | **`NO_TO_THIS_OFFER`** |

## Part 7 — the backfill

Run through the real `recordReply`, in `occurred_at` order, so each event saw
the same prior state it would have seen live.

Nothing invented. Every field came from the stored row: message id, thread id,
`occurred_at`, the classifier's own classification and confidence, and the
stored reply text.

Provenance: a new `SOURCE.BACKFILL`, distinct from `CLASSIFIER` (written as it
happened) and `LEGACY` (imported from the old single-status world). It reads as
**"LTB, recorded later"** in the timeline, so nobody mistakes a late row for a
live one.

### Before and after

| Prospect | Before | After |
|---|---|---|
| 6547 | *(none)* | `INTERESTED(backfill)@2026-08-10T15:24:35Z` |
| 6567 | *(none)* | `INTERESTED(backfill)@2026-08-11T17:18:44Z` |
| 2595 | *(none)* | `DEFERRED(backfill)@2026-08-11T20:13:11Z` |
| 1317 | `NO_TO_THIS_OFFER(legacy-reconstruction)`, `INTERESTED(legacy-reconstruction)` | + `INTERESTED(backfill)@2026-08-11T22:58:50Z` |
| **4860** | *(none)* | **`NO_TO_THIS_OFFER(backfill)@2026-08-12T18:16:58Z`** |

Prospect 1317's existing rows turned out to be `legacy-reconstruction`, not live
classifications — which is why the hole looked partly filled and stayed
invisible.

### Idempotency

Second run, immediately after the first:

```
-> would write INTERESTED        [ALREADY PRESENT, skipped]
-> would write INTERESTED        [ALREADY PRESENT, skipped]
-> would write DEFERRED          [ALREADY PRESENT, skipped]
-> would write INTERESTED        [ALREADY PRESENT, skipped]
-> would write NO_TO_THIS_OFFER  [ALREADY PRESENT, skipped]
=== plan: 0 event(s) to write ===
```

Two layers of protection: the script skips a message id already present, and
`recordEvent` uses `INSERT OR IGNORE` against the unique index underneath.

Ledger after: **5 backfill, 14 classifier, 3 legacy-reconstruction, 1 human.**

## Part 8 — Cynthia, before and after

| | Before | After |
|---|---|---|
| stage | `Rejected` | **`Not This Offer`** |
| reply_type | `decline` | `decline` |
| replied / reply_date | 1 / 2026-08-12 | unchanged |
| do_not_contact | 0 | **0** |
| unsubscribed | 0 | **0** |
| emails_sent | 1 | 1 |
| send_events | 1 | **1** |
| relationship | *(none)* | `NO_TO_THIS_OFFER` @ her real reply time |
| current standing | — | `NO_TO_THIS_OFFER`, **closed to outreach: false** |
| outbound gate | `declined` | `declined` |
| schedule | NEEDS_HUMAN | NEEDS_HUMAN |
| package 19 | SENT, 2/1/2 | **unchanged** |

The stage change was a single targeted `UPDATE` guarded on
`stage = 'Rejected'`, touching stage, the activity log and `updated_at` and
nothing else. Her feed now carries the note explaining it. Total `send_events`
across the whole database: **10, unchanged.**

## Part 9 — legacy rows, deliberately untouched

| | |
|---|---|
| At `Rejected` before | 87 |
| At `Rejected` now | **86** — Cynthia moved, nobody else |
| At `Not This Offer` | **1** |
| With `replied = 1` and no stored reply text | **36** |
| Reclassified | **0** |

Their gating is unchanged in every respect: `Rejected` is still in
`TERMINAL_STAGES`, still in every `CLOSED` set, still excluded by every SQL
selection. Proven behaviourally — a legacy `Rejected` row with every reply flag
cleared still returns `stop=terminal-stage`.

### One residual asymmetry, on purpose

`legacyStateFor('Rejected')` still returns `NO_TO_THIS_OFFER`, so an old record
reads softly in the UI, while the gate treats the same stage as terminal.

That is deliberate and stays. Making the gate follow the soft reading would
reopen 36 people on evidence nobody has; making the UI follow the hard reading
would bury people who may only have declined one offer. Failing closed on the
action and open on the description is the right way round, and it is written
down here rather than left to be rediscovered.

## Part 10 — tests

`tests/stage-relationship-alignment.test.mjs`, 15 behavioural tests:

1. Cynthia's exact words → `NO_TO_THIS_OFFER`
2. package 19 Email 2 stays blocked, `stop=declined`
3. the same offer cannot restart — through the real `rankOne`, `prescreen`, `classify`, `shouldResurface`
4. a new verified reason is not vetoed by the stage alone, and a legacy `Rejected` row still is
5. `NO_TO_US` blocks future outreach
6. unsubscribe blocks it and keeps the harder stage
7. do-not-contact outranks everything
8. the stage no longer conflates the two, and files as Parked not Closed
9. stage and relationship no longer contradict each other
10. all five backfill candidates map through the canonical logic
11. the backfill is idempotent
12. the original `occurred_at` is preserved, never restamped, and marked `backfill`
13. no duplicates
14. no package, send or contact mutation
15. both automation switches off
16. legacy evidence-poor `Rejected` rows are not reopened

Suite: **2,040 passing**, up from 2,025. `next build` clean.

## Part 11 — deployment

| | |
|---|---|
| Commit | `2af6086` |
| Pages | `4400ca93`, `deploy:success` |
| Cloud Run | not touched |
| `bloomwired-review` Worker | not touched |
| Migrations | none |
| Order | semantic fix deployed and verified **before** any data was written |

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Email 2 sent | **no** — still `declined` |
| New cold sequences | 0 |
| Packages regenerated | 0 |
| Package 19 | unchanged |
| Contacts adopted or altered | 0 |
| Site intel refreshed | 0 |
| Credits | **0** |
| `send_events` total | 10, unchanged |
| Rows written | 5 relationship events + 1 stage correction |
| Legacy rows mass-reclassified | **0** |
| Guards removed or weakened | **none** |
| `AUTO_SEND_FIRST` | **false** |
| `AUTO_SEND_FOLLOWUPS` | **false** |
