# Fluid prospect sheet

The sheet previously filled the workspace width but collapsed around a short result set, leaving most of a tall screen unused. It now fills the available desktop/tablet height with narrower outer gutters. Rows keep their normal text size and height; the records viewport expands and scrolls, with pagination below it. Phones and short screens keep their existing natural page flow.

Only `app/prospecting.css` changes runtime behavior. No JavaScript, query, schema, dependency or deployment configuration change. Production OpenNext build and [23 browser/layout checks](layout-checks.json) pass. Checks used exact candidate CSS in the existing staging DOM; long-list clones were temporary layout fixtures, never database records. Real selection/clear was exercised without saving data. Final Filter/Sort/Columns checks pass at all six main widths; desktop menus anchor inside the toolbar so wrapped buttons cannot place a popup outside the canvas.

- [1440-pixel desktop](preview-1440.jpg)
- [1920-pixel desktop](preview-1920.jpg)
- [390-pixel phone](preview-390.jpg)

These candidate previews were visually inspected. Independent review and actual deployed CSS verification are pending. N2 remains unstarted. Original LTB records/voices, production/DNS, real imports/outreach, paid auditing and video are unchanged.
