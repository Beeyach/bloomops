# V2 follow-up policy and the legacy sequence cutover

**Date:** 2026-08-10
**Status:** complete. Dry run, then both decisions executed in production.
**Commits:** `1015f7e` policy · `cb271fb` the cap · `83beb59` this report
**Tests:** 1,463 passing (26 new)
**Emails sent: 0. Credits spent: 0. Model calls made: 0.**

---

## What this pass was for

V1 ran a five-email template at everybody. V2 says three emails for P1, two for
P2, one for P3, and those ceilings already live in `lib/priority.mjs`. So the
question was not "where is each prospect in their sequence". It was: **who is
actually mid-sequence, and who is simply finished?**

Almost nobody is mid-sequence.

## The backlog, as it really is

| | count |
|---|---|
| live prospects | 5,813 |
| ever contacted | 1,106 |
| **sent 4 or more** | **652** |
| replied | 68 |
| **queued sequence jobs** | **0** |

Nothing was queued. Nothing was about to fire on its own. That is why there was
time to look properly.

## What V2 owes each of them

Read-only, from `scripts/cutover-dry-run.mjs`. All 1,106 contacted prospects got
exactly one answer each.

| what happens next | count |
|---|---|
| **Manual only, never automated again** | **622** |
| Hold, no usable address | 160 |
| Stop, their ceiling is reached | 159 |
| A person owes them a reply | 62 |
| Eligible for email 3 | 52 |
| Eligible for email 2 | 43 |
| Hold, last contact too long ago | 8 |
| Closed | 0 |
| Unclear | 0 |

**95 prospects out of 1,106 are genuinely still owed a next email.** Everybody
else is finished, waiting on a person, or unreachable.

The table reconciles exactly against the raw counts. Two lines looked wrong at
first and both turned out to be right:

- 62 needing a person, against 68 who replied. The other **6 replied but have no
  recorded send at all**, so they were never in a cold sequence.
- 622 manual-only, against 652 with four or more sent. The other 30 are **22 who
  replied** and **8 with no address**, both of which outrank the ceiling. That
  is the precedence working.

The 160 held for no address are real: 159 have an empty email field, 1 is null,
all with sends on record. They were reachable once. That is a contact problem,
not a no, and the policy says so in those words.

---

## Finding 1: the ceiling applied to nobody

**Not one prospect in the database has a stored priority band. Zero out of
5,813.**

That matters because of how the ceiling was enforced. `coldSequenceExhausted` in
`lib/due.mjs` read:

```js
const band = String(p?.priority_band || '').trim();
if (!band) return false;
```

No band, not exhausted. The column is empty for everybody, so **the V2 ceiling
had never stopped a single follow-up, for anyone, ever.**

The effect was live: **12 prospects were due that day with four or more emails
already sent.** Nothing would have sent, since `AUTO_SEND_FOLLOWUPS` is off. But
the app would have written them a fifth or sixth cold draft and put it in Today
labelled ready to approve.

### Fixed (`cb271fb`)

A row with no band is now held to the highest ceiling any band allows, derived
from the band table rather than typed again. Rows below that ceiling follow the
old cadence exactly as before.

- 630 rows can never come due for a cold email again.
- 62 that would have shown as due stopped showing.
- It can only ever stop a draft being written. There is no path here that sends.

This was a deliberate line with a test behind it, not an oversight, which is why
it was raised as a decision rather than quietly changed.

## Finding 2: two files disagreeing about the same person

Building the retirement caught `lib/cutover.mjs` calling somebody finished while
the live cadence still queued them. Two causes, both fixed:

- **No band** meant "nothing to pursue" in cutover and "no limit" in the cadence.
  Opposite readings of the same empty field.
- **An unrated prospect** is defaulted to P2 by `bandFor`, flagged *provisional*,
  meaning nobody has looked yet. Cutover was using that default to cut a sequence
  short at two emails. Ending someone's sequence on a placeholder that means "we
  have not assessed this person" is a decision made from an absence of
  information. Provisional now falls back to the hard ceiling.

A test now walks a prospect from 0 to 6 emails and asserts the two files agree at
every step, so this cannot drift back.

---

## What was retired

297 prospects carried something the old sequence left behind. Two kinds, treated
differently on purpose:

| | count |
|---|---|
| **Drafts cleared** | **19** |
| **Dates cleared** | **203** |
| Dates kept because they replied | 10 |
| Statements run | 222 |

**The 19 drafts** were cold emails written under the five-email template for
people who have since replied, closed, or passed the ceiling. Each one now
carries a line on the prospect saying what was removed and that it was never
sent, because a draft that vanishes with no explanation is worse than one that
stays.

**The 10 dates on people who replied were deliberately left alone.** On somebody
who wrote back, `next_action_date` may well be Ary's own reminder to reply.
Clearing it would have hidden the person instead of the obsolete work. Verified
after the run: all 10 still there.

### Verified after execution

- Rows still carrying obsolete work: **0**
- Replied dates preserved: **10 of 10**
- Second run of the script: **0 statements**, so it is idempotent
- `send_attempts` 4 before and after. `credit_events` 199 before and after.

The script writes a plain SQL file first and executes it only with `--write`, so
the exact 222 statements were read before anything ran.

---

## Not done, and why

**Shadow generation.** The plan was to generate a few V2 drafts without saving
them, to see how they read. Stopped before spending anything, because generation
runs through the very gate this report was asking about, so it would have proved
the wrong thing. About $0.006 a draft whenever it is wanted.

**Sarah (927) and Mary Ann (1317)** were excluded throughout. Neither was read,
altered, drafted for, or sent anything.

---

## Still open

The cap that now works is the **hard** one: nobody gets more than three. The
**banded** ceilings still do not apply to anyone, because `priority_band` is
empty on all 5,813 rows while the rating that determines the band sits right
there on the same row.

Concretely: a prospect rated ✖️ is a P3 and should get **one** email. Today the
app will give them **three**. Two of the drafts retired above (#1264, #1423) were
exactly that case, and cutover only caught them because it reads the rating
instead of the empty column.

Two ways to close it, and it is a separate decision:

- **Derive the band from the rating** in `coldSequenceExhausted`, the same way
  `lib/cutover.mjs` does. ✖️ drops to 1 email, 💙 and 🥀 to 2, 💚 stays at 3.
  Reuses logic that already exists.
- **Backfill the column** for all 5,813 rows and leave the code alone.

Deriving is the smaller change and cannot go stale. Either way it reduces what
the app sends, never increases it.

## Safety

- `AUTO_SEND_FIRST` off, `AUTO_SEND_FOLLOWUPS` off. Neither touched.
- Scanner concurrency still 2. Hive, scheduler and daily wake untouched.
- No migration, no schema change, no new endpoint.
- Send history never written to.

*(Still open and unchanged: the automatic `VERIFY_SITE` refund path calls
`refundCredits` without a prospect id, so those refunds cannot be traced back to
a prospect. Money is unaffected.)*
