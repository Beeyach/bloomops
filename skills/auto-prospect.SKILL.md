---
name: auto-prospect
description: "Prospect processing engine for Bloomwired on Leads That Bloom (leadsthatbloom.com) via window.bloom. PRESCREEN mode: batch-audits New-stage prospects with or without email, finds missing emails, fills name/business/country, rates STRONG 💚, Final Skip ✖️ and Dead 🥀, moves keepers to Validated. FULL mode: audits Validated prospects per the website-audit skill, writes exactly the band's V3 allowance (P1 four, P2 three, P3 one), each from a different angle built from audit facts, each closing on a concrete micro-offer, decides VIDEO_WORTHY from the evidence (two or more showable findings on a visual angle), then stages it for approval. No cold PDF, no Email 5, video never adds a touch, this skill never sends. Use for 'start prospecting', 'run auto-prospect', 'process the new leads', 'work the news', 'continue prospecting' (FULL), and 'prescreen', 'prescreen the New tab', 'find emails for the New ones', 'mark them', 'batch audit' (PRESCREEN). Requires website-audit for audit rules, pricing and voice."
---

## Strategy V3: what this skill owns, and what it does not

The app is the source of truth and the owner of policy. This skill orchestrates,
executes, deep-reviews and recovers. Two prospecting brains is the failure this
section exists to prevent.

**The app owns, and this skill reads rather than restates:**

- how many cold emails a prospect may ever receive (the priority band: P1 = 4,
  P2 = 3, P3 = 1)
- send eligibility, the send window, timezone and region scope
- every stop condition: reply, decline, unsubscribe, DNC, deferral, bounce,
  evidence staleness, allowed length reached
- the package fingerprint, dedupe, the Gmail send and reconciliation
- Strong, Vet, qualification, priority band
- asset eligibility, which is now an accepted offer and never a sequence step
- contact ownership classification

**A disagreement is worth reporting, not silently resolving.** A skill
overriding live policy is what makes both untrustworthy.

### The four things Strategy V3 retires everywhere

1. **The band decides the length, and every touch takes a different angle.**
   P1 gets 4, P2 gets 3, P3 gets 1. The rotation is: E1 pain + micro-offer,
   E2 specific fix sketch, E3 video, E4 short breakup. Each email approaches
   the prospect from a different direction built from their audit facts. Email
   5 does not exist in this skill. It remains a deliberate manual override Ary
   performs on a named prospect, never something written here.
2. **Every cold email closes on a concrete micro-offer.** Name one specific
   thing actually seen, offer to hand over something small and specific,
   deliverable in under about ten minutes, plus the escape hatch ("if that is
   already handled, ignore me"). 4.0% interested against 0.4% for an open
   question, n=625. Never close on an open question, and never on a generic
   call-booking ask. A yes/no offer that happens to be a question is fine and is
   in fact the best-performing shape.
3. **Assets follow evidence, not habit.** The PDF stays out of the cold
   sequence. Video does not: when the audit turns up something a person
   understands faster by watching it than by reading about it, a short
   personalised video earns a place in one of the touches the band already
   allows. What is retired is the counter ("this is email 5, therefore an
   asset") and the reflex ("credits exist, therefore a video"). See
   VIDEO_WORTHY below.
4. **This skill does not open Gmail.** It stages a package and stops. The app
   sends, after Ary approves, inside her send window, through every guard.

### This skill's V3 role: batch orchestrator and skill-assisted package preparer

A first-class execution mode, not a fallback. There are two supported ways to
prepare a package and neither replaces the other:

- **Native unattended** — the app calls Sonnet on a cron with nobody present.
  Buys back Ary's attention, costs API money.
- **Skill-assisted (this skill)** — prepares the package inside Claude Code and
  stages it. Costs no API money at all.

Both produce the **same canonical package** and pass the **same validators**. A
skill-prepared package that breaks a rule is rejected exactly as a native one
would be. There is no privileged path.

**What this skill may decide:** which pages to look at, whether a page supports
a finding, what to write, which addresses are worth trying, how to batch its own
work.

**What it must not decide:** sequence length, send policy, Strong, Vet,
priority, asset eligibility, contact ownership rules.

**No send, ever, on this path.** `stageSequence` creates a READY_FOR_APPROVAL
package and nothing else: no send, no approval, no schedule, no model call.
Follow-up copy created after approval can never send, so write the whole
allowance up front or not at all.

## Evidence-first qualification

A prospect is Strong only when all four are true. This mirrors the app's own
gate, and the subagent is asked to answer them one at a time rather than form an
overall impression:

1. **FIT** — they are the kind of business Bloomwired helps. Not "can they pay".
   Ability to pay disqualifies only when somebody said so outright, or when the
   entity structurally is not a buyer.
2. **A legitimate, verifiable reason to contact** — something actually observed
   on their site, quotable, with a date.
3. **An in-scope opportunity** — the thing observed is something Bloomwired
   actually fixes.
4. **Sufficient evidence** — the observation survives the website-audit skill's
   verification ladder.

Any of the four failing means not Strong. **If there is no legitimate reason to
write, do not invent pain.** A quiet, working site with nothing to say about it
is a FINAL SKIP, not a creative writing exercise.

Uncertainty is stated, never smoothed over. web_fetch cannot render JS
calendars, popups or captchas, so those are flagged as unverifiable, never
asserted as broken.

## VIDEO_WORTHY: when the evidence is worth watching

The app already answers this, deterministically, in `lib/assets.mjs`
(`videoDecision`). **It is the authority.** The skill's job is to reach the same
answer from the same evidence, so the two agree, and to report it when they do
not.

A prospect is VIDEO_WORTHY when the finding is:

- **visible** on the page, not inferred
- **demonstrable**, so showing beats describing
- **specific to them**, not a category complaint
- **supported by real audit evidence** that survives the verification ladder

The app calls a finding showable when its key is one of these:

```
form-broken, captcha-broken, booking-is-a-form, calendar-not-loading,
two-schedulers, dead-links, nav-dead-link, broken-images, dead-image-host,
dead-feed, mobile-overflow, long-form, quote-form-thin
```

and it treats the angle as a visual one when the playbook is
`lead-capture-gap`, `booking-friction`, `broken-path` or `mobile-friction`.

| What the audit found | Verdict |
|---|---|
| 2 or more showable findings **and** a visual playbook | **VIDEO_WORTHY** |
| exactly 1 showable finding | not worthy: the email says it in a sentence |
| showable findings on a non-visual angle | not worthy: the argument does not depend on seeing it |
| findings real but none showable | not worthy. This is an email |
| evidence below STRONG | not worthy |
| site could not be read, or the check is stale | not worthy. A walkthrough of a page nobody could read is guesswork |

**Do not mark VIDEO_WORTHY because credits exist.** Do not invent or inflate a
finding to reach two. One showable thing is a sentence, and paying for a video
to say it out loud is the reaching video these rules exist to prevent.

### How video rides the sequence

It never adds a touch. It occupies one the band already allows.

| Band | Shape when VIDEO_WORTHY |
|---|---|
| **P1** (4) | day 0 pain + micro-offer, name the issue and offer the video · day 4 fix sketch · day 9 video delivery · day 16 short breakup |
| **P2** (3) | day 0 pain + micro-offer, name the issue and offer the video · day 5 fix sketch · day 12 video delivery (breakup angle) |
| **P3** (1) | one strong email. Video only when the evidence is unusually strong, or Ary picks them by name |

Email 1 **offers** and carries no link. The delivery step carries the video
wording in `body_video` (and optionally `subject_video`) on the same sequence
entry, and the app appends the link at send time.

The delivery step must have **both** wordings: `body` for when no video exists
yet, and `body_video` for when it does. The render happens after staging, so a
follow-up can come due before the file is there. **No URL means the standard
body goes out**, and nobody is promised a video they cannot watch.

A prospect gets exactly one video, ever. The app stamps `video_sent_at` on the
send that carried it and every later step reverts to its standard wording by
itself.

If they reply yes to the offer, the cold sequence is over. The video goes out as
part of the conversation, from Ary, like any other reply.

## Reply semantics

Any genuine human reply ends automated cold outreach. After a reply:

- the prospect is in conversation mode and never re-enters cold outreach
- an ordinary decline means no to this offer; the relationship may stay open
- NO_TO_US, unsubscribe and DNC are closed
- an explicit later date is Deferred
- silence is not rejection
- no reply after the allowed touches means the sequence is finished, not failed

This skill never writes a sequence for anybody who has been contacted already.
`stageSequence` refuses them at the door, and that refusal is correct: their
remaining touches belong to the follow-up machinery, not to a new Email 1.

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

## WHO OWNS WHAT

**Leads That Bloom runs this entire lifecycle by itself now.** A prospect goes
from added to Ready for Approval on a five-minute cron with nobody pressing
anything.

The app owns, and this skill must not re-decide:

- the DEAD check and the renderability preflight
- reading their own page for contacts and clues
- whether a browser probe is worth paying for
- the paid site check and its budget
- evidence, and whether it is enough to say anything
- STRONG / MAYBE / SKIP
- which outreach angle the evidence supports
- Email 1, and validating it
- asset eligibility
- whether outreach may progress at all (`lib/outbound.mjs`)
- reply awareness, because Gmail is read natively

What this skill is genuinely for:

- **Orchestration outside the app.** Batches, one-offs, anything driven from a
  browser rather than the queue.
- **QA.** Running the audit by hand on a prospect the app has already judged,
  and reporting where they disagree. Disagreement is a finding.
- **Exceptions.** Anything marked MAYBE is a request for a person.
- **Sourcing an email the site does not carry.** Still nobody else's job.

If a rule here and a rule in the app disagree, the app is what runs, and the
disagreement is a bug worth reporting rather than working around.

# Auto-Prospect Engine (Leads That Bloom)

One engine, two modes, one tracker. Leads That Bloom IS the record. Each row's
Info field carries Ary's original research notes (category, city, phone,
priority, audit hints). Use them.

- **PRESCREEN mode** — fast batch verdicts on New rows, including rows with no
  email. Finds emails, fills identity fields, rates every row (💚 / ✖️ / 🥀),
  and moves STRONG-with-email rows to Validated so FULL mode can pick them up.
  Writes no emails.
- **FULL mode** — complete processing of Validated rows that have an email:
  audit, exactly the band's allowance of emails, no asset, no send. The package
  is staged for approval and the app sends after Ary approves.

Mode routing: "prescreen", "find emails", "mark them", "batch audit" →
PRESCREEN. "start prospecting", "run auto-prospect", "process the new leads",
"work the news", "continue prospecting" → FULL. If Ary asks for both ("prescreen
then work them"), run PRESCREEN to empty, then FULL.

**Single sources of truth (do not restate, read from there):** the website-audit
skill owns the audit protocol, verification ladder, Dead-address check,
STRONG/SKIP rating, platform skip rules, niche notes, unverified absence rules,
voice, email structure, and the currency/pricing table. Never quote prices from
memory.

---

## Tracker facts (verified 2026-08-08 — read before writing anything)

- **Every window.bloom setter keys by EMAIL only.** Passing a numeric id (or
  domain, or business name) returns `{ok:false, error:"Prospect not found"}` or
  silently fails. `findById(id)` works for reads. There is NO API way to write to
  a row that has no email — `updateEmail` also requires the existing email as its
  key.
- **Emailless rows are edited through the table UI.** Flow: activate the "New"
  chip (searches only display rows inside an active chip view), type the business
  name in the search box, wait ~1.5s for the filter to apply, then edit in place:
  the email cell becomes an input on click (type + Enter), the rating cell opens
  an icon popup (row 1: — 💚 💙 ⊗=✖️, row 2: ⊘=🥀 ✉=📭), the country cell is a
  dropdown, and the ⓘ icon opens a side panel whose "Your notes" textarea IS the
  Info field (saves on blur/Tab). Once an email is set via the UI, switch to the
  API for everything else on that row.
- **Never chain search-and-click without a wait or screenshot between** —
  clicking before the filter renders lands on the wrong row or dead space, and
  typed text vanishes or lands in the search box. Verify every UI write by
  `findById` after `refresh()`.
- **Window layout shifts between sessions** (zoom/panel state). Take one
  screenshot to calibrate coordinates before the first UI edit, and recalibrate
  whenever a click misses.
- **✖️ and 🥀 rows disappear from every table view** — the Filters ▸ Rating menu
  has "Skip" and "Dead site" unchecked by default. If a 🥀 row needs an info
  note, write the note BEFORE setting the rating; afterwards the row is
  unreachable in the UI.
- **Chip meanings:** "New" = stage New minus rated rows; "Prescreen" = stage
  Prescreen; "Validated" = stage Validated; "Needs email" = rating 💚 AND no
  email. So a STRONG verdict with no email is stored as 💚 + stage New and
  surfaces automatically in Needs email for Ary to source by hand.
- `verify` results and `{ok:true}` responses from the API are trustworthy; UI
  edits are not confirmed until read back fresh.

## Prerequisites (both modes)

- Chrome extension connected to Ary's browser
- **leadsthatbloom.com open in a Chrome tab and logged in with Ary's access
  code.** If the tab shows the access-code gate, stop and ask Ary to log in
  (never type her code yourself).
- website-audit skill installed

FULL mode does not need Gmail. It never opens a compose window.

## Preflight (both modes)

1. Chrome extension connected (tabs_context_mcp responds)
2. leadsthatbloom.com loads past the gate (sidebar visible). "Access code"
   showing → stop, ask Ary to log in.
3. Locate the skill file path (it changes per session) and store it:

```
Glob for: **/website-audit/SKILL.md
```

4. Confirm the API and count the queue in the leadsthatbloom tab:

```js
// FULL mode queue (prescreen already validated these):
window.bloom.getProspects().filter(p => p.stage === 'Validated' && p.email && !['✖️', '🥀'].includes(p.rating))
// PRESCREEN mode queue (rows with no email are the main point, but rows with email that were never prescreened are fine too):
window.bloom.getProspects().filter(p => p.stage === 'New' && !['✖️', '🥀'].includes(p.rating) && !(p.info || '').includes('PRESCREEN'))
```

If `window.bloom` is missing, open the Prospects view once and retry. For
targeted batches swap the stage/country in the filter.

If any check fails, stop and report. Do not guess.

---

# PRESCREEN MODE

Purpose: New prospects without an email never reach FULL mode. Prescreen audits
them, finds the email if it is on the site, fills in identity fields, clears out
the dead wood, and sorts the keepers: STRONG with email → Validated, STRONG
without email → the Needs email bucket.

Report the queue count before processing anything. Batch size reality: with the
emailless-heavy mix, one session handles ~60-80 rows before context runs out (UI
edits are the bottleneck, not the audits). Quote that when Ary asks how many.

### Per prospect: audit via subagent

Spawn a subagent per prospect (or small batch). The subagent prompt must include
the prospect row (name hint, business, URL, country hint, info notes), the
website-audit SKILL.md path, and this instruction set:

```
Read {WEBSITE_AUDIT_SKILL_PATH} first. Apply, in order: the Dead-address check (DEAD verdict per that section), the activity check, the rating rules with the platform skip rules and niche notes, and the four-part Strong test (fit, a legitimate verifiable reason to contact, an in-scope opportunity, sufficient evidence). This is a PRESCREEN: no human review follows a skip, so when manual-scheduling-control is the only finding and the rest of the site works, lean FINAL SKIP rather than STRONG.

If there is no legitimate, verifiable reason to contact them, that is a FINAL SKIP. Do not invent pain to manufacture one.

Fetch the site with web_fetch (try with and without www before calling it DEAD). A mostly-empty JS shell is not automatically DEAD, but check it against the Dead-address check's parking markers before giving it that benefit of the doubt — a parked domain is also a JS shell.

Also search the web for the business name + city for activity signals (review count/recency, social presence). Linked social profiles count as presence even if last-post dates can't be verified.

While auditing, collect identity details the row is usually missing:
- Business name as shown on the site
- Owner/contact name ONLY if a real human name is written on the site. Never invent or derive one from the email, domain, or a person-sounding business name. Blank is safe, guessed is not.
- Country, from address, phone country code, or clear regional signals
- Email, if visible anywhere in the fetched HTML (header, footer, contact page, mailto). Don't hunt outside the site, don't verify it, just grab it. "none" if absent.

Return EXACTLY:
VERDICT: [STRONG / FINAL SKIP / DEAD]
REASON: [one line]
BUSINESS: [name as shown]
OWNER: [real human name from the site, or "none"]
COUNTRY: [ISO-ish code or "unknown"]
CATEGORY: [what they do]
EMAIL: [address or "none"]

No maybe. Pick the side it leans toward and commit. Do not write emails.
```

### Write-back

**STRONG, email known (found on site, or already on the row):**
1. If the row had no email, set it via the UI email cell first (see Tracker
   facts), verify with `findById`.
2. Then via API, keyed by that email:
```js
await window.bloom.setName(EMAIL, OWNER);        // only if a real name was found and ≠ business
await window.bloom.setCountry(EMAIL, CC);        // only if the row was empty
const prev = (window.bloom.findByEmail(EMAIL) || {}).info || '';
await window.bloom.setInfo(EMAIL, 'PRESCREEN: STRONG — one-line reason' + (prev ? '\n' + prev : ''));
await window.bloom.setRating(EMAIL, '💚');
await window.bloom.setStage(EMAIL, 'Validated');
```
Rating 💚 + stage Validated is the whole point: FULL mode pulls from Validated.
If a found value conflicts with what Ary typed (e.g. a different owner name),
leave the row's value alone and put the conflict in the info note AND the final
report.

**STRONG, no email anywhere on the site:** rating 💚 via the UI popup, stage
stays New — the row then surfaces in the "Needs email" chip for Ary to source by
hand. Fill country via the UI dropdown and write the PRESCREEN: STRONG note
(ending with "NO EMAIL on site — needs manual sourcing") via the ⓘ notes panel.

**FINAL SKIP → ✖️, DEAD → 🥀:**
- Row has an email: `setInfo` first (PRESCREEN SKIP: reason), then `setRating`.
- No email: write the note via the ⓘ panel FIRST, then set the rating via the UI
  popup — rated rows vanish from the UI and the note becomes unwritable.
- Never change the stage on skips/deads. The two ratings mean different things:
  ✖️ is a judgement (looked at, does not fit), 🥀 says this address is not their
  site and the business may be fine elsewhere. When a 🥀 site's business is
  clearly alive at another domain, the note (and the final report) must carry the
  correct domain/contact so Ary can re-add it.

### Batching and errors

Process 10 at a time (parallel subagents), then a short progress report. Retry a
failed call once, then skip and log. `window.bloom` disappears → open the
Prospects view once and retry. Auth errors → stop, ask Ary to log back in.

### Prescreen do-nots

No cold emails written. No date fields touched. No assets. Only Ary's workspace
— if the data looks like someone else's, stop.

### Prescreen final report

Counts of STRONG (split: → Validated vs → Needs email) / FINAL SKIP / DEAD,
emails found, names/businesses/countries filled, rows skipped and why, conflicts
where the site disagreed with the row, and any 🥀 rows whose business is alive at
a different domain.

---

# FULL MODE

## Processing order

For each prospect, complete ALL steps before the next:

1. Pick the next Validated prospect (has email, not ✖️/🥀) and read its band
2. Spawn subagent: audit, the VIDEO_WORTHY verdict, and exactly the band's
   allowance of emails
3. Read subagent result
4. DEAD → rate 🥀, stage stays Validated, move on
5. SKIP → rate ✖️, stage stays Validated, move on
6. STRONG → store the sequence, the audit and the video verdict
7. VIDEO_WORTHY only → render the video and set its URL
8. Stage the package with `stageSequence`
9. Confirm the package id, then move on

Never start step 7 before step 6 is complete. **There is no send step.** The
stage is not advanced here either: the app stamps the stage when it actually
sends.

## Step 1: Pick the next prospect, and read the band

The band decides how many emails to write. It is the single most important field
on the row, and getting it wrong means the package is refused at staging.

```js
(() => {
  const TOUCHES = { P1: 4, P2: 3, P3: 1 };
  const SPACING = { P1: [0, 4, 9, 16], P2: [0, 5, 12], P3: [0] };
  // Mirrors the app's effectiveBand: a stored band wins, otherwise the rating
  // decides, otherwise P2 is the unrated default.
  const bandOf = (p) => {
    const stored = String(p.priority_band || '').trim();
    if (TOUCHES[stored]) return stored;
    const r = String(p.rating || '').trim();
    if (r === '💚') return 'P1';
    if (r === '✖️') return 'P3';
    return 'P2';
  };
  const q = window.bloom.getProspects().filter(p => p.stage === 'Validated' && p.email && !['✖️', '🥀'].includes(p.rating));
  const p = q[0];
  if (!p) return 'QUEUE EMPTY';
  const band = bandOf(p);
  return JSON.stringify({
    name: p.name, business: p.business_name, email: p.email,
    domain: p.domain, country: p.country, info: p.info,
    band, allowed: TOUCHES[band], spacing: SPACING[band],
    emails_sent: p.emails_sent || 0,
  });
})()
```

Rules:
- Only stage `Validated` AND non-empty email AND rating neither ✖️ nor 🥀.
  (Legacy rows: if Ary says "work the News", rows still sitting in New with an
  email may be processed the same way — but the default queue is Validated.)
- **`emails_sent` greater than zero means skip this prospect entirely.** They are
  already in a sequence, and a staged sequence starts at Email 1. `stageSequence`
  will refuse them; do not waste a subagent finding that out.
- `allowed` is the number of emails to write. Not five. Exactly
  `allowed`: 4 for P1, 3 for P2, 1 for P3. Writing fewer is refused at staging;
  writing more is silently trimmed and wastes the work.
- `info` may carry Ary's research notes and a PRESCREEN verdict line — pass it to
  the subagent as context. A PRESCREEN: STRONG note is a hint, not a substitute:
  the full audit has the final word.
- `name` holds the owner's proper name, never the business. If `name` equals
  `business_name`, is empty, or is clearly the company, there is NO confirmed
  owner name. A person inside the business string ("Courage To Thrive (Samaneh
  Sharifi)") can be pulled out. Pass both `name` and `business_name` to the
  subagent.
- **Greeting name lock:** the greeting uses only a confirmed first name from the
  prospect record. No confirmed name → "Hi there," or "Hi [Company] team,". Never
  let the subagent guess or invent one. Never greet with `business_name`.
- Empty `domain` → can't audit: rate ✖️ with reason "no website" (Step 3 SKIP
  path), move on.

## Step 2: Spawn audit subagent

The subagent does all heavy work: fetches the site, runs the full audit per
website-audit, applies the four-part Strong test, and if STRONG writes exactly
`allowed` emails, each closing on a concrete micro-offer. It generates no asset
and writes output JSON.

The prompt MUST include: prospect details (name hint, business, URL, email, info
notes), the band and its allowance, the file path to website-audit SKILL.md, the
output JSON path, and the instruction to READ the skill file before doing
anything.

### Subagent prompt template

```
You are a prospect researcher for Bloomwired (bloomwired.io). Audit one prospect's website and, only if they qualify, write a cold outreach sequence of exactly {ALLOWED} emails. Generate no PDF. Decide whether the evidence justifies a personalised video, but do not render one: you are writing the decision and the copy, not the file.

## Prospect
- Name field (may just mirror the Business below — if it equals Business, treat as NO confirmed owner name): {NAME_HINT}
- Business: {BUSINESS_NAME}
- Website: {WEBSITE_URL}
- Email: {EMAIL}
- Priority band: {BAND}, which allows exactly {ALLOWED} cold email(s), spaced at days {SPACING}.
- Research notes from Ary (may include a PRESCREEN verdict; informs but never replaces your own verification): {INFO}

## Step 1: Read your instructions
Read {WEBSITE_AUDIT_SKILL_PATH} — the full audit protocol, Dead-address check, verification ladder, rating rules, unverified absence rules, angle matching, email structure, voice, draft scans, currency and pricing table. Follow it exactly. It is the single source of truth for all of those.

## Step 2: Audit
FIRST run the website-audit skill's Dead-address check on {WEBSITE_URL}. If it is DEAD (parked, placeholder, registrar default, unresolvable), write the SKIP-shaped JSON below with "rating": "DEAD" and a skip_reason naming which marker, and stop. No emails, no judgement of the business. DEAD is not SKIP: 🥀 vs ✖️ in the tracker.

Otherwise fetch {WEBSITE_URL} plus /about, /services, /contact, /book, /booking via web_fetch. Check Google reviews if possible. Run the full audit per the website-audit skill, verification ladder and all, flagging unverifiable JS/popup elements rather than calling them broken.

Find the owner's proper name on the site (about, team, footer, booking page). Return it in `prospect_name` (first and last if shown, first only if that is all, null if no real person is named). Never return the business name, and never copy the Name field passed to you — it may mirror the business. Greeting derives from this per the greeting rules; null → "Hi there," / "Hi [Company] team,".

## Step 3: The four-part Strong test
Answer each separately and put the answers in the JSON. All four must be true for STRONG:
- fit: are they the kind of business Bloomwired helps? (Not "can they pay".)
- contact_reason: is there something you actually observed on their site that gives a legitimate, verifiable reason to write? Quote it.
- in_scope: is that observed thing something Bloomwired actually fixes?
- evidence_sufficient: does the observation survive the verification ladder?

If any is false, this is a SKIP. **If there is no legitimate reason to contact them, do not invent one.** A working site with nothing to say about it is a skip, and a skip is a perfectly good outcome. Manufactured pain is the single worst thing you can return.

## Step 3b: VIDEO_WORTHY
Only if STRONG. Decide whether a short personalised video would materially help, and return the decision with the findings that justify it.

Count your SHOWABLE findings. A finding is showable when it is one of:
form-broken, captcha-broken, booking-is-a-form, calendar-not-loading, two-schedulers, dead-links, nav-dead-link, broken-images, dead-image-host, dead-feed, mobile-overflow, long-form, quote-form-thin.

The angle is visual when the playbook is lead-capture-gap, booking-friction, broken-path or mobile-friction.

video_worthy is TRUE only when ALL of these hold:
- 2 or more showable findings
- the angle is one of the four visual playbooks
- your evidence rating is STRONG (not thin, not partial)
- the site rendered well enough to actually see the problem
- the findings are current, not from a stale check

Otherwise video_worthy is FALSE. One showable finding is a sentence in an email, not a video. **Never raise a finding count, invent a defect, or stretch an angle to reach the threshold.** A false here costs nothing; a false video costs Ary money and credibility.

Return `video_worthy`, `video_reasons` (the specific visible defects, [] when false) and `video_score` 0-10.

## Step 4: If SKIP or DEAD
Write this JSON to {OUTPUT_JSON_PATH} and stop:
{{
  "rating": "SKIP",  // or "DEAD"
  "skip_reason": "one line",
  "fit": true/false,
  "contact_reason": "the observed fact, or null",
  "in_scope": true/false,
  "evidence_sufficient": true/false,
  "prospect_name": "owner's proper name or null",
  "business_name": "{BUSINESS_NAME}",
  "email": "{EMAIL}",
  "domain": "extracted domain"
}}

## Step 5: If STRONG, write exactly {ALLOWED} emails
Follow the website-audit skill's structure AND its calibrated cold voice block. Each email gets the two-step process (draft scan, then final), but the output JSON carries only the FINAL clean versions.

**Length is not negotiable. Write exactly {ALLOWED} emails, numbered 1 to {ALLOWED}. There is no Email 5. Do not write a longer sequence and trim it; write the right number. Every email takes a DIFFERENT angle: no two emails in the sequence may repeat the same approach.**

Angles (V3 rotation, assigned per step):
- E1: PAIN_MICRO_OFFER -- the observable pain + a concrete micro-offer
- E2: FIX_SKETCH -- a specific fix sketch from the audit
- E3: VIDEO -- the video angle (or a different audit-based observation for non-video-worthy)
- E4: BREAKUP -- short breakup, makes silence a fine answer

Shapes:
- Email 1 (day 0, angle: PAIN_MICRO_OFFER), 75-100 words: the observable fact you verified, then a plausible intentional explanation for it, then the escape hatch ("if that is intentional, ignore this" in Ary's own words), then one concrete micro-offer, then a simple yes/no CTA. Signed "🌸 Ary from bloomwired.io".
- Email 2 (day 4 for P1, day 5 for P2; angle: FIX_SKETCH), 30-50 words: a specific fix sketch from the audit, different from Email 1's angle. Fresh subject. Signed "🌸 Ary".
- Email 3 (day 9 for P1, day 12 for P2; angle: VIDEO for P1, BREAKUP for P2), 30-50 words: for P1 this is the video angle or another audit observation; for P2 this is the short breakup close. Signed "🌸 Ary".
- Email 4 (day 16, P1 only; angle: BREAKUP), 20-40 words: one short paragraph, a final close that makes silence a fine answer. Signed "🌸 Ary".

The micro-offer must be concrete and small: a few specific fixes, a short teardown, the exact steps, one useful deliverable. Something real, deliverable in about ten minutes. **Never a generic call-booking CTA. Never an open question as the close.**

### If video_worthy is TRUE, the micro-offer is the video

Same shapes, same lengths, same ceilings. The video does not add an email.

- **Email 1** names the real issue and offers the video as the micro-offer. Something like "I noticed X. I can send a short video showing what I mean. Want it?" in Ary's own words, not those words. **No link. No URL. The video may not exist yet.**
- **The delivery step** is the video-angle email (P1 email 3, P2 email 3). It gets TWO wordings on the same entry:
  - `body`: the ordinary final email, as if there were no video. This is what sends when the render is not ready.
  - `body_video`: the same email rewritten around the video actually existing. Something like "I recorded it anyway, in case it is still useful." Optionally `subject_video` too.
  - Do NOT put a URL in `body_video`. The app appends the link after the sign-off itself. Writing one in means the prospect gets it twice.
- Never describe the video as free, exclusive, expiring, or personalised-just-for-you. It is a short recording of their own page. Say that.

If video_worthy is FALSE, write no video wording at all: no `body_video`, no `subject_video`, and no mention of a video anywhere in any email.

Voice rules, all hard:
- short, plain English, specific, warm, human
- no invented diagnosis, no invented pain, no fake certainty
- acknowledge uncertainty where the evidence cannot prove intent
- no corporate fluff. Never "circling back", "closing the loop", "touching base", "bumping this", "on your radar", "per my last email", "I hope this finds you well"
- **never an em dash**, in any email, anywhere
- no PDF, no attachment, and no asset link of any kind pasted into the wording

Currency and pricing: use the website-audit skill's CURRENCY AND PRICING table. Never quote prices from memory.

## Step 6: Write the output JSON to {OUTPUT_JSON_PATH}
{{
  "rating": "STRONG",
  "fit": true,
  "contact_reason": "the observed fact you are writing about",
  "in_scope": true,
  "evidence_sufficient": true,
  "prospect_name": "owner's full proper name, or null when unconfirmed",
  "business_name": "{BUSINESS_NAME}",
  "email": "{EMAIL}",
  "domain": "domain without protocol",
  "country": "AU",
  "currency": "AUD",
  "audit_notes": "full audit block text, RATING through OUTREACH ANGLE. Keep the template headers exactly as the website-audit skill writes them; the tracker parses them into a visual profile",
  "info": "3-5 line business snapshot for the Info column: Google reviews (count + recent), social (platforms + last post), platform, tools detected, category, notable detail",
  "outreach_angle": "1-2 sentence angle",
  "playbook": "booking-friction",
  "micro_offer": "the concrete small thing being offered, in one line",
  "video_worthy": false,
  "video_score": 0,
  "video_reasons": [],
  "suggested_offer": "Funnel Setup",
  "suggested_offer_price": "AUD $429",
  "emails": [
    {{ "number": 1, "day": 0, "subject": "...", "body": "Hi Name,\n\n...\n\n🌸 Ary from bloomwired.io" }}
    // ...exactly {ALLOWED} entries, numbered 1..{ALLOWED}
    // When video_worthy is true, the LAST entry also carries:
    //   "body_video": "the same email rewritten around the video existing, no URL"
    //   "subject_video": "optional"
  ]
}}

Return one line: "{NAME}: STRONG — {ANGLE}" or "{NAME}: SKIP — {REASON}" or "{NAME}: DEAD — {REASON}"
```

### Subagent notes

- Has Read, Write, Glob, Grep, web_fetch, bash. No browser tools. Uses
  web_fetch, so unverifiable JS elements get flagged, never called broken.
- Its full context (site HTML, draft scans) is discarded after it returns; only
  the compact JSON persists.

## Step 3: Read subagent result

If "SKIP" or "DEAD" (or no website in Step 1):

```js
// '✖️' for SKIP, '🥀' for DEAD. setInfo BEFORE setRating (rated rows vanish from the UI).
const prev = (window.bloom.findByEmail('EMAIL_HERE') || {}).info || '';
await window.bloom.setInfo('EMAIL_HERE', 'SKIP: REASON_HERE\n' + prev);
await window.bloom.setRating('EMAIL_HERE', 'RATING_HERE');
```

Rating only — the stage stays Validated so skips never count in stage stats. The
queue filter excludes ✖️/🥀 so it won't be re-picked. Log "{name}: SKIP —
{reason}" (or DEAD), move on.

If "STRONG": continue.

## Step 4: Check the sequence before storing it

The app will refuse a bad sequence at staging, but finding out here costs one
read instead of a round trip. Refuse to store a sequence that fails any of these:

```js
(() => {
  const seq = SEQUENCE_FROM_JSON;      // the emails array
  const allowed = ALLOWED_FROM_STEP_1; // 4, 3 or 1
  const CORPORATE = /clos(?:e|ing) the loop|circl\w* back|touch(?:ing|es|ed)? base|bump\w* (?:this|it)|on your radar|per my (?:last|previous)|hope this (?:email )?finds you well/i;
  const problems = [];
  if (seq.length !== allowed) problems.push(`wrote ${seq.length} emails, the band allows exactly ${allowed}`);
  seq.forEach((e, i) => {
    // Both wordings face the same checks. Video copy that skips the phrase ban
    // is the same bug with a longer fuse.
    const all = ['subject', 'body', 'subject_video', 'body_video']
      .map((k) => String(e[k] || '')).join(' ');
    if (!e.subject) problems.push(`email ${i + 1} has no subject`);
    if (!e.body) problems.push(`email ${i + 1} has no body`);
    const hit = all.match(CORPORATE);
    if (hit) problems.push(`email ${i + 1} says "${hit[0]}"`);
    if (/[—–]/.test(all)) problems.push(`email ${i + 1} uses an em dash`);
    if (e.subject_video && !e.body_video) problems.push(`email ${i + 1} has a video subject but no video body`);
    if (/https?:\/\//.test(String(e.body_video || ''))) problems.push(`email ${i + 1} pastes a link into body_video; the app appends it`);
  });
  // Video copy belongs on the last email, never the first: email 1 offers.
  if (seq.some((e, i) => i < seq.length - 1 && e.body_video)) {
    problems.push('only the last email may carry video wording');
  }
  return problems.length ? problems : 'OK';
})()
```

Anything other than "OK" means send the subagent back with the exact problem, or
skip the prospect and log it. Never store copy that will be refused.

## Step 5: Store the sequence and the audit

The prospect ALREADY EXISTS — never addProspect. In the leadsthatbloom tab:

```js
await window.bloom.setEmailSequence('prospect@email.com', [ /* exactly `allowed` emails */ ]);
await window.bloom.setAuditNotes('prospect@email.com', 'Full audit text');
```

`setEmailSequence` accepts `body_video` and `subject_video` on any entry and
stores them verbatim. Staging carries them into the package, and the app decides
at send time which wording goes out.

### The video verdict

Record it whether or not it is true, so the decision is auditable rather than
inferred from the absence of a video:

```js
await window.bloom.setVideo('prospect@email.com', VIDEO_WORTHY ? 'SEND' : 'NO_VIDEO', VIDEO_SCORE);
```

Then, only when VIDEO_WORTHY is true, render the video with the existing
video/ElevenLabs workflow and set the URL. **Do not render before this point**,
and never for a prospect whose verdict was false:

```js
await window.bloom.setVideoUrl('prospect@email.com', 'https://file.gobloomwired.com/...');
```

The script must be grounded in the stored audit evidence and nothing else. It
shows the actual issue, explains it simply, gives one or two concrete
observations, and stops. It must not invent a technical cause, invent business
impact, exaggerate severity, claim something was tested that was not, or reach
for agency pitch language.

If the render is not ready by the time the delivery step comes due, nothing
breaks: the standard body sends instead.

### Name write-back (Name = owner's proper name, never the business)

- `prospect_name` is a real person name AND ≠ `business_name` → write it to Name
  (`setName`).
- `prospect_name` null AND current Name equals `business_name` → blank the Name
  so it stops mirroring the business.
- Otherwise leave Name alone.

```js
const rec = window.bloom.findByEmail('prospect@email.com') || {};
const biz = (rec.business_name || '').trim(), cur = (rec.name || '').trim();
if (OWNER_NAME && OWNER_NAME.trim() && OWNER_NAME.trim() !== biz) await window.bloom.setName('prospect@email.com', OWNER_NAME.trim());
else if (!OWNER_NAME && cur && cur === biz) await window.bloom.setName('prospect@email.com', '');
```

### Info and country

```js
const prev = (window.bloom.findByEmail('prospect@email.com') || {}).info || '';
await window.bloom.setInfo('prospect@email.com', 'FRESH_SNAPSHOT_HERE\n---\n' + prev);
await window.bloom.setCountry('prospect@email.com', 'AU');   // only if import left it empty
```

### Verify

```js
const p = window.bloom.findByEmail('prospect@email.com');
p && p.email_sequence ? 'Sequence stored' : 'ERROR: sequence not stored';
```

## Step 6: Stage the package

This is where the work becomes something Ary can approve. One call, no send, no
model, no API money:

```js
await window.bloom.stageSequence('prospect@email.com');
// → { ok: true, packageId, band, emails, droppedBeyondCap, status: 'READY_FOR_APPROVAL' }
```

What the server does, and what it refuses:

- trims the stored sequence to the band's allowance and reports
  `droppedBeyondCap` if anything was over
- **refuses** when the stored sequence is shorter than the allowance, when the
  prospect has already been emailed, when they replied, declined, unsubscribed or
  are do-not-contact, when a live package is already waiting, and when any email
  carries a banned corporate phrase or an em dash
- creates a READY_FOR_APPROVAL package and nothing else

A refusal throws with the prospect and the reason. Log it, leave the row alone,
and move on. A refusal is information, not a failure to work around.

Do NOT advance the stage after staging. The prospect is still Validated until
the app actually sends, and moving the stage by hand would tell the record an
email went out when none did.

## Step 7: Repeat

Back to Step 1 — the queue naturally excludes finished prospects. Continue until
empty or Ary says stop. Log per prospect:

```
✅ {Name} ({domain}) — {BAND}, {N} emails staged, package #{id}
⛔ {Name} ({domain}) — SKIP: {reason} (rated ✖️)
🥀 {Name} ({domain}) — DEAD: {reason}
⏭ {Name} ({domain}) — staging refused: {reason}
```

## Final report (FULL mode)

Counts of STRONG / SKIP / DEAD, packages staged with their ids and bands, the
band split (how many P1/P2/P3 and therefore how many emails), staging refusals
with reasons, and a plain statement that nothing was sent.

End with the line Ary actually needs: **"N packages are waiting in Approvals.
Nothing has been sent."**

## Error handling (both modes)

- **Subagent fails/times out:** log, leave the row untouched, move on. No
  automatic retry.
- **window.bloom call fails:** retry once, then log and skip. Missing entirely →
  the tab reloaded; open the Prospects view once and retry. A call keyed by
  anything other than an email fails — that is not a transient error, use the UI
  path.
- **Logged out mid-run (auth errors):** stop, ask Ary to log back in. Never enter
  her access code.
- **stageSequence throws:** log the prospect and the exact reason. Do not retry
  with different copy unless the reason was a phrase or em dash you can fix.
- **Site down/unreachable:** subagent returns DEAD or SKIP per the website-audit
  rules.

## Safety constraints

- **This skill never sends.** No Gmail compose, no send button, no exceptions. If
  a prospect genuinely needs an email today, that is Ary approving a staged
  package, not this skill opening a mail client.
- **Never write Email 5.** It is not part of any band's allowance.
  A fifth touch is a deliberate decision Ary makes on a named person.
- **No cold PDF.** The PDF follows an accepted offer.
- **A video is earned by evidence, never by budget.** Two or more showable
  findings on a visual angle, or it is an email. Never render one for a prospect
  whose verdict was false, and never invent a finding to reach the threshold.
- **A video never adds a touch.** It rides one the band already allows. If
  adding the video would mean a fourth email, the answer is no.
- **Never promise a video that does not exist.** The delivery step always has a
  plain body to fall back on, and the link is appended by the app from a real
  rendered URL or not at all.
- The audit has the final word over any pre-rating or PRESCREEN note: SKIP → ✖️,
  DEAD → 🥀.
- Never write emails about a page that is not their site — the Dead-address check
  runs before scoring because a blank page scores as the strongest prospect in
  the batch.
- Never invent a reason to contact somebody. No legitimate reason is a skip.
- Only ever work Ary's own workspace — if the greeting or data looks like someone
  else's, STOP and tell Ary.
- Never flip a send switch, arm auto-send, or approve a package. Staging is the
  end of this skill's authority.
