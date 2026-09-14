# N1 release — accepted in staging

PRs67–72 combined in `release/n1-checkpoint`. All original accepted heads remain in history; only the build tracker and N1 contract conflicted. Application changes merge cleanly. A focused integration correction keys internal and portal search by the current user/workspace, so a real same-route account refresh cannot retain another user's query/results.

331 relevant Node tests and the production OpenNext build pass. After the two search route keys changed, the29 affected search/shell tests and final production build pass. Fresh database and second migration pass verify all45 domain migrations. Existing migration0044/populated-copy acceptance remains unchanged. The combined built-Worker browser checks cover23 client creation,45 search,42 profile,30 new-prospect,30 Pages and27 sheet checks. Those197 checks precede only the search scope correction;13 final account-replacement checks verify the corrected internal and portal routes. Eleven earlier checks reproduced the unfixed leak.

The first search harness run reused an existing synthetic filename; duplicate-result disambiguation invalidated its exact link label. Distinct N1R fixture names made the full45-check run pass, including exact downloaded bytes. Repeated synthetic sign-ins encountered the normal rate limit; the account test now reuses its own issued private sessions. No application limits were weakened.

All browser fixtures are synthetic and isolated; provider egress is blocked. Actual desktop/phone captures below were inspected. Timing uses local synthetic records and does not establish production latency. Combined request/query/bundle measurements are in `performance.json`.

- [Desktop prospect sheet](sheet-1440.png)
- [Phone prospect sheet](sheet-390.png)
- [Desktop search](search-1440.png)
- [Phone portal search](portal-search-390.png)

One fresh Sol High integration/deployment review and the single focused re-review are complete, with no remaining material findings. The reviewer required guaranteed cleanup of the staging portal fixture: an enclosing try/finally now restores the receipt-bound QA membership to owner, clears its synthetic contact link, revokes its test grant and restores the original selected workspace, including failure paths. Five injected cleanup cases pass independently. Ordered merges and final authenticated staging acceptance are now complete, as recorded below. The individual slice reviews remain accepted. This checkpoint does not close the remaining all-app form-recovery inventory. Original LTB/voices, production/DNS, paused email/video and paid auditing remain unchanged.

## Merged main and staging

[Open the staging sheet](https://staging.ops.gobloomwired.com/prospecting). PRs67–72 merged in that order, with main ending at `1f9c1c14051f5887b5b351f3c0ba774a08d5a600`. Its tree exactly equals reviewed candidate `71a6388`. Later release documentation does not change the deployed runtime. [Deployment34863338309](https://github.com/Bloomwired/bloomops/actions/runs/34863338309) and [disposable fresh-database34863338085](https://github.com/Bloomwired/bloomops/actions/runs/34863338085) succeeded on this main SHA. Version/health readback confirms `1f9c1c1`, staging and45 healthy domain migrations.

[24 public checks](staging-public-checks.json) and [63 distinct authenticated checks](staging-acceptance.json) pass. The authenticated tests used a newly created, receipt-bound QA workspace and fictional records. The reviewed cleanup wrapper restored owner role, removed the synthetic contact link, revoked the Page grant and restored the original selected workspace even after test failures. The final successful portal run exercises all those operations and verifies the saved document stayed unchanged after access was revoked.

| Affected flow | Live acceptance |
| --- | --- |
| Search | All five internal types, canonical record links, exact file bytes, workspace refresh reset and server denial; portal exposes only authorized Pages/Files and removes a revoked subtree. |
| Sheet | Desktop/phone fit, all17 optional fields at1440/320, visible Website, full-profile navigation, selection, reviewed edit/undo, persistent view/filter/date order/50-row preference and Sample CSV. |
| Profile | Failed save retention, metadata-first reload recovery, explicit canonical save and wrong-user denial. |
| New prospect | Real commit followed by a simulated lost reply; original receipt recovered, later input retained and replay returns the original prospect. |
| New client | Real commit/lost reply, retry despite later incomplete email, download of later input, canonical client link, one receipt/contact and wrong-user denial. |
| Internal and portal Pages | Rich content preserved through failed autosave and reload; authorized recovery waits for explicit save; portal lost reply adds no duplicate write/revision; actual inherited child link; revocation removes editor and denies API/search. |
| Preservation | Two captured earlier QA profile hashes unchanged; temporary portal access restored; [read-only SQL](staging-data-readback.json) confirms duplicate-safe creation and no invitations, onboarding runs, deliveries, conversions or CSV imports. |

Inspected live visuals:

- [Desktop sheet](staging-sheet-1440.jpg) and [phone sheet](staging-sheet-390.jpg)
- [Phone prospect recovery](staging-prospect-recovery-390.jpg) and [client recovery](staging-client-recovery-390.jpg)
- [Desktop internal Page](staging-pages-internal-1440.jpg)
- [Phone portal search](staging-portal-search-390.jpg) and [portal Page](staging-portal-page-390.jpg)

The first portal attempt stopped before access changes because Wrangler file execution returns an import summary rather than query rows. The private fixture helper now uses `--command` and checks exact rows. A fixture-text capitalization assertion and the recorded workspace of earlier preservation IDs were corrected; both earlier profiles then matched their original hashes. The successful run is the acceptance result. `.test` website resolution errors are intentional synthetic favicon fallback cases.

Live acceptance complements the broader isolated Worker matrices; every storage-limit, concurrent writer and actual account/logout scenario was not repeated in the owner's browser. No full remote LTB before/after snapshot is claimed. No real prospect import, invitation, outreach, paid API, video, production or DNS action occurred. No N2 implementation was started. Next is the bounded client overview contract; broader form recovery remains explicitly unfinished.
