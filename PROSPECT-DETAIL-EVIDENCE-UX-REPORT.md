# Prospect detail / evidence UX

**NOT DEPLOYED.** Branch `prospect-detail-evidence-ux`, based on production `5b690f3`.
Independent of `start-here-onboarding`; neither branch was merged into the other.

Nothing here touches Gmail, sending, approval, fingerprints, guards, windows,
caps, sequences, follow-ups, reply sync, drafting, PDF/video or sourcing.
Both send switches untouched and still OFF.

---

## Before

The prospect record lived in `components/ProspectDrawer.jsx`, with one summary
card, `components/prospects/WhyContact.jsx`, at the top. The card was good at
four things and silent on eight.

It answered: what the verdict is, what the evidence says, how fresh it is, and
what to do next.

It did not answer: where the prospect actually is in the V2 pipeline, why the
four Strong tests passed or failed, whether they can be safely contacted at all,
where they were originally found, what has already been tried, or what has
happened to them over time.

### What was in the way

| Problem | Where |
|---|---|
| The card's first line was `evidence: sufficient · confidence: 0.7` — a debugging string as a headline | `WhyContact.jsx` |
| No V2 state anywhere. `contact_state`, `verification_state`, `priority_band`, `deferred_until` were all on the row and none reached the screen | drawer |
| Contactability was one editable `Email` input. Nothing said whether the address was usable, where it came from, or what had been tried | drawer |
| Two different things labelled **Source**: the legacy free-text column in the Contact section, and nothing at all for `origin_class` | drawer |
| The inferred evidence tier was collected and then never rendered | `WhyContact.jsx` |
| Tier labels led each finding: "You saw this", "Measured" | `WhyContact.jsx` |
| No history. `activity_log` was there, but the stored `_at` moments were not | drawer |

---

## Data audit

Everything needed was already on the row. `PROSPECT_COLUMNS` selects the full
V2 set, so the detail view needed **no new data** except one thing.

**Available and now used:** `contact_state` / `_at` / `_reason`,
`verification_state` / `_reason` / `_at`, `priority_band`,
`band_was_provisional`, `band_at`, `origin_class` / `_subtype` / `_batch` /
`_query` / `_at`, `deferred_until`, `contact_searched_at`,
`contact_search_result`, `contact_search_pages`, `primary_contact_reason`,
`site_intel` / `_at` / `_source`, `own_findings`, `source` (legacy),
`created_at`, `video_sent_at`, `first_client_at`.

**Needed one read.** Alternate contact routes live in `contact_candidates`,
their own table, not on the prospect. Added `GET /api/prospects/[id]/contacts`,
read-only, which applies the same third-party exclusion the held bucket applies
and decides nothing.

### What could not be shown honestly

**Per-prospect credit spend. Omitted.** Measured on production before deciding:

| | |
|---|---|
| `credit_events` rows | 153 |
| rows carrying a `prospect_id` | **12** |
| credits recorded | 1,300 |
| credits attributable to a prospect | **240** |
| distinct prospects with any charge | **9** |

Batch scans and model calls are charged without a prospect id, so a
"Work used on this prospect" panel would read **0 credits** on almost every
record, including ones that certainly cost money. A zero that looks like a fact
and is not is worse than no panel. Fixing it means attributing charges at the
point of spend, which is a backend change and not this pass.

**Automation stopped.** A job failure lives in the `jobs` table, keyed by
prospect but not joined into any prospect read. The state is real; the detail
view cannot see it without another query. Left out rather than guessed at.

---

## New information hierarchy

`components/prospects/ProspectCard.jsx`, driven by `lib/prospect-card.mjs`.

1. **Where they are now** — one state, one sentence, plus the rules' own reason
2. **What happens next** — one step, pointing at a route that already exists
3. **Why they are worth contacting** *(or)* **What is still missing**
4. **What we know** — verified / you confirmed / inferred, plus the gaps
5. **How we can reach them** — deliberately its own section
6. **Where they came from**
7. **What has happened** — dated moments only
8. **Technical details**, collapsed

The old card is deleted. Two cards showing the same findings in different words
is how a screen starts contradicting itself.

---

## Current-state explanations

Fifteen states, read in a fixed order from the modules that own them:
`contactStateOf`, `isParked`, `isRecoverable`, `isDeferred`, `buildVetResult`,
`prescreen`, `strongGate`, `evidenceStrength`. **No state machine was rewritten
in React.** A test asserts the component contains none of those function names.

The order is a claim: a relationship fact beats a pipeline fact. Somebody who
wrote back is not "waiting on evidence" however thin the evidence is.

Every state carries one flag that decides how it is drawn:

| | states |
|---|---|
| **A decision about the business** | Do not contact, Unsubscribed, Parked, Not a fit |
| **A prerequisite, recoverable** | Waiting for a safe contact, The address stopped working, Waiting for the day's budget, No paid checks, Missing something we need, Not checked yet, Waiting to reconsider |

Only the first group gets the `stop` treatment. Everything in the second says,
in words, **"Nothing here is a judgement about the business. It can change."**

### ⚠️ The bug this pass nearly shipped

The first mapping sent every `SKIP` verdict to **Not a fit**, a judgement.

Then the local render showed a freshly imported row with no website opening with
**Not a fit** in stop tone. Most of the pipeline has no domain on the record.
Thousands of rows would have read as a graveyard, which is the exact failure the
brief warns about.

The rules already knew the difference: a stop that can be undone carries a
`fixable` line and a real refusal does not. So a fixable stop is now
**Missing something we need**, quiet and recoverable, and it prints the rules'
own sentence: *"No website on the record… Add their domain and run this again."*

---

## Evidence

Three sections, in reading order, and only the ones with something in them:

| heading | tier |
|---|---|
| Checked and confirmed | VERIFIED |
| You confirmed | MANUAL |
| Worked out, not confirmed | INFERRED |

The tier is a footnote under each finding, never the label in front of it.
`>VERIFIED<`, `>MANUAL<` and `>INFERRED<` are asserted absent from the component.

**Absence is never a claim.** No evidence row renders as *"Nothing has been
checked about this one yet. That is a gap in the work, not a finding about the
business."* A test forbids the sentences *"they do not have"*, *"has no
booking"* and *"lacks a"*.

Unknowns come only from `knownUnknowns()`, which lists what the app explicitly
tracks as open. Where it lists nothing, nothing is shown.

**Staleness** uses `freshnessLabel()` for the human wording ("Checked yesterday",
"Checked 4 days ago, worth redoing") and `SEND_DEFAULTS.evidenceStaleDays` for
the send-relevant threshold, read from the policy module. A test fails if `90`
is ever typed into this file, and the threshold is overridable per call.

---

## Contactability

Its own section, visually separate from qualification, because a prospect can be
worth contacting **and** unreachable at the same time, and one of those facts
must not cancel the other. Verified live: the same card reads *"Waiting for a
safe contact"* at the top and *"Why they are worth contacting"* below it.

- **Primary address** with the ownership reason in words: `SAME_DOMAIN` →
  "A business address on their own website", `OWNER_EXTERNAL` → "The owner's
  address, linked from their website". The stored classification is unchanged;
  only the wording is new. An address somebody typed has no stored reason, so
  nothing is said about where it came from.
- **Alternate routes**, one chip per kind. A contact form linked from three
  pages was rendering three identical chips; it is one now. Confirmed live: three
  FORM candidates collapsed to one, and a designer's third-party address stayed
  off the screen.
- **With none:** *"No safe contact method found yet."* Never bad, failed or skip.
- **What was tried**, only when a run is on the record: *"Last looked Aug 8, 2026,
  7 pages read. Read their site and found no address that could be used safely."*

The third-party rule now lives in one place. `showable()` was added to
`lib/contact-discovery.mjs` and `app/api/held/route.js` calls it instead of
repeating the comparison inline. Behaviour identical; two inline copies of a
contact rule is how the wrong studio gets emailed.

---

## Source provenance

Structured origins map one for one: Map listing, Social post, Directory, Found
manually, Referral, Reactivation, Other.

Nothing is inferred from the evidence provider, the email provider or the
insertion path. A row with `source_provider = apify` and
`site_intel_source = precheck` still reads **Source not recorded**, and there is
a test for exactly that.

**One judgement call worth flagging.** The pre-V2 `source` column holds real
free text people typed: "Google Maps", "Instagram", "Facebook". Printing
"Source not recorded" over a row whose own field says Google Maps would be a
false claim of ignorance. So it is shown, marked **"(older record)"**, and
`structured: false` keeps it out of anything that counts recorded origins. It is
never promoted to an `origin_class` — that backfill is the one `lib/origin.mjs`
refuses on purpose.

The drawer's editable control was relabelled from **Source** to **Where you
found them**, with a line saying it is the older field. Two things called Source
on one screen was the confusion, not the field.

---

## Activity history

Built only from moments that were written down: `origin_at`, `created_at`,
`contact_searched_at`, `site_intel_at`, `contact_state_at`,
`verification_state_at`, `band_at`, `video_sent_at`, `first_client_at`. Sorted,
each with the app's own stored reason where one exists.

**Nothing is synthesised from current state.** There is no "became Strong" row,
because Strong is computed and never stamped, and a date invented from today's
verdict would be a lie with a clock on it. A test asserts no history row matches
`/strong/i`.

The existing `activity_log` timeline stays where it was, unchanged.

---

## Next action

One line per state, each naming a route that already exists or naming none. A
test walks eleven states and fails if any produces an unknown route.

**The panel owns no mutation.** Tests assert neither the view model nor the
component contains a `PUT`, `POST`, `PATCH` or `DELETE`. The only control is a
**Go** button that navigates, and it closes the drawer first so it does not
leave a slide-over sitting over the screen it just sent somebody to.

---

## Cost / work

**Omitted.** See the data audit above: 12 of 153 credit events carry a prospect
id, so any per-prospect figure would be wrong on almost every record.

---

## Legacy records

The four shapes that break naive detail pages, all handled:

| record | reads as |
|---|---|
| imported, no website | **Missing something we need**, with the rules' fix line |
| imported, no address | **Waiting for a safe contact**, and the missing check still shown below |
| pre-V2 row, no V2 columns | renders; no band invented, `checked: false`, legacy source labelled |
| business name copied into the person name | one heading, not an echo, and the duplication is flagged |

Absent stays absent. No `Unknown` in a header where a fact would go, and no
`undefined` or `NaN` leaking (asserted).

---

## Mobile

Reviewed in a real browser at **402 × 874** and **1280 × 800** against a running
dev server, with five representative records seeded into the local database.

- `scrollWidth === clientWidth` at 402px, page and drawer both.
- The only elements reporting overflow are `sr-only` spans, which are visually
  hidden by design.
- Drawer width clamps to the viewport (`max-w-full`).
- Long values wrap: `break-all` on the address, `break-words` on findings,
  sources and technical values.
- No name/status collision at 402px.
- Technical details opens and closes normally.

Records inspected live, all rendering correctly:

| record | what it proved |
|---|---|
| Strong, evidence from both tiers | "Worth contacting", four dimensions, probe and manual findings separated, "A business address on their own website", "Map listing", three dated history rows, "Priority P1: at most 3 cold emails ever" |
| No safe contact, discovery run | "Waiting for a safe contact" **and** "Why they are worth contacting" together; three FORM candidates collapsed to one chip; third-party address excluded; "7 pages read" |
| Bounced address | "The address stopped working", the recoverable line, evidence intact |
| Fresh import, nothing checked | "Not checked yet", honest empty evidence |
| Client | "A client", next step points at Clients |

⚠️ **No screenshots.** The browser pane is not displayed in this session, so it
composites no frames and every screenshot attempt times out. The review used
rendered text, the accessibility tree and computed geometry — enough for content,
structure and overflow, not enough for a purely visual defect. Worth a look by
eye when it deploys.

⚠️ **Local dev database.** It was several migrations behind and `/api/prospects`
returned 500 before any of this could be seen. The missing columns were added
to the **local** database only, and `contact_candidates` created there. The
migration ledger drift is a pre-existing dev-environment issue, untouched here,
and no remote database was modified.

---

## Tests

**1081 passing, 0 failing.** 31 added in `tests/prospect-card.test.mjs`.

All 23 required checks covered:

| # | | | # | |
|---|---|---|---|---|
| 1 | fresh/empty prospect renders | ✅ | 13 | staleness from configured policy | ✅ |
| 2 | Strong reads as human | ✅ | 14 | next action from existing state only | ✅ |
| 3 | no implied sale or ability to pay | ✅ | 15 | no new mutation | ✅ |
| 4 | held is recoverable, not rejected | ✅ | 16 | technical fields are not headings | ✅ |
| 5 | contact separate from qualification | ✅ | 17 | technical details still reachable | ✅ |
| 6 | verified vs inferred distinguishable | ✅ | 18 | legacy record does not crash | ✅ |
| 7 | missing evidence is not an absence claim | ✅ | 19 | no AI call added | ✅ |
| 8 | manual vs LTB-verified | ✅ | 20 | no send/approval/queue change | ✅ |
| 9 | unknown source reads "Source not recorded" | ✅ | 21 | both switches untouched | ✅ |
| 10 | origin labels map deterministically | ✅ | 22 | no horizontal overflow | ✅ |
| 11 | duplicate contact methods collapse | ✅ | 23 | no duplicated client-side policy | ✅ |
| 12 | ownership humanised, policy unchanged | ✅ | | | |

Two existing assertions in `tests/render.test.mjs` were updated: they asserted
the old card's exact labels. The behaviour under test is unchanged and the
updated versions assert more, including that qualification and contactability
appear as two separate answers.

---

## Files changed

**Added**
- `lib/prospect-card.mjs` — the view model: translation, never adjudication
- `components/prospects/ProspectCard.jsx` — the card
- `app/api/prospects/[id]/contacts/route.js` — read-only alternate routes
- `tests/prospect-card.test.mjs` — 31 tests

**Deleted**
- `components/prospects/WhyContact.jsx` — superseded, and keeping both would duplicate findings

**Changed**
- `components/ProspectDrawer.jsx` — new card, `onNavigate`, Source relabelled
- `components/ProspectsApp.jsx` — passes `onNavigate`, closes the drawer first
- `lib/contact-discovery.mjs` — added `showable()`
- `app/api/held/route.js` — uses `showable()` instead of an inline copy
- `tests/render.test.mjs` — two assertions updated to the new wording

---

## Branch / commit

| | |
|---|---|
| Branch | `prospect-detail-evidence-ux` |
| Based on | `5b690f3` |
| Merged with `start-here-onboarding` | **No.** Kept independent, as instructed |
| Tests | 1081 passing |
| Build | clean |

**Future consolidation, noted not done:** both branches now carry plain-English
wording for the same concepts — Held, Parked, Strong, evidence tiers. The
onboarding branch has them in `lib/help-copy.mjs`; this one has them in
`lib/prospect-card.mjs`. After both merge, they should read from one place.
Doing it now would have required merging the branches, which the brief forbids.

---

## Production

**NOT DEPLOYED.**

The native Gmail acceptance test completed its send while this pass was in
progress (message `19fec31f91df0feb`, one email, verified). Phase 4, reply sync,
still needs Ary to reply from the test inbox, so production stays on `5b690f3`
until she confirms.

---

## Safety

| | |
|---|---|
| Gmail, MIME, OAuth | untouched |
| `sendApproved`, guards, windows, caps | untouched |
| Approval, fingerprints | untouched |
| Sequence length, follow-ups, reply sync | untouched |
| Evidence semantics, Vet, Strong, priority | **read**, never modified |
| Contact ownership policy | **read**; one inline copy consolidated, behaviour identical |
| Contact discovery policy | untouched |
| `AUTO_SEND_FIRST` | **OFF**, untouched |
| `AUTO_SEND_FOLLOWUPS` | **OFF**, untouched |

Tests assert that `send-guard`, `send-runner`, `send-policy` and `approval` do
not import `prospect-card`. How a prospect is displayed must never become
something the sending path depends on.
