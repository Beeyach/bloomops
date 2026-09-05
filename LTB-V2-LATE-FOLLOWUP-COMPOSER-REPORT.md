# The Late Follow-Up Composer: One Final Email 3 for the Two-Sent AU Cohort

**Ship:** v1.10.0 — `ce022a6` (feature) then `b135deb` (refusal pacing), both deployed to https://leadsthatbloom.com
**Date:** 2026-08-19 (Pacific: 2026-08-18 evening)
**Strategy authority:** PROSPECTING-STRATEGY-V2.md. P1 allows up to 3 touches at days 0/4/10, P2 stops at 2, P3 at 1, emails 4 and 5 do not exist, and any reply ends cold outreach forever.

---

## What was found in production, at run time

All numbers below were read from the live D1 with read-only queries on 2026-08-18/19.

| Fact | Number |
|---|---|
| Base cohort (AU, not deleted, replied 0, DNC 0, `last_contact_date >= 2026-08-05`, `emails_sent = 2`) | **51** |
| Rating across the whole base cohort | **51 of 51 rated 💚** (all confidently P1, none provisional, no stored bands) |
| Stages present | Email 1 (4), Email 2 (47). No closed, terminal or conversational stage |
| Flagged rows (unsubscribed, decline, defer, canary source, `example.invalid` domain) | **0** |
| Existing live outreach packages on cohort prospects | **0** |
| Inbound reply events on cohort prospects | **0** |
| Prospects where the mailbox agrees with the counter (exactly 2 observed outbound sends) | **47** |
| Prospects where it disagrees (counter says 2, mailbox shows 1) | **4** — excluded, see below |
| Email 1 sent | 2026-08-03 (3 prospects) or 2026-08-04 (44) |
| Email 2 sent | 2026-08-06, as its **own Gmail thread** with its own subject, not a reply |
| Day-10 due dates under P1 spacing | 2026-08-13/14 — every eligible prospect is already overdue |

So the working cohort is **47 composable prospects**, and the pilot cap of 15 means the first pass touches at most 15 of them.

### Excluded for uncertain history: 4 prospects

Prospects **6218, 6228, 6232, 6235** carry `emails_sent = 2` while the mailbox shows exactly one outbound message each. A counter the mailbox disagrees with is an uncertain history, and the composer excludes it rather than guessing which record is right (their stage, "Email 1", agrees with the mailbox, so the counter is the likely liar — but likely is not a basis for a third email). Zero prospects were excluded for an uncertain **band**: every row in the base cohort is rated 💚, which `effectiveBand` maps to P1 non-provisionally.

---

## What was built

### The composer (`lib/late-followup.mjs` + a `late-followup` job in `lib/runner.mjs`)

Every five-minute cron drain (`app/api/cron/drain/route.js`) runs `enqueueLateFollowups`: one cheap SQL pass that finds due cohort members and enqueues at most **5** composition jobs, stopping for good once **15** pilot drafts exist. Each job, through the ordinary durable queue with retries and idempotence:

1. **Re-checks everything live** (`eligibleLateFollowup`) — the state at composition time, not at enqueue time. A reply that landed in between ends it here.
2. **Records the observed history into the canonical send ledger.** The two Gmail-observed sends (real provider message ids, real thread ids, real timestamps, from `reply_events`) are written to `send_events` as steps 1 and 2 via `recordSend(..., via: 'gmail-reconcile')` — the route that exists for exactly this, idempotent on the message id. This is what makes the send path honest later: `nextColdStep` counts to 3, the schedule anchors on the real first send, and `threadFor` returns Email 1's real thread so the close is a **reply into the original conversation**, never a fourth thread.
3. **Reads both emails whole** through `conversationForReading` (the stored `gmail_messages` copy, synced from Gmail when empty). No draft is ever grounded in a 290-character snippet; if the full bodies cannot be read the job retries later instead.
4. **Composes one close** via `askBackground` with the workspace's configured AI key (`lib/ai-call.mjs`, task `draft`, same path as `app/api/draft-reply`). The prompt is the REPLY_SYSTEM register — plain, warm, no exclamation marks, no em dashes, closes `Thanks, Ary` — applied to Ary's approved shape: *"Hi [name], Closing the loop on my two earlier notes about [the specific thing]. If it's on your list somewhere down the line, I'm around. If not, this is the last you'll hear from me about it. Thanks, Ary"* — grounded in that prospect's actual sent emails, never the template verbatim.
5. **Validates deterministically** (`validateLateFollowup`, which wraps the shared V2 `validateFollowup`): word bounds, the never-write list, industry/third-party/outcome claims, no asset the first email never offered, greeting-name guard, **must share real words with Email 1** (it references the original observation) and **must not be Email 1 again** (≤75% overlap), plus the register rules: no em dash, no exclamation mark, no semicolon, no link, an escape hatch present, ends exactly `Thanks, Ary`. A rejected draft is never saved as sendable copy — the package lands as `NEEDS_DECISION` with the reason, carrying only the two sent emails.
6. **Writes one canonical package** through `savePackage` — the existing shape, not a parallel one: `email_subject`/`email_body` = the real Email 1 verbatim, `followups` = [the real Email 2, the new Email 3], `allowed_length` 3, `priority_band` P1, `status` **READY_FOR_APPROVAL**, `generator_version` `late-followup-2026-08.1` (the pilot marker).

### Where the drafts appear

**Today → Approvals**, through the same `/api/outreach` GET every package uses (it selects `READY_FOR_APPROVAL` packages joined to prospects and re-runs the outbound guard on every read). Because the package holds all three emails, `reconcileForApproval` finds every step of the P1 ceiling present (`READY`, `canApproveSequence`), and approving writes the standard approval patch: `sequence_approved = 1`, `sequence_max_step = 3`, and an `approved_fingerprint` computed over **the exact copy of every email in the sequence**. Edit one word afterwards and the approval goes stale.

### The batch review (per the coordinator's ergonomics addition)

Since every draft in the set follows one approved shape, `ApprovalQueue` shows a set review when two or more pilot drafts are waiting: the shape once (the same `LATE_FOLLOWUP_SHAPE` constant handed to the model), the count, and the recipient list as *name · business · Email 1 subject*, each row expandable to that prospect's exact draft. One deliberate tap, **Approve all N follow-ups**, runs the ordinary per-package approve action (`action: 'approve', approveSequence: true`) once per package — so every server-side re-check still happens for every prospect, and a row whose person replied five minutes ago is held back and named while the rest proceed. Each row keeps **Discard** (the ordinary skip). A discarded draft stays discarded: the selector and the handler both refuse to compose twice for a prospect that has a pilot package in any status.

**No new send path exists.** The batch control approves; sending remains a separate manual press per row, and the file contains exactly one occurrence of the send action — the one that was already there (pinned by test).

### Sending, when Ary chooses to

Approving sends nothing (both automation switches are off, and this pilot never touches them). When she presses Send on a row, `sendApproved` runs the full `canSendNow` guard in the last instant: reply arrived → refused (`unanswered-reply`); DNC/unsubscribe/decline/terminal stage → refused; copy not in the approval → refused; **step 4 → refused** (`allowed_length` 3 plus `stepCoveredByApproval`); schedule not due → refused; address changed, mailbox stale, outside the send window, daily/hourly caps → refused. The step derives from the recorded sends (2 → step 3), the subject comes from the original thread, and the message goes out with `In-Reply-To`/`threadId` pointing at the real conversation Email 1 started.

---

## How each hard exclusion is enforced

Every rule is enforced **twice**: cheap SQL in the drain selector, then re-derived from the live row and full event history inside the job (`eligibleLateFollowup`), and the reply/DNC/stage family a **third** time at approval and at send by the existing guard.

| Exclusion | Selector (SQL) | Composer (live re-check) |
|---|---|---|
| `emails_sent >= 3` in any form | `p.emails_sent = 2` | `sent !== 2` refused, with the ≥3 case named; mailbox must show exactly 2 outbound messages too |
| Contacted before Aug 5 | `p.last_contact_date >= '2026-08-05'` | re-checked, plus the **last observed send** must be ≥ 2026-08-05 |
| Repliers | `COALESCE(p.replied,0) = 0` | `replied` refused; any unanswered inbound refused via `canProgressOutbound`; refused again at approval and at send |
| `do_not_contact` | `COALESCE(p.do_not_contact,0) = 0` | refused, plus `unsubscribed`, `decline`, `defer` |
| Closed/finished stages | `stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished','Interested','Proposal Sent','Setup Check')` | same sets re-checked; conversational stages excluded too |
| Internal test/canary | `source != 'canary'`, `domain != 'example.invalid'` | `isInternalTest` from `lib/canary.mjs` |
| Band must allow a third touch | `rating = '💚'` | `effectiveBand` must return **P1, non-provisional** (a stored band wins over the rating; provisional means excluded, not guessed) |
| One composition per prospect, ever | `NOT EXISTS` pilot package in any status | re-checked in the handler (`already-composed`) |

## The pilot cap, and how to lift it

- **Per drain:** at most **5** compositions (`LATE_FOLLOWUP_PER_DRAIN`), with in-flight jobs counted against the budget.
- **Total:** at most **15** pilot drafts (`LATE_FOLLOWUP_PILOT_CAP`), counted as packages carrying `generator_version = 'late-followup-2026-08.1'` in any status, re-checked inside each job in the last instant.
- **To lift it:** set **`lateFollowupPilotCap`** (a number) in the workspace's `engine` settings blob (Settings → the same JSON `sendPolicy` reads). No deploy needed. The setting does not exist today, so the default 15 governs.

## Safety verification

Recorded **before** any of this work began:

| Baseline (2026-08-18, pre-work) | Value |
|---|---|
| `send_events` total | **10** |
| `send_attempts` total | **8** |
| `outreach_packages` total | **21** (max id 23) |
| Package 23 | id 23, prospect 3163, v3, APPROVED, P2, sequence_approved 1, max step 2, `updated_at 2026-08-14T05:22:42.565Z` |
| Engine settings | `autoSendApprovedFollowups:true` absent, `autoSendApprovedFirstEmails:true` absent (both off) |

Verified **after** deploy and the first cron drains (see the verification section at the bottom for the exact post-deploy numbers):

- **Zero sends occurred.** `send_attempts` is written before any Gmail call is made, so an unchanged count proves no send was even attempted. Every new `send_events` row is `recorded_via = 'gmail-reconcile'` with a **historical** `sent_at` (2026-08-03..06) and a real Gmail message id — the canonical recording of the two manual-era sends the mailbox already proved, which is what lets the eventual Email 3 thread correctly and count as step 3. No row records a new send.
- **Package 23 untouched**, byte-for-byte timestamps.
- **Automation switches untouched.**
- **Pilot drafts exist in the approval surface's data source** (`outreach_packages`, status `READY_FOR_APPROVAL`, the exact rows `/api/outreach` GET serves to Today → Approvals).

## Tests

`tests/late-followup.test.mjs`: **37 tests** — pure rules for every hard exclusion and both caps, the validator's register and grounding rules, the package shape run through the real `reconcileForApproval`/`approvalPatch`/`approvalFingerprint`/`canSendNow` machinery (a due manual Email 3 passes; automation-off, reply-arrived, step-4, not-due and stale-copy are all refused), and source-grep pins proving the composer cannot reach a send, the switches are never touched, a refused prospect rests instead of looping, a discarded draft stays discarded, and the batch control adds no send path.

Full suite: **2478 tests, 2478 pass, 0 fail, exit code 0** (`npm test`, exit captured, not piped away). Production build compiles: `npx next build` exit 0.

## Files

| File | Change |
|---|---|
| `lib/late-followup.mjs` | new — eligibility, caps, selector, prompt, validator, package fields |
| `lib/runner.mjs` | the `late-followup` job handler |
| `lib/queue.mjs` | the job kind and its priority |
| `app/api/cron/drain/route.js` | the bounded selector on the five-minute drain |
| `app/api/outreach/route.js` | `lateFollowup` marker on approval items |
| `components/ApprovalQueue.jsx` | the batch set review (approve all, read each, discard one) |
| `tests/late-followup.test.mjs` | new — 36 tests |
| `package.json` / `package-lock.json` | 1.9.0 → **1.10.0**, lockfile synced |

## Post-deploy verification

Deployed as **v1.10, sha `ce022a6`** (built 2026-08-19T03:36:30Z), followed by **`b135deb`** (built 03:42:35Z), a small pacing fix found by watching the first live drain: a refused prospect's job completes as `done`, so the selector's half-day rest clause has to cover `done` as well as `failed`, or the four counter-mismatch prospects would have been re-enqueued every five minutes forever, each time taking a slot the per-drain cap meant for a real composition. Verified live: after the fix, the refused four were not re-enqueued.

Observed on the live drains (read-only D1 queries, 2026-08-19 03:40 to 03:57 UTC):

- **The drain enqueued exactly 5 jobs on its first pass** (the per-drain cap), and jobs ran one or two per drain behind the drain's inline mailbox maintenance — bounded, steady, and exactly the durable-queue behaviour everything else has.
- **The mailbox-agreement exclusion fired in production**: prospects 6218, 6228, 6232 and 6235 each completed `not-eligible` with the reason recorded on the job: *"The mailbox shows 1 outbound message and the counter says 2. Histories that disagree are excluded."* No package was written for them and no money was spent on them.
- **The first pilot draft composed at 03:55**: **package 24, prospect 6236, status `READY_FOR_APPROVAL`** — playbook `late-followup-close`, P1, `allowed_length` 3, `band_was_provisional` 0, `generator_version late-followup-2026-08.1`. Email 1 and Email 2 are the real sent copy verbatim (Email 2 even preserves the manual-era sign-off exactly as it went out). Email 3 reads:

  > Hi Melanie,
  >
  > Closing the loop on my two earlier notes about what happens after someone books your discovery call. If it's on your list somewhere down the line, I'm around. If not, this is the last you'll hear from me about it.
  >
  > Thanks,
  > Ary

  Grounded in the thread (the "after someone books your discovery call" angle is Email 1 and 2's), the approved shape, the escape hatch, no em dashes, no exclamation marks.
- **The second draft followed on the next drain**: package 25, prospect 6238, also `READY_FOR_APPROVAL`, its own angle ("the first reply after someone reaches out through your contact page") and a correct "Hi there." greeting for a prospect with no recorded name — the composer never guesses a stranger's name. At the time of this report **2 pilot drafts exist, 3 more compositions are queued**, and the pilot keeps accumulating autonomously, one or two per drain, until the cap of 15. With two or more waiting, the batch set review is live on the Approvals surface.
- **The refusal pacing is visible in production**: after `b135deb`, the four refused prospects were not re-enqueued; the selector topped the queue up with fresh cohort members instead.
- **The ledger arithmetic closes**: `send_events` reads 14 = the 10 baseline rows + 2 prospects × 2 backfilled historical rows, every new row `gmail-reconcile`.
- **The backfilled history is exactly the mailbox's truth**: send_events rows 11 and 12 (prospect 6236) — steps 1 and 2, `recorded_via gmail-reconcile`, `identity provider-message-id`, real Gmail thread ids, `sent_at` 2026-08-04 and 2026-08-06. This is what makes the eventual send count as step 3 and thread into the conversation Email 1 started.

**Zero sends occurred — proven three independent ways:**

| Proof | Before | After |
|---|---|---|
| `send_attempts` (written before any Gmail call; a send cannot happen without one) | 8, max id 8 | **8, max id 8 — unchanged** |
| `send_events` by route | 9 native + 1 skill-callback, zero gmail-reconcile | same 10, plus only `gmail-reconcile` rows carrying **historical** Aug 4/6 dates and real provider ids |
| The mailbox itself (sent-mail observer) | newest outbound 2026-08-18T23:14Z | **zero outbound messages observed after the deploy** |

**Package 23 is untouched**: id 23, prospect 3163, v3, APPROVED, P2, sequence_approved 1, max step 2, `auto_followup_approved 0`, `updated_at 2026-08-14T05:22:42.565Z` — byte-identical to the pre-work snapshot.

**Counters untouched**: cohort prospects still read `emails_sent = 2`, `replied = 0` after the backfill; the ledger records history, it does not invent sends.

**Automation switches untouched**: `autoSendApprovedFollowups:true` and `autoSendApprovedFirstEmails:true` appear in no workspace's settings, before or after.
