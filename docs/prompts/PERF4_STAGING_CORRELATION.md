# PERF4 Signed-In Staging Correlation Execution Prompt

## Recommended execution configuration

- Model: GPT-6 Astra
- Reasoning: High
- Surface: Codex CLI
- Working repository: `/home/ary/Developer/bloomops`

You are continuing BloomOps PERF4.

This task is explicitly authorized to deploy to **BLOOMOPS STAGING ONLY** for the bounded PERF4 signed-in correlation run described below.

Repository: `Beeyach/bloomops`

Candidate branch: `perf/perf4-staging-timing-integration`

**EXACT authorized candidate SHA:**

`6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`

Staging URL:

`https://bloomops-staging.cool-sunset-2169.workers.dev`

PERF4 Analytics Engine dataset:

`bloomops_perf4_staging_timing`

This prompt file lives on a separate orchestration-only GitHub branch. Do not deploy that prompt branch. The deploy source must remain exactly the authorized candidate SHA above.

## Hard boundaries

Do not deploy production.

Do not open a PR.

Do not merge.

Do not begin D2.

Do not make a performance optimization.

Do not weaken authentication or authorization.

Do not enable Worker Logs, invocation logs, traces, tailing, or blanket observability.

Do not send a real sign-in email.

Do not introduce schema changes or migrations.

Do not capture URLs, query contents, cookies, SQL, bindings, response bodies, user IDs, workspace IDs, customer data, email addresses, error messages, stacks, IPs, user agents, or referrers in PERF4 output.

## 1. Exact-SHA preflight

Start in:

```bash
cd /home/ary/Developer/bloomops
```

Run:

```bash
git fetch origin
git status -sb
git rev-parse HEAD
git rev-parse origin/perf/perf4-staging-timing-integration
git diff --exit-code
```

Require BOTH local HEAD and remote candidate branch to equal exactly:

`6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`

Require a clean working tree.

If anything differs, STOP. Do not deploy.

Read before doing remote work:

- `AGENTS.md`
- `docs/BUILD_STATE.md`
- `docs/PERF4_RESULTS.md`
- `docs/evidence/PERF4_active_runtime.json`
- `worker.mjs`
- `lib/bloomops/perf4-worker.mjs`
- `lib/bloomops/server-timing.mjs`
- `wrangler.jsonc`
- `package.json`

Confirm ordinary observability/logs/invocation logs/traces remain disabled.

## 2. Build and deploy the exact candidate to staging

Build from the exact authorized SHA.

Use the repository's existing staging deployment path:

```bash
npm run deploy:staging
```

STAGING ONLY.

Do not run any production deploy command.

Record the Cloudflare deployment result and deployed Worker version/deployment identifier without exposing credentials.

Do not run any migration. This candidate contains no migration.

## 3. Verify deployment provenance before measuring

Request:

`https://bloomops-staging.cool-sunset-2169.workers.dev/api/version`

Prove that the deployed application corresponds to exact candidate:

`6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`

If `/api/version` exposes only the repository's established short SHA representation, require it to correspond to `6da1c246`.

Do not manually alter version metadata just to make this check pass.

If deployed provenance cannot be established, STOP measurements and report the failure.

## 4. Use the existing signed-in browser session

Use the existing authenticated Chrome/Chrome DevTools MCP staging session.

Do NOT trigger magic-link sign-in.

Do NOT send any email.

Confirm the session can navigate the staging application before performance capture.

Routes:

- `/`
- `/clients`
- `/work`
- `/social`
- `/systems`
- `/team`
- `/ads`

For each route:

1. perform one warmup navigation that is discarded
2. perform exactly three retained warm navigations

Total retained navigation samples:

`7 routes × 3 = 21`

Use the same signed-in session and same browser conditions throughout.

No CPU throttling.

No network throttling.

Avoid unrelated browser activity during capture.

## 5. Browser-side capture

For each retained navigation capture, at minimum:

- route
- request start
- response/header availability / TTFB
- root RSC request body EOF
- first visible time if the existing measurement harness supports it
- settled time if the existing measurement harness supports it
- HTTP status
- number of same-origin root RSC requests
- `X-Bloomops-Timing`
- initial `Server-Timing` header snapshot
- whether navigation completed, cancelled, or errored

Do not store sensitive request headers or cookies.

Confirm whether the prior PERF3 shape still holds:

- one root RSC request
- no client request waterfall dominating latency
- most delay after headers but before RSC EOF

Do not infer this if evidence differs.

## 6. Analytics Engine correlation

For every retained request with an `X-Bloomops-Timing` opaque correlation ID, query:

`bloomops_perf4_staging_timing`

using the existing authorized Cloudflare account.

Do not enable Worker Logs or tailing as a substitute.

For each correlation ID, look for the fixed three-record PERF4 schema:

- `metrics-v1`
- `spans-a-v1`
- `spans-b-v1`

Check:

- identical `index1` correlation ID
- correct fixed route
- lifecycle event
- exactly one of each expected record where Analytics Engine delivered all points
- no unexpected blob fields
- positional double counts conform to the documented schema

Report explicitly:

- expected points
- retrieved points
- missing records
- duplicate records
- sampled records if Cloudflare sampling is visible
- IDs with incomplete triplets

Do NOT silently treat best-effort Analytics Engine delivery as atomic.

For 21 fully delivered normal samples the ideal result is:

- 21 unique correlation IDs
- 63 records total
- 3 records per ID

Report reality rather than forcing this expectation.

## 7. Analyze actual deployed server phases

Decode only the documented fixed numeric schema.

For every retained normal-completion request analyze, where available:

- response
- identity
- membership
- actor
- home
- systems
- wait1 through wait8
- first
- total
- elapsed
- unattributed

Also use `spans-a-v1` and `spans-b-v1` start/duration pairs to identify overlap and ordering.

Important:

- Home and Systems projection spans are inclusive.
- D1 wait ordinals do not identify SQL categories.
- Do not add overlapping phase durations together as if exclusive.
- Do not compare absolute browser and Worker clocks.
- Correlate relative durations within their own clock domains.

Determine which measured phase or interval actually dominates Home and Systems latency in deployed staging.

Compare against Ads as the faster control route.

Also summarize all seven routes.

## 8. Compare to PERF3

Use the committed historical PERF3 signed-in staging results in `docs/PERF4_RESULTS.md`.

Historical medians included approximately:

Home:
- TTFB 199.5 ms
- RSC EOF 801.0 ms

Systems:
- TTFB 200.0 ms
- RSC EOF 764.3 ms

Ads:
- TTFB 204.3 ms
- RSC EOF 387.5 ms

Calculate the new three-sample median for each route and an overall routeWarm median/p95 using the same definitions wherever possible.

Do not claim an improvement or regression if the measurement definitions differ.

## 9. Privacy acceptance

Confirm live PERF4 Analytics Engine records contain ONLY the documented fixed schema.

No:

- full URL
- query text
- cookies
- authorization data
- SQL
- SQL bindings
- response content
- user/customer/workspace identifiers
- email
- error text
- stack
- IP
- user-agent
- referrer
- hostname/build strings

Use bounded hostile-marker requests only if they can be done without disrupting authentication or customer/staging data.

Do not enable logging to test privacy.

## 10. Authentication/revocation remote safety

The local active workerd verification already proved suspension, membership deletion and session revocation behavior.

For staging, do NOT mutate the user's real signed-in membership or session merely to satisfy this test.

Only perform a remote revocation test if a clearly disposable staging-only test identity/session already exists and can be safely restored without email or business-data impact.

If no such disposable identity exists, record:

`deployed remote revocation remains unproven; local active-workerd revocation passed`

Do not turn this into an unsafe staging-data mutation.

## 11. No optimization yet

Even if the result makes the bottleneck obvious:

DO NOT CHANGE THE PERFORMANCE IMPLEMENTATION.

No D2.

No query rewrite.

No caching change.

No auth change.

No projection change.

No speculative optimization.

The purpose of this run is diagnosis and live correlation only.

## 12. Evidence and handoff

Create/update sanitized evidence under `docs/evidence` for the staging correlation.

Update:

- `docs/PERF4_RESULTS.md`
- `docs/BUILD_STATE.md`

Clearly separate:

1. historical PERF3 browser evidence
2. historical primitive evidence
3. inactive/default integration CI
4. active local workerd verification
5. NEW signed-in deployed staging correlation

Record:

- exact candidate SHA
- Cloudflare deployment provenance
- `/api/version` result
- browser capture counts
- Analytics Engine correlation counts
- missing/duplicate/sampled points
- per-route browser medians
- per-route server timing medians
- Home dominant phase
- Systems dominant phase
- Ads control result
- privacy result
- staging auth/revocation status
- what remains unproven
- whether evidence now justifies a specific optimization hypothesis

Do not include secrets, cookies, raw sensitive headers or customer data.

If documentation/evidence changes are required, commit them on the SAME candidate branch with a clear PERF4 staging-correlation handoff message.

Do not PR or merge.

If you create a new handoff commit, push it to:

`origin/perf/perf4-staging-timing-integration`

Then report BOTH:

- exact deployed application SHA: `6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`
- final evidence/handoff branch SHA, if different

## 13. Final response

Return:

- deployment success/failure
- exact deployed SHA
- `/api/version`
- 21 retained browser sample status
- Analytics Engine expected/retrieved/missing/duplicate/sampled counts
- seven-route median table
- Home timing breakdown
- Systems timing breakdown
- Ads control timing breakdown
- dominant deployed phase(s)
- privacy verdict
- remote auth/revocation verdict
- final branch SHA
- remaining unknowns
- whether PERF4 now has enough evidence to choose the smallest optimization

Stop there.

Do not open a PR.

Do not merge.

Do not begin the optimization.

PERF3 and PERF4 remain OPEN until the evidence is reviewed.

D2 remains BLOCKED.
