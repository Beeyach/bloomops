# Skills → product map

Five skills in `skills/`, read in full. They are not prompt files: they are
specifications for prospecting work that was developed by doing it, and several
of their rules were things the app did not know and was quietly getting wrong.

---

## Inventory

| Skill | Purpose | Trigger | Human actions | Automated actions |
|---|---|---|---|---|
| **auto-prospect** (415 lines) | The prospect lifecycle engine. PRESCREEN mode rates New rows and finds emails; FULL mode audits, writes the 5-email sequence, generates the PDF, sets the video verdict, sends Email 1 | "run auto-prospect", "prescreen" | Logs in; sources emails the site does not carry | Audit via subagent, write-back, Gmail send, stage advance |
| **website-audit** (654 lines) | **The source of truth** for audit protocol, verification ladder, DEAD check, STRONG/SKIP, platform rules, niche notes, video tiers, voice, pricing | Loaded by the others | Confirms unverifiable claims | Rates, writes findings |
| **daily-followup-sweep** (278 lines) | Sends Emails 2–5 by region scope, runs the VIDTEST A/B | "run the sweep", scheduled | None (pre-authorised to send) | Reads Due today, pre-send guard, composes, sends, advances |
| **daily-reply-sync** (121 lines) | Inbox → tracker. Classifies replies, updates stage, drafts responses | "check the inbox", scheduled | Sends the drafts | Classify, update, draft. **Never sends** |
| **prospect-pdf** (215 lines + generator) | The Email 5 one-pager | Called by auto-prospect FULL | None | Renders from verified findings |

---

## Important logic recovered

Rules that existed only in a prompt. The app had none of them, so the tracker
could reach a different conclusion about the same prospect and nothing noticed.

### 1. DEAD is not SKIP — **now native** (`lib/qualify.mjs`)

A skip is a judgement about the prospect. DEAD says only that *this address*
is not their site, so the business may be fine elsewhere and the row is worth
revisiting rather than burying.

The skill records why this must run before scoring: *a blank page has no form,
no booking, no CTA and no contact details, so it scores as the most gap-ridden
site in the batch.* `milesstovall.com` got a ninety-second video narrating an
empty page that way.

Ported: 12 parking markers, 9 placeholder markers, the DNS/4xx/5xx checks, and
the thin-page test.

### 2. Platform implications — **now native**

The app had **no platform rules at all**. Recovered as three verdicts:

- `covered` (SimplePractice, Dentrix, ChiroTouch, Boulevard, Jane) → lean skip
- `build-around` (Calendly, Acuity, Square, Vagaro, Mindbody) → never a skip; the offer is what is missing *around* the tool
- `inspect` (GoHighLevel) → never skip on sight. Broken GHL is the strongest kind of prospect because they already bought the platform

⚠️ Writing the test for this found a real bug: `"Squarespace"` contains
`"square"`, so a site builder was being classified as a booking tool. Fixed by
matching longest key first.

### 3. Manual scheduling control — **now native, and it corrected the app**

This one contradicted what LeadsThatBloom was doing. `lib/vet.mjs` treated
"no booking system" as a straightforward fit signal, with the reason literally
reading *"which is the thing Bloomwired sells"*.

The skill is explicit that it often is not: practitioners skip online booking
deliberately, to screen people before committing time. For them a missing
calendar is a decision, and pitching it as a problem says immediately that
nobody looked.

The angle is now carried in code: *tidy the request-to-approval loop while they
keep control* — instant acknowledgement, faster notification, approve or
decline from a phone, confirmations after approval.

**A test asserting the old behaviour had to be rewritten.** It encoded the
belief the skill contradicts.

### 4. Unverified absence rules — **now native as a constant**

Learned twice from real pushback (Inner Resilience 2026-07, Wellness Valeria
2026-08): both owners had the invisible part handled and both corrected the
same claim.

Ported verbatim into `UNVERIFIED_ABSENCE_RULES`: an unverified absence is never
a finding; every post-form question carries the already-handled out early; no
invented visitor moments; benefit copy may not smuggle the accusation.

### 5. The tie-breaker — **now native**

*Can they pay, and is there a real gap you can verify from the public site?
Both yes → STRONG. Reaching to justify it → SKIP.*

### 6. Pre-send guard — **now native, and now answering from real mail**

From daily-followup-sweep, and the sharpest safety rule in any of the skills:

> A follow-up sent on top of an unanswered reply is the worst email we can send.

`canProgressOutbound()` in `lib/outbound.mjs` enforces it on every sweep the app
runs itself, and since the Gmail transport landed (2026-08-09) it answers from
real message chronology rather than date columns. The app records every message
in a thread with its exact arrival time, so "she replied at 2pm and Ary answered
at 4pm" resolves correctly instead of conservatively waiting a day.

The conservative date-only fallback stays for legacy rows with no message
events. It is never allowed to be *less* safe: with no outbound recorded after a
reply, the answer is still unanswered.

**The second check, `in:sent to:{EMAIL} newer_than:3d`, is still only in the
skill.** It catches a previous run that sent and then failed to advance the
stage. The app cannot reproduce it today because the app does not send, so it
has no send to reconcile — the day it does, this moves too.

---

## Classification

| Rule | Verdict | Where it lives now |
|---|---|---|
| Dead-address check | **SKILL ONLY → now product** | `lib/qualify.mjs` |
| Platform skip rules | **SKILL ONLY → now product** | `lib/qualify.mjs` + `lib/vet.mjs` |
| Manual scheduling control | **DUPLICATED and conflicting → product corrected** | `lib/qualify.mjs` + `lib/vet.mjs` |
| Unverified absence | **NATIVE BUT WEAKER → strengthened** | `qualify.mjs`, referenced by `EVIDENCE_RULES` |
| STRONG/SKIP tie-breaker | **SKILL ONLY → now product** | `lib/qualify.mjs` |
| Verification ladder | **SHOULD REMAIN A SKILL** | needs a model looking at a page |
| Video verdict tiers | **ALREADY NATIVE, better** | render service `worthRecording()` |
| Evidence tiers | **OBSOLETE in skill** | `lib/evidence.mjs` is stronger: the skill has labels, the product has dates and sources |
| Reply classification taxonomy | **SKILL ONLY** | listed under NEXT |
| Pre-send guard | **SKILL ONLY** | listed under NEXT |
| Region send scopes (AU/NZ vs US/CA/UK) | **SHOULD REMAIN A SKILL** | it is about Gmail send timing, which the product deliberately does not own |
| Voice rules, prices, offer names, niche notes | **WORKSPACE-SPECIFIC** | must never be hardcoded — see SaaS separation |

---

## SaaS separation

The line drawn while porting:

**PRODUCT-GENERAL** (in code, applies to anybody)
- Evidence tiers and what may be asserted
- Dead-address detection
- Platform implications
- The tie-breaker
- Unverified-absence rules
- Freshness and coverage

**WORKSPACE-SPECIFIC** (configuration, never in code)
- Ary's voice and banned words
- Her prices and offer names
- Her niche preferences and target countries
- Her email structure and cadence

`lib/qualify.mjs` carries only the first list. That is what makes any of this
sellable to somebody who is not Ary.

---

## Skill drift

**Source of truth, from now on:**

| Rule | Owner |
|---|---|
| DEAD vs SKIP, parking markers | `lib/qualify.mjs` |
| Platform verdicts | `lib/qualify.mjs` |
| Scheduling stance | `lib/qualify.mjs` |
| Evidence tiers, freshness, sufficiency | `lib/evidence.mjs`, `lib/site-intel.mjs` |
| STRONG/MAYBE/SKIP verdict | `lib/vet.mjs` |
| Video tier | render service `findings.mjs` |
| Voice, prices, sequence copy | the skills |
| Verification ladder, page judgement | the skills |

Skills should read these rather than restating them. The website-audit skill
already uses this pattern internally ("single sources of truth, do not
restate"), so extending it to the app is the same discipline.

**Done (2026-08-09).** All three operational skills now carry an ownership
section naming the app as the engine, and were repacked. `website-audit` and
`prospect-pdf` are unchanged: they are reference specifications, not automation,
and the app reads from them rather than competing with them.

---

## Native pipeline (built)

```
  Gmail  →  push  →  gmail-sync  →  match  →  classify  →  stop outbound
                                                        →  stale the draft
                                                        →  Today
      ↑                                                        ↑
      └── watch renewed daily, reconciled every 5 min          │
                                                               │
PROSPECT  →  prescreen (free)  →  skip? stop with a reason     │
                    ↓                                          │
             signals (one fetch, free) → dead address? stop    │
                    ↓                                          │
             verify-site (20cr, budget-gated, skipped if fresh)│
                    ↓                                          │
             vet (free) →  STRONG / MAYBE (waits) / SKIP       │
                                                               │
DUE PROSPECT  →  sweep ranks them  →  prepare-followup  ───────┘
                 (Pick Bee ordering, 10/day)     writes a draft, sends nothing
```

Everything above runs from a cron with no browser open. Verified in production.

**Deliberately not native:** sending. Composing from the stored sequence, the
region scopes, the VIDTEST assignment and the Gmail send stay in
daily-followup-sweep, and the answer to an interested reply stays in
daily-reply-sync. The app prepares; a person sends.

---

## What each skill is for now

| Skill | Was | Is now |
|---|---|---|
| **auto-prospect** | The prospect engine | Sourcing emails the site does not carry, the 5-email sequence, the PDF, sending Email 1, resolving MAYBEs |
| **daily-followup-sweep** | The follow-up engine | Region scopes and send timing, composing, VIDTEST, the name-match check, the send itself, the resend check |
| **daily-reply-sync** | Inbox ingestion | The classification *specification*; drafting answers to interested replies; warm nudges; reconciliation and QA |
| **website-audit** | Source of truth | Unchanged. Still the source of truth |
| **prospect-pdf** | The one-pager | Unchanged |

The ingestion path is now `Gmail → app`. `POST /api/replies/ingest` remains for
reconciliation and replay, and shares `lib/reply-ingest.mjs` with the Gmail
path so there is one answer to "what does an unsubscribe do to a record".

---

## Skill and Hive alignment (2026-08-09)

Now that the offer, the identity and the qualification rules are read from the
Hive by the product, a skill carrying its own copy of any of them is a second
source of truth that nobody updates.

Every skill now opens with the same statement, before anything it governs:
**inside the app the Hive wins**, and a disagreement is worth reporting rather
than silently resolving, because a skill overriding live configuration is what
makes both untrustworthy.

### What each still embeds, and whether that is right

| Skill | Still embedded | Verdict |
|---|---|---|
| **auto-prospect** | Pricing (a $429 figure), the sending address, sequence shape | Fallback. It runs where the app is not reachable, and a price it cannot look up is better than no price. Marked as fallback |
| **daily-followup-sweep** | Region scopes and send times, the sending address, VIDTEST split | Correct. None of this is in the Hive, and the region scopes are a property of sending rather than of the workspace |
| **daily-reply-sync** | The classification vocabulary, the sending address | Correct. The vocabulary is the product's, shared with `lib/reply-classify.mjs`, and the skill is the specification |
| **prospect-pdf** | Pricing ($1,092), layout, logo | Fallback for pricing. Layout and logo are the asset itself |
| **website-audit** | Pricing ($1,092), qualification judgement, angle rules | Source of truth for judgement. Pricing is fallback |

### The one functional change

`daily-followup-sweep` now reports its send back:

```js
await window.bloom.recordSend(EMAIL, { step: N, subject: SUBJECT_SENT });
```

The app never sees the send, so it has to be told. Before this the database's
last word on any prospect was that a package had been APPROVED, and approved is
not sent: a batch approved and never sent looked identical to one that went
out. The call is safe to repeat, and a lost call is recoverable from the sent
folder through `PATCH /api/outreach/sent`. The skill is told to report a
failure loudly rather than resend.

### Not changed

No skill reads the Hive directly. They run inside Chrome against
`window.bloom`, which already returns records the app produced from Hive
settings, so a second read would be a second chance to disagree.
