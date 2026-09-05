# Strategy V2 implementation report

Canonical strategy: `PROSPECTING-STRATEGY-V2.md`.

Everything below is shipped. Both auto-send switches remain OFF, and Stage B
runs in shadow only.

---

## Baseline

| | |
|---|---|
| Commit before changes | `b919790` |
| Tests before | **876 passing** |
| Tests after | **945 passing** (69 added) |
| Migrations before | 046 |
| Migrations after | **047** |
| Build | clean |

Existing primitives were reused rather than rebuilt: `lib/outbound.mjs`
(`canProgressOutbound`, the canonical reply rule), `lib/evidence.mjs`,
`lib/vet.mjs`, `lib/pick.mjs`, `lib/contact-discovery.mjs`,
`lib/send-guard.mjs`, `lib/send-policy.mjs`, `lib/reply-classify.mjs`,
`lib/prospect-view.mjs`. Gmail architecture is untouched.

---

## Final strategy fixes

### A1. Budget removed from semantic eligibility

`ELIGIBLE_FOR_VERIFICATION` was carrying "budget allows it", and failing
eligibility parks a prospect. A good prospect would have been **permanently
parked because that day's allowance ran out.**

Eligibility is now semantic only. Budget is a separate execution gate that
produces `WAITING_FOR_BUDGET`, which parks nothing and retries.

### A2. P3 receives a canonical package

The strategy said P3 never receives "the package" while also giving it one cold
touch, which is impossible if that email goes through the send system. P3 now
gets a **validated canonical package** for its single touch. What it is denied
is paid verification, paid contact work, assets, follow-ups, queue priority and
chasing a hard-to-find address.

### A3. A bounce no longer erases Strong

Bounce routed to `HELD`, which is defined as pre-Strong. That would have rewound
the verification, Vet result and Strong status of somebody already approved.
Contactability is now its own axis (`lib/contact-state.mjs`) with
`OK` / `NONE` / `NEEDS_CONTACT_RECOVERY`.

### A4. "P1 with thin evidence" corrected

That state cannot exist: P1 requires Strong, Strong requires sufficient
evidence. The website-audit trigger now names the real state, a **💚-rated
pre-Strong candidate**. Rating exists early; the formal band is assigned after
Strong.

### A5. The fingerprint covers follow-up copy

One approval authorises a whole sequence, so the fingerprint now covers every
permitted follow-up's exact subject and body, plus `allowed_length`,
`sequence_max_step` and `priority_band`. Copy regenerated after approval goes
stale and cannot send.

### Wording-only corrections found in the scan

- The research and band tables still said "budget allows"; removed.
- The pipeline diagram gained an explicit step 5b budget gate.
- Decisions 3, 7, 16 and 18 re-issued for consistency.
- Earlier in the same pass: the Stage B guard's "no reply of any kind" (which
  contradicted the autoresponder rule), `HELD` defined as Strong, the
  unsupported "705 had money spent" claim, and "the 740" vs 705.

---

## Schema changes

`migrations/047_strategy_v2.sql`, applied to production. Additive only:
`ALTER TABLE ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`. No data migration, no
backfill.

**prospects** — `contact_state`, `contact_state_at`, `contact_state_reason`,
`verification_state`, `verification_reason`, `verification_state_at`,
`priority_band`, `band_was_provisional`, `band_at`, `origin_class`,
`origin_subtype`, `origin_batch`, `origin_query`, `origin_at`,
`deferred_until`, `deferral_reason`, `deferral_promise`, `deferral_context`,
`deferral_source`, `offer_accepted_at`, `offer_accepted_step`

**outreach_packages** — `cta_class`, `promise_made`, `allowed_length`,
`followups`, `prepared_by`, `priority_band`, `band_was_provisional`,
`rating_at_prepare`

**send_events** — 24 measurement columns (listed under *Data to capture*)

**send_shadow_log** — new table: decision, block, reason, fingerprint_ok

⚠️ **Note on migration bookkeeping.** The `_migrations` table on production had
stalled at `019`, while the live schema is at `046`. Migrations 020 to 046 were
applied outside the runner and never recorded, so `scripts/migrate.mjs --remote`
tries to replay them and fails. 047 was applied directly and verified. **The
bookkeeping gap is pre-existing and is not fixed here** — reconciling it means
asserting which of 27 migrations already ran, and guessing wrong on that is a
data-integrity risk, not a chore. Flagged for a deliberate pass.

Verified live: 6 of 6 sampled new prospect columns present, `send_shadow_log`
queryable.

---

## Pipeline changes

```
1  INTAKE              origin_class required                free
2  PRESCREEN           dead address, platform, skip         free   code
3  CONTACT DISCOVERY   free, their own site                 free   code
   └─ nothing found → contact_state NONE (HELD). No paid step runs.
4  SIGNALS             evidence                             free   code
5  ELIGIBILITY         semantic only                        free   code
   └─ not eligible → PARKED, with a recorded reason
5b BUDGET GATE        allowance left today?                 free   code
   └─ no → WAITING_FOR_BUDGET, retried later
6  VERIFY-SITE         the deep probe                       PAID
7  EVIDENCE            tier + sufficiency                   free   code
8  VET                 STRONG / MAYBE / SKIP                free   code
9  STRONG GATE         the four tests                       free   code
10 PRIORITY BAND       existing rating, else provisional P2 free   code
11 PREPARE             native Sonnet OR skill-assisted
12 APPROVE             Ary: Email 1 + follow-ups + length + rating
13 SEND                native Gmail, app-owned
```

---

## CTA

`lib/cta.mjs`. Three classes: `MICRO_OFFER`, `OPEN_QUESTION`, `OTHER`.

**Classified semantically, never by punctuation.** A validator that rejected a
final sentence containing `?` would have rejected the best-performing close in
the database. `closingLine()` skips the sign-off and the name first, because an
early version of this scored "Thanks, Ary" as the call to action.

| Input | Class |
|---|---|
| "Want me to send it?" | MICRO_OFFER |
| "Shall I put together a quick rundown?" | MICRO_OFFER |
| "Reply and I will send a short list of the three I found." | MICRO_OFFER |
| "What are you doing about this?" | OPEN_QUESTION |
| "How are those going for you right now?" | OPEN_QUESTION |

An offer wins when both shapes appear, because the yes is what gets answered.
`OPEN_QUESTION` **warns, it does not block** — Ary may choose one knowingly.
Also recorded: `specific` (does it name the deliverable), `escapeHatch`, and
`promise_made`, extracted so fulfilment later is a lookup rather than a guess.

---

## Sequence policy

`lib/priority.mjs` is the single source of truth.

| Band | Touches | Spacing (days) |
|---|---|---|
| P1 (Strong + 💚) | 3 | 0, 4, 10 |
| P2 (Strong, unrated/neutral) | 2 | 0, 4 |
| P3 (Strong + ✖️) | 1 | 0 |
| no band | 0 | |

Spacing is inherited practice, recorded as a choice: report 5 measured which
step produced replies, never which interval did.

Emails 4+ require an explicit `manualOverride` on a named prospect.

**Three enforcement points, so no sender can exceed it:**

1. `maySendStep()` in the policy module
2. `validatePackage()` rejects a package whose `allowed_length` disagrees with
   its band, or that prepares a step past it
3. `canSendNow()` blocks at execution with `PAST_ALLOWED_LENGTH`

Plus `coldSequenceExhausted()` in `lib/due.mjs`, so a spent band is never even
surfaced as due. The legacy `Email 1..5` **stage strings are unchanged** —
renaming them would break every skill and saved view. The policy moved; the
labels did not.

---

## Contact discovery

Free native discovery runs for everyone who passed prescreen, including P3,
because it costs a page fetch that signals needs anyway. `lib/contact-save.mjs`
now writes `contact_state`, and deliberately **does not overwrite
`NEEDS_CONTACT_RECOVERY`** with a failed search: a dead address and a failed
search are different problems, and the first has qualification history behind
it.

Ownership classification unchanged and unrelaxed: `SAME_DOMAIN`,
`OWNER_EXTERNAL`, `THIRD_PARTY`, `UNKNOWN`.

No paid provider added.

---

## Verification eligibility and the budget queue

`lib/verification.mjs`.

| State | Meaning | Parks? |
|---|---|---|
| `ELIGIBLE` | go and spend | no |
| `NOT_ELIGIBLE` | a decision about the prospect | **yes** |
| `WAITING_FOR_BUDGET` | a decision about today | **no** |
| `REUSED` | fresh intel already answers it, for free | no |
| `VERIFIED` | done | no |

Ineligibility reasons are named and recorded: `prescreen-failed`, `no-contact`,
`contact-broken`, `no-fit`, `nothing-to-verify`, `paid-research-prohibited`,
`no-site`.

**Verification is never gated on Strong**, which is what breaks the old circular
dependency. There is a test asserting exactly that: a prospect with thin
evidence is eligible to verify, and simultaneously fails the Strong gate.

---

## Strong and priority

`strongGate()` requires all four: FIT, LEGITIMATE_CONTACT_REASON,
IN_SCOPE_OPPORTUNITY, SUFFICIENT_EVIDENCE.

**FIT is not "can they pay".** The website-audit skill phrases its tie-breaker
that way and the first draft copied it. There is deliberately **no argument that
takes a price, a postcode or a site score**. Ability to pay disqualifies only via
an explicit `explicitCannotPay` flag.

A rating never satisfies a Strong test. Tested: a 💚 prospect with no contact
reason is still not Strong.

Band assignment records `band_was_provisional` when nobody had rated the
prospect yet, so later analysis can tell a real P2 from one nobody looked at.

---

## Asset ladder

`lib/asset-ladder.mjs`. Ladder: plain text → written rundown → PDF → video →
live audit. Stop at the first rung that satisfies what was promised.

**There is no argument that takes a sequence step.** Reaching email 3 cannot
trigger a video and no step can trigger a PDF, because the function signature
makes it unexpressible. Triggers are `ACCEPTED_OFFER` and `ARY_REQUEST` only.

`planPackage()` in `lib/outreach.mjs` now forces cold packages to `none` for
both assets. The old V1 decisions are still computed and reported as
`wouldHaveSent`, so "what would V1 have done" stays visible while this beds in.

---

## Send policy consolidation

The app is now the only owner of: allowed length, send eligibility, send window,
timezone, **region scope**, stop conditions, fingerprint validity, dedupe, the
Gmail send and reconciliation.

`regionScopes` moved into workspace config (`lib/send-policy.mjs`) with
`regionScopeFor()`. It previously lived only in the sweep skill, which meant the
app and the skill each had an opinion about when it was reasonable to email
somebody and neither knew about the other.

`evidenceStaleDays` is workspace config, default 90, **recorded as a chosen
policy rather than a finding** so nobody reads the number as measured.

`lib/engine-prompts.mjs` restated every send default as a literal. It now
spreads `SEND_DEFAULTS`, with a test asserting the two agree. A copied literal is
a second send policy waiting to drift.

---

## Stage B shadow automation

`shadowDecision()` runs the **real guard** with the workspace switch forced on,
then returns a decision and sends nothing. `send: false` is on every result, and
there is no code path from the shadow route to Gmail.

`POST /api/send-shadow` evaluates approved packages and writes `WOULD_SEND` /
`WOULD_BLOCK` with the exact named block to `send_shadow_log`.
`GET /api/send-shadow` returns the rollup. Both are admin-only. Both report
`sent: 0` explicitly.

**Guard conditions enforced at execution time**, not at approval:

- [x] no stopping human reply — **asks the canonical rule**, so an autoresponder
      stops nothing
- [x] no unsubscribe or DNC
- [x] no decline
- [x] no deferral
- [x] contact address unchanged since approval
- [x] evidence fresh under `evidence_stale_days`
- [x] inside the send window
- [x] approval fingerprint valid
- [x] **this step's copy was in the package at approval**
- [x] not past `allowed_length`
- [x] pre-send guard passes
- [x] daily and hourly caps
- [x] `AUTO_SEND_FOLLOWUPS` enabled

New blocks: `COPY_NOT_APPROVED`, `PAST_ALLOWED_LENGTH`, `EVIDENCE_STALE`.

---

## Source provenance

`lib/origin.mjs`. `origin_class` required on new records, from
`MAP_LISTING | SOCIAL_POST | DIRECTORY | MANUAL | REFERRAL | REACTIVATION | OTHER`.

**Never inferred from evidence type or provider.** A record whose evidence is a
`MAP_LISTING` and whose provider is apify still fails without an explicit
origin, and there is a test for that.

⚠️ **One judgement call.** Requiring an explicit origin on `POST /api/prospects`
would have 400'd Ary's own "add a prospect" button. That route now defaults to
`MANUAL` via an opt-in `defaultClass` parameter, on the grounds that somebody
typing a business into a form **is** manual: that is a fact about the code path,
not an inference. Bulk importers get no default and must say. `UNKNOWN` can
never be laundered in through the default.

Legacy rows keep `UNKNOWN`. Nothing is backfilled.

---

## Deferrals

`lib/deferral.mjs`. `deferred_until`, `deferral_reason` (**quoted, never
paraphrased**), `deferral_promise`, `deferral_context`, `deferral_source`.

`next_action_date` is written alongside, and they are not duplicates:
`next_action_date` stays the operational date the outbound guard already reads,
`deferred_until` is the record of what was agreed. They can legitimately differ,
because Ary can snooze a row without anybody having deferred.

`dueToday()` surfaces them with the quoted reason and the promise.
`autoSend: false` on every row. `rejoinsColdSequence()` returns `false` and is
asserted in a test. Closed and opted-out prospects are never resurfaced.

Reply classification now writes a structured deferral automatically when a reply
classifies as `defer`.

---

## Two package execution modes

`lib/package-accept.mjs` is the single door.

| | Native | Skill-assisted |
|---|---|---|
| Prepares | app calls Sonnet | auto-prospect in Cowork |
| API spend | yes | **none** |
| Schema | canonical | **same canonical** |
| Validators | same | **same** |
| Label | `prepared_by: native` | `prepared_by: skill` |

Tested: the same package is accepted identically either way, and a rule-breaking
package is rejected with **byte-identical errors** in both modes. No privileged
skill bypass.

The validator rejects: a package that bypasses Strong, one addressed anywhere
but the prospect's current address, one whose `allowed_length` disagrees with
its band, one preparing a step past the allowed length, follow-ups with gaps
(step 3 could send while step 2 never existed), and any cold asset.

---

## API call changes

| Task | Change |
|---|---|
| `best5` | **No longer calls Sonnet by default.** The ordering was already deterministic in `lib/pick.mjs`; the model was rewriting five correct lines into five nicer lines at $0.033 a call, the highest-priced task in the app. The write-up survives as an explicit `writeUp: true` escalation |
| `draft` | Stays Sonnet. Now writes 2 or 3 emails instead of 5, only for Strong contactable prospects, and is skippable entirely in skill-assisted mode |
| `score`, `classify-reply`, `phrases`, `voice-note` | Unchanged on Haiku |
| `reply-coach`, `call-prep`, `proposal` | Unchanged on Sonnet, post-interest only |

Structural: a prospect that fails prescreen, has no contact, or is not eligible
for verification now costs **zero Claude calls**.

Nothing was downgraded to save fractions of a cent. Credit prices unchanged.

---

## Skill changes

All five repacked.

| Skill | V2 role |
|---|---|
| **auto-prospect** | Batch orchestrator and **first-class skill-assisted package preparer**. No five-email assumption, no PDF, no video verdict, no automatic Email 1 send. Writes back through the canonical path with `prepared_by: skill` |
| **daily-followup-sweep** | Queue orchestrator, auditor, recovery path. **VIDTEST retired. "Email 5 includes the PDF link" deleted. The past-Email-5 one-off video path retired.** Region scope read from app config |
| **website-audit** | Deep and exceptional review, ambiguous pages, QA. Off the default path. Trigger corrected to a 💚 pre-Strong candidate. Video tiers are a fulfilment aid, not a cold trigger |
| **prospect-pdf** | Fulfilment artifact. Trigger is an accepted promise or Ary asking, never a step |
| **daily-reply-sync** | QA, manual recovery, outside-app only. Must not rebuild Gmail |

Each now opens with the same ownership block naming what the app owns and
stating that a disagreement is worth reporting rather than silently resolving.

---

## Tests added

**69 new tests.** All 18 required regression scenarios are covered, plus:

| Scenario | Covered |
|---|---|
| 1. No contact | ✅ HELD, no paid verification, recoverable |
| 2. Budget exhausted | ✅ waits, `parks: false`, resumes when budget returns |
| 3. Known 💚 candidate | ✅ verifies on thin evidence → P1 → 3 touches |
| 4. Unrated candidate | ✅ provisional → P2 → 2 touches |
| 5. Approval-time 💚 | ✅ raises future length, no spend field touched |
| 6. Approval-time ✖️ | ✅ P3, one touch, future research refused |
| 7. Pre-existing ✖️ + thin evidence | ✅ free discovery yes, paid no, no send without Strong |
| 8. P3 with sufficient evidence | ✅ Strong + canonical package, no follow-up, no asset |
| 9. Autoresponder | ✅ does not stop progression |
| 10. Human reply | ✅ stops immediately |
| 11. Bounce after Strong | ✅ patch keys asserted to be contact-only |
| 12. Follow-up fingerprint | ✅ prepared copy sends, regenerated copy blocks |
| 13. CTA punctuation | ✅ both directions |
| 14. Cold assets | ✅ no step can trigger either |
| 15. Accepted offer | ✅ all five rungs |
| 16. Skill/native parity | ✅ identical acceptance and identical errors |
| 17. Source provenance | ✅ no inference, legacy UNKNOWN preserved |
| 18. Deferral | ✅ surfaces, never auto-sends, does not rejoin cold |

Plus: no duplicate sequence policy, no duplicate send-window policy, ability to
pay never inferred, a rating never satisfies Strong, both switches default off,
shadow mode never authorises a send.

Two fixture bugs found while writing these were **the guards working**: the send
guard refused partial prospect rows (`guardView`), and a test dated 2026-08-09
failed because that is a Sunday and the workspace does not send at weekends.

---

## Production safety verification

- [x] Full suite: **945 passing, 0 failing**
- [x] `npm run build`: clean
- [x] Migration 047 applied to production and verified by query
- [x] New workspaces migrate cleanly (047 is additive, no dependencies on data)
- [x] No legacy record fabricated or backfilled
- [x] `AUTO_SEND_FIRST` **OFF**, `AUTO_SEND_FOLLOWUPS` **OFF**, asserted in tests
- [x] Stage B produces shadow logs and no automatic send
- [x] Native sending passes existing production-path tests (`native-send.test.mjs`)
- [x] Gmail reply ingestion unchanged
- [x] Skill-assisted and native packages pass identical validators
- [x] No live code assumes 5 cold emails
- [x] VIDTEST: gone from live send paths. `lib/vidtest.mjs` remains a read-only
      historical view of markers already written
- [x] Email-5-PDF assumption: gone
- [x] Duplicate send-window policy: removed
- [x] Duplicate sequence-length policy: removed
- [x] `best5` model call: now opt-in
- [x] Canonical strategy reflects A1 to A5

---

## What remains OFF

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | **OFF**. Stage C is not designed |
| `AUTO_SEND_FOLLOWUPS` | **OFF**. Ships off, runs in shadow, only Ary enables it |
| Auto-video | OFF, and cold video is retired entirely |
| Auto-PDF | OFF, and step-triggered PDF is retired entirely |
| Paid contact provider | Not built |
| Automated sourcing | Not built |
| Approve All | Not built |

Auto-Vet 160/day and the 10/day draft cap are unchanged.

---

## What Ary needs to do manually

- Approve Email 1, applying 💚 or ✖️ as she goes
- Answer interested and ambiguous replies
- Decide `MAYBE` prospects
- Send reactivation emails (Kori Burkholder, Greg Lock, Irina Ertel, Jane Lee)
- Turn on `AUTO_SEND_FOLLOWUPS` when the shadow log looks right

## What Ary no longer needs to do

- Decide how many emails a prospect gets
- Hunt for email addresses
- Decide whether to make a video or a PDF
- Track what she promised somebody three weeks ago
- Check whether a follow-up would land on an unanswered reply
- Keep the sequence position in her head
- Watch `best5` spend a reasoning model on a list code already ranked

---

## Open questions and future measurements

1. **Is P1 = 3 right, or 2?** The prospective holdout is designed and not built.
2. **The `_migrations` bookkeeping gap** (019 vs a 046 schema). Pre-existing.
   Needs a deliberate reconciliation pass, not a guess.
3. **Free contact recovery yield.** 25 of 705 processed. The paid-provider
   question cannot be asked until this number is real.
4. **Current video economics: UNKNOWN.** No clean render sample since the
   timeout, audio-reuse and duplicate fixes. No repricing until there is one.
5. **`evidence_stale_days = 90`** is chosen, not measured. Config, so cheap to
   change.
6. **Where interested prospects die.** 21 interested, 1 client. Still not
   answerable, message bodies deliberately not stored. **The largest known gap in
   the business, and nothing in V2 addresses it.**
7. **UI surfaces not built this pass:** the held-contact review bucket, the
   approval throughput view, and a shadow-log dashboard. The data and the
   endpoints exist; the screens do not.

---

## Deployment

| | |
|---|---|
| Migration | `047_strategy_v2.sql`, applied to production D1, verified |
| Tests | 945 passing |
| Build | clean |
| Commit | see below |
| Deploy | `git push` ships app + worker. The render service is unchanged and not redeployed |
