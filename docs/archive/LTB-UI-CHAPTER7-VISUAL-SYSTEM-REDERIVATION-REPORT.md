# Chapter 7: five roles and four radii, measured not chosen

Branch `ui/ch7-visual-system-rederive`, based on `ui/ch1-rail-today-reset` at **`75d89eb`**. Code `ce6243d`, test hardening `d853bf0`. **Not merged, not deployed. Production untouched.** The parked `ui/type-scale-cleanup` and `ui/radius-cleanup` branches were read as reference only and never merged.

## Two corrections to my own audit

Measuring before editing changed two of the audit's headline claims, and both corrections matter more than the numbers they replace.

**1. The contrast failure was real but mislocated.** The audit measured `--ink-3` at its top-of-file declaration (`#A5878F`, 3.20:1). That declaration is dead: a later block re-points `--ink-3` at `--text-muted` for both themes, and a previous pass had already raised it. The *effective* light value was `#7E6874`, which measures **5.03:1 on the panel but 4.46:1 on the blush canvas** — and the canvas is the surface most muted text is actually drawn on. So there was a genuine AA failure, just not the one reported, and one step of the fix was already done. Nudged to `#79626E`: **5.47:1 panel, 4.85:1 canvas**, dark untouched.

**2. A semantic token layer already existed.** The repo already defines `--fs-page/section/card/body/label/meta` and `--r-xs/sm/md/lg/xl/full`, with a comment explaining they exist so later work has "a scale to defer to instead of picking a locally reasonable value". Nobody was using them. Inventing a third vocabulary would have been the exact drift this chapter exists to end, so I deleted my duplicate scale and pointed the new classes at the existing tokens.

## Measured inventory (before)

**Type, whole app: 25 distinct sizes.** 325 uses of 12px, 271 of 13px, 98 of 12.5px, 94 of 11px, 41 of 14px, 34 each of 13.5 and 10px, 27 of 15px, 24 of 11.5px, then a long tail down to single uses of 19, 23, 28, 40 and 42px. On the eleven migrated surfaces: **20 distinct sizes across 243 uses**.

**Radius, whole app: 19 distinct values.** 216 uses of `rounded-[8px]` (already dominant), 95 `rounded-lg`, 95 `rounded-full`, 34 `xl`, 22 `2xl`, 21 `[10px]`, 20 `[6px]`, 16 `[12px]`, 12 `[7px]`, plus `[3px] [4px] [5px] [9px] [14px] [16px] [22px]`. On the migrated surfaces: **10 distinct values**.

**Disabled states: 85 opacity declarations app-wide** (34 `opacity-50`, 26 `opacity-60`, 16 `opacity-40`, 7 `opacity-25`, 2 `opacity-30`), 17 of them on the migrated surfaces.

## After

**Type: 5 roles.** `.ui-display` `.ui-heading` `.ui-body` `.ui-small` `.ui-meta`, each pinning size *and* line-height (half the drift was leading), reading `--fs-page/card/body/label/meta`. On the migrated surfaces: **zero raw `text-[Npx]` remain**; 99 `ui-body`, 88 `ui-small`, 32 `ui-meta`, 14 `ui-heading`, 10 `ui-display`.

**Radius: 4 roles.** `.r-sm` (6px, chips) `.r-md` (8px, the default: buttons, inputs, list groups) `.r-lg` (12px, cards and drawers) `.r-pill` (999px), reading `--r-sm/md/lg/full`. On the migrated surfaces: **zero raw pixel radii remain**; `rounded-full` deliberately preserved for true pills and switches.

**Contrast, computed both themes:**

| Token | Light on panel | Light on canvas | Dark on panel | Dark on canvas |
|---|---|---|---|---|
| primary text | 13.12 | 11.63 | 14.14 | 15.53 |
| secondary text | 6.66 | 5.91 | 8.60 | 9.45 |
| **muted (was)** | 5.03 | **4.46 fail** | 4.78 | 5.25 |
| **muted (now)** | **5.47** | **4.85** | 4.78 | 5.25 |
| disabled text | **4.59** | — | **4.50** | — |

**Disabled: stated, not faded.** Composite math on what was there: `opacity-50` over secondary text renders **2.22:1** on the light panel; over the old muted colour, **1.69:1**; at `opacity-38`, **1.48:1**. Those controls were not dimmed, they were erased. The 17 on migrated surfaces now use `.ui-control:disabled` with explicit background, foreground and border tokens at 4.59:1 / 4.50:1, and `opacity:1` set explicitly so a stray utility cannot re-fade them.

## Buttons, cards, chips

The global vocabulary added is deliberately small: `.ui-secondary` (outline), `.ui-quiet` (ghost), `.ui-control` (disabled), plus a `:focus-visible` ring on `.btn-bloom`, which previously had none. **Chapter 5's classes are not redefined here** — `btn-send`, `btn-approve`, `btn-approve-2nd`, `btn-danger-quiet`, `btn-retry-quiet` and `switch-pill` stay Chapter 5's to own, so the two systems compose. A test enforces "defined at most once" from either side.

No shadow or glow language was added anywhere. Chapter 5's `btn-send` double-ring is **left exactly as it is and flagged for pixel review**: judging its intensity from source would be taste dressed as engineering, which the brief explicitly forbids.

Card nesting, chip density and table density were **not** restyled. Reducing borders and chips changes what a person can see at a glance, and I have no pixels to check the result against — that judgement is queued with the visual review rather than guessed at.

## The integration rehearsal (the important part)

`git merge-tree` reported **0 conflicts against all six targets**, including main, the integration branch, and Chapters 2, 3, 5 and 6. That was misleading. A real merge on a disposable branch found **conflicts in four files** and, once resolved, **six failing tests**:

| Conflict | Nature | Resolution |
|---|---|---|
| `ProspectTabs.jsx` | Ch2 changed the variable on the same line Ch7 changed the class | Trivial: keep both |
| `ProspectDrawer.jsx`, `ProspectHeadline.jsx` | Ch3 restructured lines Ch7 restyled | Take Ch3's structure, re-derive Ch7's mapping over it |
| `globals.css` | Both append after `.btn-bloom:disabled` | Keep both blocks in order: system first, actions on top |
| `ApprovalQueue.jsx` (7 hunks) | Ch5 rewrote controls Ch7 restyled | Take Ch5's semantics, re-derive type/radius over them |

The six test failures were **all stale literal assertions** — earlier chapters pinned `text-[16px]` or a full `className` string that Chapter 7 replaced — not behaviour regressions. Two other findings: Chapter 2 makes `LeadInbox` a Prospects surface, so it needs migrating in the integrated world (132 raw sizes), and `ProspectTabs` needs a second pass because Ch2's new tab arrives after Ch7's migration.

**Fully integrated result: 2,213 tests pass, `next build` compiles.** The rehearsal branch was deleted; its lesson was folded back as test hardening (`d853bf0`) so Chapter 7 now asserts the *rule* rather than the spelling.

### Recommended merge order

1. **Chapter 1** (everything descends from it)
2. **Chapter 7** (the visual system, so later chapters land inside it)
3. **Chapter 2**, then re-derive `ProspectTabs` and `LeadInbox` (one mechanical pass, ~5 minutes)
4. **Chapter 3**, taking its structure and re-deriving over the two components
5. **Chapter 5**, taking its semantics and re-deriving over `ApprovalQueue`
6. **Chapter 6** (merges clean at any point)
7. Re-pin the stale literal assertions in the Chapter 3 and 5 suites

Merging Chapter 7 *early* is the recommendation: every later chapter then writes semantic classes from the start instead of raw pixels that need a re-derivation pass.

## Verification, honestly separated

**Computed / source-proven:** every contrast ratio above (WCAG relative-luminance formula, both themes, panel and canvas); every before/after count of sizes, radii and opacity declarations; that no raw sizes or pixel radii remain on the eleven migrated surfaces; that the disabled tokens clear 4.5:1; that focus rings exist on every control class.

**Rendered / component-proven:** 15 Chapter 7 tests; Chapter 1's 12 still green standalone; full suite **2,170 passing, 0 failing** standalone and **2,213 passing** integrated; `next build` clean in both.

**Visually unverified — no claim made:** whether it *looks* better. Whether the type scale reads as hierarchy on a real screen. Whether `btn-send`'s ring is too loud. Whether the card and chip density that I deliberately did not touch still feels heavy. Whether the new muted colour looks right rather than merely measuring right. Authenticated pixel review needs Ary's access code and remains unavailable; no harness was built, since a fixture gallery would only show my own assumptions back to me.

**Narrow viewport, code-level only:** the migration changed no layout, flex, grid or width declarations — only font-size, radius and disabled colour. Nothing new can overflow that did not already. Not visually confirmed.

## Files changed

`app/globals.css` (tokens + classes), eleven components (`GlassRail`, `TodayView`, `ProspectTabs`, `ProspectListRow`, `ProspectDrawer`, `ProspectHeadline`, `SystemHealth`, `ApprovalQueue`, `Followups`, `NeedsAttention`, `ExceptionQueue`), one new test file.

**Left for later, deliberately:** raw values in admin, debug and editor components (`LeadInbox` outside the integrated world, `ArmyPanel`, `SettingsView`, `RichEditor`, `SkillStudio`, `WorkspaceView`, and the rest). Migrating them is mechanical but touches thousands of lines of screens nobody reads daily; a huge risky diff for no daily benefit is a bad trade. The app-wide totals stay 25 sizes and 19 radii until then; the eleven surfaces a person actually uses no longer contribute to them.

## Production isolation

Repo-local only: no merge, push, deploy, production reads or writes, sends, drafts, jobs, or credits. Scheduler, heartbeat, package 23 and both automation switches untouched. No backend file was opened. **Merge/deploy status: WAITING FOR VISUAL REVIEW + CANARY.**
