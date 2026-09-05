# Reconstructing the replies that already happened

**Date:** 2026-08-11
**Status:** complete. Reconstruction run in production, idempotency proven.
**Commit:** `3bcbcc6`
**Migration:** none — `relationship_events` already existed
**Tests:** 1,435 passing
**Credits caused by this pass: 0. Emails sent: 0.**

---

## Before

The relationship timeline only started recording when it shipped. `reply_events`
had kept every message since Gmail sync went in, but nothing had turned those
into relationship states, so a prospect who replied before last night showed
their legacy stage and nothing else. The work that made LTB understand a
conversation did not apply to the list Ary actually has.

## Corpus audit

Counted before anything was written. It is much smaller than a migration of this
shape usually implies, and saying so plainly matters more than making it sound
impressive.

| | count |
|---|---|
| messages in `reply_events` | 19 |
| inbound (theirs) | 5 |
| outbound (ours) | 14 |
| prospects with any reply | 6 |
| **live prospects with inbound replies** | **2** |
| prospects already having relationship events | 0 (both test records, soft-deleted) |

**Old classification vocabulary actually present in production:**
`interested` ×2 · `decline` ×1 · `price` ×1 · `unknown` ×1, plus 14 outbound rows
with no classification.

The two live prospects:

| id | who | stored replies |
|---|---|---|
| 927 | Sarah | `interested` (high) at 18:33 |
| 1317 | Mary Ann Johnson | `decline` (high) 21:22:03, then `price` (high) 21:25:01 |

Two others had replies but are soft-deleted test records (`GMAIL PROOF (delete
me)`, `TEST RECORD - Gmail acceptance send 1`) and were excluded.

## Mapping

Deterministic, by stored label alone, in `lib/relationship-reconstruct.mjs`:

| old label | reconstructed |
|---|---|
| `interested`, `question` | `INTERESTED` |
| `price` | `INTERESTED` |
| `objection`, `decline` | `NO_TO_THIS_OFFER` |
| `not-now` | `DEFERRED` (with the stored date, if one exists) |
| `unknown` | `AMBIGUOUS` |
| `out-of-office`, `bounce`, `wrong-person`, `referral`, `unsubscribe` | nothing |

Boundaries and business facts are separate, and are the **only** route to the
strong states: `do_not_contact` / `unsubscribed` → `NO_TO_US`,
`first_client_at` → `WON`.

**The message text is never consulted.** A test asserts the module contains no
reference to `snippet`, `subject`, `body`, or any of the live word-matching
helpers, and that the mapper takes exactly one argument. The live path can weigh
wording because it has the whole message at the time; here there is only a
snippet stored for recognition, and squeezing extra meaning from it would be
inventing.

## Generic decline safety

An old `decline` always becomes the softer `NO_TO_THIS_OFFER`. That label
historically covered both *"not this specific thing"* and *"do not contact me"*,
and which one was never recorded. Guessing the harsher reading would re-bury
exactly the people this work exists to find.

A test iterates all thirteen old labels and asserts **none** of them can produce
`NO_TO_US`.

## Provenance

Reconstructed events carry `source = 'legacy-reconstruction'` — deliberately
neither `classifier` (no classifier ran today) nor `human` (nobody decided
this). In the timeline they read as **"Older record"**, while live classifier
events read "LTB" and corrections read "You".

That labelling was wrong on first inspection: reconstructed rows showed as
"LTB", which claims a judgement that was never made. Fixed, with a test.

## Reconsidered policy — what was deliberately not inferred

Three states are never reconstructed, and Mary Ann is the case that shows why it
matters:

- **`RECONSIDERED`** — a no followed by a yes is two events. Calling the second
  one a change of mind is a claim the old data never made. The timeline shows
  both in order and `currentState()` picks the later one, which gets the right
  answer without the invention.
- **`BUDGET_CONCERN`** — telling a budget objection from a flat no needs the
  words.
- **`ACCEPTED_OFFER`** — and this one is the sharpest. `offer_accepted_at` looks
  like exactly the field to use, and it is set on both live prospects. But:

  ```js
  const ACCEPTS_OFFER = new Set(['interested', 'question']);
  ```

  It is written for **any** interested or question reply. It means *"replied
  with interest"*, not *"said yes to an offer"*. Mapping it would have put a
  sale in the record that never happened. A test asserts it is never used that
  way.

## Deferrals

Reconstructed only when a real `deferred_until` exists on the prospect, and the
stored date is preserved exactly. Without one, `DEFERRED` is still recorded but
carries no date — an invented date is worse than none. No deferrals existed in
this corpus.

## Idempotency

Every write is `INSERT OR IGNORE` against the unique index on
`(workspace, prospect_id, message_id, state, source)`. Better than that, the
planner skips messages that already have an event, so a second run does not even
reach the database with them.

**Proven in production:** the second run reported `reconstructed 0`,
`events written 0`, `duplicates avoided 0` — nothing was attempted, not merely
nothing inserted.

The script contains no `UPDATE` or `DELETE` against `relationship_events` at
all, asserted by test. Live events and human corrections cannot be overwritten
because nothing can overwrite anything.

## Mixed old and new prospects

For a prospect that already has live events, only messages **before the first
live event** are reconstructed, and any message already carrying an event is
skipped. Tested both ways.

## Dry run

Run first, wrote nothing:

```
  927:  2026-08-10T18:33 INTERESTED
  1317: 2026-08-10T21:22 NO_TO_THIS_OFFER → 2026-08-10T21:25 INTERESTED

  prospects with inbound replies      2
  already had relationship events     0
  reconstructed                       2
  events projected                    3
  events skipped                     11   (all "our own message, not theirs")
  still legacy-only                   0
  by state          {"INTERESTED":2,"NO_TO_THIS_OFFER":1}
  never inferred    RECONSIDERED, ACCEPTED_OFFER, BUDGET_CONCERN
  sends caused                        0
  credits caused                      0
```

The projection matched a hand audit of the same rows exactly, so it was executed.

## Production reconstruction — final counts

| | |
|---|---|
| prospects with historical inbound replies | 2 |
| already having relationship events | 0 |
| **prospects reconstructed** | **2** |
| **relationship events inserted** | **3** |
| events skipped | 11 |
| skip reason | all "our own message, not theirs" (outbound) |
| generic declines → `NO_TO_THIS_OFFER` | 1 |
| `NO_TO_US` created | 0 (no stored boundary existed) |
| deferrals reconstructed | 0 (none in the corpus) |
| accepted offers reconstructed | **0 — deliberately, see above** |
| won/client reconstructed | 0 (no `first_client_at` set) |
| prospects whose current state changed from legacy fallback | 2 |
| prospects still legacy-only | 0 |
| duplicate writes on second run | **0** |
| sends caused | **0** |
| credits caused | **0** |

## Mary Ann — read-only validation

Her record was reconstructed by the same rules as everyone else, from her own
stored classifications. Nothing was hand-written to make it look better.

```
Current: Interested
"They want to talk. The latest reply changed the earlier not this offer."

2026-08-10 21:22 · Not this offer · Older record
2026-08-10 21:25 · Interested     · Older record
```

Under the old model she showed only her legacy stage.

**What is honestly missing:** the real story had budget concerns, an exploration
of a different kind of support, and an explicit acceptance of a £297 one-time
cleanup. **None of that is reconstructable.** The old classifier recorded two
labels — `decline` and `price` — and nothing else. The nuance was never stored,
so it is not in the timeline, and no attempt was made to write it from memory.

What the data does support is exactly the point of the pass: the decline-shaped
message no longer ends her story, and she reads as someone worth replying to.

## UI

Reconstructed entries appear in the same chronological timeline, marked
**"Older record"**. The raw `legacy-reconstruction` string is never rendered —
asserted by test against the component.

## Today

Both reconstructed prospects now derive `needsPerson: true` — 927 as Interested,
1317 as Interested. They surface for human attention, which they should, and
which they did not before.

**No outreach was restarted.** Human attention is not outbound automation: the
reconstruction script cannot enqueue, cannot create a package, and cannot send.

## Zero side effects

- **No email sent.** `send-approved` jobs: 1 ever, from 2026-08-09. Send
  attempts: 4, all pre-existing. No new ones.
- **No outreach package created** for either prospect.
- **No sequence restarted**, no model call, no paid scan, no site audit.
- **Credits unchanged:** `credit_events` 199 and balance 498,100 before and
  after, identical.
- A test asserts the script contains none of `sendApproved`, `enqueue(`,
  `outreach_packages`, `send_attempts`, `spendCredits`, `askBackground`,
  `runPrecheck` or `UPDATE prospects`.

## Tests

**1,435 passing**, up from 1,411. 24 new in
`tests/relationship-reconstruct.test.mjs`.

One of those tests was briefly broken in a way worth recording: a word-boundary
check written through a shell heredoc lost a backslash level, so `\b` became a
backspace character and the regex could never match. It passed for the wrong
reason. Caught by testing the test against a word that should match and one that
should not, and fixed.

## Production

Commit `3bcbcc6`. Served build verified from the server's own `build.commit`.

## Safety

- Scanner concurrency **2**. Hive, scheduler and daily wake all untouched.
- Gmail transport, rendering and dedupe untouched.
- `AUTO_SEND_FIRST = OFF`, `AUTO_SEND_FOLLOWUPS = OFF`.
- No privileged migration endpoint exists: this is a script, dry run by default,
  writing only with `--write`.

*(Still open, unchanged and not touched here: the automatic `VERIFY_SITE` refund
path calls `refundCredits` without a prospect id, so those refunds cannot be
traced to a prospect. Money is unaffected; it is an observability gap.)*

## Remaining gap

**V2 follow-up generation and the legacy sequence cutover**, and this
reconstruction confirms it rather than assuming it. The relationship model now
holds the truth about where every replied-to prospect stands, including the two
who are Interested and waiting — but nothing yet decides what the *next message*
to them should be. The old sequence machinery still owns that, and it does not
know about any of these states.

That is the next pass, and it was explicitly out of scope here.
