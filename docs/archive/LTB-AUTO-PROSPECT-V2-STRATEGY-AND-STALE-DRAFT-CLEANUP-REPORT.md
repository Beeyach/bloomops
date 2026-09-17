# LTB — auto-prospect V2 strategy, and the pre-V2 draft cleanup

**Date:** 2026-08-21
**Branch:** `claude/chat-handoff-context-48e33d` → `main` (`14d0df8`)
**Outbound delta:** **ZERO.** 119 send_events before, 119 after.

---

## The problem underneath the 146

The Approvals tab was showing a pile of cards reading "An old draft is waiting",
each with Redo it / Put aside / Read it and no way to act on them together.

Two separate things were wrong.

**1. The backlog itself.** 79 prospects carried a `pending_draft`: plain text
written before Strategy V2, meant to be copied into Gmail by hand. They are not
outreach packages and cannot go through the current approval. There was
deliberately no bulk action, and the reason written in the code was sound (a
bulk *redo* would turn old copy into live outreach for people nobody re-read),
but it left the only correct verdict on 79 identical cards behind 79 clicks.

**2. The skill had drifted, and nobody could see it.** `skills/auto-prospect.skill`
is a zip. Its frontmatter had been partially updated to V2 language, but the
body was still fully V1:

- `## Step 4: If STRONG, write the full sequence` → "All 5 emails"
- `Email 4: Day 14` and `Email 5: Day 21` as explicit shapes
- `## Step 2b: Video verdict` returning a video tier
- `## Step 5: Generate the Email 5 PDF`
- `## Step 5: Send Email 1 via Gmail` → Compose, `subjectbox`, `Message Body`,
  click Send
- `## Step 6: Advance the stage` after that send

Meanwhile the app has enforced the V2 allowance since it shipped. So the skill
was writing five emails and sending the first one from a browser, and the app
was trimming to three and refusing anything already contacted. **A binary blob
is a file nobody can diff, which is exactly how this survived.**

---

## What changed

### The skill is now readable, and it is V2

`skills/auto-prospect.SKILL.md` is now the source in git, and
`skills/auto-prospect.skill` is built from it. A test asserts the two match, so
the next drift fails the suite instead of hiding in a zip.

| | Before | After |
|---|---|---|
| Sequence length | 5, always | the band's allowance: P1 3, P2 2, P3 1 |
| Email 4 / 5 | written as day 14 / day 21 shapes | do not exist; banned by name in the subagent prompt |
| Video | `Step 2b: Video verdict`, `setVideo(...)` | out of the cold sequence entirely |
| PDF | generated for Email 5, uploaded to R2 | out of the cold sequence entirely |
| Email 1 | sent via Gmail Compose in the browser | never; `stageSequence` and stop |
| Stage | advanced by the skill after sending | left alone; the app stamps it when it really sends |
| Qualification | "rate STRONG or SKIP, no middle ground" | four separate answers (fit, contact reason, in scope, evidence), all required |
| CTA | "diagnostic question" | concrete micro-offer, with booking asks and open questions banned |
| Already contacted | not checked before spending a subagent | `emails_sent > 0` skips the prospect at pick time |

The band helper written into the skill mirrors `lib/priority.mjs` exactly, and a
test asserts the literal table so the two cannot drift apart:

```js
const TOUCHES  = { P1: 3, P2: 2, P3: 1 };
const SPACING  = { P1: [0, 4, 10], P2: [0, 4], P3: [0] };
```

The skill also now carries a pre-flight check that runs the app's own refusal
rules (length, corporate phrases, em dashes) before storing anything, so bad
copy is caught before it costs a round trip.

### One tap for the backlog

`POST /api/legacy-drafts` gained `action: 'dismiss-all'`, and the Old drafts
section gained a **Put all N aside** button behind a confirm.

It only ever dismisses. There is still no bulk redo, and the comment explaining
why is still in the file. The sweep:

- writes the same `pending_draft_dismissed_at` flag the single button writes
- appends the same kind of activity-log note, per row
- **excludes stale drafts** (`pending_draft_stale`), because that flag means
  somebody wrote back after the draft was prepared, which makes them a person to
  read rather than clutter to clear
- touches no package, deletes nothing, moves no stage or rating

### A safety test kept its teeth

The stale-thread fix from earlier today put `Date.now()` inside `threadFor`,
which tripped a guard test asserting a thread id is never derived from a
timestamp. The guard is correct, so the clock moved out into `threadAgeDays()`
rather than the assertion being relaxed. `threadFor` reads its id from provider
values only, and the test still proves it.

---

## Before and after, on production

| | Before | After |
|---|---|---|
| Old drafts active | 79 | **1** |
| Old drafts put aside | 0 | **78** |
| Draft text still stored | 79 | **79** (nothing lost) |
| `send_events` total | 119 | **119** |
| Package 23 | `APPROVED`, updated 2026-08-14T05:22:42.565Z | **unchanged, byte for byte** |
| Live packages (PREPARING/READY/NEEDS_DECISION/APPROVED) | 56 | **56** |
| `autoSendApprovedFirstEmails` | `false` | **`false`** |
| `autoSendApprovedFollowups` | `false` | **`false`** |

**78 put aside, 1 left active.** The one left is deliberate: it is the single
`pending_draft_stale` row, meaning a reply arrived after that draft was written.
It sits in Decisions, not in the old-draft pile, and clearing it would have
hidden a person who wrote back.

Package 23 could not have been touched even by accident: its prospect (3163)
carries no pending draft at all, so it was never in the sweep's result set.

The audit trail landed on every swept row:

```json
{"ts":"2026-08-21T19:29:32.659Z","tag":"note",
 "text":"Put the old draft aside with the rest of the pre-V2 batch. Nothing else changed."}
```

---

## Tests

Full suite: **2517 passing, 0 failing.**

New file `tests/auto-prospect-v2.test.mjs`, 20 tests covering all 13 required
cases:

| # | Requirement | Covered by |
|---|---|---|
| 1 | P1 exactly 3 | `P1 allows exactly three cold touches` + live band test |
| 2 | P2 exactly 2 | `P2 allows exactly two cold touches` + live band test |
| 3 | P3 exactly 1 | `P3 allows exactly one cold touch` + live band test |
| 4 | No Email 4/5 by default | `no band allows a fourth touch…`, `the skill never tells a subagent to write five emails` |
| 5 | No video cold step | `the skill keeps video and PDF out of the cold sequence` |
| 6 | No invented pain | `the skill refuses to invent a reason to contact somebody` |
| 7 | Concrete micro-offer CTA | `the skill closes every email on a concrete micro-offer…` |
| 8 | Staging does not send | `a package staged from a sequence is ready for a person, not for the wire` |
| 9 | Gmail send is not the path | `the skill stages the package and never opens Gmail` |
| 10 | Reply stops cold progression | `the skill stops cold progression at any human reply`, `a prospect who already replied cannot be staged` |
| 11 | Stale pre-V2 can be put aside | `the bulk sweep only ever dismisses…`, `the sweep is scoped…` |
| 12 | Current packages not swept | `the bulk sweep…` asserts no `outreach_packages` reference |
| 13 | Package 23 untouched | verified directly against production (table above) |

Plus `the packaged .skill carries the same text as the readable source`, which is
the test that stops this drifting again.

---

## Production proof

Run read-only against live production rows, using the same
`stageableSequence()` the API calls. Nothing was written.

```
#1134  Center for True Health
   rating=💚  band=P1  allowance=3  emails_sent=6  stored=5
   -> REFUSED: 6 emails have already gone to this person.
                A staged sequence starts at Email 1, and theirs already happened.

#2442  Momentum massage
   rating=✖️  band=P3  allowance=1  emails_sent=0  stored=0
   -> REFUSED: No stored email sequence on this prospect.

BAND -> LENGTH, from one identical 5-email V1 sequence:
P1 (💚): stages 3, drops 2  -> READY_FOR_APPROVAL, followups=2
P2 (💙): stages 2, drops 3  -> READY_FOR_APPROVAL, followups=1
P3 (✖️): stages 1, drops 4  -> READY_FOR_APPROVAL, followups=0

EMAIL 4/5 REACHABILITY:
P1 step 4/5: refused - P1 allows 3 cold emails.
P2 step 4/5: refused - P2 allows 2 cold emails.
P3 step 4/5: refused - P3 allows 1 cold email.
```

Prospect 1134 is the clearest evidence the strategy change is real: a 💚 lead
who received **six** emails under V1, now refused a fresh sequence outright.

### What could not be proven, and why

The spec asked for a `/auto-prospect` run against an internal test prospect. Two
things block that, and neither should be worked around:

1. **The canary is refused by design.** `stageableSequence` calls
   `isInternalTest(p)` and returns *"Internal test record. Never part of real
   outreach."* Staging a package for the canary is not possible without removing
   that guard, which would be a worse trade than the missing proof. (The canary,
   6567, is also currently soft-deleted.)
2. **A real `/auto-prospect` run needs the browser path** — the Chrome extension
   driving leadsthatbloom.com logged in with your access code, which I do not
   enter.

So the V2 length, the refusals, the staged package shape and the absence of any
send path are proven by the suite and by the live dry run above. **The
end-to-end browser run is yours to make**, and the skill will tell you what it
staged and that nothing was sent.

---

## What you need to do

**Re-install the skill.** The repo copy is updated, but the copy Cowork has
loaded is separate and still the old one (its description still says "writes the
5-email sequence + PDF, sets the Video column"). Upload this file:

```
F:\bloomtrack-pro\skills\auto-prospect.skill
```

Until you do, `/auto-prospect` runs the old instructions. Everything on the app
side is already live and would refuse the worst of it, but the skill would still
waste subagents writing emails 4 and 5 and try to open Gmail.

Your Downloads copy (`C:\Users\User\Downloads\auto-prospect.skill`, 2026-08-08)
was left alone rather than overwritten.

---

## Not done, on purpose

- Nothing was approved, sent, or armed.
- No send switch was flipped. Both remain `false`.
- No package was created, modified, or deleted.
- No bulk redo was built.
- The one stale draft was left in Decisions where it belongs.
- The `daily-followup-sweep`, `website-audit` and `prospect-pdf` skills were not
  touched.

---

AUTO-PROSPECT V2 IS READY — NEW PROSPECTS ARE QUALIFIED EVIDENCE-FIRST, P1/P2/P3 GENERATE 3/2/1 COLD TOUCHES WITH NO EMAIL 4/5 OR VIDEO STEP, PACKAGES ARE STAGED FOR NATIVE LTB APPROVAL/SEND, AND THE PRE-V2 DRAFT BACKLOG HAS BEEN PUT ASIDE WITHOUT LOSING HISTORY OR SENDING ANYTHING.
