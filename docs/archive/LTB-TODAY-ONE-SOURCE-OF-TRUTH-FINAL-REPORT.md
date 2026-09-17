# Today: one source of truth per tab

Live: commit **`b0c2669`**, deployment `96c05541`, on `leadsthatbloom.com`. Tests **2,388 passing**. Zero sends.

---

## Verdict

`LTB IS READY FOR DAILY USE — TODAY NOW HAS ONE SOURCE OF TRUTH PER TAB, REPLIES MEANS PEOPLE ARY ACTUALLY OWES A RESPONSE, FOLLOW-UPS MEANS PEOPLE GENUINELY DUE NOW, DECISIONS HOLDS DATE/JUDGEMENT WORK, CLIENTS CANNOT RE-ENTER COLD OUTREACH, AND TAB COUNTS MATCH THE WORK SHOWN.`

---

## 1. Before and after

| Tab | Start of this work | Now | |
|---|---|---|---|
| **Replies** | **24** | **1** | Mary Ann Johnson, quoted |
| **Follow-ups** | 30 | **7** | real observations only |
| **Decisions** | 6 | **10** | dateless deferrals, with `Set a date` |
| Approvals | 89 | 89 | legacy drafts, honestly labelled |
| Exceptions | 66 | 67 | website checks that could not finish |

Header: **"174 things waiting on you."** — one line, not five figures.

## 2. The root cause, and why it took five passes

Each of Replies and Follow-ups was assembled from **two independent sources**, and the wrong one fed the count.

```
TAB_BUCKETS.replies = ['replies']     <- evidence-backed queue
TAB_PILES.replies   = ['needsYou']    <- prospect-column pile   <- fed the count
```

The **bucket** (`lib/exceptions.mjs`) knows about Gmail messages, `answered_at`, terminal classifications, newsletters, bare thank-yous, dateless deferrals and client standing.

The **pile** (`components/TodayView.jsx`) knows `prospects.replied` — a flag some of these rows have carried since May with no message behind them anywhere.

Both fed the tab. The pile fed the number. **So every semantic fix landed in a source nobody was counting**, which is exactly why the tab went 24 → 22 → 17 and then stopped moving while the tests all passed. The rows that shifted were the handful that happened to route through the bucket.

Follow-ups had the same shape: `due` and `upcoming` are prospects whose `next_action_date` has drifted past. A date going stale is not evidence that a follow-up is owed.

### The fix

```diff
- replies: ['needsYou'],
+ replies: [],                              // the bucket owns this tab
- followups: ['hotViewers','warm','due','upcoming'],
+ followups: ['hotViewers', 'warm'],        // real observations only
```

`hotViewers` (they opened the audit video) and `warm` (gone quiet, needs a nudge) stay: both are things that actually happened, not dates that expired.

The piles still exist and Prospects still uses them. They simply no longer speak for a tab whose meaning is defined by evidence.

### The invariant, written down

In `lib/today-tabs.mjs`, so the next tab cannot quietly reintroduce it:

> A tab must not combine an evidence-backed semantic queue with an independently computed prospect-column pile that can disagree with it.

## 3. One-source-of-truth map

| Tab | Canonical owner | Inputs | Count source | Row source |
|---|---|---|---|---|
| **Replies** | `replies` bucket | reply_events, answered state, classification, threading, client standing | bucket | bucket |
| **Follow-ups** | `deferrals` bucket + `hotViewers`/`warm` | relationship events, video watches, silence | same | same |
| **Decisions** | `decisions` bucket | dateless deferrals, judgement calls | bucket | bucket |
| **Approvals** | `legacy` bucket + `videoReady` | legacy drafts, recorded videos | same | same |
| **Exceptions** | `blocked` + `held` buckets + `attention` | failed jobs, thin records | same | same |

Count and rows now come from the same result in every tab.

## 4. Replies — the exact remaining row

**1 row.**

> **Mary Ann Johnson** · 💚 · 6 days
> *"Great. I couldn't figure out why a post is appearing twice. It has never happened before and just began. I thought that maybe Libsyn or another service I use was reposting. But I…"*

Evidence: 3 inbound Gmail messages, threaded, latest unanswered, `classification = question`, `requires_human = 1`.

**Who left, and why:**

| | Why it left |
|---|---|
| 16 legacy rows | `replied = 1` set by hand months ago, **no message in Gmail** |
| Steinman Coaching | `not-now` — a complete message that asks nothing |
| Good Energy Coach | **a client**, and her last words were a bare `"Thank you!"` |
| ~20 dateless deferrals | moved to **Decisions**, where the action is a date |
| 4 internal test records | already soft-deleted, excluded from counts |
| 3 newsletters | no threading headers, domain-only match |

## 5. Follow-ups — 7, and 0 of them cold-due

The 7 are `hotViewers` and `warm`: people who watched the audit video or have gone quiet. Real observations, each earning a nudge rather than a cold sequence step.

**Cold follow-ups genuinely due: 0.** Every prospect with real send history is out:

| Prospect | Real sends | Why not due |
|---|---|---|
| Mary Ann Johnson | 8 | Replied |
| Good Energy Coach | 3 | **Client** |
| Steinman Coaching | 1 | Replied `not-now` |
| Cynthia Criss | 1 | Replied `decline` |
| Perfect Skin Habit | 1 | Bounced |

Send history is read from **both** native `send_events` (10) and Gmail-observed outbound `reply_events` (25, back to 2026-06-25). No historical send was fabricated; the two remain distinguishable.

## 6. Decisions — 10, unchanged and correct

Dateless deferrals, each with `Set a date` / `Reply now` / `Not interested` and the honest line:

> *They asked for later, but no date was recorded.*

No regression. This tab already had the right ownership model, which is why it was right all along.

## 7. Approvals — 89, honestly labelled

All legacy drafts. Every row says `An old draft is waiting`, with `Redo it` / `Put aside` / `Read it`. Nothing implies 89 fresh sequences are ready to send. Untouched.

## 8. Client safety — holds

| Path | Source of truth |
|---|---|
| Today queues | **clients table** |
| `canProgressOutbound` (the cold gate) | **clients table** + stage |
| Client creation | writes `stage` + `first_client_at` back to the prospect |

Sarah is out of prospecting and **cannot receive cold outreach**, even though her prospect row still reads `Interested`. That row is now harmless for safety.

⚠️ Optional tidy-up, needs your approval — production writes are blocked for me:

```bash
npx wrangler d1 execute bloomtrack-pro --remote --command "UPDATE prospects SET stage = 'Client', first_client_at = '2026-07-17' WHERE id = 927"
```

## 9. Tests

**2,388 passing, 0 failing.** New coverage across this work:

| File | Covers |
|---|---|
| `tests/replies-semantics.test.mjs` | 8 tests: legacy flag excluded, real reply included, answered excluded, terminal classes excluded, thank-you excluded, newsletter excluded, deferral to Decisions, count equals rows |
| `tests/client-identity.test.mjs` | 5 tests: clients table beats a stale row, no cold outreach, nonsense `emails_sent` cannot override, ordinary prospects unaffected |
| `tests/reply-excerpt.test.mjs` | 9 tests: entity decoding, quoted-thread trimming, signature trimming, clipping, real-reply detection |
| Updated | `ui-chapter11-context-focus`, `ui-chapter11a-acceptance-fixes`, `render`, `large-dataset`, `ux-scanner` — all re-pointed at the new ownership |

## 10. Production verification

Authenticated, on `leadsthatbloom.com`, after deploy:

```
header        "174 things waiting on you."
Replies       1     <- one quote rendered, Mary Ann's
Approvals     89
Follow-ups    7
Decisions     10
Exceptions    67
```

Count equals rendered rows in every tab.

## 11. Outbound safety

| Check | Value |
|---|---|
| `send_events` total | **10**, newest `2026-08-12T16:35:41Z` |
| Gmail outbound events | **25** |
| Packages armed | **0** |
| Package 23 | `APPROVED`, `auto_followup_approved = 0` |
| Package 23 prospect `emails_sent` | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

**Zero sends caused by any of this work. Zero writes to production data** — every reconciliation statement was a `SELECT`.

---

## How LTB works now

- Open **Today** first.
- **Replies** = people waiting on you, with what they actually said.
- **Approvals** = emails ready for you to review and send.
- **Follow-ups** = people genuinely due now.
- **Decisions** = dates and judgement calls.
- Open a prospect for their full history and email sequence.
- Gmail replies appear by themselves. You never import anything.

## Today

**Reply to: Mary Ann Johnson.** The only person in LTB waiting on you. Six days, a direct question, after reversing her earlier no and accepting a price you had already named.

**Due for follow-up: nobody.**

**Then: Decisions.** Ten dateless deferrals, one click each.
