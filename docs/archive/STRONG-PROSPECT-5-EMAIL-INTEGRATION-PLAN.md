# Strong prospect: five emails and the Email 5 PDF

A planning pass. No code, no schema, no deployment. Nothing here is built.

---

## Inputs used, and where they actually came from

`authoritative-inputs/` does not exist on this machine. The six files were found
elsewhere and identified by content, not by path. Exact provenance, so there is
no ambiguity about what was read:

| File | Path used | md5 | Size |
|---|---|---|---|
| `website-audit.skill` | `Downloads/website-audit.skill` | `7c06aec2…` | 20,359 B |
| `prospect-pdf.skill` | `Downloads/prospect-pdf.skill` | `7ea5bcbb…` | 27,773 B |
| `FONT-RULE-FOR-PROSPECT-PDFs.txt` | `Downloads/Bloomwired/` | `4efe88a9…` | — |
| `InstrumentSans-VariableFont_wdth,wght.ttf` | `Downloads/Fonts/` | `9024f291…` | 193,312 B |
| `InstrumentSerif-Regular.ttf` | `Downloads/Fonts/` | `1e3bf8f4…` | 69,312 B |
| `InstrumentSerif-Italic.ttf` | `Downloads/Fonts/` | `4036d1c3…` | 70,868 B |

**The two skills are the pristine originals, not my repacked copies.** The repo's
`skills/website-audit.skill` is 24,087 B because I prepended a Strategy V2
ownership block to it on 2026-08-09. It was not read for this plan. Neither were
the July copies in `Downloads/Skills/`, `Downloads/Personal/reels/`, or
`.codex/attachments/`.

The three fonts are **byte-identical** to `public/fonts/*.ttf` already in the
repo (193,312 / 69,312 / 70,868). Same files, correct names.

Also read: `LEADSTHATBLOOM-CODEX-LIVE-PRODUCTION-HANDOFF.md`,
`PROSPECTING-STRATEGY-V2.md`, `AUTOMATION-MAP.md`, and current `main`.

---

## 1. Current implementation

### What generates Email 1

`KIND.PREPARE_OUTREACH` → `lib/runner.mjs` → `planPackage()` and
`buildEmailParts()` in `lib/outreach.mjs` → one Sonnet call → validated by
`validateOutreachEmail()` → written to `outreach_packages.email_subject` and
`email_body`. One email. There is no second email anywhere in that path.

### What generates follow-ups

⚠️ **Nothing writes a follow-up into a package.**

`KIND.PREPARE_FOLLOWUP` → `buildFollowUpParts()` → writes
`prospects.pending_draft`, which is the **legacy** column that now feeds the
*Old drafts* section. It is plain text for pasting into Gmail by hand, it is not
part of any package, and it can never be sent by the app.

This is the single largest gap between the skill and the product.

### Where copy lives now

| | |
|---|---|
| Email 1 | `outreach_packages.email_subject` / `email_body` |
| Follow-ups | `outreach_packages.followups` — a JSON column that **exists and is always null in production** |
| Legacy drafts | `prospects.pending_draft` |
| PDF | nowhere. `prospects.review_url` holds a URL that is set by hand |

`followups` was added in migration 047 with the shape
`[{step, subject, body, approved}]`. Every production package has it null.

### Sequence policy

`lib/priority.mjs`: `TOUCHES = { P1: 3, P2: 2, P3: 1 }`, `SPACING` of
`[0,4,10]` / `[0,4]` / `[0]`. Documented as a **ceiling** ("how many cold emails
this prospect may ever receive").

### Evidence

`lib/evidence.mjs`: three tiers (`MANUAL` / `VERIFIED` / `INFERRED`), four
sufficiency levels. `lib/qualify.mjs` carries the ported unverified-absence
rules. The deep probe is `KIND.VERIFY_SITE` → the Cloud Run render service,
20 credits, 14-day reuse via `site_intel`.

### Gmail

`lib/gmail-send.mjs` `buildMime()` emits **`Content-Type: text/plain` only**. No
multipart, no base64 parts, no attachment support of any kind.

### Credits

`lib/credits.mjs` `PRICES`: `precheck: 20`, `video: 200`, `lead-draft: 5`,
`proposal: 25`. **There is no PDF price and no sequence price.**

---

## 2. Confirmed conflicts

Every one is recorded, not silently resolved. Recommendations are in §3 onward.

### C1 — Sequence length: 5 versus 3

The skill: Email 1 Day 0, Email 2 Day 3, Email 3 Day 7, Email 4 Day 14, Email 5
Day 21. The app: P1 = 3 at days 0, 4, 10.

**Both are internally honest and they disagree on the evidence base.** The skill
cites "4-5 emails total; more than that triples spam/unsubscribe risk". Strategy
V2 cites the reconstructed population: emails 1 and 2 convert at 2.9% and 3.0%,
email 3 at 1.2%, and emails 4 to 6+ cost about 1,457 sends for 4 interested
replies at 0.6% to 1.2% against a 7.9% baseline.

⚠️ **The strategy's number is measured on Ary's own 935 conversations. The
skill's is a general-practice default.** That is the deciding difference, and it
is why §3 does not simply adopt 5.

### C2 — The PDF has nowhere to live at Email 3

The prospect-pdf skill is explicitly "the Email 5 piece". Under a 3-email
sequence there is no Email 5. Either the PDF moves, or it stops being a
sequence artifact.

### C3 — `Systems Setup` versus `Full Lead Path Setup`

The skill says both. Line 27: *"use 'Full Lead Path Setup,' never 'Systems
Setup,' unless Ary explicitly asks."* Then the ANGLE MATCHING table maps eight
angles to **`→ Systems Setup`**, with a parenthetical that it is "the internal
label for this tier".

**Confirmed conflict inside the skill itself**, not between skill and app. A
generator reading the angle table without reading line 27 would put "Systems
Setup" into prospect-facing copy.

### C4 — "Can they pay" versus Strategy V2 FIT

Skill line 56: *"Tie-breaker: **can they pay**, and is there a real gap you can
verify."* Line 120 repeats it.

Strategy V2 §Strong explicitly removed this: FIT is business, service-model,
offer and platform fit, and *"ability to pay disqualifies only on explicit
evidence… never inferred. No proxy rules, no scoring, no inference from site
quality or price points."*

⚠️ **Direct contradiction.** The app's rule is the stricter and the fairer one,
and it exists because the earlier phrasing invited guessing at somebody's
finances from their website.

### C5 — Gmail attachment instructions

**This one dissolves on reading.** Both skills forbid attaching:

- website-audit: *"No file attachments; the PDF is always a link."* and
  *"never says 'attached'."*
- prospect-pdf: *"The PDF goes out as a link… never a file."*

The reason given is deliverability: Gmail flags "attached" wording when nothing
is attached. So the app's lack of attachment support is not a gap to close. See
§8.

### C6 — Skill-controlled send rules versus app-owned send policy

The skill specifies cadence (§SEQUENCE CADENCE), send timing (*"Tuesday through
Thursday, 8-11 AM in the recipient's time zone"*), and a VIDTEST 50/50
assignment run by the sweep.

Strategy V2 gives the app canonical ownership of allowed length, send
eligibility, send window, timezone, region scope, stop conditions, fingerprint,
dedupe, the Gmail send and reconciliation. The VIDTEST was retired.

### C7 — Cowork automation assumptions versus guarded approval

The skill's full-sequence mode assumes one pass producing five emails plus a
PDF, banner-wrapped "so Cowork can split them", with the sequence going out on a
cadence. The app requires human approval of Email 1 and keeps
`AUTO_SEND_FOLLOWUPS` OFF.

### C8 — Routes to an unverified claim

The skill is unusually strong here (verification ladder, raw-HTML hard stop,
confirmation gate, unverified-absence rules) and mostly **exceeds** the app. Two
places still need an app-side gate:

- The confirmation gate is a *chat* interaction (*"Ary, can you confirm…"*).
  There is no product state for "STRONG but emails wait on confirmation".
- `video_tier: SEND` and `❌ VERIFIED MISSING/BROKEN` are reachable from a
  rendered check, but nothing in the product records *which* tool established
  the verification, so a fetch-only run and a rendered run look the same later.

### C9 — Automatic sending while both switches are OFF

The skill's cadence assumes emails go out on days 3, 7, 14 and 21 without
further human action. Both auto-send switches are OFF and Stage B is shadow
only. **Under current settings a five-email sequence would produce five approved
emails and send zero of them.**

### C10 — The video placement policy is stale

The skill's 2026-08-05 policy describes a live VIDTEST A/B on Email 3. Strategy
V2 retired cold video entirely on outcome evidence (465 sends, zero attributed
clients) and retired the VIDTEST with it.

### C11 — Font filenames

The font rule and generator require exact filenames. `public/fonts/` holds the
same bytes under different names (`instrument-sans-var.ttf` etc.), and
`find_font()` does exact-name matching with no globbing. `--require-fonts`
against `public/fonts` would **abort**.

---

## 3. Recommended sequence contract

**Recommendation: adopt the five-email structure as the WRITING contract, and
keep the app's band ceiling as the SENDING contract. They are different
questions and the current conflict comes from treating them as one.**

| | Owner | Value |
|---|---|---|
| How many emails get **written** | website-audit skill | 5, at the skill's cadence intent |
| How many may be **sent** | `lib/priority.mjs` | P1 = 3, P2 = 2, P3 = 1 |

A package therefore carries up to five prepared emails, and the band decides how
many are ever sendable. Steps past the ceiling are stored `approved: false` —
the mechanism `allFollowups()` and `preparedFollowups()` already implement for
demoted drafts.

**Why this and not simply raising the ceiling to 5:**

1. The ceiling is set by Ary's own measured population. Raising it to 5 on the
   strength of a general default would discard the only evidence either side
   has.
2. Writing five costs one model call either way (§12). Sending five costs 1,457
   sends per 4 interested replies.
3. It is reversible in one constant. If the 2-vs-3 holdout ever argues for a
   longer tail, the copy already exists and only `TOUCHES` changes.
4. It resolves C2 without moving the PDF: **the PDF attaches to the last email
   the band allows**, and its content does not depend on being fifth.

⚠️ **This is the one decision in this plan that is genuinely arguable, and it is
Ary's to make.** §15 states the alternative.

**Cadence:** the app's `SPACING` stays authoritative (C6). The skill's day
numbers become the intent for a five-email world and are recorded, not executed.

---

## 4. Five-email package state model

One package. One angle. Up to five emails, each with its own state.

```
PACKAGE
  PREPARING → READY_FOR_APPROVAL → APPROVED → (sending) → SENT/EXHAUSTED
       ↓                ↓
  NEEDS_DECISION    BLOCKED
```

Per email:

| State | Meaning |
|---|---|
| `WRITTEN` | copy exists and passed the violation scan |
| `WITHIN_BAND` | step ≤ allowed length, so it may be approved |
| `BEYOND_BAND` | written, stored, `approved: false`, never sendable |
| `APPROVED` | covered by the approval fingerprint |
| `SENT` | a send event exists |
| `STALE` | regenerated or edited after approval |

**Invariants, all of which the send guard already enforces or extends
naturally:**

1. An email with no body can never be approved or sent.
2. An email beyond the band can never be approved.
3. `stepCoveredByApproval()` refuses any step whose exact copy was not in the
   package at approval.
4. Email 5 (or the last banded email) may only carry a PDF reference if the PDF
   exists and is itself approved.

---

## 5. Proposed data model

**No new table for emails.** `outreach_packages.followups` already holds
`[{step, subject, body, approved}]` and is null everywhere. Extend the object
rather than adding a table:

```
followups: [
  { step, subject, body, approved,
    scan: { violations: [], scannedAt },   // §9
    generatorVersion, writtenAt }
]
```

Email 1 stays in `email_subject` / `email_body` for compatibility with every
existing consumer.

**New columns on `outreach_packages`:**

| Column | Purpose |
|---|---|
| `sequence_length` | how many were written (up to 5), distinct from `allowed_length` |
| `angle_hash` | fingerprint of the verified angle every email and the PDF share |
| `pdf_asset_id` | FK to the PDF record |

**New table `prospect_assets`** — one row per generated artifact:

```
id, workspace, prospect_id, package_id, kind ('pdf'),
slug, url, checksum, bytes, generator_version, font_set_hash,
angle_hash, config_json, state, created_at, approved_at, superseded_by
```

`state`: `GENERATING | READY | APPROVED | STALE | FAILED`.

---

## 6. PDF generation and storage

**Generator:** `prospect-pdf/scripts/generate.py`, unchanged. It is Python +
WeasyPrint, so it cannot run on the Cloudflare edge. It belongs on the **Cloud
Run render service**, which already runs Python and Playwright for the audit
video and the site probe, and already has an authenticated upload path.

**Fonts.** The rule is explicit and the generator enforces it: materialise the
three TTFs into a working directory, pass `--font-dir`, pass `--require-fonts`,
and *"do not silently fall back to Georgia, Times, Arial, or system fonts"*.

⚠️ **C11 must be fixed for this to work at all.** The render service needs the
files under their exact names. Recommendation: copy them into
`tools/render/fonts/` with the exact names the generator matches, and record a
`font_set_hash` on every PDF so a font swap is detectable later. Do **not**
rename `public/fonts/*` — the web app's `@font-face` rules point at those.

**Storage:** R2, behind `https://file.gobloomwired.com/review/{slug}`, which is
the URL both skills already specify and which `prospects.review_url` already
holds. Nothing new is invented.

**Identity:** `checksum` (sha256 of the bytes), `generator_version`,
`font_set_hash`, `angle_hash`, and the exact `config_json` passed in. Those five
answer "is this the PDF she approved" without keeping a second copy.

---

## 7. Approval and invalidation

**Recommendation: one approval for the package, not one per email.** Approving
per email would make the queue five times longer for no extra safety, and the
count of what is covered is already stated on the card.

What one approval covers, all of it inside `approvalFingerprint()`:

- Email 1's exact subject and body
- every within-band follow-up's exact subject and body
- `allowed_length`, `sequence_length`, `priority_band`
- `angle_hash`
- **`pdf_asset_id` + the PDF `checksum`**

**Invalidation:** any of the above changing makes the fingerprint stale, and a
stale fingerprint blocks the send. This already works for emails; adding the
checksum extends it to the PDF for free.

### If Ary edits the angle after the PDF is generated

The angle is shared by all five emails and the PDF, so editing it invalidates
everything downstream. Proposed behaviour:

1. `angle_hash` changes.
2. Every email and the PDF go `STALE`.
3. The PDF row is marked `superseded_by` rather than deleted — the old one may
   already have been emailed, and deleting it would break a live link.
4. The package returns to `READY_FOR_APPROVAL` with a plain line: *"You changed
   what this is about, so the emails and the note need rewriting."*
5. **Nothing regenerates automatically.** Regeneration costs money and the
   approval card must never show copy nobody asked for.

---

## 8. Native Gmail attachment plan

**Recommendation: do not build attachment support.**

Three independent reasons, and they agree:

1. `buildMime()` is `text/plain` only. Adding multipart is real work in the
   narrowest-scope OAuth surface the product has.
2. **Both skills explicitly forbid it.** *"No file attachments; the PDF is
   always a link."*
3. The stated reason is deliverability, and it is a good one: Gmail penalises
   "attached" wording, and a cold email with a PDF attached from an unknown
   sender is a spam signal.

**What ships instead:** the PDF is rendered, uploaded to R2, and Email 5 carries
`https://file.gobloomwired.com/review/{slug}` on its own line under *"Here's the
link to it:"*, exactly as both skills specify. No Gmail change of any kind.

An app-side validator should **reject** any email body containing "attached"
alongside a PDF reference, since that is the precise failure the rule exists to
prevent.

---

## 9. Evidence requirements

Nothing in the evidence system weakens. Two additions:

**Verification method must be recorded.** The skill's raw-HTML hard stop only
works if the product knows which tool established a fact. Proposal: every
evidence row carries `method` of `rendered` / `fetch` / `manual`, and a
`❌ VERIFIED MISSING/BROKEN` claim requires `rendered` or `manual`. A
fetch-only run can produce `⚠️ UNVERIFIED` and nothing stronger.

**The confirmation gate needs a product state (C8).** The skill can say
*"STRONG, emails waiting on Ary's confirmation"*; the app cannot represent it.
Proposal: `NEEDS_CONFIRMATION` on the package, surfaced in *Needs your
decision*, showing the specific claim, what was checked, and what it might be
(pop-up, anchor, iframe, JS). It is not an approval queue item because there is
nothing to approve yet.

**The violation scan is a product step, not a chat step.** The skill's two-step
output (draft scan then final) is currently a thing a model does in a
conversation. Stored per email as `scan.violations`, it becomes checkable, and a
package with unresolved violations cannot reach `READY_FOR_APPROVAL`.

---

## 10. Credit and cost model

Measured basis from `AI-COST-MODEL.md`: input is tiny, output dominates,
prompt caching does nothing at these sizes.

| Action | Real cost | Proposed credits | Basis |
|---|---|---|---|
| Five emails, one call | ~$0.04 to $0.06 Sonnet | **35** | ~3x, one call not five |
| PDF render | ~$0.01 Cloud Run, no model call | **15** | ~3x, plus failure share |
| Regenerate one email | ~$0.02 | **10** | |
| Regenerate the PDF | ~$0.01 | **10** | |
| Site verification | unchanged | 20 | existing `precheck` |

**One call for five emails, not five calls.** The skill writes the whole
sequence from one angle in one pass, which is both what it specifies and the
cheaper shape. Five separate calls would cost five system prompts to produce
copy that must stay consistent anyway.

⚠️ Video stays at 200 and **is not part of this work**. Cold video is retired
and its current economics are unknown.

---

## 11. Stop conditions

Unchanged, and the app remains the owner. Any of these stops the remaining
sequence, whatever the skill's cadence says:

reply (human, not an autoresponder) · decline · unsubscribe · DNC · deferral ·
bounce or invalid address · became a client · evidence older than
`evidence_stale_days` · contact address changed since approval · stale
fingerprint · allowed length reached · Ary's manual stop · package skipped

**The PDF link keeps working after a stop.** It may already have been emailed,
and breaking a live link because the sequence ended would be a bug.

---

## 12. Migration for existing three-email packages

There are no three-email packages. Production holds **two** packages, both with
`followups = NULL`, `allowed_length = NULL`, `priority_band = NULL`.

So there is nothing to migrate, and nothing should be backfilled:

- Existing packages stay one-email and stay approvable as such.
- No package is regenerated automatically. Regeneration costs money and produces
  copy Ary has not read.
- `sequence_length` is null on old rows and reads as "written before sequences",
  which is true.
- Old drafts stay in Old drafts. They never become sequence emails.

---

## 13. Test plan

**Pure logic** (fast, no network):

1. A package with 5 written and P1 exposes exactly 3 as sendable, 2 as
   `BEYOND_BAND`.
2. P2 exposes 2. P3 exposes 1.
3. An email beyond the band can never be approved or sent.
4. The fingerprint changes when any email body, the band, `sequence_length`,
   `angle_hash` or the PDF checksum changes.
5. Editing the angle marks all five emails and the PDF stale.
6. A stale PDF checksum blocks the send of the email that references it.
7. An email body containing "attached" plus a PDF reference is rejected.
8. Every stop condition halts the remaining sequence.
9. A superseded PDF keeps its URL.

**Violation scan** — one test per rule in the skill's step-1 list, using real
sentences from the skill's own bad examples: unverified absence as a finding,
invented visitor moment, "pain point", exclamation mark, em dash, metaphor,
missing escape hatch in Email 1, "attached" in Email 5, `Systems Setup` in
prospect-facing copy (C3), bare `$297` without a currency code.

**PDF generation** — golden-file test that `--require-fonts` **fails** when the
font directory has the wrong filenames (C11), and succeeds with the correct
ones; that the rendered PDF embeds Instrument Serif and Instrument Sans and
**not** Georgia or Times; and that `offers_url`, `home_url` and
`setup_check_url` exist as real link annotations.

**Production-path** — the approval card renders correctly for a 5-written /
3-allowed package, and states what the approval covers.

---

## 14. Implementation slices, in order

Each is independently shippable and independently reversible.

| # | Slice | Why here |
|---|---|---|
| **1** | **Sequence writer**: one Sonnet call writes 5 emails from one verified angle into `followups`, with the violation scan stored per email | The gap everything else waits on |
| 2 | Approval card renders N emails, states coverage, extends the fingerprint | Ary must be able to read what she is approving |
| 3 | Angle-change invalidation, plus the `angle_hash` column | Before any PDF exists to invalidate |
| 4 | Font set into `tools/render/fonts/` with exact names, plus the `--require-fonts` failure test | C11, and it blocks slice 5 |
| 5 | PDF generation on the render service, R2 upload, `prospect_assets` | Needs 3 and 4 |
| 6 | PDF bound to the last banded email, checksum in the fingerprint | Needs 5 |
| 7 | `NEEDS_CONFIRMATION` package state and its Today surface | C8, independent |
| 8 | Evidence `method` recording and the `rendered`-required rule | C8, independent |
| 9 | Credits for sequence and PDF | Last, once real costs are observed |

---

## 15. Risks and unresolved decisions

**⚠️ D1. Five written versus three sent is Ary's call, not mine.** §3 recommends
writing five and sending the band. The alternative is honest: raise `TOUCHES.P1`
to 5 and follow the skill exactly. That trades her measured population evidence
for a general-practice default, and it would send roughly 1,457 extra emails per
4 interested replies at her volumes. I recommend against it, and the holdout in
Strategy V2 exists precisely to settle it with her own data.

**⚠️ D2. `Systems Setup` versus `Full Lead Path Setup` (C3).** The skill
contradicts itself. Recommendation: the app treats `Systems Setup` as an
internal angle key only, and any generator output containing it in
prospect-facing copy fails the violation scan. **Ary should confirm** that is
what she meant by line 27.

**⚠️ D3. "Can they pay" (C4).** Recommendation: the app's rule wins and the
skill's tie-breaker is not ported. This is a deliberate refusal to implement a
line in an authoritative input, and it is flagged rather than done quietly.

**D4. The PDF outlives the sequence.** If the angle changes after a PDF has been
emailed, the prospect holds a link to a note about the old angle. Superseding
rather than deleting keeps it working, but the content is stale and there is no
good answer beyond not changing the angle after Email 5.

**D5. One call for five emails may drift.** Five emails from one prompt risks
the "repeats a sentence shape from another email" violation the skill warns
about. Mitigation: the scan checks across the set, not per email.

**D6. Cadence intent versus app spacing (C6).** The skill's days 0/3/7/14/21 are
recorded as intent. The app's `[0,4,10]` executes. If the ceiling ever rises,
the two need reconciling in one place.

**D7. Nothing sends while both switches are OFF (C9).** Five approved emails
will produce zero sends until Ary turns follow-ups on. That is correct and
deliberate, but it should be said out loud on the approval card so the sequence
does not look broken.

---

## 16. Recommended first implementation slice

**Slice 1: the sequence writer.**

One Sonnet call, given the verified angle and evidence already on the record,
writes five emails following the skill's structure, runs the violation scan on
each, and stores them in `outreach_packages.followups` with their scan results.

**Why this first:**

- It is the actual missing piece. Every other slice waits on copy existing.
- It touches no send path, no Gmail, no approval semantics, and no production
  data. The column exists and is null everywhere, so writing to it cannot break
  a live package.
- It is verifiable without sending anything: five bodies, one angle, zero
  violations.
- It is reversible by clearing one column.

**Explicitly not in slice 1:** no PDF, no fingerprint change, no card change,
no credit change, no sequence-limit change. The band still allows what it
allows, and the extra emails sit stored and unsendable until slice 2 renders
them and slice 6 binds the PDF.

---

**Nothing in this document is built. Both send switches remain OFF. No email was
sent, no package approved, no prospect altered, and no outreach was generated
for `arylombres@gmail.com`. Awaiting Ary's approval.**
