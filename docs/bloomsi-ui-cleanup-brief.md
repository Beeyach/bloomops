# Bloomsi UI cleanup and interaction brief

Model: GPT-6 Astra
Reasoning: High
Surface: Existing local Codex session with repository and authenticated browser access

## Purpose and source boundaries

Implement one cohesive UI refinement pass across the existing Bloomsi app. This is a product implementation task, not a new independent-audit gate, a rebrand, or a backend rebuild. Preserve the agreed product-completion list and resume it after this bounded pass.

This brief records Ary's annotated screenshots and feedback from the current conversation. The screenshots establish presentation problems. They do not establish the DOM/CSS cause of the tab scrollbar, the source of Prospecting latency, or which actions the Pages menu actually supports. This chat could not retrieve the authenticated staging app or the repository design document. Inspect those in the local Codex environment before claiming live findings.

Repository: Bloomwired/bloomops
Staging reference: https://staging.ops.gobloomwired.com
Do not assume any historical SHA, local branch, or screenshot is the current deployment.

Read applicable AGENTS.md, current app-specific design documents, relevant component conventions, and BUILD_STATE. Use the Bloomsi app identity, not the separate Bloomwired marketing-site typography or layout. Preserve current fonts and assets unless an actual loading defect is found. A screenshot cannot establish that CSS failed to load.

## Non-negotiable owner decisions

- No em dashes (U+2014) in app-authored UI copy, labels, hints, tooltips, or accessible names.
- No middle-dot-separated metadata or heading/subtitle strings (U+00B7). Use layout, labels, chips, line breaks, and separate elements instead. Normal sentence punctuation and actual bullet lists are allowed.
- Do not mass-edit stored user documents, record names, imported data, immutable published reports, or historical records to remove punctuation. Fix authored strings and metadata presentation. Preserve user content verbatim.
- More visible color, stronger typography, meaningful icons, obvious controls, and consistent spacing.
- No rainbow decoration, generic gradients, glass effects, oversized statistics, or a card around every label.
- No hidden functionality, fake buttons, fabricated urgency, or suppressed test failures to make screenshots look cleaner.
- The existing backend behavior, permissions, notification rules, finance calculations, report versions, and data must remain intact.
- Independent audits stay deferred to final stabilization. Normal implementation tests and release protections remain in force.

## 1. Establish shared foundations before page-specific fixes

Inspect the existing tokens, shared styles, components, and computed browser styles. Confirm fonts/assets load, and check for CSS specificity collisions or inconsistent component usage before adding overrides. Solve shared problems at their source without leaking styles into published reports or PDFs.

Use a coherent type hierarchy. Initial visual targets, not a new font system:

- Page title: 28-32 px, approximately 650-700 weight where available.
- Section title: 18-20 px, 600 weight.
- Record title: 15-16 px, 600 weight.
- Body and controls: 14-16 px, 400-500 weight.
- Metadata: 13-14 px, comfortably readable contrast.
- Financial values: 24-28 px for a small number of summaries, tabular numerals for aligned amounts.

Use 4/8/12/16/24/32/48 px spacing tokens. Starting relationships:

- Label to control: 6-8 px.
- Related controls: 8-12 px.
- Field groups: 16-24 px.
- Header to tabs: about 20-24 px.
- Tabs to filter region: 16-20 px.
- Filter region to results: 20-24 px.
- Distinct sections: 24-32 px.
- Main desktop inset: 24-32 px; smaller screens: 16-20 px.

Optically adjust actual components where needed. Do not replace every margin with one uniform number. Remove both accidental crowding and unexplained large gaps.

Keep the existing Bloomsi brand family. Assign color semantic roles using its existing tokens where possible:

- Lavender/violet for selection, the main action, and quiet section emphasis.
- Teal for genuine successful/completed states.
- Amber for actual due-soon or attention states.
- Rose/red for actual blockers, overdue states, or destructive actions.
- Slate for archived, inactive, or unavailable states.
- Existing sky/aqua accents may distinguish informational surfaces, not compete with status meanings.

Use visibly tinted navigation, toolbars, and selected surfaces with white working surfaces and dark ink. More color must be visible in the result, not confined to a tiny icon. Check foreground/background pairs. Normal text requires at least 4.5:1 contrast; qualifying large text requires 3:1. Status meaning must also be written or represented by an appropriate icon, never color alone.

Use the existing icon library. Keep icon size/stroke consistent, usually 16-18 px beside labels. Decorative icons must not duplicate accessible names. Icon-only controls need a name and usable focus/hover/touch behavior.

Shared controls must have clear primary, secondary, tertiary, selected, hover, focus, disabled, and busy states. Reserve primary styling for the main action in each task region. Navigation stays a link; mutations stay buttons. Do not remove underlines globally from prose links. Never nest buttons or links inside an all-clickable link wrapper.

For ordinary controls target 40-44 px height with a deliberate compact variant for dense rows. Respect WCAG target-size and spacing rules; do not claim 44 px is the universal WCAG AA minimum. Keep focus rings visible and respect reduced motion. Brief 120-180 ms feedback transitions are enough; no attention-seeking loops.

## 2. App shell, identity, and notifications

Reduce the logo to a compact mark, initially around 104-120 px wide with natural aspect ratio. Do not replace the logo. Retain enough space around it without letting it dominate navigation.

Move workspace identity into a small, clearly labeled selector/control near the shell utilities. Use approximately 13-14 px medium text rather than a competing bold heading. Preserve switching behavior. Long names must be readable through the existing expanded selector or an accessible full-name affordance. Do not rename or hide the QA workspace to fake production content.

Replace the large Notifications navigation treatment with a compact bell utility. Keep a single consistent entry point, a visible focus target, and a numeric unread badge only when unread count is nonzero. Use a compact cap such as 99+ while retaining the actual count in the accessible name when available.

Bell interaction:

- Opens an anchored notifications panel without route navigation.
- Shows a bounded set of recent authorized items, clear unread styling, and loading/error/empty states.
- Includes a visible "View all notifications" link to the existing full inbox route.
- Clicking an item retains the existing authorized destination and read-state behavior.
- Opening the panel must not mark every item read.
- Reuse the existing notification service and request ownership safeguards. No duplicate polling loops or second data store.
- Keep workspace/user/membership scopes isolated across switches and delayed responses.
- Support keyboard opening, sensible focus order, Escape/outside dismissal, and focus return. Treat the content as an interactive panel, not a command menu with inappropriate roles. On mobile use a bounded sheet/dialog with its correct focus behavior.
- The panel may scroll internally when populated. The bell and navigation tabs must not acquire accidental scrollbars.

## 3. Work and Systems record views

Replace the combined heading/blurb string with a real "Work" heading and, only if useful, a separate brief supporting sentence. Apply the same rule to other page headers.

Keep Actions and Projects as clear, correctly semantic navigation/tabs. Put an obvious "Work templates" or equivalent accurate existing-capability control beside the toolbar rather than a plain-text-looking "Reusable Work setups" line. Preserve the underlying capability; choose the label after inspecting its actual destination.

Investigate the tiny vertical scrollbar around the tab strip using actual DOM dimensions and computed overflow/height styles. Identify the responsible element and fix sizing/overflow at that element. Do not use global overflow:hidden or hide scrollbar styling to conceal the problem. Preserve real content scrolling, narrow-screen tab access, and visible focus rings.

Replace oversized link-filled project rows with aligned structured rows:

- A prominent record title link.
- A quiet Client line and distinct Service/type labels with no middle-dot string.
- Lifecycle status and health, only where meaningful.
- A calendar-labeled target date and clearly grouped owner/avatar.
- A compact progress indicator with actual numerator/denominator and accessible text.
- Labeled, icon-supported shortcuts for Actions, Deliverables, and genuine blockers.
- The next phase as a separate readable subordinate line, not the first item in a long string of underlined links.

Keep the desktop title/summary, state, and date/owner columns aligned. On narrow screens group the same information into a readable stack. Wrap long record names without forcing metadata off screen. Reduce excessive row height without clipping multi-line names.

A displayed Archived record should not receive a misleading active urgency treatment. Inspect existing state semantics before hiding health text. Do not change stored statuses, archived filtering defaults, dates, or counts merely for appearance.

Use amber/rose accents only for genuinely due/blocked items. Do not manufacture alerts from missing owners or blank dates. Static pills and clickable shortcut chips must be visually distinguishable. Preserve each shortcut's correct destination and filter scope.

## 4. Prospecting: layout and measured responsiveness

Center the empty state within the results region, not against the first table column. Use a small relevant icon, a clear heading, a short next step, and one appropriate main action. Avoid a giant illustration or a full-screen onboarding modal.

Distinguish:

- No prospects in the workspace: "Add your first prospect" with Add prospect.
- Existing records excluded by filters: "No prospects match these filters" with Clear filters as the main recovery and Add prospect as secondary where permitted.

Do not use a filtered count of zero as proof that the whole workspace is empty. Do not add an expensive unconditional total query solely for copy. Retain useful filters/header while removing an unnecessary empty selection checkbox.

Investigate the reported slow opening independently from the layout correction. Capture authenticated empty and populated navigation with the same deployed/build revision, browser, workspace, and connection conditions. Separate first load and repeated client navigation.

Trace click-to-feedback and click-to-usable content, network timing, route data, auth checks, query timing, unnecessary counts/aggregations, JavaScript/hydration, and duplicate fetches. These are possibilities to inspect, not a preset diagnosis.

Fix the observed bottleneck using existing architecture. Render useful navigation feedback promptly without presenting stale records as current. Do not bypass authorization, persist cross-user caches, hide the delay behind an indefinite skeleton, or call a paint-only change a server speedup.

Report compact before/after timings and the actual cause. Use custom click-to-content marks for client navigation where document Navigation Timing does not capture the transition. Preserve existing overall PERF3 status rather than claiming this one route closes it.

## 5. Skill Library

Make the prospect picker a clear task region with a selected-prospect summary or explicit empty selection. Give instruction download its own secondary action rather than crowding it against helper text.

"Uses" and "Produces" should be real headings with actual semantic lists. Align heading, list markers, and text; use a consistent list gap and column gutter. Stack cleanly on small screens. Plain bullet lists are appropriate here and are different from banned inline middle-dot metadata strings.

Clarify the manual-review mode and expected output without falsely implying an automated audit is running. Existing instructions/schema disclosures remain accessible. Do not add an automated skill runner as a styling shortcut.

## 6. Social, Ads, and shared filter toolbars

Put the title and primary action first, section navigation second, filters third, and results last. Separate those regions using consistent spacing and restrained surface tint.

Use tabs for distinct sections and an appropriate view switcher for alternate presentations of the same data. Preserve actual navigation/link semantics rather than forcing ARIA tabs onto route links.

Align labels and controls, use a responsive field grid, keep Apply and Clear/Reset grouped without giant stretched buttons, and preserve URL/back-navigation behavior. Do not silently replace explicit filter application with an entirely different automatic-query contract.

Do not alter social/advertising workflow meaning, trigger real publishing/outreach, or invent create buttons for unsupported operations. Existing empty states should identify the real next supported action.

## 7. Pages: usable editor space and obvious actions

Make the editor shell use the available main-area width after global navigation. Use a bounded/collapsible page tree, modest canvas insets, and no unexplained fixed-height spacer pushing useful tools below a large blank region. A writing area needs room; it does not need multiple nested centered max-width containers.

Keep prose readable within the fluid canvas and allow genuinely wide blocks/tables to use the available width. Do not force every line to stretch across an ultrawide display. Do not add a persistent layout-preference backend merely for this pass.

Use a clear editor toolbar:

- Breadcrumb with deliberate truncation that does not crowd out controls.
- Saved/Saving/Error as a truthful read-only status.
- Obvious Comments and Share controls, respecting current access.
- Template and record-context tools in a visible compact toolbar/inspector or named disclosure, rather than large floating utility paragraphs after a giant blank area.
- Clear Add subpage and record-link actions.

Inspect the actual ellipsis behavior. If its only supported operation is Move, label it Move or use a clearly named move control. If several operations exist, use a correctly labeled menu that exposes those actual actions. Do not fabricate Rename/Duplicate/Delete commands without valid supported behavior and authorization.

Exercise existing editing, title change, block controls, subpages, Page move, comments, sharing, template reuse, record context, save/reopen, and error recovery where implemented. Visual cleanup must not regress selection, caret position, autosave, permissions, or document content.

If an agreed Notion-like editing interaction is absent, record the exact missing behavior on the existing completion list. Complete small existing-UI wiring gaps here. Do not declare the whole editor complete or start an unbounded editor rewrite to cover missing product functionality.

## 8. Team

Put Team and its main Invite action at the top. Move the row currently floating above the heading into a clearly named, consistent Team navigation region.

Group People, Workload, and Department work as views using their real destinations. Treat Finance access as an authorized administrative utility, not a peer primary action competing with Invite. Keep it findable and preserve its permission checks; relocation does not grant capability.

Improve member row hierarchy: person, email, role, status, then available administration controls. Keep dangerous actions separate and use the existing confirmations. Avoid filling every row with equally weighted borders and buttons.

## 9. Finance Lite

Present existing data as an operational record view rather than scattered label/value paragraphs.

Use a small, clearly separated summary region with currency, record type/status, amount, and correct record counts. Keep invoices and payments distinct. Do not add them into a fictional net total, infer invoice balance from unrelated payments, combine currencies, or invent a reconciliation model.

For desktop, use an accessible table or structured grid with clear headers, right-aligned tabular amounts, readable Client/Service links, status labels, dates, and real row actions. Show optional renewal/detail metadata in a coherent secondary area or detail disclosure instead of excessive blank record height. Mobile must retain the critical identity/status/amount without losing actions.

Keep date, overdue, history, total/filter scope, and currency semantics exactly as implemented. Move the UTC explanation and calculation scope into compact helper text or an accessible information disclosure, not an unexplained hidden tooltip. Use singular/plural correctly.

Do not initiate payments, change finance permissions, modify financial calculations, or add live accounting integrations in this UI task.

## 10. Settings

Keep the current organization. Apply shared heading/description/control spacing and align section content and related buttons. Review onboarding setup and Work setup for clear action labels and visible secondary-button styling.

Do not redesign access management or change the underlying setup procedures.

## 11. Implementation order and scope control

At a safe checkpoint, preserve any unfinished current work. Inspect shared-component ownership before creating a dedicated UI branch/worktree from current main. Do not reset, discard, or duplicate other sessions' work.

1. Shared typography/spacing/surfaces/controls and shell.
2. Work/Systems as the reference list treatment; tab-overflow correction.
3. Compact notification panel and Prospecting empty state/latency correction.
4. Pages editor layout and control clarity.
5. Apply the same components to Skills, Social, Ads, Team, Finance, and Settings.

Use shared components/tokens where genuinely reusable, not one giant override stylesheet or a new UI framework. Do not migrate the database or refactor unrelated business logic. A measured, bounded read-path fix for Prospecting is in scope; an unrelated architecture rewrite is not.

Use one writer for shared shell/style files. Preserve a finite checklist of the screenshot issues in the existing project documentation. This brief does not add a second feature roadmap.

## 12. Verification and visible completion

Check a completed built application and the released staging revision, not isolated pretty components alone. Reuse supported QA identities and records. Do not remove or rename fixtures just to improve screenshots; use clearly identified representative synthetic names where necessary and label them as demo data.

Use representative widths around 1440, 1280, 1024, 768, and 390 CSS px, plus 200% zoom and keyboard traversal. Check Windows scrollbar behavior explicitly. Cropped screenshots do not alone prove a page overflows; measure actual scroll/container dimensions.

Required visual checks:

- No accidental vertical scrolling in tab strips or clipped control/focus outlines.
- No page-wide horizontal overflow, except intentional locally scrolling tables or wide editor blocks.
- Clear active navigation, primary actions, and full-name access for truncated labels.
- No label/control collisions; consistent spacing and readable statuses.
- Both empty and populated results, long names, loading/errors, archived states, and real attention states.
- All pictured routes receive the same shared hierarchy and control treatment.
- No authored U+2014 or U+00B7 separators in changed UI strings. Do not scan or rewrite user data.

Required behavioral checks:

- Existing navigation, deep links, filters, and record actions still work.
- Notification panel open/close, unread counts, item destinations, View all, and scope changes work without reintroducing request races.
- Pages caret/edit/save, tree/menu, comments, sharing, and record/template controls retain their actual supported behavior.
- Permission boundaries and financial/reporting results are unchanged.
- Prospecting improvement is supported by before/after measurement, with any remaining cause honestly stated.

Run focused tests during iteration, then the normal full suite/build and relevant regression/browser checks at a coherent integration checkpoint. Do not rerun the entire product suite for each spacing tweak. Keep existing green checks honest. Shared-style changes deserve a representative visual sweep, not merely higher assertion totals.

Use the standing normal PR/CI/merge/staging authorization, respecting repository protections. No new independent-audit stop, no repeated permission requests for the already-authorized staging release, and no large review archive. Do not touch production, DNS, billing, real outreach, or shared-data resets.

Finish with the staging URL/revision, matched before/after screenshots, exact click paths, which screenshot issues are fixed, Prospecting timing results, and any genuine unfinished interaction. Do not lead with test counts or claim the entire product roadmap is complete. Return to the agreed feature-completion list after this pass.

## External references

These references support accessibility and interaction patterns. Exact visual choices above are proposals based on the owner's feedback, not mandated by these sources.

- Atlassian spacing: https://atlassian.design/foundations/spacing
- Carbon button hierarchy: https://carbondesignsystem.com/components/button/usage/
- Carbon tabs: https://carbondesignsystem.com/components/tabs/usage/
- Carbon content switcher: https://carbondesignsystem.com/components/content-switcher/usage/
- Atlassian empty state: https://atlassian.design/components/empty-state
- W3C use of color: https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
- W3C text contrast: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- W3C target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- W3C dialog pattern: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- W3C tabs pattern: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- MDN overflow: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow
- web.dev interaction diagnostics: https://web.dev/articles/optimize-inp
- web.dev resource/navigation timing: https://web.dev/articles/navigation-and-resource-timing
