# Bloomwired Prospecting Strategy V2

A design proposal. Nothing here is implemented.

Evidence base: `FORENSIC-PROSPECTING-REPORT-5.md`, 935 reconstructed
cold-outreach conversations, 100% of Ary's historical workspace.

Where the evidence runs out, this document says so rather than filling the gap.

**Revision:** corrected 2026-08-09 against the pre-implementation review. See
[Corrections before implementation](#corrections-before-implementation).

---

## Executive strategy

V1 spent its effort in the wrong order. It researched before it knew whether
the prospect could be contacted, sent five or six cold emails when two carried
almost all the value, attached expensive assets to people who had already
ignored two emails, and asked a reasoning model to re-rank a list that code had
already ranked.

V2 inverts the order and cuts the tail.

**Five principles.**

1. **Cheap filters first.** Nothing paid happens until a free step has said this
   prospect is reachable and plausibly a fit. A prospect with no contact address
   costs zero credits and zero Claude calls.

2. **Two emails carry the business.** Population marginal reply rates are 2.9%
   and 3.0% for emails 1 and 2, then 1.2% and below forever. Everything past
   step three is a rounding error bought at full price.

3. **The close is the product.** A concrete micro-offer converts at 4.0%
   interested against 0.4% for an open question. That is the largest verified
   effect in the entire database and it costs nothing to apply.

4. **Assets are fulfillment, not decoration.** A video or PDF is what you send
   when somebody accepts an offer, not what you attach because a counter reached
   five.

5. **Ary's judgment is the best predictor we have, so capture it as early as it
   is available.** 💚 carries 19 of 21 interested replies. That rating is free.
   Research is not.

**The intended end state:** Ary opens the app once a day, reviews a short list
of prepared first emails, answers the humans who replied, and makes a handful of
judgment calls. Approved sequences follow up on their own. Everything that
produced that list already happened.

---

## Corrections before implementation

The first draft of this strategy contained contradictions that would have become
bugs. They are fixed in place rather than in a new version.

| # | Contradiction | Resolution |
|---|---|---|
| 1 | Rating governed research permission, but the rating was captured at approval, which happens after research | A rating only governs spend that has not happened yet. Unrated prospects are **provisional P2** during preparation. An approval-time rating governs follow-up length, future research, queue order and asset eligibility, and cannot undo spend already made |
| 2 | Strong required sufficient evidence, verify-site created sufficient evidence, and verify-site was gated on being Strong | New pre-Vet state: **`ELIGIBLE_FOR_VERIFICATION`**. Verification is gated on eligibility, not on Strong. Order is verify → evidence → Vet → Strong |
| 3 | Cold video was retired using pre-fix render cost numbers presented as current | Current video economics are **UNKNOWN**. The pre-fix numbers are labelled historical. The retirement decision rests on outcomes, not on cost |
| 4 | Emails 4+ were retired, then a 10% five-touch holdout reintroduced them | The open question is P1 = 2 or 3, not 3 vs 5. The holdout is now a **2-touch arm against the 3-touch default** |
| 5 | "Human approval on every send" preserved more manual work than the automation goal allows | Staged policy. Email 1 stays human. Approval authorises the whole sequence, so **routine silent follow-ups become eligible for automatic sending** behind a workspace switch that stays off in this pass |
| 6 | App owned sending, and the sweep skill also owned send policy | App is the canonical owner of send policy, window, timing and dedupe. **Region scope moves into workspace config.** The skill orchestrates, audits, recovers, and may invoke the app's send action |
| 7 | auto-prospect was reduced to a fallback, losing a real cost-saving execution layer | Two supported execution modes: **native unattended** (app calls Sonnet) and **skill-assisted** (the skill prepares the package and writes it back, no API call). Same schema, same validators, neither replaces the other |
| 8 | FIT included "can they pay", which invites inference from weak proxies | FIT is business, service-model, offer and platform fit. Ability to pay disqualifies **only on explicit evidence**. No socioeconomic guessing |
| 9 | Mandatory source provenance would have failed imports | `origin_class` required on new records, with explicit safe fallbacks. No silent inference. `UNKNOWN` stays valid for legacy and recovered rows only |
| 10 | Offer acceptance was proposed as the primary dashboard metric | It is a **leading diagnostic**. The outcome hierarchy puts attributable clients first |
| 11 | Banning the open question invited a validator that rejects question marks | Validate the **CTA class**, not punctuation. A concrete yes/no micro-offer is usually a question |
| 12 | P3 was denied "contact-discovery spend" while native discovery is free | P3 is denied **paid** provider spend, paid verification, and human effort chasing a hard-to-find address. Free native discovery still runs |
| 13 | The 90-day staleness threshold was stated as unmeasured, then written as a constant | Workspace config, default 90, recorded as a chosen policy |
| 14 | The app owned verification and the website-audit skill was "source of truth for page judgment" | App owns the default path and all canonical policy. The skill owns deep review, ambiguous interpretation, QA and methodology. It carries no second Strong or Vet policy |
| 15 | The Stage B guard said "no reply of any kind", contradicting the canonical rule that an autoresponder stops nothing | The guard asks the **canonical reply classification**, it does not define "reply" itself |
| 16 | `HELD` was defined as "Strong but no contact", but contactability is checked at step 3 and Strong at step 9 | `HELD` and `PARKED` are **pipeline states, not priority bands**, and both sit before Strong is evaluated |
| 17 | "705 prospects have had money spent researching people who cannot be emailed" | 705 is the **size of the contact-discovery backlog**, not a spend record. No per-prospect spend exists for that period |
| 18 | Migration referred to "the 740" while every other reference said 705 | One number: the standing 705 backlog, 25 processed |
| **A1** | Budget sat inside `ELIGIBLE_FOR_VERIFICATION`, so a good prospect could be **permanently PARKED** because today's allowance ran out | Eligibility is semantic only. Budget is a separate execution gate leading to `WAITING_FOR_VERIFICATION_BUDGET` |
| **A2** | P3 was said never to receive "the package", which is impossible if it receives Email 1 | P3 gets a **canonical validated package** for its one touch. No cheap side door. It is denied paid verification, paid contact work, assets, follow-ups, queue priority and chasing |
| **A3** | Bounce sent a prospect to `HELD`, which would have **erased Strong** on somebody already verified and approved | Contactability is a separate axis. Bounce sets `NEEDS_CONTACT_RECOVERY`; evidence, Vet, Strong and package history stay intact |
| **A4** | The website-audit trigger said "P1 with thin evidence", which cannot exist because P1 requires Strong and Strong requires sufficient evidence | Trigger refers to a **💚-rated pre-Strong candidate**. Rating exists before Strong; the formal band is assigned after |
| **A5** | One approval authorised follow-ups whose copy the fingerprint did not cover | The fingerprint covers **every permitted follow-up's exact copy**. Regenerated or edited copy goes stale and needs re-approval |
| **A6** | The A5 fix was implemented as a refusal to approve any package short of its band, which reads the band as a quota | ⚠️ **CORRECTED 2026-08-10.** A band is a **ceiling**: this document's own priority table says "up to 3" for P1, and `allowedTouches` is documented as how many emails a prospect may ever receive. A short package is approvable and the card states its coverage. The safeguard is unchanged and lives in the send guard, which refuses any step whose copy did not exist at approval |

---

## What changes from V1

| | V1 | V2 |
|---|---|---|
| Cold sequence | 5 planned, 6 typical | 3 for P1, 2 default, 1 for P3 |
| Email 1 close | open question | concrete micro-offer |
| Contact discovery | after research, mostly never | before any paid step |
| Research trigger | every prospect | `ELIGIBLE_FOR_VERIFICATION` only |
| Video | around email 3, cold | fulfillment of an accepted offer |
| PDF | at email 5, automatic | an artifact that was explicitly promised |
| Rating | a colour in a column | the control that sets band and forward spend |
| Strong | a Vet verdict | fit + reason + scope + evidence, all four, after verification |
| Priority | mixed into Strong | a separate axis |
| Follow-up approval | every send | the sequence is approved once |
| Send policy | split between app and skill | app only |
| Package writing | app API call | app API call **or** skill-assisted, same schema |
| Source | not recorded | `origin_class` required at intake |
| best5 ranking | a Claude call | deterministic code |
| Reply handling | fine already | unchanged, it is not the bottleneck |

---

## Prospect acquisition

Not answerable from history, and V2 does not pretend otherwise. 4,787 prospects
have no reliable recorded origin, so no source can be called a winner or a
loser.

V2 therefore does two things: it stops the bleeding, and it sets up the
measurement that makes acquisition optimisable later.

Acquisition stays manual and Apify-driven in V2. Automated sourcing is a later
phase, gated on having source outcome data, not on building a sourcing engine.

---

## Source provenance

Reuse `lib/sources.mjs`, which already separates the two things that get
confused:

- **SOURCE** is the kind of evidence a claim rests on: `POST_TEXT`, `WEBSITE`,
  `MAP_LISTING`, `AD`.
- **PROVIDER** is where the record came from.

Acquisition provenance is a third thing and needs its own field, because "we
found them on a map listing" and "the claim rests on a map listing" are
different facts that must never blur.

| Field | Example |
|---|---|
| `origin_class` | `MAP_LISTING`, `SOCIAL_POST`, `DIRECTORY`, `MANUAL`, `REFERRAL`, `REACTIVATION`, `OTHER` |
| `origin_subtype` | the actor, the directory name, the platform, the referrer |
| `origin_batch` | the import run, so a batch can be evaluated as a cohort |
| `origin_query` | the search that produced it, where one exists |
| `origin_at` | when it entered |

**Intake rule, corrected so it does not break imports:**

- Every new record carries a structured `origin_class`.
- An importer must supply one explicitly, or explicitly choose a safe fallback:
  `MANUAL` or `OTHER`. Choosing the fallback is a decision the importer records,
  not a default the system applies.
- **Source is never silently inferred from evidence type or provider.** A
  prospect whose evidence is `MAP_LISTING` did not necessarily come from a map.
- `UNKNOWN` remains valid for legacy and recovered records. It is not available
  to normal new intake.

`origin_batch` is the field that answers the coaching question honestly. Report
5 could not separate "coaches convert badly" from "one import batch was bad",
because they were the same rows. A batch id separates them permanently.

**Existing rows stay `UNKNOWN`.** They are not backfilled with guesses.

---

## Qualification

Unchanged in substance. `lib/qual-rules.mjs` already does the right thing and it
should not be reopened:

- Four states: `MATCHED`, `NOT_MATCHED`, `UNKNOWN`, `NOT_APPLICABLE`
- `UNKNOWN` never becomes zero
- Green rules never create evidence
- Rules are scoped to the source type they can actually be evaluated against
- A versioned snapshot is stored with every decision

The one V2 addition: **qualification runs before contact discovery**, so an
obvious skip does not consume a page fetch.

---

## Strong vs priority

Two different questions. V1 answered them with one number.

### Strong: may we contact this person at all

All four required. Any one missing means not Strong.

| Test | Question | Source |
|---|---|---|
| **FIT** | Are they the kind of business Bloomwired serves? | qualification + platform verdict |
| **LEGITIMATE CONTACT REASON** | Is there a specific, verifiable thing on their public presence worth writing about? | `lib/evidence.mjs` |
| **IN-SCOPE OPPORTUNITY** | Is the gap something Bloomwired actually sells? | Vet angle |
| **SUFFICIENT EVIDENCE** | Does the evidence survive the unverified-absence rules? | `lib/evidence.mjs` |

**FIT does not mean "can they pay".** The website-audit skill's tie-breaker
phrases it that way and the first draft of this document copied it. That phrasing
invites the system to guess at somebody's finances from their website, their
prices, or their neighbourhood, which is both wrong and offensive.

FIT means:

- business and audience fit
- service model fit
- offer compatibility
- geography and platform constraints where they genuinely apply

**Ability to pay is a disqualifier only on explicit evidence:** they said so,
or the entity is structurally not a buyer (a volunteer group with no services,
a closed business). It is never inferred. No proxy rules, no scoring, no
inference from site quality or price points.

Strong is a **boolean gate**, decided in code, with the qualification snapshot
version recorded. It is evaluated **after** verification, not before.

Ary's 💚 does not create any of the four. A 💚 on a prospect with no verifiable
contact reason is still not Strong.

### Priority: in what order, and how hard

Priority is an **ordering**, and it is where the rating lives.

| Band | Meaning | Cold touches | Paid research | Assets |
|---|---|---|---|---|
| **P1** | Strong + 💚 | up to 3 | yes | on accepted offer |
| **P2** | Strong, unrated or neutral | 2 | yes, if eligible | on accepted offer |
| **P3** | Strong + ✖️ | 1, no follow-up | never | never |

A prospect can be Strong and P3.

### HELD and PARKED are pipeline states, not priority bands

They sit **before** Strong is evaluated, so neither one can be described as
Strong. Keeping them out of the band table is deliberate.

| State | Meaning | Reached | Recoverable |
|---|---|---|---|
| **HELD** | Passed prescreen and remains viable, but **no safe contact is currently available**, so paid verification and outreach stop before Strong is ever evaluated | at pipeline step 3 | **yes**, when an address is found |
| **PARKED** | Not currently eligible to pursue: prescreen disqualified them, they failed *semantic* `ELIGIBLE_FOR_VERIFICATION`, or Vet returned SKIP | steps 2, 5 or 8 | sometimes, with a reason recorded |
| **WAITING_FOR_VERIFICATION_BUDGET** | Eligible and wanted, but today's allowance is spent | step 6 | **yes**, automatically |
| **STRONG** | Passed the four-part gate, **after** verification | step 9 | n/a |

A prospect can be 💚 and HELD. A 💚 rating does not make an uncontactable
prospect Strong, and neither does anything else.

### Contactability is a separate axis from qualification

A bounce after Strong must never rewind a prospect to a pre-Strong state. They
were verified, they were Strong, they were banded, they were approved, and all
of that is still true. What changed is the address.

| Contact state | Meaning |
|---|---|
| `OK` | a safe address is current |
| `NONE` | none found yet (this is what makes a prospect `HELD`) |
| `NEEDS_CONTACT_RECOVERY` | the address bounced or was invalidated **after** it worked |

On bounce: outbound stops, the contact is invalidated, and evidence, Vet
history, the Strong result and package history all remain intact. If a new safe
address is found later, the freshness, address and fingerprint checks re-run
before anything continues.

---

## Role of 💚 and ✖️

**What the evidence says.** 💚 (n=774) replies at 6.5% and is interested at 2.5%,
carrying 19 of the 21 interested replies in the database. ✖️ (n=91) replies at
23.1% but 14 of those 21 replies are declines, so a ✖️ prospect is roughly 14
times more likely to say no than to be interested. 💙 (n=36) and 🥀 (n=24)
produced **zero** interested replies between them.

**What the rating may do:** set the priority band, set allowed touches, permit
or forbid paid research **from that point forward**, order the approval queue,
gate asset eligibility, and later inform sourcing.

**What the rating may never do:** create evidence, satisfy any of the four
Strong tests, justify contacting somebody there is no verifiable reason to
contact, or override an unverified-absence rule.

That boundary is the same one `lib/qual-rules.mjs` already draws for green
rules, and for the same reason: a judgment is not an observation.

### When the rating exists, and what it can still govern

The first draft was circular: it let the rating control research permission
while capturing the rating at approval, which happens after research. Corrected:

| Rating state at preparation time | Band used | Paid research |
|---|---|---|
| Already 💚 | P1 | permitted |
| Already ✖️ | P3 | **prohibited** |
| Already 💙 or 🥀 | P2 | permitted if eligible |
| **Unrated** | **provisional P2** | permitted if eligible |

At approval, Ary applies or changes the rating. That rating governs, from that
moment forward:

- allowed follow-up length
- whether future research may be bought on this prospect
- queue priority
- asset eligibility

**It cannot retroactively prevent research that already happened.** An
approval-time ✖️ does not refund the probe. It stops the next one.

### If Ary wants the rating to govern pre-research spend

That requires a separate, earlier rating surface, and this document will not
pretend approval-time rating can do it.

**Optional, not recommended for phase one: a triage lane.** A fast list of newly
prescreened, contactable prospects, shown before the nightly research run, where
Ary marks 💚 or ✖️ in bulk on name, niche, site and one signal line.

The tradeoff is explicit: it buys cheaper research by spending Ary's attention
daily, which is the resource V2 exists to protect. It is worth building only if
the measured research spend on prospects later marked ✖️ turns out to be large.
That number does not exist yet. Recorded as an open question, not a plan.

---

## Contact discovery

V1 had no ordering rule here, so contactability was resolved late or not at all.
**705 💚 prospects in the standing backlog have a website but still need contact
discovery.** Contactability should be resolved before any future paid
verification is allowed.

> The 705 is the size of the contact-discovery backlog. It is **not** a claim
> that paid research was spent on all of them. Forensic work found research was
> barely run in the old workflow, and no per-prospect spend record exists for
> that period.

**Free native discovery runs for everyone who passed prescreen**, including P3.
It costs nothing but a page fetch that signals needs anyway.

**What P3 is denied is spend, not discovery:**

| | P3 |
|---|---|
| Free native discovery on their own site | yes, it is free |
| Paid contact provider | **never** |
| Paid verification or research | **never** |
| Human or API effort chasing a hard-to-find address | **never** |
| One touch if a safe address already exists | yes |
| If no address is found cheaply | HELD, do not chase |

**Ownership classification stays exactly as built**
(`lib/contact-discovery.mjs`):

| Association | Meaning | Usable |
|---|---|---|
| `SAME_DOMAIN` | address matches the site's own domain | yes |
| `OWNER_EXTERNAL` | a Gmail-style address the page presents as theirs | yes, only with page context |
| `THIRD_PARTY` | a designer, a vendor, a template default | **never** |
| `UNKNOWN` | cannot tell | never as primary |

This model already caught four wrong addresses in the pilot, including a
template default and a font vendor. It does not get relaxed to improve coverage.

**No paid contact provider in V2.** Apify, Hunter and Prospeo stay off the table
until free native recovery has run across the full 💚 backlog and its yield is
measured. Only 25 of 705 have been processed.

---

## The pipeline

```
1  INTAKE              origin_class required                free
2  PRESCREEN           dead address, platform, obvious skip free   code
3  CONTACT DISCOVERY   free, the business's own site        free   code
   └─ nothing found → HELD. No paid step ever runs.
4  SIGNALS             evidence from the SAME fetch         free   code
5  ELIGIBILITY         ELIGIBLE_FOR_VERIFICATION? (semantic) free  code
   └─ not eligible → PARKED, with a recorded reason
5b BUDGET GATE         allowance left today?                free   code
   └─ no → WAITING_FOR_VERIFICATION_BUDGET, retried later
6  VERIFY-SITE         the deep probe                       PAID
7  EVIDENCE            tier + sufficiency                   free   code
8  VET                 STRONG / MAYBE / SKIP                free   code
9  STRONG GATE         the four tests                       free   code
10 PRIORITY BAND       existing rating, else provisional P2 free   code
11 PREPARE PACKAGE     native Sonnet 5  OR  skill-assisted
12 APPROVE             Ary: Email 1, length, follow-up policy, rating
13 SEND                native Gmail, app-owned
```

Steps 3 and 4 share one page fetch. Today they are separate, which is both
slower and ruder to small business websites.

### `ELIGIBLE_FOR_VERIFICATION`

The state that breaks the circularity. Verification is what creates sufficient
evidence, so it cannot be gated on already having it.

This is a **semantic policy decision**: is this prospect allowed and appropriate
to verify. It says nothing about whether there is money left today.

A prospect is eligible when **all** of the following hold:

- prescreen did not disqualify them
- a safe contact exists
- workspace fit is plausible
- there is at least a candidate contact reason, or thin evidence worth verifying
- paid verification is permitted for them under policy
- they are not a known ✖️, where paid verification is prohibited

### Budget is a separate execution gate, and never a judgment

```
ELIGIBLE_FOR_VERIFICATION
        ↓
  budget available?
        ├─ yes → VERIFY-SITE
        └─ no  → WAITING_FOR_VERIFICATION_BUDGET   (queued, retried later)
```

> ⚠️ **Budget exhaustion is not PARKED, not SKIP, and not a negative judgment
> about the prospect.** A good prospect must never be permanently parked because
> today's daily allowance happened to run out. It waits, and verification runs
> when budget returns.

Then, and only then: **verification → evidence sufficiency → Vet →
Strong / MAYBE / SKIP.**

Failing *semantic* eligibility is a real state with a recorded reason, and it
parks the prospect. Running out of budget is not failing eligibility.

---

## Research and evidence

Evidence rules do not change. Three tiers (`MANUAL`, `VERIFIED`, `INFERRED`),
four sufficiency levels (`none`, `thin`, `sufficient`, `strong`), and the
unverified-absence rules stay authoritative.

**When research is bought:**

| Prospect state | Deep probe |
|---|---|
| No contact (`HELD`) | never |
| Not `ELIGIBLE_FOR_VERIFICATION` | never |
| Known ✖️ (P3) | never |
| Known 💚 (P1), eligible | yes |
| Eligible, evidence already `sufficient` | no, reuse |
| Eligible, evidence `thin` | yes |
| Unrated and eligible | yes, as provisional P2 |
| Eligible, but today's budget is spent | **wait** in `WAITING_FOR_VERIFICATION_BUDGET`. Not parked, not skipped |

Plus the existing 14-day `site_intel` reuse, which already removes repeat cost.

### Evidence staleness is configuration, not a constant

Evidence older than the staleness threshold at the moment a follow-up is due
pauses the package and flags it for re-verification, rather than sending a claim
about a page that may have changed.

| | |
|---|---|
| Setting | `evidence_stale_days`, workspace config |
| Default | **90** |
| Basis | **chosen, not measured.** No evidence exists about how fast these pages change |
| Change cost | a config edit, no migration |

Recorded this way deliberately, so that nobody in six months reads `90` as a
finding.

---

## Vet

Vet keeps its three verdicts (`STRONG`, `MAYBE`, `SKIP`) and its current logic,
including the manual-scheduling-control correction recovered from the
website-audit skill.

**V2 does not redefine Strong from outcomes, because there are no Vet outcomes
yet.** Vet has run for days, not months. Any outcome-optimised Strong definition
written today would be invented.

What V2 adds is the four-test framing above, the correct position in the
pipeline (after verification), and the recording of Vet state and version on
every send so that in six months this stops being unanswerable.

`MAYBE` remains a human queue.

---

## Pick

Pick becomes purely deterministic and stops being a Claude call.

1. P1 before P2 before P3
2. Within a band: evidence sufficiency, strongest first
3. Then contact confidence
4. Then age, oldest first, so nothing rots at the bottom

`best5` today asks Sonnet to re-rank a list `lib/pick.mjs` has already ranked.
That is paying for an opinion about an order the code produced. It becomes a
view, with a rare manual escalation when Ary wants a second read.

---

## Email strategy

One structural change and one copy change.

**Structural:** the sequence has an allowed length that the app owns, derived
from the priority band, and every sender reads it rather than assuming five.

**Copy:** every cold email closes on a concrete micro-offer.

---

## Sequence by priority

### The recommended policy

| Band | Cold touches | Spacing |
|---|---|---|
| **P1 (Strong + 💚)** | 3 | day 0, day 4, day 10 |
| **P2 (Strong, unrated/neutral)** | 2 | day 0, day 4 |
| **P3 (Strong + ✖️)** | 1 | day 0 |

`HELD` and `PARKED` are not bands and receive nothing. They never reach this
table, because they stop before Strong is evaluated.

Spacing comes from V1 practice, not from evidence. Report 5 measured which step
produced replies, not which interval did. Stated as a choice, not a finding.

### The tradeoff, honestly

Applied to the historical population this policy avoids roughly **1,670 emails**
and loses the **4 interested replies** that arrived at steps 4 and beyond.

A flat "stop after 3 for everyone" avoids 1,642 and loses the same 4.

**The segmented policy and the flat policy are nearly identical in email
volume.** That is not a flaw in the design, it is a fact about the population:
💚 is 83% of it, so a 💚-shaped rule is a population-shaped rule.

The segmentation earns its place somewhere else. What P3 and HELD prospects
never receive is the expensive part: the deep probe, paid contact recovery, the
asset, the follow-ups, and a place ahead of a P1 in Ary's approval queue.

**A P3 that does send still gets a canonical package.** If it is Strong, has a
safe address, and Ary chooses to send its one allowed touch, that email goes
through the same package schema, the same validators and the same send path as
every other email. There is no cheap side door. Skill-assisted mode can avoid
the Sonnet call, but the resulting Email 1 still enters through the canonical
package validator.

Stated plainly so it is not oversold: **the segmentation is an effort-allocation
policy, not an email-volume policy.**

### Why not stop at 2 for everyone

Stopping at 2 avoids 2,384 emails and loses 5 interested replies, which is
better value per email than stopping at 3 (477 emails saved per interested reply
preserved, against 410).

It is rejected for one reason: 5 of 21 interested replies is a quarter of the
entire interested population of this business, and at 21 replies a year the
absolute numbers are small enough that being wrong is expensive and slow to
detect. Three for the band that produces almost all the interest is the more
recoverable mistake.

This is a judgment about risk, not a finding, and it is exactly what the
prospective 2-vs-3 experiment exists to settle.

### Why emails 4 and beyond are gone

Emails 4, 5 and 6+ cost roughly 1,457 sends between them and produced 4
interested replies at marginal rates of 0.6%, 1.0% and 1.2%, against a 7.9%
population baseline. They stay available as a **manual override** on a specific
prospect Ary chooses. They never run as routine automation again, and no
experiment reintroduces them.

### Stop conditions

The sequence halts on any of:

| Condition | Result |
|---|---|
| Human reply of any kind | stop, classify, route |
| Decline | stop, close, record |
| Unsubscribe or DNC | hard stop, permanent |
| Deferral | stop, set `deferred_until` |
| Bounce or invalid address | stop outbound, invalidate the **contact**, enter `NEEDS_CONTACT_RECOVERY`. **Evidence, Vet, Strong and package history are untouched** |
| Allowed length reached | stop, mark exhausted |
| Evidence older than `evidence_stale_days` | pause, flag for re-verification |
| Contact address changed since approval | pause, re-approve before sending |
| Package fingerprint no longer valid | pause, re-approve |
| Ary's manual stop | stop |

An autoresponder is **not** a reply and does not stop anything. That rule
already exists in `lib/gmail-backfill.mjs` and should be the shared one.

---

## CTA strategy

Principles, not a sentence to paste.

**A concrete micro-offer has four parts.**

1. **One specific thing, actually seen.** Named plainly enough that they know
   you looked. Sarah's subject line named one thing on her homepage.
2. **A small, specific offer to hand something over.** Not help, not a call, not
   a chat. A thing.
3. **Small enough to be believable.** If it would take more than about ten
   minutes to produce, it reads as a sales meeting in disguise.
4. **An escape hatch.** "If that's already handled, ignore me." Already in Ary's
   voice rules, and it belongs in every cold email.

**Shapes that qualify:** offer to send the specific thing you noticed, offer to
show what you mean, offer a short rundown of one thing, offer a concrete next
artifact by name.

### Validate the class, not the punctuation

The banned thing is the **open question as a closer**, not the question mark.

"Want me to send you what I mean?" is a concrete micro-offer and it is a
question. So were both of Sarah's closes. A validator that rejects a final
sentence containing `?` would reject the highest-performing CTA in the database.

| Class | Test | Default |
|---|---|---|
| `MICRO_OFFER` | names a specific deliverable and asks for a yes or no on receiving it | **the default close** |
| `OPEN_QUESTION` | asks them to describe, explain, reflect, or do the thinking | not the default |
| `OTHER` | anything else | logged, not blocked |

0.4% interested for `OPEN_QUESTION` against 4.0% for `MICRO_OFFER`, n=625.
`OPEN_QUESTION` is a fine sentence in the middle of an email.

**What the micro-offer is not:** a promise of a video or a PDF specifically. The
offer names an outcome. The asset ladder decides the smallest form that
satisfies it.

The offer made is **recorded at send time**, so fulfillment is a lookup rather
than a guess.

---

## Follow-up timing

Day 0, day 4, day 10. Business days, inside the app-owned send window, region
scope read from workspace config.

Report 5 measured steps, not intervals, so this is inherited practice. Record
the interval on every send so it becomes answerable later, which costs nothing.

Follow-ups are subject to every stop condition above, and to the pre-send guard
already enforced by `canProgressOutbound()`: **a follow-up sent on top of an
unanswered reply is the worst email we can send.**

---

## Video strategy

### Historical, pre-fix. Not current economics.

465 recipients, 12 replies (2.6%), 3 interested (0.6%), **zero attributed
clients.** Confounded, because videos went out around email 3 and early repliers
never received one. Video is not proven to hurt.

The render cost figures from `AI-COST-MODEL.md` ($0.134 at p50, $0.257 at p90,
14% timeout rate) were measured **before** the timeout, audio-reuse and
duplicate fixes.

> ⚠️ **Current video economics are UNKNOWN.** There has been no clean render
> sample since those fixes landed. The old numbers describe a pipeline that no
> longer exists and must not be quoted as current cost.

### The decision rests on outcomes, not cost

**Retire cold video.** Video becomes fulfillment.

| Trigger | Allowed |
|---|---|
| Prospect accepted an offer where a video is the smallest useful form | yes |
| Ary requests one on a specific prospect | yes |
| Reached email 3 | **no** |
| Prospect is 💚 | **no** |
| Anything automatic before a human reply | **no** |

The justification: 465 cold videos produced no attributed client and no reply
rate above the 7.9% population baseline. That is an outcome argument and it
stands on its own. Cost re-enters the conversation when there is a clean
post-fix sample to measure, and a repricing decision should wait for the same
sample.

**When video earns its place.** When the finding is genuinely visual and cannot
be written in a paragraph: a broken flow, a form that fails, a booking path that
dead-ends. If the finding can be written down, write it down.

---

## PDF strategy

**Historical:** 607 recipients, 3.6% replied, 0.7% interested, no client
attribution. Same confound.

**"Reached email 5" stops being a trigger,** and under a 3-email maximum it
could not fire anyway.

| Trigger | Allowed |
|---|---|
| An artifact was explicitly promised and accepted | yes |
| Ary requests one | yes |
| A high-value prospect where the finding needs a layout | yes, with approval |
| A sequence step | **no** |

**Default to plain text.** If the whole finding fits in an email, the PDF adds a
download step between the prospect and the point.

---

## Asset after reply

**Recommended. This is the change that ties the CTA finding and the asset
finding together.**

```
COLD EMAIL   "I noticed X. Want me to send you what I mean?"
                        ↓
PROSPECT     "Yes."
                        ↓
APP          look up the promise recorded at send time
             pick the SMALLEST form that satisfies it
                        ↓
FULFILLMENT  plain text  →  written rundown  →  PDF  →  video  →  live audit
```

**Stop at the first rung that satisfies what was promised.**

| Rung | Use when |
|---|---|
| Plain text | the finding is one or two points |
| Written rundown | several related points, still readable in an email |
| PDF | it needs layout, or they will forward it internally |
| Video | the finding is genuinely visual |
| Live audit | they asked for a call |

**Why this is the right model.** It turns both assets from cold decorations into
fulfillment of something a person asked for, moves the spend to after the reply
where the population data says the value is, and makes the micro-offer honest:
the email promises a specific thing, and the system knows what was promised
because it recorded it.

**The ladder choice is deterministic code.** The writing inside it is Sonnet, or
the skill in skill-assisted mode. Choosing which rung does not need a reasoning
model.

---

## Reply handling

Median response time is 24 minutes and 70% are answered within the hour. **This
is not a problem and V2 must not build a solution to it.**

1. **Stop the cold sequence immediately.** Already built and proven in
   production.
2. **Classify the reply.** Haiku, fixed label list. Highest-volume Claude call in
   V2 and the one most worth keeping cheap.
3. **Route it:**

| Class | Route |
|---|---|
| Interested | to Ary, with full thread context and the offer that was accepted |
| Ambiguous | to Ary, flagged ambiguous, never auto-classified into a lane |
| Decline | close the record, log the reason, no further contact |
| Unsubscribe / DNC | hard stop, permanent, workspace-wide |
| Defer | structured deferral |
| Autoresponder | ignore, sequence continues |

4. **Preserve context.** Full thread available at the moment she answers.
5. **Suggest a next action.** A suggestion, never a send.

**Ary handles every interested and ambiguous conversation herself.** That is not
a limitation of the automation, it is the job the automation exists to protect.

---

## Deferrals and reactivation

| Field | Purpose |
|---|---|
| `deferred_until` | the date, absolute, Pacific |
| `deferral_reason` | their words, quoted, not paraphrased |
| `deferral_promise` | what Ary said she would do |
| `deferral_context` | the thread, so the next email is not a cold restart |
| `deferral_source` | reply classification, or Ary |

**Resurfacing.** On the due date the prospect appears in Today as its own item,
with the quoted reason and the promise visible. It does not rejoin the cold
queue, because it is not cold.

**Nothing sends automatically.** A reactivation email refers to a specific past
conversation, and getting that wrong is worse than being late. This is a
deliberate exception to the staged automation policy below, because reactivation
is not repetitive.

**Due now:** Kori Burkholder, Greg Lock (Riddlock PT), Irina Ertel, Jane Lee
(Positive Boundaries).

Kori is worth naming separately: `emails_sent` reads 0 and the mailbox holds 6
outbound messages. Any reactivation must read recovered chronology, not the
counter.

---

## Staged send automation

The first draft kept human approval on every send. That preserves more manual
work than the automation goal allows, and it approves the same decision
repeatedly.

**The safety boundary that matters is entering a new cold conversation, not
continuing an approved one.**

### Stage A: today

Every send human-approved. `AUTO_SEND_FIRST` off, `AUTO_SEND_FOLLOWUPS` off.

### Stage B: the V2 target

**Email 1 stays human.** At approval, Ary approves the whole sequence at once:

- the exact text of Email 1
- **the exact prepared copy of every follow-up the sequence is permitted to
  send**
- the allowed sequence length
- the follow-up schedule and policy for this prospect
- the rating and therefore the band

### The fingerprint must cover every email that may auto-send

A follow-up is only eligible for Stage B if **that exact copy already existed in
the approved package and is covered by the approval fingerprint.** The
fingerprint covers, at minimum:

- the exact Email 1 subject and body
- **the exact subject and body of every permitted follow-up step**
- the allowed sequence length
- the follow-up schedule and policy
- prospect and contact identity
- the evidence hash and workspace context hash
- the rating and band policy inputs
- playbook, playbook version and generator version

> ⚠️ **If any follow-up copy is regenerated, edited, or newly created after
> approval, the fingerprint goes stale and that copy requires re-approval before
> it can send.** Copy Ary never read must never go out under an approval she gave
> for something else. This is the actual human safety boundary, and it is what
> makes the rest of Stage B safe to automate.

**Routine silent follow-ups become eligible for automatic sending.** Every one of
these must hold at execution time, checked by `canSendNow()` in
`lib/send-guard.mjs`, not at approval time:

- [ ] no **human reply that stops progression**, per the canonical reply
      classification and `canProgressOutbound()` semantics. An autoresponder or
      out-of-office does not count as a stopping reply. **The guard does not
      define "reply" itself, it asks the canonical rule**
- [ ] no unsubscribe or DNC
- [ ] no decline
- [ ] no deferral
- [ ] contact address unchanged since approval
- [ ] evidence not stale per `evidence_stale_days`
- [ ] inside the send window for the prospect's region
- [ ] approval fingerprint still valid, meaning the package has not changed
- [ ] pre-send guard passes
- [ ] daily send cap not exceeded
- [ ] `AUTO_SEND_FOLLOWUPS` enabled for the workspace

Any single failure holds the send and surfaces it. It never downgrades to
sending anyway.

**Interested and ambiguous replies remain human. Always.**

### Stage C: not proposed

Automatic first sends to new cold prospects. Not in V2, not designed here.

### Migration path

1. Ship the guard and the fingerprint check with the switch **off**.
2. Run in shadow: log what would have sent, and what would have blocked it.
3. Review a period of shadow output with Ary. Any unexpected block is a bug to
   fix before enabling, not a reason to relax the guard.
4. Ary enables `AUTO_SEND_FOLLOWUPS` herself. Nobody else, and not as a side
   effect of a deploy.

**Not enabled in this pass.** Both switches stay off. This section designs the
policy and the path, nothing more.

---

## Daily automation loop

```
NIGHTLY
  ├─ intake: new prospects, origin_class required
  ├─ prescreen                  free, code
  ├─ contact discovery          free, code       → HELD stops here
  ├─ signals                    free, same fetch
  ├─ eligibility                free, code
  ├─ verify-site                paid, budget-gated, eligible only, 14-day reuse
  ├─ evidence + vet + strong    free, code
  ├─ priority band              free, code
  └─ prepare packages           native Sonnet OR skill-assisted, daily cap

CONTINUOUS
  ├─ Gmail push → reply ingestion → stop sequence → classify → route
  └─ send queue: approved packages, inside the send window
       ├─ Email 1: only after human approval
       └─ follow-ups: guard-checked, Stage B, switch off for now

DAILY
  ├─ follow-up sweep: due, allowed length, stop conditions, evidence age
  ├─ deferrals due today → Today
  └─ measurement rollup
```

**Budget knobs stay as they are:** Auto-Vet 160/day, draft cap 10/day,
`AUTO_SEND_FIRST` off, `AUTO_SEND_FOLLOWUPS` off.

---

## Human responsibilities

**What Ary does:**

- reviews and approves Email 1, applying 💚 or ✖️ as she goes
- answers interested and ambiguous replies
- makes judgment calls on `MAYBE` prospects
- sends reactivation emails
- decides when to override a sequence length on a specific prospect

**What Ary stops doing:**

- approving follow-ups she already authorised when she approved the sequence
- deciding how many emails a prospect gets
- hunting for email addresses on websites
- remembering which prospects are due
- deciding whether to make a video or a PDF
- tracking what she promised somebody three weeks ago
- checking whether a follow-up would land on top of an unanswered reply
- keeping the sequence position in her head

---

## App vs skill vs API vs human ownership

**The app is the source of truth and the owner of policy.** Skills orchestrate,
execute, deep-review and recover, reading app state rather than restating it.
Two prospecting brains is the failure mode this section exists to prevent.

| Step | Owner |
|---|---|
| Intake, source provenance | **APP** |
| Prescreen, dead-address, platform | **APP** |
| Contact discovery, ownership classification | **APP** |
| Signals extraction | **APP** |
| `ELIGIBLE_FOR_VERIFICATION` | **APP** |
| Deep site probe | **APP** (render service) |
| Evidence tiers and sufficiency | **APP** |
| Vet verdict, Strong gate | **APP** |
| Priority band | **APP** |
| Sequence length, spacing, stop conditions | **APP** |
| **Send eligibility, send window, timezone and region policy** | **APP** |
| Package fingerprint, dedupe, Gmail send, reconciliation | **APP** |
| Asset ladder choice | **APP** |
| Writing outreach copy | **CLAUDE (Sonnet 5)** or **SKILL** (see modes) |
| Reply classification | **CLAUDE (Haiku)** |
| Verification ladder, ambiguous page interpretation | **SKILL** |
| Deep review of exceptional prospects | **SKILL** |
| Outside-app contact recovery | **SKILL** |
| Batch orchestration of app steps | **SKILL** |
| Voice, prices, offer names, region scope values | **WORKSPACE CONFIG** |
| Rating 💚 / ✖️ | **HUMAN** |
| Interested and ambiguous replies | **HUMAN** |
| Approval of Email 1 and the sequence | **HUMAN** |
| Reactivation sends | **HUMAN** |

**Region scope moves out of the skill.** It was the last piece of send policy
living in two places. Its values become workspace config; the skill reads them.

---

## Two execution modes

Skills are not a fallback. They are a **cost-saving execution layer**, and V2
supports both paths as first-class.

| | Native unattended | Skill-assisted |
|---|---|---|
| Who prepares the package | the app, calling Sonnet 5 | the skill, in Cowork/Claude |
| Anthropic API spend | yes | **none** |
| Runs with nobody present | yes, on the cron | no |
| Best for | overnight throughput | batches Ary runs, deep-review cases |
| Output | canonical package schema | **the same canonical package schema** |
| Validation | the same validators | the same validators |
| Writes back via | internal | the canonical write-back endpoint |

**Both modes are valid and neither replaces the other.** Native buys attention
back; skill-assisted buys API dollars back. The app must not care which produced
a package, and a package must be indistinguishable at rest apart from a
`prepared_by` field for measurement.

The rule that makes this safe: **a package is only ever accepted through the
canonical write-back path, and it is validated identically regardless of who
wrote it.**

---

## Claude API cost strategy

**Principle: optimise the number of calls before the model.** Input is tiny,
output dominates, and prompt caching does nothing at these prompt sizes.

The largest structural win: **a prospect that fails prescreen, has no contact
address, or is not eligible for verification costs zero Claude calls.**

### Every current call, classified

| Task | Tier now | V2 verdict | Reasoning |
|---|---|---|---|
| `score` | Haiku | **KEEP, fewer calls** | Only prospects that passed prescreen and have a contact. Batch candidate |
| `classify-reply` | Haiku | **KEEP** | Highest volume in V2 and correctly cheap |
| `phrases` | Haiku | **KEEP** | Low volume |
| `voice-note` | Haiku | **KEEP** | Extraction against a schema |
| `draft` | Sonnet | **KEEP at Sonnet, fewer calls** | The product. Only for Strong, contactable, banded prospects, and now 2 or 3 emails instead of 5. Skippable entirely in skill-assisted mode |
| `reply-coach` | Sonnet | **KEEP, rare** | Interested and ambiguous only, about 21 a year |
| `call-prep` | Sonnet | **KEEP, rare** | Post-interest only |
| `proposal` | Sonnet | **KEEP, rare** | Post-interest only |
| `best5` | Sonnet | **REPLACE WITH CODE** | `lib/pick.mjs` already ranks. Paying a model to re-rank a ranked list buys an opinion, not an answer |
| `objections` | Sonnet | **RARE ESCALATION** | Monthly at most, never per prospect |
| `analyze` | Sonnet | **CONSOLIDATE** | Fold into the deterministic measurement view; escalate only for questions it cannot answer |
| `content-scripts` | Sonnet | **KEEP** | Out of prospecting scope |

### New work that must not become a Claude call

| Temptation | Answer |
|---|---|
| "Let a model decide the sequence length" | Code. A band lookup |
| "Let a model classify contact ownership" | Code, already built and tested |
| "Let a model pick the asset" | Code. A ladder |
| "Let a model decide if a prospect is Strong" | Code. Four boolean tests |
| "Let a model decide eligibility for verification" | Code. Six boolean tests |
| "Let a model choose the priority order" | Code |
| "Let a model summarise the day" | Code. A query |

### Where Sonnet 5 stays, without apology

Writing cold outreach in Ary's voice, coaching a reply, preparing a call, and
writing a proposal. Downgrading these to save fractions of a cent optimises the
wrong term. Skill-assisted mode removes the call entirely without lowering
quality, which is the better lever.

---

## Skill migration

Every skill already opens with "inside the app, the Hive wins". V2 extends that:
**inside the app, the app owns policy.** A skill that carries its own sequence
length, send window, asset trigger or qualification rule is a second brain.

Ownership of policy is not the same as usefulness. Skills keep real work.

### auto-prospect

| | |
|---|---|
| **Current role** | The prospect lifecycle engine. PRESCREEN rates New rows and finds emails; FULL audits, writes a 5-email sequence, generates the PDF, sets a video verdict, sends Email 1 |
| **V2 role** | **Batch orchestrator and skill-assisted package preparer.** A first-class execution mode, not a fallback |
| **What changes** | Reads allowed length from the record instead of assuming five. No PDF generation. No video verdict. No automatic Email 1 send. Invokes the app's deterministic steps rather than reimplementing them. Uses website-audit methodology only where app policy says deep review is warranted |
| **Reads** | prospect record, priority band, allowed touches, contact state and association, evidence and sufficiency, Vet state, the promise field, workspace voice and offer |
| **May decide** | which pages to look at, whether a page supports a finding, what to write, which addresses are worth trying, how to batch its own work |
| **Must not duplicate** | sequence length, send window, region scope, asset eligibility, qualification rules, contact ownership classification, Strong, Vet, priority |
| **Writes back** | through the canonical package endpoint, validated identically to a native package |

### website-audit

| | |
|---|---|
| **Current role** | Source of truth for audit protocol, verification ladder, DEAD check, platform rules, niche notes, video tiers, voice, pricing |
| **V2 role** | **Deep and exceptional review, ambiguous page interpretation, manual QA, methodology reference** |
| **Boundary** | The **app** owns the default path: deterministic browser and render checks, evidence storage, sufficiency, verification results, Vet policy, Strong. The **skill** owns the cases the default path cannot settle |
| **Trigger** | A **💚-rated candidate** with thin evidence (pre-Strong, so not yet P1), an `ELIGIBLE_FOR_VERIFICATION` candidate needing deep interpretation, a `MAYBE` or otherwise ambiguous case, a QA pass, or Ary asking |
| **Must not carry** | a second canonical Strong or Vet policy. It reads `lib/qualify.mjs`, `lib/evidence.mjs` and `lib/vet.mjs` rather than restating them |

### daily-followup-sweep

| | |
|---|---|
| **Current role** | Sends Emails 2 to 5 by region scope, runs the VIDTEST A/B |
| **V2 role** | **Queue orchestrator, auditor and recovery path.** Not an independent sender |
| **What changes** | The app becomes the canonical owner of allowed length, send eligibility, send window, timezone and region policy, stop conditions, fingerprint, dedupe, the Gmail send and reconciliation. Region scope values move to workspace config. The VIDTEST is retired with cold video. "Email 5 means PDF" is deleted |
| **May** | orchestrate and check queues, audit what is due, perform manual or outside-app recovery, surface mismatches between the app and the mailbox, and **invoke the app's canonical send action** where permitted |
| **Must not** | carry a second region, timing or sequence policy, or send outside the app's send action |

### prospect-pdf

| | |
|---|---|
| **Current role** | The Email 5 one-pager |
| **V2 role** | Fulfillment artifact |
| **New trigger** | An artifact was explicitly promised and accepted, or Ary requests one. Never a sequence step |
| **Must not duplicate** | the asset ladder decision, which is the app's |

### daily-reply-sync

| | |
|---|---|
| **Current role** | Inbox to tracker: classifies replies, updates stage, drafts responses |
| **V2 role** | **QA, manual recovery, and outside-app workflow only** |
| **What changes** | Native Gmail is primary and proven. The skill stops being the ingestion path. It keeps the classification vocabulary as the shared specification and remains the way to reconcile or replay |
| **Must not** | rebuild Gmail ingestion |

---

## Data to capture going forward

Every send records, at send time, in one row:

| Field | Why |
|---|---|
| `origin_class`, `origin_subtype`, `origin_batch` | makes acquisition answerable |
| `rating_at_send`, `rating_source` | which rating governed, and whether it was pre-existing or applied at approval |
| `priority_band`, `band_was_provisional` | what policy actually applied, and whether it was a guess |
| `evidence_type`, `evidence_sufficiency`, `evidence_age_days` | separates strong claims from thin ones |
| `verification_state` | eligible, verified, reused, skipped |
| `vet_state`, `vet_version` | makes Strong answerable in six months |
| `qualification_snapshot_version` | which rules were in force |
| `playbook` | which angle |
| `cta_class` | `MICRO_OFFER`, `OPEN_QUESTION`, `OTHER` |
| `promise_made` | what was actually offered, for fulfillment |
| `sequence_step`, `allowed_length` | the counterfactual without a mailbox backfill |
| `interval_days` | makes spacing answerable |
| `asset` | none, text, rundown, pdf, video |
| `sent_at`, `send_window`, `region_scope` | timing |
| `sent_by` | human-approved, or auto follow-up under Stage B |
| `prepared_by` | native, or skill-assisted |
| `approval_fingerprint` | what a human authorised |
| `cost_usd` | per-prospect economics |

Reply side: `replied_at`, `reply_class`, `interested`, `declined`, `deferred`,
`first_reply_step`, `offer_accepted`, `client_attributed_at`.

**Rules for the analysis that follows:**

- Always show n
- Never state a rate without its denominator
- Never claim causality from a rate difference
- `UNKNOWN` stays `UNKNOWN`
- A withdrawn finding does not return without new evidence

That last one is the lesson of five forensic reports. Three withdrawn claims,
all from the same mistake: a number trusted before the thing producing it was
checked.

---

## Outcome hierarchy

Offer acceptance learns fast, which makes it useful and makes it dangerous. A
system optimised for "yes, send it" will produce more of those and fewer
clients.

**Ranked, and this order is the one that governs:**

1. **Prospecting-attributable clients** ← the objective
2. Interested replies and qualified opportunities
3. Accepted micro-offers ← *leading diagnostic only*
4. Human replies
5. Delivery and open operational metrics

Offer acceptance is reported as a **leading diagnostic**, always alongside what
share of accepted offers became an interested conversation. If acceptance rises
and that share falls, the offer got vaguer, not better.

Nothing below line 2 is ever a target on its own.

---

## Experiments

**A warning first.** At a 7.9% reply rate and roughly 21 interested replies a
year, most A/B tests in this business will never reach significance. Designing
experiments that cannot conclude is a way to feel rigorous while learning
nothing.

### 1. P1 sequence length: 2 against 3

The genuinely open question, and the one this document made a risk judgment on.

| | |
|---|---|
| Default arm | P1 at **3** touches |
| Holdout arm | a small randomised share of P1 at **2** touches |
| Measures | incremental value of Email 3, prospectively, on real denominators |
| Reports | n and uncertainty, every time. No point estimate without both |

**No five-touch arm.** Emails 4+ were measured on the full population at 0.6% to
1.2% marginal against a 7.9% baseline, across 1,457 sends for 4 interested
replies. Re-running them as an experiment would spend real emails on real people
to re-measure something already answered, and it directly contradicts the goal of
reducing unnecessary outreach. If that decision is ever revisited it needs a new
argument, not a holdout.

### 2. Offer acceptance by CTA shape

Measured by shape (send the thing, show the thing, short rundown, named
artifact) and by band. Produces an event on every send, so n grows in weeks
rather than years.

**Reported as a diagnostic**, always paired with the share of accepted offers
that became interested conversations.

### 3. Source cohort performance

Not an experiment, a rollup. Once `origin_batch` exists, every import becomes a
cohort with its own reply, interested and decline rates. After roughly six
months this answers the acquisition questions Report 5 had to leave open.

**Not recommended:** a video A/B. The volume needed to detect a difference at a
0.6% interested rate is far beyond what this business sends.

---

## Migration from the current system

| Phase | Work | Why in this position |
|---|---|---|
| **1** | CTA class change: replace the open-question close, add class tagging | Largest verified effect, near-zero cost, no schema change |
| **2** | Allowed length owned by the app; sweep reads it; retire the VIDTEST | Stops the biggest volume waste |
| **3** | Contact discovery gate before paid steps; work the standing 705 backlog (25 done) | Resolves contactability before any future paid verification |
| **4** | `ELIGIBLE_FOR_VERIFICATION`; reorder verify → evidence → Vet → Strong | Removes the circular dependency before anything depends on it |
| **5** | Priority band, provisional P2, rating at approval | Makes 2 to 4 band-aware |
| **6** | Asset ladder + promise field; retire cold video and step-5 PDF | Moves asset spend behind a reply |
| **7** | Send policy consolidation: region scope to config, app owns the window | Removes the second send brain before automating sends |
| **8** | Stage B follow-up automation, shipped with the switch off, in shadow | Cannot ship before 7 |
| **9** | `origin_class` at intake with explicit fallbacks | Starts the learning clock |
| **10** | Structured deferrals and resurfacing | Recovers the four due now |
| **11** | Canonical package write-back endpoint + validators; skill-assisted mode | Both execution modes become first-class |
| **12** | `best5` to code; `analyze` consolidated | Cost cleanup |
| **13** | Skill repack against the new ownership boundaries | Last, so it repacks against settled policy |

**No data migration.** Historical rows keep their `UNKNOWN` source and their
unreliable `emails_sent`. `legacy_messages` is the better record and it already
exists. Rewriting legacy state to make it agree is the habit that produced two
withdrawn findings.

---

## What NOT to build

- Automatic **first** sends to new cold prospects. Stage C is not designed here.
- Stage B enabled during implementation. It ships off and Ary turns it on.
- Approve All.
- Reply-speed optimisation. Median is 24 minutes.
- A CTA validator that rejects question marks.
- Any rule that infers ability to pay from a proxy.
- A paid contact-data provider, until free recovery has run across all 705.
- Automated sourcing, until source outcome data exists.
- A second send, sequence, region or qualification policy in any skill.
- A neutered auto-prospect. It is an execution mode, not a fallback.
- Backfilled source labels on historical rows.
- A model deciding anything a table lookup can decide.
- Automatic reactivation sends.
- Cold video and step-triggered PDFs.
- A five-touch experimental arm.
- Video repricing before a clean post-fix render sample exists.
- Any rebuild of Gmail ingestion.

---

## Five highest-impact product changes

1. **Concrete micro-offer as the close, validated by class.** 4.0% against 0.4%
   interested. No schema change, no cost, largest verified effect available.
2. **Allowed sequence length owned by the app, banded by priority.** Removes
   roughly 1,670 emails per historical population.
3. **Contact discovery before any paid step, and `ELIGIBLE_FOR_VERIFICATION`
   before the probe.** 705 prospects in the standing backlog have a website and
   still need contact discovery, so contactability is resolved before paid
   verification is ever allowed.
4. **Asset ladder behind an accepted offer.** Turns video and PDF from cold
   decorations into fulfillment.
5. **Stage B follow-up automation.** The largest reduction in Ary's repeated
   manual work in the whole document, and the one with the most guard conditions.

## Five highest-impact skill changes

1. **Send policy consolidates into the app.** Region scope becomes config, the
   sweep reads it, and there stops being a second send brain.
2. **daily-followup-sweep reads the allowed length** and gains evidence
   staleness, bounce and fingerprint as stop conditions.
3. **auto-prospect becomes a first-class skill-assisted execution mode** with the
   canonical package schema, saving API spend rather than being retired.
4. **website-audit moves off the default path** to deep review, ambiguous pages
   and QA, carrying no second Strong or Vet policy.
5. **daily-reply-sync becomes QA and recovery only.**

---

## Proposed daily Ary experience

```
  ┌──────────────────────────────────────────┐
  │  8  READY FOR APPROVAL                   │
  │     first emails. Rate as you go.        │
  │                                          │
  │  3  HUMAN REPLIES                        │
  │     2 interested, 1 accepted an offer    │
  │                                          │
  │  2  AMBIGUOUS                            │
  │     needs your read                      │
  │                                          │
  │  1  DEFERRAL DUE                         │
  │     Kori Burkholder, since 2026-07-30    │
  │                                          │
  │  ─────────────────────────────────────   │
  │  6 follow-ups went out on their own      │
  │  12 held, no contact found               │
  │   4 waiting on your MAYBE call           │
  └──────────────────────────────────────────┘
```

The eight are first emails only. Under Stage B the follow-ups Ary already
authorised have gone out on their own, guard-checked, and are reported rather
than queued.

The bottom three lines are deliberately quiet. They are work, but they are not
today's work.

---

## Open questions

1. **Is P1 = 3 right, or is it 2?** The prospective holdout exists to settle it.
   Until it reports, 3 is a risk judgment, not a finding.

2. **Is a pre-research triage lane worth Ary's daily attention?** It is the only
   way a rating can govern research spend. It cannot be answered until the money
   spent researching prospects later marked ✖️ is measured.

3. **What is the actual yield of free contact recovery?** 25 of 705 processed.
   Until that number is real, the paid-provider question cannot be asked.

4. **What are current video economics?** Unknown. No clean render sample since
   the timeout, audio-reuse and duplicate fixes. Repricing waits on it.

5. **When does a HELD prospect get retried?** No evidence exists. A quarterly
   re-check is a guess and is labelled as one.

6. **Is `evidence_stale_days = 90` right?** Chosen, not measured. Config, so it
   is cheap to change once something is known.

7. **Does the micro-offer survive at scale?** It rests on 625 stored emails and
   one attributable client.

8. **Where do interested prospects die?** 21 interested, 1 client. Still not
   answerable, message bodies deliberately not stored. **The largest known gap in
   the business, and no part of V2 addresses it.**

---

## EXACT V2 DECISIONS

| # | Decision | Proposed |
|---|---|---|
| 1 | **Default sequence** | 2 cold touches for P2, days 0 and 4 |
| 2 | **💚 sequence** | 3 cold touches for P1, days 0, 4 and 10 |
| 3 | **✖️ behavior** | P3: exactly 1 touch if a safe address already exists, no follow-up, no paid provider, no paid verification, no chasing a hard-to-find address, no asset, lowest queue priority. Free native discovery still runs. **That one touch still goes through the canonical validated package**, never a cheap side door. Not an automatic skip |
| 4 | **Email 1 CTA** | Concrete micro-offer: one specific thing seen, a small specific offer, deliverable in under ten minutes, plus the escape hatch. Validation is on **CTA class, never punctuation**. A yes/no micro-offer may be a question |
| 5 | **Strong definition** | FIT + LEGITIMATE CONTACT REASON + IN-SCOPE OPPORTUNITY + SUFFICIENT EVIDENCE. All four, evaluated **after** verification. FIT excludes ability to pay except on explicit evidence. Boolean gate, decided in code, snapshot version recorded |
| 6 | **Rating role** | Governs band, allowed touches, **future** research permission, queue order and asset eligibility. Applied at approval; pre-existing ratings apply earlier. Unrated is **provisional P2**. It never creates evidence, never satisfies a Strong test, and never undoes spend already made |
| 7 | **Contact discovery order** | Intake → prescreen → **free contact discovery** → signals (shared fetch) → **semantic eligibility** → **budget gate** → verify-site → evidence → Vet → Strong → band → prepare → approve → send. No contact means HELD and nothing paid runs. A later bounce sets `NEEDS_CONTACT_RECOVERY` and never rewinds Strong |
| 8 | **Research trigger** | `ELIGIBLE_FOR_VERIFICATION`, a **semantic** test only: prescreen passed, safe contact exists, fit plausible, a candidate reason worth verifying, paid verification permitted, not a known ✖️. **Budget is a separate execution gate**: no allowance today means `WAITING_FOR_VERIFICATION_BUDGET`, never PARKED or SKIP. Never gated on already being Strong. 14-day reuse |
| 9 | **Video trigger** | Accepted offer where video is the smallest useful form, or Ary requests it. Cold video retired **on outcome evidence** (465 sends, zero clients). VIDTEST retired. **Current cost is UNKNOWN**; no repricing until a clean post-fix sample exists |
| 10 | **PDF trigger** | An artifact explicitly promised and accepted, or Ary requests it. Never a sequence step |
| 11 | **Reply behavior** | Stop the sequence, classify with Haiku, route. Interested and ambiguous go to Ary with full context and the accepted offer. No speed optimisation |
| 12 | **Deferral behavior** | Structured `deferred_until` + reason + promise + context + source. Auto-resurfaces into Today. Never auto-sends, and this is a deliberate exception to Stage B |
| 13 | **Source tracking** | `origin_class` required on new records, supplied explicitly or as an explicit `MANUAL`/`OTHER` fallback. Never inferred from evidence or provider. `UNKNOWN` is legacy-only. `origin_batch` preserved. Imports must not fail for this |
| 14 | **Sonnet 5 usage** | Outreach writing, reply coaching, call prep, proposals. Haiku for score, classify-reply, phrases, voice-note. `best5` becomes code. `analyze` consolidates. **Optimise call count before model tier**, and skill-assisted mode removes the call entirely without lowering quality |
| 15 | **Skill ownership** | App owns all policy and state, including send window, timezone and region scope (moved to workspace config). Skills own deep review, ambiguous pages, batch orchestration, outside-app recovery, and **skill-assisted package preparation as a first-class mode**. No skill carries sequence length, send policy, asset eligibility, qualification, Vet or Strong |
| 16 | **Human approval** | Required on **Email 1**. One approval authorises the exact Email 1, **the exact copy of every permitted follow-up**, the allowed length, the follow-up schedule and policy, and the rating. Copy created or edited after approval goes stale and needs re-approval. No Approve All |
| 17 | **Automatic sending** | `AUTO_SEND_FIRST` stays **OFF** and Stage C is not designed. `AUTO_SEND_FOLLOWUPS` ships **OFF**, runs in shadow first, and only Ary enables it |
| 18 | **Follow-up automation** | Stage B: a follow-up may send automatically only when its exact copy was in the approved package and is still covered by the fingerprint, and every guard condition holds at execution time. Stopping replies are decided by the **canonical reply classification**, so an autoresponder stops nothing. Any failure holds and surfaces. Emails 4+ remain a manual override on a named prospect, never routine |
| 19 | **Future sourcing automation** | Gated on source outcome data. Build the provenance now, revisit after roughly six months of cohorts |
| 20 | **Future learning** | Every send records the full row above, including `rating_source`, `band_was_provisional`, `cta_class`, `sent_by` and `prepared_by`. Outcome hierarchy: attributable clients first, offer acceptance is a **leading diagnostic only**. Always show n. Never a rate without a denominator. Never causality from a rate difference. A withdrawn finding does not return without new evidence |

---

**READY FOR IMPLEMENTATION.** Corrections A1 to A5 applied and consistency-scanned.
