# P4I linked Work views — local preview

Pages can contain Table, Board, Calendar and Gallery views of canonical Actions. Use slash insertion, choose a layout, then **Show Work**. Editors save the layout/status filter with the document; reader controls are temporary. Records load explicitly, refresh on request and paginate in groups of50. Phone calendars use a date list. Records remain read-only here; their links open existing Work pages.

A page grant never grants Work access. Internal recipients see only independently authorized Actions; clients see an unavailable view. Documents store configuration and static fallback text, never Action rows. No operational mutation, migration, real sharing, mail, video work or deployment.

## Visuals

[Desktop table](table-1440.png), [desktop board](board-1440.png), [gallery at1024px](gallery-1024.png), [table at768px](table-768.png), [phone table](table-390.png), [phone calendar](calendar-320.png), [client boundary](client-unavailable.png).

All four layouts were exercised at1440/1024/768/390/320. Native controls retain44px targets and labelled filtering. The live Bloomlab design gallery was inspected. Mobile table borders inherited from the writing editor were removed; calendar phones use an agenda instead of narrow grid cells.

## Verification

105 distinct focused domain/editor/access tests pass, plus48 page-sharing/link/movement regressions. The final Worker build and55 linked-view browser checks pass.45 editor/recovery browser checks pass after updating the obsolete assertion that hid all database layouts. 39 rich-reader browser checks also pass. A fresh42-sample navigation run (30 retained,6 cold loads) retains the same Home/Clients/Work request/statement/call counts as P4H. Shared JavaScript adds153 decoded bytes (10 scripts unchanged); no editor runtime or Pages queries load on unrelated routes. Timing differences include one or two frames and are not a statistically significant performance claim. [Comparison](navigation-comparison.json), [raw measurements](navigation-current.json). The final build includes a copy-only pagination clarification: “Showing8 actions on page1.” Six additional browser checks verify its wording,1440/390/320 sizing and next-page behaviour. [Final desktop pagination](pagination-final-1440.png), [phone pagination](pagination-final-390.png), [narrow pagination](pagination-final-320.png). Earlier layout captures and the other browser/performance checks precede only that sentence change. One fresh Sol High read-only review found no material findings; no re-review. The reviewer relied on the supplied execution evidence.

The linked-view suite covers configuration round trips, all layouts, error/retry/loading/empty, assigned internal reader, client editor/reader denial, revocation, invalid queries, actual Action navigation, pagination, no operational writes/provider egress and no editor runtime in the reader. Initial browser runs exposed the reader rerender fallback, corrected by isolating static document markup. Other harness corrections distinguish Work API reads from route prefetch and wait for native editor focus/selection.

Evidence: `/home/ary/Developer/bloomops-pages-p4i-evidence/`. This is a local preview, not a staging release.
