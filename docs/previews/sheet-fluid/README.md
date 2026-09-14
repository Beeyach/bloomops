# Fluid prospect sheet

## Platform and Fit picker follow-up

Platform and Fit cells now expose labelled, bordered choices with chevrons and compact icons. Platform has seven common suggestions and a custom-text escape in row editing, filters and bulk editing. Existing values are retained exactly until deliberately changed. Fit adds distinct icons and colored readable states. Outreach still comes from recorded activity. Default column proportions give the controls room without changing saved width preferences.

Seven unmodified platform website marks are served locally; [asset origins](../../../public/brand/platforms/README.md) identify their official sources. Unknown/custom platforms retain text and a neutral systems icon. Custom saved views now reuse the colored table icon. No runtime lookup service, dependency, query, backend, authorization, schema or workflow change.

The final OpenNext build and33 existing focused sheet/draft tests pass. [29 built-Worker checks](pickers-browser-checks.json) verify the real app on a separate copy of synthetic local D1/R2, with provider egress blocked. Coverage includes platform/custom/Fit preview-save-undo, historical values, no write on choice alone, platform filtering, bulk preview/cancel, keyboard activation/Escape and closed/open editor fit at six widths. [Four extra checks](pickers-visual-checks.json) verify all seven image decodes,44px touch targets and native picker/Escape on desktop and real mobile emulation. Desktop and phone captures were inspected.

- [Platform logos and Fit icons on desktop](pickers-logos-1440.png)
- [Phone properties](pickers-logos-390-fields.png)
- [Desktop editor](pickers-picker-1440.png)
- [Phone editor](pickers-picker-390.png)

The first preview required wider default Platform/Fit proportions and tighter control gaps. A test compared nullable data to a native input’s empty string; corrected without a runtime change. Chromium later crashed because system `/tmp` was full; a task-local TMPDIR and already available shared libraries resolved the harness issue. All recorded checks pass on the final build. One fresh Sol High review found no material findings; no re-review was needed. Actual staging acceptance is recorded below. No real record edits/imports/outreach or production/DNS changes. N2 remains unstarted.

## Picker staging result

[Open staging](https://staging.ops.gobloomwired.com/prospecting). [Workflow34877680036](https://github.com/Bloomwired/bloomops/actions/runs/34877680036) succeeded on runtime `f042754a01d96f2dc37737f9f944bcfddf4b6a27`. [12 live checks](pickers-staging-checks.json) pass against actual deployed markup/styles: runtime and healthy45 migrations, local Kajabi marks, six widths and touch sizing, keyboard Platform entry/Escape, four existing Fit options, and quick-pick filtering with the current value retained. No preview CSS/markup injection or staging record edits. Save/undo data checks used the isolated local fixture above.

- [Live desktop](pickers-staging-1440.jpg)
- [Live phone properties](pickers-staging-390.jpg)

Both captures were visually inspected. The task-only local Worker8802 is stopped. PR73 remains draft/unmerged; N2 has not started. No production/DNS or original LTB changes.

## Compact typography and clear links follow-up

The owner requested smaller table text, an external-link icon beside each URL and a visibly clickable Next Action. Desktop sheet text is now14px with tighter row spacing; phone text remains16px and action targets remain44px. Website text/icon share a flex link. Next Action uses a quiet tinted border, chevron and hover/focus treatment while preserving its canonical profile destination. Full-screen sizing stays in place. Only sheet CSS and presentation JSX change; no business logic, query, authorization, schema or workflow change.

The final production OpenNext build and [13 candidate checks](density-candidate-checks.json) pass, covering six widths and actual keyboard focus. These previews use exact candidate CSS and matching presentation markup on existing synthetic staging records. Viewport changes can refresh React rows; checks wait for loaded records before applying the candidate markup. This evidence is distinct from the final deployed acceptance recorded below.

- [Compact desktop candidate](density-candidate-1440.jpg)
- [Phone candidate](density-candidate-390.jpg)
- [Phone Next Action](density-candidate-390-action.jpg)

One fresh Sol High deployment review found no material findings; no re-review was needed. The refinement is now accepted in staging as recorded below. No record edits or external audits were started.

## Compact-sheet staging result

[Open staging](https://staging.ops.gobloomwired.com/prospecting). [Workflow34874879661](https://github.com/Bloomwired/bloomops/actions/runs/34874879661) succeeded on `54dd8aec44c13ae4540018abaf2d1a484d60f31f`. [17 live checks](density-staging-checks.json) verify the actual deployed CSS/JSX with no injection: runtime/staging health with45 migrations, six widths, compact desktop/readable phone type, no horizontal overflow, inline website-icon geometry, safe website link attributes, bordered Next Action,44px phone targets and visible keyboard focus. Actual keyboard Enter opens the canonical profile; back restores the saved sheet view and two synthetic results. No record writes or audit execution occurred.

- [Deployed desktop](density-staging-1440.jpg)
- [Deployed phone](density-staging-390.jpg)
- [Deployed phone Next Action](density-staging-390-action.jpg)

All three captures were visually inspected. No new migration, broad suite or fresh-database run was needed for this presentation-only follow-up. PR73 remains draft/unmerged; N2 remains unstarted. Main remains85ab496 and production/DNS are unchanged. The earlier evidence below describes the preceding fluid-height release.

## Earlier fluid-height correction

The sheet previously filled the workspace width but collapsed around a short result set, leaving most of a tall screen unused. It now fills the available desktop/tablet height with narrower outer gutters. Rows keep their normal text size and height; the records viewport expands and scrolls, with pagination below it. Phones and short screens keep their existing natural page flow.

Only `app/prospecting.css` changes runtime behavior. No JavaScript, query, schema, dependency or deployment configuration change. Production OpenNext build and [23 browser/layout checks](layout-checks.json) pass. Checks used exact candidate CSS in the existing staging DOM; long-list clones were temporary layout fixtures, never database records. Real selection/clear was exercised without saving data. Final Filter/Sort/Columns checks pass at all six main widths; desktop menus anchor inside the toolbar so wrapped buttons cannot place a popup outside the canvas.

- [1440-pixel desktop](preview-1440.jpg)
- [1920-pixel desktop](preview-1920.jpg)
- [390-pixel phone](preview-390.jpg)

These candidate previews were visually inspected. One fresh Sol High review found no material findings; no re-review was needed. The final deployed stylesheet is accepted as recorded below. N2 remains unstarted. Original LTB records/voices, production/DNS, real imports/outreach, paid auditing and video are unchanged.

## Staging result

[Open the prospect sheet](https://staging.ops.gobloomwired.com/prospecting). [Workflow34871184108](https://github.com/Bloomwired/bloomops/actions/runs/34871184108) succeeded on runtime `43374ccdbe603976906f42b9c04cf0a01c9ac8f8`. Version/health confirm this runtime and the unchanged45 healthy migrations. [20 deployed checks](staging-checks.json) repeat the responsive layout, toolbar menus, long-list scrolling/sticky header/pagination and actual bulk selection/clear with no injected CSS. At1440x1000 the sheet is859px high versus454px before; rows retain their normal height.

- [Actual desktop staging page](staging-1440.jpg)
- [Actual phone staging page](staging-390.jpg)
- [Phone loading state](staging-loading-390.jpg)

Long-list clones are temporary browser-only geometry fixtures, removed after each check. No record edits, imports or database fixtures were needed. These checks establish layout behavior, not a new performance benchmark. PR73 remains draft/unmerged; merge readiness precedes N2, which has not started. No production or DNS change.
