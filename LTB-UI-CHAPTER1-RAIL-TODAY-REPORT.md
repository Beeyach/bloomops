# Chapter 1: the rail answers where, Today answers what

Branch `ui/ch1-rail-today-reset` (based on main `41004bd`), commit **`f90f73c`**. **Not merged, not pushed, not deployed. Production untouched. Merge and deploy remain gated on the natural daily-wake canary.**

## Navigation, before and after

| Before (4 sections, 14 entries) | After (4 sections, 11 entries, 3 collapsed) |
|---|---|
| Pipeline: Today, Prospects, Leads, Clients, Stats | **Work (open): Today, Prospects, Leads (indented beneath Prospects), Clients** |
| AI: AI Hive, Automation guide | **Library (collapsed): Templates + the custom pages tree** |
| Resources: Start here, Templates, Connect an AI, Sourcing guide | **System (collapsed): System health, Stats, Settings, Trash** |
| System: System health, Settings, Trash | **Utilities (collapsed): Help, AI helpers** |

- **No Conversations entry.** It arrives with Chapter 4, after the conversation-turn branch deploys. No dead navigation.
- **Help absorbs the guides.** One door (the former Start here, relabeled). Its page now links all three deeper guides, including Connect an AI, so nothing is hash-only.
- **Leads is not merged** (that is Chapter 2); it is visually subordinate to Prospects and keeps its unread badge.
- **Stats moved to System.** AI Hive became "AI helpers" under Utilities.
- The nav table now lives in `lib/nav-structure.mjs` as plain, testable data; GlassRail imports and re-exports it.

## Routes preserved

All seventeen view keys still resolve: the three guides, `prompts`, and `handsoff` live in `OFF_RAIL_VIEWS` (routable by hash, no rail entry, the pattern the shell already used for prompts/handsoff). `#page:<id>` untouched. A test walks every key against the shell's view switch. The rail layout storage key bumps to `ltb_nav_layout_v2`: a stored layout from the old sections cannot resurrect Pipeline/AI/Resources (Ary's saved custom folders reset once; drag-and-drop still works and re-saves under the new key).

## Today, before and after

| Before | After |
|---|---|
| 34px serif greeting + summary + "How Today works" paragraph + four-sections Hint + onboarding checklist | 22px greeting + the one-sentence summary. Explainer prose gone (Help is in the rail now). Checklist unchanged in logic and already invisible for an established workspace; a test now pins that |
| "Needs you" section | **"Needs your reply"** (same router-driven content: server exceptions, replies, video viewers, warm nudges, recorded videos; caps unchanged at 6) |
| "Ready for approval", 5 cards | **"Approvals", 3 cards** (`TODAY_APPROVALS_LIMIT`), the rest a count + View all |
| Follow-ups due (8) + upcoming preview rows (3) | Follow-ups due unchanged (8); **upcoming is now a count with a link**, not rows: next week's machine-scheduled work is not a decision this morning |
| Needs attention | Unchanged (the exceptions/tidy-up pile) |

**No "Follow up?" group was faked**: this base has no `FOLLOWUP_ELIGIBLE`, so the group is omitted, and a test forbids both the label and the state name on this branch. The layout slots it in cleanly when Chapter 4 lands.

## Relationship wording safety

No global rename. `Rejected` stays in the stage vocabulary; `NO_TO_THIS_OFFER`, `NO_TO_US`, and `DEFERRED` labels remain distinct; a regression test pins all of it. Approval semantics untouched: the only ApprovalQueue change is a `previewLimit` prop defaulting to the old value, and a test asserts the approve/auto-followup/Send-now surface is otherwise intact.

## Verification

| | |
|---|---|
| New tests | 12 (`tests/ui-chapter1-nav-today.test.mjs`) |
| Updated tests | 4 that asserted the old structure (nav-layout collapse default, Start-here label, Today explainer, health nav location), each rewritten to the new intentional truth |
| Full suite | **2,155 passing, 0 failing** (main base; the turn-state branch carries its own suites) |
| `next build` | clean |
| Files changed | 12: `lib/nav-structure.mjs` (new), `lib/nav-layout.mjs`, `lib/today-buckets.mjs`, `components/GlassRail.jsx`, `components/StartHerePage.jsx`, `components/TodayView.jsx`, `components/ApprovalQueue.jsx`, `components/Followups.jsx`, plus 4 test files |

## Visual verification: pending, honestly

The mandatory authenticated visual pass could not be done from here: the app sits behind the access-code gate and entering credentials is out of bounds for this session, and the browser pane was unavailable for pixel screenshots. Nothing visual is being claimed. The chapter is therefore **code-ready, visual acceptance pending**: Ary (or a session with an authenticated preview) should walk Today, Prospects, Clients, System, the collapsed/expanded utility sections, and a narrow viewport in both themes, answering the seven questions in the brief. Narrow-viewport note from code: the mobile bottom bar picks the first four NAV entries, which are now exactly the Work section (Today, Prospects, Leads, Clients) + More; no mobile redesign was attempted.

## Deferred, deliberately

Chapters 2 to 8 as planned: Leads merge, prospect detail story, Conversations (needs the turn branch), approval button hierarchy, System consolidation, the type/radius/contrast re-derivation, mobile QA. The parked `ui/type-scale-cleanup` and `ui/radius-cleanup` branches were not merged and will be re-derived in Chapter 7.

## Canary isolation proof

Production deployment unchanged (Pages still serves `1eb3cb51` = `5fd234e`; nothing pushed). main unchanged (`41004bd`). Scheduler, daily-wake heartbeat, package 23, both automation switches: untouched, no reads-with-side-effects, no writes of any kind. No production data was read or written by this task at all; it was entirely repo-local. The branch exists locally only. **Merge/deploy status: WAITING FOR CANARY** (natural wake, checked 2026-08-14 04:05 UTC).
