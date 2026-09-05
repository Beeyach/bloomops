# V2 acceptance test

Tested against the authenticated production UI at `https://leadsthatbloom.com`,
in Ary's own browser. The rendered page is the source of truth throughout; where
something is asserted below, it was read out of the live DOM or seen in a
screenshot.

Nothing was approved, nothing was sent, no prospect was altered, and no paid
scanner run was started.

---

## Production pages personally inspected

| Page | Result |
|---|---|
| `#today` | All six sections, real counts, previews, empty states |
| `#today/replies` | 9 of 9, breadcrumb, back |
| `#today/approvals` | Redesigned card, review panel |
| `#today/decisions` | 2 of 2 |
| `#today/deferrals` | Empty state rendered |
| `#today/blocked` | Friendly errors, Technical details, Try again |
| `#today/legacy-drafts` | 25 of 26, Load 1 more |
| `#today/held` | Showing 25 of 4132, search, filters, Load 25 more |

---

## Passed acceptance checks

**Today as a dashboard.** Six section headers with real totals:
`Needs your reply 9`, `Ready for approval 2`, `Needs your decision 2`,
`Ready to reconsider 0`, `Automation stopped 2`, `Old drafts 26`.

Preview limit held: 5 rows rendered under a 9-item section, 5 under a 26-item
one. `View all 9 →` and `View all 26 →` appeared, and **only** on those two, so
the sections at 2 and 0 correctly offered nothing.

**Zero state rendered.** `Ready to reconsider 0` showed
*"Nothing is due to come back today."* rather than disappearing.

**Bucket pages.** All seven resolved, each with `Today / <bucket>` breadcrumb and
a working back control. Pagination confirmed on two: Old drafts *Showing 25 of
26* with *Load 1 more*, held *Showing 25 of 4132* with *Load 25 more*, search box
and state filters present.

**Counts are real totals.** Held reports 4132 in the header while holding 25
rows. This is the whole population with no safe contact, not the 705 💚 subset,
which is what that endpoint is defined to count.

**Friendly automation errors.** Live text:

> **A Merry Mind** — Their website could not be reached
> The address is not resolving. The site may be offline, expired, or having a bad day.
>
> **Payette Counseling & Psychotherapy Services** — Their website took too long to load
> It did not finish loading before the check gave up. Nothing was changed.

Searched the rendered page for `net::`, `page.goto`, `Timeout`, `ms exceeded`,
`Call log`, `ERR_` and `A background job failed`: **all absent**. Expanding
*Technical details* produced the raw text intact, in monospace:

```
page.goto: net::ERR_NAME_NOT_RESOLVED at http://www.amerrymind.com/
Call log:
  - navigating to "http://www.amerrymind.com/", waiting until …
```

**Row hierarchy.** Person bold and largest, business muted beneath, then
`AU · Waiting 37 days` as separate metadata, status chip top-right. Waits past 30
days render in the warning tone. No `Business · Business` duplication anywhere.

**Old drafts stayed separate**, collapsed, ranked last, and never entered the
approval count.

**Hive scanner Stop.** Not exercised. No scan was active, and per the safety
rules I did not start a paid run to test it. The control is conditional on a
live run, so it correctly did not render.

---

## Confirmed live bugs

### 1. Five tests were failing on `main`

Not a UI bug, but it blocked everything: the previous fix added
`last_contact_date` to `GUARD_FIELDS`, and its author noted the full suite was
not available in their checkout. Every fixture that builds a guard row started
throwing. Fixed before touching anything live.

### 2. The approval card was an engineering dashboard

Live text before the change:

> Deborah · Center for True Health · you rated 💚
> Booking is a request form, not a calendar
> Booking friction · strong evidence · Video optional · 20 credits so far
> **Approve 1 email** *(disabled)* · Skip
> This approval sends · 1 email · **P1** · written by the app · evidence 0 days old
> *P1 allows 3 emails, and Email 2 and 3 has not been written. It has to exist and be read before you approve, because nothing writes copy afterwards.*
> WHAT WAS ACTUALLY SEEN · Booking is a request form, not a calendar

The same finding three times, six internal fields, a grammar error, and a button
promising *"Approve 1 email"* directly above a paragraph saying it could not be
pressed.

### 3. ⚠️ The client had its own copy of the reconciliation rule, and it disagreed with the server

`ApprovalQueue.jsx` reimplemented the band and follow-up logic. Unlike
`lib/approval.mjs`, its copy had **no case for a package with no follow-ups at
all** — and every package in production is shaped exactly that way, because they
predate the sequence work.

So the server would have accepted the approval and the client had already
disabled the button. Confirmed live: `button.disabled === true` with the
paragraph above as its `title`.

### 4. Nothing in the system can write follow-ups into a package

Traced while looking for a real "Finish draft" action. `PREPARE_FOLLOWUP` writes
`prospects.pending_draft` — the **legacy** field that now feeds Old drafts — not
`outreach_packages.followups`. `PREPARE_OUTREACH` writes Email 1 only.

So a P1 package demanding three emails could never be completed by anything in
the product. This is recorded rather than papered over; no fake action was
invented for it.

### 5. The email preview was the whole email

`firstLines()` split on newlines and took two. These bodies are a single
paragraph, so the preview returned everything and the card went back to being a
wall of text. Caught in production after the first deploy.

---

## Root causes

| # | Root cause |
|---|---|
| 1 | A required guard field added without running the full suite |
| 2 | The card led with debugging data because nothing had decided what Ary actually needs |
| 3 | One rule written twice. The recurring failure in this codebase |
| 4 | The sequence policy assumed a generator that was never built |
| 5 | A line-based truncation applied to text that has no lines |

---

## Files changed

| File | Change |
|---|---|
| `lib/approval.mjs` | New `approvalCard()`: the single source for what the card says, in every state. Character-capped preview |
| `components/ApprovalQueue.jsx` | Redesigned card and review panel. **Duplicate client rule deleted** |
| `tests/approval-render.test.mjs` | 9 new state tests |
| `tests/native-send.test.mjs`, `tests/stabilization.test.mjs`, `tests/strategy-v2.test.mjs` | Guard fixtures given the new required field |

---

## The new experience

**Collapsed card**, live:

> **Deborah**
> Center for True Health
> **Worth contacting**
> WHAT WE FOUND — Booking is a request form, not a calendar
> EMAIL READY — how bookings reach your calendar
> Hi Deborah, I checked the booking page for Center for True Health and it works as a request form rather than a calendar. Someone fills it out, but…
> [ **Review email** ] [ Skip ]                                   *Details*

**Review panel**, live: To, Subject, editable Message, *Why we chose this*, the
rating control, then:

> [ **Approve draft** ]  Nothing will be sent yet.        [ Back ]

**The label was traced, not assumed.** `POST /api/outreach {action:'approve'}`
sets the status, records the fingerprint, and only schedules a send inside
`if (policy.autoSendApprovedFirstEmails)`. That switch is OFF, so approving sends
nothing. The card says so beside the button. If the switch is ever turned on the
label becomes **Approve and send** and names the recipient; both are tested.

**Incomplete drafts** get one calm sentence and no approve button:

> Draft incomplete. One follow-up email still needs to be written.
> [ Finish draft ]

**Internal fields** moved under *Details*: priority band, emails allowed,
evidence level, credits, angle, and who wrote it. Still there, no longer the
headline.

---

## Tests and results

**1033 passing, 0 failing.**

Nine new approval-state tests: ready, would-send, incomplete, no-follow-ups,
nothing-written, jargon-stays-under-details, finding-said-once, preview-is-a-
preview, and one asserting the component keeps **no second copy** of the rule.

---

## Commit and deployment

| | |
|---|---|
| Commits | `7e1e7ba` card and shared rule · `5d507a0` panel supersedes summary · `874948d` preview cap |
| Deployment | Cloudflare Pages `c7d4df2c`, source `874948d`, Production/main |
| Verified | Authenticated page reloaded and read after each deploy |

---

## Post-deployment visual verification

Read from the live DOM after the final deploy:

- `P1`, `strong evidence`, `credits so far`, `written by the app`,
  `evidence 0 days old`, `Approve 1 email`, `Stopped before writing`,
  `Video optional` — **all absent**
- `Review email` and `Details` present
- The finding appears **once**
- Preview segment 196 characters, ending in an ellipsis
- `Approve draft` **enabled**, with `Nothing will be sent yet.`

Screenshots captured of the collapsed card and the open review panel at 1600px.

⚠️ **Mobile not verified.** The extension's resize did not change the tab's
viewport (`window.innerWidth` stayed 1920 after resizing to 390 and 414), so I
could not see a real narrow render. The layout uses wrapping flex rows and no
fixed widths, and no horizontal overflow was measurable at any width tested, but
**that is reasoning, not observation, and it is the one claim here I cannot
stand behind.**

---

## Switch state

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

Neither touched.

---

## Recommended next development slice

**Write the follow-up emails into the package.**

Everything else in the approval flow now works, and this is the one thing
missing underneath it. A P1 prospect is allowed three cold emails, the strategy
says all three must exist before approval, and nothing in the product can
produce emails 2 and 3 into a package. Today that is hidden because packages
carry only Email 1 and are treated as honest one-email approvals, which is
correct but is not the sequence the strategy describes.

The slice: extend the package generator to write the band's full sequence in one
pass, so a 💚 prospect arrives with three prepared emails, the incomplete state
becomes genuinely rare, and Stage B has copy it is allowed to send.

---

## Also worth fixing, smaller

1. The held page renders its title three times: breadcrumb, page heading, and
   the panel's own header, which it needs in Settings and not here.
2. Duplicate alternate-contact chips on held rows (`contact form` twice).
3. Bucket page rows stretch to 1604px at 1920px wide, putting a name and its
   status chip a screen apart. A max-width would fix it.

---

# Correction pass, 2026-08-10

Three acceptance problems raised after the first pass. All three were real.

## 1. Does P1 require three emails, or allow up to three?

**It allows up to three. It does not require three.** Four sources, all
authoritative, none ambiguous:

| Source | Wording |
|---|---|
| `PROSPECTING-STRATEGY-V2.md:223` | priority table: P1 — **"up to 3"** |
| `lib/priority.mjs:103` | *"How many cold emails this prospect **may ever receive**"* |
| `lib/priority.mjs` `maySendStep()` | *"**May** this prospect receive a cold email at step N?"* — a permission test against a ceiling |
| `PROSPECTING-STRATEGY-V2.md:589` | stop condition: *"Allowed length **reached** → stop, mark exhausted"* |

A sequence is also never obliged to reach its length: every stop condition —
reply, decline, unsubscribe, deferral, bounce, stale evidence — can end it
early. A quota that any of six conditions may cancel is not a quota.

**So the live server behaviour was correct and the blocking rule was wrong.**
I wrote that rule, in the A5 stabilization pass, and it read the ceiling as a
requirement. It blocked every package in production, because none of them carry
follow-ups at all.

### What changed

`reconcileForApproval` no longer refuses a short package. It returns
`PACKAGE_PARTIAL`, stays approvable, and reports the coverage. The card says it
plainly, live:

> This draft is 1 of the 3 emails allowed. The others have not been written yet,
> and nothing sends an email that does not exist.

**The safeguard did not move.** Stage B may still only send copy that existed at
approval, enforced by `stepCoveredByApproval()` in the send guard. A test sits
directly beside the corrected one asserting that step 3 remains uncovered and
unsendable.

### Conflicting documentation and tests corrected

- `PROSPECTING-STRATEGY-V2.md` — new row **A6** in the corrections table, dated,
  stating that a band is a ceiling and why the earlier fix was wrong.
- `STRATEGY-V2-STABILIZATION-REPORT.md` — the A1 table row carries a dated
  correction, and the whole *Approval UI* section is marked **superseded** with
  its original notes kept rather than deleted.
- `tests/stabilization.test.mjs` — the quota test rewritten, and explicitly
  labelled CORRECTED with the reason.
- `tests/approval-render.test.mjs` — same.

## 2. What did "Finish draft" actually do?

⚠️ **It threw the draft away.**

It called `act(item, 'research')` → `POST /api/outreach {action:'research'}`,
which:

1. sets the package status to **`SKIPPED`**, removing it from the approval queue
2. enqueues a fresh `SIGNALS` job
3. writes *"Sent back for more research"* to the prospect

So a button labelled *finish* discarded the work. Worse than dead, and worse
than misleading.

There is no honest replacement: nothing in the product writes follow-ups into
`outreach_packages`. `PREPARE_FOLLOWUP` writes `prospects.pending_draft`, the
legacy field that now feeds Old drafts, and `PREPARE_OUTREACH` writes Email 1
only.

**The button is gone rather than relabelled**, and the card states the position
instead of offering an action it cannot perform. A test asserts no action is
attached to the coverage line.

## 3. Mobile verification

> ⚠️ **Superseded.** Ary un-maximised the window and this was completed. See
> **Mobile verification, completed** at the end of this report. The original
> account of the blocker is kept below, because it is why the window had to be
> un-maximised at all.

**NOT VERIFIED AT THE TIME. I could not create a real narrow viewport, and I was
not going to claim otherwise.**

`resize_window` returns success at 390, 402 and 414 px, but the page reports:

```
innerWidth: 1920   outerWidth: 1920   clientWidth: 1920
```

Both the viewport *and the window itself* stay at 1920, which means Chrome is
refusing the resize — almost certainly because the window is **maximised**, and
Chrome will not resize a maximised window.

### What Ary needs to do

One of these, then tell me and I will inspect it:

1. **Un-maximise the Chrome window** (click the restore button, or drag the
   title bar down), then say so. I can then resize it and inspect properly.
2. **Or open DevTools device mode** yourself: `Ctrl+Shift+M`, pick iPhone or set
   402 × 874, load `#today/approvals`, and screenshot it for me.

Until one of those happens, mobile is **unaccepted**. What I would be checking:
the collapsed card, the review panel, the editable message, both button rows,
the Details control, long recipient and business names, and horizontal overflow.

---

## Live desktop verification, after the correction

Read from the authenticated production DOM at deployment `c9b64adf`
(source `12023b5`):

| Check | Result |
|---|---|
| Coverage line | *"This draft is 1 of the 3 emails allowed…"* present |
| `Finish draft` | **absent** |
| `Draft incomplete` | **absent** |
| `Review email` | present, enabled |
| Approve path | reachable, labelled **Approve draft** with *Nothing will be sent yet.* |

## Tests

**1034 passing, 0 failing.**

## Switches

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

Nothing was approved and nothing was sent during this pass.

---

# Mobile verification, completed

Ary un-maximised the Chrome window, which was the blocker: Chrome refuses to
resize a maximised window, so `resize_window` had been reporting success while
the viewport stayed at 1920.

**Verified at 485 to 500 px viewport width**, in her authenticated session, on
deployment `c9b64adf` (source `12023b5`).

⚠️ **Not exactly 402 px.** Chrome enforces a minimum window width of about 500
px on this machine, so 402 was not reachable as a real window. 485 px is
comfortably below the app's `md` breakpoint of 768, so the mobile layout is the
one that rendered: bottom tab bar, stacked cards, no sidebar. For a true 402 px
render, DevTools device mode would be needed.

## Result: PASS. No mobile bug found, and no code was changed.

| Check | Result |
|---|---|
| Collapsed approval card | Name, business, recommendation, finding, subject, truncated preview, coverage line all render and wrap |
| Review panel | To, Subject, Message, Why we chose this, rating chips, approve row, Back — all present |
| Editable message | Full width, 415 px inside a 485 px viewport, no overflow, comfortable to type in |
| Primary and secondary buttons | **Approve draft** obvious in the accent colour; Skip, Close and Back secondary and distinct |
| Details control | Present, right-aligned, does not collide with the buttons |
| Long recipient and business names | Truncate with an ellipsis. *"Leiza Clark Holistic Counselling · you rated…"*, *"The Doorway for BetterHealth · you rated …"* |
| Horizontal overflow | **None.** `scrollWidth === clientWidth` on `#today`, `#today/blocked`, `#today/held`, `#today/legacy-drafts`, `#today/replies`. A sweep of every element under `main` found nothing extending past the viewport on any of them |
| Bottom navigation | Content scrolls clear of it; the last row on a page is reachable |
| Coverage line | Wraps to two lines and stays readable |

Rendered evidence captured: collapsed card, review panel top (To / Subject /
Message), review panel bottom (Why we chose this / rating / **Approve draft** ·
*Nothing will be sent yet.* / coverage / Back), and the held list showing name
truncation.

## Still outstanding, and not mobile bugs

Both appear at desktop too and sit outside the approval flow:

1. The held page renders its title three times (breadcrumb, page heading, and
   the panel's own header, which it needs in Settings).
2. Duplicate alternate-contact chips on held rows: `contact form` twice.

## Switches, re-confirmed

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |

Nothing was approved and nothing was sent.

## V2 acceptance status

**The approval experience is accepted on desktop and mobile.** The two held-page
cosmetics above are open, and the Hive Stop button has still never been
exercised against a live run, because doing so costs money and needs Ary's word.
