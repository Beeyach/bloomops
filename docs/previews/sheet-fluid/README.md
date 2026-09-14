# Fluid prospect sheet

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
