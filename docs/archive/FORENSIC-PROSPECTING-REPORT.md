# What has actually been working

A forensic read of every prospect in the database on 2026-08-09. Nothing was
changed to produce it.

Two cohorts throughout, and they are never mixed:

- **LEGACY** — 5,813 prospects, most predating structured tracking. Good for
  description, patterns and missed opportunities. Cannot support causal claims
  about playbooks, generators or send timing, because those fields did not
  exist.
- **STRUCTURED** — from 2026-08-09. Two sends. Nothing can be concluded from
  two sends, and nothing below tries.

Every rate has its denominator attached. Where the data cannot answer, it says
so instead of guessing.

---

## Executive answer

**Three things, and only the first is comfortable.**

1. **Ary's ratings work.** Not marginally. A 💚 prospect is four times more
   likely to reply with interest than an unrated one, and a ✖️ prospect is
   seven times more likely to decline. She is reading something real, in both
   directions.

2. **The bottleneck was never research.** Exactly **4** prospects in the entire
   database were researched and never contacted. Meanwhile **967 of her 1,748
   💚 prospects — 55% — were never contacted at all**, and 740 of those have no
   email address. The pipeline was not short of judgement or research. It was
   short of addresses.

3. **The two most expensive features show no evidence of working.** Prospects
   who received a video replied at 1.6%. Prospects who received a PDF replied
   at 2.6%. The overall contacted baseline is 6.1%. Both are confounded and
   neither is a controlled comparison, but neither is pointing the way we hoped.

---

## Data quality: what legacy can and cannot prove

**Can:** counts, ratings, stages, reply types, sequence depth, whether an
address existed, whether a video or PDF was made and sent, niche and source
where recorded.

**Cannot:**
- Which playbook or angle any historical email used. The field did not exist.
- What the email actually said versus what was drafted. No draft/final pairs.
- Response *times*. `reply_date` and `last_contact_date` are dates, not
  timestamps, for almost everything before August. Reply-handling latency is
  **NOT ANSWERABLE** from this data.
- Whether a follow-up went out after a reply. Message ordering only became
  reliable with the Gmail transport.
- Cost per prospect. Credit events start 2026-08-09; there are none before it.

Two data-quality faults worth naming:

- `💙` is documented as "client/won" and 37 prospects carry it, but only 3
  prospects sit on stage `Client` and only one of them is 💙-adjacent. **The
  rating and the stage disagree**, so "how many clients" has two answers.
  This report uses `stage = 'Client'` (3) and flags the discrepancy.
- 5 prospects are flagged `replied` with no reply type, so reply-type
  percentages below run on 63, not 68.

---

## Ary's 💚: does her judgement help?

**LEGACY. n large enough to trust the direction.**

Denominator is *contacted*, not *rated* — a prospect she liked but never emailed
cannot count as a failed outreach.

| Rating | Contacted | Replied | Interested | Declined | Clients |
|---|---|---|---|---|---|
| 💚 | 781 | 42 (5.4%) | **19 (2.4%)** | 15 (1.9%) | 2 |
| ✖️ | 98 | 18 (18.4%) | 1 (1.0%) | **14 (14.3%)** | 0 |
| unrated | 164 | 6 (3.7%) | 1 (0.6%) | 0 | 1 |
| 🥀 dead site | 27 | 1 | 0 | 0 | 0 |
| 💙 | 36 | 1 | 0 | 0 | 0 |

**The counterintuitive bit is the important bit.** ✖️ prospects reply *more*
often than 💚 prospects — 18.4% against 5.4%. Read the composition and it
inverts: 14 of those 18 replies were declines. ✖️ people answer to say no.

So the honest summary is not "💚 gets more replies". It is:

- **💚 predicts interest.** 2.4% interested, 4× the unrated rate.
- **✖️ predicts rejection.** 14.3% decline, 7.4× the 💚 rate.

Both halves of her rating carry information. **CONFIDENCE: STRONG for
direction, DESCRIPTIVE for magnitude** — nothing here controls for which
prospects she chose to email.

---

## Ary vs Vet

**NOT ENOUGH EVIDENCE.**

Vet verdicts exist for 10 prospects, all from August, none of which has been
contacted long enough to have an outcome. A comparison table would be four rows
of n=1. Ask again when the structured cohort has sends.

---

## The replies: what 68 responses really were

**LEGACY.** 68 prospects flagged as replied; 63 carry a type.

| Type | n | % of typed |
|---|---|---|
| Decline | 29 | 46% |
| **Interested** | **21** | **33%** |
| Defer / not now | 13 | 21% |
| No type recorded | 5 | — |

Against 1,106 contacted prospects:

- **Raw reply rate: 6.1%** (68/1,106)
- **Human reply rate: NOT SEPARABLE.** Automated replies were never classified
  distinctly in legacy data. The 6.1% almost certainly includes some
  out-of-office and bounces, so treat it as a ceiling.
- **Positive reply rate: 1.9%** (21/1,106)
- **Client rate: 0.27%** (3/1,106)

**Nearly half of everyone who answered said no.** That is not a failure — a
decline is a cheap, honest outcome. But it means the working funnel is 1.9%,
not 6.1%, and any planning built on the bigger number is planning on
politeness.

---

## Did we lose people after they replied?

**NOT ANSWERABLE with confidence, and that is itself a finding.**

The question needs reply timestamps and outbound ordering. Legacy rows have
dates, not times, and no message-level record of whether Ary answered.

The 13 deferred prospects are the exception worth acting on, and the exact
picture is better than a first pass suggested:

| Deferred prospect state | n |
|---|---|
| No follow-up date at all | **8** |
| Follow-up date already past | **1** |
| Future date scheduled | 4 |

So **9 of 13** people who said "not now" have nothing scheduled or something
overdue. Four are correctly parked. That is 9 named prospects who explicitly did
not say no and are not currently on anybody's list. See *Missed money*.

---

## Follow-ups: what happened by sequence step

**LEGACY. Reading requires care — `emails_sent` is where a prospect *stopped*,
so repliers are over-represented at the step they replied on.**

| Emails sent | Prospects | Replied | Rate |
|---|---|---|---|
| 1 | 232 | 12 | 5.2% |
| 2 | 101 | 18 | 17.8% |
| 3 | 121 | 10 | 8.3% |
| 4 | 130 | 9 | 6.9% |
| **5 (full sequence)** | **386** | **7** | **1.8%** |
| 6+ | 136 | 6 | 4.4% |

**The 386 is the number that matters.** More prospects received the complete
five-email sequence than any other outcome, and 98.2% of them never answered.
That is roughly **1,930 emails sent to produce 7 replies.**

Replies concentrate early. Of 68 replies, 30 came from prospects who had
received two emails or fewer.

**What this does NOT prove:** that email 2 is the best email. The survivorship
shape guarantees a bulge wherever repliers stop. What it does support: running
the full five on a prospect who ignored the first two has been, historically,
close to free of results.

---

## Outreach angles

**NOT ANSWERABLE.** Historical emails were not stored with an angle, a playbook
or a classification, and the sent copy itself is not retained for most rows.
The question of specific-versus-generic copy — the one flagged as most
interesting — **cannot be answered from this database**. It would need the sent
text, and it is not there.

This is now fixed going forward: every structured package stores its playbook,
generator version and evidence hash. The answer exists in about six months, not
today.

---

## Niches

**LEGACY. Confounded, and still worth looking at.**

| Niche | Contacted | Replied | Interested |
|---|---|---|---|
| Coaching | 145 | 3 | **0** |
| Life coach | 40 | 1 | **0** |
| (no niche recorded) | 897 | 62 | 21 |

**Every single "interested" reply in the database came from a prospect with no
niche label.** 185 contacted prospects labelled as coaching produced four
replies and zero interest.

**Heavy caveat:** niche labelling correlates with a specific import batch, so
this may be measuring that batch rather than coaching businesses. But 185
contacted with zero positive replies is a real number and worth a hard look
before more coaching prospects are worked.

---

## Sources

**NOT ANSWERABLE for outcomes.** 4,787 prospects have no recorded origin, and
the ones that do were backfilled from a free-text column today. Contactability
by source is knowable; reply outcomes by source are not, because the labelled
population is not the contacted population.

---

## Contactability: the actual bottleneck

**LEGACY. This is the finding that should change what happens next.**

| | n |
|---|---|
| 💚 prospects | 1,748 |
| 💚 **never contacted** | **967 (55%)** |
| 💚 with no email address | **740** |
| Prospects researched but never contacted | **4** |

Fifty-five percent of the prospects Ary personally marked Strong were never
emailed. Not because they were rejected — because there was no address.

And the reason there was no address is not that searching failed. Before this
week, **15 contact searches had ever run in the entire database.** The 740 is
not a research result. It is the absence of one.

---

## Waste

| Waste category | n | Note |
|---|---|---|
| Videos made and never sent | 27 | Work fully paid for, never used |
| Research bought, never contacted | 4 | Negligible |
| 💚 prospects never worked | 967 | The real one |
| Full 5-email sequences to silent prospects | 386 | ~1,930 emails, 7 replies |

**The waste is not in research.** It is in two places: sequences that ran to
completion on people who never engaged, and prospects that were judged worth
contacting and then were not.

---

## Video

**LEGACY. DESCRIPTIVE, confounded, and not encouraging.**

| | n |
|---|---|
| Videos made | 471 |
| Videos sent | 444 |
| Recipients who replied | 7 (**1.6%**) |
| Interested | 3 |
| Clients | **0** |
| Made and never sent | 27 |

Baseline reply rate across all contacted prospects: **6.1%**.

Video recipients replied at roughly **a quarter of the baseline rate**, and
produced no clients.

**What this does not prove:** videos may have been aimed at colder prospects, or
concentrated in a period with worse performance generally. There is no control
group. But after 444 sends there is no signal pointing the other way either,
and "no evidence of value after 444 attempts" is a finding.

**Video economics remain UNKNOWN on cost.** This is the outcome side, and it is
not making the case for the cost side.

---

## PDF

**LEGACY. DESCRIPTIVE.**

| | n |
|---|---|
| PDFs made | 614 |
| Recipients who replied | 16 (**2.6%**) |
| Interested | 4 |

Also below the 6.1% baseline. Same confounds, same conclusion: no evidence it
adds anything over a specific email.

---

## Pick and Vet retrospectives

**NOT PERFORMABLE HONESTLY.**

Both would require snapshotting what was knowable *before* each outcome. Legacy
rows carry today's state, not a history of it — a prospect's `site_intel` is
whatever the most recent probe found, and their stage is where they ended up.
Feeding that to Pick would be handing it the answers.

Running the simulation anyway would produce an impressive-looking table that
means nothing. Declining to run it is the correct answer.

---

## What current safeguards would have prevented

Reconstructed from what the data shows happened:

| Safeguard | Historical exposure |
|---|---|
| Contact discovery before research | 740 💚 prospects unreachable |
| Ownership classification | The old extractor's first-match rule would have emailed ~half its finds at the wrong company |
| Approval-queue guard fix | Every package blocked; zero could be approved |
| Send events | 444 video sends with no record of which message any of them was |
| Sequence stop on reply | Cannot measure how often this was violated — no message ordering |

---

## Missed money

**9 deferred prospects with nothing scheduled.** Of 13 who said "not now"
rather than "no", 8 have no follow-up date and 1 is overdue. The remaining 4 are
correctly parked and need nothing. Named examples from the unscheduled group:

- Kori Burkholder, career transition coach — last contact 2026-07-30
- Greg Lock, Riddlock Mobile Personal Training — 2026-07-25
- Kayla Koh, Fascial Stretch Therapy — 2026-07-10
- Irina Ertel, Nobody's Perfect Parenting — 2026-07-10
- Celio Silva, CS Massage Therapy — 2026-07-07
- Jane Lee, Positive Boundaries — follow-up date 2026-07-27, now past

This is the cleanest reactivation list in the database.

**21 interested replies, 3 clients.** Eighteen prospects expressed interest and
did not become clients. Where the conversation went afterwards is not
recoverable from legacy data — no message history — so each needs a human to
open the thread in Gmail.

**No outreach is being drafted from this.** It is a list to look at.

---

## The clients

**Three prospects on stage `Client`. This is a case-study population, not a
sample, and nothing below generalises.**

1. **JT Morgan (Coaching)** — source `Personal email`, **0 emails sent**, no
   reply recorded. This client did not come from cold outreach at all. Created
   and marked Client the same day.
2. **Sarah, Good Energy Coach** — 💚, **12 emails sent**, replied `interested`
   2026-04-30, last contact 2026-05-20. The only client with a reconstructable
   outreach path, and it took twelve touches.
3. One unrated prospect on stage Client with no reply recorded.

**What they had in common: NOT ENOUGH EVIDENCE.** One came through a personal
channel, one through persistence, one is unexplained. Two of the three have no
recorded reply at all, which means the client relationship was formed somewhere
the tracker never saw.

**The one honest observation:** at most one of three clients came from the cold
outreach machine this product exists to run.

---

## Direct answers

1. **Is Ary good at picking prospects?** **Yes.** 💚 produces 4× the interested
   rate of unrated; ✖️ produces 7× the decline rate of 💚. Both directions
   carry information. *STRONG direction, DESCRIPTIVE magnitude.*

2. **Does Vet appear useful yet?** **NOT ENOUGH EVIDENCE.** 10 verdicts, no
   outcomes.

3. **Most promising prospect type?** 💚-rated with a reachable address. That is
   the only combination with a positive-reply rate above 2%.

4. **Biggest waste?** Running full five-email sequences at prospects who
   ignored the first two: 386 prospects, ~1,930 emails, 7 replies.

5. **Strongest outreach angle?** **NOT ANSWERABLE.** Angles were never recorded.

6. **Weakest angle?** **NOT ANSWERABLE.** Same reason.

7. **Are follow-ups helping?** **Early ones, probably. Late ones, no evidence.**
   30 of 68 replies arrived by email two. The 386 who received all five replied
   at 1.8%.

8. **Are we losing people after they reply?** **9 of 13 deferred prospects have
   nothing scheduled or an overdue date.** Beyond that, not answerable — no
   reply timestamps.

9. **Is contact discovery a bigger issue than qualification?** **Yes,
   decisively.** 740 💚 prospects with no address against 4 prospects
   researched-but-uncontacted.

10. **Has video shown value?** **No evidence after 444 sends.** 1.6% reply
    against a 6.1% baseline, zero clients.

11. **Has PDF shown value?** **No evidence after 614.** 2.6% against 6.1%.

12. **What did clients have in common?** **NOT ENOUGH EVIDENCE.** n=3, and at
    most one came from cold outreach.

13. **Biggest historical bottleneck?** Contactability, then sequence discipline.
    Not research, not qualification, not copy.

14. **What engineering may not matter?** Video and PDF generation, and the
    verification depth that feeds them.

15. **What to automate next for more clients?** Contact discovery at scale, then
    stopping sequences early. Both are cheap and both target measured problems.

---

## What we should stop doing

- **Running five emails at silent prospects.** The evidence for emails 4 and 5
  is 386 prospects and 7 replies.
- **Making videos by default.** 444 sends, zero clients, below-baseline replies.
- **Making PDFs by default.** Same shape, weaker still.
- **Working coaching-labelled prospects without a reason.** 185 contacted, zero
  interested.

## What we should do more of

- **Contact discovery.** 740 💚 prospects are one free HTTP fetch from being
  workable.
- **Trusting the ✖️.** Prospects Ary marks ✖️ decline at 14.3%. Emailing them
  costs goodwill and produces almost nothing.
- **Reactivating the 9 unscheduled deferrals.** They said not now, and nothing
  is currently set to ask again.

## What LeadsThatBloom should automate next

Finish the 705 contact recovery, then **early sequence exit**: stop a sequence
when the first two emails produce silence, rather than running to five.

That single rule, applied historically, would have saved roughly 1,150 emails
and cost at most 7 replies.

## What we still cannot know yet

- Which outreach angles work. Needs the structured cohort to accumulate.
- Whether reply speed matters. Needs timestamps that only exist from August.
- Whether video works in a fair comparison. Needs a controlled send.
- Whether Vet is better or worse than Ary. Needs outcomes on vetted prospects.
- Cost per client. Needs credit events against a client, and there are none.

**Nothing in this report should change a rule until Ary has read it.**


---

## Appendix: contact recovery, as it stands

The 705-prospect run is still draining. First 25 through the real queue:

| Result | n |
|---|---|
| Other contact only (form / phone / social) | 12 |
| Looked, found nothing | 6 |
| **Safe email adopted** | **3** |
| Fetch failed | 2 |
| Held for review | 1 |
| Site dead | 1 |

Three prospects recovered addresses and all three resumed the pipeline
automatically. Sixteen of 25 have some contact path.

These are not final cohort numbers and should not be quoted as a rate.
