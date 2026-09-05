# Forensic pass 5: the population answers

The last forensic report. Every historically contacted prospect in Ary's
workspace has been reconstructed from the mailbox, so the sequence question has
real denominators for the first time.

No product rule was changed.

---

## Population coverage

| | n |
|---|---|
| Prospects backfilled | **952** |
| Match rate | **100%** |
| Messages recovered | **4,592** |
| Remaining in Ary's workspace | **0** |
| Cold-outreach conversations analysed | **935** |
| Wrote to us first | 1 |
| No cold email found | 1 |

The 161 still outstanding belong to Ellen's workspace and are outside this
analysis.

**Population reply rate: 74 of 935 — 7.9%.** That is the number report 4's
cohort could not see, and it is why report 4 refused to set a sequence length.

---

## True cold sequence distribution

Cold emails actually sent per conversation, counting only outbound messages
before the first human reply:

| Cold emails | Conversations |
|---|---|
| 1 | 99 |
| 2 | 94 |
| 3 | 125 |
| 4 | 109 |
| 5 | 176 |
| 6 | 223 |
| 7 | 49 |
| 8+ | 60 |

**More prospects received six cold emails than any other number.** The
five-email template was routinely exceeded.

---

## Marginal value by email step

**Denominators are the people who actually reached each step.**

| Cold email | Reached | First reply here | **Marginal reply rate** | Interested | Declined |
|---|---|---|---|---|---|
| 1 | 935 | 27 | **2.9%** | 4 | 11 |
| 2 | 836 | 25 | **3.0%** | 8 | 10 |
| 3 | 742 | 9 | **1.2%** | 1 | 4 |
| 4 | 617 | 4 | **0.6%** | 1 | 1 |
| 5 | 508 | 5 | **1.0%** | 2 | 0 |
| 6+ | 332 | 4 | **1.2%** | 1 | 1 |

**There is a clean break after email 2.** Emails 1 and 2 both convert at about
3%. Everything after drops to roughly 1% and stays there.

Email 2 also carries the most interested replies of any single step — 8 of 17.

**Email 3 costs 742 sends to produce one interested reply.** Emails 4 through 6+
cost about 1,457 sends between them for four.

---

## Sequence-length counterfactual

| Rule | Emails avoided | Replies lost | **Interested lost** | Declines avoided |
|---|---|---|---|---|
| Stop after 1 | 3,220 | 47 | **13** | 16 |
| **Stop after 2** | **2,384** | 22 | **5** | 6 |
| Stop after 3 | 1,642 | 13 | 4 | 2 |
| Stop after 4 | 1,025 | 9 | 3 | 1 |
| Stop after 5 | 517 | 4 | 1 | 1 |

**Stopping after email 2 would have avoided 2,384 emails and cost 5 interested
replies.** That is roughly 477 emails per interested reply preserved.

Stopping after 3 avoids 1,642 and costs 4 — about 410 emails per interested
reply preserved. Marginally worse value than stopping at 2, and it keeps one
more conversation.

**Stopping after 1 is clearly wrong.** It costs 13 of 17 interested replies.

---

## What 💚 and ✖️ detect, at population scale

| Rating | Conversations | Replied | Interested | Declined | Avg cold emails |
|---|---|---|---|---|---|
| 💚 | 774 | 50 (6.5%) | **19 (2.5%)** | 15 | 4.8 |
| ✖️ | 91 | 21 (**23.1%**) | 1 (1.1%) | **14 (15.4%)** | 2.2 |
| 💙 | 36 | 2 (5.6%) | 0 | 0 | 4.7 |
| 🥀 | 24 | 1 (4.2%) | 0 | 0 | 3.3 |
| unrated | 10 | 0 | 1 | 0 | 2.9 |

Both earlier findings hold at full scale, and the inversion is sharper than
before:

- **💚 predicts interest.** 2.5% interested, and it carries 19 of the 21
  interested replies in the whole database.
- **✖️ predicts rejection.** 23.1% reply rate, but 14 of those 21 replies are
  declines. A ✖️ prospect is roughly **14× more likely to decline than to be
  interested**.

Ary's ✖️ is not "low quality". It is "this person will tell you no", and they do.

---

## Video and PDF

| | Conversations | Replied | Interested |
|---|---|---|---|
| Received a video | 465 | 12 (2.6%) | 3 (0.6%) |
| Received a PDF | 607 | 22 (3.6%) | 4 (0.7%) |
| **Received neither** | **201** | **47 (23.4%)** | **16 (8.0%)** |

⚠️ **This comparison is severely confounded and must not be read as causal.**

Videos go out around email 3 and PDFs at email 5. A prospect who replied at
email 1 or 2 **never received either asset**. So the "neither" group is
constructed almost entirely from early repliers, and the assets group is
constructed from people who had already ignored two emails.

The table mostly re-measures the sequence finding above, from a different angle.

**What can honestly be said:** after 465 video sends and 607 PDF sends, neither
asset shows a reply rate above the 7.9% population baseline, and neither is
associated with a client. There is still no evidence of value, and the strongest
single fact remains unchanged from report 1: **zero clients among 465 video
recipients.**

---

## Sarah, preserved

| When | | |
|---|---|---|
| Apr 25 | out | "The Beat the Bloat guide on your homepage" |
| Apr 30 | out | follow-up |
| **Apr 30** | **in** | **first human reply, after email 2** |
| Apr 30 | out | answered in 61 minutes |
| May 7 | in | stronger interest |
| later | | scope, contract, deposit, ongoing project work |

Two cold emails, a subject naming one specific visible thing, a concrete
micro-offer close on both, reply at email 2. She sits exactly on the step where
the population data says replies concentrate, and used exactly the CTA class the
copy analysis ranked highest.

**n=1.** It corroborates; it does not prove.

---

## What we were wrong about

| Claim | Status |
|---|---|
| "386 prospects got the full five-email sequence" | **Withdrawn** — built on `emails_sent` |
| "Stop after two" (report 2) | Withdrawn then, **supported now** by different evidence |
| "36% first replied at email 3 or later" | **Withdrawn** — truncated threads |
| "Sarah's thread is unrecoverable" | **Withdrawn** — search bug |
| "Email 2 is the workhorse" (report 4) | **Now confirmed** with population denominators |
| Video/PDF underperform | **Still true, still confounded** |

Three of those were mine and wrong. The pattern each time: a number was trusted
before the thing producing it was checked.

---

## Strategy v2 inputs — direct answers

1. **How many cold emails should the default sequence have?** **Three.** Emails
   1 and 2 convert at ~3%; email 3 drops to 1.2% but still recovers 9 replies
   and holds one interested. Emails 4 onward return ~1% and cost 1,642 sends for
   3 interested replies. Three is the last step that pays for itself.

2. **Should length vary by prospect quality?** **Yes, on the evidence.** ✖️
   prospects already receive fewer (2.2 avg) and produce declines; 💚 receive 4.8
   and produce all the interest. Sending ✖️ prospects anything past email 1 is
   buying rejections.

3. **What should Email 1's CTA become?** A **concrete micro-offer** — name the
   specific thing and offer to send something about it. 4.0% interested against
   0.4% for an open question, and it is what Sarah replied to.

4. **Which CTA should we stop using?** The **open question** as a closer. Most
   used, worst performing.

5. **What should qualify as Strong?** **NOT ANSWERABLE.** Vet has 10 verdicts
   and no outcomes.

6. **Should 💚 affect Strong/Pick/sourcing?** Prioritisation now; sourcing later.
   It predicts interest but the mechanism is not identified, so it should not
   yet gate what gets sourced.

7. **What does ✖️ predict?** **Rejection, strongly.** 15.4% decline rate, 14×
   more likely to decline than to be interested.

8. **Which sources should increase?** **NOT ANSWERABLE.** 4,787 prospects have
   no recorded origin.

9. **Which should decrease?** **NOT ANSWERABLE.** Same reason.

10. **Are coaches a weak ICP?** **NOT ANSWERABLE.** The label correlates with one
    import batch and this pass could not separate the two.

11. **Should cold video survive?** **No evidence supports it.** 465 sends, zero
    clients. The comparison is confounded, but nothing points the other way.

12. **Should PDF survive?** Same answer, same caveat.

13. **Should assets move post-interest?** That is the change the data most
    supports: they currently go to people who have already ignored two emails.

14. **Where are interested prospects lost?** 21 interested, 1 client. **NOT
    ANSWERABLE why** — needs message bodies, not fetched.

15. **Which objections matter?** **NOT ANSWERABLE.** Needs bodies.

16. **Which deferrals now?** Kori Burkholder, Greg Lock, Irina Ertel, Jane Lee.

17. **What to automate more?** Contact discovery, and stopping sequences at
    step 3.

18. **What stays human?** Approval, replies, and the 💚/✖️ judgement, which is
    the best predictor in the database.

19. **Which Claude calls can be removed?** **NOT ANSWERED** — out of scope here.

20. **Which skills change?** The sweep's sequence length, once Ary decides.

21. **One thing immediately?** **Change the closing line to a concrete
    micro-offer.**

22. **Five things for LeadsThatBloom?**
    1. Default sequence to 3, not 5
    2. Concrete micro-offer as the Email 1 CTA
    3. Stop sending anything past email 1 to ✖️ prospects
    4. Move video and PDF behind a reply
    5. Finish contact discovery on the 740

---

## What still has insufficient evidence

Message bodies were deliberately not stored, so decline language, price
objections and where interested conversations died remain closed. Source and
niche analysis is blocked by 4,787 prospects with no recorded origin. Vet has no
outcomes yet.

**Forensic development stops here.**
