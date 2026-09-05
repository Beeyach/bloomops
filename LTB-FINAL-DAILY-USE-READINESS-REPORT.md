# Final daily-use readiness audit

Live: commit **`3873d22`**, deployment `10407f18`, on `leadsthatbloom.com`. Tests **2,380 passing**. Zero sends.

---

## Verdict

`LTB IS NOT READY FOR DAILY USE YET — A SPECIFIC QUEUE OR CLIENT-SAFETY MISMATCH STILL NEEDS TO BE FIXED BEFORE ARY SHOULD TRUST TODAY AS THE DAILY COMMAND CENTER.`

**One thing fails, and it is criterion 2: Replies says 17, and exactly 1 of them can be proven.**

Client safety (criterion 1) now passes, including a real hole found and closed during this audit. Details below.

---

## 1. Client safety — PASS, after closing a real hole ⚠️

The audit found that the previous fix did not go far enough.

`canProgressOutbound` in `lib/outbound.mjs` is **the one gate between a client and a cold email**, and it read:

```js
if (stage === 'Client') { ...stop... }
```

The denormalised field. The one that drifts. The one that was wrong for Sarah for a month.

**Sarah was protected only by accident.** The gate stopped on her unanswered reply, not on her being a client. Answer her, and cold outreach would have resumed against a paying client.

Fixed: the gate now accepts the fact from the clients table as well.

| Path | Source of truth | Status |
|---|---|---|
| Today → all queues | **clients table** (`clientIds`) | **Fixed** |
| Cold sequence gate (`canProgressOutbound`) | **clients table + stage** | **Fixed this audit** |
| Client creation | writes `stage` + `first_client_at` back | **Fixed** |
| `lib/relationship-store.mjs:49` | prospect row only | Reads through the same standing model; not a send gate |
| `lib/send-guard.mjs` | **no client check at all** | See below |

⚠️ **`send-guard.mjs` has no client check and never did.** It guards do-not-contact, unsubscribe, caps and the send window — not client status. It is not currently a hole, because nothing can reach it for a client now that the cold gate stops first. It is worth a belt-and-braces check some day; it is not what makes this NOT READY.

## 2. Sarah — safe, and her stale row is now harmless

| | |
|---|---|
| In clients table | since **2026-07-17** |
| Prospect row | still `stage = Interested`, `first_client_at = null` |
| In Today | **gone** — verified live |
| Can receive cold outreach | **No.** Both the queue and the cold gate read the clients table. |

**The stale row is now harmless for prospecting safety.** It should still be repaired so other screens read her correctly:

```bash
npx wrangler d1 execute bloomtrack-pro --remote --command "UPDATE prospects SET stage = 'Client', first_client_at = '2026-07-17' WHERE id = 927"
```

Production writes are blocked for me by the permission guard and I did not bypass it.

## 3. The 17 Replies — this is what fails ⚠️

Live check: **17 rows, exactly 1 quote.**

| Row | Gmail evidence | Verdict |
|---|---|---|
| **Mary Ann Johnson** | 3 inbound, unanswered, quoted | **NEEDS YOUR REPLY** ✅ |
| The other **16** | **0 Gmail inbound messages** | **STALE / LEGACY** |

Every one of the other sixteen — Kori Burkholder, Tranquil Hypnotherapy, Riddlock, Awaken Ananda, Heidi Healy, Internal Compass, Frank Daly, Doolan, Darien, Fascia & Biomechanics, Lawyer and the rest — carries `replied = 1` and `reply_type = interested` set by hand, months ago, **with no message anywhere in Gmail**.

They are not wrong records. They are history. But Replies claims *"people who wrote back and are waiting on you"*, and for sixteen of seventeen rows nothing can be produced to support that.

**So Ary still has to translate the tab, which is the exact thing this whole sequence of work was meant to end.**

The earlier pass removed the rows that *said* "Reply text not synced yet". These are the same class of record, minus the label — they were `interested` rather than dateless deferrals, so they took the other branch.

**The fix is narrow and one change:** a legacy `replied = 1` flag with no Gmail message and no relationship event should not count as somebody waiting. It belongs in a small reconciliation list, not in Replies. I did not make it in this audit — it is a behaviour change to the main queue and this task was scoped to prove readiness, not to keep changing it.

## 4. Follow-ups — 29 rendered, 0 genuinely cold-due

Recomputed against **all** real sends, native and Gmail-observed:

| Prospect | Real sends | Why not due |
|---|---|---|
| Mary Ann Johnson | 8 | Replied |
| Good Energy Coach | 3 | **Client** |
| Steinman Coaching | 1 | Replied `not-now` |
| Cynthia Criss | 1 | Replied `decline` |
| Perfect Skin Habit | 1 | Bounced |

**Every prospect with real send history has replied, been declined, bounced, or is a client. Cold follow-ups genuinely due: 0.**

The 29 in the tab are due-*date* rows, not send-history rows — prospects with a `next_action_date` that has passed. That is a different claim from "due for a cold follow-up", and it is the same category of mismatch as the Replies problem.

## 5. Decisions — working as intended

**10 rows**, up from 6. The dateless deferrals landed here correctly, each with `Set a date` / `Reply now` / `Not interested`, and the honest line *"They asked for later, but no date was recorded."*

## 6. Approvals — 89, honestly labelled

All 89 are **legacy drafts**, and every row says so: `An old draft is waiting`, with `Redo it` / `Put aside` / `Read it`. Nothing implies 89 fresh sequences are ready to send. **No change needed.**

## 7. Safety — unchanged

| Check | Value |
|---|---|
| `send_events` total | **10**, newest 2026-08-12 |
| Gmail outbound events | 25 |
| Packages armed | **0** |
| Package 23 | `APPROVED`, `emails_sent = 0`, `auto_followup_approved = 0` |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

**Zero sends caused by any of this work. Zero writes to production data.**

---

## What stands between here and READY

**One change.** A `replied = 1` flag with no message and no relationship event must stop counting as somebody waiting. That takes Replies from 17 to 1 — and 1 is the true number.

Optionally alongside it: make Follow-ups mean "due from real send history" rather than "has a past due date", which is the same fix applied to a different tab.

Until then, the honest instruction is: **trust the row with a quote on it. Ignore the rest.**

---

## Meanwhile, today

**Reply to first: Mary Ann Johnson.** She is the only person in LTB who is provably waiting on you — six days on a direct question, after reversing her earlier no and accepting a price you had already named.

**Due for follow-up today: nobody.** Everyone with real send history has replied, declined, bounced, or is a client.

**Open first tomorrow: Today → Decisions.** Ten dateless deferrals, one click each. Clearing them is the fastest way to make the rest of the app tell the truth.
