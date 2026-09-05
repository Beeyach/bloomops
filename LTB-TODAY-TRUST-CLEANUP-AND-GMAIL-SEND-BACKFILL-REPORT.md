# Today trust cleanup, and the Gmail send backfill

**Live.** Commit **`fbef4c5`**, deployment **`7b243bb4`**, on `leadsthatbloom.com`. Tests 2,375 passing. Zero sends.

**The backfill turned out to be unnecessary — the data was already there.** All 25 historical Gmail sends, back to 2026-06-25, are already stored and already distinguishable from native sends. Nothing had to be fabricated. Section 3.

The Replies cleanup is **partly done and honestly partial**: 24 → 22, and the two people who should not have read as "waiting on you" no longer do. What remains is not junk, which is the finding that matters. Section 2.

---

## 1. Replies, before and after

| | Before | After |
|---|---|---|
| Rows in Replies | **24** | **22** |
| Steinman reads as | "waiting for your reply" | **a dateless deferral with a `Set a date` button** |
| Good Energy Coach | — | quotes `"Thank you!"` |
| Mary Ann | top of queue | **still top of queue** ✅ |

Two changes shipped:

**A reply that asks nothing is not work.** `decline`, `not-now`, `unsubscribe`, `out-of-office`, `bounce` and `wrong-person` are complete messages: they say where we stand and ask for nothing. Pablo's *"I'll definitely keep Bloomwired in mind if I decide to look into that down the track"* had him waiting six days for an answer he never asked for.

**A flag with no message is history.** Rows carrying `replied = 1` from before the Gmail sync, with no message anywhere, no longer count as somebody waiting.

## 2. What is still in Replies, and why it is not junk ⚠️

The count only fell by 2, and the honest reason is worth more than a bigger number would have been.

The remaining `Reply text not synced yet` rows — Nobody's Perfect Parenting, Ask Annalisa, Heidi Healy and others — are **dateless deferrals**. They are not stale reply flags. Each one is a person who asked for "later" with no date recorded, and each row carries a **`Set a date` / `Reply now` / `Not interested`** resolver.

That is real work, and it is one click. Removing them would delete a genuine queue.

**But the line above them is now wrong.** Those rows say *"Reply text not synced yet"* when the actual fact is *"they asked for later, and no date was recorded"* — which the row already says underneath. The excerpt line has nothing to do with what that row needs. **That is a small, real UI wart introduced by this pass**, and the right fix is for a dateless-deferral row not to print a reply-text line at all. Not changed here: the brief said no more UI work in this task, and I would rather flag it than smuggle it in.

## 3. The Gmail send backfill was already done ⚠️

The brief expected `send_events` (10 native sends, from 2026-08-06) to be missing older history. It is — but that history is **not** missing from LTB.

```
outbound reply_events   25 messages, 9 prospects, 2026-06-25 -> 2026-08-13
send_events             10 messages,             2026-08-06 -> 2026-08-12
overlap                  5 (the same message seen both ways)
```

Every historical Gmail send is already stored in `reply_events` with `direction='outbound'`, `source='gmail'`, its Gmail `message_id`, `thread_id`, recipient and exact timestamp. It is append-only and deduped by a unique index.

**So the requirement — "LTB must know that the email actually went out, and when" — is already met**, and the distinction the brief asked for is already preserved by construction:

| | Where it lives | What it means |
|---|---|---|
| Native LTB send | `send_events` | Passed the send guard: DNC, unsubscribe, caps, window |
| Historical/manual Gmail send | `reply_events`, `direction='outbound'` | Observed in the mailbox. Makes no claim about guards. |

**No records were created.** Writing a fabricated `send_events` row would have implied those June emails passed guards that did not exist yet, which is exactly what the brief warned against.

Per-prospect real send history:

| Prospect | Gmail sends | First → last | `emails_sent` says |
|---|---|---|---|
| Mary Ann Johnson | **8** | 2026-06-25 → 08-11 | **1** ⚠️ |
| Good Energy Coach | 3 | 2026-08-05 → 08-10 | **12** ⚠️ |
| Steinman Coaching | 1 | 2026-08-08 | **4** ⚠️ |
| Perfect Skin Habit | 1 | 2026-08-08 | 1 |
| Cynthia Criss | 1 | 2026-08-12 | 1 |

⚠️ **`emails_sent` disagrees with the mailbox in both directions** — Mary Ann shows 1 against 8 real sends, Sarah shows 12 against 3. It is a counter maintained by the app, not a count of what Gmail proves. It was **not** corrected here: rewriting it changes what the cold cadence considers spent, which is a send-policy change, and the brief forbids that. It belongs in a task that can approve the consequence.

## 4. Cold follow-ups due now — still 0

Recomputed against **all** real sends, native and Gmail-observed:

| Prospect | Real sends | Why no cold follow-up |
|---|---|---|
| Mary Ann Johnson | 8 | **Replied.** Cold sequence over. |
| Good Energy Coach | 3 | **Replied.** Also 12 on the counter — never cold again. |
| Steinman Coaching | 1 | **Replied** `not-now`. Explicit no. |
| Cynthia Criss | 1 | **Replied** `decline`. Closed. |
| Perfect Skin Habit | 1 | **Bounced.** No working address. |
| Internal test rows ×4 | — | Excluded from operational counts |

**Every prospect with real send history has replied.** There is nothing for the P1 0/4/10, P2 0/4, P3 max-1 cadence to act on. Adding the older Gmail sends did not create work — it confirmed there is none.

## 5. Today, as it now stands

| Tab | Count | What it really is |
|---|---|---|
| **Replies** | 22 | **1 person genuinely owed an answer (Mary Ann)** + ~20 dateless deferrals needing a date + Sarah's closing thank-you |
| **Approvals** | 89 | Legacy drafts (`An old draft is waiting`), not fresh sequence emails |
| **Follow-ups** | 30 | Not re-derived here; cold-due from real sends is **0** |
| **Decisions** | 6 | |
| **Exceptions** | 67 | Mostly website checks that could not finish |

## 6. Mary Ann — still first, and still the whole point

Verified after the change: **she remains at the top of Replies**, with her real message.

*"Great. I couldn't figure out why a post is appearing twice…"* — 6 days unanswered.

She declined, reversed it three minutes later, accepted a price you had already named, raised site-safety worries, and asked a concrete question. The draft reply is in `LTB-REPLY-FIX-SHIPPED-AND-GMAIL-CATCHUP-REPORT.md` §2.

## 7. Sarah — decided from the whole thread, not one snippet

Her thread: 3 outbound from Ary, 4 inbound — of which **3 are her company's marketing newsletters** and one is `"Thank you!"` after Ary's message.

**Verdict: a closing acknowledgment. No question, no request, nothing owed.** She is `interested` and 💚, so she stays visible rather than being buried, but she is not a person waiting.

⚠️ **Never cold-touch her again** — `emails_sent = 12` is the highest in the workspace.

## 8. Waiting on them — 0 · Deferred — 3 · Finished — 747

```
Deferred:  Aspen Holistic Health   2026-08-19  (in 2 days)
           Olivia Massage Doreen   2026-10-01
           Hol Health              2026-11-01

Finished 569 · Rejected 86 · Lost 60 · Invalid Email 31 · Not This Offer 1
```

## 9. Manual review — 3

| Item | Why |
|---|---|
| **`emails_sent` vs Gmail truth** | Off for at least 3 prospects, both directions. Needs a task that can accept the cadence consequence. |
| **Perfect Skin Habit** | Address bounced. Dead without a new one. |
| **Test records 6567, 6568** | Still live. The archive write was **blocked by the permission guard** and I did not bypass it. |

```bash
npx wrangler d1 execute bloomtrack-pro --remote --command "UPDATE prospects SET deleted_at = datetime('now') WHERE id IN (6567, 6568)"
```

## 10. Safety

| Check | Before | After |
|---|---|---|
| `send_events` total | 10 | **10** |
| Historical send records created | — | **0, by design** |
| Packages armed | 0 | **0** |
| Package 23 | `APPROVED`, unsent, unarmed | **unchanged** |
| Package 23 prospect `emails_sent` | 0 | **0** |
| `autoSendApprovedFirstEmails` | false | **false** |
| `autoSendApprovedFollowups` | false | **false** |

**Zero sends. Zero writes to production data.** Every statement in the reconciliation was a `SELECT`. No historical Gmail send was converted into an approval or into send permission.

## 11. Your first three actions

1. **Answer Mary Ann Johnson.** Six days. She is the only person in LTB genuinely waiting on you.
2. **Click `Set a date` on the deferral rows** — Nobody's Perfect Parenting, Ask Annalisa, Steinman and the rest. One click each, and Replies empties to just real conversations.
3. **Delete test records 6567 and 6568.**

## 12. How LTB works

- Open **Today** first.
- **Replies** = people waiting on you, with what they actually said.
- **Approvals** = emails ready for you to review and send.
- **Follow-ups** = people genuinely due now.
- Open a prospect for their full history and email sequence.
- Gmail replies appear automatically — you never import anything.
