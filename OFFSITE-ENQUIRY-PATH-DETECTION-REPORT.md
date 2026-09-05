# An enquiry does not have to start on their website

Date: 2026-08-12 · commit `3bf5ab0` · Cloud Run `audit-render-00176-sjj` · tests 1,921 passing

Resilient Intimacy was told her contact page had no form, and the planner turned
that into a lead-capture gap. Her home page carries a button to her own
SimplePractice client portal. The false reason is gone from the detector and
from the database, and Cynthia's finding survived unchanged.

**Spend: 20 credits.**

---

## Part 1 — the branch, proved

`services/audit-render/findings.mjs`, the enquiry chain:

```js
if (facts.form) add('good', 'form');
else if (contact?.form) add('good', 'form-on-contact-page', ...);
else if (facts.email) add('minor', 'form-email-only', ...);
else if (contact?.email) add('minor', 'contact-page-email-only', ...);
else if (contact) add('real', 'contact-page-no-form');   // ← 4966 landed here
else if (facts.contactPage) add('minor', 'form-offpage', ...);
else if (facts.phone || facts.phoneInText) add('minor', 'phone-only');
else add('real', 'no-contact');
```

> **4966 emits `contact-page-no-form` because that chain consults only
> `facts.form`, `contact.form`, `facts.email` and `contact.email`, and never
> consults `facts.bookingLink`, `facts.links`, `facts.navLinks` or any followed
> destination — so an off-site intake path cannot reach the decision at all.**

Her crawl returned a contact-kind page with `form: null` and `email: null`, which
is the fifth branch exactly. The live site's "Request an Appointment" points at
`kori-hennessy.clientsecure.me`, a SimplePractice client portal.

**Adding `clientsecure.me` to a vendor list alone would have changed nothing.**
There was no code path that looked at links, so no host list could have been
consulted. That is why this is not a one-line registry fix.

## Part 2 — the enquiry-path contract

Before claiming a business cannot be enquired with, the detector now asks
whether there is any customer-facing way to start one:

| Counts as an enquiry path | Does not |
|---|---|
| a form on the page | social profiles |
| a form on the contact page | press and article links |
| an email address published on either | a generic login with no intake meaning |
| a booking link into a scheduling or intake host | unrelated external links |
| any page or nav link to such a host | a provider's name appearing in a URL path |
| a click that landed on such a host | |

When one is present and no local form exists, the finding is **`enquiry-offsite`**:
severity `minor`, recorded and never spoken. Nothing is claimed, and the
prospect keeps every other finding.

The same gate now protects **`no-contact`**, which is the strongest wording on
the list and the worst one to be wrong about.

## Part 3 — verification, and why the host is enough

The brief asked whether a hostname match alone should be sufficient, or whether
the destination must be fetched.

**The host is enough here, and deliberately so.** This rule only ever
*suppresses* a claim. The worst case is that LTB stays quiet about a business
that may genuinely have a gap, which costs nothing. Requiring a fetch before
agreeing to say *nothing* would be failing open: it would let the false claim
survive whenever the check was blocked, ambiguous, or slow. That is the exact
mistake this exists to prevent, so the fail-closed direction is to suppress.

What the host match does have to be is **accurate**, which is where writing the
test found a real defect.

### The overmatch the test caught

`SCHEDULER_URL` is a substring pattern, so it matched:

```
https://somemagazine.com/best-calendly-alternatives
```

A press article, matched because a provider's name sits in its path. Read as
evidence that a business has working intake, that is the MindBodyGreen mistake
in a new costume.

So there is now `isSchedulerUrl(u)`, which parses the URL and matches on the
**hostname**:

- `SCHEDULER_HOST` anchored as `(^|\.)host$`, so `kori-hennessy.clientsecure.me`
  matches and `notclientsecure.me.evil.com` does not
- `SCHEDULER_PATH` listed separately for the few providers that live on a path
  of a shared domain, such as `squareup.com/appointments`

`findings.mjs` uses the parsed predicate. The looser pattern remains only for
the browser-side intent check, which runs inside `page.evaluate` and cannot
call it.

## Part 4 — the shared registry

`clientsecure.me` and `practicebetter.io` added to `SCHEDULER_URL` in
`services/audit-render/booking-intent.mjs` — the single registry both the
booking detector and the enquiry chain read. Nothing was added in one detector
only.

`onScheduler` also had to move: it was declared beside the booking chain, and
the enquiry chain sits above it. A `const` read before its own line is the
"Cannot access before initialization" crash this file has already been bitten by
once, so it is now declared at the top of `deriveFindings` with a note saying
why.

## Part 5 — tests

`tests/offsite-enquiry.test.mjs`, 13 behavioural tests through the real
`deriveFindings`:

| | |
|---|---|
| Resilient Intimacy's portal | suppresses the claim, records `enquiry-offsite` |
| the same site without that link | still reports the missing form, so the rule does work |
| `clientsecure.me` | matches on a subdomain, not by substring |
| six known hosts | Calendly, Acuity, `as.me`, Jane, Practice Better, SimplePractice |
| booking link straight to a scheduler | counts |
| a click that landed on one | counts |
| Instagram, Facebook, press, login, blog | do not count |
| a provider name in an article path | does not count |
| a real form | still wins outright |
| an email on the contact page | still reports email-only |
| `no-contact` | cannot survive a working intake link |
| **Cynthia** | **keeps her verified finding** |
| `enquiry-offsite` | is `minor`, so it is never narrated |

Suite: **1,921 passing**, up from 1,908.

## Part 6 — deployment

| | |
|---|---|
| Commit | `3bf5ab0` |
| Cloud Run revision | `audit-render-00176-sjj`, 100% traffic |
| Blocked for a while by | expired gcloud credentials on the workstation, since re-authorised |

## Part 7 — behavioural acceptance

### 4966 Resilient Intimacy

| | Before | After |
|---|---|---|
| Detector reasons | Contact page has no form · 2 dead links · Footer still says 2021 | 2 dead links · Footer still says 2021 · No reviews or testimonials |
| `bookingLink` | Appointments → same-site services page | **Client Portal → `kori-hennessy.clientsecure.me`** |
| `contact-page-no-form` | emitted | **gone** |

No replacement false claim appeared. The three findings that remain were all
present before and are unrelated to enquiry paths.

### 4860 Cynthia A. Criss — no regression

```
reasons    : ['Contact page has no form', 'No opening hours on the site', 'No reviews or testimonials on the site']
bookingLink: null
```

Her contact page still has no form and the crawl finds no scheduling or intake
link anywhere on her site, so her finding stands. The evidence under her
approved package is unchanged, and **her package was not refreshed, mutated or
re-prechecked.**

## Part 8 — persistence

`4966` carried the now-false finding in the database, so it was refreshed
canonically through `runPrecheck(... force: true ...)`.

| | |
|---|---|
| Canonical price | `PRICES.precheck = 20` |
| Rows | 1 |
| **Charged** | **20 credits** |
| Balance | 497,740 → **497,720** |
| `spentAllTime` | 2,260 → 2,280 |

Persisted keys before: `contact-page-no-form`, `dead-links`, `stale-copyright`.
After: `dead-links`, `stale-copyright`, `no-reviews`.

### The planner, from the refreshed state

```
ok       : false
status   : NEEDS_DECISION
playbook : not-our-offer
reason   : 2 dead links. Real problem, but it is a website build job and this
           workspace does not sell that.
```

Which is the right answer twice over: the false lead-capture gap is gone, and
the capability gate refuses to pivot to the dead links because Bloomwired does
not sell website repair. No replacement angle was invented.

Cynthia was **not** refreshed. Her persisted evidence and the live detector
agree, so there was nothing to recalculate.

## Safety

| | |
|---|---|
| Emails sent | 0 |
| `send_events` for 4860 and 4966 | 0 and 0 |
| Newest send event in the whole system | 2026-08-11T19:49:58Z, unchanged |
| Package 19 | `APPROVED`, `sequence_approved` 1, `sequence_max_step` 2, untouched |
| Packages created or approved | 0 |
| Contacts adopted | 0 |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |
| Credits | 20, forecast and charged |

No broad crawl: two sites were checked, both named in the brief.

## Remaining backlog

1. `hasCalendar` false-positives on CSS icon classes such as `icon-calendar-plus-o`
2. debug passthrough access restriction
3. a job in backoff looks identical to a stuck one
