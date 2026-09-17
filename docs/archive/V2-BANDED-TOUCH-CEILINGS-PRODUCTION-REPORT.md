# V2 banded touch ceilings — enforcing P1/P2/P3 from the rating

**Date:** 2026-08-10
**Status:** complete and verified in production.
**Commit:** `ffcf78c` — deployment `23c1ada9`, Production, Active
**Tests:** 1,483 passing (20 new)
**Emails sent: 0. Credits spent: 0. Model calls made: 0. Rows backfilled: 0.**

---

## Before

The previous pass put a hard ceiling of three cold emails on everybody. That
stopped Email 4 and beyond. It did not make P1, P2 and P3 mean anything.

`coldSequenceExhausted` read the ceiling from one column:

```js
const band = String(p?.priority_band || '').trim();
```

That column is written in exactly one place: `lib/approval.mjs`, when an
outreach package is approved. Eleven packages exist in total. So the column was
empty on **all 5,813 prospects**, and the banded ceilings governed nobody.

The concrete effect: a prospect rated ✖️ is a P3 and should receive **one** cold
email. The app would have asked for **three**. The rating that decides the band
was sitting on the same row the whole time.

## Production audit

Ratings, all live rows. Five distinct values, exactly the four canonical ones
plus unrated. No junk, no legacy variants.

| rating | effective band | all | contacted | contacted, no reply |
|---|---|---|---|---|
| 💚 | P1, max 3 | 1,748 | 781 | 739 |
| 💙 | P2, max 2 | 37 | 36 | 36 |
| 🥀 | P2, max 2 | 67 | 27 | 26 |
| ✖️ | P3, max 1 | 273 | 98 | 80 |
| *(unrated)* | provisional, hard cap 3 | 3,688 | 164 | 163 |
| | | **5,813** | **1,106** | **1,044** |

Rows with a stored `priority_band`: **0 of 5,813.**

### Why the column is empty

Not a failed migration and not corruption. `priority_band` is written only on
outreach package approval, and almost nothing has been through that path. The
column was doing exactly what it was built to do; it was simply the wrong thing
to read for a ceiling.

## Effective band

One canonical helper now owns the question, in `lib/priority.mjs`:

```js
effectiveBand(prospect)     // which band governs, and where it came from
effectiveCeiling(prospect)  // how many cold emails that allows
```

Precedence, deliberately in this order:

1. A **valid stored** `priority_band` wins. This changes nothing today and stays
   correct if the approval path ever fills it in.
2. Otherwise the band is **derived from the rating** via the existing `bandFor`.
3. An **invalid** stored value (`P9`, junk) is ignored rather than trusted, and
   falls through to the rating.

Both answers come from the same source anyway: approval derives the band it
stores from the rating too, using `bandFor`. So stored and derived can only ever
diverge if a rating changed after approval, and with zero stored bands there are
**zero conflicting rows** today. No precedence guess was needed.

`lib/due.mjs` and `lib/cutover.mjs` both call these helpers. Neither carries its
own rating table or its own ceiling number, and a test asserts `due.mjs` contains
no `TOUCHES` table and no rating emoji.

**The rule that changed: an empty band no longer means no ceiling.**

## Real P2 versus provisional P2

This is the subtle one, and it is the reason this pass could have quietly done
harm.

`bandFor` returns **P2 for an unrated prospect**, flagged `provisional: true`,
with the reason *"Not rated yet, so the default applies until somebody looks."*

P2 allows two emails. Had the ceiling simply followed that default, **3,688
unrated prospects** would have been cut from three touches to two — not because
anybody judged them, but because nobody had. That is a decision made from an
absence of information.

So `effectiveCeiling` uses the real ceiling only when the band is real:

```js
return band && !provisional ? allowedTouches(band) : HARD_TOUCH_CEILING;
```

- A **real P2** (💙 or 🥀) is held to two.
- A **provisional P2** (unrated) keeps the hard ceiling of three, exactly as
  before this pass.

A stored band carries the same distinction through `band_was_provisional`, which
already existed in the schema.

Verified: unrated prospects at 0, 1 and 2 sends are all still eligible;
exhausted only at 3. **Unchanged by this pass.**

## Live ceiling logic

| band | 0 sent | 1 sent | 2 sent | 3+ sent |
|---|---|---|---|---|
| P1 (💚) | eligible | eligible | eligible | finished |
| P2 (💙 🥀) | eligible | eligible | finished | finished |
| P3 (✖️) | eligible | finished | finished | finished |
| unrated | eligible | eligible | eligible | finished |

Nobody reaches a fourth cold email by any route. A test walks every rating
against every stored-band value (valid, empty, null, junk) at 3, 4, 7 and 20
sends and asserts all of them are finished.

## Cutover parity

The two policy paths now call the same helper, so they cannot answer differently
about the same person.

The parity test sweeps **252 combinations** — 7 rating values × 6 stored-band
values × 6 send counts — and asserts that `cutover.mjs` and the live cadence
agree on whether more cold outreach is allowed, in every one.

That sweep is not vacuous. Before this change, `✖️` with an empty band at one
send was a real disagreement: cutover said finished, the cadence said keep going.
That exact case is in the sweep.

## Production effect

Measured read-only before deploying, then confirmed against real rows after.

**51 prospects became finished who were not.**

| | rows | due today | carrying a draft |
|---|---|---|---|
| ✖️ with 1 sent | 27 | 0 | 0 |
| ✖️ with 2 sent | 21 | 0 | 0 |
| real P2 (🥀) with 2 sent | 3 | 0 | 0 |
| **total** | **51** | **0** | **0** |

**Nothing disappears from Today, because none of the 51 had a future date or a
pending draft.** This pass is preventive: those rows can never come due for a
cold email again.

Unchanged, and verified as unchanged:

- 💚 with 2 sent — **54 rows, 0 exhausted.** One final Email 3 is still allowed.
- 💚 with 3 sent — 77 rows, all finished, as they already were.
- unrated at 1 and 2 sent — still eligible, hard cap of 3 intact.
- everyone who replied — still excluded by stop-on-reply, which outranks the
  ceiling entirely.

Rows whose allowed next step is unchanged: **1,055 of the 1,106 contacted.**

Sample real rows, run through the shipped code: `#23 Ruby` (✖️, 1 sent, ceiling
1, finished), `#953 Mary` (✖️, 2 sent, ceiling 1, finished), `#1412` (🥀, 2 sent,
ceiling 2, finished), `#1052 David` (💚, 2 sent, ceiling 3, **still eligible**).

## Stored band conflicts

**None.** Zero rows carry a stored band, so no row can disagree with its rating.
Nothing was resolved, overwritten, or guessed.

## Backfill decision

**Not done, and not needed.**

Deriving at read time was chosen over writing `priority_band` to 5,813 rows for
one reason: a backfilled column is a copy of the rating that starts drifting the
moment a rating changes. It would create a sync responsibility that does not
exist today, to store a value the code can compute correctly every time.

A test asserts none of `priority.mjs`, `due.mjs` or `cutover.mjs` writes the
column.

## Safety

Verified after deploy:

| | before | after |
|---|---|---|
| `send_attempts` | 4 | **4** |
| `send-approved` jobs | 1 | **1** |
| `credit_events` | 199 | **199** |
| `ai_usage` calls | 53 | **53** |
| rows with a stored band | 0 | **0** |

- `AUTO_SEND_FIRST` **off**, `AUTO_SEND_FOLLOWUPS` **off**. Neither key is
  present in the stored engine settings, and `sendPolicy` requires `=== true`,
  so absent means off rather than defaulting on. Neither was touched.
- Scanner concurrency **2**.
- Untouched: Gmail transport and rendering, provider-id reconciliation, dedupe,
  the name-mismatch guard, reply sync, stop-on-human-reply, the relationship
  model, Hive, the scheduler, daily wake, credit rules, auto allowance, contact
  recovery, and the Strong/Vet/evidence rules.
- No migration, no schema change, no new endpoint, no model call, no paid scan.

## Tests

**1,483 passing**, up from 1,463. 20 new in `tests/banded-ceilings.test.mjs`
covering the rating map, real versus provisional P2, every ceiling walked from 0
to 6 sends, the 252-case parity sweep, the stops that outrank the ceiling, and
assertions that this path cannot send, spend, or write.

One harness bug caught during acceptance and worth recording: the first
verification query aliased `emails_sent` to `sent`, so every row read as
undefined and *nothing* looked exhausted. The code was right; the check was
wrong. Re-run with the real column name, all five buckets behaved as predicted.

## Production

Commit `ffcf78c`, deployment `23c1ada9`, Production, **Active**, newest on
`main`.

Served-build evidence is partial and worth stating plainly: the `build.commit`
marker sits behind the access gate, so it could not be read without the access
code. What is confirmed is the deployment record and that the predicted effect
matches real production rows exactly. The behaviour was verified against live
data, not only against the deployment status.

## Remaining gap

**V2 shadow follow-up generation.** The gate is now correct, so generating a
draft finally proves something about what V2 would actually send. Not started
here.

---

`V2 BANDED CEILINGS VERIFIED — P1/P2/P3 NOW ACTUALLY CONTROL HOW MANY COLD EMAILS A PROSPECT CAN RECEIVE`
