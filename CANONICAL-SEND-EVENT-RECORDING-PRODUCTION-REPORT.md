# Canonical send-event recording

**Date:** 2026-08-11
**Status:** complete. Every native send records its real step and timestamp.
**Commit:** `60e39dd` — deployment `373cf9ef`, Production, Active
**Tests:** 1,573 passing (21 new)
**Emails sent: 0. Model calls: 0. Credits: 0. Historical events fabricated: 0.**

---

## Before

The premise going in was that sends were failing to record. **They were not.**

| | |
|---|---|
| successful native send attempts | 4 |
| of those with a matching send event | **4** |
| events carrying a real provider message id | **5 of 5** |
| events in total | 5 |

All four successful native sends recorded an event, each identified by the id
Gmail returned. The fifth came from a skill callback. **Only five events exist
because only five emails have ever gone through LTB at all.** The 1,106
contacted prospects were emailed before the product could send; nothing failed
to record them, because nothing was ever asked to.

> **How a native send could succeed without leaving a scheduling anchor:** it
> could not, and it never did. What it left was the *wrong step*.

## The real defect

```js
const step = isFollowup ? (Number(prospect.emails_sent) || 0) + 1 : 1;
```

Neither caller sets `isFollowup`. The queue passes it from a payload nothing
populates yet, and **the manual "Send now" button never passed it at all**. So
every send derived **step 1**.

Nothing had broken, because every send so far genuinely *has* been a first
email. But the first real Email 2 would have been filed as an Email 1, and the
scheduler — which anchors Day 4 and Day 10 on Email 1 — would have read that
date as the start of the sequence and pushed Email 3 out by however long the gap
was. The blocker this pass exists to close would have been replaced by a quieter
one.

## Ownership audit

| path | writes an event? |
|---|---|
| `sendApproved` in `lib/send-runner.mjs` (native Gmail) | yes, after provider success |
| `app/api/outreach/sent/route.js` (skill callback) | yes |
| `reconcileSends` in `lib/send-events.mjs` (mailbox repair) | yes |
| human replies | no — those are `reply_events` |

One canonical write, `recordSend`, reached from the send finalisation path.
Nothing was scattered; no new writer was added.

## Canonical event write

Unchanged in shape and deliberately so. After Gmail returns success:

1. `send_attempts` → `succeeded`, with the provider message and thread ids
2. `recordSend(...)` → the durable event
3. package → `SENT`
4. **only if the event recorded**, `emails_sent` and the contact dates advance

Step 4 is the reason summary fields and event history cannot silently disagree:
the counter moves exactly as often as the event is written, and that was already
true before this pass.

## Exact step

`nextColdStep(db, workspace, prospect, { ceiling, declared })` now owns it.

- **Recorded events are the authority.** The step is the count of real cold
  events plus one.
- **`emails_sent` is the fallback**, used only when a prospect has no events.
  Every prospect contacted before LTB could send is in that state; without the
  fallback their next email would record as step 1 and restart a sequence that
  is already part done.
- **Past the ceiling blocks.** `PAST_ALLOWED_LENGTH`, and the package records
  the reason.
- **A caller that disagrees blocks.** If a request declares a step that does not
  match what is on record, nothing is sent and nothing is recorded. The email
  has not left at that point, so refusing costs nothing and guessing costs a
  false entry in the sequence history.

`isFollowup` is kept for compatibility and no longer decides the number.

**The bound also lives at the write.** `recordSend` refuses any step outside
1–3, derived from the band table rather than typed. So a fourth cold email
cannot be recorded by any route, and nothing that is not a cold step can be
filed as one.

## sent_at

The provider-success timestamp taken at finalisation, the same clock the send
attempt uses. Not approval time, not draft time, not the scheduled due time, not
cron time. A repaired event keeps the attempt's own `finished_at` rather than
the repair time.

## Dedupe

`dedupeKey` is `msg:<provider message id>`, against a unique index, written with
`INSERT OR IGNORE`. One provider success is one event however many times it is
replayed — tested for a straight repeat, for a later reconciliation of the same
message, and for a repair run twice.

The attempt key (`prospect:step:fingerprint`) stops the send itself repeating: a
`succeeded` attempt returns "already sent", and an `in-flight` one reconciles
rather than re-sending.

## Partial failure

Gmail accepts, the attempt is marked succeeded, the event insert then fails.
The email is gone and nothing downstream knows it exists.

Before this pass the only recovery went through a mailbox scan, even though the
attempt row already held every fact needed. Now `repairMissingEvents` reads
succeeded attempts with no matching event and rebuilds each one from its own
provider id, step and finish time.

- It **never re-sends**, asserted by test against the function body.
- It is **idempotent** through the same dedupe key.
- A step or a finish time that is not on record makes the row **unrepairable and
  reported**, never invented.

A resend cannot happen either way: the same attempt key returns "already sent".

## Cold sequence versus human replies

Replies live in `reply_events` and never touch this table. That was already
true; what was missing was anything enforcing it. The 1–3 bound at the write now
makes a non-sequence row impossible to file as a cold touch, so Ary replying to
an interested lead can never become "Email 3".

## Summary fields

Left alone deliberately. `emails_sent` and `last_contact_*` remain for fast
reads and legacy compatibility, and they still advance only when an event was
actually recorded. No destructive refactor, and no second source of truth: the
step now reads events first and falls back to the counter only where no events
exist.

## Historical corpus

**Nothing was fabricated.** No Email 1 event was created for a two-send prospect
by subtracting four days, no timestamp was reconstructed from a sequence offset,
no provider id was invented, no step was guessed.

The **52 UNCLEAR P1 Email 3 candidates remain UNCLEAR**, and will until real
events exist for them.

## Safe repairs

Production dry run:

```
successful send attempts        4
send events before              5
succeeded with no event         0
repairable from stored facts    0
not repairable                  0
send events after               5
```

**Nothing needed repairing**, which is the audit result restated: every
successful send already recorded. The repair path exists for the failure mode
that has not happened yet, and its dry run proves it correctly finds nothing.

## Scheduler proof

The load-bearing test, on recorded facts alone with no `last_contact_date` in
play:

1. Email 1 sends → step derived as **1** → event at T0
2. At T0 + 4 the scheduler says **Email 2 due**, anchor `send event`, dated T0
3. Email 2 sends → step derived as **2**, not another 1
4. At T0 + 10 the scheduler says **Email 3 due**, still anchored on **Email 1**
5. Email 3 sends → a fourth step is refused, and the prospect reads Finished

Also proven: P2 stops after two, P3 after one, and the same prospect with two
sends and *no* events stays UNCLEAR — so the historical rows keep behaving
honestly while new ones do not need the fallback at all.

## Production effect

From now on, every native cold send records which email it was and when it
really went. That is the whole change; nothing about existing rows moved.

## Safety

| | before | after |
|---|---|---|
| `send_attempts` | 4 | **4** |
| `send_events` | 5 | **5** |
| events with a provider id | 5 | **5** |
| `send-approved` jobs | 1 | **1** |
| `credit_events` | 199 | **199** |
| `ai_usage` | 53 | **53** |

- **No real prospect emailed.** No Gmail send of any kind. Sarah and Mary Ann
  untouched. Everything was proven with fixtures against a D1 stand-in.
- `AUTO_SEND_FIRST` **off**, `AUTO_SEND_FOLLOWUPS` **off**. Neither touched.
- Scanner concurrency **2**.
- Unchanged: the V2 generator and its prompts, follow-up wording, shadow
  preview, Today UX, V2 timing, band mapping, the relationship model, evidence
  rules, CTA strategy, Gmail MIME and threading, provider reconciliation,
  dedupe, the name guard, Hive, the scheduler heartbeat, the daily wake, cron,
  credit pricing.
- No migration and no schema change: `send_events` already had every column
  this needed.

**Still open, untouched:** plaintext Anthropic key in `settings`, and the
`VERIFY_SITE` refund missing a prospect id.

## Tests

**1,573 passing**, up from 1,552. 21 new in `tests/send-event-recording.test.mjs`
covering the step bound, dedupe under replay and reconciliation, step derivation
from events and from the legacy fallback, the disagreement block, the
partial-failure repair with its exact preservation of id, time and step, the
unrepairable cases, and the Email 1 → 2 → 3 walk.

One of those tests was wrong on the first run and worth recording: it asserted a
P2 was exhausted after only *one* recorded send. The code was right; the fixture
was. Fixed by recording the second send before asserting.

## Production

Commit `60e39dd`, deployment `373cf9ef`, Production, **Active**. Served-build
evidence remains partial for the usual reason — `build.commit` sits behind the
access gate — so what is confirmed is the deployment record plus production
counts read directly from D1 before and after.

## Remaining gap

**Controlled follow-up automation readiness and a canary.** Not started here,
and neither switch was touched.

---

`SEND EVENT RECORDING VERIFIED — EVERY NEW NATIVE COLD SEND NOW LEAVES THE TIMESTAMP V2 NEEDS FOR THE NEXT STEP`
