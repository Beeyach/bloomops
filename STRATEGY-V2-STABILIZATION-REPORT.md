# Strategy V2 stabilization report

A short pass before Ary starts relying on the new workflow. No redesign.

Both send switches remain OFF. Stage B is shadow only.

---

## Baseline

| | |
|---|---|
| Commit before | `56f726e` (V2 implementation) |
| Commit after | **`8fb5050`** |
| Tests before | 945 |
| Tests after | **963 passing, 0 failing** |
| Migrations | 047, unchanged. No 048 created |
| Build | clean |

---

## Issues fixed

### 1. Approval-time rating and package length

The workflow edge case that would have quietly cost something.

A package prepared overnight for an unrated prospect runs as **provisional P2**
and carries Email 1 and Email 2. At approval Ary rates it 💚, making it P1, which
allows three. But Stage B only ever sends copy that was in the package when she
read it. So either the 💚 bought nothing, or something generated Email 3
afterwards and sent words nobody had seen.

The reverse was worse. Same package, marked ✖️, band becomes P3, allowed length
becomes one, and Email 2 is sitting there approved and schedulable, aimed at
somebody she has just said no to.

**Fixed in `lib/approval.mjs`.** The package is reconciled against the **final**
band before an approval can be valid.

| Transition | Result |
|---|---|
| P2 → P1, Email 3 missing | ⚠️ **CORRECTED 2026-08-10.** Originally `canApprove: false`. That read the band as a quota; the strategy says "up to 3". Now `PACKAGE_PARTIAL`, approvable, and the card states the coverage. The safeguard is the send guard refusing uncovered copy |
| P2 → P1, Email 3 present | `READY`. Fingerprint covers all three |
| P2 → P3 | `PACKAGE_TRIMMED`. Email 2 demoted to a draft, not deleted. Approval proceeds, because removing an email needs nobody to judge anything |
| Unchanged | Approve normally |

A demoted follow-up stays on the record with `approved: false`. `preparedFollowups()`
filters those out, so **the send guard cannot see it** and `stepCoveredByApproval()`
refuses it. Kept rather than destroyed because Ary may rate the prospect back up
tomorrow, and rewriting copy we already have would be silly.

**Nothing generates follow-up copy after approval.** That is the rule the whole
mechanism exists to hold.

`POST /api/outreach` accepts `rating`, applies it, reconciles, and returns
**409** with the missing steps when the package does not match. The old
`sequence_max_step: Number(body.sequenceMaxStep) || 5` is gone: the app owns the
number and the caller does not get to name one.

### 2. Contactability versus parking

The implementation listed `no-contact` and `contact-broken` as ineligibility
reasons under a state whose table said *parks: yes*. That reintroduced the
budget contradiction through a different module.

**Canonical rule: contactability is a recoverable prerequisite, never a
judgement about the prospect.**

`lib/verification.mjs` now answers with three separable facts:

| | meaning |
|---|---|
| `mayRun` | may verification spend money right now |
| `parks` | is this a decision **about the prospect** that stops the pipeline |
| `waits` | will this resolve on its own |

| State | mayRun | parks | recoverable |
|---|---|---|---|
| `ELIGIBLE` | yes | no | |
| `NOT_ELIGIBLE` | no | **yes** | no |
| `WAITING_FOR_CONTACT` | no | **no** | **yes** |
| `WAITING_FOR_BUDGET` | no | **no** | **yes** |
| `RESEARCH_PROHIBITED` | no | **no** | **yes** |
| `REUSED` | no | no | |

`NOT_ELIGIBLE` is now reachable only by genuine semantic refusals:
`prescreen-failed`, `no-fit`, `nothing-to-verify`, `no-site`.

The blocked reasons moved into their own `BLOCKED` object, so a caller reaching
for `INELIGIBLE.NO_CONTACT` finds nothing and has to notice. There is a test
asserting that name no longer exists in the ineligibility vocabulary.

A ✖️ prospect is `RESEARCH_PROHIBITED` rather than parked, because they still
get their one touch and can still reach Strong on evidence we already have.

### 3. Source provenance on manual add

**I put the `MANUAL` default there and it was wrong.**

`origin_class` means where the business was **found**. Ary seeing a studio on
Facebook and typing it in is a `SOCIAL_POST`, however manual the keystrokes.
Defaulting would have filled the acquisition data with a value that means "we
did not ask" — exactly the hole report 5 could not climb out of.

**Fixed:** `POST /api/prospects` has **no default**. The Add Prospect form now
asks "Where did you find them?" as a one-tap choice, with an optional detail
field whose placeholder changes per choice ("What did you search for?", "Which
platform?", "Who referred them?").

`defaultClass` survives in `lib/origin.mjs` for trusted machine callers such as
a reactivation job, and is documented as never being for a user interface. It
can never launder `UNKNOWN` into new intake.

Legacy rows keep `UNKNOWN`. Nothing backfilled.

---

## Approval UI

`components/ApprovalQueue.jsx`, in Today where it already lived. A second place
to look is a place that gets forgotten.

> ⚠️ **This section described the first version of the card and is superseded.**
> Living with it showed that it led with debugging data, repeated the same
> finding three times, and offered a disabled button above a paragraph of rules.
> The card was rebuilt on 2026-08-10. See
> `V2-ACCEPTANCE-TEST-REPORT.md` for what it shows now: name, business, one
> recommendation, one finding, the email, and one button whose label matches
> what it does, with everything internal under a collapsed **Details** control.

The original design notes are kept below for the record.

- "This approval sends N emails" as the count
- the final band, recomputed live
- the rating control as three buttons
- CTA class said in words
- who wrote it, and the evidence age
- every prepared step, with drafts labelled

**The approve button was disabled while copy was missing.** That rule has since
been corrected: a band is a ceiling, not a quota, so a short package is
approvable and the card states its coverage instead.

---

## Shadow dashboard

`components/ShadowPanel.jsx`, in Settings next to the switches it is about.

Shows total evaluated, would-send, held back, and **actually sent: 0**. Block
counts by reason, with every guard reason translated into English
("That email was not in the package when you approved it", "They replied and
nothing has gone back yet"). Filter chips per reason. A "Check now" button that
runs the shadow pass.

Header states plainly: **"Watching only. No follow-ups are being sent."**

**There is no enable button on this screen.** The switch lives in settings, it
is off, and only Ary turns it on. The dashboard shows `n` and does not suggest a
threshold.

---

## Held bucket

`components/HeldPanel.jsx` and `GET /api/held`.

Titled **"Waiting on a way to reach them"**, with the subtitle *"Not skipped,
and not judged."* The word skip does not appear anywhere on the screen, and the
API returns `skipped: false` explicitly so no interface has to infer it.

Two tabs: *never found one* (`contact_state = NONE`) and *stopped working*
(`NEEDS_CONTACT_RECOVERY`).

Each row shows the prospect, website, rating, why contact is blocked, the last
discovery attempt with pages checked, and safe alternate ways in (form, phone,
Instagram, Facebook, LinkedIn) with `THIRD_PARTY` candidates filtered out.

Critically, each row also shows **what is still true about them**: your notes,
the site check, the band. On a bounce none of that is lost, and the screen says
so, so picking one back up never reads like starting again.

"Look again" enqueues a fresh free search through the durable queue.

---

## Migration ledger

Full detail in **`MIGRATION-LEDGER-RECONCILIATION.md`**.

| | |
|---|---|
| Before | ledger at 019, schema at 047, runner broken |
| After | **47 of 47 proven applied and recorded** |
| Method | postconditions extracted per migration, checked against sqlite catalogues |
| Backup | `wrangler d1 export` to `backups/pre-ledger-repair.sql`, 19.3 MB, taken first |
| Replayed | **nothing** |
| `migrate.mjs --remote` | **clean: 0 pending** |

⚠️ **Two real bugs found in the runner**, which are almost certainly why the
ledger drifted in the first place:

1. Wrangler's version banner made `JSON.parse` throw on every call. The throw
   was swallowed, so the runner read the ledger as **empty every time**, tried
   to replay 001 against a live database, and reported a parser problem as a
   database problem.
2. `--file` returns a summary; only `--command` returns rows. The runner sent
   its `SELECT` through a temp file, so even with the banner fixed the ledger
   came back as an object rather than names.

Between them: a migration runner that could never succeed on a database that had
ever been migrated.

New tooling: `scripts/ledger-audit.mjs`, with its classification logic unit
tested, including the refusal to record a partial migration.

Migration 048 is now safe to create.

---

## Contact discovery backlog

Production state, checked directly:

| | n |
|---|---|
| Cohort (💚, has website, no address, active) | **702** |
| Ever searched | 25 |
| **Remaining** | **~702** |
| Already queued | **0** |

The queue was idle because **nothing was feeding it**. Discovery has run inside
the durable queue for a while, but only the pipeline enqueued it, so the standing
backlog sat still.

**Built `POST /api/contact-discovery`**, which enqueues either named prospects
(the held bucket's "Look again", with `force` clearing the refresh window) or the
next N of the cohort in batches of up to 50. `GET` reports cohort size, searched,
remaining, queued and results by outcome.

No V2 gate blocks free discovery: it runs for everyone who passed prescreen,
including ✖️. What ✖️ is denied is **paid** spend.

No paid provider added. Backpressure rules untouched. The backlog is not drained
in this pass and this task was not blocked on it.

---

## Tests

**963 passing, 0 failing.** 18 added in `tests/stabilization.test.mjs`.

All 12 required scenarios covered:

| # | Scenario | |
|---|---|---|
| 1 | provisional P2 → 💚 requires a 3-touch package before approval | ✅ |
| 2 | provisional P2 → ✖️ results in one approved touch | ✅ |
| 3 | fingerprint covers the final reconciled package | ✅ |
| 4 | no-contact is recoverable and non-parking | ✅ |
| 5 | contact-broken preserves Strong/Vet/evidence | ✅ |
| 6 | explicit social origin remains `SOCIAL_POST` | ✅ |
| 7 | explicit map origin remains `MAP_LISTING` | ✅ |
| 8 | no silent inference from the insertion path | ✅ |
| 9 | ledger tool refuses to mark an unproven migration applied | ✅ |
| 10 | shadow always reports sent = 0 while the switch is off | ✅ |
| 11 | held bucket never labels contact-blocked prospects SKIP | ✅ |
| 12 | both auto-send switches remain OFF | ✅ |

Four earlier Strategy V2 tests asserted the **old** parking semantics and were
updated to the corrected ones. That is the change, not a regression: they were
encoding the contradiction this pass removed.

---

## Production deployment

| | |
|---|---|
| V2 implementation commit | `56f726e` |
| **Stabilization commit** | **`8fb5050`** |
| Cloudflare Pages deployment | `e0694bf3-0b8f-4a58-be3f-d3b205d26a61` |
| Source | `8fb5050` |
| Status | **Active** |
| Environment | Production, branch `main` |
| Verified at | 2026-08-10 |
| Migration status | 047 applied, ledger 47/47, 0 pending |

Verified by reading the deployment list and matching the source hash, not by
assuming `git push` deployed.

---

## Switch state

| Switch | State |
|---|---|
| `AUTO_SEND_FIRST` | **OFF** |
| `AUTO_SEND_FOLLOWUPS` | **OFF** |
| Stage B | **shadow only** |
| Auto-video | OFF, cold video retired |
| Auto-PDF | OFF, step-triggered PDF retired |
| Paid contact provider | not built |
| Automated sourcing | not built |
| Approve All | not built |

---

## What Ary should review next

1. **Open Settings and press "Check now" on the follow-up panel.** It will
   evaluate approved packages and show what it would have done. Nothing sends.
2. **Read the block reasons.** Anything that reads wrong is a bug to fix, not a
   rule to relax. There is no sample threshold and none should be invented; she
   decides when it looks trustworthy.
3. **Look at the held bucket.** 702 businesses are waiting on an address. Some
   have a contact form or an Instagram already found.
4. **Add one prospect** and check the "Where did you find them?" choice reads
   naturally. Every future acquisition answer depends on that one tap.
5. **Approve one package** and confirm the "This approval sends N emails" line
   matches what she thinks she is authorising, especially after changing the
   rating.

Draining the 702 is a separate decision about how fast to work through them.

**Follow-up auto-send is not ready to enable, and will not be until Ary has read
real shadow output.**
