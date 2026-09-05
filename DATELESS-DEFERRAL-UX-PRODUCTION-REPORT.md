# "Later", with nobody having written down when

**Date:** 2026-08-11
**Follows:** `dfdbb82` (Today is a work queue, Replied is the history)
**Tests:** 1,685 passing, 0 failing
**Emails sent: 0. Sends queued: 0. Model calls: 0.**

---

## The three current dateless deferrals

Read from production before anything was built, and **not touched**.

| id | Who | Where | Sent | Their reply | Stage |
|---:|---|---|---:|---|---|
| 937 | Dennis · Doolan Coaching \| Life Coach, Sober Coach | US | 5 | interested, 2026-05-06 | Snoozed |
| 1079 | Annalisa · Ask Annalisa \| Life Coach, Relationship Expert | US | 6 | interested, 2026-07-19 | Snoozed |
| 1464 | Irina Ertel · Nobody's Perfect Parenting | AU | 2 | **defer**, 2026-07-11 | Snoozed |

All three: `deferred_until` NULL, `deferral_reason` NULL, `deferral_source` NULL,
`next_action_date` NULL.

**Why no date exists.** `deferral_source` is null on all three, which means
`defer()` — the one function that writes a deferral date — was never called for
them. They were parked by the older flow, which set the stage to `Snoozed` and
nothing else. For 1464 the reply classifier read the message as a deferral and
recorded `reply_type = 'defer'`, but that path stored no date either.

**Is there a date hiding in the message text?** No, and there is nothing to be
tempted by: these three have **zero rows in `reply_events`** and **zero rows in
`relationship_events`**. No subject, no body, no classification record. Their
entire reply history is three columns on the prospect row. There is no phrase to
misread as a date, and nothing was inferred.

*(`lib/deferral.mjs` opens by naming "Kori Burkholder, Greg Lock, Irina Ertel
and Jane Lee" as the prospects sitting in exactly this state. Irina is one of
ours. The module was written for this and then never given a way in from the
UI.)*

---

## Canonical date ownership

Audited before writing anything. A deferral date lives in three places, and they
are not duplicates:

| Where | What it is | Owner |
|---|---|---|
| `relationship_events.defer_until` | what they asked for, on the event that says they asked | `recordEvent` |
| `prospects.deferred_until` | the structured record of the promise | `defer()` |
| `prospects.next_action_date` | the operational date the outbound guard reads | `defer()` |

`lib/deferral.mjs` writes the last two **together**, and its own comment says
why they can legitimately differ from each other's intent. That is the only
place that decides what a deferral date is, so it stays the only place.

Due-ness is decided by `currentState` → `wantsAPerson` → `isDue`. Future
deferrals are kept off Today by `todaySections` reading
`state.relationship.needsPerson`. A human correction is appended by `correctTo`
→ `recordEvent`, which is `INSERT OR IGNORE` and never updates or deletes.

**No second truth was created.** Setting a date goes through `defer()` for
validation and through `correctTo()` for history, from one endpoint.

Three small things were extended rather than duplicated:

- `correctTo` now accepts `deferUntil`, so a correction can carry its date onto
  the event. It could not before, which is how a date and the event that
  promised it came apart.
- `standingOf` accepts `legacyDeferUntil`, so a prospect whose only record is
  the old stage can still be asked whether its wait is over.
- `defer()` now checks the date is a **real day**. It validated shape only, so
  `2026-13-45` passed — and that value would have been written to
  `next_action_date`, which the send guard reads.

---

## UI, before and after

**Before**

> **Deferred** · *No date was given · 6 emails sent · last contact Jul 4*

True, visible, and unresolvable from the screen it was visible on. It would say
that every morning for ever.

**After** — the same row, with a card under it:

> They asked to reconnect later, and no follow-up date was recorded. Nothing
> will bring them back on its own.
>
> [ **Set a date** ]  [ Reply now ]  [ Not this offer ]
>
> *To close the relationship entirely, open them and use the correction menu
> under Conversation. It is deliberately not a button here.*

It appears in all three places a dateless deferral can surface: the server's
exception queue, the client-side Needs-you list, and the prospect's own page
under **Next**.

---

## Set date

Opens a normal date picker inline, echoes the choice in words ("Come back
Sep 24"), and on save posts one request that does two things:

1. appends a `DEFERRED` relationship event, source **human**, carrying the date
2. writes `deferred_until`, `next_action_date` and `deferral_source = 'ary'` to
   the prospect row, via `defer()`

Verified end to end against a real record:

```
before   deferred_until: null    next_action_date: null    timeline: 0 events
after    deferred_until: Sep 24  next_action_date: Sep 24  timeline: DEFERRED · deferUntil Sep 24
         stage: Snoozed (unchanged)   emails_sent: 5 (unchanged)   replied: 1 (unchanged)
```

The prospect leaves Today immediately and reads, in Replied:

> **Deferred** · *Waiting until Sep 24 · 5 emails sent · last contact Jul 5*

Setting today or a past date correctly leaves them due. **No cold-send timing
changed**: the row's stage, send count and last-contact date are untouched, and
`rejoinsColdSequence()` still returns false — a woken deferral is a conversation,
not step N of a sequence.

---

## Reply now

Opens the prospect, where the Conversation section already lives. It **writes
nothing at all** — no state, no date, no event, no draft, no send. A test slices
that branch out of the source and asserts it contains no `fetch(` and no
`send(`. Merely looking at somebody must not change what they are.

On the prospect page itself the button is absent, because you are already there.

---

## Relationship-close semantics

The brief asked for care here and the audit says the care is warranted.

`NO_TO_THIS_OFFER` and `NO_TO_US` are a live relationship and a closed one.
`CLOSED_TO_OUTREACH` holds `WON`, `NO_TO_US` and `LOST` — and **deliberately not**
`NO_TO_THIS_OFFER`, with a comment saying that conflating them is what used to
bury people.

So there is **no "No follow-up" button**. That phrase reads as both, and one of
its meanings is irreversible.

| Action | Where | What it means |
|---|---|---|
| **Not this offer** | the card | They turned this offer down. Relationship open. Leaves Needs you, stays in Replied. |
| Close the relationship | the existing correction menu, on the prospect page | `NO_TO_US`. Comes with `explain()`'s own sentence. |

The correction menu already existed and is driven by `Object.values(REL)`, so it
cannot drift from the vocabulary. It is reused, not rebuilt. A test asserts the
card's source contains no `NO_TO_US` and no `do_not_contact`, and does contain a
pointer to where the stronger action lives.

---

## ⚠️ A hole this opened, and closed

"Not this offer" from Today did not stick.

The correction is written to `relationship_events`, which is a server read. The
Prospects list and the client-side Needs-you list read the prospect row, so they
never saw it: the person would be filed correctly for a moment and then come
straight back as a dateless deferral on the next load.

Fixed by having `/api/prospects` return **only Ary's own corrections** — the
latest `source = 'human'` event per prospect — which the client runs back through
`currentState`. Classifier guesses and the legacy reconstruction stay
server-side deliberately.

Why so narrow: passing the *full* relationship into the list was measured first,
and it moves **84 prospects** between tabs (Needs attention 220 → 146, Finished
781 → 843), almost all of it do-not-contact and unsubscribed rows re-reading as
Closed. That is arguably more truthful and it is emphatically not this brief.
It is written down here as the next decision, not made quietly inside this one.

**Production delta of the change actually made: zero.** There is exactly one
`source = 'human'` event in production, on prospect 6566 — a lifecycle test
record that is not in the live set at all. Re-run over all 5,814 rows with the
correction applied: every tab count identical, Needs you 26 → 26.

---

## History preservation

Append-only, and it stays that way.

`lib/relationship-store.mjs` contains `INSERT OR IGNORE INTO relationship_events`
and no `UPDATE relationship_events` or `DELETE FROM relationship_events`. Tests
assert both absences.

Verified by doing it: setting a date wrote one `DEFERRED` event, then correcting
to "not this offer" wrote a second. The first survived with its date intact, and
the current state read from the newer one:

```
timeline  DEFERRED  deferUntil 2026-09-24
          NO_TO_THIS_OFFER
current   Not this offer — "They turned down this particular offer.
          Keep the relationship open unless something else says otherwise."
```

---

## Today behaviour

| After | Result |
|---|---|
| Set a future date | leaves Today until that date |
| Set today or a past date | stays due |
| Reply now | unchanged; the conversation decides |
| Not this offer | leaves Needs you, stays in Replied |
| Close the relationship | leaves Needs you, closed under canonical policy |

Watched in a browser against seeded copies of all three real shapes plus a
dated control:

```
Needs you 9  →  set a date on one, correct another  →  Needs you 6
```

- Irina (date set to Sep 24) — gone from Today, in Replied as *Waiting until Sep 24*
- Dennis (date set, then corrected) — gone from Today, in Replied as *Not this offer*
- Annalisa (corrected, no date) — gone from Today, in Replied as *Not this offer*
- Harbour Law (dated three weeks out, the control) — never on Today at all

Nobody is stuck on Today for ever any more.

---

## Prospect detail

The same card, under **Next**, so nobody has to go back to Today to fix a record
they are already looking at:

> **Deferred**
> NEXT · *Asked for later, with no date given.*
> They asked to reconnect later, and no follow-up date was recorded…
> [ Set a date ] [ Not this offer ]

---

## Safety

Untouched: the cold follow-up generator, the V2 scheduler, `sendApproved`,
Gmail, send events, the canary, threading, touch ceilings, evidence rules, the
auto-send switches.

No email sent. No send job created. No model call. No bulk correction — **the
three real prospects were read and not modified**; the deploy gives Ary the
buttons and she chooses.

The one guarantee that had to change did so precisely rather than vanishing. A
test used to ban the string `UPDATE prospects` in the conversation route. That
route now has exactly one, and the test asserts it: exactly one `UPDATE
prospects`, containing `deferred_until`, `next_action_date`, `deferral_source`
and `updated_at`, and containing **none** of `stage`, `emails_sent`,
`last_contact_date`, `replied`, `rating`, `do_not_contact`, `unsubscribed`,
`pending_draft`. A timeline that can edit a stage or a send count is not a
timeline.

---

## Tests

**1,685 passing, 0 failing** (from 1,670).

`tests/dateless-deferral.test.mjs` is new — 15 tests:

1. a wait with no date is work, and says so in words
2. a wait with a date ahead of it is not work
3. a wait whose date has come round is work again
4. setting a date takes them off Today until it arrives
5. setting today or a past date leaves them due
6. a date is validated by the one module that owns what a date is
7. the exception queue marks the dateless wait and only that one
8. not this offer leaves Needs you and keeps the relationship open
9. closing the relationship is a different state, and stays out of one click
10. the card offers three ways out and no jargon
11. reply now writes nothing at all
12. a correction is appended, never an edit of what came before
13. the original deferral survives a correction
14. nothing in this pass can send, queue or change a cold sequence
15. a woken deferral is still not a cold email

Plus one rewritten in `tests/relationship.test.mjs` (the narrowed write
guarantee above).

---

## Browser acceptance

Desktop and 375 × 812, read from the live DOM and from computed geometry and
colour:

| | |
|---|---:|
| Cards rendered on Today (3 dateless rows) | 3 |
| Horizontal overflow, Today @375 | 0 |
| Horizontal overflow, prospect page @375 | 0 |
| Low-contrast text nodes @375 | 0 |
| Date picker fits the viewport @375 | yes |

**Screenshots: none.** The browser pane did not composite frames in this session
and every screenshot call timed out. This is a structural and behavioural check,
not an aesthetic one.

*(A note for future local work: the local D1 was missing `relationship_events`
entirely — migration 053 had never been applied there. Applied locally so the
verification was real. Production has always had it.)*

---

## Production commit

| | |
|---|---|
| Branch | `main` |
| Build | `next build` clean |
| Deploy | Cloudflare Pages from `main` |
| Production | https://leadsthatbloom.com/ |
| Both auto-send switches | **OFF** |

---

## Remaining UX gap

Nothing material remains in this chapter. **The existing-prospect / Today UX
chapter is complete**: the router is canonical, the three screens read it, Today
is a work queue, Replied is the history, and the last three rows that could not
be resolved from the UI now can be.

One decision is written down and deliberately not taken: **whether the Prospects
list should read the full relationship state, not just Ary's corrections.** It
would move 84 prospects — Needs attention 220 → 146, Finished 781 → 843 — mostly
do-not-contact and unsubscribed rows that currently read as "Needs email
address" and would read as "Closed". That is probably more truthful and it is a
measured decision of its own, not a side effect of a deferral cleanup.
