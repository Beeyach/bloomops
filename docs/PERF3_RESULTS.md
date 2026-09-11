# PERF3: authenticated RSC completion — implementation handoff

## Status and provenance

PERF3 is **not closed**. This is a local, verified implementation for independent audit, not proof that the live navigation target has been reached. D2 remains blocked. The PR must remain open and unmerged. After audit and user-controlled merge, Deploy staging and Verify zero-to-current must pass on the exact merge SHA, followed by signed-in staging completion measurements.

Exact base: `62bcf019226db1e7e939fbcffc8909f41fbd577a`, merged [PERF2 PR #33](https://github.com/Beeyach/bloomops/pull/33). Read-only checks confirmed [Deploy staging 34557953977](https://github.com/Beeyach/bloomops/actions/runs/34557953977) and [Verify zero-to-current 34557953992](https://github.com/Beeyach/bloomops/actions/runs/34557953992) passed on that SHA. The requested branch started at `000557c` (execution prompt), after `198e712` (contract), and base ancestry was verified before application edits. Those two commits do not alter application behavior.

The exact merged code, required contracts/history, auth adapters, route implementations, rendering boundaries and performance harnesses were inspected before selecting the change. Baseline builds preceded the optimization. Baseline timing used base application behavior with only the fixed-label timing markers added; candidate runs use the same markers and harness. All local builds embed the pre-implementation Git label `000557c`; this is **not** an assertion that the candidate application is byte-identical to that commit. The final implementation head is the PR head reported at handoff; docs-only edits do not change the tested application. The committed numeric evidence retains each run's embedded label for transparency.

The supplied signed-in staging baseline, not independently recaptured here:

| Route | Warm completed destination | First-response proxy | Remaining interval |
|---|---:|---:|---:|
| Home | 1.05–1.10 s | ~0.27 s | ~0.81 s |
| Systems | 1.02–1.04 s | ~0.27 s | ~0.76 s |
| Work | 0.87–0.89 s | ~0.27 s | ~0.61 s |
| Team | 0.84–0.92 s | ~0.27 s | ~0.60 s |
| Social | 0.86–0.88 s | ~0.27 s | ~0.60 s |
| Clients | 0.85–0.88 s | ~0.28 s | ~0.58 s |
| Ads | 0.69–0.83 s | ~0.28 s | ~0.50 s |

Three supplied warm cycles were consistent, with sparse data and no console errors. No signed-in staging storage state or connected Cloud Browser was available here. No real email, remote database mutation, placement change or deployment was performed. No inferred Cloudflare edge colo is presented as Worker/D1 placement evidence.

## What the trace proves, and the chosen fix

The proven **local** avoidable critical path is the serial Better Auth session/user lookup followed by a separate active membership/workspace read, before actor and protected page reads. This costs one binding round trip on every protected route. It is not merely a smaller statement count: the dependent membership invocation disappears from the measured completion path. No claim is made that local evidence alone attributes the entire live 0.5–0.8-second interval.

The Home and Systems investigation preceded the fix. Both pages await `requireShell('internal')`, which shares request-local identity/actor work with layout; both destination components are server-rendered from the awaited projection. `OperationalHome` and `SystemsOverview` do not fetch their initial data in a client effect. Home's Action and Project timezone maps have different authorization scopes and remain separate; its date-sensitive reads follow those maps. Systems filters/facets retain current readable-parent validation, selected-ID semantics and pagination. Its Project timezone map precedes date-sensitive Project/Deliverable results. No timezone approximation, unbounded directory read or new async UI boundary was introduced.

A representative exploratory baseline trace with **synthetic 100 ms per native D1 invocation**, server-relative milliseconds:

| Stage | Home | Systems |
|---|---:|---:|
| First server stream chunk | 4 | 3 |
| Identity | 2–107 | 2–106 |
| Membership | 108–211 | 107–210 |
| Owner actor (no D1 support needed) | 211–211 | 210–210 |
| First projection batch | 214–320 (6 statements) | 211–314 (3 statements) |
| Date-dependent projection batch | 323–432 (4 statements) | 316–423 (2 statements) |
| Projection complete | 433 | 423 |
| Final stream / EOF | 435 | 431 |
| D1 wait / non-D1 elapsed | 421 / 14 | 416 / 15 |

Thus the early RSC bytes are not the completed page. Most of the controlled post-header delay is server-side binding waiting. Projection-to-final-stream cost is small in these samples; the browser's body-to-DOM interval is measured separately below. These do not establish live network, SQL geography, CPU or React costs. Non-D1 elapsed is wall time outside the union of binding waits, **not a CPU profiler measurement**. The test adds latency once per binding invocation, not once per SQL statement.

`workspace-session.mjs` now augments Better Auth's existing relational `session.findFirst({with: {user: true}, ...})` through a private Drizzle facade. One correlated scalar subquery selects the exact canonical earliest active membership of an active workspace. Predicate and ordering come from `workspaceAccessQuery`, also used by the ordinary membership loader. Schema-derived JSON is only the SQL transport for that one row; Drizzle field decoding reconstructs the original DTO. No schema or persisted state is added.

Better Auth retains signature verification, expiry, refresh/cleanup and sanitized user/session DTOs. The additional row is removed before returning to Better Auth. Request-local AsyncLocalStorage releases the capture only after accepted identity matches the captured session and user, on the same D1 binding. It does not patch a shared DB/query object. Unsupported query shapes use the existing fresh membership loader; actual database or decoding failures reject without retry or partial authorization. Ordinary auth endpoint reads and writes remain untouched. Review this adapter seam whenever upgrading Better Auth or Drizzle.

Protected page reads still wait for accepted identity/membership and actor authorization; their existing live SQL predicates remain. No authorization/session-result cache, protected prefetch reuse, stale protected output, UI-only permission check, spinner or skeleton was added. No page-data statement was removed. Home/Systems' remaining timezone-dependent stage is intentionally retained because no simpler exact replacement was proven necessary or safe by this evidence.

## Measurement method

`scripts/navigation-completion.mjs` runs the real built OpenNext Worker in Chromium, at 1440×900 with a previously issued local Owner cookie. The existing representative fixture has 50 Clients, 100 Projects, 300 Milestones, 1,000 Actions, 300 Deliverables, 250 Content Items and 200 File metadata rows; stress has exactly 3× each. Both workspaces are preserved from PERF2, in the same local D1 database for all before/after runs. No fixture/session IDs or private records enter the committed evidence. Owner avoids an extra actor-support stage; non-Owner support remains live and is covered by issued-session/native runtime regressions, not represented by these Owner timings.

Each of eight primary runs has 12 sequential warm navigation cycles across Home, Clients, Work, Social, Systems, Team and Ads. The first two cycles are retained as warmups but excluded from summaries: 10 measured samples per route/run. Zero-delay runs and controlled 100 ms-per-invocation runs are separate. No build, test or other benchmark workload runs concurrently with a measured run. Median, range and nearest-rank p95 are retained; with 10 samples, p95 is the maximum and is not a stable production tail estimate.

Browser-owned timestamps record the actual captured nav click, request start, response headers, first/last CDP body chunks, network body EOF, completed destination DOM marker and two subsequent animation frames. The marker requires the destination URL, exact heading and actual route content (not an early heading or loading shell). Existing Home/Systems projection trees commit as completed server-rendered subtrees. DOM observation is a completion proxy for React commit, not an isolated React CPU profile. Cross-clock arithmetic uses CDP wall-time alignment and browser performance time origin; server intervals use a separate clock and are not subtracted from browser epochs.

Chromium can cancel an RSC stream after the application releases its reader, despite a fully rendered destination. The new harness drains a bounded clone of the one actual destination fetch to observe EOF. It returns the original response immediately, issues no second request, retains only byte counts/timestamps and aborts over 4 MiB. This **is a measurement intervention**, identical before/after. The unchanged PERF2 harness, without the clone, is also rerun as a separate completion/depth check. Neither method replaces missing EOF with headers. CDP chunk-delivery timestamps can lag its EOF event, and a DOM commit can precede EOF; those observations remain un-clamped in raw evidence. Clone-reader EOF is retained separately.

Every primary sample asserts one successful destination request, no protected prefetch, `no-store`, complete content and no browser runtime errors. The local wrapper adds coarse identity/membership/actor/Home/Systems markers, invocation start/end/count/depth/bind counts, byte/chunk counts and final stream completion. It never records SQL, bound values, cookies, tokens, identity IDs, row payloads or content. Fixed stage/event diagnostic publishing is intentionally retained for audit; production has no subscriber or diagnostic endpoint. The wrapper requires loopback, development and synthetic-local guards and is not the deployment entrypoint. D1 raw reads do not expose SQL duration metadata; no wall-time measurement is relabeled as remote SQL execution time.

## Completed-destination results

All values below are milliseconds, **before → after**. These are local Worker measurements, not staging forecasts. Ten retained samples per cell; both warmups remain in the numeric artifact.

### No injected latency

| Route | Representative median | Representative p95 | 3× stress median | 3× stress p95 |
|---|---:|---:|---:|---:|
| Home | 79.3 → 79.2 | 79.8 → 79.8 | 94.8 → 79.8 | 95.8 → 96.3 |
| Clients | 62.5 → 62.0 | 78.7 → 62.8 | 79.2 → 73.6 | 120.8 → 79.9 |
| Work | 123.2 → 119.9 | 136.0 → 168.9 | 163.9 → 146.3 | 249.5 → 180.4 |
| Social | 90.0 → 86.2 | 95.0 → 105.7 | 99.0 → 90.8 | 129.9 → 146.9 |
| Systems | 78.8 → 78.7 | 94.3 → 87.1 | 95.8 → 85.2 | 107.0 → 111.3 |
| Team | 61.2 → 45.1 | 61.8 → 61.5 | 60.7 → 45.4 | 61.6 → 62.1 |
| Ads | 46.0 → 46.0 | 62.7 → 46.2 | 45.9 → 46.2 | 111.1 → 46.5 |

### Synthetic 100 ms per D1 invocation

| Route | Representative median | Representative p95 | 3× stress median | 3× stress p95 |
|---|---:|---:|---:|---:|
| Home | 479.4 → 379.3 | 479.8 → 396.3 | 495.9 → 393.0 | 496.5 → 396.2 |
| Clients | 362.4 → 261.9 | 363.0 → 262.8 | 379.3 → 279.2 | 387.9 → 289.6 |
| Work | 428.7 → 325.1 | 457.7 → 359.8 | 458.9 → 353.9 | 471.8 → 411.8 |
| Social | 398.6 → 297.2 | 409.0 → 314.6 | 401.3 → 295.1 | 407.5 → 332.3 |
| Systems | 485.8 → 381.2 | 496.5 → 416.4 | 494.9 → 390.4 | 497.9 → 396.7 |
| Team | 361.6 → 261.1 | 362.0 → 262.2 | 361.5 → 260.9 | 362.2 → 262.1 |
| Ads | 254.0 → 145.2 | 262.8 → 146.3 | 245.9 → 145.9 | 262.5 → 146.4 |

Zero-delay results are not uniformly lower: Ads stress median increases by 0.4 ms, and several zero-delay p95 values vary upward despite lower medians. No tail improvement is claimed there. The controlled-delay comparison consistently reduces completed-content median at both scales, by approximately one removed 100 ms binding stage. Remaining scheduling/serialization and browser work, especially Work/Social at 3× scale, has not been independently CPU-profiled. This change does not establish live targets or eliminate every remaining cost.

### Home/Systems first response, final body and DOM

Synthetic 100 ms runs, click-relative medians. Headers are the first-response proxy; the separate first body-chunk delivery is retained in the artifact.

| Scale | Route | Headers | First body chunk | Final body EOF | DOM complete | Two frames |
|---|---|---:|---:|---:|---:|---:|
| representative | Home | 19.3 → 20.1 | 20.8 → 21.4 | 452.5 → 351.4 | 459.2 → 357.4 | 479.4 → 379.3 |
| representative | Systems | 18.8 → 19.4 | 20.2 → 20.8 | 453.8 → 349.8 | 478.4 → 374.9 | 485.8 → 381.2 |
| stress | Home | 19.8 → 20.2 | 21.1 → 21.4 | 466.7 → 362.7 | 473.3 → 370.1 | 495.9 → 393.0 |
| stress | Systems | 19.3 → 19.3 | 20.5 → 20.6 | 458.2 → 355.6 | 485.9 → 380.9 | 494.9 → 390.4 |

All top-level representative routes, synthetic 100 ms, median interval splits. Medians of individual intervals need not sum to the median total.

| Route | Click → request | Request → headers | Headers → EOF | EOF → DOM | DOM → two frames |
|---|---:|---:|---:|---:|---:|
| Home | 14.0 → 13.9 | 5.4 → 6.2 | 432.7 → 330.9 | 7.1 → 6.0 | 20.1 → 22.9 |
| Clients | 14.1 → 13.8 | 5.7 → 6.2 | 316.4 → 214.8 | 10.2 → 11.4 | 15.8 → 13.8 |
| Work | 14.2 → 13.7 | 5.7 → 6.3 | 362.7 → 258.5 | 37.6 → 37.6 | 6.8 → 6.7 |
| Social | 13.3 → 13.3 | 5.7 → 6.8 | 331.8 → 230.8 | 39.2 → 39.0 | 6.8 → 6.8 |
| Systems | 13.7 → 13.2 | 5.7 → 6.1 | 434.7 → 330.6 | 24.7 → 24.1 | 7.2 → 7.8 |
| Team | 13.7 → 13.3 | 5.4 → 6.0 | 311.2 → 209.1 | 5.6 → 6.6 | 25.1 → 23.3 |
| Ads | 14.2 → 13.6 | 5.7 → 6.2 | 208.1 → 104.5 | 3.3 → 3.3 | 17.5 → 17.2 |

### Server waiting versus other elapsed time

Synthetic 100 ms; D1 wait is the union of measured invocation intervals, including injected delay and local binding execution. Non-D1 is elapsed outside those intervals, not CPU utilization.

| Route | Representative D1 wait | Representative non-D1 | Stress D1 wait | Stress non-D1 |
|---|---:|---:|---:|---:|
| Home | 424.0 → 321.5 | 13.0 → 14.5 | 437.5 → 333.5 | 13.0 → 13.0 |
| Clients | 309.0 → 207.5 | 11.0 → 11.0 | 309.5 → 206.5 | 19.0 → 18.0 |
| Work | 325.0 → 221.0 | 43.5 → 44.0 | 350.5 → 247.0 | 43.0 → 43.0 |
| Social | 314.0 → 212.0 | 21.0 → 23.5 | 314.5 → 212.0 | 23.0 → 20.0 |
| Systems | 419.0 → 319.0 | 19.5 → 18.0 | 424.5 → 321.0 | 18.0 → 19.0 |
| Team | 308.5 → 208.0 | 6.5 → 6.0 | 309.5 → 208.0 | 6.0 → 6.0 |
| Ads | 206.5 → 104.0 | 6.0 → 5.0 | 206.0 → 103.0 | 5.0 → 5.0 |

### Invocation boundaries and transfer bounds

Owner warm-request counts/depth are the same at both scales and both delays; body bytes below are round-2 examples. All page statements remain unchanged. The current session/user/membership selection uses 7 bind parameters and 1,614 SQL bytes, independent of fixture size; instrumentation saves only those counts. Statement counts are not presented as latency proof by themselves.

| Route | Statements | Native invocations / observed depth | Statements per invocation after | Uncompressed RSC body bytes (representative / stress) |
|---|---:|---:|---|---:|
| Home | 12 → 11 | 4/4 → 3/3 | 1 + 6 + 4 | 21,842 / 21,853 |
| Clients | 4 → 3 | 3/3 → 2/2 | 1 + 2 | 81,113 / 235,916 |
| Work | 8 → 7 | 3/3 → 2/2 | 1 + 6 | 280,472 / 320,476 |
| Social | 6 → 5 | 3/3 → 2/2 | 1 + 4 | 208,487 / 233,425 |
| Systems | 7 → 6 | 4/4 → 3/3 | 1 + 3 + 2 | 145,340 / 172,413 |
| Team | 4 → 3 | 3/3 → 2/2 | 1 + 2 | 2,832 / 2,832 |
| Ads | 2 → 1 | 2/2 → 1/1 | 1 | 2,710 / 2,710 |

Candidate representative round 2 provides the matching server-side sequence: Home's combined identity/membership ends at 108 ms, then projection batches run at 110–217 and 220–330 ms, projection ends at 331 and stream EOF at 334 (320 ms D1 wait / 14 ms other). Systems' combined read ends at 111, batches run 112–217 and 218–326, projection ends at 327 and stream EOF at 334 (321 / 13 ms). Compare the pre-fix trace above: the separate ~103 ms membership stage is gone; early streaming and the two correct date-dependent page stages remain.

### PERF2 harness cross-check

The unchanged no-clone PERF2 timing harness was rerun with 12 cycles / two warmups. It retains Playwright-driver wait overhead and therefore must not be numerically substituted for the browser-owned phase timings above. All candidate requests complete successfully without protected prefetch; its server counts/depth agree at both fixture sizes. Rendered `<li>` counts include nested child summaries and navigation context, not just top-level business records.

| Route | Representative zero | Stress zero | Representative 100 ms | Stress 100 ms | Rendered rows, representative / stress |
|---|---:|---:|---:|---:|---:|
| Home | 78.5 | 95.2 | 394.7 | 402.8 | 35 / 35 |
| Clients | 79.1 | 112.0 | 279.0 | 311.8 | 57 / 157 |
| Work | 145.3 | 185.9 | 361.5 | 391.8 | 202 / 202 |
| Social | 128.0 | 128.0 | 328.0 | 328.3 | 200 / 200 |
| Systems | 111.6 | 120.3 | 411.4 | 426.9 | 256 / 256 |
| Team | 61.7 | 61.8 | 261.5 | 276.3 | 5 / 5 |
| Project detail | 145.7 | 145.6 | 445.8 | 454.0 | 19 / 19 |

Project detail's same-harness representative zero-delay median is 161.8 → 145.7 ms; current parent authorization plus child composition changes from 14 statements / 4 invocations / depth 4 to 13 / 3 / 3. Its child batch remains bounded at 11 statements. It renders 19 rows at both fixture sizes. Before/after row counts for the shared routes are unchanged. No synthetic-delay *baseline* was rerun with this older harness in PERF3; use the eight paired completion runs, not historical unpaired figures, for causal latency comparison.

## Security and correctness evidence

Fourteen new current-session composition tests cover exact membership selection/tie ordering/decoding, unchanged Better Auth DTOs, suspended/removed/deleted membership, suspended/archived workspace, changed session user, current capabilities and identity, forged/expired/deleted session, ordinary due-session refresh, deletion during refresh, concurrent users and separate bindings, fallback/out-of-scope reads, and fail-closed database errors. Three timing/diagnostic tests cover phase arithmetic, missing EOF, negative body-to-DOM intervals and fixed safe event vocabulary.

The six existing issued-session performance/security regressions prove next-request session deletion; membership suspension/removal; independent Client, Service and Project assignment revocation; restricted Project denial; capability revocation; Client-visible Content removal and contact unlinking; tenant hiding and non-grants from department/ownership. Full auth/membership/shell/authorization, Client/Service/Project/Milestone/Action/Deliverable/File, B1–B7, Release C and D1 Systems suites also pass. No production behavior was weakened to satisfy a test.

Native Systems/Home smokes still enforce current scope, visibility and suspended-member fences at 240 assignments, with bounded maximum 65/64 bind parameters and unchanged five/ten projection statements in two batches. Browser checks revoke an already-issued Team session's Project metadata/body on the next request after unassignment, restoring only the synthetic fixture afterward. Existing Systems browser tests exercise live revocation, denied routes and native no-JavaScript filtering.

## Verification ledger

| Check | Outcome |
|---|---|
| Full `npm test`, including PERF1/PERF2, auth/scope/revocation, B1–B7, Release C and D1 regressions | 4,786/4,786 pass |
| New workspace-session and timing tests plus issued-session performance regressions | 23/23 pass |
| `npm run build` | Pass, including Next lint/type validation |
| `npm run cf:build` | Pass; actual OpenNext Worker tested |
| Built Worker `auth-smoke-local.mjs` | 144/144 pass |
| External verifier against local built Worker | 21/21 pass after normal login-rate-limit cooldown; first immediate run after browser sign-ins got 429, unchanged limit |
| Local zero-to-current | 22/22 pass; both migration runs, schema/ledger idempotence and integrity |
| Systems native D1 smoke | 23/23 pass; 5 page statements / 2 batches, 240 assignments, max 65 binds |
| Home/projections native D1 smoke | 34/34 pass; 10 page statements / 2 batches, 240 assignments, max 64 binds |
| Release B / Release C native Workerd/D1/R2 smokes | 86/86 and 29/29 pass |
| Navigation browser acceptance | 99 checks / 80 screenshots: eight destinations including Ads and Project detail, 1440/1024/768/390/320, JS and no-JS |
| Systems browser/HTTP acceptance | 122 checks / 47 screenshots, five widths, native no-JS filters, keyboard/focus/touch and revocation |
| PERF3 completion benchmark | 8 × 84 samples (672 including warmups); all 672 have real network EOF and identical browser-reader/server byte counts |
| PERF2 round-trip/completed-content harness | 5 × 84 samples (420 including warmups), including representative base and all four candidate scale/delay combinations |
| Changed JS syntax | All 15 changed/new JS modules pass `node --check`; no JSX source changed |
| `git diff --check` and exact base comparison | Pass; no dependency/schema/migration/config/placement/workflow changes |

The sampled Home 320px and Systems 1440px screenshots were visually inspected; no UI source/style change was made. Screenshots are synthetic local evidence, not staging acceptance. The execution prompt was read fully and removed as required; its history remains recoverable in Git.

## Limits and reproduction

The result tables and verification ledger above accompany [sanitized numeric evidence](evidence/PERF3_navigation.json). The artifact defines its array columns explicitly, retains all warmups, and rounds primary-run milliseconds to 0.001. Logs and screenshots remain outside Git under `/tmp/bloomops-perf3-*`; issued cookies remain in private external fixture files. The earlier aborted exploratory harness attempts did not produce retained benchmark runs. No secret, response body or fixture identifier is committed.

There are **no** schema, migration, dependency, lockfile, Next/OpenNext/Worker configuration, workflow, infrastructure, placement or D2 feature changes. Current official [D1 batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [Workers diagnostics-channel support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/diagnostics-channel/) and [Next server/client component guidance](https://nextjs.org/docs/app/getting-started/server-and-client-components) were consulted alongside installed source. Cloudflare skill guidance informed validation of binding boundaries and workerd verification; its Chrome DevTools MCP workflow was unavailable, so repository Playwright plus CDP supplied browser timing.

For reproduction, use Node 22+, installed lockfile dependencies, external Playwright/Chromium, local-only development bindings and current local migrations. Reuse `scripts/navigation-perf-fixture.mjs`'s documented representative and stress modes from PERF2; do not point any fixture command at staging/production. Build each application revision with `npm run build` and `npm run cf:build`. To instrument the base, apply only the PERF3 fixed-label marker changes in `access.mjs`, `work-projections.mjs` and `systems.mjs` plus `navigation-timing.mjs`, retaining the base auth/membership path. Use the same completion/worker harness files for both builds. Stop the owned preview before rebuilding/restarting.

```sh
node scripts/navigation-perf-local.mjs
# In another terminal; external storage-state path contains an issued local session:
node scripts/navigation-completion.mjs --storage-state /private/representative/owner-state.json --out /tmp/perf3-representative-zero
node scripts/navigation-completion.mjs --storage-state /private/stress/owner-state.json --out /tmp/perf3-stress-zero
# Stop the owned preview, then repeat both commands against:
node scripts/navigation-perf-local.mjs --d1-delay-ms 100
# Existing PERF2 check, using that fixture's synthetic Project identifier:
node scripts/navigation-perf.mjs --storage-state /private/representative/owner-state.json --project SYNTHETIC_PROJECT --out /tmp/perf3-perf2-check
```

Pass `--playwright` when external dependencies are elsewhere; this host also needed the existing external Chromium shared-library path. Full tests needed a temporary external `python`→`/usr/bin/python3` launcher because this host has only `python3`; no repository dependency or test was modified for that host issue.

For later **read-only signed-in staging** timing, provide an existing private storage-state path and the exact deployed SHA to `navigation-completion.mjs --url https://bloomops-staging.cool-sunset-2169.workers.dev --expected-sha FULL_MERGE_SHA --storage-state /private/staging-state.json`. Do not paste credentials into chat/Git or send magic-link email automatically. The harness checks the build label; staging has no local trace endpoint. Live server-side attribution, if still needed, requires a separately audited staging-only diagnostic workflow. Target median <500 ms and p95 <800 ms, especially Home/Systems; local simulated success cannot satisfy this gate.
