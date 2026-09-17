# Six chapters, assembled and green, waiting on eyes

Branch `integration/ui-reset-2026-08-14`, based on accepted main **`1ecbc2d`**. Six merges, four real conflicts, all resolved by the rule "structure wins, vocabulary re-derived over it". **2,228 tests passing, build clean. Nothing merged to main, nothing deployed.**

## Merge order and result

| # | Chapter | Branch | Result |
|---|---|---|---|
| 1 | Rail + Today | `ui/ch1-rail-today-reset` | clean |
| 2 | Visual system | `ui/ch7-visual-system-rederive` | clean |
| 3 | New finds | `ui/ch2-merge-leads-into-prospects` | **conflict** |
| 4 | Detail story | `ui/ch3-prospect-detail-story` | **conflict** |
| 5 | Approval hierarchy | `ui/ch5-approval-send-hierarchy` | **conflict** |
| 6 | System control room | `ui/ch6-system-consolidation` | clean |

Chapter 7 landed second on purpose, so Chapters 2, 3 and 5 could be re-derived onto semantic classes as they arrived rather than needing a sweep afterwards.

## Every real conflict, and how it was resolved

**`ProspectTabs.jsx` (Chapter 2).** One line: Chapter 2 changed the blurb variable to `{blurb}`, Chapter 7 changed the class to `ui-small`. Resolved by keeping both. Chapter 2's new New-finds tab then arrived carrying raw values (2 × `text-[13px]`, 1 × `rounded-[8px]`), so it was re-derived.

**`ProspectDrawer.jsx` and `ProspectHeadline.jsx` (Chapter 3).** Chapter 3 restructured the exact lines Chapter 7 restyled. Chapter 3's structure taken wholesale, then the visual mapping re-applied over it. Verified afterwards: the `do_not_contact` / `unsubscribed` short-circuit is intact, the "no further contact" sentence is intact, and the Next box is still inside the else branch so a hard stop cannot render one.

**`globals.css` (Chapter 5).** Both chapters append at the same anchor after `.btn-bloom:disabled`. Both kept, in order: Chapter 7's 71-line system first so Chapter 5's 73-line action vocabulary layers on top of it. Verified no class is defined twice.

**`ApprovalQueue.jsx` (Chapter 5, 7 hunks).** Chapter 5's semantics taken wholesale, then type and radius re-derived. Verified afterwards: exactly one `btn-send`, `btn-approve` and `btn-approve-2nd` still distinct, `role="switch"` with `aria-checked` bound to the package's own flag, the same `auto-followup` backend action, and the Sending-state guard against double submit.

## LeadInbox: the surface Chapter 2 promoted

Chapter 2 makes LeadInbox a daily Prospects surface, so it earned a targeted migration.

| | Before | After |
|---|---|---|
| Raw font sizes | 133 uses, 13 distinct | **0** |
| Raw radii | 66 uses, 6 distinct | **0** |
| Opacity-faded disabled | 11 | **0** |

Now uses 55 `ui-small`, 47 `ui-body`, 20 `ui-meta`, 7 `ui-heading`, 4 `ui-display`, 49 `r-md`, 17 `r-lg`, 11 `ui-control`. The diff was checked line by line: every changed line is a className or a className-string constant. All eight endpoints unchanged, no triage logic touched.

## Browser-verified, not just computed

The integrated build boots and the gate renders with **zero console errors**. Probing the live engine confirmed the vocabulary actually resolves:

| Class | Computed | | Token | Light | Dark |
|---|---|---|---|---|---|
| `.ui-display` | 28px / lh 32.2 | | `--ink-3` | `#79626E` | `#9A8290` |
| `.ui-heading` | 15px / lh 20.25 | | `--text-muted` | `#79626E` | `#9A8290` |
| `.ui-body` | 13.5px / lh 20.25 | | `--disabled-bg` | `#F3EAEE` | `#2E2129` |
| `.ui-small` | 12.5px / lh 18.1 | | `--disabled-ink` | `#7A6470` | `#9A8593` |
| `.ui-meta` | 12px / lh 16.8 | | `.r-sm/md/lg/pill` | 6 / 8 / 12 / 999px | same |

Contrast recomputed from those **live-read** values, not from source assumptions:

| | On panel | On canvas |
|---|---|---|
| Light muted | **5.47** | **4.85** |
| Dark muted | **4.78** | **5.25** |
| Light disabled | **4.59** | — |
| Dark disabled | **4.50** | — |

All four clear AA. The `--ink-3` → `--text-muted` override chain resolves correctly in a real engine, in both themes.

## The concern I want to raise before you look

**The type roles may still be too close together to read as hierarchy.** Chapter 7 collapsed 25 arbitrary sizes into 5 roles, which genuinely ends the drift: no component picks its own number any more. But I deferred to the scale the repo already had, and its middle is narrow: body **13.5px**, small **12.5px**, meta **12px**. That is 1px and half a pixel apart, which is close to the very criticism my audit made of the old sprawl.

The structural fix is real and I stand behind it. Whether the result actually *looks* like hierarchy is exactly what pixels decide, and I did not widen the gaps by taste before you had seen it. If it reads flat, the fix is one line: change `--fs-body` / `--fs-label` / `--fs-meta` and every migrated surface inherits it. That is the single highest-value thing to judge in this review.

## Verification

| | |
|---|---|
| Chapter suites 1, 2, 3, 5, 6, 7 | **all passing** (2 stale literal assertions repinned to semantic roles, no behaviour reverted) |
| New integration suite | **15 passing** — covers the claims only true when stacked |
| Full suite | **2,228 passing, 0 failing** |
| `next build` | clean |
| Routes | every old view key resolves; `#leads` still reaches New finds; guides, Stats, Settings, Trash, System health, off-rail views, custom pages all intact |

The integration suite specifically proves: the vocabulary reached the surfaces Chapters 2/3/5 brought in; the safety banner still suppresses Next; Activity and technical stay collapsed with evidence on the first surface; Send now is the only send; the auto-followup switch is package-level and a global switch alone still cannot arm a package; System owns the passive panels and Today excludes them; no class is defined twice; relationship labels stay distinct; no endpoint changed.

## Visual review environment

**Running at `http://localhost:3000`.** This is safe to click: `setupDevPlatform()` binds a local miniflare SQLite replica at `.wrangler/state/v3/d1/`, entirely separate from the production database. Production cannot be mutated from it and no email can be sent from it.

**No auth was bypassed and none was added.** The gate is intact; sign in with your normal access code. I did not enter it.

**Authenticated pixel review has NOT happened.** The Browser pane would not composite frames, so no screenshot exists. Everything past the gate — Today with real content, the tab strip, the drawer, the approval card, System — is still unseen by anyone. That is the remaining gate.

### What to look at, in priority order

1. **Type hierarchy** (above). Does body / small / meta read as three levels, or as one blurry level?
2. **`btn-send`'s ring and glow.** Deliberately untuned. Too loud, or right for the only button that emails a human?
3. **The safety banner** on a DNC prospect. Unmistakable, or shouting?
4. **The tab strip** now that New finds makes seven tabs. Crowded?
5. **LeadInbox density** after migration. Still heavy?
6. **System** with the three panels stacked. One quiet room, or a wall of cards?
7. **Chip density**, which I deliberately did not touch anywhere.
8. Both themes, and a narrow (~768px) width for overflow.

## Production isolation

No merge to main, no deploy, no production writes, no sends, no drafts, no jobs, no credits. Scheduler, heartbeat and Gmail untouched. **Package 23 untouched by this task** and remains as the canary check found it: approved copy and sequence, `auto_followup_approved = 0`, `emails_sent = 0`, both switches false — unsent and unarmed.

**Deployment status: blocked on your visual approval, which is now the only remaining UI gate.**
