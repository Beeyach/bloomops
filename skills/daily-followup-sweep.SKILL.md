---
name: daily-followup-sweep
description: "Daily cold-email follow-up sweep for Bloomwired, all regions, run per region scope. Runs on Leads That Bloom (leadsthatbloom.com) via window.bloom. Use whenever Ary says 'run the sweep', 'run the AU sweep', 'run the US sweep', 'daily sweep', 'follow-up sweep', 'send today's follow-ups', or a scheduled task invokes a sweep. Region scopes: AU (Australia + New Zealand, scheduled 5 PM PST) and US (US, CA, UK/GB, and no-country, scheduled 6 AM PST). If no region is named, run both scopes in one pass. Pre-authorized to generate and SEND emails autonomously from hello@bloomwired.io with no mid-run confirmation. Requires Claude-in-Chrome tools inside Ary's actual Chrome (load them if deferred). Sends follow-ups up to the app-owned allowed_length (P1 = 4, P2 = 3, P3 = 1), reading p.due so a spent band is never sent to. Delivers an audit video when one exists, is unsent, and the step was written to carry it. No VIDTEST, no Email 5 or beyond, no step-triggered PDF."
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

1. **The band decides the length: 4, 3, or 1.** Read `allowed_length` off the
   record. Population evidence: emails 1 and 2 convert at 2.9% and 3.0%, email
   3 at 1.2%, and everything after that at about 1% against a 7.9% baseline.
   Email 5 and beyond are a deliberate manual override on a named prospect,
   never routine. The absolute ceiling is 4 cold touches (P1).
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

### This skill's V3 role: queue orchestrator, auditor and recovery path

Not an independent sender. It may orchestrate and check queues, audit what is
due, perform manual or outside-app recovery, surface mismatches between the app
and the mailbox, and **invoke the app's canonical send action** where permitted.

It must not carry a second region, timing or sequence policy.

**Region scope now lives in workspace config** (`regionScopes` in send policy)
and is read from the app. It used to live only here, which meant the app and
this skill each had an opinion about when it was reasonable to email somebody
and neither knew about the other.

### Retired in Strategy V2 (kept in V3)

- **The VIDTEST 50/50.** Over. Do not assign arms, do not write `VIDTEST:`
  markers, do not withhold a video from anybody because of one. Existing markers
  stay as history and mean nothing now.

  Video itself is NOT retired. Since 2026-08-21 it is conditional on evidence:
  a VIDEO_WORTHY prospect is offered it in Email 1 and receives it in the last
  touch their band allows. For this sweep that means the ordinary rule and
  nothing special: use `body_video` when `video_url` is set, `video_sent_at` is
  empty, and this step has video wording. Otherwise send the standard body.
- **"Email 5 includes the review PDF link."** There is no email 5, and a PDF is
  never triggered by a step.
- **The past-Email-5 one-off video path.** Video is fulfilment of an accepted
  offer now.

### Before every send, check the app's answer

Refuse and surface if any of these hold: a stopping human reply (an
autoresponder is not one), unsubscribe or DNC, a decline, a live deferral, a
changed contact address, evidence older than `evidence_stale_days`, outside the
send window for the prospect's region, a stale package fingerprint, the allowed
length already reached, or the copy for this step was not in the package when it
was approved.


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



## WHO OWNS WHAT (rewritten 2026-08-09, third revision)

The app owns timing and stops. `canProgressOutbound()` decides whether anything
may go out, it runs on every sweep, and since the Gmail transport landed it
answers from real message chronology rather than date columns.

The app also, unattended: pauses cadence when somebody replies, wakes deferred
prospects, prepares follow-up drafts for the highest-priority due prospects
(capped at ten a day), marks any draft stale the moment a reply overtakes it,
and stops preparing anything at all when the mailbox has not been read in
ninety minutes.

This skill is now for:

- **QA.** Auditing whether the app's Today decisions match the rules below.
  Where they differ, the rule or the code is wrong and both are worth knowing.
- **The send.** Composing from the stored sequence, region scopes and timing,
  the name-match check, and Gmail itself.
- **The resend check** (`in:sent to:{EMAIL} newer_than:3d`), which the app
  cannot reproduce because the app does not send and so has no send to
  reconcile.
- **External orchestration** when the queue is not the right driver.

**Sending is the line the app does not cross.** Everything before it is native.


# Daily Follow-Up Sweep (all regions, one skill)

Daily cold-email follow-up sweep for Bloomwired. One skill, two region scopes. The scheduled task (or Ary's message) names the scope; the logic is identical either way.

| Scope | Countries | Why this run time |
| --- | --- | --- |
| **AU** | AU, NZ | 5 PM PST lands next-morning inbox-open in Australia and New Zealand |
| **US** | US, USA, CA, UK, GB, and blank/missing country | 6 AM PST lands 9 AM ET and early afternoon UK |

Scope resolution: "AU sweep" or "AU/NZ" means AU scope. "US sweep", "US/CA/UK", or "western sweep" means US scope. No region named means run both scopes in the same pass, AU first. A prospect is never in both scopes, so running both never double-sends.

The tracker is Leads That Bloom (leadsthatbloom.com), read and written through `window.bloom`.

Pre-authorized to generate and SEND autonomously. No confirmation needed mid-run. Work inside Ary's actual Chrome via the Claude-in-Chrome tools. Load them if deferred.

---

## Preflight (stop conditions)

Stop immediately and report, rather than guessing, if any is true:

- The Chrome extension is not connected
- hello@bloomwired.io is not the signed-in Gmail account
- Leads That Bloom shows the access-code gate. If you see "Access code", stop and ask Ary to log in. Never type her code yourself.

**Scheduled-run failure must be loud.** If the run is from a scheduled task and Chrome is not connected (usually the Bloomwired browser is closed), the first line of the final report must be exactly: `SWEEP DID NOT RUN — Chrome not connected. Open the Bloomwired browser and say "run the sweep" to catch up.` If a PushNotification tool is available, also send that line as a push. Never let a no-Chrome run end with a report that reads like a quiet day.

## Step 1: Open Leads That Bloom

Open https://leadsthatbloom.com and confirm the app loads past the gate (you can see the sidebar). If `window.bloom` is missing, open the Prospects view once, then retry.

Confirm the API is live:

```js
window.bloom ? 'bloom API ready' : 'ERROR: window.bloom missing — open the Prospects tab once, then retry';
```

## Step 2: Click "Due today" first

In the Leads That Bloom UI, find and click the "Due today" filter/view. This is the source of truth for which prospects are due for a follow-up right now. It encodes the cadence (day 3, 7, 14, 21), so you do not compute days yourself.

Use `find` to locate the "Due today" control, click it, and screenshot to confirm the view switched.

## Step 3: Read due prospects in scope

Read the due prospects and keep only the active scope at stages Email 1 through Email 4. **Email 5 is not a sendable stage**: a prospect sitting there has already had more than any band allows, and the next email would be one nobody consented to.

```js
// AU scope: c === 'AU' || c === 'NZ'
// US scope: c === 'US' || c === 'USA' || c === 'CA' || c === 'UK' || c === 'GB' || c === ''
window.bloom.getProspects().filter(p => {
  const c = (p.country || '').toUpperCase().trim();
  const validCountry = IN_ACTIVE_SCOPE(c); // per the scope table above
  const validStage = ['Email 1', 'Email 2', 'Email 3', 'Email 4'].includes(p.stage);
  return validCountry && validStage && p.due === true;
});
```

If `p.due` is not present on the objects, the "Due today" view you clicked in Step 2 is the fallback source of truth: process the prospects it surfaces, still filtered to the active scope and stages Email 1 through Email 3.

**`p.due` is the safer of the two and should be preferred whenever it exists.** It asks the band whether the prospect may have another email; the view historically did not, and on 2026-08-21 it was surfacing 223 production prospects whose allowance was spent, one of them a 💙 sitting at five sent. The app has since been fixed so both answers agree, but prefer `p.due` anyway: it is the one that is defined to be cap-aware.

Separately, collect prospects in the active scope who are owed a video they never received: `video_url` set and `video_sent_at` empty, whatever their stage. Those go to Step 5, not Step 4. A promised recording is a delivery, not a follow-up, which is why it is allowed past the band.

If nothing is due, report "No prospects due today in [scope]" and stop (or move to the next scope on a both-scopes run).

## Step 4: Process each due prospect, in order

### 4a. Read the next email

The next email number is **N = current stage number + 1** (stage "Email 2" means send Email 3).

```js
const prospect = window.bloom.findByEmail(EMAIL);
const sequence = prospect.email_sequence;
const nextEmail = sequence.find(e => e.number === N);
```

`nextEmail` has `{ number, subject, body }`, plus optional `subject_video` and `body_video` on whichever email is the last one its band allows. If it's missing or undefined, skip this prospect and flag it. All email content lives in Leads That Bloom. Do not open any external chat links.

### Pre-send guard (runs after 4a, before composing anything)

Gmail is the source of truth for what was actually sent and received. The tracker
can be stale: the reply sync may not have run yet, or a previous run may have died
between send and stage advance. Run both checks for every prospect. Prefer the
Gmail connector tools (search_threads, load via ToolSearch if deferred), fall back
to searching in the Gmail tab.

1. Reply check. Search `from:{EMAIL} newer_than:30d`. If the record's info notes a
   different reply address or domain, search that too. Any inbox message from them
   newer than our last sent message → do NOT send. Skip, flag as "replied, tracker
   stale", leave the record for the reply sync to classify. A follow-up sent on top
   of an unanswered reply is the worst email we can send.
2. Resend check. Search `in:sent to:{EMAIL} newer_than:3d`. Any hit → do NOT send.
   The previous run's stage advance almost certainly failed after the send.
   Reconcile instead: open the sent message, read which email number went out from
   the subject, setStage to match it, verify, and report the record as
   "reconciled, no send".

Both searches empty → proceed to 4b. Never compose before both checks pass.

### 4b. Prepare the body

Default: `nextEmail.subject` + `nextEmail.body` — the standard body. Never send a body containing a literal placeholder.

**Video wording, when this step has it.** Use `nextEmail.body_video` (and `subject_video` if present) when ALL of these are true, and the standard body whenever any one is not:

- `prospect.video_url` is set, so the recording actually exists
- `prospect.video_sent_at` is empty, so they have not already had one
- `nextEmail.body_video` is non-empty, so this step was written to carry it

A prospect gets exactly one video, ever. Once `video_sent_at` is stamped, every later step reverts to its standard wording on its own. If the render is not ready, the standard body goes and nobody is promised a video they cannot watch.

If the wording does not already contain a URL, append the link after the sign-off, exactly:

```
Here's the link to it:
<the value of prospect.video_url>
```

Never paste the link into the middle of the wording.

**The watch link, not the raw file (2026-08-08).** Whenever a video link is appended, use the WATCH form: take `prospect.video_url`, replace `/video/` with `/watch/` and drop any trailing `.mp4`. The watch page is branded, carries the call-to-action button, and reports views back to the tracker, so watched prospects surface in Today under "Watched your video".

```
Here's the link to it:
{prospect.video_url with /video/ replaced by /watch/, no .mp4}
```

**Subject check on a video send:** the subject must name the thing neutrally. If `subject_video` states a defect as fact ("broken", "not working", "goes nowhere"), rewrite it neutrally before sending ("A short video of your booking page").

**No PDF, on any step.** There is no Email 5 and no step-triggered review link. If a stored sequence entry still carries one from the V1 era, send the step without it and flag the record.

### 4c. Name-match check

Compare the greeting in the email against the prospect's name on file in Leads That Bloom:

| Situation | Action |
| --- | --- |
| No name on file | Greeting must read "Hi there," |
| Body still contains a literal "[Name]" placeholder | Replace with "Hi there," |
| Body greets a specific name that matches the name on file | Send as is |
| Body greets a specific name NOT confirmed on file | Mismatch. Skip this prospect, flag it, do not guess |

### 4d. Compose and send in Gmail

Send only from hello@bloomwired.io.

1. Click Compose. Wait ~1 second before touching the To field. There is a known bug where the recipient chip does not commit if you click too early.
2. Click the To field, type the address, press Return (not Escape). Screenshot to confirm the recipient chip actually committed.
3. Set Subject via `input[name="subjectbox"].value` plus dispatching an `input` event.
4. Set Body via `div[aria-label="Message Body"].replaceChildren()`, then append one `div` per line. Blank lines are a `div` containing a `<br>`. Never use innerHTML. The page's TrustedHTML policy blocks it.
5. Strip decorative hearts (💗) from the email body. Keep the "🌸 Ary" sign-off.
6. Click Send.

### 4e. Verify the send

Wait ~2 seconds, then confirm the compose window is actually gone:

```js
!document.querySelector('div[aria-label="Message Body"]') // must return true
```

Only proceed once confirmed.

### 4f. Advance the stage

Switch to the Leads That Bloom tab.

```js
await window.bloom.setStage(EMAIL, nextStage);
```

If the stage verify fails, retry setStage once. If it fails again, stop the run.
The first line of the report must be:
`STAGE ADVANCE FAILED for {EMAIL} — email {N} WAS SENT but the tracker still shows
{stage}. Fix before the next run.`
A quiet advance failure today is a guaranteed double send tomorrow. The resend
check would catch it, but the failure still gets reported loudly, never buried.
If this send was a Group A video send, mark it after the stage is confirmed:

```js
await window.bloom.markVideoSent(EMAIL);
await window.bloom.setVideoSentEmail(EMAIL, SUBJECT_SENT, BODY_SENT_INCLUDING_APPENDED_LINK);
```

Store the exact subject and body that went out, appended link included.

**End-of-sequence handoff (the last email the band allowed):** if the prospect has a `video_url` and `video_sent_at` is still empty, their video never got a slot in the sequence. After the stage is confirmed, queue the standalone:

```js
await window.bloom.setNextActionDate(EMAIL, DATE_5_DAYS_FROM_TODAY);
```

Without this they finish the sequence with an unsent video and never surface again. Skip it when `video_sent_at` is already set.

### 4g. Report the send back to the tracker

The app never sees the send, so it has to be told. Until this call the database
knows only that a package was APPROVED, and approved is not sent: a batch
approved and never sent looks identical to one that went out.

```js
await window.bloom.recordSend(EMAIL, { step: N, subject: SUBJECT_SENT });
```

Safe to call twice. The server deduplicates, and the response says which case
it was. If it comes back `duplicate: true`, say so in the report rather than
treating it as success: a duplicate here usually means the previous run sent
and then failed somewhere after, which is worth knowing.

If the call throws, the send still happened. Do NOT resend. Report the line
`SEND NOT RECORDED for {EMAIL} — email {N} went out. Reconcile from sent mail.`
and carry on. The app can recover this from Gmail's sent folder, but only if it
is told to look.

Never advance the stage before the send is confirmed. Never reorder or skip steps 4d then 4e then 4f then 4g.

## Step 5: One-off video emails (the recording landed after the sequence ended)

After the sequence follow-ups, handle prospects who finished their band without receiving a video that already exists, whatever stage they are on, where ALL are true:

- `video_url` is set and starts with `https://file.gobloomwired.com/video/`
- `video_sent_at` is empty
- Last contact was at least 5 days ago
- Country is in the active scope

These are prospects whose video got recorded after the sequence ended (and, since 2026-08-05, the ONLY cold path a video goes out on). Each gets one standalone email. New thread, fresh subject naming the thing neutrally ("A short video of your booking page" — never "broken," "not working," or any defect-as-fact wording in the subject). Recorded videos are Ary-verified by policy; if video_reasons look unverified or accusatory, skip and flag instead of sending. Body template, filling [the thing] from `video_reasons`:

```
Hi [Name],

I recorded a short video showing [the thing] on your site. It's about 90 seconds, easier than me describing it in text.

No pitch in it. If it's useful, that's enough. The link is right below.

🌸 Ary
```

Append after the sign-off line:

```
Here's the link to it:
{video_url}
```

Send per 4c, 4d, and 4e (same name-match check, same compose pattern, same send verification). After the send is confirmed:

```js
await window.bloom.markVideoSent(EMAIL);
await window.bloom.setVideoSentEmail(EMAIL, SUBJECT_SENT, BODY_SENT_INCLUDING_APPENDED_LINK);
```

This email is built fresh at send time and lives nowhere else, so storing it is the only record of what the prospect received. Do NOT advance the stage — the sequence is already done. No Setup Check, no PDF link, no pricing in this email, and it is never sent twice. If this template and the website-audit skill's one-off template ever differ, website-audit wins.

## Step 6: Confirm and report

Re-check the Due today view (or re-run the Step 3 filter) to confirm nothing due remains in the active scope, aside from intentional skips. On a both-scopes run, do this per scope.

Report back:

- Scope(s) run
- Count sent, with names and subject lines
- Video sends, variant or one-off, with the link used
- Any skips and why (name mismatch, no email on file, spent band, bad video_url)
- Confirmation that every stage advanced correctly

## Safety constraints (non-negotiable)

- Click "Due today" before processing. Only work prospects that view surfaces.
- Only send if the prospect is due, stage is Email 1/2/3/4, name matches, and country is in the active scope. On an AU run, never send to US/CA/UK/blank. On a US run, never send to AU/NZ.
- A video goes out only when the recording exists, has not been sent, and the step carries video wording. One video per prospect, ever
- A video is sent at most once per prospect, ever. Check video_sent_at before any video send, call markVideoSent and setVideoSentEmail after
- When the last allowed email sends to a prospect with an unsent video, queue the standalone with setNextActionDate. Never let a prospect finish their sequence with an unsent video on file
- Video links must start with https://file.gobloomwired.com/video/ — anything else, skip and flag
- Video emails never carry the PDF link or Setup Check. Never two links in one email
- One-off video emails only for prospects who finished their band without the video, with at least 5 days since last contact
- Send ONLY from hello@bloomwired.io
- Only ever work Ary's own workspace. If the greeting or data looks like someone else's workspace, stop and tell Ary.
- If the Chrome extension is not connected, hello@bloomwired.io is not signed in, or the access-code gate is showing, stop immediately and report per the loud-failure rule in Preflight
- Never send without both pre-send guard checks passing in the same run
- Gmail beats the tracker on sent/reply state. The tracker beats Gmail on sequence content and stage