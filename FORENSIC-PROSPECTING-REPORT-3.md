# Forensic pass 3: the mailbox answers back

A narrow read-only backfill recovered historical message chronology from Gmail.
Two questions that came back NOT ANSWERABLE twice now have real answers, and
one of them **contradicts the recommendation in report 2**.

No product rule was changed.

---

## Executive findings

1. **Ary answers fast. Median 24 minutes.** 58 of 83 recovered replies were
   answered inside an hour; 71 of 83 inside four. Slow reply handling is not a
   problem in this business, and report 1's suspicion that it might be is now
   closed.

2. **⚠️ "Stop after two silent emails" looks wrong.** Of 28 recovered
   conversations with a human reply, **10 (36%) first replied at email 3 or
   later.** Report 2 suggested a two-email stop as the single change worth
   making. On real chronology that rule would have destroyed more than a third
   of the conversations in this cohort. **I was wrong, and the counter-based
   analysis that produced it was misleading.**

3. **`emails_sent` cannot be trusted.** Kori Burkholder shows `emails_sent = 0`
   and the mailbox holds **6 outbound messages** to her. Every conclusion in
   reports 1 and 2 that rested on that counter — including the 386-prospect
   "full sequence" finding — is now suspect.

---

## Backfill coverage

| | n |
|---|---|
| Backfill cohort (contacted or engaged) | 982 |
| Processed so far | **32** |
| Matched | **32 (100%)** |
| No thread found | 0 |
| Unmatched / ambiguous | 0 |
| Messages recovered | **297** (86 inbound, 211 outbound) |
| Remaining | 950 |

Ordered client → interested → deferred → declined → replied → rest, so the 32
processed are the highest-value conversations in the database, not a random
sample.

**100% match rate** on strict matching: the prospect's own address had to be on
the message. No rule was loosened and nothing was guessed.

### CORRECTED: the thread was never missing, the search was wrong

The first version of this report said Sarah's cold thread could not be
recovered. **That was wrong.** Ary found it by hand in seconds, by searching her
address over the outreach date range instead of asking for recent threads.

The bug: Gmail returns newest first, and the search took the first six threads.
For a client that is months of project work, and the cold outreach sits below
the cut. A design mistake, reported as a limit of the mailbox.

**Fixed and re-run.** The search now brackets a date window from what the record
already knows, paginates, and takes oldest threads first.

| | Before | After |
|---|---|---|
| Messages | 15 | **84** |
| Threads | 6 | 25 |
| Earliest | 2026-07-16 | **2026-04-25** |

The recovered opening matches Ary's account exactly:

| When | Direction | |
|---|---|---|
| Apr 25 22:03 | out | "The Beat the Bloat guide on your homepage" — cold email 1 |
| Apr 30 00:36 | out | follow-up, email 2 |
| **Apr 30 19:27** | **in** | **Sarah replies** |
| Apr 30 20:28 | out | Ary answers, **61 minutes** |
| May 4 08:38 | out | follow-up |
| May 7 14:34 | in | Sarah replies again |
| May 7 15:56 | out | Ary answers, **82 minutes** |

**Sarah's first human reply came after EMAIL 2**, on a thread whose subject line
names one specific thing on her homepage.

Both cold emails closed on a concrete micro-offer — reply and I will send a
quick rundown, then reply and I will share what I would do for the freebie flow
— which is exactly the CTA pattern the copy analysis flagged as strongest. The
one attributable client came through the highest-performing CTA class in the
database.

**`emails_sent = 12` is withdrawn as a prospecting figure.** It counts client
and project correspondence. The cold sequence was two emails before she
replied.

---

## Data reliability: what changed

**`emails_sent` is not a send count.** Kori: counter says 0, mailbox holds 6
outbound messages. Sarah: counter says 12, and the recovered messages are
client work.

This matters more than any single finding. Reports 1 and 2 built several
conclusions on that column:

- "386 prospects received the full five-email sequence" — **now unverified**
- "replies concentrate by email 2" — **contradicted below**
- the sequence-step table in report 1 — **should not be relied on**

The counter was maintained by hand and by a skill, across months, with no
message-level source of truth. It drifted.

---

## Sequence marginal returns — the real answer

> WARNING: **THIS TABLE IS INVALIDATED.** It was built on data recovered by the
> buggy search. An audit found **6 of the 32 backfilled prospects have their
> earliest recovered message dated after their own reply date**, so their
> original threads were cut exactly as Sarah's were, and 24 of 32 hit the old
> six-thread limit. The step counts cannot be trusted, and the cohort must be
> re-run before anything is concluded from them.
>
> Kept visible rather than deleted, because the reversal it produced is part of
> the record.

**28 conversations with a recovered human reply. Which outbound message came
immediately before it:**

| First human reply after | n | Share |
|---|---|---|
| Email 1 | 8 | 29% |
| Email 2 | 9 | 32% |
| **Email 3** | **3** | 11% |
| **Email 4** | **2** | 7% |
| **Email 5** | **3** | 11% |
| **Email 6+** | **2** | 7% |
| They wrote first | 1 | 4% |

**17 of 28 (61%) replied by email 2. But 10 of 28 (36%) replied at email 3 or
later.**

### Stop-rule counterfactual

Applied to this cohort:

| Rule | Conversations lost | Share of replies lost |
|---|---|---|
| Stop after email 1 | 19 | **68%** |
| **Stop after email 2** | **10** | **36%** |
| Stop after email 3 | 7 | 25% |
| Current behaviour | 0 | — |

⚠️ **The cohort is biased toward repliers by construction** — it was ordered
client-first, interested-second. The true population rate of late replies will
be lower, because most prospects never reply at any step.

But the direction is unambiguous and it points the opposite way to report 2:
**late follow-ups do produce first contact, and not rarely.** Report 2's
suggestion to stop after two was built on `emails_sent`, and `emails_sent` is
now known to be unreliable.

**CONFIDENCE: MODERATE for "late replies happen", LOW for the exact rate.**

---

## Response speed

**83 inbound human messages where Ary's answer is recoverable.**

| | Hours |
|---|---|
| **Median** | **0.4** (24 minutes) |
| p75 | 1.8 |
| p90 | 4.9 |

| Bucket | n |
|---|---|
| Under 1 hour | **58 (70%)** |
| 1–4 hours | 13 |
| 4–12 hours | 5 |
| 12–24 hours | 2 |
| 1–3 days | 4 |
| Over 3 days | 1 |

Seventy percent answered within the hour. Five of 83 took longer than a day.

**This closes the question.** Reply handling is not where opportunities are
being lost, and any product work aimed at speeding it up would be solving a
problem that does not exist.

---

## Kori Burkholder: the counter was wrong

| | |
|---|---|
| Database | `emails_sent = 0`, stage Engaged, deferred 2026-07-30 |
| Mailbox | **6 outbound, 1 inbound, 2 threads** |

She was emailed six times. The counter never recorded it.

**Not corrected in the database.** Rewriting a legacy counter to tidy history is
exactly what the brief said not to do, and the recovered messages are the
better record.

**What it implies:** other prospects almost certainly have the same divergence,
and the "never contacted" population in report 1 may be smaller than 967.

---

## What is still NOT ANSWERABLE

Only 32 of 982 are done, and bodies were deliberately not stored.

- **Interested-conversation forensics** — needs the remaining backfill plus
  message text.
- **Decline and price language** — needs bodies. The privacy architecture says
  this product is not a mailbox archive, so these need transient fetch-and-
  classify, which was not built this pass.
- **CTA validation against matched threads** — needs enough matched prospects
  with recovered first emails. 32 is not enough.
- **Sarah's original prospecting thread** — blocked by the 6-thread cap.
- **💚 vs ✖️ decline composition** — needs bodies.

---

## Direct answers

1. **Stop after two silent emails?** **NOT ANSWERABLE.** The table that seemed
   to answer it was built on truncated threads. Report 2's version rested on
   `emails_sent`, which is unreliable, so that stays withdrawn — and the
   replacement claim is withdrawn too. Re-run required.

2. **Which step creates incremental interested replies?** **NOT ANSWERABLE**
   pending the re-run. The one conversation now recovered end to end — Sarah,
   the only attributable client — replied after email 2.

3. **Is the CTA finding still the strongest actionable copy result?** **Yes, by
   default.** It is untouched by this pass and unlike the sequence finding it
   never depended on `emails_sent`. It rests on stored copy and reply flags,
   both of which survived scrutiny.

4. **Are we responding quickly enough?** **Yes.** Median 24 minutes, 70% inside
   an hour. *STRONG.*

5. **How many interested replies were lost afterward?** **NOT ANSWERABLE yet.**
   21 interested, 1 client; where the other 20 went needs the remaining
   backfill.

6. **Main post-interest failure mode?** **NOT ANSWERABLE.** It is not slow
   replies, which is the one candidate this pass could eliminate.

7. **What are ✖️ ratings detecting?** **NOT ANSWERABLE** without decline bodies.

8. **What are 💚 ratings detecting?** Unchanged from report 1: interest at 4×
   the unrated rate.

9. **Which objections are recoverable?** **NOT ANSWERABLE** without bodies.

10. **Which deferrals to contact now?** Unchanged from report 2 — Kori
    Burkholder, Greg Lock, Irina Ertel, Jane Lee. Kori is now the most
    interesting: she was emailed six times and the tracker showed zero.

11. **What made Sarah different?** Now answerable. A subject line naming one
    specific thing on her homepage, two cold emails, and both closing on a
    concrete micro-offer rather than an open question. She replied to the
    second. Ary answered in 61 minutes. *n=1, and it is the CTA pattern the copy
    analysis independently flagged.*

12. **If Ary changes ONE thing tomorrow?** **Still the closing line.** Offer to
    send the specific thing rather than ending on an open question. The
    sequence-length idea from report 2 should be dropped: this pass shows it
    would have cost real conversations.

---

## What I got wrong, twice

**First:** report 2 recommended stopping after two silent emails, from a table
built on `emails_sent`. That column is unreliable — Kori shows zero sends
against six real messages. Withdrawn.

**Second:** this report replaced it with a table built on truncated threads, and
declared Sarah's thread missing when the search was looking in the wrong place.
Ary found it immediately. Both the 36% figure and the missing-thread claim are
withdrawn.

The pattern in both is the same: **a number was trusted before the thing
producing it was checked.** First a counter nobody had validated, then a search
nobody had tested against a known case.

The right order is the one Ary used: take a conversation you already know the
answer to, and see whether the tool finds it.

---

## Next

Finish the backfill — 950 remaining, roughly 10 per request against the Gmail
API. Then the interested-conversation forensics, the decline language, and a CTA
validation on matched threads become answerable for the first time.

**Re-run the 32 already backfilled** with the corrected search first. 24 hit the
old cap and 6 provably lost their original thread, so those rows are a floor,
not a record.

**No product change until Ary has read this.** Especially not sequence length —
that idea has now been wrong twice, for two different reasons.
