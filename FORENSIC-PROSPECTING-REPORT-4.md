# Forensic pass 4: the corrected reconstruction

The sequence question has been answered wrong twice and withdrawn twice. This
pass rebuilds it on corrected search, a cold-outreach boundary, and a validation
case Ary already knew the answer to.

No product behaviour was changed.

---

## Executive findings

1. **Email 2 is the workhorse.** Of 28 recovered conversations with a human
   reply, **11 first replied after cold email 2** — a 45.8% marginal rate
   against 21.9% for email 1. Eight of the 17 interested replies arrived there.
   Sarah, the one attributable client, replied at email 2.

2. **The tail is thin but not empty.** Emails 3 and 4 add little (23.1% and
   20.0% marginal). Stopping after two would have cost 10 replies and 5
   interested replies in this cohort.

3. **⚠️ This cohort cannot set a default sequence length.** It is 28 repliers
   out of 32 conversations, selected client-first and interested-second, against
   a population reply rate near 6%. Every marginal rate below is inflated by
   roughly an order of magnitude. **The shape is valid — where replies land
   relative to each other. The levels are not.**

---

## Validation set: what the corrected search changed

| | Before | After |
|---|---|---|
| Prospects | 32 | 32 |
| Matched | 32 | **32** |
| Hit the thread cap | **24** | **0** |
| Messages recovered | 297 | **375** |
| Sarah, earliest message | 2026-07-16 | **2026-04-25** |
| Sarah, messages | 15 | **84** |

**Zero remain truncated.** Every conversation now reaches its own outreach
window rather than whatever was most recent.

Sarah was the deliberate validation case, because Ary already knew the answer.
The recovered chronology matches her account message for message. That check
should have happened before report 3 shipped.

---

## The cold-outreach boundary

Sarah has 84 messages and 43 outbound. **Two were cold outreach.** The other 41
are a client relationship, and counting them as sequence steps is exactly the
contamination that made `emails_sent = 12` look like twelve cold emails.

**The rule: the cold phase ends at the first human reply.** Everything outbound
before it is the sequence; everything after is a conversation. Deliberately the
earliest defensible cut — it needs no judgement about when interest became
explicit, so it cannot drift.

Two guards, both tested:

- An **autoresponder does not end the cold phase**. Without that, every prospect
  with an out-of-office looks like a one-email win.
- **Silence returns null, not step zero.** So does a prospect who wrote first.
  Neither is a sequence result.

---

## Sequence marginal returns

**32 conversations. 28 replied. 4 silent. None wrote first.**

| Cold email | Reached | First reply here | Marginal rate | Interested |
|---|---|---|---|---|
| 1 | 32 | 7 | 21.9% | 4 |
| **2** | 24 | **11** | **45.8%** | **8** |
| 3 | 13 | 3 | 23.1% | 1 |
| 4 | 10 | 2 | 20.0% | 1 |
| 5 | 7 | 3 | 42.9% | 2 |
| 6+ | 3 | 2 | 66.7% | 1 |

Cold emails per conversation: 8 got one, 11 got two, 3 got three, 3 got four,
4 got five, 3 got six or more.

**Email 2 is where this cohort answers.** Highest count, near-highest marginal
rate, and nearly half the interested replies on its own.

The apparent revival at 5 and 6+ rests on 3 conversations each. Those are noise,
not a second peak.

---

## Stop-after-N counterfactual

Reconstructed chronology, not `emails_sent`:

| Rule | Emails avoided | Replies lost | **Interested lost** |
|---|---|---|---|
| Stop after 1 | 59 | 21 | **13** |
| Stop after 2 | 35 | 10 | **5** |
| Stop after 3 | 22 | 7 | 4 |
| Stop after 4 | 12 | 5 | 3 |

⚠️ **These are losses inside a cohort of repliers.** In the real population most
prospects never reply at any step, so emails avoided would be far larger and
replies lost far smaller. This is the worst case for stopping early, not the
expected case.

What survives as a genuine observation: **stopping after one email is clearly
too aggressive.** It loses 13 of 17 interested replies in a set where email 2 is
the single most productive step.

---

## What is trusted, and what stays withdrawn

**TRUSTED**

- 💚 predicts interest better than unrated — 2.4% vs 0.6%, n=781 contacted
- ✖️ strongly predicts rejection — 14.3% decline, n=98
- Concrete micro-offer CTA beats open question — 4.0% vs 0.4%, n=625
- Sarah used concrete micro-offer CTAs in both cold emails
- Sarah first replied after email 2
- Reply handling is fast — median 24 minutes, 70% under an hour

**PERMANENTLY WITHDRAWN**

- "386 prospects received the full five-email sequence" — built on `emails_sent`
- "replies concentrate by email 2, so stop after two" (report 2)
- "36% first replied at email 3 or later" (report 3)
- "Sarah's thread is unrecoverable" (report 3)
- `emails_sent = 12` as a count of cold emails to Sarah
- Anything else resting on `emails_sent` or the six-thread search

---

## Still NOT ANSWERABLE

The validation set was ordered client, interested, deferred, decline. Only 32
are done, and interested plus deferred alone is 34 — so **the set contains
essentially no declines.**

Unanswered as a result:

- **What ✖️ detects.** Needs decline threads and their text.
- **Price and objection language.** Needs bodies, deliberately not stored.
- **Where interested conversations died.** Needs bodies plus the remaining 950.
- **CTA validation on reconstructed sends.** 32 conversations cannot be
  stratified by rating and specificity.

The remaining ~950 are queued behind the same corrected method and will answer
the first and last. The two needing message text need a decision about transient
body fetching that this pass did not take.

---

## Deferrals and Kori

Unchanged from the corrected table in report 2, now checked against real
chronology. **Four require action:** Kori Burkholder, Greg Lock, Irina Ertel,
Jane Lee. Five are on Rejected or Finished and were deliberately closed.

**Kori:** the mailbox holds 6 outbound and 1 inbound message across 2 threads,
against `emails_sent = 0`. She was emailed six times and the counter never
recorded it.

The counter has **not** been corrected. The recovered messages are the better
record, and rewriting legacy state to make it agree is the habit that produced
two of the withdrawn findings.

---

## Sarah: the validation case

| When | | |
|---|---|---|
| Apr 25 22:03 | out | "The Beat the Bloat guide on your homepage" |
| Apr 30 00:36 | out | follow-up |
| **Apr 30 19:27** | **in** | **first human reply — after email 2** |
| Apr 30 20:28 | out | answered in 61 minutes |
| May 4 08:38 | out | follow-up |
| May 7 14:34 | in | replies again |
| May 7 15:56 | out | answered in 82 minutes |
| later | | scope, contract, deposit, ongoing project work |

Four things co-occur, and none generalises from one case:

- a subject line naming **one specific visible thing** on her homepage
- a **concrete micro-offer** as the close, in both cold emails
- reply at **email 2**
- an answer within the hour

The one attributable client came through the highest-performing CTA class in the
copy analysis. Two independent methods, one answer.

---

## Final direct answers

1. **How many cold emails should the default be?** **NOT ANSWERABLE from this
   cohort.** 28 repliers out of 32 inflates every level; only the shape is
   valid. The shape says one is too few and the tail past three is thin. A
   defensible default is **3** — and that is a judgement, not a number this data
   produced.

2. **Which steps add meaningful interested replies?** **Email 2, by a distance**
   — 8 of 17. Email 3 adds 1. Beyond that, cells of 1–3 conversations.

3. **Is the concrete micro-offer CTA still the strongest copy change?** **Yes.**
   Untouched by both corrections, because it never depended on `emails_sent` or
   the truncated search, and independently confirmed by Sarah.

4. **Are interested leads lost after replying?** 21 interested replies, 1
   attributable client. The gap is real.

5. **Why?** **NOT ANSWERABLE.** Needs message bodies.

6. **What does 💚 detect?** Interest, at four times the unrated rate.

7. **What does ✖️ detect?** **NOT ANSWERABLE.** No declines in the validation set.

8. **Which objections recur?** **NOT ANSWERABLE.** Needs bodies.

9. **Which deferrals to resurface?** Kori Burkholder, Greg Lock, Irina Ertel,
   Jane Lee.

10. **What did Sarah's path look like?** Two cold emails, specific subject,
    micro-offer close, reply at email 2, answered within the hour, then a
    months-long client relationship.

11. **What is permanently withdrawn?** Everything resting on `emails_sent` or
    the six-thread search. Listed in full above.

12. **What should Strategy v2 change?** The closing line, and only that so far.
    Sequence length has been wrong twice and this cohort still cannot set it
    honestly. **Not implemented in this pass.**

---

## What this pass did not do

No product rule changed. The remaining ~950 are not backfilled. Message bodies
are not fetched, so decline and objection language stay closed. The held-contact
review surface is still not built.
