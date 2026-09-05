# A default is not a decision

Date: 2026-08-12 · tests 2,011 passing · new module `lib/sequence-ceiling.mjs`

An operator reading package 19 was told `P2 allows 3` about a sequence that
allows two. Both numbers were computed by the same function, from the same
prospect, for two different questions nobody had ever separated.

**Spend: 0 credits. 0 emails sent. Package 19 untouched.**

---

## Part 1 — the exact call path

> **The misleading "P2 allows 3" appears because `lib/cutover.mjs:107` calls
> `effectiveCeiling(prospect)` — which for `rating = null` returns the
> provisional `HARD_TOUCH_CEILING` of 3 — instead of consulting the approved
> package fields `allowed_length` (2) and `sequence_max_step` (2).**

The helper, before:

```js
export function effectiveCeiling(p = {}, opts = {}) {
  const { band, provisional } = effectiveBand(p, opts);
  return band && !provisional ? allowedTouches(band) : HARD_TOUCH_CEILING;
}
```

Cynthia is unrated, so `effectiveBand` reports band `P2` with
`provisional: true`, and the ternary falls to the wide branch. The sentence at
`lib/cutover.mjs:141` then interpolated the band name next to the provisional
number, producing a claim neither field supports.

Proven against package 19, read-only:

```
package 19  status SENT  band P2  allowed_length 2  sequence_approved 1  sequence_max_step 2
prospect 4860  rating null  priority_band null  emails_sent 1

effectiveCeiling(prospect)   [old, generic] : 3
packageAllowedLength(pkg)                   : 2
approvedSequenceCeiling(pkg)                : 2
sequenceCeilingFor(prospect, pkg)  [new]    : 2
```

### Display-only, guard-only, or both?

**Both.** Five call sites, and one of them is a guard:

| Caller | What it was asking | Kind |
|---|---|---|
| `lib/cutover.mjs:107` | which step is next, and the sentence explaining it | display + routing |
| `lib/due.mjs:131` `coldSequenceExhausted` | **is this sequence finished** | **guard** |
| `lib/followup-schedule.mjs:107` | the ceiling shown on the schedule | display |
| `lib/followup-v2.mjs:35,55,374` | legal steps, package shape, fingerprint input | preparation |
| `lib/send-runner.mjs:103` | the ceiling handed to `nextColdStep` | **guard** |
| `lib/prospect-action.mjs:57` | the ceiling on a prospect row | display |

`coldSequenceExhausted` is not cosmetic — it decides whether a prospect is still
owed anything.

**No send risk existed, and none was found.** Three later guards refuse an
Email 3 on package 19 independently: the copy does not exist, `COPY_NOT_APPROVED`
refuses a step with no approved body, and `PAST_ALLOWED_LENGTH` refuses a step
above `sequence_max_step = 2`. Verified earlier in production:

```
Email 3 manual: blocked copy-not-approved
  "Email 3 was not in the package when it was approved, so nobody has read it."
```

The defect was that the product said something untrue about its own decision.

## Part 2 — the canonical contract

Three questions, three names, in `lib/sequence-ceiling.mjs`:

| Question | Helper | Answer for package 19 |
|---|---|---|
| How many touches may preparation plan for? | `prospectPreparationCeiling(prospect)` | 3 |
| How long was this package actually written? | `packageAllowedLength(pkg)` | 2 |
| How many may actually be sent? | `approvedSequenceCeiling(pkg)` | 2 |
| The one to ask with a package in hand | `sequenceCeilingFor(prospect, pkg)` | **2** |

The unrated cap of 3 stays, and stays a *preparation* cap. It is not a claim
that P2 allows three; it is the app declining to plan short for somebody nobody
has rated yet.

`approvedSequenceCeiling` takes the **narrower** of `allowed_length` and
`sequence_max_step`, so neither field can widen the other. Without
`sequence_approved = 1` it returns **1**: whatever the package is long enough
for, one email is all anybody consented to.

### The fourth case, which the brief did not name

A package that recorded **none** of the three fields. Eight live packages are
like this — they predate the fields entirely. Reading their silence as "1" would
have retroactively cut short sequences nobody shortened, so
`packageRecordsCeiling()` gates the whole thing and they fall back to the
prospect cap, exactly as before.

## Part 3 — centralized

`effectiveCeiling` is no longer called anywhere in `lib/`. Every caller now names
which question it is asking:

| File | Now calls | Why that one |
|---|---|---|
| `cutover.mjs` | `sequenceCeilingFor(prospect, pkg)` | routes a real send; a package decides |
| `due.mjs` | `sequenceCeilingFor(p, pkg)` | the guard; same |
| `followup-schedule.mjs` | `sequenceCeilingFor(prospect, pkg)` | threads `pkg` through to `nextStepFor` |
| `send-runner.mjs` | `sequenceCeilingFor(prospect, pkg)` | the package being sent is right there |
| `followup-v2.mjs` `legalSteps` / `packageShape` | `prospectPreparationCeiling` | runs **before** a package exists |
| `prospect-action.mjs` | `prospectPreparationCeiling` | a list row, no package in hand |

`effectiveCeiling` itself is left in `lib/priority.mjs` untouched and still
tested by `tests/banded-ceilings.test.mjs` — removing it would have been a
rename dressed up as a fix, and its band arithmetic is still correct for the one
question it can answer.

**Neither preparation path narrowed.** `lib/runner.mjs:637` and
`app/api/followup-preview/route.js:81` both call `nextFollowupStep` **without**
a package, so they still get the preparation cap. Checked rather than assumed.

## Part 4 — guard layering preserved

Nothing was removed. The order a send still runs through:

1. copy for the step exists in the package
2. `COPY_NOT_APPROVED` — that copy was approved
3. sequence approval permits the step
4. `allowed_length` permits it
5. `sequence_max_step` permits it
6. cadence and priority permit it
7. the send window permits it
8. both automation switches

The ceiling becoming correct removes no layer. Test 11 asserts
`COPY_NOT_APPROVED` and `PAST_ALLOWED_LENGTH` are still independent, and that a
correct ceiling of 2 does not conjure an Email 2 body into a package that has
none.

## Part 5 — band semantics, pinned

| Band | Touches | Approved ceiling | Notes |
|---|---|---|---|
| **P3** | 1 | 1 | sequence approval is meaningless and is not offered |
| **P2** | 2 | 2 | no Email 3, ever |
| **P1** | 3 | 3 | real native Email 3 transport remains separately pending and was not touched |
| **Unrated** | provisional 3 before a package | package fields win once they exist | the 3 is a preparation cap, never a band allowance |

## Part 6 — what an operator now reads

| Situation | Before | Now |
|---|---|---|
| approved 2-email package | `P2 allows 3; 1 sent, so email 2 is the next and only one.` | `This sequence allows 2; 1 sent, so email 2 is the next and only one.` |
| prospect, no package | `P2 allows 3; …` | `The plan allows up to 3; …` |
| approved sequence, as a sentence | — | `This approved sequence allows 2 emails.` |
| package prepared, sequence not approved | — | `Only the first email is approved. Anything after it is outside this approval.` |
| unrated, no package | — | `Not rated yet, so up to 3 emails may be planned until somebody looks.` |

No band letter appears next to a number it does not govern. "The plan allows up
to" rather than "this sequence allows" for a bare prospect, because somebody
with no package does not have a sequence yet.

## Part 7 — package 19, read-only

| Expected | Found |
|---|---|
| status `SENT` | ✅ |
| `emails_sent` 1 | ✅ |
| `allowed_length` 2 | ✅ |
| `sequence_approved` 1 | ✅ |
| `sequence_max_step` 2 | ✅ |
| Email 2 stored and approved | ✅ 287 bytes, step 2 |
| Email 3 | does not exist |
| ceiling helper in send context | **2** |
| operator message | `This sequence allows 2` |

**One thing changed since the brief was written: Cynthia replied, and declined.**

```
prospect 4860  replied 1  reply_type decline  reply_date 2026-08-12
reply_events   id 30 outbound 16:35:40 · id 31 inbound 18:16:58 "decline"
```

Running the real guards against her live row:

```
OUTBOUND GATE   ok: false | stop: declined | "They said no. Nothing further goes out."
SCHEDULE        status: NEEDS_HUMAN | step: null
                "They replied. This is a conversation now, not a sequence."
Email 2 manual    : blocked declined
Email 2 automatic : blocked automation-off
```

So the brief's "current Email 2 guard = `not-due`" is now `declined`, which is
stricter. The `not-due` day-4 arithmetic is still verified — by test 13 against
a fixture of her pre-reply state, since her live row no longer reaches that
branch. Said plainly rather than reported as if it still held.

Package 19 was read and not written. No mutation, no send, no approval change.

## Part 8 — tests

`tests/sequence-ceiling.test.mjs`, 17 behavioural tests through the real
helpers, `nextStepFor`, `nextFollowupSchedule` and `coldSequenceExhausted`:

1. unrated + no package → provisional cap 3
2. unrated + prepared P2 package → package ceiling, not 3
3. approved P2, `allowed_length` 2, `sequence_max_step` 2 → 2
4. Email 3 on that package → exhausted, and never described as `P2 allows 3` (asserted for all three band letters)
5. P3 package → 1
6. P1 package → 3, and Email 3 still owed at 2 sent
7. `allowed_length` 2 without sequence approval → 1, with the matching sentence
8. lower `sequence_max_step` wins
9. lower `allowed_length` wins
10. a package recording nothing falls back to the prospect cap unchanged
11. `COPY_NOT_APPROVED` and `PAST_ALLOWED_LENGTH` remain independent
12. package 19's real field values → ceiling 2 through the schedule
13. Email 2 still day 4 from the real Email 1 send → `2026-08-16`
14. weekend window unchanged: Sunday closed, Monday 10:00 Pacific open
15. both automation switches still false
16. every helper is pure — no argument mutated, no handle taken
17. the regression itself: the string `P2 allows 3` cannot be produced

Suite: **2,011 passing**, up from 1,994. `next build` clean.

## Part 9 — discrepancy audit, read-only

All 11 live packages examined. **10 discrepant** between the old generic helper
and the new package-aware one:

| Package | Prospect | Status | Band | rating | allowed_length | seq_approved | seq_max | sent | old | new |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 6545 | APPROVED | — | 💚 | — | 0 | — | 1 | 3 | 1 |
| 6 | 6546 | SENT | — | 💚 | — | 0 | — | 1 | 3 | 1 |
| 7 | 1583 | NEEDS_DECISION | — | 💚 | — | 0 | — | 0 | 3 | 1 |
| 8 | 6547 | SENT | P1 | 💚 | 3 | 0 | — | 1 | 3 | 1 |
| 10 | 6548 | SENT | P1 | 💚 | 3 | 0 | — | 1 | 3 | 1 |
| 11 | 6549 | SENT | P1 | 💚 | 3 | 0 | — | 1 | 3 | 1 |
| 12 | 1713 | NEEDS_DECISION | — | 🥀 | — | 0 | — | 0 | 2 | 1 |
| 13 | 1680 | NEEDS_DECISION | — | 🥀 | — | 0 | — | 0 | 2 | 1 |
| 15 | 6568 | SENT | P1 | 💚 | 2 | 1 | 2 | 2 | 3 | 2 |
| **19** | **4860** | **SENT** | **P2** | **null** | **2** | **1** | **2** | **1** | **3** | **2** |

Package 14 (P1, `allowed_length` 3, `sequence_approved` 1, `sequence_max_step`
3) agrees at 3 and is not listed.

**Only package 19 matches the brief's exact shape** — null rating, P2/P3 band,
package fields disagreeing with the helper. The other nine are the same
underlying confusion wearing different field values, so they are reported rather
than filtered out.

### Send risk

**None.** Every discrepancy narrows the number, and the narrower number is
already enforced by an existing guard. Checked directly: no package in the list
stores follow-up copy beyond its narrow ceiling.

```
pkg  5: narrow=1 wide=3  stored followup steps=[]        sent=1
pkg  6: narrow=1 wide=3  stored followup steps=[]        sent=1
pkg  7: narrow=1 wide=3  stored followup steps=[]        sent=0
pkg  8: narrow=1 wide=3  stored followup steps=[]        sent=1
pkg 10: narrow=1 wide=3  stored followup steps=[]        sent=1
pkg 11: narrow=1 wide=3  stored followup steps=[]        sent=1
pkg 12: narrow=1 wide=2  stored followup steps=[]        sent=0
pkg 13: narrow=1 wide=2  stored followup steps=[]        sent=0
pkg 15: narrow=2 wide=3  stored followup steps=[step 2]  sent=2
pkg 19: narrow=2 wide=3  stored followup steps=[step 2]  sent=1
```

Packages 5–13 hold no follow-up copy at all, so `COPY_NOT_APPROVED` already
refused every step past the first. Packages 15 and 19 hold exactly one follow-up
each and have `sequence_max_step = 2`, so step 3 was already refused twice over.

**The discrepancy was display-only in every live case.** It could have
influenced a guard — `coldSequenceExhausted` and the `nextColdStep` ceiling both
consumed it — but in each live case a narrower guard fired first.

Nothing was refreshed, repaired, or mutated.

## Part 10 — deployment

| | |
|---|---|
| Tests | 2,011 passing (was 1,994) |
| Build | `next build` clean |
| Pages | deployed |
| Cloud Run | not touched — no render-service code changed |
| `bloomwired-review` Worker | not touched |
| Migrations | none |

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Email 2 sent | **no** |
| Email 3 generated | **no** |
| Package 19 mutated | **no** — read-only throughout |
| Approvals changed | 0 |
| Contacts altered | 0 |
| Site intel refreshed | 0 |
| Credits spent | **0** |
| P2 cadence changed | no |
| Weekend / send-window policy changed | no |
| Guards removed or weakened | **none** — two were narrowed, none loosened |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |
| Accepted threading/send work reopened | no |
