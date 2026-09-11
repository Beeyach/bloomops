# Accepted performance integration

## Post-merge closure (2026-09-11)

[PR #36](https://github.com/Beeyach/bloomops/pull/36) merged as **`cb2ef0bea2900a46583e86c75840e8ba6639d663`**. Automatic [Deploy staging 34607488524](https://github.com/Beeyach/bloomops/actions/runs/34607488524) and [Verify zero-to-current migration 34607488607](https://github.com/Beeyach/bloomops/actions/runs/34607488607) both succeeded on that exact SHA. Staging `/api/version` reports `cb2ef0b`, branch `main`; basic existing-session Home/Systems/sidebar navigation smoke passed with no browser errors/warnings. No new performance measurements were taken.

The performance phase is **closed**, despite the approximately 500 ms target not being fully met. Additional performance work is deliberately deferred; Smart Placement remains rejected/reverted. The verified deployed application is now the main merge SHA above, not historical candidate `68580d7`. Remaining sections preserve the pre-merge integration record; their unmerged/deployment restrictions describe that earlier handoff and are superseded by this closure. This follow-up changes documentation only. D2 is only the recommended next scoping topic and has not begun.

## Scope and outcome

This is integration preparation only. No further performance measurements, diagnostics, optimization or deployment were performed. Additional performance work is deliberately deferred; the approximately 500 ms median target was not fully reached. D2 is not included. The PR must remain unmerged.

Historical signed-in staging medians: Home **821.9 → 700.8 → 672.9 ms** and Systems **775.1 → 587.8 ms**. Later Systems controls were 618.8 ms on the accepted Home candidate, not a new claim that every subsequent run reproduced 587.8 ms. Home and ordinary unfiltered Systems reduce serial D1 waits **3 → 2**: fresh identity/membership, then one projection batch. Home retains ten statements and Systems five. Valid legacy timezone aliases retain the additional exact scoped fallback batch; selected-ID Systems validation remains sequenced. Fresh authorization is neither deferred nor cached across requests.

Home's repeated JSON timezone virtual-table scans were replaced by scalar lookup. Its Overdue, Today, attention Project and forward Deliverable plans remove 1/1/10/1 `json_each` scan nodes. No schema/index change was made. Smart Placement was evaluated, did not demonstrate a repeatable additional improvement, and was reverted. It is absent from this PR.

## History and exact provenance

Repository default/base branch is `main`, fetched at `2b892275abf0856dff10f31d49b2ff2da57acd5f`. The original PERF4 deployed diagnostic baseline was `6da1c2467ae0a4ae31bcefcd1ca16482c7f5bae5`. Its two direct optimization descendants are the accepted source changes:

| Original deployed application commit | Clean integration commit | Purpose |
|---|---|---|
| `137773bc2b70b322694c33a0c756714c00003833` | `008fa500ed84dea15fecd4726271ac3aab10ba9a` | Home/Systems projection batch reduction, safe formatter reuse and fallback checks |
| `68580d7fdff779ec9cdfec7f67381af9cf5e7724` | `4f8af586aff6eceec9dab7902d2ea37c64fd082d` | Home scalar timezone expression, regression coverage and synthetic SQL evidence |

Branch: `perf/accepted-navigation-integration`. Both changes were cherry-picked with original-source trailers directly onto `origin/main`, without conflict resolution or runtime edits. All four changed application modules and their changed tests/supporting scripts are byte-identical to accepted `68580d7`. The integration commit has a different SHA because it excludes the intervening PERF4 diagnostic history. It is **not** claimed to have been deployed or browser-measured.

The accepted, unchanged deployed application remains **`68580d7fdff779ec9cdfec7f67381af9cf5e7724`**. Later documentation commits are not deployed application commits. Original documentation-only sources preserved here are:

- `88b56ed6661dd0394aa59cab29ce81067f031458`: [round-trip implementation and staging samples](PERF_ROUNDTRIP_RESULTS.md).
- `10664003c39af8c0343a9348d09c9a2bab22a0ed`: [Home query report](HOME_QUERY_RESULTS.md) and [browser samples](evidence/HOME_QUERY_browser.json).
- `c99965f31f143ad48201fe6223b6f6397a12c12e`: [rejected placement experiment](SMART_PLACEMENT_RESULTS.md) and [browser samples](evidence/SMART_PLACEMENT_browser.json).

These source documentation commits are not cherry-picked ancestors of the PR; their selected sanitized content is preserved in a separate documentation-only integration commit. Original experiment `1e427324034ad0d8d37c8429e0646764edb1321a` and revert `6804aed4431c1279ff36b6405e3afe31a4737398` are not PR ancestors either. The original branches are preserved.

## Runtime and artifact boundary

Opening the original optimization history against main would have pulled in PERF4 diagnostic prerequisites. The clean branch deliberately excludes:

- custom `worker.mjs` and `lib/bloomops/perf4-worker.mjs` response/D1 instrumentation;
- `lib/bloomops/server-timing.mjs`, its diagnostic tests and active diagnostic fixture/runner scripts;
- staging `BLOOMOPS_PERF4_TIMING` opt-in and Analytics Engine dataset binding;
- PERF4 execution/transport prompts, active-runtime trace-like evidence and browser transport scaffolding;
- Smart Placement experiment and revert commits.

`wrangler.jsonc` is byte-identical to main: generated `.open-next/worker.js` entrypoint, no placement in any environment, no PERF4 opt-in or Analytics Engine bindings, and ordinary logs/invocation logs/traces disabled. Workflows, dependencies, schema and migrations are unchanged. Existing pre-PERF4 `navigation-timing.mjs` coarse markers are unchanged main code; this PR adds no deployed subscriber. The four accepted application modules do not depend on the excluded diagnostic modules.

Only four runtime modules change: `action-values.mjs`, `actions.mjs`, `systems.mjs`, `work-projections.mjs`. Supporting changes are the existing Home/Systems disposable native D1 smoke tests, two Home date-lookup regression tests, and the synthetic local-only query-plan reproduction script. That script has no live connection, browser harness, auth/session access or remote sink; it was inspected but not rerun for this handoff. Its SQL evidence has placeholders, not live binds or business rows. Retained browser evidence contains sanitized timings/provenance only, not cookies, storage state, raw network headers/bodies, screenshots, HARs, real business contents or credentials.

Tracked-file inventory, sensitive-artifact filename checks and high-confidence credential-pattern checks passed, alongside review of the exact diff and preserved evidence. No secrets or experimental configuration were found in the PR. There is no claim that inherited repository history was exhaustively secret-scanned.

## Final verification

Run against the clean integration application at `4f8af586aff6eceec9dab7902d2ea37c64fd082d`; subsequent edits are documentation/evidence only:

- Focused Home/projection/Action/navigation/Systems/configuration tests: **163/163 passed**.
- Full `npm test`: **4,788/4,788 passed**, zero failures/skips. Main has 4,786 tests; two accepted regression tests are added. The prior diagnostic candidate's 4,834 count included 46 PERF4-only tests intentionally excluded here, not disabled or skipped.
- Disposable native workerd/D1 Home: **40/40**, ten statements/one batch, max 64 binds; Systems: **24/24**, five statements/one batch, max 65 binds. These retain authorization/revocation and timezone-fallback checks.
- `npm run cf:build`: passed, including Next compilation and available lint/type validation. Build stamped the actual integration SHA prefix `4f8af58`; no deployment was run.
- Wrangler 4.129.0 staging type generation to an external temporary file: passed.
- Staging `wrangler deploy --dry-run`: passed; no upload/deployment.
- Parsed and Wrangler-resolved development/staging/production checks: placement absent, generated Worker entrypoint, no PERF4 opt-in/dataset, telemetry disabled. Production's intentionally missing origin warning remains unchanged.
- Changed JavaScript syntax, JSON evidence parsing, exact accepted-code comparison and `git diff --check`: passed.

The existing full suite requires a `python` executable for inherited packaging checks. A temporary directory outside the repository supplied a symlink to installed `python3` in PATH; it was removed after the run. No environment/dependency workaround was committed.

Cloudflare/Wrangler skill checks informed the resolved configuration and binding validation. The Worker review was kept to integration safety; the repository's explicit no-logs/no-new-instrumentation policy takes precedence over generic observability guidance. No browser or staging access was needed for this integration review.
