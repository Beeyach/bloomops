# LTB — auto-prospect V2, evidence-triggered video

**Date:** 2026-08-21
**Commit:** `d6ebc0a` on `main`
**Outbound delta:** **ZERO.** No send, no approval, no switch flipped.

---

## The correction

The previous pass retired video from cold outreach outright. That was too blunt,
and this reverses it to the right rule:

> Audit first. If the evidence is strong enough that showing the issue is
> genuinely more useful than describing it, the prospect is VIDEO_WORTHY and the
> video rides one of the touches the band already allows.

Video is conditional on evidence. Not automatic, not banned.

---

## The app already had this. The skill did not.

`lib/assets.mjs` has carried a deterministic `videoDecision()` the whole time,
and it is exactly the rule Ary described. It was simply never the thing the skill
consulted.

| Evidence | `videoDecision` |
|---|---|
| 2+ showable findings **and** a visual playbook | `VIDEO_RECOMMENDED` |
| exactly 1 showable finding | `VIDEO_OPTIONAL` (one thing is a sentence) |
| showable finding, non-visual angle | `VIDEO_OPTIONAL` |
| findings real, none showable | `EMAIL_ONLY` ("nothing to show") |
| below STRONG sufficiency | `EMAIL_ONLY` |
| site unreadable, or check stale | `EMAIL_ONLY` |
| video already exists | `EMAIL_ONLY` |

So the skill was not taught a new rule. It was pointed at the existing one, and
now lists the same showable-finding keys and the same four visual playbooks
verbatim, with a test asserting every one of them is present so the two cannot
drift apart quietly.

---

## The gap that would have made this silently not work

This is the part worth reading.

The **old sweep skill** supported video wording: `body_video` on a sequence
entry, swapped in at send time when a rendered video existed. That contract
still exists in `setEmailSequence`, which validates `subject_video` /
`body_video` and stores them.

But:

1. **`stageableSequence` dropped them.** It read `subject` and `body` and nothing
   else, so staging a sequence threw the video wording away.
2. **`preparedFollowups` dropped them.** It normalised to
   `{step, subject, body, approved}`, so even a package that had them could not
   surface them.
3. **`send-runner.mjs` had no video logic at all.** Zero references.

So a skill following the new instructions would have written perfectly good
video copy, staged it, and had it silently discarded. The prospect would have
received the plain email and nobody would have noticed the video never went.

Three surgical changes close it:

- `preparedFollowups` now carries `subjectVideo` / `bodyVideo` (accepting both
  camelCase and the stored snake_case)
- `sequencePackageFields` keeps them, and **only where they exist**, so a
  package for an unfilmed prospect does not claim video was considered
- `send-runner` picks between the two wordings through one new pure module

### `lib/video-copy.mjs`

One function decides, so both failure modes are testable without a mailbox:

```js
videoCopyFor(step, prospect)
  → no video_url            → plain body   (no-video-url)
  → video_sent_at stamped   → plain body   (video-already-sent)
  → step has no video copy  → plain body   (no-video-copy-for-this-step)
  → otherwise               → video body + link appended after the sign-off
```

**Never promise a video that does not exist.** The render happens after staging,
so a follow-up can come due before the file is there. No URL means the plain body
sends.

**Exactly one video per prospect, ever.** `video_sent_at` is stamped in the *same
UPDATE* that increments `emails_sent`. Two writes could leave a prospect counted
as emailed but not as filmed, and the next follow-up would send a second video.

---

## The shape

Email 1 **offers**. The last allowed email **delivers**. Nothing gains a touch.

| Band | Touches | Video-worthy shape |
|---|---|---|
| **P1** | 3, days 0/4/10 | offer · nudge · send it anyway |
| **P2** | 2, days 0/4 | offer · send it anyway |
| **P3** | 1 | one strong email; video only on unusually strong evidence or Ary's call |

Email 1 carries **no link**, and the skill's pre-flight refuses a URL pasted into
`body_video` (the app appends it, so a written one would arrive twice) and
refuses video wording on any email except the last.

---

## Production proof

Real modules, in memory. Nothing written, nothing sent.

```
=== VIDEO_WORTHY (P1, 💚) ===
band=P1 allowance=3  staged: 3 emails, dropped 0, status=READY_FOR_APPROVAL
email 1 mentions a URL? no
  step 2: hasVideoCopy=false  filmed->plain(no-video-copy-for-this-step)
  step 3: hasVideoCopy=true   filmed->VIDEO
                              notRendered->plain(no-video-url)
                              alreadySent->plain(video-already-sent)
     link tail: Here's the link to it: | https://file.gobloomwired.com/v/kim
     link count: 1
  total emails this prospect can ever get: 3 (video added 0)

=== VIDEO_WORTHY (P2, 💙) ===
band=P2 allowance=2  staged: 2 emails, dropped 0
  step 2: hasVideoCopy=true   filmed->VIDEO
  total emails this prospect can ever get: 2 (video added 0)

=== NOT video-worthy (P2, 💙) ===
band=P2 allowance=2  staged: 2 emails, dropped 0
  step 2: hasVideoCopy=false  filmed->plain(no-video-copy-for-this-step)
  total emails this prospect can ever get: 2 (video added 0)
```

Every row of that output is a required behaviour: the offer carries no link, the
delivery step swaps wording only when a real video exists, an unrendered video
falls back silently, a sent video never repeats, and the touch count never moves.

---

## Tests

**Full suite: 2532 passing, 0 failing.** `tests/auto-prospect-v2.test.mjs` is now
34 tests.

| # | Requirement | Covered by |
|---|---|---|
| 1 | P1 = max 3 | `P1 allows exactly three cold touches` |
| 2 | P2 = max 2 | `P2 allows exactly two cold touches` |
| 3 | P3 = max 1 | `P3 allows exactly one cold touch` |
| 4 | No default Email 4/5 | `no band allows a fourth touch…`, `the skill never tells a subagent to write five emails` |
| 5 | No-evidence cannot become VIDEO_WORTHY | `a prospect with no showable evidence cannot become VIDEO_WORTHY` |
| 6 | Visual evidence can | `visually meaningful evidence can become VIDEO_WORTHY, on the app criteria` |
| 7 | VIDEO_WORTHY sequence offers the video | `a VIDEO_WORTHY sequence offers the video and never links it in email 1` |
| 8 | No-reply follow-up carries the video, within the ceiling | `video copy survives staging into the package…`, `video never buys an extra touch` |
| 9 | Yes-reply stops the cold sequence | `the skill stops cold progression at any human reply`, `a prospect who already replied cannot be staged` |
| 10 | Video script uses stored evidence only | skill asserts grounding + `video_reasons` required; `the skill refuses to invent a reason…` |
| 11 | Non-video-worthy gets no video copy | `a non-video-worthy prospect gets no video copy at all` |
| 12 | Staging does not send | `a package staged from a sequence is ready for a person, not for the wire` |
| 13 | Package 23 untouched | verified against production, unchanged at `2026-08-14T05:22:42.565Z` |

Plus the mechanism itself: one-video-only, no-URL fallback, link appended once
and never mid-body, video copy facing the same corporate-phrase and em-dash bans,
a video subject with no video body refused, and Email 1 structurally unable to
carry a video.

### Two existing tests widened, not weakened

`followup-threading.test.mjs` asserts on `send-runner` source text, and two
single-line regexes broke on the new line breaks. Both still assert their
invariant, now formatting-tolerant:

- *a follow-up sends its own approved copy* — now parses the branch and asserts
  `pkg.email_body` is **unreachable** from the follow-up side, which is stronger
  than the string match it replaced.
- A new test, *the video variant is still the approved step*, asserts
  `videoCopyFor(approvedStep, …)` and never `videoCopyFor(pkg…)`, so video
  wording can only ever come from copy Ary approved.

---

## Stale drafts: unchanged from the last pass

78 put aside, 1 left (the `pending_draft_stale` row, where a reply arrived after
the draft was written). All 79 draft texts still stored. Nothing deleted.

| | State |
|---|---|
| `send_events` | **119**, unchanged |
| Package 23 | **APPROVED**, `updated_at` unchanged |
| Live packages | **56**, unchanged |
| `autoSendApprovedFirstEmails` | **`false`** |
| `autoSendApprovedFollowups` | **`false`** |

---

## What you need to do

**Re-install the skill** — `F:\bloomtrack-pro\skills\auto-prospect.skill`. The
Cowork copy is separate and still the old one. Until you upload it,
`/auto-prospect` runs V1 instructions.

**One judgement call is yours.** `videoDecision` distinguishes
`VIDEO_RECOMMENDED` (2+ showable findings on a visual angle) from
`VIDEO_OPTIONAL` (one showable finding). I set the skill's VIDEO_WORTHY bar at
RECOMMENDED only, so a single showable finding stays an email. That matches "one
thing to point at is a sentence" in the app's own comments. If you want the
optional tier filmed too, say so and it is a one-line change to the threshold.

---

## Not done, on purpose

- No video was rendered for anyone. The skill decides; you run the render.
- Nothing was approved, sent, or armed. No switch flipped.
- The canary still cannot be staged (`isInternalTest` refuses it) and I left that
  guard alone, so the end-to-end browser run remains yours to make.
- `daily-followup-sweep`, `website-audit` and `prospect-pdf` untouched.

---

AUTO-PROSPECT V2 VIDEO STRATEGY IS READY — WEBSITE EVIDENCE NOW DECIDES WHETHER A PROSPECT DESERVES A PERSONALIZED VIDEO, VIDEO-WORTHY PROSPECTS CAN BE OFFERED THE VIDEO AND RECEIVE IT IN A LATER ALLOWED TOUCH IF THEY DO NOT REPLY, NON-VIDEO PROSPECTS STAY ON THE NORMAL SHORT SEQUENCE, AND NO VIDEO CREATES EXTRA COLD TOUCHES BEYOND THE P1/P2/P3 LIMITS.
