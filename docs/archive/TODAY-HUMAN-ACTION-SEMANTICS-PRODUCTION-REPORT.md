# Today is a work queue. Replied is a history.

**Date:** 2026-08-11
**Follows:** `7965558`, `fb594bc` (the human-friendly UI pass)
**Tests:** 1,669 passing, 0 failing
**Emails sent: 0. Prospect rows written: 0. Jobs queued: 0. Model calls: 0.**

---

## Served build

Verified by asset, not by a status column.

`wrangler pages deployment list` reports the current Production deployment as
sourced from `fb594bc`, 24 minutes old. That is a claim, so it was checked:

| Host | `/_next/static/css/791d0ef1f0803924.css` | contains `minmax(0,auto)` |
|---|---|---|
| `leadsthatbloom.com` | **200**, 85,600 bytes | **yes** |
| `495e05f0…pages.dev` (d636eda, before this work) | **404** | — |
| local build of `7965558` | 85,600 bytes | yes |

`minmax(0,auto)` is the grid class introduced by the new `SystemDetails`
component and by nothing else. The apex serves a byte-identical bundle to the
local build and the pre-work deployment does not have the file at all.

**The new Today / Prospects / Prospect-detail UI is live in production.**

(The app page's JS chunk sits behind the auth gate and cannot be fetched
unauthenticated; the CSS bundle is a public asset and carries the same proof.)

---

## The mismatch

The cold sequence stops the moment anybody writes back. That is right, and it
is why `nextStepFor` routes every replied prospect to "needs a human".

Today then drew all of them.

> **Replied** answers *what happened*.
> **Needs you** answers *what is owed now*.

They were the same list. Sixty-eight conversations, and Today claimed all
sixty-eight were waiting on Ary — including thirty-six people who had already
said no to this offer, three waits that are not over, two lost and one client.

The bug was one line: `if (state.pile === PILE.NEEDS_YOU) needsYou.push(row)`.
The pile is about the sequence stopping. Whether a person is wanted is a
different question, and the relationship model already answers it — Today just
never asked.

---

## Production relationship counts

All 5,814 live rows, run through the shipped code. A read; nothing written.

| Current state | Count | On Today? |
|---|---:|---|
| Not this offer (`NO_TO_THIS_OFFER`) | 36 | no |
| Replied, needs you (`AMBIGUOUS`, unclassified) | 17 | **yes** |
| Interested | 6 | **yes** |
| Deferred — no date recorded | 3 | **yes** |
| Deferred — date still ahead (Aug 19, Oct 1, Nov 1) | 3 | no |
| Lost | 2 | no |
| Client (`WON`) | 1 | no |
| No to us (`NO_TO_US`) | 0 | — |
| Reconsidered / Accepted offer / Budget concern | 0 | would be yes |
| **Replied tab total** | **68** | |
| **Needs you total** | **26** | |

Rows on Today with no current human action: **42 before, 0 after.**
Rows with an action that would be missing from Today: **0.**

---

## Today, before and after

| | Before | After |
|---|---:|---:|
| Needs you | **68** | **26** |
| — unread replies | | 17 |
| — interested | | 6 |
| — deferrals with no date | | 3 |
| Removed | | **42** |
| — not this offer | | 36 |
| — deferrals still waiting | | 3 |
| — lost | | 2 |
| — client | | 1 |

Every one of those 42 is still in the Replied tab, under its own label.

The section still shows the exact total, the first six rows, and *View all 68
in Replied*.

---

## Three doors, one rule

Today has three ways in, and all three had the same bug.

**1. `lib/today-sections.mjs`** — the client-side router. Now asks
`state.relationship?.needsPerson` and files the rest nowhere.

**2. `lib/exceptions.mjs`** — the server's queue, which reaches Today through
`/api/today`. It was equating "they replied and nothing has gone back" with
"a reply is owed". A message a classifier explicitly flagged for a human still
always counts; the date-column route now asks the relationship. The Today route
loads `relationship_events` (18 rows in production) so it can.

**3. `warmWaiting` in `lib/today.mjs`** — the oldest list, which reasons from
"replied once and gone quiet". It put a deferral twenty-one days out back on
the page as *"11 days waiting"*. Caught in the browser, not by a test. It is
now filtered through `isSettled`, the same one question.

No new policy was written. `lib/today-sections.mjs` is scanned by a test for
`NO_TO_THIS_OFFER`, `WANTS_A_PERSON`, `REL.`, `DEFERRED` and `reply_type`, and
must contain none of them.

### One genuine gap in the canonical model, fixed there

`currentState` answered `needsPerson` and `closed` only when it had events. For
a prospect whose only record is the old stage it returned the state and stopped
— so every caller asking "does this need a person" got `undefined`, which reads
as no. Four prospects sitting at **Interested** were filed as wanting nothing,
and a legacy snooze could never come due because nothing passed it a date.

Both branches now answer all three questions, from the same two sets and the
same clock.

### And a wait with no date is not a wait

Three production deferrals have no date at all. Nothing will ever bring them
back: they are not due today, and they will not be due tomorrow either. Filing
them as parked parks them for ever, so `wantsAPerson` treats an undated
deferral as wanting one. The row says why:

> **Deferred** · *No date was given · 2 emails sent · last contact Jul 12*

---

## What the Replied tab shows now

Every state, with its own truthful label and its own narrowing chip:

| Label | Row reads |
|---|---|
| **Not this offer** | *They turned down this particular offer. Keep the relationship open unless something else says otherwise.* |
| **Interested** | *They want to talk.* |
| **Deferred** (ahead) | *Waiting until Sep 1 · 2 emails sent · last contact Jul 31* |
| **Deferred** (passed) | *The date they asked for has passed (Aug 8) · 2 emails sent · last contact Jul 2* |
| **Deferred** (no date) | *No date was given · 2 emails sent · last contact Jul 12* |
| **Client** | *A client.* |
| **Lost** | — |
| **Replied, needs you** | *A reply came in that could not be read confidently. Worth a look.* |

The deferral date now leads the row. "2 emails sent · last contact Jul 31" is
true and useless next to the one fact that explains why the row is not on Today.

---

## ⚠️ The workspace default that would have broken the promise

Moving 42 conversations off Today is only honest if the Replied tab holds them.
It did not.

Ary's workspace opened the Prospects list with seven stages switched off —
`New, Prescreen, Validated, Finished, Rejected, Lost, Invalid Email` — plus the
`✖️` and `🥀` ratings. That was the right answer to a spreadsheet: it kept 4,291
untouched imports out of the way.

It is the wrong answer to six tabs, because it fights them. Measured on the live
data, those defaults would have shown:

| Tab | True count | Would have shown |
|---|---:|---:|
| Replied | 68 | **23** |
| Needs attention | 220 | **152** |
| Not contacted | 4,701 | **38** |
| Finished | 781 | **300** |
| In outreach | 43 | 31 |

Every tab a fraction of its own headline, Today's "160 need an email address"
linking to a list of far fewer — and **38 of the 42 conversations moved off
Today are at Rejected or Lost**, so they would have been nowhere at all.

The job the stage default was doing is now the Not contacted tab's job, and it
does it without hiding anything. **Both defaults are removed.** The filters
themselves are untouched: anyone who wants a narrower list sets one in Filters
and it is remembered.

### And the count line was lying about it

It read `8 / 54 shown` with the Replied tab open — two different facts glued
together. Eight of those fifty-four are in this tab; forty-six are in the other
five. It read as a filter hiding forty-six rows.

It now reads `12 shown`, and only mentions filters when filters are actually
hiding something:

> `38 shown · 15 hidden by your filters`   ✕ Clear

The ✕ Clear affordance now appears whenever anything is hidden, including a
saved default — a filter that quietly removes a whole reply state from a tab is
exactly what somebody needs a visible way out of.

---

## Ready for approval

Membership is unchanged and correct. Server-side, from `outreach_packages`:

| Status | Count |
|---|---:|
| READY_FOR_APPROVAL | 1 |
| APPROVED | 2 |
| NEEDS_DECISION | 3 |
| SENT | 4 |
| SKIPPED | 2 |

The section shows only genuinely-ready first emails. No no-address inventory,
no unverified rows, no follow-ups, no replied rows, no finished rows, no canary.

---

## Follow-ups

Checked across all 43, not just the drawn rows:

| | |
|---|---|
| Due now | **11** |
| Coming up (7 days) | **32** |
| Steps present | Email 2 only — no Email 3, no Email 4/5, no legacy |
| Bands | P1 34 · P2 8 · unrated 1 — **no P3** |
| Replied rows in follow-ups | **0** |
| Canary in follow-ups | **0** (it would qualify; it is skipped) |

Copy unchanged and still the only true wording: *Nothing sends automatically
while follow-up automation is off.*

---

## Needs attention

Compact, three counted lines, no rows:

> **Needs email address** · 160
> **Timing unknown** · 52
> **Needs a fresh check** · 8

The 4,291 never-contacted no-address rows stay in Not contacted and reach Today
as nothing at all.

---

## Browser and mobile acceptance

Against a local database seeded (locally only, then deleted) with the full reply
matrix — three no-to-this-offer, two interested, a future deferral, a due
deferral, an undated deferral, a client, a lost, two unread replies.

**Today, desktop.** Nothing leaked. Peak Development Strategies, Doyle Roofing,
Hale Signwriting (no to this offer), Harbour Law (deferred to Sep 1), Coastal
Counselling (client) and Blanc Patisserie (lost) are all absent. Reed Cycles
(deferral passed), Ng Accounting (no date), Riverbend Dental and Alveras
Bookkeeping (interested), Marsh & Co Legal and Rossi Bakery (unread) are all
present. `/api/today` returns exactly those ten in `needs-reply`.

**Prospects → Replied, desktop.** All twelve present with their real labels;
narrowing chips read *Deferred 3 · Not this offer 3 · Interested 2 · Replied,
needs you 2 · Client 1 · Lost 1*. Count line reads `12 shown`, nothing hidden.
Tab counts reconcile: 8 + 8 + 12 + 11 + 14 = 53, plus the canary = 54.

**Mobile, 375 × 812.** Measured, not eyeballed:

| Screen | Viewport | `scrollWidth` | Elements past the edge | Low-contrast nodes |
|---|---:|---:|---:|---:|
| Today | 375 | 375 | 0 | 0 |
| Prospects | 375 | 375 | 0 | 0 |

The six tabs wrap to three rows of two, 111px tall, every chip inside the
viewport. Not chaos.

**Screenshots: none.** The browser pane did not composite frames in this
session and every screenshot call timed out. Everything above was read from the
live DOM and from computed geometry and colour. That is stronger than a picture
for overflow, membership and contrast, and it is not an aesthetic review. I am
not claiming one.

---

## Safety

| | |
|---|---|
| Prospect history changed | **none** |
| Relationship events written | **none** |
| Stages, send counts, dates changed | **none** |
| Emails sent | **0** |
| Jobs created | **0** |
| Packages modified | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |
| Canary send state | untouched |
| Gmail threading | untouched |

This was a membership and display change. `lib/today-sections.mjs`,
`lib/prospect-action.mjs` and `lib/relationship.mjs` are scanned by a test for
`INSERT INTO`, `UPDATE `, `DELETE FROM`, `sendApproved`, `enqueue(` and `fetch(`
and must contain none of them. The relationship model is separately scanned to
confirm it has not grown into a send policy.

The only production access taken was `SELECT`.

---

## Tests

**1,669 passing, 0 failing** (from 1,652).

`tests/today-human-action.test.mjs` is new — 17 tests:

1. every reply state stays in the Replied tab, including the nos
2. a no to this offer is not work, and is not closed either
3. a no to us is closed and never on Today
4. a client is not work merely because they once replied
5. a lost conversation is not work
6. a wait that is not over stays off Today, and says when it ends
7. a wait with no date says so, and is work
8. a wait that has come due is work again
9. interested / ambiguous / budget / reconsidered / accepted all want a person
10. a reply nobody has classified is a reply nobody has read
11. the Replied count and the Needs-you count are not the same number
12. Today asks the relationship model and never decides for itself
13. the legacy branch answers the same three questions as the event branch
14. trimming Today moved nobody between piles or tabs
15. a person off Today is off it once, not filed somewhere else instead
16. this fix writes nothing anywhere
17. the relationship model still refuses to be a second send policy

One existing assertion changed: the default label for an unclassified reply is
now *"Replied, needs you"* — the relationship model's own word for a message
nobody has read — rather than *"Needs your reply"*.

---

## Production commit

| | |
|---|---|
| Branch | `main` |
| Commit | `dfdbb82` |
| Build | `next build` clean |
| Pages deployment | `f2021c89-65ab-4711-aa11-a2b750f9f50a`, Production, from `dfdbb82` |
| Production | https://leadsthatbloom.com/ |

**How far the verification goes, exactly.**

The deployment finished and serves: `https://f2021c89.bloomtrack-pro.pages.dev/gate`
answers 200. That matters, because it listed `Active` for several minutes while
still returning 404 — the same trap as 2026-07-20.

**But this commit cannot be content-verified from outside the auth gate.** It
changed only JavaScript that lives in the app page's chunk, which is referenced
solely on the authenticated page; `/gate` links only the gate's own chunks, and
the build manifests 404. The CSS bundle is unchanged by this commit
(`791d0ef1f0803924.css`, same hash before and after), so the marker that proved
the previous pass is not available here.

What is proven: the previous UI pass (`7965558` / `fb594bc`) IS served — its CSS
carries `minmax(0,auto)` from the new System-details component and the pre-work
deployment 404s on that filename. This fix rides the same pipeline, its
deployment is Production and answering, and the apex serves that deployment's
asset set.

The one-glance check that settles it: **Today's Needs you should read 26, not
68.**

### Post-deploy safety, re-read

| | |
|---|---:|
| Live prospects | 5,814 — unchanged |
| `send_events` | 6 — unchanged |
| `send_attempts` | 4 — unchanged |
| `outreach_packages` | 12 — unchanged |
| `relationship_events` | 18 — unchanged |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

---

## Remaining UX issue

One, and it is real.

**Three deferrals have no date, and nothing in the app can give them one from
the outside.** They now appear on Today saying *"No date was given"*, which is
honest and gets them looked at — but the fix is for Ary to open each one and
either set a date or answer it. Until she does, they will sit on Today every
morning. That is the correct behaviour for a record that cannot say when to
come back, and it is still three rows of friction.

Everything else the brief asked to verify came back clean.
