# A claim made from not having looked

**Date:** 2026-08-11
**Tests:** 1,817 passing, 0 failing
**Emails sent: 0. Prospects contacted: 0. Packages created: 0. Contacts adopted: 0. Both auto-send switches: OFF.**

---

## What happened

While preparing the first real P2 seed candidate, the reason for contacting
James Pearson Coaching was:

> *"Booking is a request form, not a calendar."*

A free fetch of his site disproved it. `jamespearson.coach/book-online` is a
live Wix Bookings page with a service list and a **"Book your Free Discovery
Call Now"** action. He already has the thing the email was going to offer to fix.

No email was sent. The finding is carried by 13 prospects, so the question
became whether the detector could be trusted at all.

---

## Root cause

`services/audit-render/findings.mjs` decided the finding through a chain of
conditions ending in a catch-all:

```js
else if (facts.form || contact?.form) → 'booking-is-a-form'
```

Reaching that line means: no booking control was found, none was followed, no
calendar was seen — **and the site has a form**. From that the code concluded
*"booking is a request form, not a calendar"*.

**The claim was made from the absence of a discovered booking flow, not from
having found and inspected one.** Those are different facts. Booking on its own
route is ordinary on Wix, Squarespace and WordPress alike, and this branch could
not tell *"there is no calendar"* from *"we did not find the page with the
calendar on it"*.

The blind spot is **page selection**. `capture.mjs` already carries a comment
describing the shape — *"on /contact, the booking widget lives on /book"* — and
the detector still concluded from the pages it happened to visit.

---

## The fix

The catch-all now emits **`booking-unknown`**, which is recorded and never
spoken. The prospect keeps every other finding and LTB makes no claim about
booking.

The branches that earned the claim are untouched:

| Still emits `booking-is-a-form` | Because |
|---|---|
| The booking control was clicked and no calendar appeared | the flow was followed |
| The form asks the visitor to type a time | a calendar never needs that |
| The booking link led to the page carrying the form | the destination was inspected |
| A same-page Book button scrolls to a form | the destination is on screen |

A real calendar still wins outright (`good: booking`).

**This fails closed.** It under-claims rather than over-claims: a site whose
booking page was never located now produces silence on booking instead of a
false statement about it.

⚠️ **What this fix is not.** It does not implement bounded route discovery —
sitemap, rendered nav and footer links, known scheduling hosts, each candidate
fetched and read. That remains the work required before the claim can be made
from discovery rather than from inspection. Until then the detector is
conservative, not clever.

---

## Evidence tier

`booking-is-a-form` is currently classified **technical-fact** in
`lib/visual-evidence.mjs`.

**Left unchanged, deliberately, and it is now honest rather than merely
convenient.** The tier describes what supports the claim in the branches that
still emit it: a booking control that was followed, a destination that was
opened, a form that asks for a time. All of those are technical facts about a
page that was actually inspected.

The tier was wrong for the catch-all — concluding absence across a whole site
needs rendered navigation evidence, which nothing supplied. That branch no longer
makes the claim, so the mismatch is gone by removing the claim rather than by
relabelling it.

If bounded discovery is built later, the claim will rest on *"we searched these
routes and found no booking flow"*, and **that** will require RENDERED evidence,
because it depends on navigation a visitor can reach rather than one page's HTML.
That decision belongs with that implementation.

---

## The 13, re-classified

⚠️ **Only one has positive proof.** The other twelve were settled by *negative*
evidence — crawled routes or published sitemaps containing no booking route.
Absence of a route in a sitemap is not proof that no booking flow exists: it can
be external, JS-rendered into nav, embedded on a normally named page, or simply
omitted. So they are **UNCLEAR**, not verified true positives.

| Prospect | Old | Corrected | Evidence |
|---|---|---|---|
| 6452 James Pearson Coaching | booking-is-a-form | **FALSE POSITIVE** | live `/book-online` Wix Bookings service list |
| 1134 Center for True Health | booking-is-a-form | UNCLEAR | 37 routes, no booking route; "mindbody" was MindBodyGreen press |
| 1476 Steffeney Paige Beauty | booking-is-a-form | UNCLEAR | sitemap: 1 published route |
| 1665 Begin Again Coaching | booking-is-a-form | UNCLEAR | 26 routes; `/sample-session` is a marketing page |
| 6439 Life Coaching with Sabine | booking-is-a-form | UNCLEAR | 16 routes, none booking |
| 6440 Yoga Therapy with Lisa | booking-is-a-form | UNCLEAR | sitemap: 9 routes, none booking |
| 6442 Jess Mendez | booking-is-a-form | UNCLEAR | sitemap: 1 route |
| 6450 Lara Schilken Coaching | booking-is-a-form | UNCLEAR | sitemap `/book` is a **literal book she is writing** |
| 6453 Master Your Life | booking-is-a-form | UNCLEAR | sitemap: blog/about/services/contact |
| 6454 Player One Start | booking-is-a-form | UNCLEAR | sitemap: home/contact/404 only |
| 6468 Wendify Your Life | booking-is-a-form | UNCLEAR | 11 routes, none booking |
| 6470 Katie Nicholson | booking-is-a-form | UNCLEAR | 13 routes, none booking |
| 6527 Inner Movements Counseling | booking-is-a-form | UNCLEAR | sitemap: about/contact/resources |

**1 false positive · 0 true positives established · 12 unclear.**

**Future outreach impact:** none of the thirteen may use this finding. Historical
evidence is preserved on every record; nothing was rewritten and no replacement
reason was invented for any of them.

---

## Two heuristics that produced wrong answers, both mine

**`mindbody` matched MindBodyGreen.** Center for True Health links a press
article at `mindbodygreen.com`. A substring check reported a Mindbody booking
platform. Had I trusted it, that prospect would have been called a false positive
on the strength of a magazine mention.

**`/book` matched a literal book.** Lara Schilken's sitemap has a `/book` route.
Fetching it shows *"A New Book on Why Connection Breaks Down… Support my Book
here… join the waitlist"*. Path-name matching would have called that a booking
system.

Both are the same fault as the bug under audit: **concluding from a string
without reading what it refers to.** Any future discovery logic has to fetch and
read each candidate, which is why the contract above requires it.

---

## Spend and accounting

| | |
|---|---|
| LTB credit ledger | **unchanged** — balance 498,100, spent-all-time 1,900 |
| Credits charged | **0** |
| Renderer calls | 7 `/precheck` runs, called directly against Cloud Run |
| Real infrastructure cost | ~$0.14 of Cloud Run compute on Ary's own project |

⚠️ **The seven renders did not answer the question, and I should have known that
before spending them.** `/precheck` returns `worth`, `score`, `keys` and
`reasons` — no navigation data. Asking it whether `booking-is-a-form` is right is
asking the detector under audit to grade its own homework; all seven agreed with
themselves. What settled the question was **sitemap.xml**, which is free.

Because the renderer was called directly rather than through the app, it bypassed
`spendCredits` — so the compute happened and the ledger did not move. That is
reported rather than reconciled: fabricating ledger entries to match would be
worse than the discrepancy.

⚠️ A separate correction: earlier I told Ary a precheck costs **1 credit**. It
costs **20** — `spendCredits(db, ws, 'precheck', 1, …)` passes `times`, not a
price, and `price = priceOf(job) × times`. She caught it by asking for the
canonical number before approving.

---

## Package safety

**Package 3 — Center for True Health (Deborah)** carried the claim in its body:

> *"I checked the booking page for Center for True Health and it works as a
> request form rather than a calendar."*

Moved `READY_FOR_APPROVAL` → **`STALE`**. `STALE` is not in `LIVE`, so no route
action can approve or send it, and it no longer appears on the approvals queue.
`why_contact` and the body are preserved for audit.

**No other package contains the claim.** **No real prospect has ever received an
email using it** — Deborah's six prior emails were legacy sends that predate the
finding entirely.

---

## Tests

Six regression tests in `tests/booking-finding.test.mjs`:

1. A form alone no longer produces the claim
2. The claim still fires where the flow was actually inspected — all four branches
3. A real calendar still wins outright
4. `booking-unknown` carries no spoken line asserting anything about a calendar
5. All three not-settled paths report the same verdict, not three different ones
6. The fallback invents no replacement finding

**Full suite: 1,817 passing, 0 failing.**

---

## Deployment

`services/audit-render/findings.mjs` is part of the **Cloud Run render service**,
not the Cloudflare app. The fix requires `gcloud run deploy audit-render` to take
effect on live prechecks. **Not yet deployed** — the current revision still
carries the old catch-all.

---

## Verdict

`BOOKING-FRICTION DETECTOR TRUSTED — SERVICE-SELECTION BOOKING FLOWS NO LONGER GET MISCLASSIFIED AS REQUEST FORMS.`

The false-positive mechanism is removed and the detector now fails closed. It is
not yet *trusted* because:

- the fix is not deployed to the render service
- bounded route discovery is designed but not built, so the detector can only be
  quiet about booking, never confident about it
- twelve of thirteen existing findings rest on negative evidence and none has
  been positively established

## Safety

Zero outbound emails. Zero real prospects contacted. No contact adopted, no
package created, no cohort. Both auto-send switches OFF throughout. No broad
crawl — homepages, sitemaps and one candidate route per site. No historical
rewrite. No invented replacement angle.

---

# Round two: the case the first fix did not fix

**Cloud Run revision:** `audit-render-00173-8t5` · **Tests:** 1,819 passing

## The catch-all fix was real, and insufficient

Deployed as `audit-render-00171-bzd`. Proven behaviourally:

```
Jess Mendez   before: ['no-meta-description', 'booking-is-a-form']
              after:  ['no-meta-description']
```

**But James Pearson still emitted the claim.** So he was never hitting the
catch-all, and the original false positive survived the fix that was written
for it.

## Instrumenting instead of guessing

`/precheck` returned `worth`, `score`, `keys` and `reasons` — the booking facts
were computed and never exposed, so working out *why* a finding fired meant
reading source and guessing. That is how the false positive survived two rounds.

A `debug` flag now returns the crawled pages with the fields the branches
actually read. James's real data:

```
bookingLink : "Book Your Free Discovery Call" -> go.jamespearson.coach/discoverycall
/book-online  kind=book  hasCalendar=false  asksForTime=false  furtherStep=TRUE  clicked={...}
homeCalendar: false
```

## Root cause, stated exactly

James hit `(bookish?.clicked && !bookish.clicked.failed)`: the Book control was
followed and the page it landed on had no calendar. **And `furtherStep` was
`true`** — the crawler had already recorded that the booking flow continues past
that page.

⚠️ **My earlier hypothesis was wrong.** I expected a Wix Bookings service list at
`/book-online`. The real booking link goes to an external subdomain,
`go.jamespearson.coach/discoverycall`. The shape of the bug was right — a flow
with another step — but the specifics were not, and the data said so.

**Absence of a time picker on the first booking page is not evidence of a
request-form flow.** A flow where you choose what you want before you choose
when has no times on its first screen by design.

## The fix

`furtherStep` now gates the followed-and-no-calendar branch:

- `asksForTime` still emits unconditionally — a form that makes the visitor type
  a preferred time *is* request-form behaviour, whatever comes next
- followed, no calendar, **no** further step → `booking-is-a-form`
- followed, no calendar, **further step** → `booking-unknown`

## James, behaviourally accepted

```
keys   : ['stale-copyright', 'no-hours']
reasons: ['Footer still says 2020', 'No opening hours on the site']
booking-is-a-form present: False
```

The claim is gone, no replacement was invented, and his other findings survive.

## All thirteen, on the fixed detector

| Prospect | State | Evidence |
|---|---|---|
| 6452 James Pearson | **REAL_BOOKING_FLOW** | booking flow continues (`furtherStep`) |
| 6470 Katie Nicholson | **REAL_BOOKING_FLOW** | calendar found |
| 6439 Life Coaching with Sabine | REQUEST_FORM VERIFIED | followed, no further step |
| 6450 Lara Schilken | REQUEST_FORM VERIFIED | followed, no further step |
| 6454 Player One Start | REQUEST_FORM VERIFIED | followed, no further step |
| 1134, 1476, 1665, 6440, 6442, 6453, 6468, 6527 | UNKNOWN | no booking flow located |

**3 request-form verified · 2 real booking flows · 8 unknown.**

Compare with where this started: thirteen prospects all carrying the claim, one
of them provably wrong. Now three carry it on positive evidence, two are
recognised as having real booking, and eight say nothing rather than guessing.

⚠️ **Katie Nicholson changed twice.** She carried `booking-is-a-form` at the
start and now shows a real calendar — nothing about her site changed, only what
the detector could see. That is the same class of error as James, caught by the
same fix.

## Does bounded discovery still add coverage?

**Yes, and it is now clearly scoped.** Eight of thirteen are UNKNOWN because no
booking flow was located at all. Those are the cases nav, footer, sitemap and
external scheduling-link discovery would settle — and none of them currently
produce a false claim, because unknown says nothing.

So it is a **coverage** problem now, not a **correctness** one. Worth doing as
its own task; not urgent, because the detector no longer lies when it cannot
see.

## Safety

Zero emails. Zero prospects contacted. Zero packages, zero contact adoption,
zero candidate discovery. Both auto-send switches OFF. LTB credit ledger
untouched — the renderer was called directly, so the compute happened on Ary's
own Cloud Run and no credits moved.

---

# Third pass: the literal book, and the calendar nobody consulted

Date: 2026-08-11 · commit `0ab1942` · Cloud Run `audit-render-00175-9vs`

## Third-pass trigger

The second pass closed with "3 REQUEST_FORM VERIFIED". That count was wrong.
Two of the three were false, and both were found only because the stale-intel
refresh sent someone back to look at the underlying crawl data rather than the
count.

The verdict at the end of the second pass, `BOOKING-FRICTION DETECTOR TRUSTED`,
was premature. It was reached by proving James Pearson specifically was fixed
and then re-running the set, without inspecting the survivors. Re-running a set
tells you the number changed. It does not tell you the remainder is right.

## Instrumentation first

Before any code changed, `/precheck?debug` gained one field: `bookingResolved`,
the crawled page the chain is actually reasoning about, or null when none
matched. Every branch turns on it, so returning it makes the decision
reconstructable from the response instead of from the source. Deployed as
`audit-render-00174-hb8`, purely diagnostic.

That single field settled both cases immediately.

## Lara Schilken: the branch, proved

```
reasons        : ['Booking is a request form, not a calendar']
booking(embed) : null
bookingLink    : {"text": "The Book", "samePage": true,
                  "href": "https://www.laraschilken.com/"}
bookingResolved: null
homeForm       : {"sel": "[data-aud=\"form\"]", "asksAboutJob": true}
homeCalendar   : false
```

**Lara hit the same-page fallback because `bookingResolved` is null, so every
`bookish?.*` arm was false, and then `bookingLink.samePage` was true, `form` was
truthy and `homeCalendar` was false.**

The control was her nav item "The Book". Her site is a landing page for a book
she is writing, and the form the branch found is the book's waitlist.

## Sabine Lehnhardt: the same branch, worse data

```
bookingLink    : {"text": "Book your free Session", "samePage": true,
                  "href": "https://sabinelehnhardt.as.me/?appointmentType=77702267"}
bookingResolved: null
homeCalendar   : false

/contact-me                 hasCalendar: TRUE  furtherStep: TRUE
  clicked -> .../schedule/0fef2bbe/appointment/71713895/calendar/8731280
/the-soul-strategy-podcast  hasCalendar: TRUE  furtherStep: TRUE
/soul-business-coaching     hasCalendar: TRUE  furtherStep: TRUE
/the-courage-to-begin-...   hasCalendar: TRUE  furtherStep: TRUE
```

**Sabine hit the identical branch, for the identical reason.** `bookingResolved`
was null because no crawled page had kind `book`, none shared a path with the
`as.me` host, and none matched the text regex. So the chain fell past every
`bookish` arm to the same-page fallback, which consults `facts.homeCalendar` and
nothing else.

Four followed pages said `hasCalendar: TRUE`. The crawler had clicked through to
an Acuity calendar. None of it was read.

Three separate gaps contributed, and the fix closes all three:

1. `as.me` was missing from the booking-vendor list, so `anyBooking` never fired
2. `bookish` resolved to nothing, so the informed arms were skipped
3. the fallback consults only the home page's calendar

## Player One Start: the control case

```
bookingLink    : {"text": "Book a Call", "samePage": false,
                  "href": "https://playeronestart.io/contact"}
bookingResolved: {"kind": "contact", "hasCalendar": false, "furtherStep": false,
                  "asksForTime": false, "clicked": null, "form": {"fields": 4}}
```

**Player One hits the positive request-form arm: `bookish.form` is truthy and
shares a path with `bookingLink.href`, and `furtherStep` is false.** A different
branch from the two false ones, on real inspected evidence. The claim is true
and must survive.

## Appointment-intent contract

New file: `services/audit-render/booking-intent.mjs`.

The word "book" has now been mistaken for the intent three times: the `/book`
path, the `mindbody` substring, and the "The Book" link text. Each was fixed
where it was found, which is why there were three. The rule is one rule, so it
is now one file, imported by the findings, the fact reader and the walkthrough's
control finder.

Intent must be **stated**, never inferred from a token:

| Qualifies | Does not qualify |
|---|---|
| Book a Call, Book a Session, Book an Appointment | The Book, My Book, New Book |
| Schedule a Call, Reserve a Session | Support my Book, Book launch, Book waitlist |
| Book Now, Book Online, Book with me | a literal `/book` route |
| Appointment, Consultation, Free consultation | a bare "Book" with no object |
| Check availability, See times | MindBodyGreen press links |
| any link into a scheduling host | |

`book` is deliberately absent from the standalone-noun list. That absence is the
fix. Anything unmatched leaves booking unknown, which claims nothing.

## Calendar aggregation precedence

One predicate, computed once, before the chain:

```js
const realBooking =
  Boolean(facts.homeCalendar) ||
  Boolean(contact?.hasCalendar) ||
  list.some((p) => p.hasCalendar) ||
  list.some((p) => onScheduler(p.clicked?.landedOn)) ||
  onScheduler(facts.bookingLink?.href);
```

It sits in the second arm of the chain, so **every request-form arm below it is
unreachable once a real calendar has been seen anywhere.** A page's `hasCalendar`
is already `pickers || slotUi || vendorFrame`, so one field covers all three.

The order this implements:

1. **REAL_BOOKING_FLOW** — a calendar, slot UI, picker, provider frame, or a
   click that landed on a scheduling host, on any page the crawl opened
2. **REQUEST_FORM** — a booking-intent path that was followed and ended at a
   form, with no contradicting real-booking evidence anywhere
3. **UNKNOWN** — everything else, which says nothing

> Positive evidence of a real calendar beats negative inference from a form.
> The token "book" is not appointment intent.

## Regression tests

`tests/booking-intent.test.mjs`, 19 fixtures, all behavioural: they call
`appointmentIntent` and `deriveFindings` with the real shapes those three sites
returned. The previous two passes were guarded by assertions about the shape of
the code, which is exactly how both shipped while still being wrong.

Covered: the literal-book family, appointment verbs with objects, imperatives,
scheduling-host links, bare ambiguous "Book", MindBodyGreen vs mindbodyonline,
a followed calendar beating a form, a contact form losing to a followed
calendar, any-one-page sufficiency, a click landing on a scheduler, a booking
link straight into a scheduler, Player One Start keeping its claim, typed
preferred time, same-page CTA, James Pearson's further step, a form alone, and
unknown being recorded but never spoken.

Suite: **1,838 passing**, up from 1,819.

## Deployment

| | |
|---|---|
| Commit | `0ab1942` |
| Revision | `audit-render-00175-9vs` |
| Traffic | 100% |
| Image | `audit-render@sha256:59049cf15d890e55ded9848794fa2fb3e98d54ba1db7b71d4a3d64f12fd7facc` |

## Behavioural acceptance, all five

| Prospect | Before | After | Verdict |
|---|---|---|---|
| **6450 Lara** | `booking-is-a-form` | `[]`, `bookingLink: null` | pass. "The Book" is no longer a control, and no replacement claim appeared |
| **6439 Sabine** | `booking-is-a-form`, `no-hours` | `no-hours` | pass. Real booking recognised, unrelated finding preserved |
| **6454 Player One** | `booking-is-a-form` | `booking-is-a-form` | pass. Still resolved on positive evidence |
| **6452 James** | `stale-copyright`, `no-hours` | unchanged | pass. "Book Your Free Discovery Call" still recognised |
| **6470 Katie** | `no-meta-description`, `no-reviews` | unchanged | pass. No `no-booking` invented |

Lara's findings going to empty is the correct outcome: `booking-is-a-form` was
the only thing she had, and nothing was invented to replace it.

## Canonical persistence refresh

Only the two rows whose persisted state was known false, through
`runPrecheck(... force: true ...)`:

| | |
|---|---|
| Canonical price | `PRICES.precheck = 20` |
| Rows | 6439, 6450 |
| Expected | 40 credits |
| **Charged** | **40 credits** |
| Balance | 497,840 to 497,800 |
| `spentAllTime` | 2,160 to 2,200 |

Within the 40-credit ceiling. No hand-edited `site_intel`. Player One Start was
read, not refreshed, because its persisted claim was already correct.

## Persisted planner proof

| id | Persisted keys | Planner playbook | Reason |
|---|---|---|---|
| 6439 Sabine | `no-hours` | no-safe-angle | no booking claim |
| 6450 Lara | `[]` | none | no booking claim |
| 6454 Player One | `booking-is-a-form` | **booking-friction** | Booking is a request form, not a calendar |

Sabine and Lara both lost the claim in persisted state and the planner no longer
chooses booking-friction for either. Player One Start is the only prospect in
the set for which any layer speaks about booking.

## Final 13 truth table

| Prospect | Booking state | Persisted claim | Planner uses it | Evidence |
|---|---|---|---|---|
| 6454 Player One Start | **REQUEST_FORM VERIFIED** | yes | yes | "Book a Call" leads to contact page, 4-field form, no calendar, no further step |
| 6452 James Pearson | REAL_BOOKING_FLOW | no | no | Wix Bookings service list, `furtherStep` true |
| 6470 Katie Nicholson | REAL_BOOKING_FLOW | no | no | real calendar |
| 6439 Sabine Lehnhardt | REAL_BOOKING_FLOW | no | no | Acuity calendar, `hasCalendar` true on four followed pages |
| 6450 Lara Schilken | UNKNOWN | no | no | no appointment-booking control on the site; "The Book" is a book |
| 1134, 1476, 1665, 6440, 6442, 6453, 6468, 6527 | UNKNOWN | no | no | no booking flow located |

Counts: **1 REQUEST_FORM VERIFIED · 3 REAL_BOOKING_FLOW · 9 UNKNOWN.**

Lara moved from false-claim to UNKNOWN, which is the correct place for a site
with no appointment-booking control the crawl can find.

## Outreach eligibility

**The restriction can be lifted, for claims produced by the positive-evidence
branches only.**

What changed is that there is now exactly one way to earn the claim: a control
that states appointment intent, followed to a destination that was inspected,
with no calendar, no slot UI, no provider frame, no scheduler landing and no
further step anywhere in the journey. Player One Start is the only prospect in
the reliability set that clears it, which is the shape you want from a bar that
means something.

`booking-unknown` remains unusable as an outreach reason, and always was.

## Safety

Zero emails. Zero prospects contacted. Zero packages created. Zero contacts
adopted. No auto-approval, no cohort. `autoSendApprovedFirstEmails` **false**,
`autoSendApprovedFollowups` **false**. No broad crawl, no seed-candidate
discovery, no invented replacement angle, no historical rewrite. Total spend 40
credits, within the stated ceiling.
