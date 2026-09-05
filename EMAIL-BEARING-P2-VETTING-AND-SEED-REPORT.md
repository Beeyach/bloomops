# Vetting the email-bearing pool, and the bug that was blocking every package

Date: 2026-08-12 · commit `7e24432`

**One candidate survived: 4860, Cynthia A. Criss, LPC.** Her package is queued
through the canonical path but has not been written yet, because preparing a
first-contact package was broken in production. That bug is found, fixed,
tested and deployed. Detail at the end.

**Spend: 60 credits.** Ceiling was 100.

---

## Part 1 — the pool, from SQL

`stage = 'New'`, has an email, no `site_intel`, no rating, not deleted:
**exactly 82 rows.** The 37 other email-bearing New rows carry a ✖️ rating,
which is CROSS and bands P3, so they are out of scope for a P2 seed.

Free exclusions, checked before any spend:

| Check | Result |
|---|---|
| `emails_sent > 0` | 0 |
| replied | 0 |
| do-not-contact | 0 |
| unsubscribed | 0 |
| missing domain | 0 |
| placeholder or demo address | 0 |
| internal, test or canary row | 0 |
| THIRD_PARTY / UNKNOWN primary contact | 0 (all `contact_state` null) |
| existing package | 0 |

Nothing had to be excluded on history. The pool is genuinely cold and clean.

Email ownership, by comparing the mailbox host to the site: **45 SAME_DOMAIN,
37 external.** No niche is recorded on any of the 82.

## Part 2 — free ranking

One request per domain, following redirects, reading nothing else. No crawl, no
second page, no audit. The point was only to decide where to spend.

- **70** returned 200 with substantial rendered text
- **12** did not: 4 failed to connect, 4 returned 401/403/406, 2 returned almost
  no content, 1 has a business name in its domain column instead of a domain
  (2959, Keno Deary), 1 returned 56 characters

Ranked shortlist, capped at 15: live, SAME_DOMAIN, owner-named mailbox rather
than a generic one, and squarely inside the stated audience of coaches,
trainers and therapists.

`3174, 3272, 3278, 3389, 3396, 3695, 3786, 3859, 4276, 4567, 4569, 4572, 4849, 4966, 5058`

## Part 3 — cost, stated before spending

| | |
|---|---|
| Canonical price | `PRICES.precheck = 20` |
| First batch | 5 |
| Ceiling | 100 credits |
| Balance before | 497,800 |

Batch chosen from the shortlist leaning toward therapists, who more often take
enquiries through a form than a calendar: **3174, 3786, 4860, 4966, 5058.**

4860 was not on the fifteen because its mailbox is `cynthia.criss@`, which the
shortlist rule read as generic-ish; it is in fact the owner's own name at her
own domain, which is why it was included in the batch.

## Part 4 — canonical precheck results

Through `runPrecheck(...)`, which is what the API route and the queue worker
both call. Nothing hand-written, no direct renderer call left unpersisted.

| id | Business | Outcome | Charged | Score | Findings |
|---|---|---|---|---|---|
| 3174 | Bliss Therapy Co. | CHECKED | 20 | 6 | Every button goes to the same place |
| 3786 | The Jess Effect | **FAILED** | 0 | — | navigation timed out, refunded automatically |
| 4860 | Cynthia A. Criss, LPC | CHECKED | 20 | 15 | Contact page has no form · No opening hours · No reviews |
| 4966 | Resilient Intimacy | CHECKED | 20 | 19 | Contact page has no form · 2 dead links · Footer still says 2021 |
| 5058 | Soul Counseling with Shannon | **BLOCKED** | 0 | — | site refused to load |

**Total charged: 60 credits.** Balance 497,800 → 497,740. The timeout refunded
itself, which is the retry-is-free path working.

## Part 5 — the gate

### 3174 Bliss Therapy Co. — SKIP

Planner returns `NEEDS_DECISION`. Its only finding is `ctas-collapse`, which is
a claim about what the page looks like, and no screenshot supports it. The
planner dropped it as unsupported rather than letting it become a reason. That
is the visual-evidence rule doing its job, and no vision was bought to rescue
it, because a prospect that has not yet cleared fit does not get vision spend.

### 4966 Resilient Intimacy — SKIP

Planner said P2, strong, `lead-capture-gap`, reason "Contact page has no form".

⚠️ **The reason does not survive being looked at.** Her homepage carries
"Request an Appointment", and it points at `kori-hennessy.clientsecure.me`,
which is a SimplePractice client portal. She has a working appointment-request
path. Telling her there is no way to enquire would be the same mistake as
telling James Pearson his booking was only a form.

Her other findings are two dead links and a 2021 footer. Reaching for those
instead would mean overriding the planner's chosen angle by hand, which is the
manual angle-picking the whole system exists to prevent. Skipped rather than
re-aimed.

Worth noting for later: `clientsecure.me` is not in the scheduling-host list,
the same gap `.as.me` had. Adding it would not have changed this outcome,
because `contact-page-no-form` does not consult that list at all. That is the
real defect and it is a separate piece of work.

### 4860 Cynthia A. Criss, LPC — **CANDIDATE**

Planner: **P2, strong, `lead-capture-gap`, allowed length 2**, reason "Contact
page has no form". No unsupported claims, nothing dropped.

Verified by hand before accepting it, because the detector has been wrong three
times this month:

- her contact page is `/information-contact-request`, titled "Contact Request"
- rendered, it has **0 forms, 0 inputs, 0 iframes, 0 scheduling links**
- what it offers instead is a postal address, a phone number, and her email
- the crawl reported `hasCalendar: true` on all four pages, which is a **false
  positive**: the only match is the CSS class `icon-calendar-plus-o`, a font
  icon. There is no calendar. Reported below as a defect.

So the finding is true, and it is true in the way the offer speaks to: a page
called Contact Request that cannot take a request.

| | |
|---|---|
| Contact | `cynthia.criss@openheartsopenmindscounseling.com` |
| Ownership | **SAME_DOMAIN** |
| Name | **Cynthia A. Criss** — verified. Site title, page heading and the mailbox all carry it, and the address sits directly under her name on that page |
| Band | P2, allowed length 2 |
| Send history | none. `emails_sent = 0`, stage New |
| Reply / DNC / unsubscribe | none |
| Maps to the offer | the offer is "fixes the form, booking, reminders, and follow-up path so every inquiry gets answered". This is the form, exactly |

## Part 6 — visual spend

**None.** No surviving reason depended on a visual claim. 3174's did, and 3174
was rejected before any vision could be justified.

## Part 7 — stopping

One clean candidate from the first batch. Per the brief, that is enough, and no
second paid batch was started.

## Part 8 — the package, and why it is not written yet

The package was requested canonically: `enqueue(KIND.PREPARE_OUTREACH, 4860)`,
job **522**, which is how the app itself asks for a first-contact package. The
copy is written by the app's own writer, not by hand.

The job failed:

```
last_error: parseFollowUp is not defined
```

**That is a real production bug and it blocked every first-contact package, not
just this one.** `lib/runner.mjs` imported `canPrepareFollowUp` from
`./followup.mjs` and then called `parseFollowUp`, which that module exports and
this one never imported. The prepare-outreach path dies at runtime the moment it
reaches the parser. Nothing in the suite caught it: it is a runtime-only
reference error inside an edge queue worker, and the only trace is a
`last_error` column nobody reads until a package fails to appear.

Fixed in `7e24432`, deployed to production, and guarded by a new test.

### The guard

`tests/missing-imports.test.mjs`. There is no linter in this project, so it is
the narrowest useful stand-in: if a name is exported by another module in
`lib/` and this file calls it, this file has to have imported it.

It was checked against reality rather than assumed: with the fix reverted it
reports

```
runner.mjs calls parseFollowUp(), exported by followup.mjs, without importing it
```

and with the fix in place it passes. Writing it also surfaced four false alarms
of its own, all fixed, and all worth recording because they are the same family
of mistake:

- `FAIL` matched inside the regex `/BROKEN|FAIL(?!S)/i`
- `recordSend` matched an object method definition
- `fitForPlaybook` matched a destructured default parameter
- `normalise` matched its own declaration, which had been eaten because an
  apostrophe in a trailing `//` comment opened a string that swallowed the
  code after it

Suite: **1,839 passing.**

### Current state of job 522

⚠️ **Still queued.** The fix is live in production (`7e24432`, verified
deployed), the job is past its retry backoff, and the cron is demonstrably
alive — other jobs completed within the last minute. It is not being claimed,
and that is a second, separate queue question I have not chased.

So the package does not exist yet, and **there is no Email 1 or Email 2 copy to
show.** The candidate is real and vetted; the writing step is pending.

## Funnel

| Stage | Count |
|---|---|
| Email-bearing, unrated, no evidence | **82** |
| Excluded free (history, placeholder, internal) | 0 |
| Not live enough to inspect | 12 |
| Live and substantial | 70 |
| Ranked shortlist | 15 |
| Prechecked | 5 attempted, 3 checked |
| Credits spent | **60** |
| P2 after planner | 2 |
| Rejected, unsupported visual claim | 1 (3174) |
| Rejected, reason did not survive inspection | 1 (4966) |
| **Candidates** | **1** (4860) |
| Packages written | 0, blocked then queued |
| Vision spend | 0 |

## Defects found along the way

1. **`parseFollowUp` never imported** — blocked every first-contact package.
   Fixed and deployed.
2. **`hasCalendar` matches font-icon CSS classes.** `icon-calendar-plus-o` made
   a site with no calendar report one on every page. It did not change this
   outcome, but it is the kind of signal the booking precedence rule now trusts,
   so it is worth tightening.
3. **`clientsecure.me` missing from the scheduling-host list**, like `.as.me`
   was. Separately, `contact-page-no-form` does not consult that list at all, so
   a business whose entire enquiry path is an off-site portal can still be told
   it has no way to take enquiries. That is the next real correctness task.
4. ~~Job 522 is due and not being claimed.~~ **Withdrawn.** It was in a
   normal retry backoff and completed at 05:35:35, three minutes after the last
   check here. There was no queue defect. See
   CYNTHIA-PACKAGE-QUEUE-RECOVERY-REPORT.md.

## Safety

Zero outbound emails. Zero prospects contacted. Zero contacts adopted. Zero
packages approved. No cohort. `autoSendApprovedFirstEmails` **false**,
`autoSendApprovedFollowups` **false**. 60 credits spent against a 100 ceiling.
No broad audit of the 82: 70 got one plain page request each and five got a
canonical precheck. No invented claims, no MAYBE queue, no P1 or P3 seeded.
