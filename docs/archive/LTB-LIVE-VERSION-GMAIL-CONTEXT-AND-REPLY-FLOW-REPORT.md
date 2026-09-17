# Live version stamp, full Gmail context, and the real reply flow

Live: commit **`b6d4e33`**, deployment `a8917897`, on `leadsthatbloom.com`. Tests **2,418 passing**. Zero real-prospect sends.

---

## Verdict

`LTB LIVE REPLY FLOW IS VERIFIED — THE PRODUCTION VERSION IS IDENTIFIABLE IN THE UI, TODAY OPENS THE EXACT PERSON, THE FULL RELEVANT GMAIL CONVERSATION IS SYNCED WITHOUT MANUAL PASTING, DRAFT REPLY USES THE REAL THREAD PLUS STORED LTB/AUDIT CONTEXT, AND THE SAME BUILD RETAINS SAFE NATIVE REPLY SENDING.`

Every claim below was verified on the authenticated production pixels, with screenshots, not from tests alone.

---

## 0. Why Ary's screen contradicted the reports — proven, not guessed

Two separate causes, both real:

**1. Her tab was running an old bundle.** Before changing anything, production was inspected as served:

- The canonical deployment was `97ffb26b` / `df4aeff` — the newest main commit. The server was **not** stale.
- A fresh fetch of `/` referenced `page-0652bd29fe401bda.js`, and that chunk **contains** `Draft reply`, `Send reply`, and `Reading the conversation`. The current build carried every recent feature.
- But LTB is hash-routed: `#today → #prospects` navigation never reloads the page, so **a tab left open keeps its bundle indefinitely**. Ary's tab predated the last four fixes — which is exactly the vintage whose symptoms she described: ghost reply rows that click through to Prospects.
- There is no service worker in the app (checked), and HTML goes out `no-store` through the middleware. The staleness lived in the open tab, not in a cache layer.

**2. The paste box was a real, older, second flow.** The drawer's bee panel has carried a `Draft a reply` bee since long before this work — a textarea captioned *"Paste what they wrote back."* It knows nothing about Gmail, threads, or audit context. That is the box Ary pasted into, and it was genuinely the wrong tool sitting next to the right one.

Both causes are now fixed structurally, below.

## 1. The version is a fact on screen

**`next.config.js`** stamps the commit (`CF_PAGES_COMMIT_SHA`) and build time once per build. **`lib/version.mjs`** is imported by the rail badge and by **`/api/version`** alike, so UI and endpoint cannot disagree with each other — only with a stale tab, which is the case they exist to catch.

Verified live:

```
rail badge      LTB 2026.08.18 · b6d4e33 · Production
/api/version    {"sha":"b6d4e33","builtAt":"2026-08-18T15:26:02.774Z",
                 "branch":"main","environment":"Production","release":"LTB 2026.08.18"}
```

Identical, from one module. The badge checks the server on load and every 15 minutes; a tab running an older sha shows, in words: **"A newer LTB version is available. Refresh."** — so the next stale-tab morning announces itself.

`/api/version` is exempt from the auth gate for the same reason `/gate` is: a lapsed session still needs to learn a newer build exists, and the response is a hash and a date, nothing about the workspace.

## 2. Clicking a person opens that person — on the real pixels

From a hard-reloaded authenticated session:

| Step | Result |
|---|---|
| Today → Replies → click Mary Ann | drawer opens **over Today**; hash stays `#today` |
| Decisions → click first row | drawer opens; hash stays `#today` |
| Any `#prospects` navigation | **none** |

The click was never broken in the current bundle — the earlier confusion was the stale tab plus its ghost rows, both now self-announcing via the badge.

## 3. The full Gmail conversation, without pasting anything

**`lib/gmail-thread.mjs`** fetches whole messages through the **same** Gmail integration the sync uses — same account row, same token refresh, same API. No second integration. It:

- follows only threads **we are actually in** (an outbound of ours, or a genuine reply — so Sarah's newsletter blasts can never render as "the conversation")
- carries up to 2 threads, covering "we spoke in June and she wrote again in August"
- extracts real bodies (text/plain, HTML fallback), cuts quoted chains and tail signatures, keeps paragraphs
- writes nothing, to Gmail or the database; fetched on drawer open

**`GET /api/prospects/[id]/gmail-thread`** serves it; the Conversation section renders it chronologically, attributed (Ary vs their address), with the line: *"From Gmail, synced automatically. Nothing to paste."*

**Verified live on Mary Ann**, drawer opened from Today, nothing pasted:

- her June 25 outreach from Ary, **full text** (the contact-page/booking-form email)
- her decline — *"not the kind of upkeep I need most"*
- her reversal — *"I reconsidered"*
- her latest duplicate-post question, in full, signature, Bible verse and all

Screenshots captured of both the conversation and the draft state.

## 4. The paste box is a fallback, labelled as one

The bee now asks Gmail first, on open:

- **Thread synced** → *"This conversation is synced from Gmail. Use **Draft reply** in the Conversation section above — there is nothing to paste."* No textarea at all.
- **Gmail truly unavailable** → the textarea appears with the required label: *"Gmail message unavailable. Paste the missing message here only if needed."*

It is no longer possible to arrive at pasting as the normal flow.

## 5. Drafts stand on the full context

`/api/draft-reply` now:

- fetches the **full Gmail thread** server-side; snippets are only the degraded fallback if the mailbox is unreachable
- selects and carries **website/audit evidence**: `audit_notes`, `site_intel` (+date), `own_findings` — quoted into the facts with the instruction *"use it, do not claim the site was never looked at"*
- when none exists, states it: *"No website audit is stored for this prospect. Do not claim their site was reviewed; if a site question comes up, say what you would check."* Both failure directions are closed — denying a check that happened, and claiming one that did not.
- carries Ary's `info` notes, the accepted-offer fact (date only, never a number), client standing from the clients table
- returns `basedOn.sources`, and the UI prints it under the draft: **`Using: Gmail conversation · Prospect notes · Accepted offer`** — only what is really present.

For the record: Mary Ann has **no stored audit fields** (`audit_notes`, `site_intel`, `own_findings` all empty — checked in D1). Her real evidence is the Gmail thread, Ary's reply-analysis notes, and the accepted offer, which is exactly what the Using line shows. The honest draft therefore names what it would check rather than citing an audit that does not exist.

## 6. Mary Ann acceptance — the draft, generated live, nothing pasted

> Hi Mary Ann,
>
> Good question, I don't want to guess at the cause without looking closer. Once we start the cleanup I'll check the post settings and any plugins or feeds (including how Libsyn connects in) to see what's triggering the duplicate. I'll let you know what I find.
>
> Thanks,
> Ary

| Required | Shown |
|---|---|
| Knows what she just asked | answers the duplicate-post question first |
| Knows what Ary already said | continues the cleanup conversation |
| Honours the accepted offer | *"Once we start the cleanup"* — no price restated |
| No invented diagnosis | *"I don't want to guess at the cause"* + names what it would check |
| No false audit claim | cites nothing that is not stored |
| Voice | short, warm, no em dash, signed `Thanks, / Ary` |

**She was not sent.** The draft was discarded after the screenshot; she remains the one row in Replies.

## 7. Send reply on the same build

Present under the draft (screenshot), wired to `/api/reply-send` — the path the internal canary proved end-to-end earlier today: same-thread headers, stale-draft refusal, idempotent retry. Not re-sent in this task; no real prospect send occurred.

## 8. Tests

**2,418 passing.** 8 new in `tests/live-context.test.mjs`: the version module is one shared fact; full Gmail messages replace snippets; audit evidence carried with its date; absence stated honestly; sources list only what exists; newsletter threads excluded from the conversation; bodies keep paragraphs and lose quoted chains; the audit rule reaches the prompt. Plus a design-system correction: the badge initially used raw font sizes and the Chapter 7/8 tests caught it — now tokens.

## 9. Production verification checklist

| # | Check | Result |
|---|---|---|
| 1 | Visible version marker | PASS — `LTB 2026.08.18 · b6d4e33 · Production` |
| 2 | Endpoint matches it | PASS — byte-identical sha |
| 3 | Replies shows Mary Ann | PASS — the one row |
| 4 | Click opens her directly | PASS — drawer over Today |
| 5 | Gmail history without pasting | PASS — full thread rendered |
| 6 | Latest inbound already present | PASS — in full |
| 7 | Context disclosure | PASS — `Using: Gmail conversation · Prospect notes · Accepted offer` |
| 8 | Draft without manual paste | PASS |
| 9 | Draft shows conversation + honest evidence | PASS — quoted above |
| 10 | Send reply present | PASS |
| 11 | Console errors | PASS — none |
| 12 | Stray `#prospects` navigation | PASS — none (Replies and Decisions both checked) |

## 10. Outbound safety

| Check | Value |
|---|---|
| Cold `send_events` | **10**, unchanged |
| `native-reply` events | **1** — this morning's internal canary only |
| Packages armed | **0** |
| Package 23 | `APPROVED`, `emails_sent = 0`, `auto_followup_approved = 0` |
| `autoSendApprovedFirstEmails` / `Followups` | **false / false** |

Gmail outbound events rose 27 → 30 from the sync observing ordinary mailbox traffic; none is a send caused by this task.

---

## What changed for Ary, in one line each

- The bottom of the sidebar always says which LTB is running, and a stale tab tells you to refresh.
- Opening a person shows the real conversation, whole messages, straight from Gmail.
- Draft reply reads that conversation and what LTB genuinely knows — and tells you which sources it stood on.
- The paste box only appears when Gmail truly cannot supply the message, and says so.
- Send reply is right there when the draft is ready. Nothing sends until you press it.
