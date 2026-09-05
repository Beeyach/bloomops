# Automation map

Every step from prospect discovered to outcome, with who does it now and who
should. Written by tracing the code, not from memory.

**Legend**
`AUTO` safe unattended · `GUARDED` unattended behind cost/evidence thresholds ·
`APPROVAL` system prepares, Ary approves · `HUMAN` stays manual on purpose

---

## The lifecycle

| # | Step | Who now | Judgement? | Cost | Target | Status |
|---|---|---|---|---|---|---|
| 1 | Prospect discovered (scan / import / manual) | Ary triggers | no | Apify | GUARDED | existing |
| 2 | Deduplicate on domain/email | code | no | free | AUTO | existing |
| 3 | **Cheap prescreen** (closed stage, decline, no domain, links page) | — | no | **free** | AUTO | **shipped** `lib/vet.mjs` |
| 4 | **Check existing intelligence** (fresh? thorough?) | — | no | free | AUTO | **shipped** `isFresh` + `isThorough` |
| 5 | Website verification (browser probe) | Ary clicks per prospect | no | 20cr | GUARDED | **gate shipped**, runner not |
| 6 | Contact + signal extraction | ad-scan path only | no | ~free | GUARDED | **model shipped**, not wired to Vet |
| 7 | **Vet verdict** (fit/opportunity/evidence/timing/confidence) | — | no | free | AUTO | **shipped** `POST /api/vet` |
| 8 | Choose the outreach angle | Ary reads notes | **yes** | free | APPROVAL | not built |
| 9 | Draft email 1 | Ary clicks a bee | **yes** | 5–33cr | APPROVAL | existing, per-prospect |
| 10 | Decide whether a video is justified | Ary decides | **yes** | 200cr | APPROVAL | rule exists in probe, not surfaced |
| 11 | Record the video | Ary clicks | no | 200cr | APPROVAL | existing |
| 12 | Send | Ary, in Gmail | **yes** | free | **HUMAN** | deliberate |
| 13 | Watch for engagement | beacon | no | free | AUTO | existing |
| 14 | Classify the reply | skill writes a marker | **yes** | ~5cr | APPROVAL | partial |
| 15 | Update stage from the reply | Ary | **yes** | free | APPROVAL | partial |
| 16 | Schedule the follow-up | code (`next_action_date`) | no | free | AUTO | existing |
| 17 | Resurface a deferred prospect | Today | no | free | AUTO | existing |
| 18 | Stop on decline / unsubscribe / client | code | no | free | AUTO | existing |
| 19 | Answer an interested reply | Ary | **yes** | free | **HUMAN** | deliberate |
| 20 | Record the outcome for learning | — | no | free | AUTO | **shipped** `outcome_events` |

**Count:** 9 AUTO · 4 GUARDED · 5 APPROVAL · 2 HUMAN.

The two HUMAN steps are sending and answering. Both are the relationship, and
neither should ever move.

---

## What this pass shipped

| Change | Removes |
|---|---|
| Stage A prescreen, free and deterministic | Deciding by hand which obviously-bad prospects to skip |
| `isFresh` + `isThorough` split | Re-buying a probe on a site already checked properly |
| Vet verdict computed from stored evidence | Opening a prospect to work out whether it is worth anything |
| `WhyContact` card in the drawer | Reading audit notes to reconstruct why a prospect matters |
| Deterministic Pick ranking | Guessing who to contact next |
| `lib/auto-budget.mjs` circuit breakers | The thing that makes all of the above safe to run unattended |

---

## Evidence sufficiency: the distinction that was missing

Two questions that look like one:

**"Did we look properly?"** — `isThorough()`. Coverage: pages visited, facts
read off the page. Decides whether to *pay again*.

**"Is there enough to write about?"** — `evidenceStrength()`. Yield, split into
`none / thin / sufficient / strong`. Decides whether to *write*.

Conflating them breaks in both directions:

- A thorough probe that found nothing is a **real answer**. Re-buying it is the
  waste the whole path exists to stop.
- A probe that found only a stale copyright line is **fresh and useless**.
  Skipping the paid check on freshness alone hands back an empty prospect
  labelled as researched.

`thin` is the case that had no name before: verified, recent, and still not a
reason to contact anybody.

---

## Cost controls

`lib/auto-budget.mjs`. Four independent brakes, none of them a global toggle:

| Brake | Default | Stops |
|---|---|---|
| `autoVet` | **off** | Automation nobody agreed to |
| `autoCreditsPerDay` | 600 | An import of 20,000 becoming 400,000 credits |
| `maxCreditsPerProspect` | 120 | One pathological row eating the day |
| `reserveCredits` | 500 | Background work spending what she needed for a reply |

An unpriced job is costed at 100 credits rather than 0, so a job nobody priced
cannot slip past the budget.

---

## Video pipeline

Root cause of the 14% timeout rate, from the logs:

1. **No timeout existed anywhere in the render path.** Cloud Run's 900s ceiling
   was the only thing that ended a stalled job, so a hung page, a hung
   ElevenLabs call and a hung ffmpeg were indistinguishable and all cost a
   quarter of an hour. **Fixed:** per-stage budgets, and the error names the
   stage.
2. **35% of timeouts arrived in bursts milliseconds apart** — the same render
   fired twice. The double-click guard on the Record button shipped earlier
   today addresses the client half.
3. **Audio is generated before the walkthrough**, so a failed recording had
   already paid ElevenLabs, and the per-prospect clips were deleted
   immediately — meaning the retry bought them again. **Fixed:** clips are held
   for 6 hours, so a retry inside the window reuses them.

⚠️ **Not yet re-measured.** The changes deploy with this pass; the new failure
rate needs a fortnight of real renders before the number means anything.

---

## Deferred, and why

| Deferred | Why |
|---|---|
| ~~The background runner~~ | **DONE 2026-08-09.** A Cron Trigger on the bloomwired-review Worker wakes `/api/cron/drain` every five minutes; a second at 4am releases budget waiters. Cron does no prospect work itself. See "Runtime" below. |
| **Signals wired into the Vet run** | `lib/signals.mjs` is built and tested. It should fire at Stage B alongside the probe, which does not exist as a background step yet. Wiring it to the manual path would mean moving it again. |
| **Outreach preparation ("12 ready for approval")** | Needs the runner. Preparing drafts one prospect at a time is what already happens. |
| **Reply classification** | The reply-sync skill writes markers; turning those into structured `outcome_events` is a small step, but it belongs with the runner too. |
| **Today as the exception queue** | Today is already close. It should not be rebuilt until there is background work generating exceptions for it to show. |
| **Repricing video** | Fix the timeout rate, measure again, then reprice once. Recorded in `AI-COST-MODEL.md`. |

The honest summary: this pass built the **decisions** and the **brakes**. The
**runner** is the next piece, and it is one well-scoped job rather than eleven.


---

# Runtime (added 2026-08-09)

## What runs, and when

| Schedule | What it does | Bounds |
|---|---|---|
| `*/5 * * * *` | Drains whatever is runnable | 12 jobs, 25 seconds, 5 per workspace per invocation, round-robin |
| `0 4 * * *` | Releases jobs parked on a budget that has since reset | one pass per workspace |

Cron wakes the queue; the queue does the work. A cron that did the work itself
would be one nobody could bound, and Cloudflare would kill it mid-job with no
record of where it got to.

**The browser does not need to be open.** Nothing is pressed.

## Authentication

There is no person on a cron invocation, so there is no session. The Worker
sends a shared secret; the route verifies it with a constant-time compare. The
middleware exemption is exactly one path and two verbs, and the secret is still
checked inside the route — the exemption only lets the request reach the check.

`CRON_SECRET` is set with `wrangler secret put` on the Worker and
`wrangler pages secret put` on the Pages project. It is not in git.

⚠️ **Pages secrets only apply to deployments created after they are set.**
Setting the secret and expecting the running deployment to see it does not
work; a redeploy is required.

## Fairness

Round-robin across workspaces, capped at 5 jobs each per invocation, rather
than draining one to empty. With one workspace this changes nothing. With
several it stops an import of twenty thousand prospects starving everybody
else, and fairness is cheap now and impossible to retrofit later.

## Recovery

| Failure | Behaviour |
|---|---|
| Worker crashes mid-job | The claim expires after 15 minutes and another worker takes it |
| Deployment mid-job | Same: the claim expires, the job returns to the queue |
| Provider times out | Classified transient, retried with 1/5/25-minute backoff, 3 attempts |
| Duplicate cron invocation | Claiming is a conditional UPDATE, so only one worker wins the row |
| Duplicate event for one prospect | Unique partial index on `dedupe_key` over unfinished jobs rejects the second |
| Credits run out mid-job | Refunded before the throw, classified budget, waits without burning an attempt |
| Daily budget reached | Job waits; the 4am cron releases it |
| Automation disabled while queued | Classified permanent, fails with a reason rather than retrying forever |

## The pre-send guard

`lib/outbound.mjs` → `canProgressOutbound()`. One function, one answer, one
reason. Applied by the sweep to every active row before anything is prepared.

Stops on: unanswered reply, unsubscribed, declined, client, do-not-contact,
active conversation, deferred until a future date, invalid contact, terminal
stage, no address, nothing due.

Every ambiguity resolves towards silence. Same-day counts as unanswered
(both stamps are dates, not times). Replied with no date counts as unanswered.
The cost of pausing wrongly is a delay; the cost of sending wrongly is the
thread.
