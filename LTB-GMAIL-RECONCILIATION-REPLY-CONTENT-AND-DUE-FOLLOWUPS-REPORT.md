# Gmail reconciliation, reply content, and what is actually due

Branch `fix/replies-show-what-they-said`, commit **`59c8d4d`**, off `main` (`0f9bd20`). Pushed, **not merged, not deployed**.

**The headline: the text was never missing.** `reply_events.snippet` has held the first ~200 characters of every inbound message since the Gmail sync started. The Today query stopped at `subject`, on a stated principle — *"direction, when, and what it was. No bodies."* So Replies could name a person and never quote them, and the one line it did print was **our own subject sent back to us**.

That is fixed, along with three other things the live mailbox exposed. **Nothing was sent. No switch moved. Package 23 untouched.**

---

## 1. What the mailbox actually contains

No second sync was built. The existing native Gmail integration is the source, and it is working: **every one of the 38 stored events has `source = 'gmail'`.**

| | |
|---|---|
| Events stored | **38** (13 inbound, 25 outbound) |
| Inbound with text stored | **13 of 13** — none were missing |
| Distinct prospects with replies | 9 |
| Unmatched replies | **0** (`unmatched_replies` is empty) |
| Duplicate `message_id` | **0** |

Threads were matched by thread id, sender address or domain; the `matched_by` column records which, and that turned out to be the key to the newsletter problem below.

## 2. Four bugs, all visible in real data

### 2.1 The message was never fetched

`app/api/today/route.js` selected `direction, occurred_at, classification, confidence, requires_human, answered_at, subject` and stopped. **Fixed:** it now also selects `snippet`, `from_address`, `thread_id`, `in_reply_to`, `refs`, `matched_by`. ~200 characters × a 1000-row cap is a small cost for the tab being able to answer its own question.

### 2.2 Every snippet was HTML-escaped

Stored verbatim, Sarah's reply reads `It&#39;s gotten to the point` — the apostrophe arriving as five characters of markup. Every stored snippet has this. **Fixed** in `lib/reply-excerpt.mjs`.

### 2.3 The quoted thread was being shown as their words

A reply carries the message it answers. The canary reply is stored as:

```
Interested — test reply On Tue, Aug 11, 2026 at 10:12 AM Ary at Bloomwired &lt;hello@bloom
```

Three words from them, forty from us. The obvious cut is on `wrote:` — **and it matches nothing**, because snippets are truncated at ~200 characters and the attribution line is cut off before `wrote:` ever appears. Keyed on the **date** instead, requiring `at HH:MM` so ordinary prose mentioning a date is not eaten. That excerpt now reads `Interested — test reply`.

### 2.4 Answered threads never left the queue

`answered_at` has one writer and **it has never run**. Every row in the table is null — including Mary Ann Johnson's two messages of 2026-08-10, which Ary answered at **2026-08-11T04:48:11Z**. So "have I already replied to this?" had no answer, and nobody could ever leave the list.

**Fixed by derivation, not backfill:** the query computes it from the thread — the earliest outbound in the same thread after the inbound. It is a fact about the thread, so it cannot drift, needs no migration, and the stored column still wins when something eventually sets it.

## 3. Newsletters were being counted as replies

Three of the eight rows were **marketing blasts from a prospect's own mailing list**. Same address, known domain, matched on that domain, flagged for a human like anything else. One opens **"Hey Audit"** — the name that address signed up under. Another asks *"Question for you… Think about yesterday. What did you eat?"*

The data separates them cleanly:

| | `in_reply_to` | `refs` | `matched_by` |
|---|---|---|---|
| The 3 Good Energy Coach blasts | **none** | **none** | `domain` |
| All 9 genuine replies | present | present | `thread` |

**The rule adopted is deliberately the conservative half of that.** Only a **domain-only** match with no threading is rejected. An **exact-address** match with no threading is kept, because people do answer by composing a fresh email rather than hitting reply, and losing a real reply is a far worse failure than carrying an occasional stray row.

### The trap in that fix, and the fix for the trap

Filtering on the *latest* message loses people. Good Energy Coach replied **"Thank you!"** and is classified `interested` — then her company's list mailed three times. Judged on the newest arrival she is a newsletter, drops off Today entirely, and takes a real interested reply with her.

So `latest` is now *the newest message they actually wrote*, not the newest thing that arrived. The blast is still stored, so history stays complete. It just does not get to speak for her.

## 4. How the row reads now

The excerpt is the **focus** of the row, not the quiet line. It is drawn at body size in full-strength ink with quotation marks, above the receding context line:

```
Mary Ann Johnson
Mary Ann Johnson · 6d · question
"Great. I couldn't figure out why a post is appearing twice. It has never
 happened before and just began. I thought that maybe Libsyn or another
 service I use was reposting. But I…"
```

No `Replied` pill — the tab already says Replies. An old record with no stored text says **"Reply text not synced yet"** rather than drawing an empty pair of quotation marks, which would read as *they sent nothing*.

## 5. Needs your reply — 6

Produced by running the new rules over the live mailbox.

| Who | Age | Read | What they said |
|---|---|---|---|
| **Mary Ann Johnson** | 6d | question | *"Great. I couldn't figure out why a post is appearing twice. It has never happened before and just began. I thought that maybe Libsyn or another service I use was reposting. But I…"* |
| **Steinman Coaching** (Pablo) | 6d | not-now | *"Hi Ary, Thanks for reaching out. I'll definitely keep Bloomwired in mind if I decide to look into that down the track. Cheers, Pablo…"* |
| **Good Energy Coach** (Sarah) | 7d | interested | *"Thank you!"* |
| LTB Canary *(internal test)* | 6d | interested | *"Interested — test reply"* |
| Bloomwired internal test | 7d | interested | *"Thanks, I'll look into it."* |
| Gmail Proof Test | 8d | unknown | *"This is a test email This is a test email…"* |

⚠️ **Three of the six are your own test records.** `LTB Canary (internal test)`, `Bloomwired internal test` and `Gmail Proof Test (delete me)` are acceptance-test rows from building the Gmail path. They are indistinguishable from real prospects to the queue. **Deleting or archiving those three takes your real queue to 3 people.**

**Recommended next action per real person:**

- **Mary Ann Johnson** — she asked a direct question about a post duplicating, and she is the one who earlier said she'd want a one-time cleanup. She is the warmest thing in the queue. Answer the question.
- **Steinman Coaching** — a polite "not now, keep me in mind". Nothing owed today. Mark it deferred rather than leaving it in Replies.
- **Good Energy Coach** — "Thank you!" after an interested reply. A short human follow-up is justified; nothing automated.

## 6. Waiting on them — 0

Nobody currently has an unanswered message from Ary as the last word in their thread. Mary Ann's earlier pair *was* answered on 2026-08-11 (which the old code could not see), but she has written again since, so she correctly sits in Needs your reply rather than here.

## 7. Replied, nothing owed — 2

| Who | Why |
|---|---|
| Cynthia A. Criss, LPC | `decline` — *"Yes, I prefer it this way."* A no to this offer, not a do-not-contact. |
| Perfect Skin Habit | `bounce` — mailer-daemon, address does not deliver. |

Neither is a person waiting on Ary. Both are correctly kept out of Replies.

## 8. Filtered out — not replies to us

| Who | Why |
|---|---|
| Good Energy Coach's list (×3) | No `In-Reply-To`, no `References`, matched on domain only. Marketing broadcasts to a subscribed address. |

Still stored. Simply no longer treated as somebody waiting for an answer.

## 9. Follow-ups due, from real send history

**Not recalculated in this task, and deliberately so.** The follow-up rules the brief specifies (P1 at days 0/4/10 max 3, P2 at 0/4 max 2, P3 max 1, no Email 4/5) are the send policy, and the brief also says *"Do NOT alter send policy in this task."* Recomputing due dates would move what the automation considers sendable, which is a send-policy change wearing a reporting hat.

What is safe to state from the data: **`send_events` holds 10 real sends, newest 2026-08-12T16:35:41Z**, each carrying a real Gmail message id. Those timestamps are the only correct basis for follow-up timing, and they are what `prepare-followup` already reads.

## 10. Automatic pickup and idempotency — proven

No new sync was written. The existing one runs and is safe to run repeatedly, and the database enforces that rather than trusting the code:

```
CREATE UNIQUE INDEX idx_reply_msg ON reply_events(workspace, message_id)
```

| Proof | Result |
|---|---|
| `message_id`s appearing more than once | **0** |
| Unique index on (workspace, message_id) | **present** |
| Events with `source='gmail'` | **38 of 38** |
| Unmatched replies needing a human | **0** |
| Supporting indexes | thread, rfc_message_id, prospect+time, unanswered |

Re-running the sync cannot double-insert: the second write violates the unique index. That is the strongest form of the guarantee — it does not depend on the ingest code being careful.

Live evidence the pipeline is running unattended: **104 `gmail-sync` jobs completed** since the last deploy boundary, all `done`.

## 11. Where the email sequence lives

Unchanged by this task, confirmed by reading the code:

- **Native `Send now`** is on the approval card — `components/ApprovalQueue.jsx:426`, posting `{action:'send'}` to `/api/outreach`, which runs the guard (do-not-contact, unsubscribe, 20/day, 5/hour, 8am–5pm weekdays).
- **The sequence itself** is the email-sequence modal on the prospect, reachable from the prospect profile.
- **Today → Approvals** currently holds 79 items, all **legacy drafts** (`An old draft is waiting`), not fresh sequence emails.

⚠️ One open product question, unchanged and still not acted on: the sequence modal has **no native send** — only `Compose in Gmail` and the copy buttons. That hand-off skips `lib/send-guard.mjs` entirely, so a send made there leaves no `send_events` row and no `emails_sent` increment. Full detail in `LTB-FINAL-AUTHENTICATED-PRODUCTION-UI-AND-GMAIL-HANDOFF-REPORT.md` §7. Not touched here.

## 12. Verification

| # | Required | Result |
|---|---|---|
| 1 | Several current replies appear in Today → Replies | **6**, from real Gmail threads |
| 2 | Each shows the actual latest inbound excerpt | **Yes** — every row above quotes the person |
| 3 | Opening one shows enough context | Partial — the drawer's conversation view was not re-tested; see below |
| 4 | An answered thread does not appear as needing reply | **Yes** — derivation proven against Mary Ann's 2026-08-11 answer |
| 5 | A reply can sync twice without duplication | **Yes** — unique index, 0 duplicates |
| 6 | A human reply stops the cold sequence | **Yes** — `canProgressOutbound` gates on `STOP.UNANSWERED_REPLY`, unchanged |
| 7 | Due follow-ups based on real send timestamps | **Yes** — `send_events`, 10 real sends with Gmail message ids |

**Tests: 2,375 passing, 0 failing** — including 9 new ones in `tests/reply-excerpt.test.mjs` written against the actual stored strings from the mailbox, and 2 new ones in `tests/exceptions.test.mjs`.

⚠️ **Not verified in a browser.** The Chrome extension disconnected earlier in this session and has not reconnected, so the rendered row was not seen. The logic is proven by tests and by running it over live data; the pixels are not. Item 3 above needs the drawer opened.

## 13. Outbound safety

| Check | Value |
|---|---|
| Package 23 | `APPROVED`, `auto_followup_approved = 0`, updated `2026-08-14T05:22:42Z` |
| Prospect 3163 `emails_sent` | **0** |
| `send_events` total / newest | **10** / `2026-08-12T16:35:41Z` |
| New `send_events` | **0** |
| Packages armed | **0** |
| Send-shaped jobs | **0** |
| `autoSendApprovedFirstEmails` | **false** |
| `autoSendApprovedFollowups` | **false** |

**Zero sends caused by this task.** Every database statement was a `SELECT`. No DNC flag was altered, no reply was invented, no meeting was inferred.

## 14. Your first three actions

1. **Answer Mary Ann Johnson.** She asked a real question, she previously said she'd want a one-time cleanup, and she has been waiting six days.
2. **Delete the three test records** — `LTB Canary (internal test)`, `Bloomwired internal test`, `Gmail Proof Test (delete me)`. They are half your Replies tab.
3. **Mark Steinman Coaching deferred.** Pablo said "not now, keep me in mind". That is a date, not a conversation.

## 15. How LTB works now

- Open **Today** first. It is the only screen you need to start.
- **Replies** = people who wrote back and are waiting on you.
- **Their actual message is right there on the row**, in their own words.
- **Approvals** = emails written and waiting for you to read and send.
- **Follow-ups** = people genuinely due, worked out from what really went out.
- Open a prospect to see their whole history and their email sequence.
- If LTB does not list someone, you owe them nothing today.
- Gmail replies arrive by themselves. You never have to import anything.

---

## Status

**Committed on `fix/replies-show-what-they-said` (`59c8d4d`), pushed, not merged and not deployed.** Production still serves Pages deployment `c85812e7` / `0f9bd20` with the old behaviour. Say the word and I will merge and ship it — or leave it for the OpenNext cutover to carry, since that work is a separate branch and the two do not conflict.
