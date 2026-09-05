# LTB — the other four skills, and the cap the due list forgot

**Date:** 2026-08-21
**Commit:** `e161786` on `main`, deployed 20:20 UTC
**Outbound delta:** **ZERO.** Nothing sent, nothing approved, no switch flipped.

---

## What was asked

Whether `daily-followup-sweep`, `daily-reply-sync`, `prospect-pdf` and
`website-audit` needed updating after the auto-prospect V2 work.

All four did. Chasing one of them down also surfaced a live app defect.

---

## The defect: two "due" answers, and only one asked about the cap

`lib/due.mjs` and `lib/today.mjs` each answer "is this prospect due for an
email", and they disagreed.

```js
// lib/due.mjs — asks the band
export function isDueProspect(p) {
  if (coldSequenceExhausted(p)) return false;     // ← the V2 ceiling
  const d = daysUntilDue(p);
  return d != null && d <= 0;
}

// lib/today.mjs — did not
export function isAutoDue(p, dueFn) {
  if (videoOwed(p)) return true;
  if (!AUTO_DUE_STAGES.has(p.stage || 'New')) return false;
  const d = dueFn(p);                              // ← date only
  return d != null && d <= 0;
}
```

`isAutoDue` backs three things: the **"Due today (auto)"** view, the **stat tile**
above it, and **`window.bloom.getDueAuto()`**, which the sweep skill documents as
its fallback worklist when `p.due` is absent.

Measured against production, all 346 rows at an Email stage or owed a video:

| | Rows offered as sendable |
|---|---|
| `isAutoDue` (the view, the tile, the sweep's fallback) | **340** |
| `isDueProspect` (`p.due`) | **115** |
| Difference | **225** |
| ...of which the band was already spent | **223** |

By stage: 127 at Email 4, 89 at Email 3, 4 at Email 2, 1 at Email 1, 2 invalid.

Worked examples, straight from the rows:

```
#996  stage=Email 4  rating=💙 (P2, ceiling 2)  emails_sent=5   → offered
#999  stage=Email 2  rating=✖️ (P3, ceiling 1)  emails_sent=2   → offered
#1016 stage=Email 3  rating=💙 (P2, ceiling 2)  emails_sent=4   → offered
```

A 💙 prospect is allowed two cold emails. #996 has had five, and the app was
still counting them as owed a sixth.

The comment directly above `isDueProspect` states the invariant the other
function was breaking:

> The app owns how long a sequence runs, and nothing surfaces a row as needing
> an email it is not allowed to receive.

### The fix

`isAutoDue` now asks the same question, with the owed-video bypass kept
deliberately: a recording that already exists was promised on a touch that
already happened, so delivering it is not a new cold email.

`coldSequenceExhausted` moved from `due.mjs` to `sequence-ceiling.mjs`, which is
where ceiling questions live, so `today.mjs` could ask it without taking on the
date logic it deliberately does not have. `due.mjs` re-exports it; all six
existing importers are untouched.

**After, on the same production rows:**

```
isAutoDue:      133   (was 340)
isDueProspect:  115
gap:             18   — all owed videos, which is the intended bypass
```

Two tests added in `tests/today.test.mjs`: a spent band is never auto-due however
overdue the date looks, and an owed video still goes after the band is spent.

---

## The four skills

Every one of them carried the same shared "Strategy V2" preamble, pasted in and
updated. None of their bodies had followed.

### `website-audit` — the dangerous one

auto-prospect's subagent prompt says *read website-audit for the email structure
and voice*. So whatever this file says, the new skill inherits. It still said:

| Still in the file | Conflict |
|---|---|
| `write the entire sequence (Emails 1-5 + Email 5 PDF)` | no Email 4 or 5 exists |
| `**Email 4 — Open door**`, `**Email 5 — Linked one-page note**` | full shapes for emails that cannot be sent |
| Email 1 closing `"Is that already handled behind the scenes...?"` | the open question V2 retired: 0.4% vs 4.0% |
| Email 2 closing `"Is this something that's been on your list at all?"` | same |
| Email 3 offering a generic System Snapshot link | not a concrete micro-offer |
| `VIDTEST 50/50 ... Email 3 only` | the A/B is over |
| `The video ... replaces the System Snapshot in Email 3 and rides the open door in Email 4` | wrong placement under the new policy |
| `Email 1: Day 0 ... Email 5: Day 21` | wrong cadence |

Now: the band table (P1 3 / P2 2 / P3 1 with days), micro-offer closes with the
retired open questions called out by name, the evidence-triggered video
placement with the showable-finding keys and visual playbooks listed verbatim,
and a P1-only third email shape. The PDF is gone from the cold path entirely.

### `daily-followup-sweep`

Its own preamble had already retired VIDTEST, the Email 5 PDF and the
past-Email-5 video. Its body still did all three:

- Step 3 collected stage `Email 4` and separately collected stage `Email 5`
- Step 4b ran the full VIDTEST A/B, assigning arms and **withholding videos from
  group B**
- Step 4b had an `Email 5 (N === 5)` branch appending the review PDF link
- Step 5 was titled "One-off video emails (past Email 5)"
- The final-report checklist still demanded the Email 5 PDF link

All removed. The stage filter is now Email 1 through Email 3, video wording
follows the same rule the app uses (URL exists, not yet sent, step carries the
copy), and the owed-video path keys off the video rather than off a stage.

**Every edit narrows what this skill will send. None widens it.**

### `prospect-pdf`

Said *"The trigger changed. It is no longer 'the prospect reached Email 5'"* and
then called itself the Email 5 attachment six more times, including in its
frontmatter description. Now consistently a fulfilment artifact.

### `daily-reply-sync`

Already correctly demoted (*"It decides nothing in the live path"*, *"must not
rebuild Gmail"*). One real leftover: a `VIDTEST:B` carve-out that withheld videos
from warm replies for a test that is over.

---

## The test that would have caught all of this

A `.skill` is a zip. In a pull request the diff reads:

```
skills/auto-prospect.skill | Bin 14008 -> 14608 bytes
```

A reviewer sees nothing. That is why five files drifted from what the app does,
some for weeks, while their preambles claimed otherwise.

All five now keep a readable `.SKILL.md` beside the archive, and
`tests/auto-prospect-v2.test.mjs` asserts each zip matches its source, plus two
cross-cutting checks: no skill instructs anyone to write Email 4 or 5, and no
skill still bans video outright.

**Full suite: 2540 passing, 0 failing.**

---

## Open, and yours to decide

**Two sending paths for one job.** `daily-followup-sweep` browser-sends from
Gmail, which bypasses `send_events`, the send window and the approval fingerprint
at send time. The app now has a guarded native path for the same work.

Collapsing to one path is clearly right eventually. It is not right today:
`autoSendApprovedFollowups` is `false`, so retiring the sweep now means no
follow-ups go at all. That trade is yours, not mine, and I have not touched the
sweep's send authority in either direction.

**Re-install all five skills** from `F:\bloomtrack-pro\skills\*.skill`. The Cowork
copies are separate and still the old ones.

---

## Not done, on purpose

- No send, no approval, no armed permission, no switch flipped.
- No package created, modified or deleted.
- The sweep's autonomous send authority is exactly as it was.
- No prospect data changed. This deploy is pure logic.
