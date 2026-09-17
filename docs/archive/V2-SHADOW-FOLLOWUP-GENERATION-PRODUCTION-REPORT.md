# V2 shadow follow-up generation

**Date:** 2026-08-11
**Status:** complete. Three follow-ups generated against production, none persisted, none sent.
**Commit:** `b7eb9ed`
**Tests:** 1,515 passing (32 new)
**Model calls: 3. Model cost: $0.01224. App credits: 0. Emails sent: 0. Rows written: 0.**

---

## Before

The banded ceilings had to land first, and this pass shows why. Until yesterday
a ✖️ prospect who had already had their one email was still eligible, so any
follow-up generated for them would have been the right words for the wrong
person. Generating good copy under a broken gate proves nothing.

The gate is correct now. This asks the next question: when the app decides
somebody is genuinely owed Email 2 or Email 3, can it write it?

## Existing generator audit

Traced before touching anything. Four separate reasons the old path could not
produce a correct V2 follow-up, and **none of them are about the model**:

1. **No step identity.** `buildFollowUpParts` wrote "a follow-up". It never knew
   whether it was writing Email 2 or the last one anybody would ever send.
2. **It never saw Email 1.** The prompt said *"This is a follow-up, so it must
   not repeat the first email"* without including the first email. That is not
   an instruction anybody can follow.
3. **Two homes.** Email 1 goes to `outreach_packages`. Follow-ups went to
   `pending_draft`, a different field on a different table. **Zero of the eleven
   production packages contain a single follow-up.**
4. **No ceiling.** `canPrepareFollowUp` → `canProgressOutbound` checks do-not-
   contact, unsubscribed, replies, stage and dates. It has never checked how many
   emails have already gone.

A fifth, in the skill-assisted path: `validatePackage` enforces the ceiling
properly, but only inside `if (band)`. **Eight of the eleven packages have no
band**, and for those the check is skipped entirely.

> **What prevented a correct V2 Email 2/3 package:** the app had no way to say
> which step it was asking for, no way to tell the model what the first email
> said, and nowhere to put the answer that Email 1 also lived.

## Current eligible corpus

Recalculated after the banded-ceiling fix, using the live policy rather than
SQL guesses.

| bucket | count |
|---|---|
| P1 eligible for Email 2 | **34** |
| P1 eligible for Email 3 | **52** |
| P2 eligible for Email 2 | **8** |
| unrated/provisional eligible | 1 |
| **P3 eligible for any follow-up** | **0** ✓ |
| held, no usable address | 160 |
| held, evidence too old | 8 |
| held, a person owes them a reply | 62 |
| finished at their ceiling | 159 |
| manual only, past the ceiling | 622 |
| closed (DNC / unsubscribed / won / lost) | 0 |
| ambiguous or contradictory send history | 0 |

**95 of 1,106 contacted prospects are owed a next email.** The expected
invariant holds: **P3 follow-up eligible is 0**, because a ✖️ prospect's single
touch has always already happened by the time they are in this corpus.

## Canonical package shape

The app owns the length. The model is never asked.

| band | brand new | 1 sent | 2 sent | 3 sent |
|---|---|---|---|---|
| P1 (💚) | 1, 2, 3 | 2, 3 | 3 | nothing |
| P2 (💙 🥀) | 1, 2 | 2 | nothing | nothing |
| P3 (✖️) | 1 | nothing | nothing | nothing |
| unrated | hard cap 3 | 2, 3 | 3 | nothing |

Unrated rows were **excluded from the shadow sample** on purpose. Their ceiling
is a fallback rather than a judgement, and the first thing to prove is that a
real band produces the right package.

## Generator ownership

**The app decides:** whether a follow-up may exist at all, which step number it
is, how many steps remain after it, which email is the angle of record, and
whether the finished draft is usable.

**The model writes:** roughly forty words, on an angle it was handed.

`nextFollowupStep` delegates the eligibility question entirely to
`nextStepFor`. A second opinion about who is owed an email is exactly what
produced two files disagreeing last pass.

## Inputs

Only facts already stored. Nothing is fetched, scanned, or enriched.

- Email 1 exactly as it went out
- verified site evidence, where any exists
- name and business name
- how many cold emails have actually been sent
- the step number and the ceiling
- workspace identity and offer line

**Email 1 is read from a live package first, then from the legacy
`email_sequence` blob.** That fallback is load-bearing, not tidiness: every
prospect currently owed a follow-up predates packages entirely. Without it there
is no angle to continue and the next email would be invented.

**None of the three sample prospects has any verified site evidence.** The
prompt is told so explicitly and forbidden from adding any new detail about
their site. The angle survives because Email 1 carries it.

## Content rules

Email 2 and Email 3 share one rule: say the same thing again, shorter. 30 to 50
words. Stay on the subject Email 1 raised. Keep whatever it offered.

Email 3 is told it is the last one **and told not to say so**, because
announcing it is a way of applying pressure. No "I have not heard back", no
"last chance", no closing anybody's file.

## CTA and promise continuity

The offer is inherited, never replaced. If Email 1 promised something specific,
the follow-up keeps that promise. If Email 1 ended on a question, the follow-up
keeps the question.

**An honest limit worth stating.** The brief prefers a concrete micro-offer over
an open question. In this corpus, Email 1 usually ended with a question, so two
of the three follow-ups end with a question too. That is continuity working
correctly, not the CTA policy being ignored: the micro-offer preference applies
when Email 1 is written, and it cannot be applied retroactively to emails that
went out months ago.

No asset may be offered unless Email 1 already offered exactly that. Tested both
directions.

## Package fingerprint

`packageShape` keys on band, ceiling, remaining legal steps and generator
version. It tells a P1 three-step package from a P2 two-step from a P3 one-step,
and it changes when sends reduce what is left. No five-email assumption survives
anywhere; a test walks every rating from 0 to 6 sends asserting the ceiling
never exceeds 3.

## Native versus skill-assisted

Untouched. Both modes keep the same package schema and the same validators;
only `prepared_by` differs. This pass adds no separate V2 rule for either, and
shadow output is marked `shadow` and never persisted at all.

## Validators

Fully deterministic. A test asserts the module contains no `askBackground` and
no API call: **the model is never asked whether the model did well.**

| check | catches |
|---|---|
| `STEP_ILLEGAL` | a step past the ceiling |
| `NOT_ELIGIBLE` | perfect copy for somebody not owed an email |
| `EMPTY` / `TOO_SHORT` / `TOO_LONG` | 20 to 80 words |
| `REPEATS_FIRST` | Email 1 sent again |
| `OFF_ANGLE` | changed the subject |
| `BANNED_PHRASE` | circling back, bumping this, last chance, closing your file |
| `UNSUPPORTED_CLAIM` | percentages, "most businesses", "studies show" |
| `THIRD_PARTY_CLAIM` | knowing what businesses like theirs do |
| `ASSET_PROMISE` | a video or PDF Email 1 never promised |
| `NAME_MISMATCH` | a greeting naming somebody else |

Two of these were built from real mistakes rather than imagination, both
described below.

## Shadow safety

The drafts exist in terminal output and nowhere else.
`scripts/shadow-followups.mjs` has **no write path at all** — no flag, no
branch, no persistence — and a test asserts it contains no `INSERT`, `UPDATE`,
`DELETE`, `enqueue(`, `sendApproved` or even the string `--write`.

Nothing is approved, no send state is set, no sent count moves, no Gmail id is
created, no job is queued.

## Production sample

Three prospects. Sarah (927) and Mary Ann (1317) are hard-excluded in code.
No replied, closed, stale-evidence, contact-recovery or ambiguous rows.

---

### 1. P1 → Email 2 · #2038 Mary · Peak Development Strategies

💚 → P1 · ceiling 3 · 1 sent · steps still legal: 2, 3 · angle from
`email_sequence` ("Your contact form, Mary") · no verified evidence · **an old
V1 draft exists and was not reused**

> **Subject:** Quick check on that form question, Mary
>
> Hi Mary. Just checking back on this. Once someone fills out the form under
> your services, is it routed and sorted automatically, or is that still a
> manual step on your end?

27 words · $0.00404 · **passes.** Same form, same question, a third the length.

### 2. P1 → Email 3 · #1515 Frances · Adolescent Life Coaching Center

💚 → P1 · ceiling 3 · 2 sent · **last email that will ever be sent** · angle
from `email_sequence` ("your contact form") · no verified evidence

> **Subject:** quick question on your contact form
>
> Hi Frances,
>
> Still curious whether that first reply after a parent submits your contact
> form is automated or something you send by hand. Happy to share how I would
> close that gap if it is still manual.

30 words · $0.00413 · **passes.** Final without saying so, no pressure, no
breakup language. This is the draft that failed first — see below.

### 3. P2 → Email 2 · #1549 Jane · Leading Edge Life Skills Pty Ltd

🥀 → P2 · ceiling 2 · 1 sent · **last email**, because P2 stops at two · angle
from `email_sequence` ("Your enquiry form, Jane") · no verified evidence

> **Subject:** quick question on your form
>
> Hi Jane,
>
> Just checking back on this. Is that first reply to a new enquiry automatic,
> or does it wait until you or Alice see it in the inbox?

22 words · $0.00407 · **passes.** Remembers Alice from Email 1 rather than
inventing a colleague.

## Failed generations

**One, and it is the most useful thing in this report.**

The first run produced three drafts that passed every validator. Reading them,
#1515 said:

> Happy to share **how other centers handle that gap** if it's useful.

That is a claim about businesses nobody has counted, used to suggest somebody is
behind. It is on Ary's banned list and on the brief's. It passed because every
unsupported-claim pattern looked for a **number** or a phrase like "most
businesses" — and this had neither. The same move, in a softer coat.

Fixed properly rather than by re-rolling: a `THIRD_PARTY_CLAIM` validator, a
test built from the exact failing sentence, four more phrasings of the same
move, and a companion test asserting Ary describing *her own* work stays
allowed. The prompt line was rewritten from "no numbers about their industry" to
name the soft version explicitly.

Regenerated, #1515 now offers to share **how I would close that gap** — her own
work rather than a claim about an industry.

Cost of the failure: 3 extra model calls, $0.01211. Total across both runs
**$0.02435**, against an authorised cap of $0.05.

### Two smaller observations, not fixed

- Two of three drafts open "Just checking back on this." Formulaic across a
  batch, though fine in isolation. Worth watching if this ever generates at
  volume.
- #2038's subject capitalised "Quick" where the prompt asked for lowercase
  except names. Cosmetic, and a person editing the draft would not notice.

## Old V1 drafts

#2038 still carries a pending V1 draft. **It was not reused and was not
deleted.** It is a historical artifact; the V2 copy was generated fresh.

## Safety

Verified immediately after the run:

| | before | after |
|---|---|---|
| `send_attempts` | 4 | **4** |
| `send-approved` jobs | 1 | **1** |
| `credit_events` | 199 | **199** |
| `outreach_packages` | 11 | **11** |
| sent count across the 3 samples | 4 | **4** |

- No email sent. No real prospect contacted. No Gmail provider id created.
- `AUTO_SEND_FIRST` **off**, `AUTO_SEND_FOLLOWUPS` **off**. Neither touched.
- Scanner concurrency **2**.
- Untouched: `sendApproved`, Gmail MIME and threading, provider-id
  reconciliation, dedupe, the recipient-name guard, send windows and caps, auto
  allowance, the relationship model, Hive, the scheduler and daily wake.
- No migration, no schema change, no new endpoint, no paid scan, no enrichment.

**One honest gap.** The shadow script calls the model directly rather than
through `askBackground`, so its $0.02435 is **not recorded in `ai_usage`**
(still 53 rows). Deliberate for a run that must write nothing, but it means
shadow spend does not appear in the app's own cost ledger. Anything that
generates for real should go through `askBackground` so it does.

**One pre-existing thing noticed and not changed:** the Anthropic API key is
stored in the `settings` table in plaintext. `openSecret` supports encryption
and the code handles both, so this is a stored value that was never rotated to
the encrypted form. Out of scope here, but worth doing.

## Tests

**1,515 passing**, up from 1,483. 32 new in `tests/followup-v2.test.mjs`
covering step ownership, every ineligibility route, the exact remaining-step
table, content rules, package shape and fingerprint, and assertions that neither
the library nor the shadow runner can send, queue, spend or write.

## Production

Commit `b7eb9ed`, pushed to `main`. The generator is not wired into any live
route in this pass, so nothing in production behaviour changes: `PREPARE_FOLLOWUP`
still runs the old path until a later pass switches it over deliberately.

## Remaining gap

**Shadow follow-up scheduling** — a Today preview of what LTB would send, and
when, before anything is allowed to send itself. Not started here.

---

`V2 SHADOW FOLLOWUPS VERIFIED — LTB CAN NOW WRITE THE RIGHT NEXT EMAIL WITHOUT SENDING IT`
