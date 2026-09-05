# Reply fix shipped, and the Gmail catch-up

**Live in production.** Commit **`3ddb693`**, Pages deployment **`556a88a9`**, holding `leadsthatbloom.com`.

**Your real queue is 3 people.** Not 24, not 6. Everything else in that tab is either a pre-sync record with no message behind it, an internal test row, or somebody who is already closed.

**One of the three is a buying conversation with an unanswered question, six days old.**

Zero sends. Package 23 untouched. Both switches false.

---

## 1. What shipped

| | |
|---|---|
| Merged | `fix/replies-show-what-they-said` → `main`, then one follow-up fix |
| Production commit | **`3ddb693`** |
| Deployment | **`556a88a9-f851-4d27-a2f1-dcca88222e18`**, 2026-08-17 14:37Z |
| Scope | 7 files. **No** adapter, dependency, Worker, or config change. |
| Tests | **2,375 passing** |

Verified on the live authenticated site, not inferred:

| Check | Result |
|---|---|
| Mary Ann Johnson shows her real text | **Yes** — *"Great. I couldn't figure out why a post is appearing twice…"* |
| Steinman shows Pablo's real text | **Yes** — *"Hi Ary, Thanks for reaching out…"* |
| Good Energy Coach shows `"Thank you!"` | **Yes** — the real reply, not the newsletter |
| Quoted thread trimmed | **Yes** — canary reads *"Interested — test reply"* |
| HTML entity junk (`&#39;`) | **None** |
| `Replied` pill inside Replies | **None** |
| Pre-sync rows | say **"Reply text not synced yet"** |

## 2. Who needs your reply — 3 real people

### 1. Mary Ann Johnson — answer her today

*"Great. I couldn't figure out why a post is appearing twice. It has never happened before and just began. I thought that maybe Libsyn or another service I use was reposting. But I have used…"* — **6 days ago**

**Read the whole thread, because it changes what she is:**

```
Jun 25 – Jul 20   7 cold emails from you
Aug 10  21:22     "not the kind of upkeep I need most... I think I have found
                   a WordPress person"                              — a no
Aug 10  21:25     "I just sent a reply, but I have reconsidered. I DO think I
                   would like a one-time cleanup of this smaller stuff FOR THE
                   PRICE YOU MENTIONED. I have bigger issues with the safety
                   of the site…"                                    — a yes
Aug 11  04:48     you replied
Aug 11  22:58     "Great. I couldn't figure out why a post is appearing
                   twice…"                                     — a question
```

She said no, changed her mind **three minutes later**, agreed to a price you had already named, raised site-safety concerns, and has now asked you a specific technical question. **This is a sale in progress waiting on an answer**, and it has been waiting six days.

**Do:** answer the duplicate-post question, and confirm the one-time cleanup.

**DRAFT — not sent, yours to edit:**

> Hi Mary Ann,
>
> A post showing up twice is almost always the feed being published from two places at once — Libsyn pushing it and WordPress publishing its own copy. It's a quick thing to confirm and fix.
>
> Happy to include it in the one-time cleanup we talked about. You also mentioned the site's safety worrying you — I'd rather look at that properly than guess, so tell me what you've been seeing and I'll fold it into the same pass.
>
> Ary

### 2. Steinman Coaching (Pablo)

*"Hi Ary, Thanks for reaching out. I'll definitely keep Bloomwired in mind if I decide to look into that down the track. Cheers, Pablo"* — **6 days ago**

A polite not-now. He is already stage `Snoozed`, but **has no next-action date**, which is why he is sitting in Replies as though he were waiting on you. He is not.

**Do:** set a date (3 months is sensible) and he leaves the tab.

### 3. Good Energy Coach (Sarah)

*"Thank you!"* — **7 days ago**, rated 💚, stage `Interested`

The thinnest of the three. Worth one short human note; nothing automated.

⚠️ **She has `emails_sent = 12`**, the highest of anyone here. Whatever she is on, she should not receive another cold touch.

## 3. Waiting on them — 0

Nobody currently has your message as the last word. Mary Ann's Aug 10 pair *was* answered on Aug 11 (the old code could never see that), but she has written since, so she is correctly in Needs your reply.

## 4. Cold follow-ups due now — 0 for real prospects

Ten `send_events` exist, newest **2026-08-12**. Every one falls out:

| Prospect | Why no follow-up |
|---|---|
| Cynthia Criss (#4860) | **Replied** — a decline. Cold sequence over. |
| LTB Canary (#6567) ×2 | Internal test, already archived |
| LTB Threading Canary (#6568) ×2 | Internal test, already archived |
| Bloomwired internal test (#6547–6549) ×3 | Already archived |
| Bloomwired send trace (#6545) | Internal audit record |
| Bloomwired native send (#6546) | Internal audit record |

**No real prospect is currently due a cold follow-up from real send history.** The P1 0/4/10, P2 0/4, P3 max-1 cadence has nothing to act on, because the only genuinely-sent real prospect replied. Nothing was recalculated into the database and no send policy was touched.

## 5. Conversation follow-up eligible — 0

Nobody has gone silent after a reply. All three live conversations have **you** as the outstanding party, not them.

## 6. Deferred — 3

| Prospect | Returns |
|---|---|
| Aspen Holistic Health Associates | **2026-08-19** — in 2 days |
| Olivia Massage Doreen | 2026-10-01 |
| Hol Health | 2026-11-01 |

## 7. Sequence finished / closed — 747

```
Finished        569
Rejected         86
Lost             60
Invalid Email    31
Not This Offer    1
```

Correctly out of the way. Cynthia Criss's decline moved her to `Not This Offer` — a no to this offer, **not** a do-not-contact, exactly as intended.

## 8. Manual review — 2

| Prospect | Why |
|---|---|
| **Perfect Skin Habit** (#2040) | Address **bounced**. Stage is already `Invalid Email`. Needs a working address or it is dead. |
| **Good Energy Coach** (#927) | `emails_sent = 12`. Worth understanding before she gets anything else. |

## 9. Internal test records — excluded from every count above

The production mutation to archive these was **blocked by the permission guard**, and I did not bypass it.

| id | Record | State |
|---|---|---|
| 6567 | `LTB Canary (internal test)` | **Live** — appears in your Replies tab |
| 6568 | `LTB Threading Canary (internal test)` | **Live** |
| 6544 | `Gmail Proof Test` | already archived |
| 6547–6549 | `Bloomwired internal test` ×3 | already archived |
| 6545 | `Bloomwired (send trace)` | Live, stage `Finished` — harmless |
| 6546 | `Bloomwired (native send)` | Live, stage `Finished` — harmless |

**To clean up**, delete 6567 and 6568 from Prospects in the UI, or approve:

```bash
npx wrangler d1 execute bloomtrack-pro --remote --command "UPDATE prospects SET deleted_at = datetime('now') WHERE id IN (6567, 6568)"
```

## 10. Gmail pickup keeps working by itself

Verified on the live pipeline:

| Check | Result |
|---|---|
| `gmail-sync` jobs completed | **553**, newest **2026-08-17 14:40** — minutes ago |
| Duplicate `message_id`s | **0** |
| Unique index enforcing it | `idx_reply_msg (workspace, message_id)` |
| Unmatched replies needing a human | **0** |
| Events from the native sync | **38 of 38** |
| Second competing sync built | **None** — the existing one was fixed, not replaced |

New reply → matched to the thread → stored once → cold sequence stops → surfaces in Today → Replies → **and now its text is visible**. Re-running cannot double-insert; the database rejects it, so the guarantee does not depend on the code being careful.

## 11. Safety

| Check | Value |
|---|---|
| `send_events` total / newest | **10** / `2026-08-12T16:35:41Z` |
| New sends from this task | **0** |
| Packages armed | **0** |
| Package 23 | `APPROVED`, `auto_followup_approved = 0` |
| Package 23's prospect `emails_sent` | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

**Outbound delta: zero.** Every statement in the reconciliation was a `SELECT`. Nothing was sent, approved, armed, or marked do-not-contact. No reply was invented and no meeting was inferred.

## 12. Your first three actions

1. **Answer Mary Ann Johnson.** She agreed to the cleanup at your price and then asked a question. Six days. Draft is in section 2.
2. **Set a date on Steinman Coaching** — 3 months. He said "down the track"; that is a date, not a conversation.
3. **Delete the two test records** (6567, 6568) so your Replies tab is only real people.

Then Aspen Holistic Health comes back on **Aug 19**.

## 13. How LTB works

- Open **Today** first.
- **Replies** = people waiting on you, with what they actually said.
- **Approvals** = emails ready for you to review and send.
- **Follow-ups** = people genuinely due now.
- Open a prospect to see their full history and email sequence.
- Gmail replies appear automatically — you never import anything.
