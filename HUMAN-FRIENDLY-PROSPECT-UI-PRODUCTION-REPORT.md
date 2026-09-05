# Wiring the human-friendly routing into the screens

**Date:** 2026-08-11
**Commits:** `7965558` (the screens), plus the relationship-label fix below
**Tests:** 1,652 passing
**Emails sent: 0. Prospect rows written: 0. Jobs queued: 0. Model calls: 0.**

---

## Before

The routing engine shipped in `d62f1f5` and was correct. The screens still
asked the old question.

**Today** opened with a greeting, then a server exception queue, then an
approval queue, then "Watched your video", then a warm list, then a fenced-off
"Follow-ups in shadow" rehearsal, then three cadence groups built from
`next_action_date` — Overdue, Due today, Coming up — each row wearing a
coloured chip that said **Email 5**, then a footer card offering 4,700 rows
with no next action, and a right-hand rail of pipeline metrics. Six hundred of
those Email 5 rows were waiting for nothing at all.

**Prospects** was a spreadsheet with eighteen columns and a strip of ten
stage-led chips across the top: Due today, Due tomorrow, New, Prescreen,
Validated, Sent today, Sent yesterday, Needs email, To record, Video queued.
A row printed business, name and country at the same size on the same line,
with a stage chip on the right.

**A prospect page** opened with an editable name field, then Business and Niche
side by side, then four buttons — a form, before it said who the person was or
what was happening. Two separate technical disclosures sat inside it.

---

## Today

### After

One page, four sections, in the order they matter.

```
Morning, Ary
14 people need you today. 8 follow-ups are due, and nothing sends on its own.

  Needs you  (14)
    Needs your reply · 11 · View all 11 →
      Riverbend Dental
      Dan Okafor · United States
      Needs your reply
      2 emails sent · last contact Aug 6
      … 4 more rows …
    Watched your video · 2
    Gone quiet, or came back round · 1
    Video recorded, not sent · 1
    [ Work through them one at a time ]

  Ready for approval
    New outreach prepared under the current rules. Nothing sends until you approve it.

  Follow-ups
    Nothing sends automatically while follow-up automation is off.
    Due now (11)                      ← 8 rows drawn, longest overdue first
    32 coming up in the next 7 days   ← 3 rows drawn, then View all

  Needs attention  (220)
    Needs email address   160   [View]
    Timing unknown         52   [View]
    Needs a fresh check     8   [View]
```

### What is gone from Today, and why

| Gone | Rows it was drawing | Why |
|---|---:|---|
| Overdue / Due today / Coming up, grouped by `next_action_date` | up to 262 | Stage-led, duplicated the follow-up section, and every row said "Email 5" |
| "Needs a date" footer | 4,700 | The untouched import pile. Inventory, not work |
| Right-hand pulse + pipeline rail | — | A metric strip that never changed what Ary does next |
| "Follow-ups in shadow" framing | — | Fenced off as a rehearsal. It is the follow-up list; it says what it is |
| Every stage chip | all rows | The database's word for where a row sits |

### How many rows Today actually draws

From the live production data, run through the same code the browser runs:

| Section | Total | Rows drawn | Rest reached by |
|---|---:|---:|---|
| Needs you — replied | 68 | 6 | *View all 68 in Replied* |
| Follow-ups — due | 11 | 8 | *View all 11 due* |
| Follow-ups — coming up | 32 | 3 | *View all 32 coming up* |
| Needs attention | 220 | **0** | three counted lines, one *View* each |

**220 exception rows compress to three lines.** Not a truncated list — a count
and a sentence per kind, each linking straight into the Needs-attention tab
pre-filtered to that state. The caps live in `lib/today-sections.mjs`
(`NEEDS_YOU_LIMIT` 6, `DUE_LIMIT` 8, `UPCOMING_PREVIEW` 3), not in the JSX.

Nothing from **No address yet** (4,291), **Not contacted yet** (410),
**Sequence finished** (159) or **Old sequence finished** (622) reaches Today at
all. A test asserts it: sixty-one rows of inventory and history in, one row
drawn out.

---

## Prospects

### Six tabs, and what they hold

Fresh production counts, computed by running the shipped router over every live
row:

| Tab | Count | Holds |
|---|---:|---|
| All | 5,813 | Everyone except the internal test row |
| Not contacted | 4,701 | No address yet · Not contacted yet · Ready for approval |
| In outreach | 43 | Email 2 due · Email 2 coming up · Email 3 due · Email 3 coming up |
| Replied | 68 | Not this offer · Needs your reply · Interested · Deferred · Lost · Client |
| Needs attention | 220 | Needs email address · Timing unknown · Needs a fresh check |
| Finished | 781 | Sequence finished · Old sequence finished |

4,701 + 43 + 68 + 220 + 781 = **5,813**, plus the canary = 5,814. They
reconcile, and every count is taken from the rows the filters actually allow —
so clicking a tab always produces exactly the number printed on it. (An early
build counted from the whole store and rendered "All 35" above 24 rows; that is
fixed and the fix is why the counts are derived, not stored.)

Under the tabs, a **Narrow to** row of chips built from the rows in the open
tab. It never offers a state that would come back empty, and it shrinks as work
gets done. The ten stage-led lens chips still exist, moved into a closed
**Working lenses** disclosure — "what did I send today" is a real question, just
not the one the page is for.

### A row, before and after

**Before**

> Peak Development Strategies | Mary | AU · 36 days waiting · `Email 5`

**After**

> **Peak Development Strategies**
> Mary · Australia
> **Email 2 due**
> 1 email sent · last contact Jul 11
> *(Ary's rating, as its line icon, far right)*

Four levels, four weights, one fixed order: business, then who to write to and
where, then what happens next, then how it got there. Country codes are spelled
out. The rating renders as its line icon rather than the stored emoji, matching
the drawer's own rating menu.

**List** is the default. **Table** is one click away in the panel head and
completely unchanged — the spreadsheet is still the spreadsheet, and the choice
is remembered.

### What no longer appears on a row

prospect id · package id · package version · job kind · queue status · provider
message id · provider thread id · approval fingerprint · raw enum · raw ISO
timestamp · technical error code · the internal stage.

A test renders a row for a prospect at stage `Email 5` and asserts the visible
output contains "Email 2 due" and does *not* contain "Email 5", `prospect_id`,
`package_id`, `provider_thread`, `fingerprint`, `UNCLEAR` or `HOLD_`.

---

## Prospect detail

### After

```
Riverbend Dental
Dan Okafor · United States

Needs your reply
2 emails sent · last contact Aug 6

  NEXT
  They wrote back. The cold sequence stopped here.

[ Log a touch today ]  [ Snooze 7d ]  [ Emails ]  [ Show in table → ]

CONVERSATION            ← what they actually said, and how you got here
WHY WE CONTACTED THEM   ← the evidence, what was checked, how to reach them
OUTREACH HISTORY        ← recorded sends, oldest first
THE RECORD              ← everything editable
▸ System details        ← closed
```

**Next** is `state.detail` — the same sentence the router gives the row in the
list, so a prospect page and the list it came from cannot describe the same
person differently.

**Outreach history** is new, and it is honest about the gap it exposes:
production holds 6 recorded send events against thousands of counted emails, so
most prospects show

> The record counts 4 cold emails, but none of them were written down at the
> time. There is nothing here to show, and nothing worth guessing.

rather than four invented lines.

### Verified in the browser, one per state

Every one opened, read, and closed:

| State | Business shown | What Next said |
|---|---|---|
| Needs your reply | Riverbend Dental · Dan Okafor · United States | They wrote back. The cold sequence stopped here. |
| Email 2 due | The Paw Spa · Skye · New Zealand | Email 2 became due Aug 9. Nothing sends on its own while follow-up automation is off. |
| Timing unknown | Coastal Counselling · Elena · United Kingdom | LTB knows 2 emails sent, but the first email's date was never recorded, so it will not guess when the next one is due. |
| Needs email address | Reed Cycles · Owen Reed · United States | We contacted them before, but the record no longer has a usable email. |
| Sequence finished | Copper Kettle Cafe · Lena · United Kingdom | 3 emails sent. No more cold follow-up. |
| Old sequence finished | Fresh Start Cleaning · Noah · Canada | They already had 4 emails sent under the old sequence, which is more than the current one allows. Nothing goes out automatically. |
| Not contacted yet | Little Sprouts Daycare · Max · United Kingdom | Nothing has been prepared for them. |
| No address yet | Center for True Health · Deborah Lane | Nothing can be prepared until there is somewhere to send it. |

For all eight: System details closed, Outreach history present, and zero
`ALL_CAPS_CODE` strings anywhere above the disclosure.

---

## What 0 / 1 / 2 / 3 / 4+ sends looks like now

| Sends | Reads as | Tab | On Today? |
|---:|---|---|---|
| 0, no address | **No address yet** — *Nothing can be prepared until there is somewhere to send it.* | Not contacted | no |
| 0, address | **Not contacted yet** — *Nothing has been prepared for them.* | Not contacted | no |
| 0, draft written | **Ready for approval** | Not contacted | yes, under Ready for approval |
| 1 | **Email 2 due** / **Email 2 coming up** — *1 email sent · last contact Jul 11* | In outreach | yes |
| 1, address gone | **Needs email address** | Needs attention | as a counted line |
| 2, no Email 1 date | **Timing unknown** — *LTB knows 2 emails sent, but the first email's date was never recorded* | Needs attention | as a counted line |
| 3 | **Sequence finished** — *3 emails sent. No more cold follow-up.* | Finished | no |
| 4+ | **Old sequence finished** — *They already had 5 emails sent under the old sequence* | Finished | no |
| any reply | the relationship label, and cold outreach stops | Replied | yes, first |

Email 4 and Email 5 exist only as history. They are not a tab, not a chip, not
a filter, and not a row label.

---

## Fresh production bucket counts

Computed after this pass by running the shipped router over all 5,814 live rows
(a read; nothing was written):

| Label | Count |
|---|---:|
| No address yet | 4,291 |
| Old sequence finished | 622 |
| Not contacted yet | 410 |
| Needs email address | 160 |
| Sequence finished | 159 |
| Timing unknown | 52 |
| **Not this offer** | **36** |
| Email 2 coming up | 32 |
| **Needs your reply** | **17** |
| Email 2 due | 11 |
| Needs a fresh check | 8 |
| **Interested** | **6** |
| **Deferred** | **6** |
| **Lost** | **2** |
| **Client** | **1** |
| *(internal test)* | 1 |

Total 5,814. Two things moved against the accepted routing pass, both
deliberate:

**Email 2 due went 12 → 11.** One due date rolled over a day. Real activity, not
a rule change.

**The 68-strong replied pile is no longer one label.** It used to read "Needs
your reply · 66" and "Interested · 2", because in the browser the router had no
relationship to read — that table is a server read and the list is not. So
thirty-six people parked at the old "Rejected" stage were being described as
waiting for a reply they were not waiting for, and six deferrals looked like
unanswered mail.

The label is now recovered from the stage the prospect was parked at before
conversations were tracked, using `currentState`'s own legacy mapping — **for
the label only**. The schedule already ran, and it ran without a relationship
either way. Verified against all 5,814 live rows: the pile counts are
byte-identical (needs-you 68, not-contacted 4,701, needs-attention 220, finished
781, follow-up 43), and a test asserts no stage moves anybody between piles.

---

## Exception compression, exactly

220 rows → 3 lines. Each carries the router's own label, a sentence in words,
the count, and a *View* that lands on the Needs-attention tab with that state
already selected:

> **Needs email address** · 160 · *We contacted them before, but the current record has no usable address.*
> **Timing unknown** · 52 · *Two emails went out and the first one's date was never recorded.*
> **Needs a fresh check** · 8 · *Their last contact is too old for LTB to carry on automatically.*

No red, no warning icon, no exclamation. An address that needs finding is work,
not an error.

---

## Technical details: what moved behind the disclosure

One disclosure per prospect page, at the bottom, closed. There used to be two —
the prospect card carried its own halfway up the page — and the new one can see
records the old one could not, because it reads the send, package and job tables
through `GET /api/prospects/[id]/outreach` (a read: a test asserts the route has
no INSERT, UPDATE, DELETE or POST).

| Group | Holds |
|---|---|
| Record | prospect id · internal stage · action pile · action label · schedule status · schedule decision · schedule reason · Email 1 anchor · anchor source · next step · due at · priority band · band provisional · ceiling · emails sent · contact state and reason · verification state and reason · origin class and batch · source provider · site-check source · pending draft stale · do-not-contact · unsubscribed · deferred until · created / updated |
| Send · step N | send event id · sequence step · sent at · recorded via · channel · provider · **provider message id** · **provider thread id** · package id · package version · playbook · **approval fingerprint** · sent by · prepared by |
| Package N | package id · version · status · status reason · playbook · generator version · approved fingerprint · created / updated |
| Job · kind | job id · kind · **queue status** · attempts · error kind · last error · updated |

Rows with no value are dropped rather than printed as em dashes — a screen of
empty labels is wallpaper, not disclosure.

**On the brief's example error codes:** `FINGERPRINT_STALE`, `CONTACT_MISSING`
and `UNCLEAR_SEND_HISTORY` do not exist as strings in this codebase. The real
codes are `DUE.UNCLEAR`, `NEXT.HOLD_CONTACT_RECOVERY` and
`prospects.pending_draft_stale`, and `prospectActionState` already translates
every one of them into the exact sentences the brief asked for. The raw codes
are in System details. Browser-level failures (DNS, timeouts, blocked pages)
were already translated by `lib/friendly-errors.mjs`; its raw-text disclosure is
now labelled "System details" too, so there is one name for this everywhere.

One stage-led headline did survive into this pass and is fixed:
`lib/exceptions.mjs` was rendering **"Interested, and it is a conversation"** and
**"They are at Proposal Sent"** as card titles. Both now read **"A conversation
is open"** / *Cold outreach stopped here. What happens next is a message from
you.*

---

## The internal test row

Prospect 6567 already carried two markers set when it was created: `source =
'canary'` and `domain = 'example.invalid'`. No migration was needed.

It is in **no tab and no count**, so no number on any screen is one higher than
the work actually is, and it cannot be picked up by accident. It is not hidden:
searching for it finds it, and both the row and the prospect page carry an
**Internal test** badge. Its send state, packages and schedule were not touched.

---

## Mobile

Measured at 375 × 812, not eyeballed:

| Screen | Viewport | `document.scrollWidth` | Elements past the right edge |
|---|---:|---:|---:|
| Today | 375 | 375 | 0 |
| Prospects (list) | 375 | 375 | 0 |
| Prospect page (drawer) | 375 | 375 | 0 |

The drawer is 375px wide at that size. In Table mode the page still does not
scroll horizontally — the table scrolls inside its own `overflow-x-auto`
container, which is the intended behaviour.

---

## Browser acceptance — what was actually inspected

On a real dev server, against a local database seeded (locally only, then
deleted) with rows covering every display state, because the local seed had none
of them and the previous pass could not see its own work:

- **Today, desktop 1265px** — four sections in order; 14 in Needs you; Due now
  showing 8 of 8; "4 coming up in the next 7 days" with 3 rows and View all;
  Needs attention as four counted lines. **0** elements overflowing,
  **0** low-contrast text nodes, **0** `ALL_CAPS_CODE` strings on screen.
- **Today, mobile 375px** — same, no horizontal overflow.
- **Prospects, desktop** — six tabs summing to All; ten narrowing chips; list
  rows reading business / person · country / action / context. Console clean on
  a fresh tab.
- **Prospects, mobile 375px** — no overflow.
- **Prospect page × 8** — one per representative state, table above.
- **Table mode** — 44 rows, page scroll width equal to viewport, unchanged.
- **Search** — typing "canary" surfaces the internal row, badged, with the tab
  count following it rather than contradicting it.

**Contrast.** Every text node was measured with proper alpha compositing up the
ancestor chain against WCAG AA. Four real failures were found and fixed, all in
the new or newly-prominent UI:

| Element | Was | Now |
|---|---|---|
| Active tab chip, List/Table toggle, active lens chip | white on `--rose`, **3.05:1** | white on `--rose-btn`, **4.6:1** (the token that exists for exactly this) |
| "NEXT" label, System details group titles | `--ink-3`, **4.1:1** | `--ink-2`, **8.6:1** |
| Row label for finished states | `--ink-3`, **4.1:1** — and 622 rows carry it | `--ink-2` |
| Filters / Columns count badges | white on `--rose`, **3.05:1** | `--rose-btn` |

After the fixes: zero low-contrast text nodes on Today or Prospects at either
size.

**Screenshots.** I could not take any — the browser pane was not compositing
frames in this session, and the screenshot call timed out every time. Everything
above was read out of the live DOM and from computed geometry and colour, which
is stronger than a picture for overflow and contrast and weaker for taste. I am
not going to claim a visual pass I did not get.

---

## Performance

`prospectActionState` runs the whole follow-up schedule per prospect. Over 5,814
rows that is ~530ms, which is fine once and not fine on every optimistic edit,
since the store rebuilds the array each time a rating changes.

`lib/prospect-state-cache.mjs` caches the answer against the prospect **object**.
The store's update path replaces exactly one row and keeps the identity of the
rest, so editing one prospect now recomputes one prospect:

| | Cold | After one row is edited |
|---|---:|---:|
| `classify` over 5,814 rows | 689ms | **47ms** |

The cache is dropped when the workspace's day rolls over, since "due today" is a
claim about a date.

---

## Safety

Confirmed against production after the deploy:

| | |
|---|---|
| Live prospects | 5,814 — unchanged |
| `send_events` | 6 — unchanged |
| `send_attempts` | 4 — unchanged |
| `outreach_packages` | 12 — unchanged |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

No prospect history was changed. No stage was bulk-edited, no send count
touched, no date invented, no relationship event written, no package modified,
no draft prepared, no email sent, no job created, no model called by any page
load, no migration run. Gmail threading, the send engine, the send guard, the
dedupe rules, the scheduler and the canary's send state were not opened.

A test asserts it structurally: every file added by this pass is scanned for
`sendApproved`, `enqueue(`, `INSERT INTO`, `UPDATE `, `DELETE `, `askBackground`,
`anthropic`, `callAI` and any non-GET fetch, and must contain none of them.

The only production reads taken were `SELECT`s, to pull the columns for the
bucket recount above and to confirm the table counts.

---

## Tests

**1,652 passing, 0 failing** (from 1,623).

`tests/human-ui.test.mjs` is new — 29 tests covering: Today refusing the
inventory and history piles; the 220-row exception pile compressing to counted
lines with no rows; every cap and its hidden count; due follow-ups ordered
longest-overdue-first; the server queue claiming a prospect so Today does not
repeat them; the canary's markers, its absence from every tab and count, and its
badge; exactly six tabs, none of them a stage; every prospect landing in exactly
one tab with the counts reconciling; In-outreach holding only live cold
outreach; a ready-for-approval draft filing under Not contacted; the narrowing
chips being built from rows; the row hierarchy and its refusal to print a stage
or an identifier; the relationship labels and the proof they move nobody between
piles; System details holding every identifier and printing no empty rows; the
disclosure starting closed; the state cache; and the structural safety scans.

Nine existing tests were rewritten rather than deleted, because the guarantee
they held changed shape:

- The row-hierarchy tests now assert business-primary instead of person-primary.
- The chip tests are gone with the chips; rows carry the action state instead.
- The exception-queue test additionally asserts the stage never reaches a card
  headline — it used to *be* the headline.
- The three shadow-follow-up guarantees now point at `components/Followups.jsx`,
  and gained an assertion that the section cannot say "Sends itself", "Queued"
  or "Ready to auto-send" while both switches are off.
- The drawer test asserts the reading order of the whole page rather than the
  presence of a "Pipeline" heading.

`components/ProspectRow.jsx` and `components/ShadowFollowups.jsx` were deleted;
both were made dead by this change and neither had a second caller.

---

## Deployment

| | |
|---|---|
| Branch | `main` |
| Commit | `7965558` — *feat: the screens answer who needs me, what happened, what next* |
| Follow-up commit | the relationship-label recovery and its tests |
| Build | `next build` clean locally, including the new `/api/prospects/[id]/outreach` route |
| Deploy | Cloudflare Pages, built from `main` |
| Production | https://leadsthatbloom.com/ |

---

## Remaining UX gap

Honest list of what this pass did not close.

**Screenshots.** Not taken; see Browser acceptance. Every structural and
numerical claim above was measured, but nobody has looked at a picture of these
screens yet, and taste is not something the DOM reports.

**Outreach history is mostly empty, and that is the app telling the truth.**
Six recorded send events exist against thousands of counted emails. The section
says so instead of drawing plausible lines. Filling it in is a data-recovery
job, not a UI one.

**Relationship labels are recovered from the old stage, not from events.** The
`relationship_events` table holds 18 rows across 4 prospects, so for the other
64 in the Replied tab the label comes from the stage they were parked at. That
is the same fallback `currentState` already uses and it is marked as legacy in
the model — but it is a fallback. The list does not read the events table at
all; the prospect page's Conversation section does.

**"Needs a look" is a fourth exception kind.** The brief named three; the router
produces a fourth for records that do not say enough to work out what happens
next. It renders as a fourth counted line rather than being hidden.

**Today still opens with the greeting**, not the `# Today` heading the brief
sketched. The summary line under it does the helper's job and is counted from
the sections themselves, so it cannot disagree with the page.

**The exception queue's own sub-sections still render at zero.** "Needs your
decision · 0" and "Ready to reconsider · 0" appear inside Needs you with their
empty-state sentences. That is deliberate elsewhere in this app — "there is
none" and "you have not scrolled far enough" must not look identical — but it is
two extra lines on a page this pass spent its whole time shortening.
