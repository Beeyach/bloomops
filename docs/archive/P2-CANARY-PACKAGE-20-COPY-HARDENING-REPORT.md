# You cannot see their inbox

Date: 2026-08-13 · commits `e1992da`, `1751743` · Pages `41faf659`, `b90c9efe` · tests 2,121 passing

Package 20 was written from one verified fact and told a stranger how her office
works. The fact was right. Everything after it was invented.

**0 emails sent. 0 approvals. 0 credits. Automation permission OFF. Both switches OFF.**

---

## Part 1 — the unsupported claims, and what the validator did

Run through the live validator with package 20's real supporting keys
(`booking-is-a-form`, `ctas-collapse`, `no-reviews`):

```
PASSED  "it means each booking needs a reply back and forth before a time is set"
PASSED  "get people onto a set time faster, no back and forth needed"
PASSED  "no back and forth needed"
PASSED  "makes scheduling quicker"
PASSED  "saves them time"
PASSED  "people can book faster"
PASSED  "requires back and forth"
PASSED  "faster to land on a time"
PASSED  "staff spend time coordinating"
```

> **The validator caught none of them. Nine out of nine walked through.**

The existing rule is about *failure*: the path breaks, leads are lost, people
give up. Neither sentence claims anything failed. They claim something about her
internal process — who replies, how many rounds it takes — and about a benefit
nobody measured. That is a different move, and nothing was watching for it.

The verified fact is narrower than either sentence:

> The site's consultation CTAs lead to a contact form rather than a visible
> self-serve scheduling calendar.

What a browser standing outside the building cannot see: how she processes
submissions, whether every request needs a reply, whether she phones people
back, whether she sends a scheduling link, whether any of it is slow, or whether
a calendar would change it.

## Part 5 — the hardening

Two new families in `lib/outcome-claims.mjs`, about the move rather than the
vocabulary. Blacklisting "back and forth" would catch one sentence and let
"someone has to write back" through, which is the same claim in different words.

**`PROCESS_INFERENCE`** — what happens to a request after it is sent. Rounds of
correspondence however phrased; a request needing a human step before it
resolves; somebody on their side having to reply, chase, coordinate or confirm;
somebody waiting; work done by hand.

**No stand-down.** There is no finding key for "we watched how they answer their
email", so nothing licenses this — not even a verified breakage.

**`BENEFIT_INFERENCE`** — faster, quicker, sooner, less time, fewer steps,
easier, saves time, cuts down on effort, more bookings. Stands down only for a
finding that actually timed something (`SPEED_KEYS`).

### Proven both directions

| Caught (14) | Allowed (6) |
|---|---|
| each booking needs a reply back and forth | I could not tell from the outside whether that is intentional |
| get people onto a set time faster | Maybe you prefer to review requests before scheduling |
| no back and forth needed | The consultation buttons lead to the contact form rather than a visible calendar |
| makes scheduling quicker | I can send over a short outline of how to offer direct scheduling |
| saves them time | Your contact page has no form on it |
| people can book faster | I looked at your booking page and the buttons go to the contact form |
| requires back and forth | |
| faster to land on a time | |
| staff spend time coordinating | |
| **someone has to write back before a time is set** | |
| **they end up chasing to confirm a slot** | |
| **each request waits for a reply** | |
| **you have to coordinate a time by email** | |
| more bookings for you | |

The four in bold are the point: none of them contains a banned phrase.

### One correction the tests forced

I first scoped the speed rule to the booking path only, which let "the page
loads faster once those images are sized" through on a layout finding. That is
the same unmeasured claim about a different subject, so the scope now includes
the page itself. A real timing finding still stands it down.

## Part 3 — the greeting

`lib/outreach.mjs` read:

```js
`Their name: ${p.name || p.business_name || 'there'}`
```

Prospect 3163 has no recorded person, so the model was handed the company as the
name and wrote **"Hi AZ Therapy Quest LLC,"**. Not wrong about anybody — just
plainly written by a machine.

Now `p.name || 'there'`, in both writers. The business still goes to the model on
its own line, where it belongs. **The mailbox local-part is never used**: `brianda@`
is a strong hint and still a guess, and guessing a stranger's first name wrong is
worse than not using one.

## The part the validator could not do alone

The regeneration then failed twice **in production**, which is the hardening
working and the prompt not carrying its weight:

```
attempt 1  rejected: claims an outcome the evidence does not support: "booking faster"
attempt 2  Email 1 written; Email 2 rejected the same way
           -> package saved short, exactly as the P2 contract requires
```

A rule the model is never told is a rule it breaks every time, burning retries
on drafts nobody can keep. So both writers now say it plainly:

> Never say what happens after somebody uses their form or contacts them. You
> cannot see their inbox, so you do not know who replies, how many messages it
> takes, or whether anybody waits.

> Never say a change would be faster, quicker, easier, or save anyone time or
> effort. Nothing here measured that. Offer the change; do not promise what it does.

With that deployed, the next attempt produced a complete package **first time**.

## A defect found on the way, not papered over

Attempt 3 failed with:

```
D1_ERROR: UNIQUE constraint failed: outreach_packages.workspace, outreach_packages.prospect_id
```

`idx_pkg_live` is a partial unique index allowing **one** live package per
prospect across `PREPARING`, `READY_FOR_APPROVAL`, `NEEDS_DECISION`, `APPROVED`.
`savePackage()` always INSERTs a new version. So when attempt 2 left an
incomplete `PREPARING` row, every later retry collided with it.

The handler's own comment says `PREPARING` is deliberately left unblocked so
"the retry that exists to finish it" can proceed — but the retry cannot finish
it, because it inserts rather than completes, and the index refuses the insert.

**An incomplete P2 package therefore blocks its own repair.** I cleared package
22 by hand to unblock this task and did not change the preparation path: that is
a queue and versioning fix, not a copy fix, and it deserves its own pass rather
than being slipped into this one. Flagged for you to schedule.

## Part 6 — the regeneration

Canonical throughout. I retired the superseded versions and let the normal
`PREPARE_OUTREACH` job do every write.

| Package | Version | Status | Why |
|---|---|---|---|
| 20 | v1 | `SKIPPED` | the copy this task exists to fix |
| 22 | v2 | `SKIPPED` | incomplete — Email 2 refused before the writer knew the rule |
| **23** | **v3** | **`READY_FOR_APPROVAL`** | **clean, first attempt, both touches** |

Canonical versioning required the new rows: `savePackage` always writes a new
version, and `idx_pkg_live` guarantees only one is live. **Exactly one active
package**, verified.

## Part 4 — the copy

### Email 1 — `your booking form vs a calendar`

```
Hi there,

I looked at your booking page and saw it uses a request form rather than a
calendar someone can pick a time from directly. One thing I could not tell from
outside is whether that is intentional, maybe you prefer to review each request
before confirming a time. If that is the case, this does not apply and you can
ignore the rest of this note. If you have been meaning to look at it, I can send
over the two or three steps I would cut from the booking path. Just reply yes and
I will send them over.

Thanks,
Ary
```

### Email 2 — `booking form steps, still open`

```
Hi there,

Still happy to send the two or three steps I'd cut from your booking form path if
you want a calendar option instead of a request form. Just reply yes and I'll
send them over.

Thanks,
Ary
```

### Run back through the validator

```
supporting keys: ["booking-is-a-form"]
Email 1 claims: []
Email 2 claims: []
```

Every sentence is now one of the three permitted kinds: the observed fact, what
could not be told from outside, or the offer. No back-and-forth, no speed, no
effort, no conversion, no invented pain. Email 2 repeats the same fact and the
same offer with no new angle.

## Part 7 — tests

`tests/process-inference.test.mjs`, 16 behavioural tests covering all 15 points:
back-and-forth in four different phrasings, faster, saves time, conversion and
drop-off, the three allowed sentence kinds, the offer surviving the rule, both
stand-downs, process inference never being licensed by any finding, the greeting
fallback in both writers, the mailbox local-part not being name evidence,
Email 2 not introducing a benefit Email 1 could not claim, the exact sign-off,
and purity.

One test corrected itself: `ensureSignOff` needs `operatorName`, and calling it
bare proved nothing. Fixed to assert the real contract.

Suite: **2,121 passing**, up from 2,105. `next build` clean.

## Part 8 — acceptance, read-only

| Check | |
|---|---|
| prospect 3163 | ✅ |
| package 23, version 3 | ✅ |
| exactly one active package | ✅ |
| P2 | ✅ |
| `allowed_length = 2` | ✅ |
| Email 1 stored | ✅ |
| Email 2 stored | ✅ |
| no Email 3 | ✅ |
| `sequence_approved = 0` | ✅ |
| `sequence_max_step = null` | ✅ |
| `auto_followup_approved = 0` | ✅ |
| `approved_fingerprint` absent | ✅ |
| `reviewed_at` absent | ✅ |
| `emails_sent = 0` | ✅ |
| `send_events` for 3163 | **0** |
| greeting neutral in both | ✅ |
| both sign off exactly `Thanks,` / `Ary` | ✅ |
| no reply, DNC or unsubscribe | ✅ |
| `AUTO_SEND_FIRST` / `AUTO_SEND_FOLLOWUPS` | **false / false** |

## Part 9 — sweep status

> **LIVE SWEEP ACCEPTANCE STILL PENDING**

Last sweep `2026-08-12 04:00:29 UTC`, before the scheduler deployed. Now
`2026-08-13 01:01 UTC`. Next natural one is `04:00 UTC` today. Not forced.

0 armed packages, 0 follow-up send jobs, `send_events` still **10**.

## Safety

| | |
|---|---|
| Emails sent | **0** |
| Approvals | **0** |
| Sequence approvals | **0** |
| Auto-followup grants | **0** |
| Switch changes | **none** |
| Contact changed | **no** |
| Site intel refreshed | **no** |
| Additional paid prechecks | **0** |
| Credits spent this task | **0** (60 total across both canary tasks, ceiling 100) |
| Cynthia / package 19 | untouched |

## The next human action

Open Today → Ready for approval and read package 23. Nothing moves without you.
