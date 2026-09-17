# V2 shadow follow-up scheduling and the Today preview

**Date:** 2026-08-11
**Status:** complete. Today shows what LTB would follow up on and when. Nothing sends.
**Commit:** `b86e542` — deployment `2d7066ae`, Production, Active
**Tests:** 1,552 passing (37 new)
**Model calls: 1. Cost: $0.00438. Emails sent: 0. Send jobs: 0. Rows written: 0.**

---

## Before

Today decided a prospect was due from `next_action_date` and a per-stage day
gap in `lib/due.mjs`. Those dates came from the old five-email cadence, and
after the cutover most of them were cleared, so the list was thin and had no
concept of *which* email was next. It said "due", never "due for Email 2".

`dueDateFor(band, step, firstSentAt)` already existed in `lib/priority.mjs`,
implementing Day 0 / 4 / 10 exactly as V2 specifies. **It had zero callers.**
The timing policy was written and then never connected to anything.

> **What made a prospect appear in Today for a follow-up:** a `next_action_date`
> in the past, and nothing else. Not the band, not the step, not how many emails
> had already gone.

## Scheduler ownership

One helper: `nextFollowupSchedule(prospect, { relationship, sendEvents, now })`.

The eligibility half is **not re-derived**. `nextStepFor` already owns closed,
replied, deferred, contactable, the ceiling and the stale rule, so this file
adds only the clock. A parity test sweeps every rating against 0–5 sends at four
ages and asserts the scheduler never schedules somebody the policy calls
finished, and never a step past `effectiveCeiling`.

The stale threshold is imported, never re-typed. A test asserts the file
contains no literal `45`.

## Timing

Day 0 / 4 / 10 from the **first** email, via the existing `SPACING` table and
`dueDateFor`. A test asserts the offsets are never restated here.

- P1: Email 2 on day 4, Email 3 on day 10
- P2: Email 2 on day 4, and it is the final touch
- P3: day 0 only, so no follow-up schedule exists at all

Email 3 is anchored on Email 1 plus ten days, **not** Email 2 plus six.

## The anchor, and why half the corpus cannot have one

This is the finding of the pass.

**Production holds five send events in total.** For almost every prospect owed a
follow-up, the moment Email 1 actually went out was never recorded.

| what is available | prospects with 1–2 sends |
|---|---|
| `last_contact_date` | 152 of 152 |
| `last_contact_at` | 86 |
| a real send event | **2** |
| an activity log entry | 44 |

So the anchor resolves in three steps:

1. **A recorded send event** wins. Authoritative, and almost never present.
2. **Exactly one send**: last contact *is* that email. A fact, not an inference.
3. **Two or more sends**: last contact is the *second* email. Email 1's date is
   genuinely unknowable, and subtracting four days to recover it would turn a
   guess into an email a real person receives. These return **UNCLEAR**.

**52 prospects land in UNCLEAR — every single P1 Email 3 candidate.** That is
not a defect to fix in code; it is the honest state of the records.

## Production counts

Read-only across all 1,106 contacted prospects.

| | count |
|---|---|
| **Due now or overdue** | **11** |
| of those, due exactly today | 0 |
| **Coming up within 7 days** | **32** |
| P1 Email 2 due | 2 |
| P1 Email 3 due | **0** (all 52 are UNCLEAR, see above) |
| P2 Email 2 due | 9 |
| **P3 follow-up due** | **0** ✓ |
| unrated/provisional due | 1 (inside the 9 above) |
| held, a person owes them a reply | 62 |
| held, no usable address | 160 |
| held, evidence too old | 8 |
| finished at their ceiling | 159 |
| manual only, 4+ sends | 622 |
| unclear, missing send timestamps | 52 |
| | **1,106** |

The expected invariant holds: **P3 follow-up due is 0.**

Of the 11 due rows, **4 have no Email 1 on file**, so a preview for them
correctly refuses rather than inventing an angle. 7 could actually be drafted.

## Overdue age distribution

| overdue by | count |
|---|---|
| 0–7 days | 1 |
| 8–30 days | 7 |
| 31–90 days | 3 |
| 90+ days | **0** |

The oldest due row's last contact is about **40 days** ago, inside the 45-day
stale rule. Nothing ancient is being revived: the stale rule is what caps this
list, and it is the cutover's rule rather than a second threshold invented here.

## Eligibility precedence

Closed → a person is owed a reply → a date they asked for → can we reach them →
the ceiling → evidence freshness → then, and only then, the clock.

A reply outranks the schedule however overdue the arithmetic says the email is.
Tested for every relationship state that wants a person, for do-not-contact and
unsubscribe, for a missing address, and for stale evidence.

## Today

A new section, **Follow-ups in shadow**, below *Needs you*. A rehearsal must
never outrank somebody who actually wrote back.

> These are the follow-ups LTB would prepare under the new rules. Nothing here
> sends, and nothing is saved. Press Preview to see what it would write for one
> person.

Split into **Due now** and **Coming up in the next 7 days**, longest overdue
first. Each row reads:

> **Jane** · Overdue by 27 days
> Would send final Email 2
> P2 · 1 of 2 cold emails sent · email 2 became due 2026-07-15 · counted from the only email sent
> Last contacted Jul 11 · address on file          `Preview follow-up`

An unrated prospect reads **"Not rated yet"**, never "P2" — P2 means two emails
and their real ceiling is three, so the label alone would be untrue.

The section carries a dashed outline and its own ground so it cannot read as
part of the live queue. Words like `Shadow`, `Would send`, `Due today`,
`Overdue` and `Coming up` only. No `READY_TO_SEND`, no `QUEUED`, nothing is
queued. A test asserts no raw enum reaches the screen and that the only action
is a preview.

**Verified in the browser:** section renders, backgrounds and borders resolve,
the overdue chip measures about **6:1** contrast, no horizontal overflow at
375px, and clicking Preview posts once and renders the result inline.

### One correction to existing copy

Today's old **"Sends itself"** section said *"These follow-up emails go out
automatically on schedule. You don't send them."* Both auto-send switches are
off, and the app's own settings text correctly calls this mode *"worked out but
not sent"*. The section now reads **"On the cadence"** and says nothing goes out
on its own. Leaving a claim that the app sends by itself next to a new section
promising it does not would have been the worst of both.

## Due versus upcoming

Bounded to 7 days, using the `UPCOMING_WINDOW_DAYS` that already existed. A due
date a month out does not appear, asserted by test. That keeps Today at 11 + 32
rows rather than every future date in the database.

## Timezone and send window

Dates are compared in the workspace timezone through the existing `lib/tz.mjs`;
no new date library.

**A bug worth recording:** `tzDaysBetween` counts days **since** a date, so the
first version of the status mapping reported every overdue prospect as upcoming
and every upcoming one as overdue. Caught by walking a fixture from 1 to 20 days
and reading the output rather than trusting the sign. The field is now called
`daysSinceDue`, so the direction is visible at the call site.

Send window was deliberately left alone. `due_at` answers when policy says a
step is due; the window answers when it could be sent. Nothing here mutates a
due date to fit a window, and send-window policy is untouched.

## Preview behaviour

`POST /api/followup-preview` takes a prospect id and returns one draft.

- **The route decides the step itself.** Any `step` in the request body is
  ignored, so a stale page cannot ask for Email 3 on somebody owed Email 2.
  Asserted by test.
- It refuses rather than invents: no follow-up owed, or no Email 1 on file, and
  it returns the reason in plain words.
- The draft runs through the same V2 validators — step, angle, length,
  unsupported claims, third-party claims, unpromised assets, name mismatch.
- The response says `persisted: false, sent: false`.

A test asserts the route contains no `UPDATE prospects`, no
`INSERT INTO outreach_packages`, no `pending_draft`, no `next_action_date =`,
no `emails_sent =`, no `sendApproved` and no `enqueue(`.

**Opening Today makes zero model calls.** The queue is arithmetic over prospects
the page already holds — no fetch, no generation. A test asserts there is no
`fetch(` before the preview handler.

## Model and usage logging

Resolved in the app's favour, and it answers the gap the last pass left open.

The preview route calls **`askBackground`**, whose only database write is
`INSERT INTO ai_usage`. Usage logging is not business state, so the preview gets
proper cost instrumentation while remaining incapable of touching a prospect.

The acceptance script still calls the API directly and so still does not appear
in `ai_usage` — which is why `ai_usage` reads 53 before and after this pass
despite one real call. Scripts stay outside the ledger; the product path is
inside it, and the product path is the one Ary will use.

## Production sample

Picked from the **schedule**, not from raw eligibility, so it proves timing.

### P2 → Email 2 · #1549 Jane · Leading Edge Life Skills Pty Ltd

🥀 → P2 · ceiling 2 · 1 sent · **anchored on 2026-07-11, the only email sent** ·
due **2026-07-15** · **27 days overdue** · final allowed touch · no verified
evidence · no old draft

> **Subject:** quick one on your form follow-up
>
> Hi Jane.
>
> Still curious about that first reply after someone submits your form. If it's
> a manual check rather than automatic, happy to share how I'd set up different
> paths for Leadership versus Global Certification enquiries.

34 words · $0.00438 · **all validators passed.** Same angle as Email 1, keeps
Alice's routing question alive, offers Ary's own work rather than a claim about
other businesses.

### The two empty buckets, not forced

- **P1 → Email 2:** two rows are due (#1362 Derek, #1432 Judy) and **neither has
  Email 1 on file**, so there is no angle to continue. The preview refuses for
  both, which is the correct behaviour and was verified in the browser.
- **P1 → Email 3:** **structurally impossible today.** It needs two sends, and a
  two-send prospect has no knowable first-send date, so every candidate is
  UNCLEAR. Not a bucket that can be filled until send events exist.

The brief said not to force an empty bucket. One sample is the honest outcome.

## Zero-send proof

| | before | after |
|---|---|---|
| `send_attempts` | 4 | **4** |
| `send-approved` jobs | 1 | **1** |
| provider sends (`send_events`) | 5 | **5** |
| approved packages | 1 | **1** |
| `credit_events` | 199 | **199** |
| `ai_usage` | 53 | **53** |
| sent count across sample rows | 3 | **3** |

No email sent. No provider id created. No next-send state written. No prospect
mutated by the scheduler.

## Safety

- `AUTO_SEND_FIRST` **off**, `AUTO_SEND_FOLLOWUPS` **off**. Neither touched.
- Scanner concurrency **2**.
- Untouched: `sendApproved`, Gmail transport, MIME and threading, provider-id
  reconciliation, dedupe, the recipient-name guard, send windows and caps, auto
  allowance, the relationship model, Hive, the scheduler and daily wake.
- No migration, no schema change, no persisted shadow queue. The queue is
  derived on read, so there is no second table to keep true.

**Still open, unchanged:** the Anthropic API key is stored in `settings` in
plaintext. Confirmed still true, deliberately not fixed here.

## Tests

**1,552 passing**, up from 1,515. 37 new in `tests/followup-schedule.test.mjs`
covering the timing table, the anchor rules, due/overdue/upcoming boundaries,
every precedence rule, the stale-rule parity, the queue split and bound, the
labels, and assertions that neither the scheduler, the section nor the route can
send, approve, queue or write.

## Production

Commit `b86e542`, deployment `2d7066ae`, Production, **Active**. Verified in a
local dev server end to end: the section renders, the preview posts once and
refuses correctly when Email 1 is missing.

Served-build evidence remains partial for the same reason as previous passes:
`build.commit` sits behind the access gate. What is confirmed is the deployment
record, the local render, and production counts matching the shipped logic.

## Remaining gap

**Controlled follow-up automation readiness and a canary.** Not started here,
and the switch was not touched.

Before that is sensible, one thing from this pass is worth carrying forward:
**send events need to be recorded from now on**, or Email 3 can never become due
for anybody.

---

`V2 SHADOW SCHEDULING VERIFIED — TODAY NOW SHOWS EXACTLY WHAT LTB WOULD FOLLOW UP ON, AND WHEN, WITHOUT SENDING ANYTHING`
