# Stale site_intel refresh, and what the fresh data said about Lara

Date: 2026-08-11
Repo: `Beeyach/bloomtrack-pro` · Production: https://leadsthatbloom.com/

**Outcome: the 13 rows were refreshed canonically and the stale claims are gone.
Lara Schilken did not survive. No package was created.**

The refresh also turned up something the previous audit missed: two of the three
prospects that kept `booking-is-a-form` keep it for reasons that are provably
wrong. Detail in "The detector is still wrong" below.

---

## Canonical refresh path

`lib/precheck.mjs` → `runPrecheck(db, {workspace, prospectId, service, secret,
force: true, actor: 'human'})`.

That is the same function `app/api/audit-video/precheck/route.js` calls and the
same one the Hive queue worker calls. The route is a thin wrapper around it, so
there is one implementation of the write and this used it.

What was NOT done:

- no direct renderer call left unpersisted
- no hand-edited findings in SQL
- no DB patching
- no fabricated freshness timestamps
- no historical rows touched: `credit_events` and every audit/event record were
  appended to, never rewritten

`force: true` was required. Every row was inside the 14-day freshness window, so
without it `runPrecheck` returns `CACHED` and buys nothing.

The only thing added around the canonical function was a D1 handle, because it
normally receives one from the Cloudflare Workers binding and this ran from a
workstation. It talks to the same production database through D1's own HTTP
query endpoint with real bound parameters.

### Spend

| Item | Value |
|---|---|
| Canonical price | `PRICES.precheck = 20` |
| Runs | 13 |
| Expected | 260 credits |
| **Charged** | **260 credits** |
| Balance before | 498,100 |
| Balance after | 497,840 |
| `spentAllTime` | 1,900 → 2,160 |
| Ledger rows | 13 × `precheck` / `charge` / `human` = 260 |

Forecast and actual agree exactly. No refunds, so no run failed.

Real vendor cost is Cloud Run compute on Ary's own project. The render service
is app-owned infra; the credit charge is the internal price, not an external
invoice.

---

## The 13 rows, before and after

Every one of the 13 carried `booking-is-a-form` before the refresh.

| id | Business | Keys before | Keys after | `booking-is-a-form` |
|---|---|---|---|---|
| 1134 | Center for True Health | no-hours, **booking-is-a-form** | no-hours | gone |
| 1476 | Steffeney Paige Beauty | no-meta-description, stale-copyright, **booking-is-a-form** | no-meta-description, stale-copyright | gone |
| 1665 | Begin Again Coaching | stale-copyright, **booking-is-a-form** | stale-copyright | gone |
| 6439 | Life Coaching with Sabine | no-hours, **booking-is-a-form** | no-hours, **booking-is-a-form** | kept |
| 6440 | Yoga Therapy with Lisa | **booking-is-a-form** | (none) | gone |
| 6442 | Jess Mendez | no-meta-description, **booking-is-a-form** | no-meta-description | gone |
| 6450 | Lara Schilken Coaching | **booking-is-a-form** | **booking-is-a-form** | kept |
| 6452 | James Pearson Coaching | stale-copyright, no-hours, **booking-is-a-form** | stale-copyright, no-hours | **gone** |
| 6453 | Master Your Life | no-hours, no-reviews, **booking-is-a-form** | no-hours, no-reviews | gone |
| 6454 | Player One Start | **booking-is-a-form** | **booking-is-a-form** | kept |
| 6468 | Wendify Your Life | no-meta-description, no-reviews, **booking-is-a-form** | no-meta-description, no-reviews | gone |
| 6470 | Katie Nicholson | no-meta-description, no-reviews, **booking-is-a-form** | no-meta-description, no-reviews | **gone** |
| 6527 | Inner Movements Counseling | no-hours, no-reviews, **booking-is-a-form** | no-hours, no-reviews | gone |

Persisted `site_intel_at` for all 13 now reads 2026-08-11T23:15 to 23:24.
Source stayed `precheck`, or moved from `auto` to `precheck` for the four rows
that had been written by the sweep.

### James Pearson (6452)

- persisted `booking-is-a-form`: **gone**
- planner reason: no longer booking-friction. Now `NEEDS_DECISION`,
  playbook `no-safe-angle`
- no replacement false claim. The two findings that remain (`stale-copyright`,
  `no-hours`) were both already there and are unrelated to booking

### Katie Nicholson (6470)

- persisted `booking-is-a-form`: **gone**
- planner reason: `NEEDS_DECISION`, no booking claim of any kind
- remaining findings are `no-meta-description` and `no-reviews`, both
  pre-existing

### The 8 UNKNOWN cases

1134, 1476, 1665, 6440, 6442, 6453, 6468, 6527.

- none persists `booking-is-a-form`
- none persists `booking-unknown` either. It carries no spoken line, and where
  no booking control was located at all, no branch fires and nothing is written
- none uses booking uncertainty in `why_contact`. All 8 return
  `NEEDS_DECISION` with either "Everything verified about them is cosmetic" or
  the generic no-safe-angle line
- none became Strong

---

## Planner agreement

`planPackage` was run against the freshly persisted rows, read-only. A
hypothetical address was supplied where a row had none, because a missing
contact stops the planner before it chooses a reason and the reason is the thing
under test. Nothing was persisted.

| id | Old planner reason | New planner reason | Changed | Correct |
|---|---|---|---|---|
| 1134 | Booking is a request form, not a calendar | no-safe-angle, NEEDS_DECISION | yes | yes |
| 1476 | Booking is a request form, not a calendar | cosmetic only, NEEDS_DECISION | yes | yes |
| 1665 | Booking is a request form, not a calendar | cosmetic only, NEEDS_DECISION | yes | yes |
| 6439 | Booking is a request form, not a calendar | Booking is a request form, not a calendar | no | **no, see below** |
| 6440 | Booking is a request form, not a calendar | nothing verified, NEEDS_DECISION | yes | yes |
| 6442 | Booking is a request form, not a calendar | cosmetic only, NEEDS_DECISION | yes | yes |
| 6450 | Booking is a request form, not a calendar | Booking is a request form, not a calendar | no | **no, see below** |
| 6452 | Booking is a request form, not a calendar | no-safe-angle, NEEDS_DECISION | yes | yes |
| 6453 | Booking is a request form, not a calendar | no-safe-angle, NEEDS_DECISION | yes | yes |
| 6454 | Booking is a request form, not a calendar | Booking is a request form, not a calendar | no | yes |
| 6468 | Booking is a request form, not a calendar | no-safe-angle, NEEDS_DECISION | yes | yes |
| 6470 | Booking is a request form, not a calendar | no-safe-angle, NEEDS_DECISION | yes | yes |
| 6527 | Booking is a request form, not a calendar | no-safe-angle, NEEDS_DECISION | yes | yes |

**The stale-data propagation issue is fixed.** Direct detector output and
persisted planner reasoning now agree on booking-friction eligibility for all
13. The planner produces `booking-friction` for exactly the three rows the
detector emits the finding for, and for no others.

That invariant held, so the task continued to Lara. What did not hold is a
different thing: the detector and the planner now agree on claims that are
themselves false.

### One cosmetic observation, not a blocker

Six rows return the no-safe-angle line "Nothing about this prospect has been
verified yet" while carrying two verified findings each. The wording is wrong,
the behaviour is not: it is a `NEEDS_DECISION` message a person reads, never an
outreach claim, and it predates this refresh. Left alone.

---

## The detector is still wrong

The accepted state going into this task was "3 REQUEST_FORM VERIFIED". The fresh
run reproduces that count, so the refresh is consistent. But the `debug` flag on
`/precheck` shows what the detector actually followed on each of the three, and
two of them are false.

### 6450 Lara Schilken: the booking control is her book

```
bookingLink: {"text": "The Book", "samePage": true,
              "href": "https://www.laraschilken.com/",
              "sel": "[data-aud=\"booklink\"]"}
form:        {"sel": "[data-aud=\"form\"]", "asksAboutJob": true}
homeCalendar: false
```

The control it matched is the nav item **"The Book"**. Her site is currently a
landing page for a book she is writing, titled "A New Book on Why Connection
Breaks Down", with a waitlist email capture. The detector treated that nav item
as a booking control, found the waitlist form on the same page, and concluded
the booking is a request form.

This is the exact failure the brief warned about, arriving through link text
rather than through the URL path. It is the same class as `/book` matching a
literal book and `mindbody` matching MindBodyGreen.

### 6439 Life Coaching with Sabine: there is a real calendar

```
bookingLink: {"text": "Book your free Session", "samePage": true,
              "href": "https://sabinelehnhardt.as.me/?appointmentType=77702267"}
homeCalendar: false

contact  /contact-me                      hasCalendar: TRUE  furtherStep: TRUE
         clicked "Book your free Soul Business Start-up S"
         landedOn .../schedule/0fef2bbe/appointment/71713895/calendar/8731280
page     /the-soul-strategy-podcast       hasCalendar: TRUE  furtherStep: TRUE
page     /soul-business-coaching          hasCalendar: TRUE  furtherStep: TRUE
page     /the-courage-to-begin-workshop-recording  hasCalendar: TRUE  furtherStep: TRUE
```

Four followed pages, all `hasCalendar: true`, and the crawler landed on an
Acuity Scheduling calendar URL. This is a real booking flow with a real
calendar, and the detector still says the booking is a request form, not a
calendar. It is a worse false positive than James Pearson's was: there, the
calendar was one step further on. Here the crawler is standing on it.

The reason it survives is that the suppression consults `homeCalendar`, which is
about the home page, and never consults the `hasCalendar: true` recorded on the
pages it actually followed.

### 6454 Player One Start: this one is real

```
bookingLink: {"text": "Book a Call", "samePage": false,
              "href": "https://playeronestart.io/contact"}
contact  /contact  hasCalendar: false  asksForTime: false  furtherStep: false
                   behindLogin: false  clicked: null
                   form: {"fields": 4, "action": null}
```

A "Book a Call" control leading to a contact page with a four-field form, no
calendar, and no further step. That is a request form, and the claim is true.

### Corrected count

| State | Count | Prospects |
|---|---|---|
| REQUEST_FORM VERIFIED (genuinely) | **1** | 6454 |
| False positive still emitting | **2** | 6439, 6450 |
| REAL_BOOKING_FLOW, corrected | 2 | 6452, 6470 |
| UNKNOWN | 8 | the rest |

The accepted "3 verified" was 1 verified plus 2 undiagnosed false positives.

The two false rows are persisted right now, because the detector emits them and
this task refreshes through the canonical path rather than editing findings by
hand. Nothing can act on them: both switches are off, neither prospect has a
contact, and no package exists. They will clear on the next refresh after the
detector is fixed.

---

## Lara Schilken re-evaluation

| Requirement | Result |
|---|---|
| Still P2 under current rules | pass, P2, `strong: true` |
| Evidence sufficient | pass on paper |
| `booking-is-a-form` positively verified | **FAIL** |
| No booking UNKNOWN used | pass |
| Maps to Bloomwired's offer | n/a, the reason is false |
| No send history ambiguity | pass, `emails_sent = 0`, stage `New` |
| No reply / DNC / unsubscribe | pass, all zero |
| Contact ownership valid | pass |
| Email genuinely published | pass |
| No template or demo placeholder | pass |

She fails on the one that matters. Her only reason for contact is the
booking-friction claim, and that claim is about her book, not about appointment
booking. Under Part 10 the correct action is SKIP, and no new angle was invented
to replace it.

### Contact association, recorded for whenever she is next considered

`fruitfulwithlara@gmail.com` is genuinely published by the business, and the
association holds:

```
Lara Schilken
Location   Sydney / Byron Bay
Contact    fruitfulwithlara@gmail.com
```

That block is the **site-wide footer**, present on every page.

A correction to what was reported last turn: this was described as appearing
under a Contact heading on `laraschilken.com/contact`. That page is a 404. The
address was read from the footer that renders on the 404 page, along with every
other page. Footer attribution is valid association evidence, so the conclusion
is unchanged, but the source was described wrongly and the site has no
`/contact` or `/about` page at all.

The app's own classifier returns:

```
association: OWNER_EXTERNAL
why: "A personal inbox published on their own site. Common for small
      operators, and they chose to put it there."
adoptable: true
```

**Name: unverified.** The footer gives "Lara Schilken" as the business name. The
homepage describes the book's author in the third person ("the author maps the
hidden architecture..."), never in the first person, and there is no owner or
about text tying a named person to the inbox. Business name containing "Lara" is
not evidence that the inbox belongs to a person called Lara, and the brief says
not to assume it. A nameless greeting would have been used had a package been
prepared.

The contact was **not adopted**. Part 7 runs only after Part 5 holds, and it did
not.

---

## Package and safety state

| Item | State |
|---|---|
| Package id | none, no package created |
| Approval state | n/a |
| Fingerprint state | none, and none was created manually |
| Allowed length | n/a |
| Manual send-guard | n/a, nothing to guard |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |
| Emails sent | 0 |
| Prospects contacted | 0 |
| Contacts adopted | 0 |
| Packages created | 0 |
| Lara's `email` column | still `null` |
| Lara's package count | 0 |

Verified by query after the run, not assumed.

---

## What is worth doing next

The booking detector needs a third pass, and this time there is exact crawl data
for both failures rather than a hypothesis:

1. A booking control must not be matched on the word "book" in link text. "The
   Book" is not "Book a Call". This is the link-text twin of the `/book` path
   bug already fixed.
2. `hasCalendar: true` on a page the crawler actually followed must suppress the
   claim. Today only the home page's calendar suppresses it, which is why Sabine
   survives standing on an Acuity calendar.

Both are positive-evidence changes, not new string heuristics, and both have a
real prospect to regression-test against.

Until that lands, `booking-is-a-form` should not be used as the sole reason to
contact anyone.
