# PERF4 — staging timing integration handoff

**The staging-only integration is implemented on `perf/perf4-staging-timing-integration`. PERF3/PERF4 remain OPEN; D2 remains BLOCKED.** No PR, merge or deployment has occurred. Signed-in staging correlation remains the required live gate before a PERF4 PR or performance fix is justified. This section supersedes the inactive-primitive status preserved below.

## Integration provenance and behavior

The integration starts from primitive commit `a20dbfc93ad9126b59a91ba7e0442634e2b582a2`. Runtime implementation is `06a4951d8ebbf4cec2d81f6919219bf33b69c4de`; response-preservation coverage was added at `317766f7cc45cdd6216467b924c6a91913498ba8`. Verification correction `f82a1f86770d41d4ee2eee705cd20ef71cd850cb` changes only tests and the temporary verifier. The final handoff changes documentation and removes that verifier; application source remains identical to `06a4951`. The original execution prompt and historical numeric evidence remain intact.

`worker.mjs` delegates the generated OpenNext fetch handler through `lib/bloomops/perf4-worker.mjs`. Activation requires all of: staging environment, literal server-owned `BLOOMOPS_PERF4_TIMING=enabled`, a callable `PERF4_TIMING` binding, the configured HTTPS origin, and a GET to one of `/`, `/clients`, `/work`, `/social`, `/systems`, `/team`, `/ads` (optional trailing slash). Both HTML and RSC requests can qualify; there is no RSC-header-only filter. Query/header values cannot enable it, and query contents never enter output. Nested resources, auth/API routes and other methods bypass timing. Default/development/production requests delegate the original Request, environment, context and Response without a D1 proxy, stream observer or timing headers. They still enter the small wrapper dispatch; zero deployed overhead is not claimed.

Active requests use AsyncLocalStorage for the existing navigation-stage events and a request-local environment/D1 proxy. Up to eight native invocations get ordinal wall-time spans, including one span for a native batch; SQL, bindings, results and native metadata are not collected. The shared binding is not patched. Joined identity/session/workspace timing cannot separately identify membership cost. Home/Systems projection spans are inclusive. Ordinals preserve observed ordering and overlap without inventing SQL categories or causality.

Response headers expose a fresh opaque 128-bit ID in `X-Bloomops-Timing` and a `Server-Timing` snapshot at Response availability. A readable stream forwards chunks without decoding or whole-body buffering, observes its first read and normal EOF, and distinguishes cancel/error termination. These are Worker observations, not browser arrival or exclusive CPU. Pre-response exceptions propagate unchanged without a fabricated completion. Headers cannot acquire later EOF timing. Existing status, redirects, cookies, cache policy and body semantics are preserved by the covered cases; production auth/authorization policy and projection queries are unchanged.

## Sanitized destination, retention and disable procedure

Only staging declares Analytics Engine dataset `bloomops_perf4_staging_timing`, binding `PERF4_TIMING`, and the activation variable. Ordinary observability, logs, invocation logs and traces remain disabled. No live binding or dataset has been exercised in this task.

At termination the sink attempts three data points sharing the random ID in `index1`. `blob1` is `metrics-v1`, `spans-a-v1` or `spans-b-v1`; `blob2` is the fixed route and `blob3` the lifecycle event (`complete`, `cancel`, `error`). Missing or invalid numbers are `-1`. No URL, query, cookie, user/client/workspace identifier, SQL, error text, response content or arbitrary label is supplied to Analytics Engine.

| Record | Positional doubles, in order |
|---|---|
| `metrics-v1` | response, identity, membership, actor, home, systems, wait1–wait8, first, total, elapsed, unattributed (18 values) |
| `spans-a-v1` | start/duration pairs for identity, membership, actor, home, systems, wait1–wait5 (20 values) |
| `spans-b-v1` | start/duration pairs for wait6–wait8 (6 values) |

Numbers are bounded to 0–120,000 ms. `unattributed` subtracts the union of valid measured intervals from normal completion, not their sum; incomplete/malformed spans can suppress it. Sink exceptions/rejections are swallowed without logging. Delivery is best effort: three attempted records are not an atomic or guaranteed live triplet. Capture must explicitly report missing, duplicate or sampled records.

Cloudflare documents a three-month Analytics Engine retention period and limits of 20 doubles, 20 blobs and one index per point; this schema fits those limits. Disabling emission does not erase retained records. [Analytics Engine limits and retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/). The service supplies storage metadata such as timestamp/sample information in addition to application fields; runtime privacy and successful live retrieval are still acceptance checks, not established by a fake sink. [Analytics Engine data points and querying](https://developers.cloudflare.com/analytics/analytics-engine/get-started/).

To disable future emission, remove/change the staging activation variable and deploy that reviewed staging configuration; absence of the sink also disables it. To remove the integration, restore `.open-next/worker.js` as the entrypoint, remove staging opt-in/binding and then remove the unreferenced wrapper modules through a reviewed change. Keep ordinary telemetry disabled throughout. Neither procedure has been executed remotely. No automatic export, shorter retention setting or immediate deletion guarantee is implemented.

## Extended verification and correction

[Sanitized integration verification record](evidence/PERF4_integration_verification.json) retains exact source hashes and CI provenance separately from historical primitive measurements.

[Run 34584611556](https://github.com/Beeyach/bloomops/actions/runs/34584611556), exact SHA `317766f7cc45cdd6216467b924c6a91913498ba8`, passed install, 39 focused tests, **4,832/4,832 full tests**, Systems **23/23** and Home **34/34** native D1 checks, Next build, OpenNext build and staging bundle dry-run. It failed the loopback auth smoke at its strict link-origin assertion: the harness requested `127.0.0.1` but the configured/generated link used `localhost`. Diff hygiene was subsequently skipped in that run. This was not a successful extended-verification result.

Correction `f82a1f8` uses `http://localhost:8787` consistently in the temporary verifier. No application origin policy or smoke assertion was weakened. It also includes the response test file in focused CI and corrects the pre-response-error fixture from non-allowlisted `/home` to `/`, asserting the measured environment is installed. Local focused verification passes **46/46** on Node 22.23.2, with no failures/skips/cancellations/todos, and diff hygiene passes.

[Corrected run 34585369973](https://github.com/Beeyach/bloomops/actions/runs/34585369973) on exact SHA `f82a1f86770d41d4ee2eee705cd20ef71cd850cb` passed all required verification steps:

| Check | Result |
|---|---|
| Lockfile install; executable syntax | Passed |
| Focused primitive/wrapper/response tests | 46/46 passed |
| Full repository suite | 4,832/4,832 passed; zero failures/skips/cancellations/todos |
| Disposable native Systems / Home D1 smokes | 23/23 and 34/34 passed |
| Next and OpenNext/Cloudflare builds | Both passed, including available lint/type checks |
| Staging custom Worker bundle dry-run | Passed; no deployment |
| Built development Worker auth/authorization smoke | 144/144 passed with localhost origin |
| Diff hygiene | Passed |

Systems retained 240 assignments, five statements/two batches, maximum 65 bindings; Home retained 240 assignments, ten statements/two batches, maximum 64 bindings. These match the earlier projection baseline. The complete reproducible check commands remain available in [the verifier at its tested commit](https://github.com/Beeyach/bloomops/blob/f82a1f86770d41d4ee2eee705cd20ef71cd850cb/.github/workflows/perf4-verify.yml), including local schema/migrations, Worker startup/cleanup and the localhost auth smoke. Its removal does not delete that provenance.

The native smokes exercise real D1 projection behavior, but do not install the timing adapter. The loopback auth smoke runs the built custom entrypoint in development, where timing is intentionally inactive. Active wrapper/D1/sink/stream assertions run under Node with a D1 double. These checks do not prove active staging integration, workerd stage propagation after headers, real Analytics Engine delivery, cancellation/backpressure under the built runtime, or active issued-session revocation behavior. Those limitations must remain visible even after the extended verifier passes.

## Remaining gate and scope

The historical paired SQLite measurements below apply only to the primitive, not the new wrapper, D1 adapter, RSC stream or real sink. Active off/on representative/exact-3× browser/Worker overhead and payload checks remain outstanding. No performance improvement or dominant deployed phase is claimed.

Next is active built-runtime verification and then separately authorized staging activation/correlation: verify the exact deployed SHA via `/api/version`, use an existing signed-in session, retain warm navigation samples and match each browser header ID to the three sanitized completion records. Distinguish normal EOF from cancellation/error, preserve the initial header snapshot, report unavailable spans/events, and compare relative durations without subtracting unsynchronized server/browser clocks. Authentication/authorization revocation and privacy must also be checked through the active runtime. No real sign-in email is authorized by this handoff. No PR is opened before the required live correlation. Independent review and exact-SHA staging/zero-to-current gates remain required for eventual closure; D2 remains blocked.

There are no schema/migration, dependency/lockfile, product UI, query, auth-policy or placement changes. The implementation does change the Worker entrypoint and staging diagnostic configuration. The temporary branch-only workflow is removed in the final handoff. Production, staging, Leadsthatbloom, DNS and remote business data remain untouched.

---

## Historical inactive-primitive handoff (superseded by the integration above)

Everything below records the earlier fallback at `a20dbfc`. Its present-tense inactivity/configuration statements describe that historical commit, not the current integration. Its accepted live data and local primitive overhead remain historical evidence, not a new staging capture.

**PERF3 remains operationally OPEN. PERF4 remains OPEN. D2 remains BLOCKED.** This is the prompt's explicit fallback, not an audit-ready staging observability integration or a performance fix. No PR is opened. The reusable primitive is tested, but the required deployment/diagnostic-output decision precedes further integration.

## Exact provenance and accepted evidence

Starting checkout: `perf/perf4-server-timing` at `e9030164d2602fe944d36d6cd5631af9573565a4`. Preflight verified a clean tree, ancestry containing original prompt commit `c06f87a5250d799a77a5f1398e5e4d8a1dd4ddad`, and `origin/main` exactly `2b892275abf0856dff10f31d49b2ff2da57acd5f`. No rebase or substitute base. The final handoff supplies the exact pushed primitive SHA; the numeric artifact fingerprints its three executable files. `PERF4_EXECUTION_PROMPT.txt` is unchanged. The continuation prompt is removed from the implementation tip and remains recoverable at the starting commit.

The live and prior local results below are **accepted input from that committed continuation prompt**, not measurements rerun here. Reported diagnosis commit `dd9fe8e7a40b48724b9a012bc6c09c5dac5105d0` was unpublished and unavailable on the remote branch. Its detailed results were not inspected or reconstructed as if recovered. [Numeric evidence](evidence/PERF4_server_timing.json) separates accepted live input, accepted reported local input, and this task's actual primitive overhead samples.

Staging `/api/version` reportedly returned HTTP 200 and label `2b89227`, the configured seven-character prefix of exact application SHA `2b892275abf0856dff10f31d49b2ff2da57acd5f`. Authenticated Chrome DevTools, no CPU/network throttling, one warmup followed by three retained cycles per route: 21/21 navigations completed. Medians in milliseconds:

| Route | TTFB | RSC body EOF | First visible | Settled |
|---|---:|---:|---:|---:|
| Home | 199.5 | 801.0 | 814.5 | 922.6 |
| Clients | 202.6 | 563.1 | 578.3 | 678.3 |
| Work | 204.6 | 590.2 | 601.1 | 701.7 |
| Social | 201.0 | 599.1 | 604.8 | 715.1 |
| Systems | 200.0 | 764.3 | 778.2 | 887.9 |
| Team | 203.0 | 570.8 | 577.5 | 678.7 |
| Ads | 204.3 | 387.5 | 396.9 | 502.0 |

Home retained TTFB/EOF/visible/settled cycles: 216.2/872.7/881.1/986.7, 199.5/801.0/811.8/920.5, 196.1/792.2/814.5/922.6. Systems: 202.4/762.7/765.2/870.3, 200.0/771.0/778.2/887.9, 199.2/764.3/778.7/888.9.

Each navigation had exactly one same-origin HTTP 200 root RSC GET. No dependent, overlapping or sequential follow-up waterfall, duplicate navigation or extra redirect was observed. Home became visible 8.4–22.3 ms after EOF, Systems 2.5–14.4 ms. No post-visible mutations occurred. The roughly 100–110 ms visible-to-settled interval is the intentional 100 ms mutation-free guard. Headers included `Cache-Control: no-store`, `Content-Encoding: zstd`, and a sanitized/truncated SJC CF-Ray observation. Server-Timing, CF-Cache-Status, Age, Content-Length, x-* timing headers and a usable safe correlation identifier were absent. Colo is not proof of D1 or Worker placement.

**Accepted conclusion:** browser paint and request waterfalls are not primary. Most delay lies after headers and before the single RSC body's EOF; Home and Systems are consistently slower there. This does not distinguish auth/session, D1/query/projection, RSC serialization, Worker scheduling, buffering or network delivery.

The prior local investigation **reported** three sequential native D1 stages for Home/Systems, including timezone-dependent projections. Injecting 100 ms per native invocation added about 300 ms to those routes, 200 ms to two-stage routes and 100 ms to Ads at representative and exact-3× scales. It reported 336 navigations, 4,786/4,786 tests, passing Next/OpenNext builds and fixture/evidence/syntax/diff checks, and no product change. It did not collect the correlated live spans needed to prove the dominant deployed phase. Those historical counts are not this task's check results.

## Why activation stops here

The existing `BLOOMOPS_ENV` can distinguish staging, but does not supply the missing response boundary or a safe completion-event destination:

1. `wrangler.jsonc` points `main` directly at generated `.open-next/worker.js`. Installed OpenNext's `cloudflare-node` wrapper resolves the Response in `writeHeaders`, then enqueues chunks and closes/errors its readable later. Layout/page hooks do not own that Response or final stream. Next middleware cannot time downstream EOF. The [documented custom Worker seam](https://opennext.js.org/cloudflare/howtos/custom-worker) requires changing Wrangler's entrypoint. Editing generated output or package files would be a fragile configuration workaround, not a candidate.
2. Existing `scripts/navigation-perf-worker.mjs` owns a local-only outer Response/TransformStream boundary. It is not imported by deployment. Its local endpoint, SQL classification and query metadata must not be promoted to staging.
3. A11 deliberately sets observability, logs, invocation logs and traces **false in every environment**, with a resolved-config regression protecting token-bearing invitation URLs. [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) covers custom logs, errors and uncaught exceptions as well as invocation metadata. Turning on logs with invocation logs disabled is not by itself proof of the required no-URL/no-error privacy contract. No blanket logging switch or remote tail was used.

The continuation prompt expressly says to stop with the tested primitive when the necessary configuration/infrastructure decision is missing. No new environment variable, binding, workflow, Worker/Next/OpenNext configuration or resource is introduced.

## Primitive and honest boundaries

`lib/bloomops/server-timing.mjs` is unimported by the deployed application. `createServerTiming` requires **both** literal `enabled: true` and `environment: 'development'`, plus a fixed route key. Staging, production, missing/unknown environments and default calls return an inert singleton. Unit tests explicitly use the development opt-in. There is no browser/query/header activation and no process-environment read. This local gate is not represented as future staging activation.

The collector accepts only stage/event calls, a monotonic clock and an optional caller-provided sink. It does not receive a Request, Response, database object, identity, cookie or payload. It generates a fresh 128-bit random, 32-character lowercase hexadecimal correlation value internally; no incoming identifier, UUID, timestamp or build string is accepted. There is no deployed subscriber, output endpoint, console call, stream interception or header mutation.

| Output | Boundary and meaning |
|---|---|
| `Server-Timing` | Returned header-field snapshot when caller invokes `response()`. It contains `response` and only phases completed by then. No guessed EOF or render duration. Descriptions are omitted. |
| `X-Bloomops-Timing` | The fresh opaque ID; exactly matches the returned/emitted completion record's `id`. |
| `identity`, `membership`, `actor`, `home`, `systems` | Existing `bloomops.navigation` vocabulary. Home/Systems labels are allowed only on their own coarse route. Existing `identity` includes canonical joined session/user **and active membership/workspace** work; it cannot separately attribute the joined operation. `membership` is the existing fallback read only. `actor` measures current actor preparation. Home/Systems are inclusive projection spans, not SQL CPU. |
| `wait1` … `wait8` | Reserved fixed native-invocation ordinals, start-to-awaited-completion wall time if a future adapter supplies those boundaries. No native D1 adapter is installed in this fallback. Separate waits and their offsets can represent timezone-dependent sequential stages; the collector does not infer causality or query categories. |
| `first`, `total` | Request-relative caller-observed first chunk and normal stream EOF respectively. Only explicit normal completion reports `total`. No claim of browser arrival, network EOF, CPU or time after stream completion. The fallback owns no actual stream. |
| `elapsed` | Caller-observed cancellation/error termination; not successful EOF. |
| `unattributed` | Normal completion minus the **union** of completed measured intervals, including inclusive phases. Not D1 execution, CPU, or exclusive React render time. Omitted when a known span is malformed or unfinished. Unmeasured work can remain here. |

Final record keys are exactly `event`, `id`, `route`, `metrics`, `spans`. Events: `complete`, `cancel`, `error`; routes: `home`, `clients`, `work`, `social`, `systems`, `team`, `ads`. `spans` contains only allowlisted phase names with numeric `start` and `duration` relative to the request origin, preserving overlap and sequencing. Metric names are exactly those in the table. Records and nested snapshots are immutable. There are at most 13 phase slots and one completion record; no customer row/byte counts, bind counts, arbitrary labels, errors or build text. Clock values must be finite, nonnegative, monotonic and within 120,000 ms of start; output rounds to 0.1 ms. Backward/broken clocks drop subsequent diagnostics. Duplicate/mismatched spans are omitted instead of inventing timing. Sink throws/rejections are swallowed without logging their contents. No task changes cache-control, Vary, auth reads or authorization decisions.

Header values cannot incorporate later stream measurements because a Response can be sent before its body completes, as described by [Workers Streams](https://developers.cloudflare.com/workers/runtime-apis/streams/). A future adapter must keep the initial snapshot unchanged and send final records to an approved sink. The fallback's `finish()` requires a caller's honest lifecycle signal; a primitive unit test is not proof that real cancellation/backpressure or workerd clock behavior is correct.

## Verification in this task

Node v26.8.2; dependencies installed by `npm ci` from the unchanged lockfile. Counts overlap.

| Check | Actual result |
|---|---|
| Focused primitive tests | 30/30, also included in final full suite |
| Full `npm test` | **4,816/4,816**, zero failures/cancellations/skips/todos, final run after phase-offset change |
| Existing timing, current-session, membership, shell, authorization, route and issued-session regressions | Passed in full suite, including PERF1/2/3 and hardening config tests |
| Next build | Passed, including available lint/type checks |
| OpenNext/Cloudflare build | Passed; generated Worker remains ordinary entrypoint |
| Native Systems smoke | 23/23; 240 assignments, five statements in two batches, max 65 binds / 13,548 SQL bytes |
| Native Home/projections smoke | 34/34; 240 assignments, ten Home statements in two batches, max 64 binds / 13,047 SQL bytes |
| Local zero-to-current | 22/22; first migration plus repeat no-op; schema and both ledgers identical; disposable local resources cleaned |
| Syntax and whitespace | All three new executable files parse; `git diff --check` passes |
| Deployment exclusion | No `X-Bloomops-Timing` string in built Next/OpenNext JS; no deployed source imports the primitive; original product/config source unchanged |
| Built Worker auth/stream integration smoke | Not run: this fallback does not participate in that boundary. Required when a wrapper is authorized and implemented. |
| Signed-in staging | Not run; accepted Stage A was not repeated; no live attribution claimed |

The initial full-suite attempt failed five inherited packaged-skill tests with `spawnSync python ENOENT`. A symlink to the macOS Python launcher then failed with `xcode-select: Failed to locate 'python'` (status 72). Pointing a workspace-only `python` alias to the bundled Python interpreter resolved this. No repository source, dependency or system configuration was changed for it. The final command used that local PATH alias.

Tests explicitly show no timing data on default/staging/production options, allowlisted output, independent random IDs, frozen headers with matching later record, late and overlapping spans, finite/ordered bounds, malformed/incomplete omissions, fixed unknown-route behavior, original status/redirect/body/no-store/cookies retained, synchronous/asynchronous sink failure isolation, and real issued-cookie membership suspension followed by session deletion taking effect on the next request. Existing full regressions cover signature/expiry/refresh/user-session binding, capability and assignment removal, tenant/existence hiding, contact unlinking and visibility. No cross-request authorization or session-result cache was introduced.

## Provisional local overhead, not deployment acceptance

Run `node scripts/server-timing-overhead.mjs` from the repository. It reuses the operational fixture construction from the existing navigation fixture generator, with real migrated **in-memory SQLite** and real Better Auth issued Owner sessions through the memory mailer. Database counts are asserted: representative 50 Clients / 100 Projects / 300 Milestones / 1,000 Actions / 300 Deliverables / 250 Content Items / 200 File metadata rows / 100 Project assignments; stress is exactly 3× each. Five role memberships exist; only one Owner session per dataset is needed here (the browser fixture normally issues four). No external HTTP, mail or remote database is used.

For Home and Systems at each scale, 44 paired cycles alternate off/on order; discard four warmup pairs, retain **40 samples per mode/route/scale** (320 retained, 352 total operations). Timing includes primitive creation, current session/actor, actual authorized projection completion, header-field formatting, no-op sink and subscriber cleanup. Existing fixed navigation stage events are reused only in enabled samples. The sink does no I/O. No build or other owned check ran during the final measurement. This does not include a D1 invocation adapter, RSC rendering/serialization, Worker stream wrapper, cancellation/backpressure, browser completion, compression or real event-delivery cost. Header timing here is taken at data readiness, **not** OpenNext's earlier streaming header boundary.

Milliseconds: median (min–max), nearest-rank p95. Additional bytes are uncompressed header-field lines, not HTTP wire bytes; off has zero additional fields.

| Scale / route | Off completion | On completion | Median delta | On field bytes |
|---|---:|---:|---:|---:|
| representative / home | 11.19 (10.747–12.868); p95 12.532 | 11.24 (10.707–12.927); p95 12.562 | 0.050 | 134–135 |
| representative / systems | 6.108 (5.678–7.888); p95 7.65 | 6.148 (5.741–8.187); p95 7.724 | 0.040 | 136–136 |
| stress / home | 19.08 (18.505–21.764); p95 21.044 | 19.137 (18.69–21.002); p95 20.907 | 0.057 | 135–135 |
| stress / systems | 8.737 (8.238–11.094); p95 10.447 | 8.869 (8.302–10.551); p95 10.291 | 0.132 | 136–137 |

The small 0.040–0.132 ms median differences provide no material-regression signal for this primitive in these paired local workloads; they are not a staging overhead pass or a precise causal estimate. The enabled ranges overlap off ranges. Native/RSC/browser overhead at representative and exact-3× scale remains **unmeasured and required before a complete candidate can be called audit-ready**. Production currently incurs no added request path or header bytes because the primitive is not imported; no measured deployed-off latency claim is made. Numeric raw samples, summaries, fixture counts and source hashes are retained in the evidence file.

## Exact next decision and gate

Authorize a separate follow-up to:

1. Change the deployment entrypoint to a reviewed custom Worker that delegates the generated OpenNext handler, and gate diagnostics on an explicit server-controlled staging opt-in plus the existing staging environment/origin. Preserve default/production no-op behavior, protected no-store and every auth decision. This requires the currently prohibited Worker configuration change. The wrapper must filter exact top-level protected navigation requests, reuse the current stage channel with per-request isolation, observe native invocation ordinals without SQL/values, and test real response/first-chunk/EOF/cancel/error behavior without buffering the body.
2. Select and authorize a **sanitized completion-event destination**, its retention and disable/removal procedure. No existing configured sink satisfies that contract. An environment/binding/resource change may be needed. Do not equate enabling ordinary Worker logs, real-time tail, query-string redaction or invocation-log suppression with proof that token-bearing paths, headers and arbitrary runtime errors cannot be retained. Any selected service must be audited for its entire event envelope before enabling it. Keep the present telemetry protections until that decision is concrete.

That is an authorization request for bounded integration work, not for merge or deployment. If those changes remain prohibited, keep this fallback inactive; live phase attribution stays unresolved. No PR is opened because the primary staging candidate is incomplete.

After the approved integration is implemented: repeat privacy/failure/revocation tests against the actual built Worker, real off/on representative/exact-3× browser overhead and payload checks, then independent exact-head audit. Only after separately authorized merge, successful Deploy staging **and** Verify zero-to-current on the exact resulting SHA, verify `/api/version` and run signed-in warm navigation measurements. Match each browser-visible opaque ID to sanitized server spans and normal stream completion. Compare auth/joined membership, actor, separate Home/Systems invocation/projection phases, response availability, first chunk/EOF and residual against the single RSC body EOF; report unavailable boundaries and missing events explicitly. Do not subtract unsynchronized server/browser clocks or label residual wall time as CPU/network proof. PERF3/PERF4 stay OPEN and D2 BLOCKED until the live exit gate is actually satisfied.

No schema, migration, dependency, lockfile, config, workflow, binding, secret, environment-setting, placement, DNS or infrastructure changes. No merge, deployment, production change, staging-data mutation, external message/real email, speculative product optimization or D2 work occurred.
