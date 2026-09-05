# Chapter 3: the story was mostly there; now the boundaries and the past behave

Branch `ui/ch3-prospect-detail-story`, stacked on `ui/ch2-merge-leads-into-prospects` at **`45a649e`**, Chapter 3 commit **`da8a52e`**. **Not merged, not deployed. Production untouched.**

## The honest Part 1 finding

The audit (and this brief) assumed the drawer fragmented truth across Overview/Emails/Audit/History tabs. Full inspection showed that is out of date: **the drawer has no tabs**. A previous pass already rebuilt it as one vertical story in exactly the order the brief asks for:

1. `ProspectHeadline`: who + one canonical state + one Next box (all from `prospectActionState`, the same router the lists use, so the header can never disagree with the row)
2. Quick actions (log a touch, snooze, emails, show in table)
3. `ConversationTimeline`: what they actually said (real reply data, quiet empty state)
4. `ProspectCard`: why LTB chose them, evidence-first, with the open-proof affordance
5. `OutreachHistory`: what actually went out, from recorded sends only
6. The record: the editable form fields (the spreadsheet row, deliberately below the story)
7. Notes / parsed audit profile / audit video / bees
8. `SystemDetails`: ids, fingerprints, jobs, raw signals, in a collapsed `<details>`

The duplicate map came back nearly clean too: stage, contact, and dates each render once as display and once as an editable control, which are different jobs. So Chapter 3 did not rebuild a solved page. It fixed the two places the story genuinely failed.

## Change 1: a stop request looks like one

Before: a `do_not_contact` or `unsubscribed` prospect rendered through the normal state path as a muted gray "Closed" line, plus a Next box. The four real opt-outs flagged in production this week would have looked like ordinary quiet rows.

After: the header short-circuits on the hard flags. A danger-toned bordered banner (the only place the poppy hue appears in a prospect header) says **"Do not contact"** or **"Unsubscribed"** with one plain sentence: "They asked for no further contact. Nothing here should ever reach out to them again." The Next box is not rendered at all: there is no next action on a stop request. Purely presentational; the flags and guards are untouched.

## Change 2: the past is history

Before: the activity timeline (notes, automation entries, markers) rendered fully expanded near the bottom, an unbounded list competing with the present.

After: it collapses behind a one-line summary, the same `<details>` pattern SystemDetails already uses: "Activity · 14 entries · last: She asked about pricing…" (count + newest entry, newest-first order verified against `mergedTimeline`). One click opens the full log and the note-entry box, unchanged.

## What deliberately did not change

- No fake turn-state: `WAITING_ON_THEM` / `FOLLOWUP_ELIGIBLE` / `DORMANT` do not exist on this base and a test forbids them in the drawer and headline. Section 3 (conversation) is the natural seam for Chapter 4.
- Relationship wording: "Not this offer" / "Declined working together" / "Deferred" stay distinct (pinned); no Rejected bucket, no global renames.
- Evidence integrity: `ProspectCard` untouched and pinned as rendering unmodified; no invented diagnosis anywhere.
- Drawer stays a drawer: it comfortably carries the story; no route-level page was needed.
- Chapter 5 styling: not copied; the sibling trial-merges clean.
- Backend: the drawer still cannot send email (pinned by test); no endpoints, guards, or lifecycle touched.

## Verification

| | |
|---|---|
| Chapter 3 tests | 11 passing (`tests/ui-chapter3-detail-story.test.mjs`; boundary states rendered via `renderToString`, story order walked, collapse pinned) |
| Chapter 1 + 2 regression | 21/21 passing |
| Full suite | **2,175 passing, 0 failing** |
| `next build` | clean |
| Diff vs Chapter 2 | 3 files, +203/-24: `components/ProspectHeadline.jsx`, `components/ProspectDrawer.jsx`, the new test file |
| Trial merge vs main | **0 conflicts** |
| Trial merge vs `integration/post-canary-ready-2026-08-13` | **0 conflicts** |
| Trial merge vs `ui/ch5-approval-send-hierarchy` | **0 conflicts** |

## Visual verification: pending

Same constraint as every UI chapter this session: authenticated access needs Ary's code, pixel screenshots unavailable. The ten prospect archetypes and eight questions in the brief wait for an authenticated pass. Narrow viewport: the drawer is a fixed 440px slide-over with `max-w-full`, sections stack vertically, nothing new is wider than before (code-level only, not visually confirmed).

## Production isolation

Repo-local only: no merge, push, deploy, production reads or writes, sends, drafts, jobs, or credits. Scheduler, heartbeat, package 23, switches untouched. **Merge/deploy status: WAITING FOR VISUAL REVIEW + CANARY.**
