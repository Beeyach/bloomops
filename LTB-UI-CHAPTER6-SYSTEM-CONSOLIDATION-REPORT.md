# Chapter 6: one quiet control room

Branch `ui/ch6-system-consolidation`, sibling from `ui/ch1-rail-today-reset` at **`75d89eb`**, Chapter 6 commit **`6d8a796`**. **Not merged, not deployed. Production untouched. Merge order later: Chapter 1 first, then this in any conflict-safe order with Chapters 2/3/5 (all trial-merge clean).**

## The honest Part 1 inventory

| Component | Shows | Human action? | Was | Duplicate of | Now |
|---|---|---|---|---|---|
| SystemHealth (405 lines) | Gmail watch, scheduler, renderer, queue, errors, targeted retries | Only where a retry genuinely needs her | `health` view | canonical | **The control room's anchor, unchanged** |
| SendingSummary (80) | "What sends email right now": both global switches in plain modes (Manual / Automatic / Watching only) | No, view-only by design | Inside **Settings** | overlaps Start-here's copy | Moved under System health, Automation group |
| ShadowPanel (159) | "Follow-ups, watched": what the auto-followup would have done and why it held, with no enable button by design | No, watch-only | Inside **Settings** | unique truth | Moved under System health, Automation group |
| HeldPanel (237) | What automation is holding and why (no address, bounced, ways back in) | Eventually, per row | Inside **Settings** | full-list sibling of Today's capped buckets | Moved under System health, Automation group |
| StatsView | Passive totals | No | `stats` view, railed under System since Chapter 1 | fine | Placement already coherent; untouched |
| CreditsBadge | Credit balance | No | Inside AI Hive, where credits are spent | n/a | Stays: the counter belongs beside the actions that spend it (the Part 7 exception) |
| RenderWatcher | Progress of a render batch Ary herself queued; renders nothing when idle | It is her own batch | global | n/a | Stays: user-initiated progress is not passive status |
| "Hands-off" view | Misidentified by the audit: it is the Cowork **prompts** workspace, not status | n/a | off-rail view | n/a | Untouched |

The surprise mirror-image of the audit's claim: the panels were not scattered across work surfaces; a previous pass had already gathered them inside Settings. The wrong room, but one room. Chapter 6 moved them to the right one.

## What changed

- **System health is the control room**: SystemHealth first (is the machine alive), then a plain **Automation** heading with SendingSummary, ShadowPanel, HeldPanel (what it may do, what it is watching, what it is holding). One room, one kind of question.
- **Settings is pure configuration** again, with a one-line pointer: "What these switches are currently doing... live under System health."
- Pure composition in the shell: **all three components are byte-identical**; endpoints, data sources, and view-only postures unchanged (pinned by tests: ShadowPanel still says "There is no enable button here").

## What did not need changing, verified

- **Today** already carries only human-needed work (ExceptionQueue + NeedsAttention); a test now forbids every passive surface from rendering there.
- **Wording** was already plain: "What sends email right now", "Follow-ups, watched". No internal names leak. Wording map: empty by inspection; the audit's "Hands-off" concern dissolved (it is a prompts page).
- **One health model**: each panel still reads its canonical helper (`sending-state`, `today-buckets`, `system-health`); nothing recomputes health a second way.
- **Global vs package**: pinned functionally: both switches off reads Manual / Watching-only, and a global switch alone can never arm a package (`approvalCard` returns no automation control without package-level consent).
- **Retries**: SystemHealth's existing targeted retries are untouched; no new retry surfaces were added, and no background retry became a manual task.
- **No fake urgency**: no new severity styling was introduced anywhere; existing tokens untouched (Chapter 7 owns that system).

## Verification

| | |
|---|---|
| Chapter 6 tests | 10 passing (`tests/ui-chapter6-system-consolidation.test.mjs`) |
| Chapter 1 regression | 12/12 passing on this base |
| SystemHealth suite | updated one route assertion to the new composition; 29 targeted green |
| Full suite | **2,165 passing, 0 failing** |
| `next build` | clean |
| Files changed | 3: `components/ProspectsApp.jsx` (composition only), the new test file, one assertion in `tests/system-health.test.mjs` |
| Trial merges | **0 conflicts** vs main, the integration branch, and Chapters 2, 3, and 5 |

## Visual verification: pending

Same constraint as every UI chapter: authenticated access needs Ary's code; pixel screenshots unavailable. The nine System states and eight questions in the brief wait for an authenticated pass. Narrow viewport: the control room is a single-column `grid gap-4`; each panel already stacked internally; code-level only.

## Production isolation

Repo-local only: no merge, push, deploy, production reads or writes, sends, drafts, jobs, or credits. Scheduler, heartbeat, package 23, both switches untouched. **Merge/deploy status: WAITING FOR VISUAL REVIEW + CANARY.**
