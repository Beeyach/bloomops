# Existing-prospect routing: what happens next, in words

**Date:** 2026-08-11
**Tests:** 1,623 passing (21 new)
**Emails sent: 0. Model calls: 0. Prospect history rewritten: 0 rows.**

---

## Fresh counts

Recalculated from current production, not carried over.

| | count |
|---|---|
| live prospects | **5,814** |
| never contacted | 4,707 |
| ever contacted | 1,107 |
| replied | 68 |
| 1 cold send | 233 |
| 2 cold sends | 101 |
| 3 cold sends | 121 |
| 4+ cold sends | 652 |
| ready-for-approval packages | 1 |
| approved, not sent | 2 |

5,814 rather than 5,813 and 1,107 rather than 1,106 because of the canary test
record. Everything else matches the accepted reference exactly.

## Old model versus new

The interface led with the stage: Email 1 through Email 5. **652 prospects sit
at the end of that ladder and not one of them is waiting for anything**, so the
number was the wrong thing to show first.

`lib/prospect-action.mjs` answers *what happens next* instead. It decides
nothing: the schedule comes from `nextFollowupSchedule`, the relationship from
the timeline, the ceiling from `effectiveCeiling`. It turns those into a label,
a sentence and a pile. A test asserts it contains no `TOUCHES`, no `SPACING`,
no stale threshold and no way to send, queue or write.

## Every live prospect, routed

| what it says | count |
|---|---|
| No address yet | 4,291 |
| Old sequence finished | 622 |
| Not contacted yet | 410 |
| Needs email address | 160 |
| Sequence finished | 159 |
| Needs your reply | 66 |
| Timing unknown | 52 |
| Email 2 coming up | 32 |
| Email 2 due | 12 |
| Needs a fresh check | 8 |
| Interested | 2 |
| | **5,814** |

By pile: not-contacted 4,701 · finished 781 · needs-attention 220 ·
needs-you 68 · follow-up 44.

**Today would show 332, not 5,814** — and the exception list is capped at 6 with
a count, so 68 people who actually wrote back cannot be buried under 160 missing
addresses.

### A bug the production run caught

The first version ran the follow-up router over everybody, which filed **4,451
never-contacted rows as "Needs email address"** with the words *"we contacted
them before, but the record no longer has a usable email"*. That never happened
to any of them. Never-contacted is now answered before the schedule is consulted
at all, and reads **"No address yet"**.

## What happens to each group

- **0 sent** — "Not contacted yet", or "No address yet". Off Today. Only a
  package a person can approve becomes "Ready for approval".
- **1 sent** — "Email 2 due" / "coming up", or "Sequence finished" for a ✖️.
- **2 sent** — "Email 3 due" with a real anchor; **"Timing unknown"** without
  one, saying plainly that the first email's date was never recorded.
- **3 sent** — "Sequence finished" for every band.
- **4+ sent** — **"Old sequence finished"**, quiet tone, off Today. No word like
  error, failed or broken appears in it; a test enforces that.
- **replied** — **"Needs you"** at any send count, named by the relationship
  when there is one. Outranks the old stage entirely.
- **no address after contact** — "Needs email address".
- **stale** — "Needs a fresh check".

## Technical details policy

Every state still carries its `code` and full `schedule` for a collapsed
System details section. A test asserts no label, detail or context line contains
an underscore, a raw timestamp, a uuid, `NULL`, `undefined` or `NaN`.

Diagnostics are kept. They are just not what a person reads first.

## History

**Nothing was rewritten.** No stage was bulk-set, no timestamp fabricated, no
sequence restarted. Every state above is computed from facts already stored.

## Safety

No email sent, no send job, no model call, no credits. Both auto-send switches
unchanged and OFF. Scanner concurrency 2. The canary (prospect 6567, package
14), the send engine, threading, dedupe, the scheduler, the generator, reply
sync and the relationship model were not touched.

## Remaining gap

**The visible wiring.** The routing engine, the counts and the tests are done
and deployed; Today and the Prospects list still render the old stage-led
layout. Wiring those two screens to `prospectActionState`, plus the row
hierarchy and the collapsed System details, is the next pass and needs browser
verification rather than tests alone.
