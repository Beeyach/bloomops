# N1 release candidate

PRs67–72 combined in `release/n1-checkpoint`. All original accepted heads remain in history; only the build tracker and N1 contract conflicted. Application changes merge cleanly. A focused integration correction keys internal and portal search by the current user/workspace, so a real same-route account refresh cannot retain another user's query/results.

331 relevant Node tests and the production OpenNext build pass. After the two search route keys changed, the29 affected search/shell tests and final production build pass. Fresh database and second migration pass verify all45 domain migrations. Existing migration0044/populated-copy acceptance remains unchanged. The combined built-Worker browser checks cover23 client creation,45 search,42 profile,30 new-prospect,30 Pages and27 sheet checks. Those197 checks precede only the search scope correction;13 final account-replacement checks verify the corrected internal and portal routes. Eleven earlier checks reproduced the unfixed leak.

The first search harness run reused an existing synthetic filename; duplicate-result disambiguation invalidated its exact link label. Distinct N1R fixture names made the full45-check run pass, including exact downloaded bytes. Repeated synthetic sign-ins encountered the normal rate limit; the account test now reuses its own issued private sessions. No application limits were weakened.

All browser fixtures are synthetic and isolated; provider egress is blocked. Actual desktop/phone captures below were inspected. Timing uses local synthetic records and does not establish production latency. Combined request/query/bundle measurements are in `performance.json`.

- [Desktop prospect sheet](sheet-1440.png)
- [Phone prospect sheet](sheet-390.png)
- [Desktop search](search-1440.png)
- [Phone portal search](portal-search-390.png)

Fresh independent integration/deployment review, ordered merges and final authenticated staging acceptance are pending. The individual slice reviews remain accepted. This checkpoint does not close the remaining all-app form-recovery inventory. Original LTB/voices, production/DNS, paused email/video and paid auditing remain unchanged.
