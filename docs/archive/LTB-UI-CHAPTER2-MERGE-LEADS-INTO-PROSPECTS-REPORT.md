# Chapter 2: one pipeline home

Branch `ui/ch2-merge-leads-into-prospects`, **sibling of Chapter 5**, based on `ui/ch1-rail-today-reset` at **`75d89eb`**, Chapter 2 commit **`ce2c456`**. **Not merged, not deployed. Production untouched. Merge order later: Chapter 1 first, then Chapters 2 and 5 in either order (both trial-merge clean).**

## The pipeline, before and after

| Before | After |
|---|---|
| Two top-level workspaces: Prospects (6 views) and Leads (its own screen, own badge, indented rail entry since Chapter 1) | One workspace: **Prospects** with seven doors on one strip: **New finds** · All · Not contacted · In outreach · Replied · Needs attention · Finished |

The rail is now exactly **Today / Prospects / Clients** over the collapsed Library / System / Utilities sections. No Leads entry anywhere.

## How New finds works

- The existing `ProspectTabs` strip gained one optional first tab. On the Prospects side it is quiet, carries the moved unread count, and clicking it opens the triage screen. On the triage side the same strip renders with **New finds active**, and clicking any pipeline tab walks straight back into Prospects with that tab selected. One strip, two screens, one workspace feel.
- The strip's blurb line explains the tab in place: "Raw finds awaiting your look. The good ones get added to the pipeline."
- `LeadInbox` itself is untouched except its `<h1>`: "Leads" became "New finds". Every filter, search, sort, promote, delete, import, scan and AI action is exactly as it was; a test freezes its entire backend surface (`/api/leads`, `/api/settings`, `/api/ai`, `/api/limits`, `/api/scan`, `/api/scan/enrich`, `/api/scan/import`, `/api/import/apify`) so nothing can appear or vanish silently. Promotion semantics were not approached at all.
- Component strategy was Option A at its smallest: the shell composes the existing strip above the existing LeadInbox. Neither 3,000-line component grew beyond a handful of lines.

## Routes and counts

- `#leads` still resolves: the `HASH_TO_VIEW` alias and the `view === 'inbox'` render path are untouched and pinned by test. `inbox` moved to `OFF_RAIL_VIEWS` (the established pattern for routable views with no rail entry).
- The unread count moved, not multiplied: same `/api/leads` feed, same length, now shown beside the New finds tab instead of as a rail badge. No new queries, no new badge pile.
- Mobile bottom bar: now the three Work views + More (previously four; Leads' departure would otherwise have promoted Templates into the bar).

## State continuity

Crossing between New finds and a pipeline tab is a view switch, exactly as it was before this chapter; each side keeps its own search/filter state with the same lifetimes as before. Nothing was persisted anew and nothing that used to persist was lost.

## Verification

| | |
|---|---|
| Chapter 2 tests | 9 passing (`tests/ui-chapter2-newfinds.test.mjs`, including rendered-strip assertions: New finds first, one `aria-selected` at a time, count rendered) |
| Chapter 1 regression | 12/12 passing (one rail test updated to the new truth: Work is three items and Leads' subordination clause retired) |
| Full suite | **2,164 passing, 0 failing** |
| `next build` | clean |
| Trial merge vs main | **0 conflicts** |
| Trial merge vs `integration/post-canary-ready-2026-08-13` | **0 conflicts** |
| Trial merge vs `ui/ch5-approval-send-hierarchy` | **0 conflicts** (sibling stays independent; no Chapter 5 CSS was copied) |
| Files changed | 7: `lib/nav-structure.mjs`, `components/GlassRail.jsx`, `components/ProspectTabs.jsx`, `components/ProspectsApp.jsx`, `components/LeadInbox.jsx`, the new test file, one Chapter 1 test update |

## Visual verification: pending

Same honest constraint as Chapters 1 and 5: the authenticated app needs Ary's access code and pixel screenshots were unavailable, so the eight look-and-feel questions (one pipeline? New finds discoverable? tabs too crowded? rail calmer?) and the narrow-viewport pass (strip wraps with `flex-wrap`; not visually confirmed) wait for an authenticated review before merge.

## Production isolation

Repo-local only: no merge, no push, no deploy, no production reads or writes, no sends, drafts, jobs, or credits. Scheduler, heartbeat, package 23, and both automation switches untouched. **Merge/deploy status: WAITING FOR VISUAL REVIEW + CANARY.**
