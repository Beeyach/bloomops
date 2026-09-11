# PERF4 Live Evidence Independent Audit

## Recommended execution configuration

- Model: GPT-5.6 Sol
- Reasoning: High
- Surface: a fresh independent ChatGPT/Codex review session, not the Astra implementation session
- Repository: `Beeyach/bloomops`

You are performing an **independent evidence review only**. Do not change code, deploy anything, create a PR, merge, enable D2, alter auth, enable logs/traces/tailing, or implement an optimization.

## Exact objects to audit

Deployed application candidate:

`6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`

Evidence-only commit:

`4ae5635498088580015e31a83dc6d9f9d4be1e03`

Historical PERF3 application baseline:

`2b892275abf0856dff10f31d49b2ff2da57acd5f`

Read at the evidence commit:

- `docs/BUILD_STATE.md`
- `docs/PERF4_RESULTS.md`
- `docs/evidence/PERF4_staging_correlation_live.json`

Also inspect the relevant PERF4 runtime/instrumentation source at exact deployed application SHA `6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`, especially:

- `worker.mjs`
- `lib/bloomops/perf4-worker.mjs`
- `lib/bloomops/server-timing.mjs`
- `wrangler.jsonc`
- `next.config.js`

Use repository history/diffs as needed to verify that evidence commit `4ae563...` is documentation/evidence only and was not the deployed application.

## Audit goals

Independently determine whether the live PERF4 handoff is internally consistent and whether its conclusions are actually supported by the captured evidence.

### 1. Provenance

Verify:

- deployed source identity is exact full SHA `6da1c246...`
- `/api/version` short SHA `6da1c24` is consistent with repository build behavior
- branch value `perf/perf4-staging-timing-integration` is expected
- evidence commit `4ae563...` is later documentation/evidence only
- there is no evidence that runtime/source was changed after the authorized candidate for the capture

### 2. Browser sample integrity

Audit the 7 discarded warmups and 21 retained samples.

Verify from the artifact:

- exactly 3 retained navigations per each of 7 routes
- retained routes are Home, Clients, Work, Social, Systems, Team, Ads
- statuses/completion conditions are valid
- one root RSC request per retained navigation
- no hidden redirect/prefetch/client waterfall invalidates interpretation
- reported TTFB, RSC EOF, visible, settled medians/ranges are correctly calculated from raw rows
- overall medians/p95/max values are numerically correct
- the deliberate 100 ms settlement guard is not being misrepresented as rendering cost

### 3. Analytics Engine integrity

Verify:

- 21 retained opaque IDs
- exactly 63 retained records
- one `metrics-v1`, one `spans-a-v1`, and one `spans-b-v1` for each retained ID
- zero missing/duplicate/incomplete retained triplets
- fixed schema decoding matches source implementation
- route and lifecycle enums are expected
- no double counting of inclusive Home/Systems projection spans
- server phase medians and representative interval descriptions in `PERF4_RESULTS.md` match the underlying raw evidence

### 4. Privacy and auth claims

Verify that the stored evidence schema is consistent with the source privacy contract and that the artifact contains no unexpected sensitive fields.

Check whether the handoff correctly limits its auth claim to:

- existing signed-in session working before/after capture
- local active-workerd revocation already proven historically
- deployed remote revocation still unproven

Do not demand a destructive remote auth mutation if no disposable staging identity exists.

### 5. Diagnosis

Challenge the stated conclusion:

> The dominant measured deployed server intervals are sequential native D1 binding waits, while the current evidence does not distinguish D1 service transport / placement from internal query execution sufficiently to select the smallest exact optimization.

Determine whether that is the narrowest defensible conclusion.

Specifically answer:

- Is browser reconciliation/rendering reasonably ruled out as the principal delay?
- Is a serial D1 round-trip hypothesis supported?
- Does the evidence identify specific SQL/query execution as the cause, or only D1 wait intervals?
- Does the evidence justify D2? It should remain BLOCKED unless live evidence specifically supports it.
- Is there any smaller, safer optimization already justified by the evidence, or is another bounded diagnostic necessary first?

### 6. Historical comparison

Review the PERF3 comparison carefully.

Confirm that the new run is not incorrectly presented as a controlled performance improvement/regression experiment. Check route-level historical deltas where raw comparable data exists, and reject any unsupported overall historical p95 comparison.

## Required final output

Return a compact independent audit with these sections:

1. **Verdict**: PASS / PASS WITH CAVEATS / FAIL
2. **Provenance**
3. **Evidence integrity**
4. **What the live data actually proves**
5. **What it does not prove**
6. **D2 decision**
7. **Smallest evidence-backed next step**
8. **Any correction required in BUILD_STATE / PERF4_RESULTS / evidence artifact**

If the evidence is internally sound, do **not** invent a code change. Recommend the smallest bounded experiment needed to distinguish database transport/placement latency from query execution latency before implementation.

Do not modify the repository. Stop after the audit report.