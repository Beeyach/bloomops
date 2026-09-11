# Home query optimization — 2026-09-11

Historical evidence preserved from documentation-only commit `10664003c39af8c0343a9348d09c9a2bab22a0ed`. This report describes the original staging candidate, not the clean integration branch. See [PERFORMANCE_INTEGRATION.md](PERFORMANCE_INTEGRATION.md) for integration provenance and checks. The historical PERF4 diagnostic runtime is excluded from the PR.

Application baseline: `137773bc2b70b322694c33a0c756714c00003833`.
Application candidate, deployed to staging: `68580d7fdff779ec9cdfec7f67381af9cf5e7724`.
Branch: `perf/home-query-optimization`, created directly from the application baseline.
The later baseline documentation commit was not used as the application parent.

## Decision

Use a scalar JSON Client-day lookup only in Home's common timezone map. This is one SQL-expression optimization used by Home's Overdue Actions, Today Actions, attention Project summaries, and forward Deliverables. The other six statements, predicates, columns, ordering, limits, batching, identity and membership checks are unchanged. Systems and Work retain their existing expression. Home remains ten statements in one projection batch after fresh identity/membership authorization: two ordinary serial D1 waits total.

Before:

```sql
coalesce((SELECT value FROM json_each(?) WHERE key=bloomops_clients.timezone), ?)
```

After:

```sql
coalesce(json_extract(?, '$.' || json_quote(bloomops_clients.timezone)), ?)
```

Both bind the same current-request map and UTC fallback. The SQL JSON path treats the timezone as an object key. The runtime-owned formatter cache and timezone enumeration are inherited from the accepted baseline. Existing authorization-scoped timezone validation and the exact legacy-alias fallback remain unchanged. No result, session, membership or authorization decision is cached across requests. The scalar behavior and path semantics are documented by [SQLite](https://www.sqlite.org/json1.html); compatibility is also exercised on actual disposable workerd/D1.

## All ten statements inspected

The actual Home path is `HomePage → requireShell → getAccess/getActor → homeProjection → readTogether → readHomeProjection`. Four `listActions` calls, one `listProjectSummaries`, one `homeDeliverables`, two `recentOutputs` queries, and two distinct authorization-scoped timezone reads comprise the batch. Full bound-placeholder SQL and before/after EXPLAIN details are in [the query evidence](evidence/HOME_QUERY_plans.json). No real bind values or business rows are retained. Ordinals below are the captured batch's enqueue order, not ten network round trips.

| Statement / producer | Query plan and review | Decision |
|---|---|---|
| 1 Overdue / `listActions` | `SEARCH actions USING INDEX actions_project_request_uq (workspace_id=?)`; indexed Project/Client/context joins; covering dependency-edge lookup; correlated `SCAN json_each VIRTUAL TABLE INDEX 1:`; temp ordering B-tree. Workspace-wide Action filtering does not use a tighter due-date range from the existing Project/assignee-prefixed indexes. | Replace the repeated timezone scan. |
| 2 Today / `listActions` | Same workspace Action lookup and indexed joins; correlated timezone virtual-table scan; temp ordering. | Same scalar lookup. |
| 3 Waiting / `listActions` | Workspace index filtering, indexed context joins, no timezone calculation; temp ordering. Existing status indexes have intervening Project or assignee keys. | Leave intact: much smaller measured cost. |
| 4 Review / `listActions` | Same shape as Waiting; no timezone calculation. | Leave intact. |
| 5 attention Projects / `listProjectSummaries` | `SEARCH projects USING INDEX projects_ws_owner_idx (workspace_id=?)`; child totals use workspace+Project indexes and dependency indexes. Flattened CTE repeats Action/Deliverable aggregates through attention selection, filtering and ordering. EXPLAIN contains ten timezone virtual-table scan nodes; this is the most expensive statement in the fixture. | Replace its Client-day expression. Do not also materialize/rewrite the CTE. |
| 6 forward Deliverables / `homeDeliverables` | Workspace-indexed Deliverables with indexed Project/Client joins, one correlated timezone scan, temp ordering; review/approved statuses short-circuit the horizon predicate. Seven-row bound. | Same scalar lookup; little measured gain on review-heavy fixture. |
| 7 recent deliveries / `recentOutputs` | `activity_events_ws_occurred_idx (workspace_id=? AND occurred_at>? AND occurred_at<?)` plus indexed current Deliverable/Project/Client joins; temp B-tree only for event-ID tie ordering. | Leave intact: indexed fourteen-day range, seven-row bound. |
| 8 recent files / `recentOutputs` | Same indexed activity range; indexed Asset/link/Project/Client reads and authorization subquery. Temp B-tree for the last ordering term. | Leave intact: current file/link authorization is necessary; seven-row bound. |
| 9 Action timezones / `readableActionTimezones` | Covering workspace Action index, indexed parent/context joins, temp GROUP BY and scan of the resulting `bo_read` CTE. Service/Type/Department joins are redundant for this unfiltered Home read but support the shared filtered reader. | Leave intact: distinct Action-only scope is necessary and measured cost is small. |
| 10 Project timezones / `projectTimezones` | `SEARCH projects USING COVERING INDEX projects_ws_client_idx (workspace_id=?)`; indexed Client join; temp GROUP BY and resulting CTE scan. | Leave intact: independent Project scope must not be widened by Action assignments. |

No unrestricted business-table full scan appeared in these Owner plans. Workspace-prefix searches still process workspace rows; they are not constant-cost reads. Membership/workspace guards use indexed scalar subqueries. Some repeated guard expressions are redundant for an Owner, but removing them would broaden the authorization review for very little observed benefit.

Action reads select 29 columns for the canonical DTO although Home renders a subset. Removing description/revision/Milestone context could reduce row bytes and some joins, but each section is bounded to five SQL rows and the SQL date predicates dominate this fixture. Project results are bounded to six rows, Deliverables/recent sources to seven each. No N+1 loop or removable duplicated result query was found. The two timezone reads deliberately authorize different scopes. No index or schema change was justified over the cheaper expression change.

## EXPLAIN and measured query cost

`node scripts/home-query-plan-local.mjs` uses all committed domain migrations and the existing in-memory SQLite/D1 adapter. It captures the actual candidate SQL, reconstructs the exact prior date expression with identical synthetic binds, compares every result row, runs EXPLAIN for all ten statements in both forms, and retains ten alternating-order timing pairs after two discarded pairs. SQLite version is recorded in the evidence. This is local SQL execution cost, excluding preparation, identity, network and rendering; it is not a live D1 duration.

| Statement | 1,000 Actions: prior → candidate median ms | 3,000 Actions: prior → candidate median ms |
|---|---:|---:|
| Overdue | 18.811 → 2.816 | 56.036 → 7.771 |
| Today | 18.060 → 1.997 | 54.380 → 5.648 |
| attention Projects | 43.200 → 7.225 | 120.097 → 17.297 |
| forward Deliverables | 0.191 → 0.191 | 0.341 → 0.342 |

EXPLAIN's timezone `SCAN json_each` nodes fall from 1/1/10/1 to zero in those four statements. Indexed business-table and authorization reads remain. This is a scalar-expression simplification, not a claim of an O(1) JSON index. Materializing only the Project-summary CTE was also tested before implementation: approximately 43.3→19.8 ms at 1,000 Actions, versus 43.3→7.1 ms for scalar lookup. Scalar lookup had the better observed payoff and also helps both Action lists, so only that change was implemented.

## TTFB review

The custom Worker streams OpenNext's response without buffering its body or waiting for the Analytics Engine sink. Middleware only checks cookie presence; fresh identity/membership and the projection follow in the server page. No Home-specific sleep, retry loop, extra external service, or conditional Home query round trip explains the previous 1.13-second TTFB outlier. Early RSC headers can precede completed authorization/projection work, so TTFB is not the Home batch's duration.

Better Auth's existing one-day session update interval can add a session refresh write when due. This is shared by all protected routes, and no evidence connects it to the earlier spike. Formatter creation on a fresh isolate is also possible, but the existing warm benchmark measured generic map formatting around a millisecond after initialization; there is no basis for attributing a second-long spike to it. Browser scheduling, network, isolate/adapter startup, D1 service time and shared request-path variation cannot be separated with this evidence. No telemetry was added and no definitive spike cause is claimed.

## Verification and staging

- Focused Home/Actions/Systems/navigation tests: 151/151 passed. New tests compare every runtime-listed zone plus aliases and null at four midnight/DST instants, canonical Action results, Project overdue totals and the exact fourteen-day Deliverable boundary.
- Full suite: 4,834/4,834 passed. A temporary external `python`→`python3` PATH alias was used for the existing packaging tests; it was removed afterward.
- Actual disposable workerd/D1: Home 40/40, Systems 24/24. Home proves ten statements/one batch, four scalar lookup statements with no timezone scan, current revocation/visibility/tenant boundaries and legacy-alias fallback. No R2 binding is needed for Home.
- `npm run cf:build`: passed, including Next compilation and available lint/type checks. Build provenance was derived from the exact committed checkout.
- Staging deploy: `npx opennextjs-cloudflare deploy -- --env staging`, successful. Cloudflare version ID `1ec82c7c-68a5-4ed3-acbb-68516ae8f601`.
- `/api/version` before measurements and afterward: HTTP 200, `sha: 68580d7`, `branch: perf/home-query-optimization`, `builtAt: 2026-09-11T13:19:43.299Z`.
- No application instrumentation, production deployment, schema/migration, auth-policy change, PR, merge, or D2. Prior PERF4 evidence files were not modified. The real staging session and membership were preserved.

## Signed-in Windows Chrome comparison

Existing authenticated Chrome, 1920×855 viewport, foreground, no artificial throttling. One warmup per route was discarded. Three retained Home→Systems→Ads cycles were followed by seven retained Home navigations with Ads as the return destination. Those seven extra Ads returns were designated positioning navigations before capture and are preserved separately in [the browser evidence](evidence/HOME_QUERY_browser.json). No retained outlier was excluded. Each timing starts immediately before clicking the actual navigation link and ends when the destination pathname and final visible main heading are present; Home also requires its completed `.bo-home` container. This is compatible with the accepted baseline's final-heading metric. Two animation frames precede the separate Resource Timing read. One Ads RSC timing was unavailable and remains null; its visible timing is valid.

| Route | Accepted baseline median / range ms | Candidate retained samples ms | Candidate median / range ms |
|---|---|---|---|
| Home | 700.8 / 595.8–1780.9 | 938.3, 938.4, 676.9, 668.9, 764.8, 634.4, 659.3, 665.8, 678.7, 660.5 | **672.9 / 634.4–938.4** |
| Systems | 587.8 / 532.5–672.6 | 626.8, 616.5, 618.8 | **618.8 / 616.5–626.8** |
| Ads | 374.8 / 352.1–546.6 | 410.5, 412.7, 401.2 | **410.5 / 401.2–412.7** |

Home median improves 27.9 ms (4.0%); zero of ten retained clicks exceeds one second. This is a modest improvement, not evidence of a large perceptual speedup. Systems and Ads medians are higher by 31.0/35.7 ms (5.3%/9.5%) but remain inside their previous ranges. Their application SQL is unchanged. Three control samples do not prove absence of a performance regression, and historical runs are not a paired live experiment. The live result does not establish a large benefit despite the clear populated-fixture SQL gain. Home still exceeds the approximately 500 ms median target, and two samples exceed 800 ms. PERF3/PERF4 remain open; no further optimization was implemented.
