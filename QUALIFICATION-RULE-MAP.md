# Qualification rule map

The twenty rules stored in this workspace's Hive, read exactly as stored, and
what each one is now allowed to do.

Every classification below is produced by `lib/qual-rules.mjs` running over the
live settings, not written by hand. Editing a rule in Settings re-classifies it
on the next read. Nothing here is keyed to these exact sentences, because a
classifier that only understands Ary's wording would be the same workspace leak
this pass exists to remove.

## The finding that shaped everything else

All twenty rules describe **what somebody wrote**.

"Inquiries or leads going cold before they book" is a sentence in a post.
"Ends on a call to action instead of a question" is the shape of a post. Not
one of them is a property of a business that a site probe could observe.

So for a prospect scraped from a map listing or an ad library there is no post,
no text, and no honest way to evaluate any of them. Running the classifier
against such a prospect returns:

```
green 0, red 0, not-applicable 20
```

That is the correct answer, and it is why "wire the rules into prescreen" could
not mean "have prescreen judge them". Prescreen has nothing to judge.

(The first version of this returned twenty UNKNOWNs, which reads as twenty gaps
in the research. See "Source scope" at the end: they are not gaps, and the
difference decides whether Maps prospects sit permanently below social ones.)

Where the text **does** exist — a prospect promoted from a scored lead — the
qualification already happened at the lead and the product was discarding the
structure at promotion. That is the real gap, and it is what got closed.

## Green rules

| # | Rule (verbatim) | Effect | Deterministic? |
|---|---|---|---|
| G1 | inquiries or leads going cold before they book | STATED_PAIN | no |
| G2 | people message or inquire and then never book | STATED_PAIN | no |
| G3 | missed calls or missed DMs turning into lost bookings | STATED_PAIN | no |
| G4 | asking for a booking system, CRM or intake form | STATED_NEED | no |
| G5 | asking for follow-up automation, reminders or auto-replies | STATED_NEED | no |
| G6 | no-shows they are losing every week | STATED_PAIN | no |
| G7 | calendar gaps while they say they are slammed | STATED_PAIN | no |
| G8 | hiring an assistant to chase and follow up leads | STATED_NEED | no |
| G9 | front desk cannot keep up with the messages | STATED_PAIN | no |
| G10 | running ads but the inquiries are not converting | STATED_PAIN | no |

**MEANING.** Three of them (G4, G5, G8) are somebody asking out loud for a
thing this workspace sells. Seven are somebody describing a problem it fixes.
None of them describes a business; all of them describe a sentence.

**CURRENT CONSUMERS.** Before this pass: the social lead scorer only
(`buildScoringParts` in `lib/engine-prompts.mjs`). After: also carried forward
onto the prospect at promotion, read by Vet as a qualification dimension and by
Pick as a tie-break.

**SHOULD AFFECT.**

- prescreen — no. Prescreen runs on scraped rows with no text. Nothing to read.
- Vet — yes, as a **separate dimension**, never folded into evidence.
- Pick — yes, tie-break only.
- playbook — no. The playbook is chosen from verified site findings.
- outreach — no directly; the chosen playbook already carries the angle.
- asset eligibility — no. Assets follow from findings, not from fit.

**REQUIRES VERIFIED EVIDENCE?** No, and this is the load-bearing rule.

A green rule may raise fit, may raise priority, and may raise confidence that
the prospect matches the workspace. It may never convert *no verified
opportunity* into *strong outreach opportunity*. "They said their front desk
cannot keep up" is a reason to want them as a client. It is not a finding about
their website, and it cannot stand in for one.

`qualificationFlags()` returns a literal field `evidence: 'never'` for exactly
this reason. It exists to be asserted on.

**WORKSPACE-SPECIFIC?** Entirely. Every one names booking, inquiries or
follow-up, which is this workspace's offer and nobody else's.

**RISK OF FALSE POSITIVE.** Low, because there is no re-evaluation. A green
rule is only recorded as matched when the lead scorer already said it matched,
and the reason it gave is stored verbatim next to it.

## Red rules

Not one instruction. Five.

| # | Rule (verbatim) | Semantic | Deterministic? |
|---|---|---|---|
| R1 | the post sells instead of asks: we help, our team, a list of packages or prices | LEAN_SKIP | no |
| R2 | ends on a call to action (DM me, link in bio, comment a word, spots open) instead of a question | LEAN_SKIP | no |
| R3 | shows off client results, testimonials or screenshots of wins | LEAN_SKIP | no |
| R4 | scarcity pitch: taking on 3 clients this month, 2 spots left | LEAN_SKIP | no |
| R5 | wants ads run or content made, nothing about what happens after someone inquires | OUTREACH_EXCLUSION | no |
| R6 | scam patterns: vague opportunity, pay to apply, rates too good to be true | HARD_SKIP | **yes** |
| R7 | engagement farming: a poll, a hot take or a hook with no actual request in it | LEAN_SKIP | no |
| R8 | hiring a full-time employee or a salaried assistant, not a setup | OUTREACH_EXCLUSION | **yes** |
| R9 | procurement wording: RFP, vendor onboarding, tender, purchasing department | OUTREACH_EXCLUSION | **yes** |
| R10 | asking for free work, a spec build, or a quick favour | LEAN_SKIP | **yes** |

**The nuance that had to be preserved.** Six of the ten (R1, R2, R3, R4, R7,
R10) are judgements about **one post**, not about the business behind it. A
clinic that wrote a salesy post on Tuesday is not disqualified forever. If all
ten had been wired in as permanent skips, the product would have blacklisted
real businesses for the crime of posting a testimonial.

That is why LEAN_SKIP exists as a distinct answer: it lowers this post's
standing and does nothing to the record.

**MEANING, by semantic.**

- **HARD_SKIP** (R6) — not a real buyer under any circumstances. Fraud is
  permanent.
- **OUTREACH_EXCLUSION** (R5, R8, R9) — a real business, wrong purchase. R5
  wants a service this workspace does not sell. R8 wants to hire a person
  rather than buy a setup. R9 buys through a procurement process a solo
  operator cannot enter. None of the three is a criticism of the prospect.
- **LEAN_SKIP** (R1–R4, R7, R10) — negative signal, other evidence may still
  justify a look.
- **COST_GUARD** — no rule currently classifies here. The classifier reserves
  it for staleness rules ("post is older than 3 days", which is in the shipped
  defaults but not in Ary's list). It means: do not spend deep research
  automatically. It is not a judgement about the business.
- **HUMAN_REVIEW** — the fallback when nothing else fits. No rule of Ary's
  lands here.

**CAN IT BE DETERMINISTIC?** Four can. R6, R8, R9 and R10 name word families a
regex decides from raw post text with enough precision to trust:

```
"We are issuing an RFP for vendor onboarding..."   -> R9 (OUTREACH_EXCLUSION)
"...a quick favour, unpaid, just a sample first"   -> R10 (LEAN_SKIP)
"Hiring a full-time employee, salaried, benefits"  -> R8 (OUTREACH_EXCLUSION)
```

The other six need judgement about tone and shape, which is what the lead
scorer's model is for. They are never re-derived; the scorer's conclusion is
carried, with the reason it gave.

**REQUIRES VERIFIED EVIDENCE?** No. A red rule removes standing; it never
grants it. That direction is safe — the failure mode of a wrong red is a missed
prospect, and the failure mode of a wrong green is an email built on nothing.

**WORKSPACE-SPECIFIC?** R5, R8, R9 and R10 generalise to any solo service
business. R1–R4 and R7 encode this workspace's specific theory of what a buying
post looks like, which is a real opinion and not a universal truth.

**RISK OF FALSE POSITIVE.** The deterministic four are the ones with real
exposure, and they are scoped accordingly: each matches only its own word
family, against text the prospect actually wrote, and records the matched
phrase so a wrong call is visible rather than mysterious. `tests/qual-rules.test.mjs`
pins the false-positive cases that were tried and rejected — an ordinary
business mentioning its "purchasing" page, a post using the word "free" about a
free consultation, a clinic that is "hiring" a therapist.

## Traceability

Every match records four things, not just the verdict:

```
id       green-asking-follow-automation-reminders
text     asking for follow-up automation, reminders or auto-replies
source   lead-scoring | deterministic
quote    the exact sentence that justified the match
```

Unmatched rules are recorded too, as `UNKNOWN_RULES`, with why. A rule that
could not be evaluated and a rule that was evaluated and did not fire are
different states, and collapsing them would make the whole record unreadable
later.

## What is deliberately still not wired

- **Prescreen does not evaluate any rule.** It runs before there is text. The
  one thing it now does is respect a HARD_SKIP that was already established at
  the lead, which is not an evaluation, it is remembering.
- **No rule changes asset eligibility.** Video and PDF follow from findings.
- **No rule changes playbook selection.** The angle comes from verified site
  evidence, and a prospect's post cannot make a broken form exist.

---

## Source scope (added 2026-08-09)

Every rule now declares what kind of evidence could legitimately support it,
and evaluation has four answers instead of two.

| Result | Means |
|---|---|
| MATCHED | Fired, with the words that justified it recorded |
| NOT_MATCHED | Checked against real evidence of the right kind. Not true here |
| UNKNOWN | The right kind of evidence could exist for this prospect and does not, or exists and needs a judgement no rule can make |
| NOT_APPLICABLE | This prospect's origin cannot ever produce what the rule asks about |

**Why the last one had to exist.** All twenty rules scope to `POST_TEXT`. A
business scraped from Google Maps has never written a post and never will, so
before this every Maps record collected twenty unanswered rules and read as
badly researched. It was differently sourced. Running the classifier over a
Maps prospect now returns:

```
green 0, red 0, not-matched 0, not-applicable 20
```

**Provider is not evidence type.** Apify yields a `MAP_LISTING`. A pasted post
yields `POST_TEXT`. The ad library yields `AD`, which is deliberately not
`POST_TEXT`: an ad proves spend, a post carries a statement, and scoring one
with the other's rules is the impersonation the model exists to prevent.

Keeping them separate is what lets real sourcing land later as an importer
change rather than a qualification change.

**An observable half never stands in for a stated whole.** G10, "running ads but
the inquiries are not converting", mentions ads, and ads are observable from an
ad library. That the inquiries are not converting is only ever something the
owner says, so the rule stays scoped to what they wrote.

**An unknown origin gets unknown answers.** 4,787 rows have no recorded source.
NOT_APPLICABLE is a claim about where a prospect came from, so it is only made
when that is known. Those rows return UNKNOWN, which is the truth.
