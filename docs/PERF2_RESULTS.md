# PERF2 — Navigation round-trip evidence

## Status and exact provenance

Implementation handoff for independent audit, **not phase closure**. D2 remains blocked.

- Exact PERF2 base: `d0533cb9a7b3646134cbc194767af669c75f5adf`.
- Implementation branch: `perf/perf2-staging-navigation`. The final report/PR identifies its exact committed head; inspect that head, not only the pre-implementation prompt commit `6645555995b69e9f0d752d7943a3ad73f2cb2c77`.
- The base is the merged [PERF1 PR #32](https://github.com/Beeyach/bloomops/pull/32). [Deploy staging 34529118212](https://github.com/Beeyach/bloomops/actions/runs/34529118212) and [Verify zero-to-current 34529118297](https://github.com/Beeyach/bloomops/actions/runs/34529118297) passed on that exact SHA. Public staging still reports `d0533cb`; the user has retested this build and reports slow signed-in navigation with little data.
- Baseline application/config/package sources in the detached local baseline worktree are unchanged from that exact base. Only the local numeric measurement wrapper and its helper were overlaid. It has its own dependency install from the unchanged lockfile and its own baseline OpenNext assets.
- Candidate application source fingerprint: SHA-256 of `git diff d0533cb9a7b3646134cbc194767af669c75f5adf -- app lib components` is `c6220231ad4d5e5385adae0abc38dedc0aab804c226dcebb9e3d66aa8318898e`. It includes the new staged read adapter. All final browser runs use the final built application source. Local builds report `dev`, **not** a Git SHA; their provenance is the source comparison/fingerprint, not the version endpoint.
- [Sanitized numeric evidence](evidence/PERF2_navigation.json) retains all 672 browser samples, including warmups, the four local SQL-cost runs and the public staging probe. Original logs, numeric traces and screenshots remain outside Git at `/home/ary/.cache/bloomops-perf2`. Issued sessions and fixture payloads are not committed.

## What was reproduced, and what was not

The exact baseline still sends each independent statement through a separate D1 binding invocation. `Promise.all` overlaps some calls but does not make them one native batch. Three avoidable serial dependencies were reproduced: Social directory options wait for parent results; ordinary unfiltered Systems waits for facets it does not need to validate; Project authorization reads the same protected Project twice before children/options. Home/Systems also repeat scoped timezone queries.

Native batching reduces remote invocation opportunities on every measured route. Removing the three dependencies reduces observed critical depth by one on Social, Systems and Project detail. At a synthetic 100 ms per invocation, those routes improve by roughly 100–117 ms median. Home, Clients and Team do **not** materially improve at that delay because their observed critical depth does not fall. This distinction is the central PERF2 finding; fewer statements/invocations are not themselves a latency fix.

The user's exact signed-in staging delay was **not independently measured**: no manual Owner sign-in completed, and no candidate was deployed. Public probes support investigating the database path but cannot attribute the user's remaining latency to geography. Local results do not close the reported product blocker.

## Architecture and security decisions

1. `lib/bloomops/read-batch.mjs` provides explicit, awaited `readTogether(db, work)` composition. A private Drizzle session queues independent SELECTs for actual `DB.batch()`, at most 32 statements per invocation. Nested compositions reuse only that private scope. There is no cross-request queue, authorization cache, result cache, shared-session patch, write interception or replica.
2. The small adapter targets the installed Drizzle 0.45 read-preparation seam. It retains original predicates, parameters/placeholders, order, limits, decoder mapping and nullable join handling. Ordinal CTE column aliases prevent native name-keyed D1 results from collapsing duplicate names in joins. Unsupported query shapes/non-D1 drivers keep their original execution path. Failed batches reject, without silently retrying outside the batch. Tests also preserve the configured logger hook; production uses the existing NoopLogger.
3. Actor grants and Client/Service/Project assignments or contact links batch **after** current identity and active membership. Owner keeps PERF1's two-read identity/membership path, with no redundant capability query. Issued Team actor support uses four statements in one native invocation; non-Owner authorization can therefore have an additional support stage. No long-lived Better Auth cookie caching is enabled.
4. Clients count/rows; Work list/options; Social list/options; Team members/invitations; and authorized Project child/options reads use native read composition. Project metadata/body retain React request-local sharing.
5. `authorizeProject` reuses `getProject`'s live, SQL-authorized DTO. Its policy descriptor records only the current actor's proven restricted grant, as the Content descriptor already does; it does not pretend to be an assignment directory. Policy evaluation remains in place. Project, tenant, membership, assignment and visibility predicates run before the internal DTO is returned.
6. Social's “no readable parent means no member directory” condition moves **into SQL** using the original bounded Client/Service option builders in EXISTS predicates. It does not load the directory and hide it later. This adds a gated empty SELECT when there are no eligible parents, but removes the serial parent-result dependency on ordinary populated visits.
7. Home shares one Action-scoped timezone read and one Project-scoped timezone read. These scopes remain separate: Action-only assignment must not reveal a Project. Systems shares its Project timezone read. Date-sensitive SQL still uses exact Client IANA timezone/calendar semantics, not a UTC approximation.
8. Unfiltered Systems facets and authorized data start independently. Selected Client/Service IDs still take the validation path, including missing/foreign/revoked/incompatible and out-of-cap selections. No invalid-ID fallback data is exposed.

Native D1 batching was checked against [Cloudflare's D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) and [Drizzle's batch interface](https://orm.drizzle.team/docs/batch-api). A batch is one binding invocation containing sequential statements, not magically parallel SQL. The adapter must be rechecked on a Drizzle upgrade. The Cloudflare skills directed the current-API checks and local runtime verification; they did not justify any infrastructure mutation.

No UI, loading boundary, navigation design, operational state, lifecycle, schema or authorization scope changed. In particular, no shell/heading/spinner is substituted for completed content.

## Dataset and measurement method

| Synthetic workspace data | Representative | Stress |
|---|---:|---:|
| Clients / primary contacts | 50 / 50 | 150 / 150 |
| Service engagements | 100 | 300 |
| Projects | 100 | 300 |
| Milestones | 300 | 900 |
| Actions | 1,000 | 3,000 |
| Deliverables | 300 | 900 |
| Content Items | 250 | 750 |
| Ready File metadata / Project links | 200 / 200 | 600 / 600 |
| Project assignment relationships | 100 | 300 |
| Action assignee relationships | 1,000 | 3,000 |
| Role memberships / issued login sessions | 5 / 4 | 5 / 4 |

Each Client has Systems and Social services/projects, a primary contact and alternating UTC/Los Angeles timezone. Team is assigned to each Project; Owner to the Actions. One Client contact is linked to the issued Client identity. Projects have children, ready File metadata, and dense attention/review/overdue work. These exercise the attention paths, not an asserted real-agency distribution. Files contain metadata only; no fake R2 bytes are read. Browser timing uses Owner; revocation/security coverage uses issued Owner/Admin/Team/Client sessions separately.

Both workspaces coexist in the **same persisted local D1**, along with unchanged foreign-workspace synthetic fixtures. The comparison triples the target workspace's operational workload, not the entire database file's byte size. Baseline/candidate reuse identical records, sessions and local persistence; no fixture mutations, builds or other owned test workloads ran during the final timing blocks. Each block is sequential, not randomized; machine/cache/scheduler variation remains possible.

There are 12 navigation rounds per route per code/scale/delay combination. The first two rounds are warmups, leaving **10 retained samples**. Median and nearest-rank p95 are shown below; with 10 samples p95 equals the maximum, so this is not a production tail-latency SLA. Full min/max and warmups remain in the evidence. All figures are milliseconds unless specified.

The 1440×900 Chromium harness timestamps the actual click, waits for the destination response and real final destination sections/rows, then two animation frames. Top-level navigation uses the existing Next links; Project uses the canonical Systems Project link/document navigation. Home's completed projection, Clients rows/empty state, Work footnote, Social pagination, Systems projection, Team invitations and all Project detail/child/activity sections are checked. Hidden streamed DOM or an early heading alone cannot pass. Rendered geometry includes scrollable content, not only rows inside the initial viewport. The metric includes browser/driver scheduling, rendering and two frames; it is not just TTFB.

The local-only Worker wrapper records statement counts, native invocations, statements per invocation, start/end intervals and completed server-body flush. “Depth” is the longest **observed non-overlapping invocation chain** at body completion, not reconstructed causality or directly measured remote network depth. All measured protected reads complete before destination content. Interval union measures elapsed D1 wait without double-counting concurrent waits. The remainder includes JavaScript, serialization and scheduling; it is **not CPU time**. D1 SQL duration is recorded only when native result metadata exposes it; missing raw-query metadata is never fabricated. A separate read-only SQLite harness isolates SQL execution/prepare costs.

No production diagnostic endpoint/header is added. Local metrics contain no SQL, bind values, cookies/tokens, private content or row payloads.

## Statements, binding invocations and critical depth

These are **Owner end-to-end** counts, including identity and membership. They are identical at both data scales and both delay settings.

| Route | Total statements before → after | Binding invocations before → after | Observed depth before → after | After: statements per invocation |
|---|---:|---:|---:|---|
| Home | 14 → 12 | 14 → 4 | 4 → 4 | 1, 1, 6, 4 |
| Clients | 4 → 4 | 4 → 3 | 3 → 3 | 1, 1, 2 |
| Work (Actions) | 8 → 8 | 8 → 3 | 3 → 3 | 1, 1, 6 |
| Social | 6 → 6 | 6 → 3 | 4 → 3 | 1, 1, 4 |
| Systems | 8 → 7 | 8 → 4 | 5 → 4 | 1, 1, 3, 2 |
| Team | 4 → 4 | 4 → 3 | 3 → 3 | 1, 1, 2 |
| Project detail | 15 → 14 | 15 → 4 | 5 → 4 | 1, 1, 1, 11 |

Every baseline invocation has one statement. “Total calls” here means SQL statements; native binding calls are deliberately reported separately.

Remaining dependencies:

- All routes first require current session/user, then active workspace membership. These are live authorization prerequisites, not candidates for cross-request caching.
- Clients, Work, Social and Team then need one Owner page-data stage.
- Home and Systems require authorized Client timezone values before constructing calendar-sensitive predicates in JavaScript, then the date-sensitive data stage. Independent nondated reads already share the earlier stage. Eliminating this remaining dependency would require a materially different timezone-query model; the implementation does not guess all timezones, denormalize operational truth or change date behavior.
- Project detail must authorize its current parent before requesting the child/options composition. Invalid/inaccessible parents must not load/stream those internal sections. PERF1's shared metadata/body result remains.
- Selected Systems filters and non-Owner actor support may require additional stages; the table is not a promise that every filter/role has the Owner default path.

## Completed click-to-visible: local, no synthetic delay

| Route | Representative median before → after | Representative p95 before → after | Stress median before → after | Stress p95 before → after |
|---|---:|---:|---:|---:|
| Home | 111.70 → 94.50 | 128.80 → 95.40 | 111.90 → 94.95 | 128.20 → 95.50 |
| Clients | 79.00 → 79.45 | 95.50 → 95.50 | 112.30 → 112.40 | 116.30 → 129.30 |
| Work | 162.05 → 161.65 | 195.40 → 168.40 | 194.05 → 177.85 | 243.70 → 210.30 |
| Social | 128.15 → 128.10 | 144.40 → 133.30 | 137.50 → 128.30 | 160.20 → 143.80 |
| Systems | 112.05 → 111.75 | 128.50 → 145.10 | 128.15 → 127.75 | 129.90 → 129.10 |
| Team | 62.10 → 61.95 | 78.80 → 62.30 | 70.00 → 61.95 | 78.60 → 78.80 |
| Project detail | 162.35 → 145.50 | 194.30 → 161.90 | 162.10 → 145.55 | 228.00 → 145.80 |

All medians stay below 200 ms locally. Some p95s fluctuate or regress by a frame; do not infer a universal zero-latency speedup. Stress Work's existing bounded data/rendering work is the largest ordinary local page cost.

## Completed click-to-visible: synthetic 100 ms per native invocation

The delay is inserted once per **binding invocation**, before execution; parallel baseline calls still overlap. It is neither measured D1 network latency nor a fake serialized per-statement penalty.

| Route | Representative median before → after | Representative p95 before → after | Stress median before → after | Stress p95 before → after |
|---|---:|---:|---:|---:|
| Home | 495.10 → 495.10 | 495.50 → 495.60 | 495.45 → 503.60 | 511.80 → 511.90 |
| Clients | 379.20 → 378.95 | 396.00 → 379.60 | 412.75 → 412.50 | 429.30 → 412.70 |
| Work | 462.10 → 445.55 | 478.60 → 462.20 | 494.20 → 478.05 | 529.70 → 494.90 |
| Social | 528.10 → 428.35 | 544.60 → 444.90 | 528.05 → 428.35 | 556.90 → 432.10 |
| Systems | 611.95 → 511.70 | 628.30 → 512.20 | 628.35 → 511.75 | 644.90 → 528.40 |
| Team | 378.10 → 378.60 | 378.90 → 379.00 | 370.10 → 370.30 | 379.00 → 379.00 |
| Project detail | 662.30 → 545.50 | 679.30 → 562.50 | 662.30 → 545.20 | 678.60 → 545.90 |

Social and Systems each lose an unnecessary serial stage. Project also avoids a duplicate protected read. Home's stress median is approximately 8.15 ms slower despite fewer statements/invocations; Clients and Team are effectively unchanged. The synthetic Home/Systems medians can still exceed the 500 ms aspiration. Passing 800 ms p95 in this simulation does **not** prove the user's staging target or remove the release blocker.

## Server wait and completed body

Medians from the synthetic 100 ms blocks distinguish database wait from the remaining server elapsed time. Independently calculated medians need not add exactly.

| Route | Rep server complete before → after | Rep D1 wait before → after | Rep non-D1 elapsed before → after | Stress server complete before → after | Stress D1 wait before → after | Stress non-D1 elapsed before → after |
|---|---:|---:|---:|---:|---:|---:|
| Home | 439.50 → 436.50 | 432.50 → 424.00 | 7.00 → 13.00 | 447.00 → 447.50 | 440.50 → 436.00 | 7.00 → 12.00 |
| Clients | 319.00 → 319.50 | 311.00 → 309.00 | 9.00 → 10.00 | 326.50 → 327.00 | 310.00 → 309.00 | 15.50 → 17.00 |
| Work | 369.00 → 358.00 | 349.00 → 322.50 | 20.00 → 36.50 | 389.00 → 381.50 | 368.50 → 345.00 | 21.00 → 36.50 |
| Social | 438.00 → 338.00 | 419.50 → 315.00 | 18.00 → 23.50 | 439.00 → 334.00 | 419.00 → 314.00 | 18.50 → 20.00 |
| Systems | 541.00 → 434.00 | 528.00 → 419.50 | 13.50 → 14.00 | 547.50 → 440.50 | 532.00 → 423.50 | 15.50 → 16.00 |
| Team | 317.00 → 318.00 | 312.00 → 311.50 | 4.00 → 6.00 | 315.00 → 316.00 | 310.00 → 310.00 | 5.00 → 6.00 |
| Project detail | 553.00 → 432.50 | 536.50 → 414.50 | 16.50 → 17.50 | 550.00 → 435.00 | 535.00 → 417.00 | 12.50 → 17.00 |

Browser completed-response duration is tracked separately from visible completion. At 100 ms delay, all 10 retained body completions are available per route/code/scale:

| Route | Rep browser completed-body median before → after | Stress browser completed-body median before → after | Rep encoded bytes before = after | Stress encoded bytes before = after |
|---|---:|---:|---:|---:|
| Home | 441.78 → 439.14 | 449.29 → 449.43 | 21847 | 21859 |
| Clients | 320.95 → 321.47 | 328.06 → 328.25 | 81518 | 236321 |
| Work | 370.51 → 360.43 | 391.48 → 383.97 | 280478 | 320483 |
| Social | 440.02 → 339.08 | 440.80 → 336.08 | 208894 | 233832 |
| Systems | 543.40 → 436.80 | 549.52 → 443.96 | 145862 | 172939 |
| Team | 319.56 → 320.69 | 317.85 → 318.74 | 3227 | 3227 |
| Project detail | 554.75 → 433.92 | 551.80 → 436.41 | 67437 | 67437 |

At zero delay Chromium sometimes omits `requestfinished`/Resource Timing for an RSC stream even after the server has flushed and all destination sections are rendered. Those body values stay null/unavailable; the evidence includes `browserBodySamples`, and **all local server-completion traces are present**. The harness does not hang indefinitely waiting for a Chromium event or replace a missing body duration with first byte.

Payload medians at 100 ms are identical before/after. Growth at stress reflects more existing Client/facet/option entries, not duplicated records or removed bounds. Work still renders 200 Actions, Social 200 Content rows and Systems 50 Project rows per existing contracts. Visible `main li` counts (including nested/filter list items, not a business-record census) stay Home 35; Clients 57/157; Work 202; Social 200; Systems 256; Team 5; Project 19. The same Project's child payload remains constant. Query depth is independent of this 3× data scale; SQL and Client/options payload costs are not constant.

## SQL scale, bounds and index decision

The read-only harness opens the persisted **local SQLite** in read-only mode and runs each route's authorized data composition, including Project authorization but excluding the already resolved identity/membership. It records synchronous statement execution and preparation separately from JavaScript elapsed. Each of four runs uses 12 rounds, discards two and retains 10. It does not query remote D1 or print SQL, parameter values or rows.

| Route | Representative SQL median before → after | Stress SQL median before → after | Stress after SQL p95 | Slowest individual after statement, stress | Max Owner binds after |
|---|---:|---:|---:|---:|---:|
| Home | 9.10 → 8.63 | 21.74 → 19.17 | 19.92 | 7.82 | 37 |
| Clients | 0.15 → 0.19 | 0.30 → 0.39 | 0.51 | 0.48 | 3 |
| Work | 10.49 → 11.07 | 27.72 → 28.72 | 31.57 | 7.51 | 22 |
| Social | 2.24 → 2.67 | 2.62 → 3.27 | 3.56 | 1.50 | 35 |
| Systems | 4.72 → 4.60 | 9.22 → 9.11 | 9.67 | 5.64 | 37 |
| Team | 0.04 → 0.04 | 0.04 → 0.04 | 0.05 | 0.05 | 1 |
| Project detail | 1.73 → 1.89 | 2.35 → 2.50 | 4.47 | 1.68 | 37 |

At 3× workload the main after SQL totals rise about 2.22× (Home), 2.60× (Work) and 1.98× (Systems); this is expected scoped-row work, not an observed superlinear explosion. Social's gated directory SQL adds some cost (and 35 maximum Owner bindings instead of 16 in the prior composition) while removing a full serial wait. Native batches can add local result mapping/preparation overhead; not every SQL total improves. No retained after individual statement exceeds 7.83 ms in this read-only harness. These are local synchronous execution costs, not remote D1 CPU measurements.

Real workerd/D1 smoke tests additionally exercise 240 assignments: Systems has five page statements in two batches (maximum 65 binds / 13,548 SQL bytes), Home ten page statements in two batches (maximum 64 binds / 13,047 bytes). Existing SQL scopes and bounded limits pass. There is no measured hot-query scaling failure requiring an index. No query-plan improvement is claimed and no index/migration is added speculatively.

## Actual staging evidence and placement

Only **read-only unauthenticated** staging evidence was obtained. The exact current base remains deployed. Ten rounds, two warmups discarded, eight retained public probes:

| Public endpoint | Median completed response | p95 / max | Retained range | Exposed request colo |
|---|---:|---:|---:|---|
| Version | 203.46 | 215.15 | 195.01–215.15 | LAX |
| Health | 553.15 | 567.54 | 541.83–567.54 | SJC |
| Sign-in | 207.04 | 230.06 | 201.27–230.06 | SJC |
| Anonymous Systems redirect (307) | 184.36 | 246.45 | 181.80–246.45 | SJC |

Health performs two D1 reads; its extra latency is compatible with a database-path contribution, but includes the complete endpoint path and is **not** isolated D1 latency. `cf-ray` exposes the requesting edge colo, not proof of Worker execution location or D1 serving region. This US environment does not represent the user's Philippines connection. Historical APAC/HKG deployment observations remain a hypothesis, not a new measurement.

A headed capture browser successfully opened staging. No user completed manual Owner sign-in before its 30-minute timeout, so no staging storage state or authenticated timing was obtained. The script never submitted an email or read a real mailbox. A read-only `wrangler d1 info bloomops-staging --env staging --json` check could not run without a Cloudflare API credential; no temporary account, permission change, database query or resource mutation was attempted. No placement/configuration change is justified by this evidence.

### Short manual staging workflow

Use the existing external Playwright installation at `/tmp/bloomops-c6-tools` on this machine (or supply your own existing Playwright package directory). This machine's Chromium also needs the library path below. No dependency is added to BloomOps.

```bash
export LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu
node scripts/navigation-perf-capture.mjs --playwright /tmp/bloomops-c6-tools
```

In the opened browser, sign in **manually**, use the magic link in that same browser, and open Systems. The script validates Owner and exclusively creates `/home/ary/.cache/bloomops-perf2-session/staging-state.json` with mode 0600 in a private 0700 directory outside every Git worktree. An existing output file is not overwritten. No credentials should be pasted into chat or committed.

Take a readable Project ID from a Systems Project link and replace `PROJECT_ID_FROM_SYSTEMS_LINK` below. This exact command measures the **currently deployed base**, not an unreviewed candidate:

```bash
node scripts/navigation-perf.mjs --url https://bloomops-staging.cool-sunset-2169.workers.dev --expected-sha d0533cb9a7b3646134cbc194767af669c75f5adf --storage-state /home/ary/.cache/bloomops-perf2-session/staging-state.json --project PROJECT_ID_FROM_SYSTEMS_LINK --out /home/ary/.cache/bloomops-perf2/staging-base --playwright /tmp/bloomops-c6-tools
```

After independent audit, approved merge and both gates, rerun against the **exact deployed merge SHA**, with a different output folder and still-valid manually issued session. Remote measurement refuses a missing full SHA or version mismatch. Report the numeric file and user-observed feel; share only the local state **path** if asking this agent to continue, never its contents. Revoke the session/delete the private state through normal user-controlled cleanup after measurement. Do not deploy a candidate or send email simply to unblock the harness.

Remote runs collect completed visible/body timing and request colo but have no local wrapper trace; missing remote D1 counts/SQL/placement must not be inferred from zero-valued local-only fields. Exact candidate remote attribution still needs an authorized observation route or independently audited coarse diagnostics if the browser result remains slow.

## Verification

Counts overlap and are not additive. All reported node:test checks have zero failures, cancellations, skips or todos. Final full tests were rerun after the last harness corrections.

| Check | Result |
|---|---|
| Full `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | **4,769/4,769**; existing external Python alias only |
| New native batch / numeric metrics / issued-session performance tests | **12/12**, also included in full suite |
| Issued-session regressions after structural steps | Adapter 8; page batching 146; Project 381; Social 604; projections 349 checks passed in their focused runs |
| `npm run build` | Passed, including available Next lint/type checks |
| `npm run cf:build` | Passed; final built Worker used for candidate measurements and browser/runtime checks |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | **144/144** actual built-Worker checks |
| Local external staging verifier with `--expect-env development` | **21/21** |
| `node .github/scripts/verify-zero-remote.mjs --local` | **22/22**; fresh migrated schema, repeat no-op and cleanup |
| `node scripts/systems-smoke-local.mjs` | **23/23** native D1 checks, including batch/statement/binding bounds |
| `node scripts/projections-smoke-local.mjs` | **34/34** |
| `node scripts/release-b-smoke-local.mjs` | **86/86** |
| `node scripts/release-c-smoke-local.mjs` | **29/29** |
| Navigation browser | **87 checks / 70 screenshots**: all seven routes, 1440/1024/768/390/320, JavaScript and no-JavaScript |
| Systems browser | **122 checks / 47 screenshots**: five widths, native no-JS filtering, keyboard/focus, reduced motion, touch and denied access |
| Changed JavaScript/JSX syntax | **25 paths** parsed with esbuild |
| `git diff --check` | Passed |
| Exact package/lock/schema/migration/config/workflow diff from base | Empty |

Full tests include auth/membership/shell, Client/Service/Project/Action/Content scope, B1–B7, Release C and D1 Systems regressions. Explicit issued-cookie checks cover session deletion/current identity, membership suspension/removal, independent Client/Service/Project assignment removal, capability revocation, Client contact unlinking, visibility change, restricted Project scope, cross-workspace existence hiding and Department/ownership not granting access. The next protected request reads current truth, including when an old in-memory actor is deliberately reused. Browser revocation checks remove Team's Project assignment and require the next request's **metadata and body** to return 404 without the Project title/details.

The live design reference loaded in Chromium and was visually inspected; the web fetch alone failed. Existing desktop/mobile/no-JS screenshots were inspected. No visual restyle was needed.

Failed exploratory attempts are excluded from the final timing blocks: Chromium RSC `requestfinished` and no-JS animation-frame waits were corrected in the harness; an initial Social EXISTS parenthesis bug was fixed before its 604 passing regressions; a smoke counter required preserving the caller's logger; baseline symlinked dependencies produced an invalid bundle and were replaced by its own unchanged-lock install; login throttling was respected/retried without changing auth limits. An expected-SHA check correctly rejected a local `dev` build. None of these failures is presented as successful evidence.

## Reproduce locally

Use synthetic development resources only:

1. Build with `npm run cf:build`, then keep `node scripts/navigation-perf-local.mjs` running in one terminal.
2. Create fixtures once using `node scripts/navigation-perf-fixture.mjs --scale representative --out /home/ary/.cache/bloomops-perf2/representative` and the same command with `--scale stress --out /home/ary/.cache/bloomops-perf2/stress-complete`. Use new private output folders if those already exist. The fixture script checks development/dev-mail before writing and respects the normal login throttle.
3. Run `scripts/navigation-perf.mjs` with the fixture's `owner-state.json`, first Project ID from `fixture.json` and a distinct `--out`. Default is 12 rounds / 2 warmups. Set the Chromium library path above and use `--playwright` as needed. Never print the storage-state contents.
4. Restart the same local wrapper with `--d1-delay-ms 100` and repeat both scales. Stop owned preview processes between runs; do not run builds/other test workloads during timing.
5. For the baseline, build a separate detached worktree at the exact base with its own unchanged-lock dependencies and assets. Share only the synthetic local persistence/development configuration, and overlay the current local Worker measurement wrapper and metrics helper, **not application code**. Use the current root browser harness against that baseline. Verify its app/lib/components/config/package diff is empty. The owned comparison worktree used here is `/tmp/bloomops-perf2-base`.
6. Run `scripts/navigation-query-cost.mjs --database <persisted-local-D1.sqlite> --fixture <private-fixture-folder>`, adding `--source /tmp/bloomops-perf2-base` for the baseline. Only local D1 persistence is allowed and the SQLite connection is read-only. SQL-cost runs and browser timing runs are separate workloads.

## Delta, remaining risks and next gate

No schema, migration, dependency, package/lock, provider, deployment configuration, workflow, placement, cache, auth-provider or infrastructure delta. No production/Leadsthatbloom mutation, remote deployment, real mail, new loading boundary or D2 feature. Durable domain documentation records the read-composition seam; BUILD_STATE and INDEX identify PERF2 as current. The temporary execution prompt is removed.

Remaining risks are the Drizzle internal adapter seam, native batch mapping/preparation overhead, date-dependent fourth stages, larger existing bounded option payloads, sequential rather than randomized benchmark blocks, small tail sample size, missing Chromium body events at zero delay, and especially the unmeasured authenticated staging/user geography. Read-only public results and localhost cannot prove platform placement is the remaining dominant cause.

Leave the implementation PR **OPEN and UNMERGED**. The next step is independent exact-head audit, followed by a user-approved merge, successful Deploy staging **and** Verify zero-to-current on that exact merge SHA, then authenticated measurements and the user's staging retest. **D2 remains blocked until those gates pass and navigation is materially improved (or remaining external latency is directly proven).**
