---
name: daily-reply-sync
description: "Daily inbox-to-tracker sync for Bloomwired. Scans hello@bloomwired.io for new prospect replies and bounces, updates Leads That Bloom (leadsthatbloom.com) via window.bloom (replied, reply type, stage), prepares draft replies for interested prospects, and drafts nudges for warm threads quiet 3+ days — WITHOUT sending anything, drafts only, Ary sends. Use whenever Ary says 'run the reply sync', 'sync replies', 'check the inbox', 'any replies?', 'process replies', 'draft the nudges', or a scheduled morning task invokes it. Pre-authorized to read Gmail, update the tracker, and create Gmail DRAFTS. Never authorized to send. Requires Gmail access (Gmail connector tools preferred, Gmail in Chrome as fallback) and Claude-in-Chrome for Leads That Bloom."
---

## Strategy V3: what this skill owns, and what it does not

The app is the source of truth and the owner of policy. This skill orchestrates,
executes, deep-reviews and recovers. Two prospecting brains is the failure this
section exists to prevent.

**The app owns, and this skill reads rather than restates:**

- how many cold emails a prospect may ever receive (`allowed_length`, from the
  priority band: P1 = 4, P2 = 3, P3 = 1)
- send eligibility, the send window, timezone and region scope
- every stop condition: reply, decline, unsubscribe, DNC, deferral, bounce,
  evidence staleness, allowed length reached
- the package fingerprint, dedupe, the Gmail send and reconciliation
- Strong, Vet, qualification, priority band
- asset eligibility, which is now an accepted offer and never a sequence step
- contact ownership classification

**A disagreement is worth reporting, not silently resolving.** A skill
overriding live policy is what makes both untrustworthy.

### The three things Strategy V3 retires everywhere

1. **There is no five-email sequence.** Read `allowed_length` off the record.
   Population evidence: emails 1 and 2 convert at 2.9% and 3.0%, email 3 at
   1.2%, and everything after that at about 1% against a 7.9% baseline. Emails 4
   and beyond are a deliberate manual override on a named prospect, never
   routine.
2. **Every cold email closes on a concrete micro-offer.** Name one specific
   thing actually seen, offer to hand over something small and specific,
   deliverable in under about ten minutes, plus the escape hatch ("if that is
   already handled, ignore me"). 4.0% interested against 0.4% for an open
   question, n=625. Never close on an open question. A yes/no offer that happens
   to be a question is fine and is in fact the best-performing shape.
3. **Assets follow evidence, not habit.** The PDF stays out of the cold
   sequence: it happens after somebody accepts an offer, or when Ary asks. Video
   is different and is NOT banned from cold outreach. When the audit turns up two
   or more showable findings on a visual angle, the prospect is VIDEO_WORTHY: the
   video is offered in Email 1 and delivered in the last touch the band already
   allows. It never adds a touch, and it is never made because credits exist.
   `videoDecision` in lib/assets.mjs is the authority.

### This skill IS the reply pipeline (since the 2026-08-27 shutdown)

The app reads no Gmail. This skill reads the mailbox and posts what it finds
to `/api/replies/ingest`; the app's own code then matches, dedupes,
classifies, and stops outbound. The skill reads, the app decides.

It keeps the classification vocabulary as the shared specification, which
`lib/reply-classify.mjs` implements.

Reply speed is not a problem to solve: median 24 minutes, 70% inside the hour,
across 83 recovered exchanges. Do not add urgency scoring or speed optimisation.

**It decides nothing: every record change goes through the ingest endpoint.**


## WHERE THE RULES COME FROM

Leads That Bloom is the source of truth for anything about the workspace: what
it sells, who it sells to, its qualification rules, its stages and its prices.
Those live in the Hive (Settings) and the app reads them on every decision.

**Inside the app, the Hive always wins.** If a rule below disagrees with what
Settings says, Settings is right and the disagreement is worth reporting: it
means this file has drifted, and a skill quietly overriding live configuration
is the failure mode that makes both untrustworthy.

**Fallback, and it is clearly marked as one.** These skills also run where the
app is not reachable, and the specifics kept here exist for that case only:
pricing figures, the sending address, region scopes, and the voice examples.
Treat them as a last resort, say plainly in the report when one was used, and
never let a fallback value override a live one.



## WHO OWNS WHAT (rewritten 2026-08-30, fourth revision)

**The app no longer reads Gmail (shutdown 2026-08-27).** This skill reads the
mailbox; the app matches, dedupes, classifies, decides what a reply does to a
record, whether outreach may continue, and surfaces it.

This skill is for:

- **The daily sweep.** Reading yesterday's inbox and posting it in.
- **Recovery.** Catching up anything a missed day left behind.
- **QA.** Reading a thread properly and comparing with what the app decided.
- **Drafting.** The app prepares cold follow-ups; it does not write answers to
  interested replies. Step 5 is still this skill's, and still drafts only.
- **Warm nudges.** Step 5b, with its latest-context guard, has no equivalent.

Post to the app rather than writing through `window.bloom`, so the same
matching and dedupe apply:

```
POST /api/replies/ingest  { "messages": [ { messageId, threadId, from, sentTo, subject, snippet, occurredAt } ] }
```

Idempotent on `messageId`. **Still never sends.**

**Post even when the sweep found nothing.** `{ "messages": [] }` is a real
message: it tells the app the mailbox was read and held nothing new. The app
stamps reply freshness off this post, and its send guard refuses every send —
including Ary pressing the button herself — when replies have not been read
recently. Skipping the empty post is how a quiet inbox becomes a blocked
send button.


# Daily Reply Sync

Turns yesterday's inbox into tracker updates and ready-to-send drafts. The job Ary was doing by hand every time a prospect wrote back.

Three outputs, nothing else: tracker records updated, Gmail drafts created for the replies worth answering, one short report. **This skill never sends an email. Drafts only.**

---

## Preflight (stop conditions)

- Chrome extension connected and leadsthatbloom.com loads past the gate (window.bloom present after opening the Prospects view once). "Access code" showing → stop, ask Ary to log in, never type her code.
- Gmail reachable: prefer the Gmail connector tools (search_threads, get_thread, create_draft — load via ToolSearch if deferred). If the connector is unavailable, fall back to reading Gmail in the Chrome tab.
- **Scheduled-run failure must be loud.** If this is a scheduled run and Chrome is not connected, the first line of the report is exactly: `REPLY SYNC DID NOT RUN — Chrome not connected. Open the Bloomwired browser and say "run the reply sync".` Send it as a push if a PushNotification tool is available.

## Step 1: Collect candidate threads

Search Gmail, lookback 3 days (overlap is fine, dedupe handles it):

- Replies: `in:inbox newer_than:3d -from:hello@bloomwired.io`
- Bounces: `from:mailer-daemon OR from:postmaster newer_than:3d`

Keep only threads that contain at least one SENT message from hello@bloomwired.io (that is what makes it a prospect thread). Ignore newsletters, tools, receipts, and anything with no outreach from us in the thread.

## Step 2: Match each thread to a tracker record

Match by the address WE SENT TO in the thread, not by the reply's From. Owners reply from personal addresses (Wellness Valeria's record is val@wellnessvaleria.com.au, her reply came from a gmail address). Order:

1. `window.bloom.findByEmail(sentToAddress)`
2. If no hit, try the reply sender's address.
3. If still no hit, try any record whose domain matches the sender's domain.
4. No match → list the thread in the report under "unmatched", touch nothing.

## Step 3: Dedupe

Before processing a message, check the record's info for `REPLYSYNC:` followed by that message's id. Already there → skip silently. Every write in Step 4 prepends a `REPLYSYNC:<messageId>` line so no message is ever processed twice, across days and across manual runs.

## Step 4: Classify and update

Read the full message. Classify into exactly one:

| Type | Signals | Tracker updates |
| --- | --- | --- |
| **interested** | asks a question, asks price, says yes/tell me more, warm engagement | setReplied, setReplyType('interested'), setReplyDate, setStage('Interested') |
| **decline** | not interested, no thanks, stop emailing, unsubscribe wording | setReplied, setReplyType('decline'), setReplyDate, setStage('Rejected') |
| **defer** | not right now, check back later, busy season | setReplied, setReplyType('defer'), setReplyDate, setStage('Snoozed'), and if a month or timeframe is named, setNextActionDate to it (first of that month) |
| **bounce** | mailer-daemon/postmaster failure for an address we sent to | setStage('Invalid Email') on the bounced record |
| **auto-reply** | out-of-office, autoresponder | info note only, nothing else changes |

Reply dates in Ary's local time (America/Los_Angeles), format YYYY-MM-DD.

Info note, prepended (never overwrite):

```js
const prev = (window.bloom.findByEmail(KEY) || {}).info || '';
await window.bloom.setInfo(KEY, 'REPLYSYNC:<messageId> <TYPE> <date>: <one-line summary, quote the key phrase>\n' + prev);
```

Then, on the same record, log the words themselves:

```js
await window.bloom.addLog(KEY, 'REPLY', 'They said: <their key sentence, quoted, under 200 chars>');
```

Both writes, every time (2026-08-08). The `info` marker is the audit trail;
the REPLY log entry is what the app's bees read. Reply Bee prefills its draft
box from it, so Ary never pastes a reply that already came through the inbox,
and Echo Bee reads every one of them to work out what people actually object
to. Skipping the log entry leaves both blind and makes her type it again.


For declines, capture WHY in the summary when stated (cost, wrong fit, already handled, pushed back on a claim). Those reasons are how the outreach improves. If the prospect corrected something we claimed (see the website-audit skill's unverified absence rules), say so explicitly in the summary — that goes in the report too, flagged as a wording lesson.

All `window.bloom` setters are async: await every call, verify one record per batch with findByEmail.

## Step 5: Draft replies (interested and question-type only)

For each interested reply, create a Gmail DRAFT in the same thread. Voice and rules: the ary-voice skill (professional register) on top of the website-audit skill's REPLY HANDLING section — reply to what their reply changed, one problem, one small next step, real price if asked (smallest step, their currency, from the website-audit pricing table), warm leads never get sent to the Setup Check, warm leads asking for a call get 2-3 specific windows in their time zone.

Drafts are created, never sent. Declines get no draft and no reply (the door closed politely, leave it closed) unless the decline contains a factual correction worth a one-line thank-you, in which case draft it and let Ary decide.

## Step 5b: Warm nudges (quiet warm threads, drafts only)

After the new replies are processed, sweep the warm stages: every prospect at stage Interested, Engaged, or Replied.

For each, find their thread(s) in Gmail and check who spoke last and when. Act only when the LAST message is from Ary and it is 3 or more days old.

**Latest-context guard, mandatory before drafting a single word (Ary: "I don't want to send too soon for a mistake"):**

1. Re-read the ENTIRE thread, not the tracker summary. The tracker note may be stale.
2. Search Gmail for ANY newer message from this prospect: their record address, the address they last wrote from, and any address at the same domain, across all threads including new ones. If anything newer exists that Ary has not answered, this is not a nudge — draft the ANSWER to that message instead (per Step 5 rules).
3. Check the SENT folder for a reply Ary may have sent from her phone that the tracker never saw. If Ary already followed up within the last 3 days, skip.
4. Count Ary's consecutive unanswered messages in the thread. Three or more → no nudge; list the prospect in the report as "gone quiet after 3 touches, consider closing" and touch nothing.

The nudge itself, per the website-audit warm-close rules: one new small ask or one new concrete piece, 2-4 sentences, never "did you get my note," never "just checking in," never a re-send of the same offer. If the record has a `video_url` that was never sent and the video genuinely fits the conversation, the nudge may offer it as the new piece with the link, always in the watch form (2026-08-08): take `video_url`, replace `/video/` with `/watch/` and drop any `.mp4`. The watch page is branded and reports views back to the tracker. (Any `VIDTEST:` marker on the record is dead history from the 2026-08 test and no longer withholds anything.) Create as a DRAFT in the existing thread.

Cap: 5 nudge drafts per run, oldest silence first. More than that means the warm pipeline needs Ary's attention, not a stack of drafts — say so in the report.

## Step 6: Report

Short, scannable:

- Counts: replies found, interested / decline / defer / bounce / auto-reply / unmatched, nudge drafts created
- One line per prospect: name, type, the key quote, what changed in the tracker
- Drafts created, with the thread subject, ready to send in Gmail
- Wording lessons: any reply that corrected a claim we made, quoted, so the pattern gets fixed in the skills
- Unmatched threads for Ary to eyeball

If nothing new: "No new replies since last sync." and stop.

## Safety constraints (non-negotiable)

- NEVER send an email. Draft creation is the ceiling. No exceptions, including "just a thank-you".
- Never process a thread with no sent outreach from hello@bloomwired.io in it.
- Never mark a record from a guessed match. Domain-match (step 2.3) requires the domains to be exactly equal, and the info note must say the match was by domain.
- Stage moves only per the table above. Never advance email stages (that is the sweeps' job), never touch sequences, video fields, or ratings.
- Only Ary's workspace. If the data looks like someone else's, stop.
- Respect the dedupe marker. A record already carrying this messageId is done.
- Warm nudges only after the full latest-context guard. When in doubt about whether a thread moved, skip and flag rather than draft.
