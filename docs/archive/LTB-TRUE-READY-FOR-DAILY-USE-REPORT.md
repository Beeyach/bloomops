# True ready-for-daily-use report

Live: commit **`f1a6f59`**, deployment `66d9e99e`. Tests **2,388 passing**. Zero sends.

---

## Verdict

`LTB IS NOT READY FOR DAILY USE YET — A SPECIFIC TODAY-QUEUE SEMANTIC MISMATCH STILL NEEDS TO BE FIXED BEFORE ARY SHOULD TRUST THE APP AS THE DAILY COMMAND CENTER.`

**The Replies semantics are now correct in the engine. The tab still shows 17 because it is not reading the engine.** That is the whole remaining gap, and this pass located it precisely.

---

## 1. What was fixed, and it is real

Replies had **three separate routes in**, and the exclusions guarded only one:

| Route | Guarded before? |
|---|---|
| `flagged` — classifier asked for a human | yes |
| `dateOnly` — "they replied and nothing went back" | **no** |
| `ACTIVE_CONVERSATION` | **no — asked nothing at all** |

A decline, an answered reply, a newsletter and a bare thank-you all satisfy *"did they reply and has nothing gone back"* trivially, so they walked straight in through route 2. That is why the earlier terminal-classification fix appeared not to work.

**Now the question is asked once,** as `awaitingAnswer`: *is there a real message from them, to us, still open, that actually asks something?* All three routes consult it.

Proven by 8 new regression tests, all passing:

| Test | Result |
|---|---|
| `replied = 1` with no message does not enter Replies | **pass** |
| A real unanswered reply does enter, quoted | **pass** |
| An answered reply does not | **pass** |
| A dateless deferral goes to Decisions | **pass** |
| decline / not-now / bounce / unsubscribe / out-of-office / wrong-person do not | **pass** |
| A bare "Thank you!" does not | **pass** |
| A domain-matched newsletter does not | **pass** |
| The count equals the rendered rows | **pass** |

## 2. Why the tab still says 17 ⚠️

The Replies tab is fed from **two** sources, not one:

```
lib/today-tabs.mjs
  TAB_BUCKETS.replies = ['replies']    <- the exception queue (fixed)
  TAB_PILES.replies   = ['needsYou']   <- a second, separate pile
```

`needsYou` is computed in `components/TodayView.jsx` from **prospect columns** — `replied`, `reply_date` — not from `reasonsAndStanding`. It never consults `awaitingAnswer`, `reply_events`, `answered_at`, the terminal classes, or the newsletter rule.

```js
sections.needsYou.total        // TodayView.jsx:240 — the tab count
sections.needsYou.rows         // TodayView.jsx:181
```

So every semantic fix made in `lib/exceptions.mjs` — this one and the four before it — is bypassed for the count and for most of the rows.

**This also explains the earlier partial results**: 24 → 22 → 17 came from rows that happened to route through the exception queue. The `needsYou` pile was never touched.

### The fix

Point `needsYou` at the same evidence, or drop the pile and let the `replies` bucket own the tab, as `lib/today-tabs.mjs` already does for Decisions and Exceptions. **One source of truth per tab is the rule the rest of Today already follows.**

I stopped rather than doing it: it changes how a tab is assembled, this task was scoped to fix semantics rather than restructure Today, and the honest thing after five passes is to name the actual cause instead of shipping a sixth partial improvement.

## 3. Follow-ups — the same shape of problem

**29 rendered, 0 genuinely cold-due.**

Every prospect with real send history has replied, declined, bounced, or is a client:

| Prospect | Real sends | Why not due |
|---|---|---|
| Mary Ann Johnson | 8 | Replied |
| Good Energy Coach | 3 | **Client** |
| Steinman Coaching | 1 | Replied `not-now` |
| Cynthia Criss | 1 | Replied `decline` |
| Perfect Skin Habit | 1 | Bounced |

The 29 come from `TAB_PILES.followups = ['hotViewers','warm','due','upcoming']` — **prospect due-dates, not send history**. Same root cause as Replies: the tab is assembled from prospect columns rather than from the evidence. Not changed, for the same reason.

## 4. Decisions — correct

**10 rows.** Dateless deferrals live here with `Set a date` / `Reply now` / `Not interested` and the honest line *"They asked for later, but no date was recorded."* Unchanged and working.

## 5. Client safety — PASS

| Path | Source | Status |
|---|---|---|
| Today queues | clients table | **fixed** |
| `canProgressOutbound` (the cold gate) | clients table + stage | **fixed** |
| Client creation | writes stage + `first_client_at` back | **fixed** |

Sarah is out of prospecting and **cannot receive cold outreach**, even though her prospect row is still stale. That row is now harmless for safety; repairing it remains optional and needs your approval:

```bash
npx wrangler d1 execute bloomtrack-pro --remote --command "UPDATE prospects SET stage = 'Client', first_client_at = '2026-07-17' WHERE id = 927"
```

## 6. Approvals — 89, honest

All legacy drafts, every row labelled `An old draft is waiting`. Nothing implies fresh sequences. No change needed.

## 7. Safety — unchanged

| Check | Value |
|---|---|
| `send_events` | **10**, newest 2026-08-12 |
| Gmail outbound events | 25 |
| Packages armed | **0** |
| Package 23 | `APPROVED`, `emails_sent = 0`, `auto_followup_approved = 0` |
| Both send switches | **false** |

**Zero sends. Zero writes to production data.**

---

## What stands between here and READY

**One structural change: make each Today tab read one source.**

`Replies` and `Follow-ups` are each assembled from an exception-queue bucket *plus* a prospect-column pile, and only the bucket knows about Gmail evidence. Decisions and Exceptions already work the correct way, which is why they are right.

Until that lands, the working instruction is unchanged and reliable:

> **Trust the row with a quote on it. Ignore the rest.**

---

## Today

**Reply to first: Mary Ann Johnson.** Still the only person in LTB provably waiting — six days, a direct question, after reversing her earlier no and accepting a price you had already named.

**Due for follow-up: nobody.**

**Open first tomorrow: Decisions.** Ten dateless deferrals, one click each.
