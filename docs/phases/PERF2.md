# PERF2 - Staging Navigation Round-Trip Hardening

## Objective

Fix the remaining real-world staging navigation latency after PERF1. The user has now tested the deployed PERF1 build and reports that ordinary signed-in navigation is still slow even with very little data. Treat this as a release blocker.

PERF2 begins from exact current main:

`d0533cb9a7b3646134cbc194767af669c75f5adf`

On that SHA:

- PERF1 PR #32 is merged.
- Deploy staging run `34529118212` passed.
- Verify zero-to-current run `34529118297` passed.
- Staging serves that exact SHA.
- The user still experiences slow signed-in tab navigation.

D2 remains blocked until PERF2 is independently audited, merged, both exact-SHA post-merge gates pass, and signed-in staging navigation is materially improved.

## Problem Statement

PERF1 reduced total D1 calls and removed several serial reads while preserving next-request revocation. Local built-Worker medians stayed below 200 ms. However, the deployed app still feels slow to the actual user.

This strongly suggests that total query count alone is not the remaining metric that matters. PERF2 must measure and reduce **remote round-trip depth** on the critical path.

A route may perform many statements safely if they are completed in one remote batch or one SQL query. Conversely, four or five dependent D1 stages can still produce a one-to-two-second navigation if each remote stage has material latency.

The current app is sparse. Performance must also be checked under representative future data volume so the system does not only work while nearly empty.

## Read First

Read completely before editing:

- `AGENTS.md`
- `docs/BUILD_STATE.md`
- `docs/INDEX.md`
- `docs/PERF1_RESULTS.md`
- `docs/phases/PERF1.md`
- `docs/phases/D1.md`
- `docs/RELEASE_D.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DOMAIN_MODEL.md`
- `lib/bloomops/access.mjs`
- `lib/bloomops/auth.mjs`
- `lib/bloomops/membership.mjs`
- `lib/bloomops/authorization.mjs`
- `lib/bloomops/db.mjs`
- `lib/bloomops/shell-server.mjs`
- current Home, Clients, Work, Social, Systems, Team and Project detail read paths
- PERF1 performance/browser harnesses
- current OpenNext/Cloudflare configuration

Inspect the exact merged PERF1 code. Do not assume the next optimization before measuring it.

## Non-Negotiable Security Rule

Do not trade correctness for speed.

Every protected request must still use current database truth. Membership suspension/removal, assignment changes, Client contact unlinking, visibility changes and capability changes must still revoke access on the next protected request.

Do not:

- add cross-request authorization caches
- enable long-lived Better Auth cookie/session caching
- cache membership, actor, scope, assignments, capabilities or visibility across requests
- serve protected stale static output
- trust client state for authorization
- weaken tenant isolation or existence hiding
- use read replicas if they can weaken immediate revocation consistency
- move authorization checks after protected data is loaded or streamed

Request-local batching, request-local memoization, SQL joins/CTEs, native D1 batch operations, and parallel reads are allowed if each request still evaluates current truth.

## Phase 1: Measure Remote Round-Trip Depth

Extend the PERF1 measurement harness so it reports both:

1. total D1 statements/calls
2. sequential remote D1 round-trip stages on the visible critical path

Do not use total call count as a proxy for depth.

For each of these routes:

- `/`
- `/clients`
- `/work`
- `/social`
- `/systems`
- `/team`
- one representative `/work/projects/[id]`

capture, where safely possible:

- click-to-visible
- completed RSC/body duration
- number of D1 binding invocations
- number of statements per invocation
- maximum sequential D1 depth before visible completion
- time spent waiting on D1 versus application CPU/serialization
- browser request colo when exposed by Cloudflare headers
- D1 serving region/colo only through safe non-sensitive evidence if available

No SQL text, bind values, cookies, tokens, user content or row payloads may be logged.

## Phase 2: Reduce Round-Trip Depth

PERF1 reduced calls but current routes still contain multiple remote stages. Investigate whether independent current-truth reads can be collapsed further.

Primary hypotheses to test:

- D1 native `batch()` for independent prepared statements within one request
- one SQL query/CTE replacing several authorization-support reads
- batching actor capabilities/assignments/client links after membership is known
- batching page counts/options/rows that are independent after authorization is known
- combining bounded summary queries where one scan can safely derive several counts
- eliminating duplicate protected reads not caught by current request-local memoization
- reducing dependencies between shell authorization and page data without moving authorization later

Do not mechanically combine queries if doing so widens scope or makes authorization reasoning less clear.

Track both total statements and **network round-trip stages before -> after**.

### Round-trip acceptance direction

For ordinary top-level Owner navigation, target a protected critical path of roughly:

1. current session/identity
2. current workspace membership + actor support
3. authorized page data

Not every route must literally use three stages, but routine top-level pages should not require a long serial chain of remote database waits.

If a route still needs more stages, explain why each dependency is unavoidable.

## Phase 3: Realistic Data Scale

The user explicitly raised the concern that the app is already slow while nearly empty.

Benchmark at least two controlled local data scales using the same code and measurement method:

### Representative

At minimum approximately:

- 50 Clients
- 100 Projects
- 300 Milestones
- 1,000 Actions
- 300 Deliverables
- 250 Content Items
- 200 File metadata rows
- realistic assignment relationships

### Stress

At least 3x the representative scale where the existing bounded UI contracts permit it.

Do not render thousands of rows. Preserve pagination/bounds. The point is to prove that query time, statement bindings, payload size and critical-path depth remain controlled as the database grows.

Record median and p95 or range. Identify any route whose query cost grows unexpectedly with total workspace size.

If a measured hot query needs an index, prove it with query-plan/timing evidence before adding a migration. Schema changes remain a last resort.

## Phase 4: Authenticated Staging Evidence

PERF2 must not close on localhost evidence alone.

Use the strongest safe method available to measure the deployed staging app with an authenticated Owner session.

Preferred approach:

- reuse `scripts/navigation-perf.mjs`
- support a one-time Playwright storage-state capture outside Git if needed
- if an interactive browser is available, allow the user to sign in manually and save the session file outside the repo with restrictive permissions
- never ask the user to paste cookies, session tokens or magic-link tokens into chat, source code, Git or logs
- do not commit storage state
- do not send a real magic-link email automatically without explicit user action

If the CLI environment cannot access an interactive browser, make the capture workflow easy for the user to run locally, then continue with the resulting local storage-state path. Do not weaken authentication to make measurement easier.

Measure the exact deployed candidate only after it is safely available for testing. If a temporary staging-only diagnostic is necessary, it must expose only coarse timing/count metadata, must be authenticated, must reveal no private data, and should be removed before final merge unless there is a durable operational reason to keep it.

## Staging Target

For the user's ordinary warm signed-in navigation under a normal connection:

- target median click-to-visible below 500 ms for top-level routes
- target p95 below 800 ms where practical
- routine clicks should not commonly exceed 1 second

Project/detail routes may be somewhat heavier, but should not routinely feel like a two-second wait.

If these targets cannot be met because of measured Cloudflare/D1 geography or an external platform floor, provide direct evidence. Do not call PERF2 complete based on speculation.

## Placement / Infrastructure Hypothesis

The staging D1 has been observed serving from APAC/HKG during deployment. PERF1's audit environment measured public requests from US colos and was not representative of the user's Philippines path.

Measure before changing placement.

If application round-trip depth is already low and remote evidence shows Worker/D1 placement is the dominant remaining cost, evaluate the smallest Cloudflare placement change supported by the current OpenNext stack. Any placement/configuration change must:

- be staging-tested first
- preserve security and data semantics
- avoid production mutation
- be documented and independently audited

Do not add a new database, cache service or auth provider.

## UX Rule

Do not hide latency with spinners, skeletons, artificial optimistic navigation or early visible shells and call that a fix.

Measure completed destination content. Preserve the D1 no-JavaScript visibility fix.

## Verification

Run the strongest current equivalents of:

- PERF2 round-trip-depth harness
- representative and stress-scale benchmarks
- full PERF1 performance regression suite
- auth/membership/shell/authorization tests
- next-request revocation tests
- Client/Service/Project/Action/Content scope regressions
- B1-B7 shared Work regressions
- Release C regressions
- D1 Systems regressions
- full `npm test`
- `npm run build`
- `npm run cf:build`
- built Worker auth/runtime verification
- local zero-to-current verification
- Systems/projection/release B/release C smoke suites
- browser acceptance at 1440/1024/768/390/320
- JavaScript-disabled rendering where changed paths affect it
- `git diff --check`
- syntax checks for changed JS/JSX
- exact dependency/schema/migration/config diff against PERF2 base

For timing evidence, include sample counts, warmup treatment, median, p95 or range, and exact dataset size.

## Documentation and Handoff

Before final handoff:

- write `docs/PERF2_RESULTS.md`
- update `docs/BUILD_STATE.md`
- update `docs/INDEX.md`
- update durable architecture docs only if architecture changes
- remove `PERF2_CODEX_PROMPT.txt` before the final implementation commit
- keep working tree clean
- push the implementation branch
- open a PR against `main`
- leave it unmerged for independent audit

Report:

- exact base SHA
- exact final head SHA
- current sparse staging symptom/reproduction
- total D1 calls and sequential round-trip depth before/after by route
- exact optimization(s)
- representative and stress dataset sizes and timings
- local before/after results
- any real authenticated staging results obtained
- placement/colo evidence if measured
- immediate revocation/security evidence
- full verification results
- any schema/infrastructure changes
- remaining uncertainty

## Exit Criteria

PERF2 is complete only when:

- the remaining staging slowness is reproduced and materially attributed
- avoidable remote round-trip depth is reduced
- sparse and representative-data navigation both remain bounded
- immediate next-request revocation remains intact
- independent audit passes
- PR is merged
- Deploy staging and Verify zero-to-current pass on the exact merge SHA
- the user retests the deployed build and navigation is materially improved, or remaining latency is proven outside BloomOps control with evidence

Do not begin D2 until PERF2 closes.
