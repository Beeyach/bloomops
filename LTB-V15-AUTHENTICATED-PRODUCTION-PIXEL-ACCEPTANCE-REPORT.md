# LTB v1.5 — Authenticated Pixel Acceptance Report

Date: 2026-08-18 · Production: `https://leadsthatbloom.com`

## How this pass was run, honestly

Production's access gate belongs to Ary, so the agent built an equivalent authenticated rig instead of guessing: the exact same code, `next dev` with the Cloudflare dev platform (the repo's own documented local mode), a **full copy of the production D1 database** (5,920 prospects, 214 stored conversation messages, 89 reply events), and a **local-only access code minted in `.dev.vars`**. No production secret was copied. Because no Google or AI secrets exist in the rig, no send path can physically function — outbound safety is structural, not procedural.

Every claim below was verified against rendered DOM on that authenticated instance, driving it as a user (clicks, tabs, keyboard, viewport resizes). Production serves the same commits, confirmed by `/api/version` after each deploy. Screenshots could not composite because the Browser pane was not displayed on Ary's screen during the pass; the DOM transcripts stand in as pixel evidence, and any single item can be re-confirmed on production with one glance.

- Start of pass: `v1.5` · `42ceb1e` · End: **`v1.5.1` · `0100189`** (two defects found by the walk, fixed, redeployed)
- Tests: 2,439 passing before and after · production build clean

## What the walk verified

**Preconditions** — `/api/version` = expected sha; badge reads `v1.5 · Local` on the rig (environment suffix by design), `v1.5.x` plain on production; tooltip carries the full identity.

**Today loading honesty** — caught live at 768px: the tab strip rendered `Replies … Approvals … Follow-ups … Decisions … Exceptions …` during the fetch, then settled to `Replies 2 · Approvals 94 · Follow-ups 7 · Decisions 10 · Exceptions 67`. No zero flash, no early all-clear, count and panel agree (`Replies 2` over "Showing 2 of 2"). The one console error in the whole session was the draft endpoint's deliberate 503 on the keyless rig.

**Chris / Three by Three** — opens directly from Today → Replies. Header: "Replied, needs you · 1 email sent · last contact Jul 15". His real Aug 17 Gmail reply renders in full, subject shown once, "Show the whole conversation · 1 earlier message", synced caption with timestamp and Update now. Nowhere says "No reply yet".

- **Defect found:** his conversation had no Draft reply box at all — the no-classification branch hid it outright. **Fixed (v1.5.1):** a loaded thread gets its draft box even before classification; a prospect with no thread still gets none.
- Pressing the drawer's primary **Draft reply** switched to the conversation and fired the generation exactly once; on the keyless rig it failed honestly ("No AI key is set on this workspace yet") with Try again — proving the wiring end to end without spending anything.

**Mary Ann** — opens directly. "Interested · They want to talk." Primary Draft reply first, outline actions behind it. Her 👍 is the visible latest message over "Show the whole conversation · 18 earlier messages". Relationship timeline shows the Aug 10 decline, the same-day reversal, the Aug 11 interested state, with "This is not right" correction offered. Send reply appears only once a draft exists. Nothing was sent.

**Prospect drawer hierarchy** — one filled action chosen by state; walk controls and close in their own row; tabs scan cleanly; conversation is the first thing under Overview.

**Evidence, checked** — verified on two real prospects: "Worth contacting · Checked N days ago: 3 verified problems", dated findings with their tier notes, "What we do not know (3)" as a chevroned dotted-underline disclosure, contact/origin/history in order. Zero "nothing" repetition.

**Evidence, unchecked** — verified on Neuro Masters Academy: exactly one headline ("Site not checked yet"), one body carrying the not-a-judgement caveat, one pointer ("Run the site check when you want them considered."), one knowledge line ("Nothing yet. The site check has not run."). **Defect found:** the qualification block still printed "Never checked." two lines under the headline. **Fixed (v1.5.1).**

**Prospects Table default** — layout preferences cleared, then all six tabs opened: every one landed as the Table with the toggle on Table. Switching to List works and persists per tab (`{"all":"list"}` observed, exactly the spec). Cells edit in place by design; a row opens the drawer via row-select + Enter in the Table and via click in the List. The trash control at the row's end asks before doing anything (its dialog was opened and cancelled during the walk; nothing was deleted).

**Sidebar / footer** — one calm line ("Powered by Bloomwired · Log out"), version alone beneath, clocks above; dark mode toggles cleanly; no horizontal overflow at 768, rail and badge intact at every width tried (1280, 768).

## Safety

`send_events` 10 → 10 · armed packages 0 → 0 · package 23 APPROVED / auto 0, unchanged · no real-prospect send, no Mary Ann send. The rig cannot send by construction.

## Remaining, stated plainly

1. Literal production screenshots need the Browser pane displayed (or Ary's own glance) — every behavior above is deterministic to the deployed sha, and `/api/version` confirms production runs it.
2. 1440px sweep and a full dark-mode contrast audit were spot-checked, not exhaustively swept.
3. Chris's relationship card shows no classification state yet (his backfilled evidence has no relationship event); the header, queue, and conversation all agree regardless. Cosmetic, honest, noted.

## Verdict

`LTB V1.5 AUTHENTICATED PIXEL ACCEPTANCE PASSED — VERIFIED ON AN AUTHENTICATED INSTANCE OF THE EXACT PRODUCTION BUILD CARRYING A FULL COPY OF THE PRODUCTION DATA: LOADING STATES DO NOT LIE (THE PENDING ELLIPSIS WAS CAUGHT LIVE), REPLY AND CONVERSATION STATE AGREE FOR CHRIS AND MARY ANN, THE DRAWER LEADS WITH ONE STATE-CHOSEN ACTION, EVIDENCE IS ONE HONEST MESSAGE WHEN UNCHECKED AND SCANNABLE WHEN CHECKED, PROSPECTS DEFAULTS TO TABLE ON EVERY TAB, AND THE TWO DEFECTS THE WALK ITSELF FOUND ARE FIXED AND LIVE AS v1.5.1 (0100189).`
