# Remembering the conversation, not just the last label

**Date:** 2026-08-11
**Status:** deployed, production acceptance passed, zero sends and zero spend
**Commits:** `67b6349` (model + name guard), `21c026e` (timeline UI), `e9d50e9` (supersession copy)
**Migration:** `053_relationship_events.sql`, applied to production D1
**Tests:** 1,411 passing

---

## Before: what the single-state model lost

Not the messages. `reply_events` has always kept every reply with its
classification, message id, thread id and timestamp.

What was lost was the meaning, in three specific ways:

1. **`decline` covered two different things.** In `actionFor`, both *"this
   specific thing is not what I need"* and *"stop contacting me"* returned
   `stage: 'Rejected'`, `replyType: 'decline'` and — the damaging part —
   `needsHuman: false`. So a decline-shaped message filed the prospect away
   **without asking anybody to look at it.**
2. **The current standing was one overwritten column.** `prospects.stage` was
   the whole answer. Nothing recorded that it had changed, why, or whether a
   classifier guessed it or Ary decided it.
3. **`ACCEPTED_OFFER` did not exist.** There was an `offer_accepted_at` column
   that nothing in the reply path ever wrote.

The case that exposed it: somebody replied interested, said the offer was not
what she needed, raised budget, explored something else, appeared to decline
because she had found another WordPress person, and three minutes later accepted
a one-time cleanup. Under the old model: **Rejected, needsHuman false.** A won
deal read as a dead lead.

## Existing model audit

| what | where | ownership |
|---|---|---|
| every inbound/outbound message | `reply_events` | Gmail sync, append-only, dedupes on `message_id` |
| analytics facts | `outcome_events` | append-only, kind/value/context |
| current standing | `prospects.stage` | **overwritten** by `applyReplyToProspect` |
| classifier labels | `lib/reply-classify.mjs` | 12 message labels |
| stop-on-reply | `STOPS_OUTBOUND` | every real reply, including unreadable ones |
| deferral timing | `prospects.deferred_until` + `deferral_*` | set from a parsed date only |

## Event vocabulary

Eleven states, chosen because each one changes what Ary should do next. A label
that changes nothing is a label nobody maintains.

`AMBIGUOUS` · `INTERESTED` · `BUDGET_CONCERN` · `NO_TO_THIS_OFFER` ·
`NO_TO_US` · `DEFERRED` · `RECONSIDERED` · `ACCEPTED_OFFER` · `WON` · `LOST`

The existing classifier is **translated, not replaced** — it already works, is
tested, and stops outbound correctly.

## NO_TO_THIS_OFFER versus NO_TO_US

The distinction the whole pass exists for.

- **NO_TO_THIS_OFFER** — "this particular thing is not what I need." The
  relationship is intact. **Not** in `CLOSED_TO_OUTREACH`. Not drawn in red.
- **NO_TO_US** — "I do not want to work with you." Closed.

They are told apart deterministically, by whether the words reject *us*
(`stop contacting`, `remove me`, `unsubscribe`, …) rather than the offer.

**When the words are not clear, the softer reading wins.** Being wrong that way
costs a second look; being wrong the other way buries a customer. Tested against
`"not for me right now"`, `"no thanks"`, `"we're all set"` and an empty body.

## Current state derivation

One helper, `currentState()` in `lib/relationship.mjs`. Precedence:

1. **do-not-contact / unsubscribed** — a boundary somebody set outranks everything
2. **client / won** — the app's own business fact, not a reading of an email
3. **the newest meaningful event** — including Ary's corrections, which win by being newer
4. **the legacy stage** — for prospects predating all of this

The invariant: **newer explicit human evidence supersedes older classifier
conclusions, and never erases them.** An autoresponder or bounce writes no state
at all, so "Yes, send it over" cannot be overruled by an out-of-office an hour
later.

## History preservation

`relationship_events` is append-only. Nothing is ever updated or deleted; the
table has no UPDATE or DELETE path anywhere in the codebase, asserted by test.
A correction is a **new row**. `INSERT OR IGNORE` against a unique index means a
re-synced message or a retried classification records one event, not three.

## Manual correction

Ary disagreeing is stored with `source = 'human'` as its own event. The
classifier's original stays visible. A late-arriving classification of an
*older* message cannot undo a newer correction — but a genuinely newer reply
from the prospect wins over both. All three tested.

## Deferrals

The date is stored only when they actually gave one; an invented date is worse
than none. A deferral in the future does not ask for a person; one that has come
due does. A later positive reply supersedes it and the deferral stays in history.

## Timeline UI

`Conversation` on the prospect drawer, above Pipeline — a stage is where a
prospect sits, this is what they actually said.

A current-state card, then the events oldest-first with date, plain label, and
who decided (**You** / **LTB** / **Older record**). The latest is marked *now*.
Every label and sentence comes from the model through the API, so the page
cannot invent its own words or precedence; no enum is ever printed.

"This is not right" opens the correction menu, built from the vocabulary itself
so it cannot drift.

## Today integration

`WANTS_A_PERSON` covers `INTERESTED`, `RECONSIDERED`, `ACCEPTED_OFFER`,
`AMBIGUOUS` and `BUDGET_CONCERN`, plus deferrals that have come due.
`CLOSED_TO_OUTREACH` covers only `WON`, `NO_TO_US` and `LOST` — deliberately
**not** `NO_TO_THIS_OFFER`.

**Stop-on-reply is untouched.** Every human reply still stops the sequence,
including ones nobody can read, and a state change never restarts one — the
store contains no `enqueue`, no `sendApproved`, and no write to `prospects`.

## Name mismatch guard

An approved email to Mary Ann Johnson opened *"Hi Heidi,"*. A human caught it,
which is not a control.

`checkGreeting()` is deterministic — no model anywhere near it, asserted by
test. It runs inside `sendApproved`, the one function every native send passes
through, **before** the attempt row is claimed and before `sendMessage`. Bolting
it to a button would leave the other paths open.

Blocks only on a clear mismatch, returns `BLOCK.WRONG_NAME`, marks the package
terminal, and **never rewrites the name**.

Does not block: `Hi there` · `Hello,` · no greeting · Mary → Mary Ann ·
Chris → Christina · Bob → Robert · Jon ↔ John · Renée ↔ Renee · O'Brien ↔ OBrien ·
surname greetings · business-name greetings · single initials · a name mentioned
further down the body. When there is no contact name at all it reports UNSURE and
**does not block** — refusing to send to every record without a captured name
would block most of the list to prevent a problem there is no evidence of.

Two real bugs in it surfaced during testing: `"Hello,"` alone matched across the
newline and read the body's first word as a name, and `"Dear Dr. Chen,"` broke
because the capture excluded the period in the title. Both fixed.

## Legacy data

**No backfill.** Old prospects keep their single stage, read at display time and
marked `source: 'legacy'`. The old `Rejected` bucket maps to the **softer**
`NO_TO_THIS_OFFER`, because it held both kinds of no and guessing the harsher one
would re-bury exactly the people this work exists to find. No event sequence is
invented; a legacy state carries no timestamp, because there is none.

## Tests

**1,411 passing**, up from 1,346. 45 new in `tests/relationship.test.mjs`,
20 in `tests/name-guard.test.mjs`.

## Production

Commits `67b6349`, `21c026e`, `e9d50e9`. Served build verified from the server's
own `build.commit` at each step.

## Acceptance

Two clearly-marked test records, both since soft-deleted.

**6566** (no email, no domain — unsendable by construction) with the full story:

```
07-01 · Interested      · LTB
07-05 · Not this offer  · LTB
07-20 · Budget concern  · LTB
07-25 · Deferred        · LTB · until 2026-10-01
08-10 · Not this offer  · LTB
08-10 · Reconsidered    · LTB
08-10 · Accepted offer  · LTB
```

- **Current: "Accepted offer"**, `closed: false`, `needsPerson: true`
- **"The latest reply changed the earlier not this offer."**
- Both earlier "Not this offer" events **still present and unedited**
- Deferral kept its date

**Human correction, live:** setting it to Interested returned
`{ label: "Interested", source: "human" }`, and the timeline grew to eight
entries ending `Interested · You` — with all seven classifier events intact.

**NO_TO_THIS_OFFER vs NO_TO_US, proven by contrast:** record **6565** has the
identical event story but `do_not_contact = 1`, and reads *"Declined working
together"*, `closed: true`. A boundary somebody set outranks all the evidence.

**Zero sends:** 0 send attempts, 0 outreach packages, 0 new `send-approved` jobs
for either record. No Gmail provider id was created.

**Credits unchanged:** balance 498,100 and `spentAllTime` 1,900, identical either
side. 24 credit events appeared during the window — 12 automatic prechecks
charged 240 and all 12 refunded −240, **net zero**. That is the unattended sweep
hitting sites that would not load, a failure costing nothing exactly as designed,
and nothing to do with this pass.

### The name guard's production proof, stated honestly

**By test, not by a live send.** Attempting one would have proved nothing: the
test record is `do_not_contact = 1`, so `canSendNow` blocks it *before* the name
check ever runs. Removing that flag to force the path would mean pointing a real
send at a prospect record, which was not done. The guard's evidence is its 20
unit tests plus its verified position inside `sendApproved`, ahead of both the
attempt row and `sendMessage`.

### One bug caught by reading production, not by a test

The card first read *"The latest reply changed the earlier reconsidered"* —
meaningless, since reconsidering and then accepting is one movement.
`supersedes` now names the last genuinely **contrary** state, and claims nothing
when there is none. Fixed in `e9d50e9`.

Also caught while wiring the UI: the section asked for a `message-circle` icon
the set does not have, which rendered as an invisible gap. There is now a test
that walks every icon a component requests and fails if it is missing.

## Safety

- Scanner concurrency **2**. Hive, scheduler and daily-wake code untouched.
- Gmail transport, MIME, rendering, dedupe and `attemptKey` unchanged — asserted
  by test. The guard is pre-send validation only.
- Approval and sequence behaviour unchanged. Stop-on-reply unchanged.
- No real prospect contacted. Mary Ann's record was not read, modified or
  emailed.
- No email sent. No paid scan. **Zero credits spent by this pass.**
- `AUTO_SEND_FIRST = OFF`, `AUTO_SEND_FOLLOWUPS = OFF`.
- Both test records soft-deleted; their 15 relationship events retained as audit
  evidence.
- No monitor tasks from this pass left running.

## Remaining gap

**Historical replies already in `reply_events` have no relationship events.**
The timeline is correct from now on, but a prospect who replied last month shows
only their legacy stage until they write again. Reconstructing them is a lazy
per-prospect job over data the app already holds — no re-classification, no model
calls — and it is the one thing that would make this real for the existing list
rather than only for new conversations.

*(Noted separately and not fixed here: the automatic `VERIFY_SITE` refund path
still calls `refundCredits` without a prospect id, so those refunds cannot be
traced to a prospect. The human precheck path was fixed earlier. Money is
unaffected; it is an observability gap.)*
