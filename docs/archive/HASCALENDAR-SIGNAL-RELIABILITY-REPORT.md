# A picture of a calendar is not a calendar

Date: 2026-08-12 · commit `3606b37` · Cloud Run `audit-render-00177-7bz` · tests 1,937 passing

Every page of Cynthia's site reported a booking calendar. There was never one.
The signal is now about interactive scheduling rather than the word, real
calendars still register on all three controls that have one, and **no persisted
row and no sent email ever depended on the false version.**

**Spend: 0 credits.** No prospect was refreshed.

---

## Part 1 — the false positive, from the live page

Read in a browser against
`openheartsopenmindscounseling.com/information-contact-request`, matching the
selector the detector used:

```json
{ "slotUiCount": 1,
  "elements": [ { "tag": "SPAN", "cls": "icon-calendar-plus-o icon",
                  "w": 0, "h": 0, "choices": 0, "inSvg": false } ],
  "pickers": 0,
  "iframes": [] }
```

One match. A **0 by 0 icon-font span** whose glyph is drawn by a `::before`
rule, containing nothing clickable. No picker. No iframe.

> **Cynthia reports `hasCalendar = true` because `slotUi` counts any element
> whose className matches `/calendar|timeslot|time-slot|datepicker|availabilit|time-picker/`,
> and an icon-font class satisfies that on its own.**

## Part 2 — the inventory

`hasCalendar` was `pickers > 0 || slotUi > 0 || vendorFrame`, computed in **two
identical copies** of the same code: `calendarOnPage()` and again inside the
crawl's page evaluate.

| Input | What it was | Verdict |
|---|---|---|
| `input[type=date\|time\|datetime-local]` | a real date or time control | strong |
| `select[name*=date i]`, `select[name*=time i]` | a date or time dropdown | weak — matches a birthday field |
| `iframe[src]` matching the booking vendor list | a provider's scheduling embed | strong |
| **class contains `calendar` etc.** | **any element, any size, any content** | **unsafe** |

The last row is the whole defect. It made no distinction between a month grid
and a glyph, and it was the only signal firing on Cynthia's site.

## Part 3 — what counts now

The collection stays in the browser, where the DOM is. **The judgement moved to
`services/audit-render/calendar-evidence.mjs`**, in one place, where it can be
tested against the shapes real sites returned rather than a mock of a browser.

A class match is now a *candidate*. It becomes evidence only if it is:

- **not an icon** — `icon-`, `fa-`, `fas`, `far`, `glyphicon-`, `material-icons`,
  `feather-`, `bi-`, `mdi-`, `ion-`, `svg-inline-`
- **not a drawing** — not `<i>`, `<svg>`, `<path>`, `<use>`, `<img>`, and not
  inside an `<svg>`
- **big enough to use** — at least 40 by 40, which the 0 by 0 span is not
- **something to choose between** — at least four of
  `button`, `[role=button]`, `[role=gridcell]`, `[role=option]`, `td`, `option`,
  `input`, `select`, `a[href]`

A month grid has around thirty. A list of appointment times has several. A
decorated heading has one or none.

Date and time inputs are also filtered for fields that hold a date but schedule
nothing: `birth`, `dob`, `expir`, `issued`, `anniversar`, `since`, `founded`.

> The word or icon "calendar" is not evidence that a visitor can schedule an
> appointment.

**This is not a blacklist of `icon-calendar-plus-o`.** That class is one member
of a family, and the family is what is excluded — the tests assert ten icon-font
conventions, not one string.

## Part 4 — tests

`tests/calendar-evidence.test.mjs`, 16 behavioural tests through the real
`judgeCalendar` and `isSchedulingWidget`. The Cynthia fixture is the exact
element the browser returned.

| Must be false | Must be true |
|---|---|
| Cynthia's `icon-calendar-plus-o` span | a month grid, 35 choices |
| ten icon-font class conventions | a time-slot list, 9 choices |
| an `<svg>` or anything inside one | an availability panel, 20 choices |
| a decorated heading with one link | a recognised scheduling iframe, alone |
| anything under 40 by 40 | a date or time picker, alone |
| anything with fewer than four choices | Sabine's inline Acuity widget |
| a birthday, expiry or anniversary field | |
| missing or malformed input | |

Suite: **1,937 passing**, up from 1,921.

## Part 5 — live acceptance, all five controls

| Prospect | Expected | Result |
|---|---|---|
| **4860 Cynthia** | false calendar gone, finding survives | ✅ `hasCalendar=False` on all four pages, was `True` on all four. Keys still `contact-page-no-form`, `no-hours`, `no-reviews` |
| **6439 Sabine** | real calendar still detected | ✅ `hasCalendar=True` on all four pages. Booking link resolves to `sabinelehnhardt.as.me`. No false request-form claim |
| **6470 Katie** | real calendar still detected | ✅ `hasCalendar=True` on all four pages. No booking claim |
| **6452 James** | real booking flow unchanged | ✅ keys `stale-copyright`, `no-hours`. His correctness rests on `furtherStep: true`, not on `hasCalendar` |
| **6454 Player One** | request-form finding unchanged | ✅ `booking-is-a-form` remains, `hasCalendar=False` |

Real calendar detection did not collapse. Two sites that have one still report
it on every page; the one that never did now says so.

## Part 6 — what the false signal actually polluted

Read-only audit across every prospect carrying site intel:

| Query | Count |
|---|---|
| Prospects with persisted `site_intel` | 100 |
| …carrying the `booking` good finding | **0** |
| …carrying `booking-is-a-form` | **1** (6454 Player One, verified true) |
| Packages with a booking reason | 6 |
| …belonging to a real prospect | **0** |

The six booking packages belong to `6545`–`6549`, every one an internal test
record: `hello@bloomwired.io`, `hello+nativesend@bloomwired.io`, and three
addressed to `arylombres@gmail.com`.

**No real prospect ever received a booking claim, true or false.**

That is consistent with the shape of the bug. `hasCalendar` being wrongly true
could only ever *suppress* a request-form claim, which is under-claiming, and
the one spoken thing it could have produced — the `booking` compliment — appears
on zero rows.

## Part 7 — persistence

**Nothing was refreshed and nothing needed to be.** No persisted row's future
action depends on the false signal: the only surviving `booking-is-a-form` is
Player One's, which is independently verified, and no prospect carries a
calendar compliment.

Cynthia was explicitly not refreshed. Her `site_intel_at` is unchanged at
`2026-08-12T05:06:51.079Z`, and the diagnostic signal was never her approved
reason.

**Credits spent: 0.**

## Deployment

| | |
|---|---|
| Commit | `3606b37` |
| Revision | `audit-render-00177-7bz` |
| Traffic | 100% |
| Image | `audit-render@sha256:e794eaf3d6aeebae1b1310f781d3ee37fc5f5333956d748cda1c6f644f141579` |
| Tests | 1,937 passing |

## Safety

| | |
|---|---|
| Emails sent | 0 |
| `send_events` for 4860 | 0 |
| Package 19 | `APPROVED`, `sequence_approved` 1, `sequence_max_step` 2, `allowed_length` 2 — untouched |
| Cynthia `emails_sent` | 0 |
| Cynthia `site_intel_at` | unchanged |
| Packages created or approved | 0 |
| Contacts adopted | 0 |
| Credits | 0, balance 497,720 unchanged |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

Five sites were checked, all five named in the brief. No broad re-audit.

## Remaining backlog

1. debug passthrough access restriction
2. a job in backoff looks identical to a stuck one
3. `select[name*=date i]` remains a weak picker signal beyond the birthday filter
