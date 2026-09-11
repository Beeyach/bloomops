# PERF3 - Authenticated RSC Completion and Live Navigation Hardening

## Objective

Resolve the remaining real staging navigation latency after PERF1 and PERF2.

PERF3 starts from exact current main:

`62bcf019226db1e7e939fbcffc8909f41fbd577a`

On that SHA:

- PERF2 PR #33 is merged.
- Deploy staging and Verify zero-to-current passed on the exact merge SHA.
- The deployed app was tested in a signed-in Cloud Browser session over repeated warm navigation.
- Warming did not materially improve navigation.
- D2 remains blocked.

The live signed-in measurements were approximately:

| Route | Warm click-to-visible | First-response proxy | Remaining delay after response begins |
|---|---:|---:|---:|
| Home | 1.05-1.10 s | ~0.27 s | ~0.81 s |
| Systems | 1.02-1.04 s | ~0.27 s | ~0.76 s |
| Work | 0.87-0.89 s | ~0.27 s | ~0.61 s |
| Team | 0.84-0.92 s | ~0.27 s | ~0.60 s |
| Social | 0.86-0.88 s | ~0.27 s | ~0.60 s |
| Clients | 0.85-0.88 s | ~0.28 s | ~0.58 s |
| Ads | 0.69-0.83 s | ~0.28 s | ~0.50 s |

Three warm cycles were nearly identical. There were no browser console errors. The live browser pass did not expose a request waterfall and no representative detail record existed to open.

The key PERF3 rule is: do not assume the post-first-response interval is browser rendering. Measure it. The first response may be an early streamed RSC shell while protected server work continues.

## Read First

Read completely before editing:

- `AGENTS.md`
- `docs/BUILD_STATE.md`
- `docs/INDEX.md`
- `docs/PERF1_RESULTS.md`
- `docs/PERF2_RESULTS.md`
- `docs/phases/PERF1.md`
- `docs/phases/PERF2.md`
- `docs/phases/D1.md`
- `docs/RELEASE_D.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DOMAIN_MODEL.md`
- `app/(internal)/layout.jsx`
- `app/(internal)/page.jsx`
- `app/(internal)/systems/page.jsx`
- Home, Clients, Work, Social, Systems, Team and Ads route implementations
- `lib/bloomops/shell-server.mjs`
- `lib/bloomops/shell.mjs`
- `lib/bloomops/access.mjs`
- `lib/bloomops/auth.mjs`
- `lib/bloomops/membership.mjs`
- `lib/bloomops/authorization.mjs`
- `lib/bloomops/read-batch.mjs`
- `lib/bloomops/work-projections.mjs`
- `lib/bloomops/systems.mjs`
- current Next/OpenNext/Cloudflare configuration
- PERF1/PERF2 browser and timing harnesses

Inspect the exact merged PERF2 code. Do not assume another batching pass is the fix.

## Non-Negotiable Security and Correctness

Performance work must preserve current database truth on every protected request.

Membership suspension/removal, assignment changes, capability changes, Client contact unlinking, visibility changes, tenant boundaries and existence hiding must take effect on the next protected request.

Do not:

- enable cross-request authorization or membership caches
- enable long-lived Better Auth cookie/session caching
- serve stale protected static output
- authorize from client state
- expose protected route data before authorization has succeeded
- weaken 401/403/404 existence-hiding semantics
- use protected prefetch results in a way that can display stale access after revocation
- add a spinner, skeleton, optimistic shell or early heading and call that a performance fix
- replace completed-content timing with TTFB
- change business behavior merely to obtain a benchmark

Request-local memoization, current-request SQL authorization, bounded native D1 batching, safe query composition, route-specific read models and infrastructure placement changes are allowed only when the same security semantics are independently proven.

## Phase 1 - Split the Live Delay Correctly

The live browser currently shows about 0.27-0.28 s until the route begins responding, then another ~0.5-0.8 s until the destination is visibly complete.

Instrument and reproduce these distinct phases:

1. click to RSC/document request start
2. request start to response headers / first byte
3. first byte to final response body byte
4. final body byte to destination DOM-complete marker
5. DOM-complete marker to two animation frames

Also correlate, without logging sensitive material:

- session/identity stage
- active membership stage
- actor/support authorization stage
- page-data stage(s)
- D1 native invocation start/end intervals
- D1 statement count and statements per invocation
- server component / projection completion
- RSC serialization / final stream flush
- browser parse/React commit time
- resource transfer size
- route prefetch behavior
- Worker colo when safely observable
- D1 region/colo only when safely observable

The audit must be able to tell whether the ~0.6-0.8 s interval is mostly:

- server-side D1 waiting after early RSC streaming begins
- application CPU / JS / serialization
- RSC stream flush behavior
- client React reconciliation/hydration/rendering
- network transfer
- or a combination

Do not label it a rendering bottleneck until the measurements prove that.

## Phase 2 - Home and Systems First

Home and Systems are the primary targets because they are consistently slowest in live signed-in navigation.

For Home, trace:

- `requireShell('internal')`
- identity and active membership
- actor resolution
- `homeProjection`
- timezone-dependent work
- every D1 batch/invocation
- RSC stream completion
- `OperationalHome` client/server rendering boundary

For Systems, trace:

- `requireShell('internal')`
- actor resolution
- `systemsProjection`
- filter/facet logic
- timezone-dependent work
- every D1 batch/invocation
- RSC stream completion
- `SystemsOverview` rendering boundary

Then verify whether the same cause explains Clients, Work, Social, Team and Ads.

## Phase 3 - Fix the Proven Critical Path

Choose the smallest architecture change that attacks the measured bottleneck.

Possible directions to evaluate, but do not implement without evidence:

- collapsing a remaining server dependency stage rather than merely reducing statement count
- moving exact authorization predicates into a bounded current-request read model so independent protected data can be fetched in the same remote stage without loading unauthorized rows
- reducing the session -> membership -> page-data serial chain while retaining current-request Better Auth and membership truth
- replacing timezone-dependent serial reads with an exact model that preserves per-Client IANA calendar semantics
- eliminating accidental RSC waterfalls or duplicated async boundaries
- removing expensive server serialization or client reconciliation if those are measured as material
- correcting Next/OpenNext streaming behavior if an avoidable framework boundary is proven
- adjusting Cloudflare Worker placement only if live evidence shows Worker-to-D1 geography is a dominant cost

Do not optimize a metric that is not on the visible critical path.

For every changed route, report before -> after for both total elapsed and the specific critical-path component being fixed.

## Phase 4 - Realistic Data Remains Required

Keep the PERF2 representative and stress datasets as regression fixtures:

Representative minimum:

- 50 Clients
- 100 Projects
- 300 Milestones
- 1,000 Actions
- 300 Deliverables
- 250 Content Items
- 200 File metadata rows

Stress must remain exactly 3x or greater where bounded UI contracts allow it.

Do not render unbounded collections. Preserve existing limits/pagination.

A fix that is fast only on the empty staging database is not acceptable.

## Phase 5 - Authenticated Staging Proof

PERF3 cannot close on localhost or artificial-delay evidence.

After independent audit and merge, the exact merge SHA must deploy to staging and pass Verify zero-to-current. Then rerun the signed-in Cloud Browser test using the same route set and completion definition.

Target warm signed-in navigation:

- top-level median below 500 ms
- p95 below 800 ms where practical
- routine clicks should not commonly exceed 1 second
- Home and Systems must no longer sit around 1.0-1.1 s if the bottleneck is under BloomOps control

If these targets cannot be met, remaining latency must be directly attributed with live evidence. A local simulation is not sufficient.

If temporary diagnostics are needed:

- staging only
- authenticated or server-side only where applicable
- coarse timings/counts only
- no SQL, bind values, cookies, tokens, user data or row payloads
- no persistent sensitive logs
- remove temporary diagnostics before final merge unless they are intentionally retained as safe operational observability and audited as such

Do not send real magic-link email automatically. Do not ask the user to paste cookies or tokens into chat or Git.

## Verification

Run the strongest current equivalents of:

- PERF3 end-to-end phase timing harness
- PERF2 round-trip-depth harness
- representative and 3x stress benchmarks
- full PERF1/PERF2 performance regressions
- auth/membership/shell/authorization tests
- issued-session next-request revocation tests
- Client/Service/Project/Action/Content scope regressions
- B1-B7 shared Work regressions
- Release C regressions
- D1 Systems regressions
- full `npm test`
- `npm run build`
- `npm run cf:build`
- built Worker auth/runtime verification
- local zero-to-current verification
- Systems/projection/Release B/Release C smoke suites
- browser acceptance at 1440/1024/768/390/320
- JavaScript-disabled rendering for affected paths
- syntax checks for changed JS/JSX
- `git diff --check`
- exact dependency/schema/migration/config diff against PERF3 base

If framework, OpenNext, Worker placement, or configuration changes are made, add dedicated regressions and document why they are safe.

## Documentation and Handoff

Before implementation handoff:

- write `docs/PERF3_RESULTS.md`
- update `docs/BUILD_STATE.md`
- update `docs/INDEX.md`
- update durable architecture docs if architecture changes
- remove `PERF3_CODEX_PROMPT.txt`
- keep the working tree clean
- push the implementation branch
- open a PR against `main`
- leave it unmerged for independent audit

Report:

- exact base SHA
- exact final head SHA
- live PERF2 staging measurements used as baseline
- first-byte vs final-body vs DOM-commit timing
- server D1 wait vs non-D1 elapsed
- exact root cause
- Home and Systems before/after
- all top-level route before/after where affected
- representative/stress results
- security/revocation evidence
- full verification results
- any schema/dependency/config/infrastructure changes
- remaining uncertainty

## Exit Criteria

PERF3 is complete only when:

- the ~0.5-0.8 s post-first-response interval is materially attributed
- the dominant avoidable critical-path cost is fixed
- Home and Systems materially improve in end-to-end measurements
- other top-level routes do not regress
- representative/stress performance remains bounded
- current-request authorization and next-request revocation remain intact
- independent audit passes
- PR is merged
- Deploy staging and Verify zero-to-current pass on the exact merge SHA
- signed-in staging retest demonstrates material improvement, or any remaining latency is proven outside BloomOps control with direct live evidence

Do not begin D2 until PERF3 closes.