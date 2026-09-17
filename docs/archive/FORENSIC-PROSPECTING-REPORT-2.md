# Forensic pass 2: what the emails actually did

Analysis only. Nothing in the product was changed.

Two things happened in this pass. Several claims from report 1 were corrected,
and the questions that report called "unanswerable" split into two piles: ones
the stored email copy could answer after all, and ones that genuinely need
Gmail history the database does not hold.

---

## Executive findings

1. **The most actionable result in either report is the call to action.** First
   emails that offered to send something got a 4.0% interested rate (n=99).
   First emails that ended on an open question got **0.4%** (n=246). Same voice,
   same author, ten times the difference.

2. **Report 1's "9 deferrals need action" was wrong.** The correct number is
   **4**. Five of the nine had already been moved to Rejected or Finished — Ary
   closed them and the report counted her decisions as oversights.

3. **Zero of 625 first emails contain an unsupported claim.** Not one instance
   of "you're losing leads" or "falling through the cracks" in the entire
   corpus. The safeguard the product now enforces was already being honoured.

4. **Historical Gmail chronology is not available.** `reply_events` holds three
   rows, all from 2026-08-09. Every question needing message timing — marginal
   reply rate per sequence step, reply-handling speed, what happened after each
   interested reply — remains **NOT ANSWERABLE** without a Gmail backfill,
   which is infrastructure this pass was told not to build.

---

## First report corrections

### Deferrals: 13 resolved exactly

| Prospect | Email | Deferred | Follow-up | Stage | Action? |
|---|---|---|---|---|---|
| Kori Burkholder | kori@inspirality.com | 2026-07-30 | none | Engaged | **YES** |
| Greg Lock, Riddlock PT | info@riddlockpt.com | 2026-07-25 | none | Engaged | **YES** |
| Irina Ertel, Nobody's Perfect Parenting | contact@irinaertel.com | 2026-07-11 | none | Snoozed | **YES** |
| Jane Lee, Positive Boundaries | jane@positiveboundaries.com.au | 2026-07-14 | 2026-07-27 **overdue** | Replied | **YES** |
| Olivia Massage Doreen | oliviamassagedoreen@gmail.com | 2026-07-24 | 2026-10-01 | Snoozed | parked |
| Chris, Miles Ahead PT | chris@milesaheadpt.com | 2026-07-20 | 2026-08-15 | Engaged | parked |
| Denise, Aspen Holistic | aspenhha@gmail.com | 2026-05-06 | 2026-08-19 | Snoozed | parked |
| Helen, Hol Health | info@holhealth.com.au | 2026-07-04 | 2026-11-01 | Snoozed | parked |
| Kayla Koh, Fascial Stretch | kayla@shepherdstrength.ca | 2026-07-19 | none | **Rejected** | closed |
| Lishia, Luna & Soul | lunasoulmn@gmail.com | 2026-05-11 | none | **Rejected** | closed |
| Casey, Blue Skyz Wellness | casey@blueskyzwellness.com | 2026-04-30 | none | **Rejected** | closed |
| Rod, Communicating Love | rod@communicatinglove.com | 2026-04-29 | none | **Rejected** | closed |
| Celio Silva, CS Massage | csmt2901@gmail.com | 2026-07-11 | none | **Finished** | closed |

**Four need action, not nine.** Report 1 counted "no follow-up date" as
"forgotten" without checking stage. Five of those eight were deliberately
closed. That was a bad inference and it is corrected here.

Kori Burkholder is worth a second look for a different reason: **`emails_sent`
is 0** and she is on stage Engaged with a deferral. A conversation exists that
the outreach counter never saw.

### Clients: attribution

| Prospect | Emails sent | Reply | Attribution |
|---|---|---|---|
| Sarah, Good Energy Coach | 12 | interested, 2026-04-30 | **COLD-OUTREACH ATTRIBUTABLE** |
| JT Morgan, Coaching | 0 | none | **NOT prospecting** — source "Personal email", created and marked Client the same day |
| (third, unrated) | — | none recorded | **UNKNOWN** |

**Prospecting-attributable clients: 1.** Report 1 said "at most one" and that
was right, but the table listing three under "The clients" invited the wrong
reading. The metric that matters is one.

---

## What the stored email copy could answer

625 first emails were recovered from stored sequences on contacted prospects.
They are genuinely personalised — they name specific pages, booking tools and
Calendly links — so this is real sent copy, not a template.

**Caveat that limits everything below:** these 625 contain 26 replies, while the
database records 68 replies overall. The corpus covers a subset of outreach, so
rates here describe this corpus, not all history.

### Call to action — the strongest signal found

| CTA in email 1 | Sent | Replied | **Interested** |
|---|---|---|---|
| Offer to send something | 99 | 5 (5.1%) | **4 (4.0%)** |
| Call ask | 31 | 2 (6.5%) | **2 (6.5%)** |
| Yes/no question | 212 | 6 (2.8%) | 2 (0.9%) |
| **Open question** | **246** | 8 (3.3%) | **1 (0.4%)** |
| Soft "just reply" | 4 | 4 | 2 |

The open question is the house style — it is what the voice rules ask for, and
it is the largest group at 246 emails. It produced **one** interested reply.

Offering to send something produced four from 99.

**CONFIDENCE: EARLY.** Four interested replies is a small numerator and the
groups were not randomised. But the direction is consistent across the two
"give them something concrete to say yes to" categories and against the two
question categories, and the largest group is the weakest performer.

### Specific versus generic

| Class | Sent | Replied | Interested | Declined |
|---|---|---|---|---|
| Specific, checkable observation | 363 | 18 (5.0%) | 7 (1.9%) | 7 |
| Other / mixed | 250 | 8 (3.2%) | 4 (1.6%) | 1 |
| Generic systems language | 12 | **0** | **0** | 0 |

Specific outperforms on reply rate by about 1.6×. On *interested* rate the gap
narrows to 1.9% against 1.6%, which n=625 cannot separate.

Generic systems language appears twelve times and produced nothing, which is
suggestive and far too small to call.

**CONFIDENCE: DESCRIPTIVE.** Specific looks better. It does not look
dramatically better on the metric that matters.

### Unsupported claims

| | Sent | Replied | Interested |
|---|---|---|---|
| Contains an unsafe claim | **0** | — | — |
| No unsafe claim | 625 | 26 | 11 |

Searched for "losing leads", "falling through the cracks", "slipping away",
"money on the table", "never hear back" and related phrasing. **Zero hits in
625 emails.**

The validator built to catch this was solving a problem the human did not have.
That is worth knowing before more effort goes into copy safety.

### Length

| Words | Sent | Replied | Interested |
|---|---|---|---|
| 50–75 | 4 | 3 | 1 |
| **76–100** | **446** | 19 (4.3%) | 8 (1.8%) |
| 101–150 | 175 | 4 (2.3%) | 2 (1.1%) |

Almost everything is 76–100 words, and the longer bucket does roughly half as
well on both metrics. **CONFIDENCE: EARLY** — length correlates with whatever
else was going on in longer emails.

### Examples

**Specific, offer-to-send CTA, interested reply** (id 1029):
> "Your Emotion Code and Coaching Session pages both send people to the same
> 30-minute Calendly link, so the service someone picked doesn't carry into the
> booking. I have a quick 7-question System Snapshot... Want me to send it
> over?"

**Specific, soft CTA, interested reply** (id 1106):
> "The main thing I'd work on is the step right after someone fills out your
> contact form, since booking still runs on manual phone and email replies for
> the team... If you want to see what that looks like, just reply."

**Specific, no ask, silence** (id 1079):
> "Your site has a lot of good offers... but each one sends people off to a
> different place... If it's ever worth a look, just reply and I'm around."

The third is as well observed as the first two. The difference is that it gives
the reader nothing to say yes to.

---

## What is NOT ANSWERABLE, and why

The brief assumed Gmail history was reachable for analysis. It is not, from the
database:

```
reply_events:  3 rows total
               oldest inbound  2026-08-09T13:20Z
               oldest outbound 2026-08-09T17:01Z
```

Gmail sync began on 2026-08-09. Everything before that exists only in the
mailbox itself, and pulling it would mean building a historical thread backfill
— reading, matching and storing hundreds of threads. That is infrastructure,
and this pass was explicitly told not to build any.

**Therefore NOT ANSWERABLE in this pass:**

- Marginal human reply rate per sequence step. Needs which outbound message
  preceded each first reply.
- The two-email versus three-email counterfactual. Same dependency.
- Reply-handling speed, and whether fast replies continued more often. Needs
  timestamps on both sides.
- What happened after each of the 21 interested replies. Needs thread contents.
- Price and decline language analysis. Needs received message text.
- Subject-line outcome analysis. Recoverable in principle from stored subjects,
  but the reply attribution it needs is not.

Report 1 reached the same conclusions from the database alone. This pass
confirms the blocker is real rather than an oversight, and names exactly what
would unblock it.

---

## Video and PDF recipient composition

Report 1 found video recipients replied at 1.6% against a 6.1% baseline. The
selection question — were videos aimed at worse prospects? — is partly
answerable.

Within the stored-copy corpus, **20 of 625 emails went to 🥀 (dead site)
prospects and 27 to 💙**, so the corpus is not clean either. A proper
stratified comparison needs the video-recipient list joined to pre-send
characteristics, and the honest position is:

**NOT ENOUGH EVIDENCE to separate selection from effect.** What stands is the
unconditional observation: 444 video sends, 7 replies, 3 interested, 0 clients.
No controlled comparison exists, and none can be constructed retrospectively.

PDF client linkage is **NOT RECORDED** — report 1 showed "—" and the reason is
that no client in the database has a PDF on their record, so the cell was empty
rather than zero. It is genuinely unknown, not genuinely zero.

---

## Direct answers

1. **Stop after two silent emails?** **NOT ANSWERABLE.** Needs the marginal
   reply-per-step data that requires Gmail history. Report 1's 386-prospect
   observation stands as a reason to ask the question, not as an answer.

2. **Which step produces incremental interested replies?** **NOT ANSWERABLE.**
   Same dependency.

3. **Does specific outperform generic?** **Directionally yes** — 5.0% versus
   3.2% reply. On interested rate the difference is inside the noise.
   *DESCRIPTIVE.*

4. **Strongest historical angle?** A specific booking or form observation
   combined with an offer to send something. *EARLY.*

5. **Weakest?** Generic systems language: 12 sent, 0 replies. Also the open
   question as a closer: 246 sent, 1 interested.

6. **Does Ary reply fast enough?** **NOT ANSWERABLE.** No timestamps.

7. **How many interested opportunities were lost after the reply?** **NOT
   ANSWERABLE** in detail. The countable part: 21 interested replies, 1
   attributable client.

8. **Why do ✖️ prospects reject so often?** **NOT ANSWERABLE.** Decline text is
   in the mailbox, not the database. Only 10 ✖️ prospects appear in the copy
   corpus and none of them replied.

9. **What do 💚 interested prospects have in common?** In the copy corpus, all
   the interested replies followed emails naming a specific booking or form
   behaviour on their own site. *DESCRIPTIVE, n=11.*

10. **Are coaches a bad niche, or was it a bad cohort?** **NOT ENOUGH
    EVIDENCE.** The niche label correlates with a single import batch, and this
    pass could not separate the two.

11. **Is video's result selection or effect?** **NOT ENOUGH EVIDENCE.** No
    controlled comparison is constructible from this data.

12. **Does PDF add observable value?** **NOT ENOUGH EVIDENCE**, and its client
    linkage is unrecorded rather than zero.

13. **What was different in the client thread?** **NOT ANSWERABLE** without the
    thread. What the database shows: Sarah received **12 emails** before
    becoming a client, which is more than double the standard sequence.

14. **Who is worth contacting again?** Four deferrals: Kori Burkholder, Greg
    Lock, Irina Ertel, Jane Lee. Plus the 18 interested replies that did not
    convert, each needing a human to open the thread.

15. **If Ary changed one thing tomorrow?** **Change the closing line.** The open
    question is her most-used CTA at 246 emails and her worst performing at 0.4%
    interested. Offering to send something specific ran at 4.0%. That is one
    sentence per email, no new tooling, and it is the largest observed
    difference in either report.

---

## What this pass did not do

No product rules were changed. No sequence, budget, playbook, asset or
automation setting was touched. The held-contact review surface is still not
built, and the 705-prospect contact run is still draining under its existing
limits.

## What would unblock the rest

One thing: a **historical Gmail thread backfill** for the roughly 1,100
contacted prospects — match threads, store message timestamps and direction into
`reply_events`. Every unanswerable question above becomes answerable, and the
existing reply-ingestion code already knows how to do the matching.

That is a real build, and it is the only remaining blocker to knowing whether
follow-ups work.
