# LTB — Fable 5 Deep Product QA + Premium Polish Report

Date: 2026-08-18 · Production: `https://leadsthatbloom.com`

## Versions

- **Starting production version:** `v1.4` · sha `6ab7365` (the batch spec was written against `v1.3.3`; several of its items had already shipped earlier the same day — noted per item below)
- **Ending production version:** `v1.5` · sha `42ceb1e`
- 2,439 tests passing (2,438 → 2,439), production build compiles clean.

## Bug matrix

| ID | Surface | Symptom | Root cause | Sev | Fix |
|---|---|---|---|---|---|
| 1 | Today | "Replies 0" flashes, then real work appears; all-clear card can fire on an empty first render | Tab counts blend two async sources (prospect store, `/api/today` queue fetch) and render before either resolves; a failed fetch was silent | P1 | `totalsState` machine (pending/loaded/error) + `ready` from the store; counts show `…` until resolved, headline says "Adding up what needs you…", all-clear gated on resolution, failed fetch shows a retry line |
| 2 | Drawer / Conversation | "No reply yet" while the Gmail thread is still loading, or when the fetch failed | The empty-state sentence rendered independently of the thread fetch | P1 | GmailThread reports loading/loaded/empty/error upward; "No reply yet" prints only on a genuinely empty result; a failure renders "The Gmail conversation could not be loaded right now · Try again" |
| 3 | Drawer / Evidence | Six "nothing" paragraphs on an unchecked prospect | Situation copy, caveat line, next-action line, qualification empty-prose, knowledge empty-prose, and the freshness fallback each said it separately | P2 | One situation sentence ("Site not checked yet…") carrying the caveat; knowledge block reduced to one line; freshness renders only when a run exists; next-action line is a short pointer |
| 4 | Drawer / Evidence | "What we do not know (3)" does not look clickable | Plain gray text summary | P2 | Chevron that rotates on open + dotted underline |
| 5 | Prospects | List is the default on urgency tabs | Chapter 11 default | P1 (explicit ask) | `defaultLayoutFor` returns Table for every tab; layout key bumped to v3 so stale list saves start clean; deliberate choices still persist per tab |
| 6 | Drawer | Four equally weighted quick actions; the reply is not visually the job | No state-driven primary | P1 | Reply-owed drawers lead with a filled **Draft reply** that opens the conversation and starts the generation (exactly once, never over an in-progress or edited draft); Log a touch steps back to an outline |
| 7 | Drawer / More | "Ask a bee → Draft a reply" could compete with the real Draft reply | Older flow | P2 (pre-existing guard) | Already demoted to the More tab; when the conversation is Gmail-synced the bee explicitly redirects to the real Draft reply. Left as is |
| 8 | Sidebar footer | Cramped Powered-by / version / logout | Fixed earlier today (v1.3.3–v1.4) | — | Two calm lines + version alone underneath |
| 9 | Version badge | Spec asked for `LTB 2026.08.18 · sha` visible | Ary explicitly chose the simple `v1.x` earlier today; it maps to the real build (package.json → build stamp), full identity in the tooltip and `/api/version`, stale-tab refresh warning works | — | Kept `v1.x` per Ary's direct instruction; the spec's underlying requirements (accurate, compact, details on hover, stale warning) are all met |
| 10 | Chris / Three by Three | "Replied, needs you" + "No reply yet" contradiction | Fixed earlier today (v1.3.4 + data backfill): thread renders even when nothing is classified; his row carries outreach facts | — | Verified by tests; pixel check pending below |

## Root-cause themes

1. **Async state overloaded `[]`/`0`** — loading, empty, and error shared one rendering. Both Today and the Conversation now carry explicit state machines.
2. **Copy written per-block with no owner** — each Evidence block wrote its own "nothing", so an unchecked prospect read six of them. The situation entry now owns the sentence (`caveatInBody`) and the blocks defer to it.
3. **Defaults encoding old chapter decisions** — List-first tabs and the Library-last rail both pre-dated Ary's real usage; both now match how she actually works.

## What was verified, and how

- **Tests:** 2,439 passing, including new pins for every fix above (loading gate, thread-state honesty, single empty state, Table default, primary Draft reply wiring).
- **Build:** production compile clean.
- **Deployment:** `/api/version` on live production returns `v1.5` · `42ceb1e`.
- **Outbound safety (before → after):** send_events 10 → 10 · armed auto-followup packages 0 → 0 · package 23 APPROVED, auto_followup_approved 0, unchanged · zero real-prospect sends. This batch touched no send path.
- **First-paint honesty:** pinned by a real server-render test — the first paint says "Adding up what needs you…", never a zero, and cannot show the all-clear card.

## What still needs eyes on authenticated pixels

The access gate is Ary's, so the authenticated browser pass (screenshots at 1440/1024/768, light and dark, the eight workflow flows) could not be executed by the agent. The checklist for that pass, in order:

1. Hard refresh → footer reads `v1.5`.
2. Today fresh load → tab counts show `…` briefly, never `0`, then stable numbers; no all-clear flash.
3. Today → Replies → Chris → drawer leads with a filled **Draft reply**; clicking it opens the conversation and the draft starts writing itself.
4. Chris's Conversation shows his real Gmail thread; nowhere says "No reply yet".
5. Prospects → every tab opens as the **Table**; rows open the drawer.
6. Any unchecked prospect → Evidence shows one "Site not checked yet" sentence, one "Nothing yet" line, and a chevroned "What we do not know" that visibly opens.
7. Mary Ann → full conversation, Draft reply, Send present. **Do not send.**

If Ary signs into the in-app preview browser, the agent can run this pass and attach the screenshots.

## Verdict

`LTB PRODUCT HARDENING PASS NOT ACCEPTED — THE FUNCTIONAL FIXES ARE LIVE ON PRODUCTION (v1.5 · 42ceb1e) AND PINNED BY TESTS, BUT THE AUTHENTICATED PRODUCTION-PIXEL ACCEPTANCE PASS COULD NOT BE EXECUTED WITHOUT A SIGNED-IN SESSION; THE BATCH CLOSES WHEN THE SEVEN-STEP PIXEL CHECKLIST ABOVE PASSES ON THE LIVE SCREEN.`
