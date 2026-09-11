# Final staging Smart Placement experiment — 2026-09-11

Historical evidence preserved from documentation-only commit `c99965f31f143ad48201fe6223b6f6397a12c12e`. Neither the placement experiment/revert commits nor PERF4 diagnostic runtime are included in the clean PR. See [PERFORMANCE_INTEGRATION.md](PERFORMANCE_INTEGRATION.md) for its exact scope and verification. No new experiment was run during integration preparation.

## Decision: REVERT; stop this performance phase

Smart Placement did not establish a meaningful, repeatable improvement beyond the accepted Home baseline. It was reverted; application candidate `68580d7fdff779ec9cdfec7f67381af9cf5e7724` remains preferred and was restored to staging. No further diagnostic or optimization pass is proposed. The earlier performance targets are not declared met. D2 remains blocked.

## Isolation and sole change

Before editing, Wrangler 4.129.0 resolved development, staging and production to distinct Worker/D1/R2 names. Staging used `bloomops-staging`, D1 `bloomops-staging`, and `bloomops-files-staging`. Production remained `bloomops-production` with its separate, unprovisioned D1 placeholder. Neither root nor production had placement configured. The staging live bindings matched its configuration. Static assets use assets-first routing (`run_worker_first: false`).

Read-only `wrangler d1 info bloomops-staging --env staging --json` reported APAC, 77 tables, 1,499,136 bytes and read replication disabled. APAC is the available regional information, not an exact database city or measured network latency.

Branch `perf/staging-smart-placement` starts directly at `68580d7`. Experiment commit `1e427324034ad0d8d37c8429e0646764edb1321a` adds exactly one line to `wrangler.jsonc`:

```json
"env": {
  "staging": {
    "placement": { "mode": "smart" }
  }
}
```

This excerpt identifies the location, not a replacement for the existing staging object. An exact parsed comparison proved that deleting this one field reproduces the baseline configuration. Wrangler's resolved staging placement was smart; resolved development and production placement remained absent. No application, SQL, auth, schema, dependency, instrumentation or replication change was made.

The Cloudflare and Wrangler skills informed the resolved-environment checks, temporary external type generation and staging dry-run. The web-performance skill supplied browser verification, narrowed to the user's warm click-to-visible task: no trace, Lighthouse run or new telemetry.

## Validation, deployment and placement readiness

- 21/21 existing configuration/privacy tests passed before the experiment and after its revert.
- Staging type generation succeeded to a temporary path outside the repository.
- Both experiment and restoration Cloudflare builds passed, including Next compilation and available lint/type checks.
- Both staging deployment dry-runs passed. The unchanged production missing-origin warning is intentional fail-closed configuration; production was never deployed.
- The full application suite was not rerun for this configuration-only experiment. The accepted application already passed 4,834 tests; no new full-suite claim is made.
- Experiment Worker version: `92aa00d6-877a-4967-90b8-52265e3fd3f8`.
- Experiment `/api/version`: `1e42732`, branch `perf/staging-smart-placement`, build time `2026-09-11T13:37:32.283Z`, verified in existing signed-in Chrome before and after measurement.
- Cloudflare's read-only service API reported placement `smart`, status `SUCCESS`, last analyzed `2026-09-11T13:40:31.378371Z`. Confirmed before retained clicks at 13:40:42 UTC and afterward at 13:41:08 UTC. Wrangler's existing credential was used internally for that API GET; no token was printed or saved.

[Cloudflare's placement documentation](https://developers.cloudflare.com/workers/configuration/placement/) says analysis can take up to 15 minutes and placement may remain local when forwarding would not help. Here analysis completed within roughly a minute, so there was no need to wait the full allowance. SUCCESS establishes analysis readiness, not proof that every measured request ran remotely. No request headers were added or logged to determine per-click placement.

## Signed-in browser evidence

Same existing authenticated Windows Chrome session, visible foreground, 1920×855, no artificial throttling. A fresh pre-change run was collected in addition to the supplied historical baseline. Before and after each use one discarded Home/Systems/Ads warmup, followed by five rounds of Home → Systems → Home → Ads, retaining exactly ten Home and five of each control. Fifteen additional post-deploy settling clicks were declared discarded before capture. No retained outlier was excluded.

Each measurement starts immediately before clicking the actual visible navigation link and ends at the destination pathname and visible final main heading; Home also requires the completed `.bo-home` container. RSC timing is secondary and read after two animation frames, not substituted for visible completion. One RSC timing in each retained run was unavailable and remains null. The initial pre-change attempt lost its execution context on navigation before producing measurements; it was repeated after browser readiness. All completed samples are in [sanitized browser evidence](evidence/SMART_PLACEMENT_browser.json).

| Route | Supplied latest baseline median / range ms | Fresh placement-off median / range ms | Smart Placement median / range ms |
|---|---|---|---|
| Home (10) | 672.9 / 634.4–938.4 | 791.15 / 655.7–1145.3 | **681.2 / 654.8–775.6** |
| Systems (5) | 618.8 / 616.5–626.8 | 640.0 / 606.1–711.8 | **623.4 / 605.4–635.2** |
| Ads (5) | 410.5 / 401.2–412.7 | 405.6 / 394.6–412.3 | **403.7 / 393.5–590.4** |

Earlier optimized control medians were Systems 587.8 ms and Ads 374.8 ms. Smart Placement is 6.1% and 7.7% above those, respectively; against the latest controls it is +0.7% and −1.7%. There is no clear material median control regression against the latest run, but the retained Ads outlier broadens its range.

Home is **1.2% slower than the accepted 672.9 ms baseline**, nowhere near 550–575 ms. It is 13.9% faster than today's noisier immediate pre-change median. That conflicting comparison is reported, not discarded: a sequential off/on run alone cannot separate placement benefit from the observed temporal variability. It does not establish a repeatable additional reduction beyond the accepted optimized baseline, so the conservative user-defined KEEP condition is not satisfied. All ten Smart Placement Home samples were below 800 ms, but the historical baseline comparison still does not demonstrate a worthwhile additional median gain.

## Reversion and handoff

The configuration change was reverted in `6804aed`; its tree exactly matches application `68580d7`. Restoration was built from a clean detached checkout of the exact application SHA, not from the experiment or a documentation HEAD. Staging alone was redeployed with the original configuration; the final version and placement verification are recorded in the browser evidence and BUILD_STATE.

No production deployment, migrations, D1 read replication, PR, merge, D2, further optimization, application instrumentation, Worker Logs, invocation logs, traces or tailing. The real signed-in staging session and membership were preserved. Browser error/warning console check was empty. The documentation/evidence commit is separate from the restored deployed application.
