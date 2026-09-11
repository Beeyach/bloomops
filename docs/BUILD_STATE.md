# BloomOps Build State

## Current Release

Release D: Systems Delivery. Release C is closed for forward development on verified `main` baseline `1638e3ed9fd33c3725aa3449935b08335b73f1a9`, including the audited/merged C7 product and two workflow-only follow-ups making both post-merge gates automatic. Read-only GitHub checks confirmed [Deploy staging 34478365157](https://github.com/Beeyach/bloomops/actions/runs/34478365157) and [Verify zero-to-current migration 34478365145](https://github.com/Beeyach/bloomops/actions/runs/34478365145) succeeded on that exact SHA. Release B remains closed on `c6509aa395a5db58310e2a0ae22a8a808082f77b`; Release A on `3deed08d8db2a92fcf4dc29a6a879a9945260049`.

## Current Phase

**D2 Slice 2A — binding storage — is implemented on `feat/d2-slice2a-binding-storage`, from exact canonical main `77bbb6b3ea7dff0b873e6fa72c583027159942b1` (merged Slice 1 / PR #38).** Independent audit of `7ba4fc1e1c1fd8f56efae754f7bd82c534b1b1fc` returned **PASS WITH NONBLOCKING NOTES**. The authorized follow-up adds only a fail-closed compatibility regression and state documentation, then pushes/opens a Slice 2A-only PR against `main`; **leave it unmerged**. No deployment; 2B and later work has not begun. See [D2_SLICE2A.md](phases/D2_SLICE2A.md) for the contract, adversarial matrix and verification. Older no-push/PR and audit-pending statements below describe the implementation handoff.

**Performance remains CLOSED.** PR #36's accepted application is `cb2ef0bea2900a46583e86c75840e8ba6639d663`; its exact-SHA gates and staging smoke are recorded below. Smart Placement was rejected/reverted, the approximately 500 ms target was not fully met, and additional performance work remains deliberately deferred.

## D2 Slice 2A binding storage (2026-09-11)

- Before editing, fetched refs confirmed exact main `77bbb6b3ea7dff0b873e6fa72c583027159942b1`. Its [Deploy staging 34617425161](https://github.com/Beeyach/bloomops/actions/runs/34617425161) and [Verify zero-to-current 34617425293](https://github.com/Beeyach/bloomops/actions/runs/34617425293) jobs succeeded; job logs identify the exact SHA. The connected GitHub integration supplied read-only verification because the local CLI sign-in was unavailable.
- Migration `0018_d2_slice2a_binding_storage.sql`: exactly `service_type_blueprint_bindings`, five restricted same-tenant FKs (including workspace), four explicit indexes, six CHECKs and four incoming/outgoing write guards. Generated snapshot leaves all 41 prior table definitions unchanged; there are now 42 domain tables and 19 ordered domain migrations.
- Binding identity/creator/creation time are immutable; revision starts at 1 and increments exactly once per executed UPDATE without safe-integer overflow. Stored configuration permits inactive/unpublished Systems Templates. Historical creator revocation neither invalidates configuration nor grants authority. Enabled and disabled bindings protect Template ID/workspace/kind/slug; name/description/active remain editable. Explicit binding deletion is permitted, with no tombstone or provisioning.
- Verification: **206 focused / 598 affected / 5,102 full-suite tests passed**, zero failures/skips; all 34 adversarial requirements covered with recursive triggers OFF and ON. The local zero-to-current verifier passed 22 checks and an identical-schema/ledgers second pass (60 inherited + 19 domain migrations). `npm run cf:build` passed, including Next build/lint/type validation; syntax and diff hygiene passed. The full suite reused only the external temporary Python 3 PATH wrapper, with no committed workaround. The documented conservative implicit-rowid collision edge and future writer authorization/receipt boundaries require independent review.
- No receipt or generated-item mapping, Project/service eligibility wiring, API, UI, default initialization, generation transaction, provider call, Systems Version protection or later-slice implementation. No configuration/dependency/workflow changes. No remote migration or deployment; performance remains closed. Next step is independent 2A audit, not 2B implementation.

## D2 Slice 1 audit follow-up (2026-09-11)

- Independent audit verdict on `c255ed62718d6a4e3a6efea6f4c8197d6d059c00`: **PASS WITH NONBLOCKING NOTES**. A separate cleanup commit addresses only the three notes: sanitize exotic reflection/shape failures; reject U+0085/U+2028/U+2029 in labels; commit deterministic oversized-definition/plan regression fixtures.
- Reflection catches are confined to shape inspection. Callers retain existing sanitized domain reasons, and unrelated encoding/compiler failures propagate. The supported interface remains plain JSON data, not executable objects or a JavaScript sandbox.
- Verification: **180 focused/reused-helper tests and 4,896 full-suite tests passed**, zero failures/skips; focused coverage includes all **16,383** nonempty selections. `npm run build`, changed-module syntax checks and `git diff --check` passed. Full tests reused the external PATH-only Python 3 wrapper required by inherited packaged-skill tests; no dependency or configuration changes.
- The compiler, default manifest and hand-authored golden plans are unchanged from the audited candidate. All-selected output remains **13 Milestones / 14 Actions / 8 Deliverables / 20 edges**; **49** remains the generic edge ceiling. No bounds, versions, keys or selection/dependency semantics changed.
- The follow-up prompt is read from its remote ref, not changed or included in the implementation branch. Prepare/push this branch and open its PR against `main`; **leave it unmerged**. Provenance/deletion remains a Slice 2 design gate, exact committed-receipt proof remains a Slice 4 gate, and no later slice is authorized.

## D2 Slice 1 implementation (2026-09-11)

- Strict definition/compiler version 1, immutable in-code GHL default, pure deterministic selection and plan compilation. No runtime IDs, dates, assignments, credentials, execution instructions or authority are accepted. No Project/service eligibility, including a magic Service Type slug, is encoded.
- The approved 14 components produce at most 13 Milestones, 14 Actions and 8 Deliverables; Email/SMS share one Milestone. The full default has 20 dependency edges. Empty dependency groups are removed after selection and adjacent surviving groups are connected, keeping build Actions parallel. Canonical initial values are Upcoming / To Do / Planned, internal visibility and normal Action priority.
- Hand-authored golden fixtures cover minimal, representative, all-component, reordered and Email/SMS plans plus malformed/duplicate/dangling/cyclic definitions. Exhaustive tests cover all 16,383 nonempty selections. Existing canonical JSON/SHA-256 helpers are reused unchanged.
- Verification: **170 focused/reused-helper tests passed; 4,886 full-suite tests passed**, no failures or skips. `npm run build` passed including Next's lint/type validation; new module/fixture syntax checks and diff hygiene passed. The host lacks `python`; the initial broad run hit inherited packaged-skill tests requiring it. The successful full rerun used a temporary external `python` → `/usr/bin/python3` wrapper, following prior phases, with no repository dependency or test changes. Commands: `node --test tests/bloomops-systems-blueprint-compiler.test.mjs tests/bloomops-onboarding-compiler.test.mjs tests/bloomops-onboarding-templates.test.mjs`; full `node --test tests/**/*.test.mjs` with that PATH-only wrapper.
- Scope: no schema/migrations, database writer, provisioning, generation transaction, API, UI, dependency/configuration changes, provider calls or D3–D7 implementation. No remote mutation or deployment. This slice is not a completed or authorized runtime generation engine.
- Required later design gates: trusted canonical Project/service-to-blueprint relationship (never display-name/magic-slug matching); provenance survival under future live-record deletion without accidental cascade/history loss or an unapproved permanent no-delete FK policy; exact authorized committed-receipt proof for success/replay, with receipt-gated writes and no zero-row success or integrity auto-repair. **Do not begin Slice 2 without separate authorization and the deletion/provenance design decision.**

## Post-merge performance closure (2026-09-11)

- [Deploy staging — 34607488524](https://github.com/Beeyach/bloomops/actions/runs/34607488524): automatic `push` run on `main`, exact SHA `cb2ef0bea2900a46583e86c75840e8ba6639d663`, completed **success**.
- [Verify zero-to-current migration — 34607488607](https://github.com/Beeyach/bloomops/actions/runs/34607488607): automatic `push` run on the same exact SHA, completed **success**, including the disposable create/migrate twice/verify/delete job. All job steps succeeded.
- Staging `/api/version`: HTTP 200, `sha: cb2ef0b`, `branch: main`, `builtAt: 2026-09-11T14:00:29.395Z`, confirmed publicly and in the existing signed-in Windows Chrome session. The response's inherited `environment: Production` display label accompanies the main build; the verified origin is the staging Worker, not a production deployment.
- Basic signed-in functional smoke only: Home renders its completed empty state; Systems renders its filters and completed empty state; actual sidebar Home → Systems → Home navigation succeeds. No visible error boundary or browser console errors/warnings. No timings, profiles, benchmarks, session changes or business-data mutations were performed.
- Accepted optimizations remain Home/Systems **3 → 2 ordinary serial D1 waits** and Home scalar JSON timezone lookup with the repeated scans removed, preserving fresh authorization and exact legacy-zone fallback. Historical medians remain Home **821.9 → 672.9 ms**, Systems **775.1 → 587.8 ms**; these were not remeasured for closure. Smart Placement and experimental PERF4 runtime were excluded from integration.

`68580d7fdff779ec9cdfec7f67381af9cf5e7724` is the historical accepted staging candidate; **`cb2ef0bea2900a46583e86c75840e8ba6639d663` is now the verified merged/deployed application**. This follow-up is documentation/state only; it does not change or deploy application code. Older audit-pending, unmerged, performance-gate and staging-SHA statements below are historical and superseded by this closure.

Release D remains open. D1 Systems Foundation is merged; remaining product phases are D2 GHL Build Blueprint, D3 Kajabi Build Blueprint, D4 Systems Execution + QA, D5 Launch + Handoff, D6 Systems Client Experience + Operations, and D7 release hardening. Recommend scoping **D2** next: selected-component generation into canonical Milestones/Actions/Deliverables, immutable version provenance, authorization and idempotent/concurrent retry guarantees. Do not implement D2 or expand into later phases yet. See [RELEASE_D.md](RELEASE_D.md).

## Accepted performance integration (2026-09-11)

Historical pre-merge integration verification follows; current merge/deployment/phase status is recorded above.

Read [PERFORMANCE_INTEGRATION.md](PERFORMANCE_INTEGRATION.md) for exact commit mappings, artifact review, historical evidence and final checks. Only the two accepted optimization commits were cherry-picked onto main: `008fa500ed84dea15fecd4726271ac3aab10ba9a` from `137773b`, and `4f8af586aff6eceec9dab7902d2ea37c64fd082d` from `68580d7`. Their four runtime modules/tests/supporting scripts remain byte-identical to the accepted application. Later integration documentation is not a deployed application revision.

Historical Home median improves **821.9 → 672.9 ms**, Systems **775.1 → 587.8 ms**; the accepted Home candidate's later Systems control was 618.8 ms. Ordinary Home/Systems serial D1 waits fall **3 → 2**, preserving fresh identity/membership checks and exact timezone-alias fallback. Home's repeated JSON timezone scans are removed. Smart Placement did not establish a repeatable additional improvement and is absent.

The clean PR intentionally excludes all intervening PERF4 diagnostic runtime, opt-in, Analytics Engine binding, active diagnostic runners and transport prompts. Wrangler configuration, workflows, dependencies and migrations are unchanged from main. Sanitized round-trip, Home-query and rejected-placement evidence is retained as historical documentation, not new diagnostics. The existing deployed staging candidate was not changed during integration preparation.

Final clean-branch verification passes **163 focused / 4,788 full tests**, **40 Home / 24 Systems native D1 checks**, Cloudflare/Next build, external type generation, staging dry-run, resolved configuration assertions and diff hygiene. The full count excludes 46 PERF4-only diagnostic tests; none are skipped. No new code fix was needed. No deployment, production action, PR merge or D2 was performed.

## PERF3 implementation and evidence (2026-09-11 UTC)

Read [PERF3_RESULTS.md](PERF3_RESULTS.md) for exact timing phases, provenance, all-route representative/exact-3× comparisons, security evidence, reproduction and limitations. Home and Systems were traced before selecting the fix. Early RSC streaming precedes completed authorization/projection reads. The proven local avoidable critical path is the separate session/user → membership D1 round trip, not a measured browser reconciliation bottleneck. The current session/user query now includes the canonical active workspace selection; Better Auth still owns signature verification, expiry, refresh and identity DTOs. This reduces one sequential database stage on every protected request without cross-request authorization/session caching, protected prefetch, changed timezone semantics, additional loading UI or page-data scope changes.

Full tests: **4,786/4,786**. Next and OpenNext/Cloudflare builds pass. The request-local adapter has issued-cookie, expired/deleted/changed-session, refresh-race, current membership/workspace/capability, concurrent-user/binding, DTO and failure tests. Existing Client/Service/Project/Action/Content scope and next-request revocation suites remain intact. Detailed runtime/browser/benchmark results are in the PERF3 report.

No schema, migration, dependency, configuration, workflow, placement or infrastructure changes. No staging/production deployment or real email was sent. No authenticated staging session was available in this workspace; supplied live baseline figures are not independent waterfall measurements. Local zero-delay and injected-latency results cannot establish the live target. The implementation PR must stay **open and unmerged** for independent audit, followed by exact-SHA staging/zero gates and signed-in live retesting. D2 remains blocked.

## PERF2 implementation and evidence (2026-09-10)

Read [PERF2_RESULTS.md](PERF2_RESULTS.md) for the complete before/after tables, sample counts, SQL costs, completed-body/browser method, safe staging capture workflow, verification and limitations. The implementation uses bounded, request-local native D1 read batches, preserving live authorization and explicit SQL scopes. A small Drizzle adapter preserves ordinal field mapping for duplicate SQL column names, decoders and null joins. It never patches a shared session, caches authorization/results, intercepts writes or uses replicas. Project authorization reuses its live authorized DTO instead of reading the Project twice. Home/Systems share exact timezone reads without merging Action-only and Project scope. Social member options retain their readable-parent gate in SQL; unfiltered Systems data no longer waits for facet values it does not need to validate.

Owner end-to-end statements / binding invocations / observed sequential depth change as follows: Home `14/14/4 → 12/4/4`; Clients `4/4/3 → 4/3/3`; Work `8/8/3 → 8/3/3`; Social `6/6/4 → 6/3/3`; Systems `8/8/5 → 7/4/4`; Team `4/4/3 → 4/3/3`; Project detail `15/15/5 → 14/4/4`. Counts/depth stay constant between 50-Client and 150-Client workspaces. The representative fixture contains 100 Projects, 300 Milestones, 1,000 Actions, 300 Deliverables, 250 Content Items and 200 File metadata rows; stress is exactly 3× each. Existing pagination and row limits are unchanged.

Full tests: **4,769/4,769**. Next and Cloudflare builds pass. Built Worker auth: **144/144**; external local verifier: **21/21**; local zero-to-current: **22/22**; Systems runtime: **23/23**; projections: **34/34**; Release B: **86/86**; Release C: **29/29**. Native runtime smokes prove five Systems statements in two D1 batches and ten Home statements in two batches, with 240 assignments and maximum 65/64 bindings. Navigation browser: **87 checks / 70 screenshots**, seven routes at 1440/1024/768/390/320 with and without JavaScript, including next-request Project metadata/body revocation. Systems browser: **122 checks / 47 screenshots**, including native no-JS filters, keyboard/focus, touch and denied access. Issued-cookie session/membership/assignment/capability/contact/visibility revocation tests were rerun after structural changes. The new adapter and numeric measurement regressions pass.

No schema, migration, dependency, package/lock, deployment configuration, workflow, placement or infrastructure changes. No UI/loading boundary, future D2 feature, remote mutation, deployment or automatic real email was added. Current public staging still serves `d0533cb`; no Owner sign-in completed in the manually opened capture browser, so no authenticated staging timing or candidate deployment result is claimed. Public request colo is not proof of D1/Worker execution placement. PERF2 is an implementation handoff, not phase closure. Detailed local artifacts are outside Git at `/home/ary/.cache/bloomops-perf2`; only sanitized numeric evidence is committed. The PR must remain open and unmerged for independent audit.

## PERF1 implementation and evidence (2026-09-10)

Read [PERF1_RESULTS.md](PERF1_RESULTS.md) for measurement method, every route's before/after median and range, query attribution, safe staging evidence, reproduction commands and remaining uncertainty. [Sanitized numeric samples](evidence/PERF1_navigation.json) retain all warmups and measured requests. Baseline application content is byte-identical to the exact D1 base; repeatable measurements preceded production changes. The fixture has 12 Clients, 24 Projects, 240 Actions and representative children/Content, with issued local Owner/Admin/Team/Client sessions.

Proven avoidable latency came from sequential identity/actor/read-model D1 round trips and a duplicate Project read. Better Auth now joins the current session/user in one database call, retaining disabled cookie caching. Owner skips redundant capability loading; other roles retain live grants, with independent assignment/grant reads in parallel. Clients joins its uniquely indexed current primary contact and overlaps count/list reads. Non-date Action views skip an unused timezone map. Social list/options and independent Project options overlap. Project metadata/body share a React request-local authorized read. No authorization decision is cached across requests; shell/navigation/loading behavior is unchanged.

Eight retained samples after two warmups per route: local medians before → after are Home 109.30 → 94.95 ms, Clients 61.85 → 62.80, Work 160.35 → 128.00, Social 76.85 → 61.90, Systems 78.70 → 79.00, Team 61.95 → 62.65, Project detail 117.20 → 89.65. End-to-end D1 calls fall respectively 18 → 14, 7 → 4, 11 → 8, 8 → 6, 10 → 8, 6 → 4 and 19 → 15. With **synthetic 100 ms per D1 call**, median click-to-visible improves by 200–493 ms across those routes. These controlled figures are not staging results.

Public staging GETs (eight retained after two warmups, MIA response colo) measured version 260.95 ms median, health 736.32, sign-in 271.67 and anonymous Systems redirect 252.09. Health performs two sequential D1 reads; its additional roughly 475 ms supports a deployed database-path contribution, but does not measure actual D1 region/latency or prove the user's exact two-second delay. No safe issued authenticated staging browser session was available. No real email, remote mutation or deployment was performed. Authenticated staging confirmation remains outstanding; PERF1 is not closed and D2 remains blocked.

Verification: full suite **4,762/4,762**; shared auth/membership/shell/Client/Service/B1–B7 **1,098/1,098**; Release C **665/665**; Systems/schema **84/84**. The focused new five-test regression proves issued-cookie session deletion, membership suspension/removal, independent assignment and capability revocation, portal visibility/contact unlinking, tenant existence hiding and Department/ownership non-grant. Both Next and Cloudflare builds pass. Ordinary built-Worker auth **144/144**, local staging verifier **21/21**, zero-to-current **22/22**, Systems runtime **23/23**, Home projections **34/34**, Release B runtime **86/86**, Release C runtime **29/29** all pass. At 240 assignments, Systems stays at six projection queries / 65 maximum binds; Home drops to 12 queries / 64 binds. Navigation browser acceptance passes **87 checks / 70 screenshots**, all seven routes at five widths with and without JavaScript, including next-request Project metadata/body denial after unassignment. Existing Systems browser acceptance passes **122 checks / 47 screenshots**, including visible native no-JS filtering, keyboard/focus, reduced motion and touch. All **16** changed JS/JSX syntax checks pass; `git diff --check` is clean.

No DDL, migrations, dependencies, package/lock, deployment configuration, workflows or infrastructure changed. `schema.mjs` adds only ORM relationship metadata over existing auth foreign keys; Drizzle generation reports no schema changes. No D2 or future Systems feature was added. The temporary PERF1 execution prompt is removed from the implementation; durable instructions remain in `docs/phases/PERF1.md`. Local detailed logs and screenshots are at `/home/ary/.cache/bloomops-perf1/`; issued session files stay outside Git. Prior local D1 audit notes remain preserved in their named stashes. The implementation PR must stay open and unmerged for independent audit; use its final exact head for review.

## D1 independent audit correction (2026-09-10)

The final corrected implementation commit is `729ff558e03d5e5c8a650f76827a04f4bbd223d6`. It contains the complete application/test correction, prompt cleanup and verification record below. The subsequent documentation-only commit records this SHA without changing the verified application or test content; fresh independent review must use the final PR #31 branch head, including that documentation commit.

### Reproduction and smallest correction

The fix resumed on `codex/d1-systems-foundation` at `a1485ed` (the failed implementation plus the focused fix prompt). Required contracts and the complete build state are byte-identical to their complete prior audit reads; current Systems page, loading/error components, projection, browser harness, tests and relevant shell/navigation code were inspected again. Previous local independent-audit documents were preserved in a named Git stash before switching branches.

Before editing, the actual original built Worker reproduced the failure with an issued Owner session and JavaScript disabled: after the complete response, the visible main contained only “Systems / Loading Systems projects…”, there were zero visible Project rows, and the Client filter was hidden. The independent visibility assertion failed. The strengthened repository browser harness was then run against that same original build and failed specifically at its new 1440px completed-heading/filter visibility assertion. Its earlier checks reached that point successfully. The original 101-check implementation run below is historical evidence; its named no-JavaScript check counted hidden DOM nodes and did not establish usable native filters. The first audit did not pass.

The root cause was the route-level `app/(internal)/systems/loading.jsx` boundary. Next streamed the completed page into a hidden segment that needed client JavaScript to replace the loading fallback; the boundary also delayed the visible client-navigation commit. The production correction deletes that four-line file. The protected server page, sanitized `error.jsx`, shell authorization and every domain/query implementation remain unchanged. There is no replacement spinner, timeout, hydration workaround, duplicate state or additional fetch path.

`tests/bloomops-systems-page.test.mjs` no longer imports or asserts the removed loading component. It retains error-message sanitization, the Systems heading, announced error and retry control, and explicitly checks one heading and the reset link. `scripts/systems-review-local.mjs` now verifies one visible completed Systems heading, visible native controls, absence of final loading text and the exact expected visible Project rows at 1440/1024/768/390/320px. In the same JavaScript-disabled context it selects a Client and clicks the actual Apply filters button; it verifies the resulting HTTP 200 GET, Client/Service/status query values, the exact narrowed Project, retained selection and narrowed Service choices. The completed filtered view is checked again at all five widths. Existing keyboard/focus/touch/reduced-motion, authorization, bounds and recovery checks are retained.

The corrected browser harness passes **122/122 checks with 47 screenshots**, including ten no-JavaScript captures. Its native Client filter narrows the story's three readable Systems Projects to the selected Client's one Project. A separate unchanged audit-style probe also passes against the corrected build: 50 visible Projects, one heading, a visible Client filter, then native submission narrows to the other Client's two Projects and retains that Client selection. The live design reference and corrected desktop/narrow no-JavaScript screenshots were visually inspected. No hydration or browser runtime error occurred.

### Local navigation comparison

The same Playwright Chromium probe measured the original and corrected built OpenNext Workers at `http://localhost:8787`, using the same issued Owner session and synthetic audit workspace (51 Systems Projects, two excluded Projects). At 1440px, each run clicked Work → Social → Systems for eight rounds, discarded the first two rounds and retained six warm samples per route. In-page click timing ends when completed route content is visible plus two animation frames; Resource Timing records the RSC response separately. No artificial CPU/network throttling was used. The post-fix probe ran after builds, browser acceptance and the migration verifier completed, before auth stress tests.

| Route | Before: median click to visible | Corrected: median click to visible | Before / corrected median RSC duration |
|---|---:|---:|---:|
| Systems | 345.6 ms | **78.6 ms** | 34.4 / 37.8 ms |
| Work (default Actions view) | 70.2 ms | 77.9 ms | 30.9 / 33.8 ms |
| Social | 62.7 ms | 62.3 ms | 23.4 / 25.9 ms |

The correction removes approximately 267 ms of D1-local visible-navigation delay in this comparison while the Systems data response remains similar. Corrected Systems samples ranged from 78.1 to 80.6 ms. This is local measurement evidence, not an SLA or a claim that the staging-wide latency is fixed. No additional D1-specific performance defect was observed. Query shape and fresh per-request identity/membership/scope checks were not changed. The separate global performance-hardening phase remains required after D1 closes and before D2.

### Fresh correction verification

Logs, precise timing samples, the before-fix failure and corrected screenshots are under `/tmp/bloomops-d1-fix`. Counts below overlap; they are not additive. Every node:test suite has zero failures, skips, cancellations and todos.

| Check / command | Result |
|---|---|
| `node --test tests/bloomops-systems-*.test.mjs` | 62/62 passed |
| Systems plus `tests/bloomops-shell.test.mjs` | 79/79 passed |
| Service/auth/authorization/membership/shell and relevant B1–B7 suites | 1043/1043 passed; same complete shared command documented in the original implementation evidence below |
| Release C Content/portal/release suites | 665/665 passed |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4757/4757 passed; existing external Python alias only |
| `npm run build`; `npm run cf:build` | Both passed, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: fresh database, all migrations, integrity, identical no-op second pass and cleanup |
| `npm run db:domain:generate` | No schema changes; nothing to migrate |
| Schema/drift tests | 22/22 passed |
| `node scripts/systems-smoke-local.mjs` | 23/23 actual workerd/D1 checks; 240 assignments, six queries, maximum 65 bindings / 13,419 SQL bytes; no R2 binding |
| `node scripts/projections-smoke-local.mjs` | B6: 34/34 actual workerd/D1 checks |
| `node scripts/release-b-smoke-local.mjs` | B7: 86/86 actual workerd/D1/R2 checks |
| `node scripts/release-c-smoke-local.mjs` | C7: 29/29 actual workerd/D1/R2 checks |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against the corrected built Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the corrected built Worker after the normal auth throttle window; no throttle setting changed |
| Corrected `systems-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-d1-fix/browser-after` | 122/122 passed; 47 screenshots at all five established widths, including visible no-JavaScript pages and real native filter submission |
| Independent no-JavaScript visibility/native-filter probe | Failed on original build; passed unchanged on corrected build |
| Changed JS/JSX syntax; `git diff --check` | Both changed JavaScript modules parsed with Node; no whitespace errors |
| Exact package/lock/schema/migration/Cloudflare config diff against D1 base | Empty; no prior migration edits, new migrations, dependency, provider or infrastructure change |

`D1_FIX_PROMPT.txt` was removed before the implementation commit and has no net diff against the D1 base. The correction changes only the loading-file deletion, the two acceptance-test files and this build-state record, apart from that temporary-prompt cleanup. All operational verification uses synthetic local/disposable data and development mail. No staging/production business-data mutation, deployment, merge, second PR or D2 work was performed. PR #31 must remain open for a fresh independent exact-head re-audit.

## Systems Foundation (D1)

### Entry and implementation decisions

The branch started clean at `c7143ba`, containing the Release D plan, roadmap split, binding D1 contract and temporary execution prompt. The entire prompt/contract and B1–B7 phase contracts were read before implementation. Required AGENTS/product/domain/design/build-state documents are byte-identical to their complete prior reads in this session, verified against the preceding C7 audit checkout. Current Service/catalog, Work Core, assignment/access, shell, projection, tests and local verification implementations were inspected.

- `/systems` now renders a protected server-side operational view with one heading, Client/Service/Project-status filters, Project rows, derived attention/progress, open Action/review summaries, Ready File presence and forward Deliverables. Empty, invalid-filter, loading and sanitized error recovery are included.
- Eligibility is a current relational Project -> same-Client Service Engagement -> Service Type -> Department with stable `systems` slug. Display names, Project department metadata, ownership and Department membership cannot substitute. No GHL/Kajabi platform is inferred. Active catalog flags and Client/Service status do not silently close otherwise active Project work.
- B6's existing Project and forward Deliverable queries accept a server-only narrowing condition. They retain every live Project/Milestone/Action/Deliverable/File predicate. New pagination and attention-first options leave existing Home/Work defaults intact. No Action-only assignment can inflate Project/sibling/facet scope, and no R2 bytes are read for summaries.
- The default Project view excludes Completed/Cancelled/Archived; all exact statuses remain selectable. Project pages contain 50 readable rows plus one overflow probe, with deterministic attention priority then target date/name/id. Client/Service facets cap at 200 plus a separately authorized selected value. Forward Deliverables keep the B6 six-row review/approved/14-day target window across the whole filtered set, independent of the Project page. Missing/foreign/revoked/incompatible filters share one generic response without a fallback data list.
- All management links use existing canonical Work/Project/Action surfaces. The convenient creation link opens the ordinary Work form; there is no second Systems creation operation. The existing fixed staff navigation is retained for every internal role, with Systems marked available and a calm empty state for users without readable Systems Projects. Client navigation is unchanged.
- D1 is **schema-free**: no migration, schema, dependency, lockfile, provider, infrastructure/configuration, stored status/counter, template or lifecycle change. Release D/roadmap/D1 contracts are preserved.

### Verification and corrections

Fresh logs and screenshots are outside Git under `/tmp/bloomops-d1-*`. The new tests exercise real migrated SQLite/Drizzle and actual issued Better Auth sessions; the runtime smoke uses disposable workerd/D1 without an R2 binding. The browser harness creates its operational story through the canonical HTTP APIs, then uses local fixtures for bounds and revocation.

Two new test-fixture mistakes were corrected after existing constraints rejected them: a Service-bound Project cannot also store a Project department, and Service completion uses `completed`, not `ended`. The page tests were changed to import JSX after the repository loader registers. Invalid-filter presentation uses the existing error Notice so assistive technology receives an alert with its recovery link. Existing shell assertions were updated to explicitly include Systems among available destinations.

One unrelated inherited regression test blocked a repeated shared run: its `/existing-|count|199/` scan rejected random Action id `334cff7f1995463bb03ea0b01b1d4ec3`. `bloomops-actions-views.test.mjs` now asserts the exact successful `{ok, actionId}` and conflict `{ok, reason}` envelopes against the currently visible Action. This directly proves no hidden names/counts are returned without rejecting legitimate opaque ids. No production Action behavior changed.

| Check / command | Fresh result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; 53 inherited advisories (1 low, 43 moderate, 9 high) |
| `node --test tests/bloomops-systems-*.test.mjs` | 62/62 passed; real read/authorization/limits/server-page/loading/error invariants |
| Focused Systems plus `tests/bloomops-shell.test.mjs` | 79/79 passed |
| Service/auth/membership/shell plus B1–B7 Project/Milestone/Action/Deliverable/File/projection/regression suites | 1043/1043 passed after the exact-envelope correction above |
| `node --test tests/bloomops-content-*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-release-c-*.test.mjs` | 665/665 passed |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4757/4757 passed; zero failures, skips, cancellations or todos |
| `npm run build`; `npm run cf:build` | Both passed, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: empty database, all migrations, integrity, identical no-op second pass and cleanup |
| `npm run db:domain:generate` | No schema changes; nothing to migrate |
| `node --test tests/bloomops-schema.test.mjs tests/schema-drift.test.mjs` | 22/22 passed |
| `node scripts/systems-smoke-local.mjs` | 23/23 actual workerd/D1 checks; 240 assignments, six metadata queries, maximum observed 65 bindings / 13,419 SQL bytes; no R2 binding |
| `node scripts/projections-smoke-local.mjs` | 34/34 passed; shared B6 defaults and large assignment scope |
| `node scripts/release-b-smoke-local.mjs` | 86/86 actual workerd/D1/R2 checks passed |
| `node scripts/release-c-smoke-local.mjs` | 29/29 actual workerd/D1/R2 integrated checks passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against the actual built Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built Worker after the live auth throttle window elapsed |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/systems-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-d1-review-final` | 101/101 passed, 37 screenshots including the live design reference; 1440/1024/768/390/320px, populated/empty/invalid/assigned/restricted/last-page states, keyboard/focus/touch/reduced-motion and JavaScript-disabled reads |
| Changed JS/JSX syntax and `git diff --check` | 16 modules parsed with Node/esbuild; no whitespace errors |
| Exact dependency/config/schema/migration diff against `1638e3ed9fd33c3725aa3449935b08335b73f1a9` | No changes to package/lock, schema.sql, Drizzle schema/config, migrations/snapshots or wrangler.jsonc |

The full shared regression command was `node --test tests/bloomops-services.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-projects-*.test.mjs tests/bloomops-milestones-*.test.mjs tests/bloomops-actions-*.test.mjs tests/bloomops-deliverables-*.test.mjs tests/bloomops-files-*.test.mjs tests/bloomops-projections-*.test.mjs tests/bloomops-release-b-*.test.mjs tests/bloomops-shell.test.mjs`.

The fresh database contains 60 inherited ledger migrations, 18 domain migrations, 41 domain / 77 total tables, 37 triggers and 100 migration-defined indexes. No prior migration was edited. The 53 advisories remain inherited with identical package/lock contents; no dependency remediation is claimed. Browser screenshots manually inspected include the live reference, populated desktop and 320px long-name view, invalid 390px recovery, and narrow Project pagination. No page hydration/runtime errors occurred in the final browser run. Local auth throttling is preserved; the external verifier initially received the real 429 throttle response after other auth tests and passed on retry after the window elapsed. The first browser attempt overlapped the authentication smoke's intentional failure-injection checks; browser acceptance was rerun independently and waits for streamed navigation to settle. The existing external Python alias and Playwright installation remain outside the repository.

### Complete D1 changed-file inventory

The net diff against the exact D1 base contains 22 files, including the supplied Release D/roadmap/D1 planning commits:

- `app/(internal)/systems/error.jsx`
- `app/(internal)/systems/loading.jsx`
- `app/(internal)/systems/page.jsx`
- `components/bloomops/SystemsOverview.jsx`
- `docs/BUILD_STATE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/INDEX.md`
- `docs/RELEASE_D.md`
- `docs/ROADMAP.md`
- `docs/phases/D1.md`
- `lib/bloomops/navigation.mjs`
- `lib/bloomops/systems.mjs`
- `lib/bloomops/work-projections.mjs`
- `scripts/systems-review-local.mjs`
- `scripts/systems-smoke-local.mjs`
- `scripts/systems-smoke-worker.mjs`
- `tests/_systems.mjs`
- `tests/bloomops-actions-views.test.mjs`
- `tests/bloomops-shell.test.mjs`
- `tests/bloomops-systems-access.test.mjs`
- `tests/bloomops-systems-domain.test.mjs`
- `tests/bloomops-systems-page.test.mjs`

`D1_CODEX_PROMPT.txt` was removed and has no net diff against the base. Generated artifacts, screenshots, local secrets, build outputs and temporary verification resources are not tracked.


### Deliberate limits and remaining gates

D1 contains no Systems-specific creation/editor, platform filter/inference, blueprint generation/provenance, QA lifecycle, launch/handoff metadata, Client Systems navigation, provider integration, credential storage, notifications, Ads or D2+ work. These are not implied by the new view. All verification uses synthetic local/disposable data and local development mail. No remote deployment, remote migration or staging/production business-data mutation was performed. Independent audit, merge and the two automatic exact-merge-SHA workflows remain outstanding.

## Release C Hardening (C7)

### Verified entry and scope

Read-only `gh run view` checks confirmed [Deploy staging 34446462522](https://github.com/Beeyach/bloomops/actions/runs/34446462522) and [Verify zero-to-current 34446699082](https://github.com/Beeyach/bloomops/actions/runs/34446699082) both completed successfully on `4dff635df8bb9268b18369eea05914c2c2534e3f`. The branch started clean and contained only its binding contract (`d01e1de`) and temporary execution prompt (`3aaff1f`) after that base. The complete prompt and C7 contract were read; required repository/product/design/C1–C6 documentation and current implementation, tests and verification harnesses were inspected before editing. Required pre-C7 documents were byte-identical to the complete C6 re-audit reads in this session.

C7 adds no product feature, lifecycle, schema, dependency or infrastructure change. Existing C1–C6 authorization, storage, snapshot, pagination and concurrency rules survived the review and fresh regressions. The only product correction restores page orientation on invalid staff Social filters.

### Reproduced defect and smallest correction

The staff Social list's invalid-query response and both calendar invalid-query branches rendered an announced error and reset link with no page heading. Real Next server-page tests, using actual request stores, migrated SQLite and issued Better Auth sessions, reproduced three failures (zero `h1` elements). Six companion checks confirmed anonymous/Client redirects happened before error rendering. The two pages now prepend the existing `PageHeader` with their ordinary title. The tests prove one named heading, the existing alert and the appropriate reset link; shell authorization is not mocked. No filter semantics, route status or permission rule changed.

The live Bloom design gallery loaded with HTTP 200 and was visually inspected. The correction reuses its existing typography/spacing primitives; no redesign or CSS change was needed.

During browser-harness development, an overbroad alert count also matched the hydrated shell's empty live region; direct inspection confirmed the reset control already had a 2px keyboard focus outline. The new check now targets the announced filter error and drives the real Tab order. The direct-index check also waits for Next's redirect, matching the existing C6 harness. These were harness corrections, not additional product defects. Initial diagnostic runs are retained under `/tmp/bloomops-c7-browser-*-diagnostic.log`; only complete successful reruns count as acceptance evidence.

### Connected acceptance evidence

`scripts/release-c-story.mjs` is a test-only story shared by `node:test` and disposable workerd/D1/R2. It creates a synthetic two-Client agency with Social and Systems engagements, an exact Social contractor, PM and Client identities, plus another workspace. Better Auth issues real cookies through an in-memory mailer; every subsequent access reloads current membership/scope, while sensitive domain calls also exercise actors loaded before revocation. No mail leaves the process. All Content stage, detail, platform, recording and review operations use the canonical domains; SQL seeds parents and changes assignment/contact facts only.

Its 29 assertions connect C1 creation and different conditional pipelines, C3 date/platform changes, a C4 Client recording and response-loss retry, two formal C5 rounds, and C6 discovery/actions/recent publication. Prior review copy and finalized rounds remain identical through rework. Old request/response retries cannot overwrite or complete round two. The contractor demonstrably reads current history/Files before reassignment, loses old list/calendar counts, detail, review/File history and bytes after reassignment, and regains them only with the exact assignment. Contact unlinking removes navigation, recordings, metadata, upload retry and download authority while identity survives. Restriction removes broad PM and Client access while retaining the canonical Requested round; exact PM assignment restores only internal authority. A real C2 transition to Editing during an R2 GET fences the in-flight Client download and simultaneously removes C6 recording/File indicators. Actual canonical publication drives inclusive 30-day and future-date discovery checks without duplicate schedule state. Client/Service lifecycle facts and relational integrity remain unchanged.

`node scripts/content-approvals-review-local.mjs --release-c` extends the current C5 browser journey with C7 checkpoints in the same workspace and issued browser sessions. The optional checkpoints add multi-service/other-Client/hidden work, invalid-filter recovery and visible keyboard focus, recording/action/detail/File presentation, each round's C6 action link, contractor reassignment and disappearance of old history/Files, publication through different pipelines, recent-only navigation, contact revocation and portal reduced motion. The existing C5 journey supplies double-submit/retry checks, immutable two-round copy/feedback, frozen fields, dialog focus/trap/restoration, touch and withdrawal controls. All integrated layouts use 1440/1024/768/390/320px and check one heading, overflow and readable controls; long titles, copy and filenames are included.

Existing convincing adversarial coverage was retained and rerun rather than duplicated:

| Invariant | Existing proof retained |
|---|---|
| Tenant/Client IDs, current membership/role/workspace, assignment/contact/visibility/Social truth; owner/department/Project/Action do not grant Content | C1–C6 access/HTTP tests, shared authorization and shell tests; corresponding runtime smokes |
| Every conditional flag combination, legal stages, terminal Published, context/revision/event integrity | C2 domain/HTTP/runtime matrix, including formal C5 approval for the Client gate |
| Edit/stage/platform races; same/different request retries; late-write rollback | C1–C3 domain/HTTP/runtime suites and C5 concurrency tests |
| Requested uniqueness/freeze, immutable prior rounds, stale response, response/withdraw/edit winners, late rollback | C5 domain/concurrency/HTTP/runtime suites |
| C4-only storage authority, retry recovery/generations, changed parents, post-R2 PUT/GET/HEAD checks and File history visibility | C4 access/domain/HTTP/R2/runtime plus B5 File regressions |
| Date/null/order/range/page limits, Unicode platforms, dense pages and large assignment/contact scopes | C3 and C6 domain/HTTP/runtime suites (including 205 dense rows and 240 scopes) |
| Exact general DTOs, hidden-row pagination, current/Needs you/recent windows, conditional navigation/direct index, no-client/suspended behavior | C6 domain/HTTP/real-page/UI/runtime/browser suites |
| Loading, sanitized errors, disabled pending controls and recovery | Existing Content/recording/approval/portal UI tests plus browser error, empty and dialog paths |

### C7 verification

All commands run from the repository root. Logs and browser artifacts use `/tmp/bloomops-c7-*`, outside Git. Results below are fresh C7 runs, not historical C6 counts.

| Check / command | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; 53 inherited advisories (1 low, 43 moderate, 9 high) |
| `node --test tests/bloomops-release-c-*.test.mjs` | 10/10 passed, including 29 integrated story assertions; zero skips/cancellations |
| `node --test tests/bloomops-content-*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-release-c-*.test.mjs` | 665/665 passed; zero skips/cancellations |
| `node --test tests/bloomops-file*.test.mjs tests/bloomops-projection*.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-membership.test.mjs` | 311/311 passed; zero skips/cancellations |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4695/4695 passed; zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed; fresh schema, exact no-op second pass and disposable cleanup |
| `npm run db:domain:generate` | Exit 0; no schema changes, nothing to migrate |
| `node --test tests/bloomops-schema.test.mjs tests/bloomops-content-schema.test.mjs tests/bloomops-content-pipeline-schema.test.mjs tests/bloomops-content-calendar-schema.test.mjs tests/bloomops-content-files-schema.test.mjs tests/bloomops-content-approvals-schema.test.mjs tests/schema-drift.test.mjs` | 72/72 passed |
| `node scripts/content-smoke-local.mjs` | 43/43 actual workerd/D1 checks passed |
| `node scripts/content-pipeline-smoke-local.mjs` | 54/54 passed |
| `node scripts/content-calendar-smoke-local.mjs` | 57/57 passed |
| `node scripts/content-files-smoke-local.mjs` | 64/64 actual workerd/D1/R2 checks passed |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 passed |
| `node scripts/portal-content-smoke-local.mjs` | 30/30 passed |
| `node scripts/release-c-smoke-local.mjs` | 29/29 passed on real workerd/D1/R2 with issued sessions |
| `node scripts/files-smoke-local.mjs`; `node scripts/projections-smoke-local.mjs`; `node scripts/release-b-smoke-local.mjs` | 42/42, 34/34 and 86/86 passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against the built Worker; identity, invitation, scopes, suspension and sign-out |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built Worker |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --release-c --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c7-review` | 206/206 browser/HTTP checks passed; 134 screenshots at 1440/1024/768/390/320px |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/portal-content-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c7-c6-review` | 86/86 browser/HTTP regressions passed; 52 screenshots at all five widths |
| Changed JS/JSX syntax; `git diff --check 4dff635df8bb9268b18369eea05914c2c2534e3f` | Nine JS/JSX files parsed with Node/esbuild; no whitespace errors |
| `git diff --exit-code 4dff635df8bb9268b18369eea05914c2c2534e3f -- package.json package-lock.json drizzle lib/bloomops/schema.mjs` | Exit 0; byte-identical dependencies, schema, migrations and snapshots |

No migration or schema correction was necessary. No prior migration was edited, no migration was added and no dependency/audit-fix command ran. The fresh database has 60 inherited ledger entries, 18 domain migrations, 41 domain / 77 total tables, 100 migration-defined indexes and 37 triggers; the second pass changed neither schema nor ledgers. The pinned manifest/lockfile remain identical to the exact C6 base. npm's 53 advisories are inherited; the available build checks pass but do not resolve those advisories. The external Python alias already used by prior phases supports inherited packaged-skill ZIP tests without changing repository behavior. Playwright remains external at `/tmp/bloomops-c6-tools`; Chromium uses the existing libraries under `/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu`.

Screenshots visually inspected include the live design reference, the 320px Social reset/focus state, calendar invalid-query heading, long recording detail/filename and reassigned contractor calendar, plus the desktop recent-publication list. The integrated browser checks preserve real auth throttling with bounded retries. Loading/error-state assertions also remain in the focused UI regressions; no remote browser acceptance is claimed.

### Deliberate limits and handoff

Only synthetic local/disposable data is used. Runtime harnesses remove their temporary resources. The built Worker uses the safety-checked local preview with `r2-dev` mail and an in-memory loopback origin override. `.dev.vars`, unrelated developer processes, staging/production business data and Leadsthatbloom are untouched. No deployment, real email/SMS, payment, DNS change or Release D work is authorized or performed. Remote C7 deployment/migration gates, independent audit and merge are intentionally not verified by this implementation; those are the remaining release-closure gates.

All required local checks ran and passed. The owned preview was stopped after browser/auth verification. Its SIGTERM exit left the local dry-run bundle behind; after confirming both owned processes and port 8787 were gone, that specific temporary directory was removed explicitly. Unrelated older preview directories were left untouched. Synthetic browser/auth fixtures remain only in local development D1/R2; disposable runtime/zero-check resources were removed by their harnesses.

Historical C1/C2/C4 browser scripts still contain phase-local absence/bypass assertions superseded by C5/C6. C7 runs the current C5 journey extended across C1–C6 and the current C6 browser regression, plus every current C1–C6 runtime smoke. It does not alter historical harnesses merely to inflate passing counts. Earlier contracts' limits remain: C4-only eligible recording sharing, C5-only explicit review copy, no Client history/general assets/provider publishing/notifications or future modules. There is no behavior correction requiring DOMAIN_MODEL or RELEASE_C edits.

The implementation handoff is an open, unmerged PR for independent audit. The final exact head is reported with that PR and identifies the content reviewed; Release C is not closed by this work. The next step is independent C7 audit, not Release D implementation.

### Complete C7 changed-file inventory against the exact C6 base

- `app/(internal)/social/calendar/page.jsx`
- `app/(internal)/social/page.jsx`
- `docs/BUILD_STATE.md`
- `docs/phases/C7.md`
- `scripts/content-approvals-review-local.mjs`
- `scripts/release-c-review-checks.mjs`
- `scripts/release-c-smoke-local.mjs`
- `scripts/release-c-smoke-worker.mjs`
- `scripts/release-c-story.mjs`
- `tests/bloomops-release-c-page.test.mjs`
- `tests/bloomops-release-c-story.test.mjs`

The temporary `C7_CODEX_PROMPT.txt` is removed, giving zero net diff against the C6 base. No generated output, local data, secrets or browser artifacts belong in the final diff.

### Historical C6 entry: verified C5 closure and exact C6 base

C5 PR #26 merged as `df4bfde1d3746d3517dbaff498f6eb17a5b732e0`, the exact C6 base. Read-only `gh run view` checks confirmed [Deploy staging 34365507942](https://github.com/Beeyach/bloomops/actions/runs/34365507942) and [Verify zero-to-current 34365508005](https://github.com/Beeyach/bloomops/actions/runs/34365508005) both completed successfully on that exact SHA. The C6 contract records successful disposable cleanup. The requested branch started clean and contained only the C6 phase contract and temporary prompt after the base. The complete prompt, phase contract, repository instructions and required preflight documentation were read before implementation.

## Client Content Portal (C6)

### Implementation decisions

- Schema-free general Client Content index/detail, conditional Home/Content navigation and exact allowlisted JSON reads. All records remain canonical C1–C5 records; no portal cache, duplicated statuses, new writes, File policy expansion or notification side effect.
- Shared `contentClientReadCondition` extracts the existing C5 live Client predicate. Membership/workspace/role, current contact, Content visibility and canonical optional Social parent are rechecked in SQL. C4 and C5 retain narrower recording/Requested-round gates; their internal scope and writes remain unchanged. Owner, department, Project, Action and unrelated-service relationships do not grant Client reads.
- Current/upcoming includes every readable non-Published item. Needs you derives C4 recording and C5 approval eligibility. Recently published uses canonical `published_at` in the inclusive preceding 30 days and excludes future dates. Queries filter eligibility before 20+1 pagination; date/ID ordering is deterministic, null planned dates sort last, and only eligible `hasMore` is returned. Positive page input is bounded to 999999. No total or hidden overflow is exposed. Navigation and the direct index gate share the union of discoverable Content: readable non-Published work or recent Published work, using the same stage/window predicates as the lists. Ineligible portal Clients redirect to `/portal`; eligible Clients retain empty states for a selected view/page with no items.
- General DTOs contain only ID, title/type, Client name, derived status label, dates, platform display labels and current action/File indicators. Detail adds the existing six-field File metadata projection. No script, hook, caption, CTA, pillar, internal context/owner, CAS, provenance, activity, service/member/workspace IDs or completed review history is serialized. Explicit C5 review remains the sole surface for its submitted snapshot copy.
- Detail and File metadata are read in one D1 batch, with authorization predicates repeated after route resolution. File indicators correlate to this exact Content and reuse C4: only Ready, client-visible, unarchived recording Files while recording is required and Content is Waiting for Recording. Uploading/Failed retries remain on the existing recording page. Generic Content assets remain hidden; leaving the recording stage removes metadata and download access. C6 uses the existing opaque download endpoint with its post-R2 authority check.
- Existing B portal Home/onboarding/Projects/Deliverables/Files are preserved. Recording and approval links reuse existing pages and mutations. Staff Content changes are limited to correcting visibility help text and shared helper extraction. Portal styles reuse the existing tokens/primitives, quiet rows, wrapping titles/filenames, active nav, loading/empty/error/no-action recovery and 44px controls.

### C6 conditional-destination audit correction

`hasPortalContent` now combines live Client authorization with the union of the Current and Recently published predicates. The list and destination query reuse the same non-Published and inclusive 30-day publication conditions. Older/future publications, hidden/foreign Content and invalid Client/Service authority cannot activate navigation. `/portal/content` calls this same query after ordinary portal authentication and redirects an ineligible Client to `/portal`. The page uses one timestamp for eligibility and its list; an empty selected view/page does not revoke an otherwise eligible destination. There is no change to detail/API readability, DTOs, C4/C5 authorities, schema, dependencies or the binding phase contract.

Fifteen focused regressions were added: six domain/window/isolation tests and nine actual Next server page/layout tests using migrated SQLite and issued Better Auth sessions. The page tests provide Next's request stores without mocking shell authorization, Content eligibility or redirect. Six tests failed against the unchanged audited product code before the fix; all pass afterward. Browser acceptance replaces the incorrect empty-global-module assertion with direct redirects for no Content, old-publication-only Content, visibility revocation and contact revocation. It also proves current-only access and valid empty Current/Needs you views when only recent Published Content exists. The disposable C6 runtime adds six discovery/window cases and exercises the corrected navigation query with 240 linked Clients.

### Fresh audit-correction verification

| Check / exact command | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; same 53 inherited advisories (1 low, 43 moderate, 9 high) |
| `node --test tests/bloomops-portal-content*.test.mjs` | 56/56 passed, zero skips/cancellations |
| `node --test tests/bloomops-content*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-file*.test.mjs tests/bloomops-projection*.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-authorization.test.mjs` | 936/936 passed, zero skips/cancellations |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4685/4685 passed, zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available Next lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed; fresh schema, exact no-op second pass and disposable cleanup |
| `npm run db:schema:local`; `npm run db:migrate:local`; `npm run db:domain:migrate:local` | Exit 0; local preview schema current, no domain migrations to apply |
| `npm run db:domain:generate` | Exit 0; no schema changes, nothing to migrate |
| `node scripts/portal-content-smoke-local.mjs` | 30/30 actual workerd/D1/R2 checks passed |
| `node scripts/content-files-smoke-local.mjs` | 64/64 passed |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 passed |
| Changed JS/JSX syntax; `git diff --check df4bfde1d3746d3517dbaff498f6eb17a5b732e0` | 31 files parsed with Node/esbuild; no whitespace errors |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/portal-content-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c6-fix-review` | 86/86 browser/HTTP checks; 52 screenshots at 1440/1024/768/390/320px |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c6-fix-c5-review` | 91/91 browser/HTTP regressions; 53 screenshots at all five widths |

The corrected navigation query measures 12 bindings and 1206 SQL bytes. List/detail queries retain their previous shape. Schema/migrations and package manifests/lock remain byte-identical to the audited head and exact C5 base; inventory remains 18 domain migrations, 41 domain / 77 total tables, 100 indexes and 37 triggers. No dependency update or audit-fix command ran.

Logs are under `/tmp/bloomops-c6-fix-*.log`, with the pre-fix failures in `bloomops-c6-fix-before.log`. Browser artifacts/tooling and the existing Python alias remain outside Git. The 320px recent-Published-only empty Current view and desktop Content list were visually inspected. No visual redesign or remote design-reference inspection is claimed for this correction. Verification uses synthetic local D1/R2 and example.com identities. The owned preview was stopped after both browser suites; `.dev.vars` and unrelated processes were untouched. All required correction checks ran and passed; remote deployments/post-merge gates were intentionally not run. The earlier C1–C3/B/A runtime commands below are historical implementation evidence; the fresh correction reruns are the table above.

The fix changes eight product/test/documentation paths relative to `50c196a`: `app/portal/content/page.jsx`, `lib/bloomops/portal-content.mjs`, `scripts/portal-content-review-local.mjs`, `scripts/portal-content-smoke-worker.mjs`, `tests/bloomops-portal-content.test.mjs`, new `tests/bloomops-portal-content-page.test.mjs`, `docs/DOMAIN_MODEL.md` and `docs/BUILD_STATE.md`. The temporary `C6_FIX_PROMPT.txt` is removed, giving zero net prompt diff against both the audited head and C5 base. PR #27 must remain open and unmerged for a fresh independent audit.

### Initial C6 verification evidence (audited head `50c196a`, historical)

These initial runs preceded the independent audit. The original browser harness incorrectly accepted an irrelevant empty Content index; its green result did not prove the conditional-destination contract. The correction and fresh verification are recorded above.

| Check / exact command | Result |
|---|---|
| `npm ci` | Exit 0; package manifests/lock byte-identical to exact C5 base |
| `node --test tests/bloomops-portal-content*.test.mjs` | 41/41 passed, zero skips/cancellations |
| `node --test tests/bloomops-content*.test.mjs tests/bloomops-portal-content*.test.mjs tests/bloomops-file*.test.mjs tests/bloomops-projection*.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-authorization.test.mjs` | 921/921 passed, including C1–C6 and relevant B portal/File/shared authorization regressions |
| `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` | 4670/4670 passed, zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Exit 0, including available Next lint/type checks; final Worker includes navigation styles |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed; fresh schema/ledgers and exact no-op second pass, disposable cleanup |
| `npm run db:schema:local`; `npm run db:migrate:local`; `npm run db:domain:migrate:local` | Exit 0; local preview schema current; domain path reports no migrations to apply |
| `npm run db:domain:generate` | Exit 0; no schema changes, nothing to migrate |
| `node scripts/portal-content-smoke-local.mjs` | 24/24 actual workerd/D1/R2 checks, including 240 linked Clients, filtered pagination, per-Content Files, C5 response, recent publication and stale-authority revocations |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 passed |
| `node scripts/content-files-smoke-local.mjs` | 64/64 passed |
| `node scripts/content-calendar-smoke-local.mjs` | 57/57 passed |
| `node scripts/content-pipeline-smoke-local.mjs` | 54/54 passed |
| `node scripts/content-smoke-local.mjs` | 43/43 passed |
| `node scripts/files-smoke-local.mjs` | 42/42 passed |
| `node scripts/projections-smoke-local.mjs` | 34/34 passed |
| `node scripts/release-b-smoke-local.mjs` | 86/86 passed |
| `node scripts/release-a-hardening-smoke-local.mjs` | 26/26 passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed against built Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed |
| Changed JS/JSX syntax; `git diff --check` | 30 files parsed with `node --check` / existing esbuild JSX transform; no whitespace errors |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/portal-content-review-local.mjs` | 78/78 browser/HTTP checks passed; 52 screenshots at 1440/1024/768/390/320px |
| `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --playwright /tmp/bloomops-c6-tools --out /tmp/bloomops-c6-c5-review` | 91/91 C5 browser/HTTP regressions passed; 53 screenshots at all five widths |

The focused D1 queries were also measured with the repository's SQLite adapter: current/action/published list queries use 33/44/35 bindings and 5154/6584/5178 SQL bytes; the detail's two reads use 33/15 bindings and 5022/2247 bytes; navigation uses 8 bindings and 1056 bytes. They stay below D1's 100 bound parameters and 100KB SQL limit, without per-item SQL, scope-expanded IN lists or R2 list calls. The actual D1 smoke independently exercised the large-contact case.

There are no migrations, schema/snapshot edits or dependency changes. Inventory remains 18 domain migrations, 41 domain tables, 77 total fresh tables, 100 migration-defined indexes and 37 triggers. `npm audit --package-lock-only --json` was run against the working tree and isolated exact-base/head manifest extractions. All 53 inherited advisories match in IDs, affected packages, ranges, severity and fixes: 1 low, 43 moderate, 9 high, 0 critical. npm varied only the transitive `effects` attribution for `@tiptap/extension-drag-handle` and `@tiptap/react`; there is no package/advisory delta. No dependency update or audit-fix command ran.

Browser/tooling evidence lives under `/tmp/bloomops-c6-*`, outside the repository. Playwright is installed only under `/tmp/bloomops-c6-tools`; existing Chromium libraries are reused from `/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu`. The full suite initially hit the host's unavailable `python` command in five inherited packaged-skill ZIP tests; an external `python` → `/usr/bin/python3` alias, as documented in prior phases, made the complete rerun pass without changing test or product behavior. The C6 browser fixture initially exceeded the existing 180-character filename bound; the synthetic filename was corrected to 180 characters. Its recording-page assertion was also aligned with the existing C4 heading (Recording needed, with the Content title as subtitle). Only final complete runs count as acceptance evidence. Existing sign-in throttling was respected with bounded retries.

The complete C6 browser story covers Social-only/non-Social/multi-service Home, retained Systems Project, upcoming and recent Published Content, recording navigation, canonical Ready File bytes and 180-character filename, explicit snapshot/approval response, no-action/empty/invalid-query states, long titles, keyboard, touch, reduced motion and live stage/visibility/contact/membership revocation. Screenshots inspected include the desktop list, 320px File detail, mobile list and recent publication view. Loading and sanitized server-error recovery are covered by focused UI tests; no remote C6 deployment or post-merge gate is claimed.

The browser successfully fetched the live design reference with HTTP 200 and its full gallery screenshot was visually inspected. The initial web fetch failed; browser inspection is the evidence used. The local preview uses the existing safety-checked `scripts/files-preview-local.mjs`, with its in-memory loopback origin override and synthetic example.com identities. `.dev.vars` and unrelated developer processes remain untouched. No remote deployment, staging/production data mutation, real client communication, DNS, payment or Leadsthatbloom action was performed. Browser fixtures remain in local development D1/R2; disposable runtime/zero-check resources are removed by their harnesses.

Deliberate limits: no general copy disclosure, Client history, generic Content asset sharing, File versioning, comments, notifications, provider publishing, templates, Ads/Systems buildout or C7. Offset pages reflect current truth and can shift as records change. Publication browsing is limited to the last 30 days; older readable Content retains its existing authorized detail URL but cannot activate navigation or the index. C6 awaits a fresh independent audit, user-controlled merge and both post-merge gates before a separately instructed C7.

The initial owned loopback preview was stopped after verification and its cleanup completed. The temporary `C6_CODEX_PROMPT.txt` was removed and has zero net diff against the exact C5 base. Corrected scope is the 36 paths below; no secrets, production data or generated/debug artifacts entered the intended diff. The implementation commit and open/unmerged PR identify the exact final head.

### Complete C6 changed-file inventory against the exact C5 base

- `app/api/bloomops/portal/content/[contentId]/route.js`
- `app/api/bloomops/portal/content/route.js`
- `app/bloomops.css`
- `app/portal/content/[contentId]/page.jsx`
- `app/portal/content/error.jsx`
- `app/portal/content/loading.jsx`
- `app/portal/content/page.jsx`
- `app/portal/layout.jsx`
- `components/bloomops/ContentForm.jsx`
- `components/bloomops/ContentViews.jsx`
- `components/bloomops/PortalContent.jsx`
- `components/bloomops/PortalContentNav.jsx`
- `components/bloomops/PortalShell.jsx`
- `docs/BUILD_STATE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/RELEASE_C.md`
- `docs/phases/C6.md`
- `lib/bloomops/authorization.mjs`
- `lib/bloomops/content-access.mjs`
- `lib/bloomops/content-approval-access.mjs`
- `lib/bloomops/content-file-access.mjs`
- `lib/bloomops/content-files.mjs`
- `lib/bloomops/portal-content-api.mjs`
- `lib/bloomops/portal-content-values.mjs`
- `lib/bloomops/portal-content.mjs`
- `scripts/content-approvals-review-local.mjs`
- `scripts/portal-content-review-local.mjs`
- `scripts/portal-content-smoke-local.mjs`
- `scripts/portal-content-smoke-worker.mjs`
- `tests/bloomops-authorization.test.mjs`
- `tests/bloomops-content-ui.test.mjs`
- `tests/bloomops-portal-content-http.test.mjs`
- `tests/bloomops-portal-content-page.test.mjs`
- `tests/bloomops-portal-content-ui.test.mjs`
- `tests/bloomops-portal-content.test.mjs`
- `tests/bloomops-shell.test.mjs`

### Historical C5 preflight: verified C4 closure and exact C5 base

C4 PR #25 merged as `5b3e3c3ac3eae69b75310f73f9f54c7a85edc095`, the exact requested C5 base. Read-only checks confirmed [Deploy staging 34333717208](https://github.com/Beeyach/bloomops/actions/runs/34333717208) and [Verify zero-to-current 34333717121](https://github.com/Beeyach/bloomops/actions/runs/34333717121) both completed successfully on that SHA; the C5 contract records successful disposable cleanup. Branch preflight was clean and contained only the C5 phase contract and temporary prompt after the base. All requested preflight documents and relevant C1–C4 implementation/tests were read before implementation.

## Approvals + Revision History (C5)

Additive `0017_c5_content_approvals.sql` adds `content_review_revisions` (13 columns) and `content_approval_rounds` (18 columns), seven indexes and ten triggers. Composite workspace/Content/revision FKs and workspace membership provenance FKs prevent cross-parent references. Revision insertion validates the exact current structured copy and platform labels; updates/deletes are refused. Round insertion fixes its matching revision/number, a partial unique index permits one Requested round, and update/delete triggers allow exactly one terminal decision without rewriting earlier provenance or feedback. Current inventory: 18 domain migrations, 41 domain tables, 77 total fresh tables including inherited tables/ledgers, 100 migration-defined indexes, 37 triggers. Migrations 0013–0016 and every prior snapshot table definition are unchanged; Content is not rebuilt.

### Implementation decisions

- `content_items.revision` remains the shared CAS counter; every request/response/withdraw consumes it. Each request separately allocates a durable review ID and monotonic per-Content round number. No extra approval status lives on Content, and activity never owns approval state.
- Owner/Admin/PM request and withdraw under current C1 scope. Team may read current scoped history, not coordinate formal approval. PM/Team restricted access requires exact Client/Social Service assignment; department/owner/Project/Action relationships grant nothing.
- Request requires `client_review`, Client approval enabled, Client eligible visibility, valid live Client/optional canonical Social Service, expected CAS and no open round. One D1 batch captures current SQL fields/platform labels, inserts revision/round/activity and consumes CAS without changing stage. Immutable requester/request-key/consumed-revision evidence makes identical retries converge.
- Requested freezes reviewed title/type/hook/script/caption/CTA/date, all workflow flags, platform associations and stage/context through conditional writes plus database triggers. Visibility, identity/membership/role/workspace, contacts and assignments remain live/revocable. Pillar and internal owner remain editable. Request/edit/platform/date and response/response/withdraw/edit/stage races cannot produce conflicting canonical facts.
- Any currently linked active Client contact for the exact Client may respond via the narrow endpoint. Approve resolves that round and moves Content to Approved. Changes Requested requires 1–2,000 normalized UTF-16 units of plain-text feedback, stores durable round feedback and updates current C2 Revision Requested context. Withdraw preserves revision/history, records coordinator/time/reason, leaves Client Review and unlocks edits. New requests create new rounds, never overwrite old ones.
- C2 direct internal Client Review → Approved is blocked when approval is required; Requested also fences direct internal Revision Requested. Internal Review rework, Revision Requested → Editing, approval-disabled skips and Published terminal behavior remain. C2 retry evidence excludes C5-generated stage events.
- Portal Home adds only conditional “Approval needed” links and `/portal/approvals/[roundId]`. Exact snapshot keys: `title,type,hook,script,caption,cta,targetPublishDate,platforms`; envelope: `id,number,requestedAt,snapshot`. Plain-text rendering excludes internal pillar/owner/membership/CAS/context/activity/Service/Department/storage authority. C4 has no immutable File versions, so **all Files are explicitly excluded from review snapshots**. No R2 access or File mutations occur in approvals.
- Client GET is actionable-only. A completed POST retry may acknowledge only the same responder and normalized decision/feedback under live current access; it returns no history or snapshot. The browser keeps a just-completed confirmation. Coordinator withdrawal retry similarly matches original coordinator/reason/consumed CAS.
- Internal history is 20 rounds/page in descending round order, with safe current names for durable provenance memberships, timestamps, feedback/reason and expandable snapshots. Home uses an eligible-only 200+1 SQL bound; hidden rows cannot alter counts/overflow/empty state. Relational assignment predicates avoid bind-list growth; platform/snapshot/history reads perform no per-row API/File/R2 queries. Client operational history continues to filter each Content event by current Content readability.
- Shared exact JSON/query, authorization-before-input, Origin, no-store and safe failure conventions remain. No new dependencies, providers, deployment configuration, queues or notifications were added. Cloudflare D1/Workers/Wrangler guidance informed atomic batches and disposable runtime verification; latest Workers types `5.20260908.1`, pinned Wrangler schema and current D1 batch documentation were inspected. The live design reference loaded and was visually inspected; existing Bloom primitives/editorial spacing are reused.

### C5 verification evidence (2026-09-09 local session)

| Check | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; no package/lock changes |
| Focused C5 schema/domain/access/HTTP/UI/concurrency | 139/139 passed |
| Combined C1–C5 Content regression | 599/599 passed (C1 133, C2 105, C3 111, C4 111, C5 139) |
| B1–B7 Work regression | 946/946 passed |
| Exact Release A/core command retained below | 421/421 passed |
| Full `npm test` | 4,629/4,629; zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available lint/type checks; final Worker rebuild includes the browser anchor correction |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22; fresh schema/ledgers, exact no-op second pass, disposable cleanup |
| `node scripts/content-approvals-smoke-local.mjs` | 65/65 actual workerd/D1/R2 checks; two-round story, preserved C4 bytes, C3 projections, lock races, late rollback, retries, real issued-session revocation, large scopes |
| C4/C3/C2/C1 runtime smokes | 64/57/54/43 passed |
| B1/B2/B3/B4/B5/B6/B7/A11 runtime smokes | 25/28/47/38/42/34/86/26 passed |
| Built `auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed |
| Local external `verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed |
| `content-approvals-review-local.mjs` browser/HTTP | Final complete run 91/91; 53 captures at 1440/1024/768/390/320; two-round long-copy/feedback story, keyboard/focus, touch, reduced motion, distinct Clients, current revocations |
| Changed JS/JSX syntax; `git diff --check` | 44 files parsed; no whitespace errors |
| Drizzle schema/snapshot consistency | Generate reports no schema changes; no additional migration created |
| Dependency comparison against exact C4 base | Same 53 advisories/affected packages (1 low, 43 moderate, 9 high, 0 critical); zero advisory/package delta and byte-identical package manifests/lockfile |

Focused commands: `node --test tests/bloomops-content-approvals-*.test.mjs`; combined Content uses the C1 `{access,domain,http,schema,ui}` pattern and C2 `content-pipeline-*`, C3 `content-calendar-*`, C4 `content-files-*`, C5 `content-approvals-*`. Work uses `tests/bloomops-{projects,milestones,actions,deliverables,files,projections,release-b}-*.test.mjs`. The exact 421-test Release A/core command remains in the B6 section below. Full tests use `PATH=/tmp/bloomops-c4-tools-SGrX9Q:$PATH npm test` for the host's missing `python` alias; installed `/usr/bin/python3` executes the five inherited packaged-skill ZIP tests without changing application/test behavior.

The browser command is `LD_LIBRARY_PATH=/tmp/bloomops-c4-tools-SGrX9Q/browser-libs/usr/lib/x86_64-linux-gnu node scripts/content-approvals-review-local.mjs --playwright /tmp/bloomops-c4-tools-SGrX9Q`. Its final pass checks 53 layouts, including two expanded immutable history snapshots, 1,498-character feedback, request/approval/withdrawal dialogs, frozen edit fields and both Client/coordinator touch controls. Screenshot inspection included the live reference, narrow review copy, 320px request/feedback dialogs and their visible focus rings. During development the browser caught a missing history anchor (fixed locally in C5), optional-label selectors were corrected, and its feedback assertion was aligned with the existing outer-whitespace normalization after inspecting stored round/context equality. No production rule was weakened. Earlier incomplete browser runs do not count as final evidence.

The exact-base audit ran from an isolated temporary extraction of `package.json` and `package-lock.json` at `5b3e3c3ac3eae69b75310f73f9f54c7a85edc095`, using `npm audit --package-lock-only --json` for a like-for-like comparison. Advisory IDs/affected package sets, ranges, severities and counts match. npm's transitive `effects` attribution differed for two Tiptap entries between installed-tree/lock-only reports; this is not a dependency or advisory change. No upgrade or audit-fix command ran.

Raw evidence lives in `/tmp/bloomops-c5-*`, not durable CI artifacts. Browser tooling/libraries and the inherited Python alias are reused outside the repository at `/tmp/bloomops-c4-tools-SGrX9Q`; no app dependency change was made. The local preview's in-memory loopback origin override leaves the developer's `.dev.vars` unchanged. Browser fixtures use fresh synthetic local workspaces and example.com identities; they are not staging or production business data. Disposable workerd and zero-to-current databases/configs are removed by their harnesses; browser fixtures remain local development state. Existing login rate limits occasionally required bounded local waits and were not changed. The requested temporary prompt was deleted and has zero net diff against the exact C4 base. The final PR body carries the exact head SHA and complete changed-file inventory.

Final net scope is 53 changed paths against the exact C4 base, including the C5 contract and generated migration snapshot. The owned loopback preview was stopped after verification; other development processes and `.dev.vars` were left untouched. The final external verifier was rerun after its first post-smoke attempt correctly hit the unchanged sign-in rate limit; only the complete 21-check pass is counted.

Deliberate limitations: structured copy/date/platform review only (no File review/versioning), no named-reviewer assignment, no general Client Content portal/navigation/history, no comments, notifications/email, providers/publishing, templates, generalized Deliverable approvals, C6/C7, Ads/Systems, production/DNS, real payments, staging business-data writes or Leadsthatbloom changes. Existing 53 inherited dependency advisories remain out of scope. C5 closure and any remote C5 deployment/gate are not claimed. Next phase is C6 only after independent audit, delegated/user-controlled merge, both exact-merge-SHA gates, and a separate implementation instruction.

## Historical C4 handoff

### Verified C3 closure and C4 base

C3 PR #24 merged as `6be5b4d668545d630c463e0a6b457ce7d53d6338`, the exact requested C4 base. Read-only checks verified [Deploy staging 34296771989](https://github.com/Beeyach/bloomops/actions/runs/34296771989) and [Verify zero-to-current 34296772032](https://github.com/Beeyach/bloomops/actions/runs/34296772032) succeeded on that exact SHA, including the successful create/migrate/twice/verify/delete step. C4 preflight changed no remote resources. Branch history contained the authorized C4 contract and temporary prompt after this base.

## Recordings + Content Assets (C4)

Migration `0016_c4_content_assets.sql` adds one five-column fixed `content_asset_links` table: File primary key, workspace, Content, exact `recording|asset` purpose and creation timestamp. It has workspace/composite asset/composite Content FKs, a workspace/Content index, immutable update/delete triggers, and insert triggers excluding both attachment-family orders. The snapshot chain preserves every previous table exactly. Migrations 0012–0015 are unchanged. Current inventory: 17 domain migrations, 39 domain tables, 75 total fresh tables including inherited tables/ledgers, 93 migration-defined indexes and 27 triggers.

Canonical `assets`, `asset_upload_attempts` and private `FILES` R2 bytes remain the sole storage system. A fixed-parent policy adapter shares B5's reserve/write/finalize, recovery generations, checksum validation, CAS changes, cleanup and download protocol. B5 `file.manage` stays coordinator-only. The common lost-finalize-response branch now also reauthorizes after its R2 head await. Ready still needs server-computed SHA-256 and matching R2 key/size/MIME/etag/checksum, one readiness timestamp and one canonical `FILE_UPLOADED` event. Unknown D1 outcomes never authorize blind deletion; recovery uses fresh keys and old writers cannot win. File operations never update Content, platform associations, dates, publication or parent lifecycles.

Internal Content file management uses the dedicated `content.file.manage` action capped by current C1–C3 readability. Team requires exact Client or Social Service assignment; restricted Content or Files require that exact assignment for PM/Team. Department, owner, Project and Action relationships grant nothing. SQL rechecks current membership/workspace/identity/role/parents at every relevant read and committing batch.

Client access is only `recording.view` / `recording.upload`: current contact linkage, shared Content, recording required, Waiting for Recording, canonical same-client optional Social service, and shared recording-purpose File. All eligibility is rechecked at reservation, retry, finalization and before/after R2 downloads. Clients retry only their own upload. They cannot choose visibility, change purpose/parent, archive, change visibility, or access production assets. Server-selected upload visibility is `client`.

The conditional Home “Recording needed” section links to `/portal/recordings/[contentId]`; there is no general Content/Social portal destination. The request DTO is exactly `id,title`; title is explicitly client-safe for an eligible recording request. File DTO is exactly `id,filename,mimeType,byteSize,status,readyAt`. Non-ready entries are shown only to their uploader for retry; only Ready can download. Both Waiting and Revision Requested `stage_context`, all editorial copy except title, owner, revision, internal activity, service IDs, storage authority and hidden counts stay private. Request projection is at most 200 eligible rows, filtered before limiting, with no hidden-row overflow indicator.

Content has a deliberate 200-File lifetime cap including archives, atomically enforced in reservation. Lists are bounded SQL with no R2 probes. Internal Content File history and Client history filter historical filenames through current File+Content authority, including archive. A separate bounded Content-file history query merges with B5 history by timestamp/rowid so the combined Client query stays below D1's 100-bind ceiling. B5 Home/Project projections remain B5-only.

### Deliberate recording limitation

Retained B5's 5 MiB (5,242,880 bytes) positive-byte limit and unchanged `assets` CHECK. Current [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) specify 128 MB per isolate, not per request. Existing bounded upload parsing plus `crypto.subtle.digest` holds the bounded bytes in memory; larger media requires a separately designed protocol/migration, not changing a number. Current [R2 binding docs](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and published Workers types `5.20260908.1` confirm server-supplied SHA-256 integrity checking and returned checksums. The exact 5 MiB boundary passed real R2. Unknown browser MIME uses `application/octet-stream`; MIME is syntactically validated, not a malware/content verdict. No scanner, transcoding, multipart protocol, public URL, presigned URL or third-party upload service was added. The portal explains short clips and asking the agency about larger recordings.

### Verification evidence (2026-09-08 local session)

| Check | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; no package/lock changes |
| Focused C4 schema/domain/access/HTTP/R2/UI | 111/111 passed |
| C3 / C2 / C1 focused regression | 111/105/133 passed |
| B7 / B1 / B2 / B3 / B4 / B5 / B6 focused | 29/97/173/203/197/171/76 passed |
| Release A/core command retained below | 421/421; updated shell included in full suite |
| Full `npm test` | 4,490/4,490; zero failures/skips/cancellations |
| `npm run build`; `npm run cf:build` | Both exit 0, including available lint/type checks |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22; fresh schema, complete ledgers, exact no-op second pass, disposable cleanup |
| `node scripts/content-files-smoke-local.mjs` | 64/64 actual workerd/D1/R2; includes real Better Auth-issued Client/Team sessions revoked during binding awaits |
| C3 / C2 / C1 runtime smokes | 57/54/43 passed |
| B1/B2/B3/B4/B5/B6/B7/A11 runtime smokes | 25/28/47/38/42/34/86/26 passed |
| Built `auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed |
| Local external `verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed |
| Browser/HTTP | Final complete run 75/75, 47 captures at 1440/1024/768/390/320; keyboard/focus, touch, reduced motion, two-Client story |
| Changed JS/JSX syntax; `git diff --check` | 39 files parsed; no whitespace errors |
| Dependency audit | Exact current base and head vulnerability objects identical: 53 (1 low, 43 moderate, 9 high, 0 critical) |

Focused commands use `node --test tests/bloomops-content-files-*.test.mjs`, the existing C1/C2/C3 patterns, each B1–B7 pattern and the Release A/core command retained in B6 below. Full tests use a temporary PATH alias from `python` to installed `/usr/bin/python3` for five inherited packaged-skill ZIP checks; no application/test behavior was weakened. Browser dependencies were installed outside the repository in `/tmp/bloomops-c4-tools-SGrX9Q`, with extracted shared libraries on `LD_LIBRARY_PATH` because the host lacks them. The live design reference loaded successfully and was visually inspected.

The checked-in browser harness is `scripts/content-files-review-local.mjs`; pass `--playwright /tmp/bloomops-c4-tools-SGrX9Q` in this environment. It uses only loopback development D1/R2 and synthetic identities. The local preview helper overrides only its in-memory app URL to its actual `http://localhost:8787` origin; the developer's existing `.dev.vars` remains untouched. Initial simultaneous fixture/bootstrap runs hit SQLite locking and auth rate limiting; completed evidence runs are serialized, and only complete passes count. Production auth limits remain unchanged. The C4 disposable runtime applies pinned Wrangler Node-compat shims with an unconditional dry-run and a generated config containing no remote bindings; this supports Better Auth's optional Node dependency imports without changing app compatibility flags.

Raw evidence is local `/tmp/bloomops-c4-*`, not durable CI artifacts: focused/full/build/CF/zero/runtime/HTTP/verifier logs, base/head audit JSON and browser screenshots. The exact base audit ran from a detached temporary worktree. Byte authorization is checked before handing off the response stream; delivered bytes cannot be recalled. Cleanup remains B5's bounded explicit-retry cleanup, not an orphan sweeper. 53 inherited advisories remain out of scope, with zero C4 delta. No remote C4 migration/deployment, real email, staging business data, provider operation, production, DNS or Leadsthatbloom mutation occurred.

Final scope is 47 changed paths against the exact C3 base, including the phase contract and generated migration snapshot. `C4_CODEX_PROMPT.txt` was removed as instructed and has zero net diff against that base. The final PR body carries the complete changed-path inventory and final commit SHA. Screenshot inspection included the live design gallery, internal long-filename layout, and client upload dialogs at 390/320 pixels; controls, focus rings and the short-clip explanation remain readable.

C5 approval rounds/revision history and C6 general Content portal, notifications, comments, templates and provider publishing are intentionally absent. The next planned phase is C5, only after independent audit, user-controlled C4 merge and both exact-C4-merge-SHA gates, then a separate implementation instruction. C4 must remain OPEN/UNMERGED for independent audit.

### Verified C2 closure and C3 base

C2 PR #23 merged as `fed68697ff9f45e5c0228655bec2aaee3583f1c2`, the exact requested C3 base/main SHA. Read-only preflight verified [Deploy staging 34291205923](https://github.com/Beeyach/bloomops/actions/runs/34291205923) and [Verify zero-to-current 34291205922](https://github.com/Beeyach/bloomops/actions/runs/34291205922), including the successful create/migrate/twice/verify/delete step, on that exact SHA. Branch history contains only the authorized C3 contract/prompt after that base before this implementation. C1 closure remains recorded in the historical sections below.

## Calendar + Platforms (C3)

The additive `0015_c3_calendar_platforms.sql` introduces only the four-column relational association table, its composite primary key, workspace and composite Content foreign keys, two bounded text checks and one platform-filter index. Content retains all 24 C2 columns and gains two indexes (seven total): workspace/id uniqueness for the FK and workspace/target-date/id for calendar ordering. The journal contains 16 migrations and domain schema 38 tables. C1/C2 migrations and triggers, dependencies/lockfile, Worker configuration and R2 subject model remain unchanged.

### Implementation decisions

- Canonical docs/history, including original model commit `0757d45`, specify associations but no fixed provider vocabulary. Labels are user-entered channels, normalized NFC/outer whitespace/internal spacing, with lowercase normalized keys. A set has 0–12 distinct labels, each 1–60 UTF-16 units; keys allow 120 units for case expansion. Controls, all Unicode format characters/bidi and malformed UTF-16 are rejected. Duplicate normalized keys reject atomically. Display spelling survives; case-only label edits are significant. Code-point sorting matches SQLite BINARY ordering for astral/BMP mixtures.
- Initial platforms share the existing creation batch and immutable request provenance. Legacy creation events mean an empty initial set. The dedicated PUT accepts only platforms/expectedRevision, replaces the complete relational set, and shares strict Content CAS with details and C2 transitions. Current identical/empty-removal sets are silent no-ops. Significant changes append one `CONTENT_PLATFORMS_CHANGED` event. Current-readable immutable consumed-revision evidence acknowledges identical response-loss retries after later changes without restoring an old set; incompatible reuse conflicts.
- Activity, conditional deletion/insertion and the final revision/timestamp update are one atomic D1 batch. Every committing predicate rechecks live Identity → Role → Scope → Visibility and the expected revision. Keeping the revision update last lets every statement use the same unconsumed CAS condition. Revocation/restriction fences writes; late failures roll back facts and history. Parent, stage, flags, context, target date and publication timestamp remain unchanged.
- Calendar GET requires exact real start/end dates, inclusive 1–42 days, plus the existing exact Content filters and platform. Protected authorization precedes invalid/duplicate query and body handling, with Origin/no-store/safe error mapping preserved. The single SELECT uses relational assignments, date/ID ordering and visible 200+1 overflow; correlated bounded platform aggregation and EXISTS filtering avoid duplicate Content rows or N+1 requests. No R2 access or calendar writes exist.
- Dates stay floating YYYY-MM-DD values in the existing helper's supported 0100–9999 range. The UI defaults to the UTC current month; published timestamps remain C2 instants and do not relocate planned dates. Undated Content stays in the list. Stable offset pages can shift under concurrent edits, just as C1 pages can.
- The monthly agenda groups complete rows by date. Inspection found the inherited seven-column calendar draggable and title-only, unsuitable for long titles, multiple channel labels and 200 same-day items at narrow widths. C3 keeps explicit date edits in the canonical form. Social list retains stage filters, adds platform filtering, and create/edit/detail expose platform editing with field errors and safe conflict reload. No per-day item clipping or drag/drop mutation is introduced.

### Verification evidence

Only final completed runs count below. Node 22.22.1 is used. Browser tooling is installed outside the repository; local example.com identities and development R2 mail only. No staging business-data writes, production actions, provider calls, real email, DNS or Leadsthatbloom changes occur.

| Command / check | Result |
|---|---|
| `npm ci` | Exit 0; 560 installed / 561 audited; package/lock unchanged |
| Focused `bloomops-content-calendar-*.test.mjs` | 111/111: access 44, domain 48, HTTP 11, schema 2, UI 6; final strengthened access rerun 44/44 |
| C2 pipeline / C1 Content regressions | 105/105 and 133/133 |
| B7 / B1 / B2 / B3 / B4 / B5 / B6 focused regressions | 29/97/173/203/197/171/76, all passed |
| Release A/core command in B6 below | 421/421; additional updated shell suite 17/17 |
| Final `npm test` | 4,379/4,379; zero failures, cancellations or skips; exit 0 |
| `npm run build` / final `npm run cf:build` | Both passed; final CF build includes Next/lint/type checks; exit 0 |
| Fresh/no-op local zero-to-current | 22/22; all 16 migrations, identical second-run schema/ledgers, cleanup complete |
| C3 actual disposable workerd/D1 | 57/57; no R2 binding |
| C2 / C1 actual workerd/D1 | 54/54 and 43/43 |
| B1/B2/B3/B4/B5/B6/B7/A11 actual D1/R2 smokes | 25/28/47/38/42/34/86/26, all passed |
| Built Worker `auth-smoke-local.mjs` | Final isolated rerun 144/144; exit 0 |
| Local external `verify-staging.mjs` | 21/21 on development loopback; exit 0 |
| C3 browser/HTTP acceptance | 120/120; 38 captures at 1440/1024/768/390/320; keyboard/focus, touch, reduced motion, dense dates, range edges and issued-session revocation; exit 0 |
| Changed JS/JSX syntax / `git diff --check` | 32 changed paths parsed; whitespace clean |
| Dependency audit / exact-base comparison | 53 current advisories; complete base/current JSON identical; +4 high vs historical 49 |

The full suite exposed a stale internal-shell page-count assertion, updated from 20 to 21 while retaining server authorization checks and adding the calendar to anonymous redirect coverage. Early source/test failures and interrupted runs are not counted as passes. Initial concurrent browser fixture setup and HTTP smoke collided on local SQLite and the HTTP harness's global user/membership counts; the completed HTTP and browser evidence runs are serialized. Browser harness selectors distinguish the named Platforms section from its textbox, and the workspace-revocation case retains its revision before revocation. Only a complete successful browser rerun counts. Protected application behavior and auth rate limits were not weakened.

### Evidence limitations and gate

The live design reference was successfully loaded past the “Design gallery” heading and visually inspected. The final browser captures are `/tmp/bloomops-c3-review-final3`; the final browser/full/HTTP logs are `/tmp/bloomops-c3-browser-final3.log`, `/tmp/bloomops-c3-full-final.log` and `/tmp/bloomops-c3-http-final.log`. Screenshots and raw logs/audit JSON are local `/tmp/bloomops-c3-*` artifacts, not permanent CI artifacts. Runtime harnesses are checked in and reproducible. The local zero verifier proves fresh/no-op schema and cleanup; it is not a C3 post-merge remote gate.

Contemporary `npm audit --json` reports 53 advisories (1 low, 43 moderate, 9 high, 0 critical) for both C3 and an external directory containing the exact base package/lockfile. Their full JSON outputs are identical and package/lock diff is zero. This is +4 high advisories versus the historical 49-advisory baseline (previously 1 low, 43 moderate, 5 high), with zero C3-vs-current-base delta. Historical raw audit JSON is absent after the session environment reset, so historical advisory-by-advisory attribution is not claimed. Dependency remediation remains inherited work, outside C3.

Final scope is 41 changed paths against the exact base; the temporary prompt has zero net diff. The owned local preview was stopped intentionally with SIGINT (wrapper exit 130), and port 8787 was confirmed closed; this is cleanup, not a failed verification check.

C4 recordings/Content assets, formal approvals/revision history, Client Content portal, comments, notifications/templates and provider publishing/integrations are intentionally absent. The PR must stay OPEN and UNMERGED for independent ChatGPT audit. Only after audit, user-controlled merge, and Deploy staging plus Verify zero-to-current on that exact C3 merge SHA may C4 start.

## Production Pipeline (C2)

Historical C2 implementation evidence follows. C2 is now closed through PR #23 and the exact-SHA gates recorded above. The narrow additive migration is `0014_c2_content_pipeline.sql`. It adds nullable current `stage_context` and one stage-filter index to canonical Content: 24 columns and five Content indexes. There is no new table, duplicate status, identity key or approval model. Historical migrations, C1 triggers, package/lock and Worker configuration remain unchanged.

### Implementation decisions

- The shared pure resolver derives the exact next applicable forward stage from current Content stage and flags. Recording, internal review and Client review are skipped only when their corresponding flag is false. Disabling a flag in its current stage preserves that stage and changes future resolution only.
- Only Internal Review/Client Review may request revision; Revision Requested returns only to Editing. Both waiting and revision entry require NFC/line-ending-normalized, nonempty context, bounded to 2,000 UTF-16 units with controls/bidi/malformed-Unicode rejection. Context lives on Content and clears when leaving the contextual stage. Historical C1 null context remains valid; there is no invented backfill.
- Published is terminal and receives its server timestamp only in the winning commit. Detail edits and retries cannot rewrite it. Approved is production state, not formal Client approval; Scheduled adds no calendar/platform behavior. C1-assigned Team fulfillment remains valid for all legal steps, including Approved; coordinator wording does not invent a new role restriction.
- The dedicated `content.transition` policy and POST endpoint retain C1 Identity → Role → Scope → Visibility. Owner/Admin coordinate; PM restricted and Team fulfillment require exact current Client/Service assignment. Owner, Department, Project and Action-only responsibility never grant Content access. Clients receive no internal Content or stage history.
- Every committing condition rechecks active workspace, membership/user/role identity, canonical same-workspace Client/optional Social Service, assignment, visibility, expected revision, source stage, three current flags and absent publication. Conditional activity and fact update use one atomic D1 batch; revocation or stale facts prevent both, and a late failure rolls both back.
- Content ID + consumed expected revision identify an operation without another request-key column. One immutable `CONTENT_STAGE_CHANGED` event records small from/to/context/revision facts. Exact retry under current read authorization acknowledges the operation, even after later edits or revision passes, without rewriting current state. Different target/context or an edit-consumed revision conflicts. Merely matching the current stage never proves a retry. Two identical concurrent transitions create one fact/revision/event; different transition/transition or transition/edit races have one winner.
- A reproduced C1 eligibility-window race needed one narrow correction: an edit whose revision is consumed after its initial read now returns conflict instead of a field-validation error. Owner/visibility validation remains unchanged when the revision is current. The regression injects a real transition between the detail read and eligibility query.
- Ordinary detail payloads still reject stage, publication and current context. The transition endpoint accepts exactly targetStage/expectedRevision/optional context, rejects all query keys and malformed/non-object JSON, authorizes first, and preserves Origin/no-store/sanitized 400/401/403/404/409/500 boundaries.
- Social detail exposes only legal controls with the existing Bloom dialog, required context, keyboard focus restoration and safe conflict/revocation reload. The existing list gains exact stage filtering over canonical facts with its bounded 200+1 pagination. No drag/drop or future-phase controls were added.

### Verification evidence

Node `22.22.1`; final completed runs alone count. Interrupted development checks were restarted and are not counted as passes. The shared HTTP verifier initially met a magic-link 429 after browser sign-ins; after the existing 60-second limiter expired, its complete rerun passed. No auth behavior or limits were changed.

| Command / check | Result |
|---|---|
| `npm ci` | 560 installed / 561 audited; package/lock unchanged |
| `node --test tests/bloomops-content-pipeline-*.test.mjs` | 105/105: access 49, domain 35, HTTP 10, schema 2, UI 9 |
| `node --test tests/bloomops-content-{schema,domain,access,http,ui}.test.mjs` | C1 133/133 |
| Separate B7/B1/B2/B3/B4/B5/B6 regression runs | 29/97/173/203/197/171/76, all passed |
| Exact Release A/core command retained in B6 below | 421/421 |
| `npm test` | Final 4,268/4,268; zero failures, cancellations or skips; exit 0 |
| `npm run build` | Passed including lint/type checks; final CF build reruns it |
| `npm run cf:build` | Final source passed with nested Next/lint/type checks; exit 0 |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 fresh/no-op, cleanup complete |
| `node scripts/content-pipeline-smoke-local.mjs` | Final actual disposable workerd/D1 54/54 |
| `node scripts/content-smoke-local.mjs` | Final actual C1 workerd/D1 43/43 |
| Prior B1/B2/B3/B4/B5/B6/B7/A11 D1/R2 smokes | 25/28/47/38/42/34/86/26, all passed |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | Final built Worker HTTP 144/144; exit 0 |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | Local external verifier 21/21; exit 0 |
| `node scripts/content-pipeline-review-local.mjs --out /tmp/bloomops-c2-review-final` | C2 128/128, 43 captures across 1440/1024/768/390/320; exit 0 |
| `node scripts/content-review-local.mjs --out /tmp/bloomops-c2-c1-review-final` | C1 96/96, 33 captures across the same five widths; exit 0 |
| Changed JS/JSX syntax / `git diff --check` | 23 paths passed Node/esbuild parsing; whitespace clean |
| `npm audit --json` vs saved C1 and contemporaneous exact base | 49 advisories; identity/range/severity/count delta zero; two dependency effects-link differences described below |

Fresh/no-op verification: 60 inherited + 15 domain migrations, 37 domain / 73 total tables, 89 explicit indexes, 23 triggers, clean integrity/foreign-key checks and identical schema/ledgers after replay. The local disposable directory was cleaned up. C1 schema/runtime assertions now preserve their 23-column prefix while C2 asserts the current 24-column model.

The actual C2 D1 smoke covers all flag paths, Published terminal/retry, both revision branches, context bounds, current-stage flag edits, exact restricted scope, three race shapes, response-loss after edits, late fact/activity rollback, assignment/membership/role/workspace/Social-parent/visibility commit fencing, ordinary-edit authority, parent lifecycle isolation, stage filtering and 240 assignments inside actual D1 limits. Node tests additionally exhaust the source/target matrix, Unicode/JSON/revision bounds, all responsibility non-grants, identity/flag/source-stage fencing, exact restricted PM/Team scopes, current history filtering and the eligibility-window race. No Release A/B parent lifecycle changes.

Dependency audit remains 49 (1 low, 43 moderate, 5 high; zero critical). The audit command exits 1 for these existing advisories. Compared with retained `/tmp/bloomops-c1-audit.json` and a contemporaneous audit of exact-base package/lock in an external temporary directory, advisory package identities, source/ranges, severity and counts are unchanged. npm reports two transitive `effects` attribution changes: the drag-handle-react edge moves from `@tiptap/extension-drag-handle` to `@tiptap/react`. All other vulnerability-entry fields match. This is a zero-advisory delta, not a zero-advisory tree or byte-identical graph report. No dependency or lockfile was changed.

### Changed-file inventory

Net against exact C1 base: **32 paths**, including the supplied C2 contract and excluding the removed temporary prompt.

- Schema (4): `lib/bloomops/schema.mjs`, `drizzle/0014_c2_content_pipeline.sql`, `drizzle/meta/0014_snapshot.json`, `drizzle/meta/_journal.json`.
- Domain/boundaries (7): `lib/bloomops/content-pipeline-values.mjs`, `content-pipeline.mjs`, `content-values.mjs`, `content.mjs`, `authorization.mjs`, `activity.mjs`, `client-activity.mjs`.
- API (1): `app/api/bloomops/content/[contentId]/transition/route.js`.
- UI (2): `components/bloomops/ContentPipeline.jsx`, `ContentViews.jsx`.
- Verification (12): three `scripts/content-pipeline-*.mjs`, `scripts/content-smoke-worker.mjs`, five `tests/bloomops-content-pipeline-*.test.mjs`, and existing authorization, Content schema and global schema tests.
- Documentation (6): this build state, domain model, index, Release C, C1 closure and C2 contract/evidence.

### Limits and handoff

All runtime verification is local: pinned Miniflare/workerd, disposable smoke D1/R2, and isolated development D1/R2 with example.com/R2 development mail for the built Worker. Playwright/Chromium stays outside the repository at `/tmp/bloomops-a11-browser`; session logs/captures are under `/tmp/bloomops-c2-*`. The owned loopback preview was stopped after acceptance. The live Bloomlab Design gallery loaded and was visually inspected. C2 browser acceptance covers all eight flag paths, both revision branches, context persistence, legal controls, terminal publication, safe conflicts, stage filtering, exact Team/restricted PM scope, Client denial, competing writes, current-session assignment/membership/role/workspace revocation, real touch and reduced motion. Long waiting/revision dialogs and detail, Published, conflict and filtered-list views passed geometry/controls at every required width. Mobile dialog/conflict and desktop revision captures were visually inspected. C1 create/edit/list/overflow acceptance also remains green. Browser fixture corrections used the canonical Client relationship-status column and awaited the actual transition response/reload link instead of the unrelated global toast alert. These checks do not replace exact-merge-SHA staging gates or constitute production/load certification. Existing offset pagination can shift with concurrent insertions; current null context on historical C1 stage rows remains possible. Retry provenance is bounded per event but retained in existing append-only activity, not a new approval-history model.

Temporary `C2_CODEX_PROMPT.txt` deleted with zero net diff against exact main. C3+ remains intentionally unimplemented: calendar/platforms, recording/File subjects, formal approval rounds, revision-history UI, Client Content portal, comments, notifications, templates and Ads behavior. No production, staging business data, DNS, real communication or Leadsthatbloom resources changed. Open PR must remain unmerged for independent ChatGPT audit; only user-controlled merge and both successful post-merge workflows on the actual C2 merge SHA unlock C3.

The C1 and earlier sections below retain historical implementation evidence; their earlier pre-merge scope/status language is superseded by current closure and C2 state above.

## Content Items Core (C1)

C1 is closed on exact merge `f1003c236cbce5102efcddd1bf7cda20e4f8ed8b` with both successful post-merge gates recorded above. The following is retained C1 implementation evidence. Migration `0013_c1_content.sql` adds one canonical `content_items` table: 23 columns, four justified indexes, four foreign keys and two narrow triggers. No historical migration, package/lock, Worker binding/configuration or A/B lifecycle is changed. The migration/snapshot chain remains additive.

### Implementation decisions

- Client-level Content or an optional fixed same-Client Social Service; canonical Service Type → Department slug `social` resolution, never names/type slugs. Existing Client/Service composite keys are reused. Closed/terminal Service status is not an invented Content restriction.
- Exact types: Reel, Static Post, Carousel, Story, Video, Email, Ad Creative, Other. Machine values and labels live together in `content-values.mjs`. Ad Creative is a type only.
- Title/type/pillar/owner/hook/script/caption/CTA, target publish date and exact workflow booleans are relational fields. Text limits are 200/120/2,000/20,000/10,000/1,000 respectively for title/pillar/hook/script/caption/CTA; NFC and line-ending normalization, optional blank-to-null, controls/bidi/malformed UTF-16 rejection. Flag defaults are recording false, internal review true, Client approval true.
- Storage contains all ten Release C stages; every C1 create is Idea with no published timestamp, and neither API nor UI accepts stage/published mutation. Visibility defaults internal; `client` is explicitly future eligibility with no portal access.
- Owner/Admin coordinate the workspace. PM coordinates ordinary Content; PM/Team restriction requires a current explicit Client/exact Service assignment. Team may read/create/edit inside that canonical scope. Client assignment reaches Client-level and that Client's Social-service Content; Service-only assignment reaches exactly that Social service. Department, owner, Project and direct Action assignment never grant Content scope.
- Every read/committing write fences current workspace, membership, role, parent, scope and visibility with relational SQL. Existing generic live-actor SQL is reused without an unrelated rename/refactor. Client activity now filters historical Content events by current readability, preventing old titles from surviving scope/restriction changes.
- Lowercase UUIDv4 request identity is unique per workspace/Client. Immutable `CONTENT_CREATED` activity snapshots normalized initial details and exact Service context. Identical retry after edits returns the same record unchanged; incompatible reuse/retargeting conflicts. Strict edit revision CAS gives one competing winner/event; a stale identical edit still conflicts. Current-revision no-ops are silent. Fact and significant activity share a conditional atomic batch.
- Protected parent-specific POST routes authorize fixed Client/Service context before parsing JSON, supporting Service-only Team members without granting Client detail access. Internal GET/PATCH routes and list filters use exact allowlists, duplicate-query rejection, real sessions, Origin, safe errors and no-store. No internal Content fields are projected into the portal.
- `/social` now lists real records; `/social/new`, `/social/:contentId` and `/social/:contentId/edit` use native Bloom controls and an editorial reading column. Ownership is responsibility; Client eligibility and workflow intent are explained without claiming future functionality.
- Visible lists use 200-row pages plus one readable overflow row, stable creation-timestamp/ID ordering and relational scope. There is no Content lifetime cap. Offset pages can shift under concurrent insertion. Parent choices show up to 200 Client-level plus 200 Social contexts with Client-name search and truthful overflow. Owner choices show the first 200 active internal members, announce overflow, allow unset ownership and preserve an existing selected owner. Empty-scope choices reveal no owner directory.

### Verification evidence

Use Node `22.22.1`. Commands run from the repository root; successful completed runs alone count as verification.

| Command / check | Result |
|---|---|
| `npm ci` | 560 installed, 561 audited; package/lock unchanged |
| `node --test tests/bloomops-content-*.test.mjs` | 133/133: schema 27, domain 36, access 44, HTTP 22, UI 4; final focused rerun exit 0 |
| `node --test tests/bloomops-release-b-*.test.mjs` | 29/29 |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 |
| `node --test tests/bloomops-projections-*.test.mjs` | 76/76 |
| Release A/core command retained in the B6 section | 421/421 |
| `npm test` | 4,163/4,163, zero failures/skips, exit 0 |
| `npm run build` | Passed, lint/type checks included; final CF build also reruns this exact command |
| `npm run cf:build` | Final source passed, nested Next build/lint/type checks included, exit 0 |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 fresh/no-op checks, cleanup complete |
| `node scripts/content-smoke-local.mjs` | Actual disposable workerd/D1: 43/43, exit 0 |
| `node scripts/projects-smoke-local.mjs` | Actual D1: 25/25 |
| `node scripts/milestones-smoke-local.mjs` | Actual D1: 28/28 |
| `node scripts/actions-smoke-local.mjs` | Actual D1: 47/47 |
| `node scripts/deliverables-smoke-local.mjs` | Actual D1: 38/38 |
| `node scripts/files-smoke-local.mjs` | Actual D1/R2: 42/42 |
| `node scripts/projections-smoke-local.mjs` | Actual D1: 34/34; 240 assignments, max 64 bindings / 12,918 SQL bytes |
| `node scripts/release-a-hardening-smoke-local.mjs` | Actual D1: 26/26 |
| `node scripts/release-b-smoke-local.mjs` | Actual D1/R2: 86/86 |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | Built Worker HTTP: 144/144, exit 0 |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | Local external verifier: 21/21, exit 0 |
| `node scripts/content-review-local.mjs --out /tmp/bloomops-c1-review-final` | 96/96, exit 0; 33 captures (32 app + live reference), all five widths, keyboard/focus, touch and reduced motion |
| Changed JS/JSX syntax and `git diff --check` | 33 paths passed Node/esbuild syntax checks; whitespace clean |
| `npm audit --json` | 49 existing advisories; current base/branch entries identical, count/severity delta zero |

C1 actual D1 exercises exact types/Idea, canonical Social binding, role/scope/restricted access, concurrent identical creation, retry after edit, incompatible/retargeted keys, strict edit races, forbidden authority fields, four injected fact/activity rollback cases, live commit revocation, 240 assignments with two visible pages and unchanged parent lifecycles. Node/HTTP coverage adds all non-grants, current membership/role/workspace changes, exact malformed JSON/query behavior and safe 400/401/403/404/409/500 responses. Additional Client-history query inspection measured at most 77 bindings / 11,380 SQL bytes for the Team predicate.

Fresh migration evidence: 60 inherited + 14 domain migrations, 37 domain / 73 total tables, 88 explicit indexes, 23 triggers, clean foreign-key/integrity checks, identical schema and both ledgers after no-op replay, and disposable local directory cleanup.

`npm audit --json` reports 49 advisories (1 low, 43 moderate, 5 high, no critical), unchanged from B7. A contemporaneous audit of the exact base's package/lock in an external temporary directory returned identical vulnerability entries and severity counts. Package and lock have no diff. The historical B7 JSON was not retained, so this proves today's base/branch equality and continuity with recorded historical counts, not a historical advisory-by-advisory time comparison. This is not a zero-advisory dependency tree or a full transitive-dependency security audit.

All runtime evidence uses pinned local Miniflare/workerd, disposable D1 for domain smokes, isolated development D1/R2 for the built Worker, and R2 development mail or in-memory test mail. `files-preview-local.mjs` supplies the existing unconditional Wrangler dry-run bundle/shims on loopback. Playwright 1.63.0/Chromium is installed outside the repository at `/tmp/bloomops-a11-browser`; logs/captures live at `/tmp/bloomops-c1-*`. These are local session artifacts, not remote post-merge acceptance. The live Bloomlab design gallery loaded and its palette/typography were inspected. Final browser acceptance covers empty/create/detail/edit/list/overflow at all five widths, long title/editorial copy, keyboard validation focus and navigation/save, real touch targets, reduced motion, Owner/Admin/PM and Service-scoped Team operations, Client denials, retry/CAS and current-session scope/suspension revocation. Mobile and desktop/tablet captures were visually inspected. The owned preview process was stopped after successful acceptance.

Initial verification exposed expected schema/navigation/action-matrix inventory changes as C1 became real, including the B6 actual-D1 harness's former whole-journal count, plus a flaky test that changed a random UUID substring rather than the version nibble. The fixture now uses a fixed invalid-version UUID. The B6 harness now verifies its closed 13-migration prefix and runs all current migrations. These corrections preserve the prior A/B invariants. No production behavior was weakened for a test.

### Changed files by area

Net against exact closed Release B base: **44 paths** (includes the supplied Release C/C1 contract docs, excludes the removed temporary prompt).

- Schema (4): `lib/bloomops/schema.mjs`, `drizzle/0013_c1_content.sql`, `drizzle/meta/0013_snapshot.json`, `drizzle/meta/_journal.json`.
- Domain/boundaries/navigation (8): four `lib/bloomops/content*.mjs` modules, `authorization.mjs`, `activity.mjs`, `client-activity.mjs`, `navigation.mjs`.
- API (4): Content list/item and Client-level/Service-specific creation route files.
- UI (7): four Social pages, `ContentForm.jsx`, `ContentViews.jsx`, scoped additions to `app/bloomops.css`.
- Verification (14): the B6 smoke migration-prefix assertion, three `scripts/content-*.mjs` harnesses, `_content.mjs`, five focused C1 test files, existing authorization/schema/Files-schema/shell inventory tests.
- Documentation (7): this build state, domain model, index, Release B/C, B7 closure and C1 phase contract/evidence.

The temporary `C1_CODEX_PROMPT.txt` has been deleted; comparison against exact closed Release B main shows no net diff for that path. C2+ remains unimplemented: transitions, calendar/platforms, recording/File subjects, approvals, revision-history screens, Content portal, comments, notifications, templates and Ads behavior. No production, staging business data, DNS, real email or Leadsthatbloom resource was changed. Independent ChatGPT audit, user-controlled merge, Deploy staging and Verify zero-to-current on the exact C1 merge SHA remain required before C2.

The following B7 and earlier sections preserve historical implementation evidence; their original pre-merge status language is historical and superseded by the exact-SHA closure above.

## Repository Agent Instructions

2026-09-07: Repository agent instructions migrated to canonical root `AGENTS.md` before A8. `CLAUDE.md` retained only as a compatibility pointer. No product/runtime/schema behavior changed in that handoff. A8 subsequently proceeded as recorded below; `AGENTS.md` was not modified by A8.

## Source

BloomOps was seeded from the clean tracked `origin/main` snapshot of `Beeyach/bloomtrack-pro`.

| Item | Value |
|---|---|
| Source repository | `Beeyach/bloomtrack-pro` |
| Source commit SHA | `270d9543381841fc05bc50dee4b8c163bf120e2f` |
| Source tree SHA | `bdcadaa8577eab35add61b77e4555cf34d97937d` |
| Source commit date | 2026-08-31T01:34:56Z |
| Imported on | 2026-09-05 (A0) |

BloomOps Git history is fresh. The source commit object does not exist in the BloomOps object store.

## Completed

- Planning documentation structure under `CLAUDE.md` and `docs/`
- A0: source snapshot imported, planning docs preserved, source SHA recorded, install/test/build verified
- A1: deployment path migrated to Cloudflare Workers through OpenNext, three isolated environments configured, Leadsthatbloom infrastructure references removed or neutralized, generated output and prospect exports removed from version control, fresh-database bootstrap made reproducible, local runtime verified, `bloomops-staging` deployed from GitHub Actions and verified live
- A2: BloomOps domain schema for Release A declared with Drizzle, materialised as SQL migrations, applied alongside the inherited schema, proven with invariant tests
- A3: Better Auth magic-link identity and sessions over the A2 tables, Resend mail behind a small transport, per-request workspace membership enforcement, first-workspace bootstrap, the invitation lifecycle, minimal sign-in and invitation screens, and removal of the inherited access-code login; verified by invariant tests, a full local Worker smoke, and the external verifier
- A4: one server-side authorization engine over the A2 and A3 tables (role, capability, client and service assignment scope, client-contact scope, internal/client/restricted visibility, leak-safe HTTP answers), member and invitation routes moved onto it, the inherited prospecting surfaces fenced to workspace administrators; verified by an explicit allow/deny matrix over the real schema and Better Auth sessions, the local Worker smoke, and the external verifier
- A5: the BloomOps application shells — an internal shell with the eleven PRODUCT_SPEC destinations for Owner, Admin, Project Manager, and Team Member, a separate client portal for Client, the boundary decided on the server by the A4 engine on every request, the Bloomlab-derived design system implemented in `app/bloomops.css` and `components/bloomops/`, and the inherited prospecting application moved to `/legacy` for administrators only
- A6: the Clients domain — a scoped list with lifecycle filters, create (Draft, primary contact, nobody invited), the `/clients/:id` detail with the five Release A tabs, multiple contacts with a database-enforced single primary, an internal owner that grants no access, manually managed health, and immutable operational activity in plain words; one migration, one new action (`client.create`), and an internal client resource descriptor that keeps Client memberships out of the internal surfaces
- A7: service engagements with independent lifecycles, the default departments and service types, and client-wide/service-specific team assignments; see "Services and Departments (A7)" for implementation and verification evidence
- A8: five workspace onboarding defaults, immutable version creation and atomic publishing, deterministic logical-key compilation, relational multi-version provenance, and atomic generated onboarding; audited and merged as PR #10, staging deployed successfully
- A9: authorized Draft → Onboarding activation, atomic A8 generation and core activity, durable initial-activation identity, recoverable invitation delivery, explicit portal contact linkage, and minimal internal activation/retry UX; merged with generic revoke ownership correction as PR #12
- A10: scoped onboarding portal and internal operational tab, durable Client submission, coordinator verification/completion, reasoned waiver/N/A, atomic onboarding completion and Client Active transition; merged as PR #13
- A11: twelve reproduced hardening corrections, 82 new adversarial regressions, fresh/no-op migration proof, actual workerd/D1 and built-Worker verification, and both Release A browser acceptance stories; merged as PR #14 with both post-merge gates passed on `3deed08`. Release A is closed. The following A11 section preserves its historical pre-merge evidence.

- B1: Projects Core, merged as PR #15 at `cacb2d3`, with both post-merge gates passed.
- B2: Milestones, merged as PR #16 at `74eb09a`, with both post-merge gates passed.
- B3: Actions + Dependencies, merged as PR #17 at `884051d`, with both post-merge gates passed.
- B4: Deliverables, merged as PR #18 at `ac71b35`, with both post-merge gates passed.
- B5: Files, merged as PR #19 at `4c6dad6`, with both post-merge gates passed.
- B6: Work + Home Projections, merged as PR #20 at `58647bd`, with both post-merge gates passed.

## Release B Hardening (B7)

B7 is schema-free and adds no product feature. Its production diff is limited to exact HTTP input validation and modal layer order. `release-b-smoke-local.mjs` extends the existing in-Worker D1/R2 harness; `release-b-review-local.mjs` extends the built-Worker browser harness. Neither is deployed or imported by the application.

### Reproduced gaps and narrow corrections

1. **Project body allowlists:** create, edit, transition and assignment add/edit accepted unknown fields by discarding them and applying recognized fields. This did not grant a foreign workspace or caller identity, but violated B7's exact-input acceptance requirement. Five new cases reproduced successful responses where the full request should be rejected. `projectBody` now rejects unknown fields before invoking a mutation. The prior B1 smuggling test now proves a 400 with no record creation, rather than expecting silent discard.
2. **Work query allowlists:** 22 internal/portal reads ignored invented filters, and the Project collection silently chose a value from duplicate filters. Twenty-three new cases reproduced 200 responses. A shared, small query validator runs after authorization. Only the documented Project collection filters and existing B3 Action filters are accepted; detail/child/portal routes accept none. Existing denial status and no-store behavior are preserved. Downloads cancel their prepared stream on an invalid query after retaining the existing post-R2 authorization check.

3. **Toast obstruction of mobile dialogs:** real Files browser captures showed a fresh success toast covering the Archive confirmation. An immediate `elementFromPoint` probe, while that actual five-second toast was still present, reproduced the intercepted button at 390px (`/tmp/bloomops-b7-repro-toast.log` and `bloomops-b7-repro-toast-390.png`). The modal token moves from 1100 to 1300 above notifications at 1200. No dialog layout, timer, focus logic or workflow changes. The Files browser harness now checks the real hit target at both 390px and 320px before slow history reads or screenshots can allow the toast to disappear.

The corrected HTTP suite is 28/28. Its pre-fix log is `/tmp/bloomops-b7-repro-http.log` (28 failing assertions on the unchanged runtime). Final focused evidence is `/tmp/bloomops-b7-regression-b7.log`: 29/29 node tests including one shared cross-domain matrix with 34 invariant assertions. The matrix also passes on real workerd D1/R2; it does not substitute a mock for storage acceptance. No lifecycle, scope grant, storage protocol, domain schema, package/lock, Worker configuration or workflow is changed.

### Audit coverage

| Area | Evidence and result |
|---|---|
| Identity, tenant, role, scope and visibility | B1–B6 access/HTTP regressions and real D1 smokes attack guessed/foreign IDs, current membership/workspace/role/contact, Client/Service/Project assignment revocation, Action-only scope/reassignment, restricted parent/children, Department/owner non-grants and hidden rows/history. Built B7 acceptance retains issued sessions during revocation. |
| Projects | B1 domain/schema/HTTP suite plus B7 real edit/edit and edit/status races, request-input rejection and late fact failure rolling back the earlier activity receipt. Health and child lifecycles remain independent. B1 intentionally has no creation request key; same-name creates remain distinct. |
| Milestones | B2 lifecycle/progress/order/access/HTTP suite, actual 200-row reorder, and B7 overlapping reorder/reorder, reorder/status and reorder/create preserve revisions, complete sets and unique slots. |
| Actions/dependencies | B3 lifecycle, assignment, seven views/seven filters, Client calendar/DST, cycles/hidden endpoints/Cancelled semantics, 200-row bounds and rollback. B7 adds a twelve-node concurrent cycle, add/remove/recreated-edge fencing, status/dependency and reassignment/progress races with final graph/event assertions. |
| Deliverables | B4 exact lifecycle, terminal timestamp, retry keys, mixed visibility, Team read-only and exact five-field Client DTO. B7 real edit/status and concurrent Delivered operations verify one winning revision/timestamp/event. |
| Files | B5 metadata/5 MiB/header/storage/parent ceilings, response loss, D1 uncertainty, missing objects, generation/cleanup fencing, downloads after await and archive retention. B7 repeats those on actual local R2 and adds shared overlapping expired recovery/late PUT/finalizer and visibility/archive races. |
| Home/Work/history | B6 canonical prefixes, live child counts, deterministic attention/recent names, 200-row bounds, current restriction/archive, read-only snapshots and no R2 binding. Actual 240-assignment D1 proof: 14 Home queries, maximum 64 bindings and 12,918 SQL bytes. |
| Integrated release | Dedicated local D1/R2 story activates a two-service Client, snapshots Common/Social/GHL, submits and verifies six requirements to Active, creates service-specific and Client-level Projects, children and real attachments, expands to ten Clients, checks Owner/Admin/PM projections and unchanged read snapshots, then runs real races. 86 checks passed. The final built-browser run passed 273 checks with 62 captures after the modal correction. |

### Verification

Use Node `22.22.1` (`PATH=/home/codespace/nvm/versions/node/v22.22.1/bin:$PATH`). Commands run from the repository root. Logs and screenshots are local `/tmp/bloomops-b7-*` artifacts, not committed client data.

| Command | Result |
|---|---|
| `npm ci` | 560 installed, 561 audited; package/lock unchanged |
| `node --test tests/bloomops-release-b-*.test.mjs` | 29/29, including 34 shared race assertions |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 |
| `node --test tests/bloomops-projections-*.test.mjs` | 76/76 |
| Release A/core command in the B6 section below | 421/421 |
| `npm test` | 4,030/4,030, zero failures/skips; final post-correction run exited 0 |
| `npm run build` | Passed, including lint/type checks |
| `npm run cf:build` | Passed after the modal correction, including nested Next build and lint/type checks; exit 0 |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 fresh/no-op checks; 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 indexes, 21 triggers; disposable local directory cleaned up |
| `node scripts/projects-smoke-local.mjs` | Actual D1: 25/25 |
| `node scripts/milestones-smoke-local.mjs` | Actual D1: 28/28 |
| `node scripts/actions-smoke-local.mjs` | Actual D1: 47/47 |
| `node scripts/deliverables-smoke-local.mjs` | Actual D1: 38/38 |
| `node scripts/files-smoke-local.mjs` | Actual D1/R2: 42/42 |
| `node scripts/projections-smoke-local.mjs` | Actual D1: 34/34; metrics above |
| `node scripts/release-a-hardening-smoke-local.mjs` | Actual D1: 26/26 |
| `node scripts/release-b-smoke-local.mjs` | Integrated actual workerd/D1/R2: 86/86 |
| `node scripts/release-b-review-local.mjs` | 273/273 browser/HTTP assertions, exit 0; 62 captures at 1440/1024/768/390/320 after the modal correction |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144, exit 0 |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21, exit 0 |
| `node scripts/files-review-local.mjs --out /tmp/bloomops-b7-files-review` | 143/143, exit 0; 44 captures plus design reference, including real-toast hit tests at 390/320 |
| Changed JS syntax checks; `git diff --check` | 21/21 JavaScript paths; CSS verified by both build stages; whitespace clean |
| `npm audit --json` | Expected advisory exit: 49 entries, 1 low / 43 moderate / 5 high; count/severity delta zero |

The built-application commands use `node scripts/files-preview-local.mjs` in an owned local process, stopped after the browser/HTTP checks. Its unconditional Wrangler dry run does not deploy. Run browser suites sequentially against that development Worker. Changed-file syntax command:

```sh
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
const files = [...new Set([...execFileSync('git',['diff','--name-only','58647bda6dd40739b7670e6c0f907b6f33689e5d'],{encoding:'utf8'}).trim().split('\n'), ...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')])].filter(path=>/\.(mjs|js)$/.test(path));
for (const path of files) execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
console.log(`${files.length} changed JavaScript syntax checks passed.`);
JS
```

### Evidence limits and remaining gates

The high advisory entries remain brace-expansion, Browserslist, nanoid, PostCSS and sharp. Release B accepts bounded metadata and raw File bytes; it does not pass uploaded content to CSS/build configuration/generator/image conversion inputs. No reachable Release B exploit was identified in this scoped review. This is not a zero-advisory dependency tree or a complete audit of the inherited editor and all transitive packages. The lockfile is unchanged; the recorded comparison proves counts/severities and dependency continuity, not a retained historical JSON advisory-by-advisory diff.

Local runtime evidence uses the existing pinned Miniflare/workerd, isolated D1/R2, development R2 mail and external Playwright/Chromium installation. The existing `files-preview-local.mjs` dry-run/Miniflare path is retained because the ordinary Wrangler preview proxy had a previously recorded local startup failure. No compatibility/package/configuration workaround is introduced. In-memory mail in the disposable Worker and local R2 mail in browser acceptance cannot contact a real Client. No production, staging business data, DNS or Leadsthatbloom resources were changed.

Fixture corrections did not change production behavior: the new ten-Client seed must provide each required primary-contact email, and Work row counts use the existing `.bo-project-row` rather than Home-only data attributes. One local Files fixture hit `SQLITE_BUSY` before exercising product behavior; a fresh isolated fixture passed. Verification command processes are isolated, preview ownership is explicit, and only successful completed runs count as final gates. The interrupted build/tracing attempt is superseded by the final rebuild. The new toast probe deliberately checks hit-testing before its five-second notification expires; a later successful click alone had missed this defect.

The live Bloomlab design gallery was loaded and inspected. Populated Home, Work Projects and safe portal captures were visually reviewed at all five widths; File upload/error/archive dialogs were also inspected, including both final 390/320 toast-regression captures with unobstructed confirmation controls. No redesign or new component library was needed.

At B7 local completion, independent audit, user-controlled merge and both exact-merge-SHA gates remained required; its schema-free diff required manual zero-workflow dispatch. Those gates subsequently succeeded on `c6509aa395a5db58310e2a0ae22a8a808082f77b`, closing Release B as recorded in the current branch state above.

### Changed files by area

- HTTP boundaries (13): seven Project/File route files, five existing domain API helpers and new `lib/bloomops/work-api-input.mjs`.
- Shared UI (1): `app/bloomops.css`, modal layer token only.
- Regression tests (3): existing Project HTTP test and new B7 HTTP/race suites.
- Local acceptance (5): shared `release-b-races.mjs`, integrated smoke runner/Worker, integrated browser harness and the existing Files browser harness.
- Documentation (6): this file, `DOMAIN_MODEL.md`, `INDEX.md`, `RELEASE_B.md`, B7 contract/evidence and the minimal B6 closure correction.

Net inventory is 28 paths against verified main. The temporary prompt is deleted with no net diff against main. No migration, schema, package/lock, configuration or workflow changes.

## Work + Home Projections (B6)

B6 is schema-free. Internal Home now composes bounded canonical Action views, Project attention, upcoming/review/approved Deliverables and recent successful delivery/upload facts. Work preserves Actions, all seven views/filters and B3 date/dependency semantics; its separate Projects tab gains readable-child summaries. Server components use the existing session/shell boundary. No API, schema, lifecycle, R2 read, dashboard counter, mutation surface, dependency or infrastructure change is required.

Home takes at most four Actions per Today/Overdue/Waiting/Review section, five Projects needing attention, six Deliverables to move forward and six recent outputs. Empty sections disappear. Counts and Milestone finished percentages are computed from current readable rows; File counts require Ready metadata and exact B5 parent visibility. Direct Action assignment never creates Project, Milestone, Deliverable, File or Client summary scope. Department and ownership remain non-grants.

Project attention is a deterministic read-only priority: At Risk, Blocked, Needs Attention, Project Waiting, readable overdue Actions, Deliverables in Client Review, Deliverables in Internal Review, Actions in Review, then Actions Waiting. Completed/Cancelled/Archived Projects stay available in Work but do not enter attention. Equal priorities use target date (null last), name and ID. No health/status is written. Deliverable targets include missed dates and the next fourteen Client calendar days; review/approved work may have no date. Recent outputs use the past fourteen elapsed days and exclude future events, hidden subjects and non-Ready Files. Current titles come from canonical records, without raw activity metadata or uploader/storage details.

### Verification

All commands use Node `22.22.1` (`PATH=/home/codespace/nvm/versions/node/v22.22.1/bin:$PATH`), locked Wrangler `4.129.0` and the unchanged package/lock/config. All required local verification passed, including the final mobile anchor correction and the subsequent built Worker HTTP/external checks.

| Command | Result |
|---|---|
| `npm ci` | Passed; 560 installed, 561 audited; unchanged 49 advisories (1 low, 43 moderate, 5 high) |
| `node --test tests/bloomops-projections-*.test.mjs` | 76/76, zero failures/skips; includes injected midnight/DST, current visibility, exact portal allowlists, 240-Project scope and read-only snapshots |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 |
| Release A/core command below | 421/421 |
| `npm test` | 4,001/4,001, zero failures/skips after the link correction |
| `npm run build` and `npm run cf:build` | Passed, including lint/type validation and the final mobile scroll offset; Cloudflare build also runs `npm run build` |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22; fresh then no-op schema/ledgers, 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 indexes, 21 triggers |
| `node scripts/projections-smoke-local.mjs` | 34/34 on disposable actual workerd/D1; 240 assignments, Home 14 queries, maximum 64 bindings / 12,918 SQL bytes per statement; no R2 binding |
| `node scripts/projects-smoke-local.mjs` | 25/25 on actual D1 |
| `node scripts/milestones-smoke-local.mjs` | 28/28 on actual D1 |
| `node scripts/actions-smoke-local.mjs` | 47/47 on actual D1 |
| `node scripts/deliverables-smoke-local.mjs` | 38/38 on actual D1 |
| `node scripts/files-smoke-local.mjs` | 42/42 on actual D1/R2 |
| `node scripts/release-a-hardening-smoke-local.mjs` | 26/26 on actual D1 |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 against the built local Worker |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 |
| `node scripts/projections-review-local.mjs` | 144/144; 47 captures at 1440/1024/768/390/320; isolated local workspace, canonical APIs, scopes/revocations, read snapshots, exact portal DTOs/original bytes and keyboard/focus/touch/reduced motion/no-JavaScript Home |
| Changed JS/JSX syntax checks below; `git diff --check` | 16/16 and clean |

Exact Release A/core regression command:

```sh
node --test tests/bloomops-onboarding-*.test.mjs tests/bloomops-activation.test.mjs tests/bloomops-hardening-*.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-invitations.test.mjs tests/bloomops-mail.test.mjs tests/bloomops-middleware.test.mjs tests/bloomops-clients.test.mjs tests/bloomops-services.test.mjs tests/bloomops-assignments.test.mjs
```

Changed-file syntax command (Node parser for JS/MJS; the installed esbuild JSX parser):

```sh
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
const files = [...new Set([...execFileSync('git',['diff','--name-only','4c6dad696d15fac4094b8172788b5c72642ff757'],{encoding:'utf8'}).trim().split('\n'), ...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')])].filter(path=>/\.(mjs|js|jsx)$/.test(path));
for (const path of files) {
  if (path.endsWith('.jsx')) await transform(readFileSync(path,'utf8'),{loader:'jsx',sourcefile:path});
  else execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
}
console.log(`${files.length} changed JS/JSX syntax checks passed.`);
JS
```

### Runtime, browser evidence and corrections

The built Worker is served with the unchanged B5 `node scripts/files-preview-local.mjs` harness: loopback only, development D1/R2, an unconditional Wrangler dry run for Node shims and the pinned Miniflare runtime. Local database ledgers were already current (60 inherited, 13 domain); the separate disposable zero verifier proves fresh application and no-op replay. No staging business data or account resource is modified. Browser dependency Playwright `1.63.0` and its Chromium installation live outside the repo at `/tmp/bloomops-a11-browser`; no manifest/lock change is needed. Logs use `/tmp/bloomops-b6-*.log`; browser captures use `/tmp/bloomops-b6-review/`. These local artifacts are session evidence, not committed remote acceptance evidence.

The live Bloomlab reference loaded and was visually inspected, along with populated Home and Work Projects at all five widths, scoped Team Home and the safe Client portal. The final B6 browser run passed 144 checks with 47 captures, including the actual mobile anchor position and zero hydration/runtime errors. An initial query probe found ambiguous CTE name columns; explicit aliases preserve distinct Project/Client/Service/Department context. The first D1 harness attempt tried to rename an immutable File; the fixture now verifies its original current filename against deliberately different historical metadata. The first browser assertion used nonexistent section IDs; selectors now use the actual labelled regions. Inspection also found B6 summary links targeted those nonexistent section IDs; the implementation now links to the existing `*-title` heading anchors, and browser acceptance checks the actual target position. That check then caught the mobile sticky header covering the heading; the four B6 destination headings now have a mobile scroll offset. Development sign-in throttling is respected without changing application authentication.

### Remaining gates and scope

B6 closed after PR #20 merged as `58647bda6dd40739b7670e6c0f907b6f33689e5d`. Read-only preflight verified [Deploy staging 34231285687](https://github.com/Beeyach/bloomops/actions/runs/34231285687) and [remote zero-to-current 34231727327](https://github.com/Beeyach/bloomops/actions/runs/34231727327) succeeded on that exact SHA. The zero verifier was manually dispatched because B6 was schema-free; disposable-database cleanup succeeded. B7 is recorded separately above. B6 added no new lifecycle, approval history, comments, notifications, queues, specialist pipelines, templates or auto-generation.

### Changed files by area

- Canonical reads (2): `lib/bloomops/actions.mjs`, `lib/bloomops/work-projections.mjs`.
- Internal UI (6): `app/(internal)/page.jsx`, `app/(internal)/work/page.jsx`, `app/bloomops.css`, `components/bloomops/OperationalHome.jsx`, `components/bloomops/WorkSummary.jsx`, `components/bloomops/Projects.jsx`.
- Projection tests (6): `tests/_work-projections.mjs`, `tests/bloomops-projections-domain.test.mjs`, `tests/bloomops-projections-access.test.mjs`, `tests/bloomops-projections-time.test.mjs`, `tests/bloomops-projections-bounds.test.mjs`, `tests/bloomops-projections-ui.test.mjs`.
- Local acceptance (3): `scripts/projections-smoke-local.mjs`, `scripts/projections-smoke-worker.mjs`, `scripts/projections-review-local.mjs`.
- Documentation (6): this file, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B6.md`, and the minimal B5 closure correction in `docs/phases/B5.md`.

Net inventory is 23 paths against verified main. The temporary prompt was deleted before the final implementation commit and has no net diff against main. No migration, schema, route API, dependency, configuration or workflow file changes.

## Files (B5)

B5 is closed through PR #19 and both successful post-merge gates on `4c6dad696d15fac4094b8172788b5c72642ff757`, recorded above. This section preserves its historical local evidence. B5 adds real Project/Deliverable attachments, with D1 as canonical metadata and authorization and R2 as canonical bytes. The phase contract is `phases/B5.md`; `DOMAIN_MODEL.md` records the complete relational model and storage protocol.

### Preflight and implementation decisions

- Verified ancestry and remote main at exact B4 merge `ac71b358f27894af8dd8108f004499cd765fca69` before substantial implementation. PR #18 and its two successful merge-SHA gates are recorded above. The requested phase-contract and task-carrier commits are preserved; `B5_CODEX_PROMPT.txt` is removed so it has no net diff against main.
- Reused the actual `FILES` binding: development uses local `bloomops-files-dev`, staging declares its own `bloomops-files-staging`, and production remains separately configured. Application code accepts the binding and never hard-codes a bucket. Wrangler configuration, compatibility date `2025-05-01`, staging/zero workflows, environment isolation and dependency manifest/lock are unchanged. Verification uses only disposable local bindings or the loopback development Worker with R2 mail and example identities.
- The explicit upload limit is **5,242,880 bytes (5 MiB)**. One exact, percent-encoded JSON header carries bounded metadata and the body contains only raw bytes. Validation precedes one bounded allocation; streaming reads enforce the actual and declared lengths. Filenames are NFC-normalized and bounded to 180 UTF-16 code units, MIME to 127 characters, and the metadata header to 4096 characters. Path/control/bidi/header injection and caller workspace/key authority are refused. The server computes SHA-256. This deliberately small buffered policy follows current official Workers limits and R2 API/consistency documentation linked in `DOMAIN_MODEL.md`; no platform-limit change, multipart infrastructure or scanning claim is introduced.
- Additive `0012_b5_files.sql` creates `assets` (19 columns), `asset_links` (5), and `asset_upload_attempts` (6), with 12 File CHECKs and composite workspace/File/uploader/Project/Deliverable FKs. Seven indexes are added: `assets_ws_id_uq`, `assets_ws_request_uq`, `assets_key_uq`, `asset_links_ws_project_idx`, `asset_attempts_key_uq`, `asset_attempts_cleanup_idx`, and `deliverables_ws_project_id_uq`. Six triggers preserve original details, fixed links, durable attempt identity and legal generation transitions. The generated Drizzle snapshot/journal match; no prior table or migration is rebuilt or rewritten.
- Each File has one fixed Project attachment or a Deliverable attachment within that exact Project. There is no mutable relinking or generic polymorphic endpoint. These are the coherent current upload surfaces required by B5. Client-only, Milestone, Action and onboarding attachment integrations remain outside this implementation. A committing relational count caps each Project at 200 Files including archives, keeping active lists complete and bounded. The form states the limit.
- Upload reserves **Uploading**, the link and a durable attempt in one conditional D1 batch. Each generation has a fresh server-owned workspace-separated opaque key and a five-minute lease. R2 must confirm key, size, MIME, etag and SHA-256 before a live-authorized conditional batch writes **Ready**, its one server timestamp and exactly one `FILE_UPLOADED` event. Reservation has no semantic upload event. UUIDv4 request keys plus immutable initial details and bytes make lost-response retries converge on one File; incompatible reuse conflicts.
- Put/finalize failures mark only the owned Uploading generation **Failed** when D1 can answer. Positive current D1 evidence fences cleanup; uncertain commits never justify blind deletion. A lost finalization response is success only with readable Ready metadata and matching R2 evidence. Database unavailability can leave Uploading and a known key for explicit retry after its lease. Recovery claims a new generation with CAS, so a late old writer or cleaner cannot overwrite/delete the winner.
- Cleanup checks at most ten eligible attempt keys per pass and rotates failed checks as well as successful ones, preventing persistent failures from starving later keys. Attempt rows remain after deletion because an interrupted PUT may finish late; a later explicit recovery/readiness/archive retry can revisit them. Cleanup is best effort, without a scheduled production sweep or guarantee of immediate orphan removal. Archive is terminal metadata removal from active views/downloads, retains previously Ready bytes and timestamp, and atomically records `FILE_ARCHIVED`. Ready visibility uses revision/CAS and `FILE_VISIBILITY_CHANGED`; no parent lifecycle changes.
- Owner/Admin/PM coordinate within current Project scope; Team is read-only. Restricted Project/Deliverable/File access for PM/Team requires explicit Project assignment. Department, Project ownership and Action-only assignment grant no File scope. Every query and committing write uses current identity/workspace/membership/role/assignment/parent visibility predicates, with no assigned-ID expansion. Historical File names are filtered by current File and parent readability in both Project and Client history.
- Clients receive only Ready Files where both File and all parents are currently Client-visible and contact linkage remains valid. The exact portal DTO has six fields: `id`, `filename`, `mimeType`, `byteSize`, `readyAt`, `attachmentLabel`. Labels never fall back to internal Deliverable titles. Hidden counts, uploader identity, storage keys, hashes, lease/revision details and internal activity are excluded. Empty/hidden-only File sets produce no portal section or navigation.
- Six route files provide Project list/upload, File read/visibility/archive, explicit retry, authorized byte download and two portal reads. Real sessions, Origin checks, strict allowlists, sanitized errors and no-store apply. Download resolves a File ID through D1, fetches only its canonical Ready key, then rechecks live authorization and generation after the R2 await. Missing/hidden/foreign/non-ready/missing-object cases share 404; no ordinary read repairs storage. Bytes use safe ASCII/RFC 5987 attachment filenames, `private, no-store`, `nosniff`, sandboxed content policy and same-origin resource policy.
- Project Files and coherent Deliverable attachments use existing Bloom rows, dialogs, buttons, typography, error notices and toast. Upload/retry, visibility, archive and downloads have hydration/pending guards and keyboard focus restoration. Client Files appear under reachable Projects only when actual shared records exist. No new UI library, provider, destination or major dependency was added.

### Verification

Node 22.22.1, Wrangler 4.129.0, pinned Miniflare/workerd and unchanged dependencies.

| Check | Result |
|---|---|
| `npm ci` | Passed: 560 packages installed, 561 audited. Existing 49 advisories remain: 1 low, 43 moderate, 5 high. |
| `node --test tests/bloomops-files-*.test.mjs` | 171/171 passed: 59 lifecycle/recovery/domain, 54 access, 27 real-session HTTP, 27 schema and 4 UI. |
| B1/B2/B3/B4 focused regressions | 97/97 Projects, 173/173 Milestones, 203/203 Actions/dependencies and 197/197 Deliverables passed. |
| Release A/auth/authorization/security/domain regression command recorded in the B3 section | 421/421 passed. |
| `npm test` | 3,925/3,925 passed, zero failures/skips. |
| `npm run build` and `npm run cf:build` | Both passed, including available lint/type checks. |
| `node scripts/files-smoke-local.mjs` | 42/42 passed inside actual disposable workerd with D1 and R2: reserve/put/finalize/cleanup failures, response loss, generations, live revocation, 5 MiB bytes/checksum/head/get/delete, isolation, parent preservation and integrity. |
| Prior disposable D1 smokes | B1 25/25; B2 28/28; B3 47/47; B4 38/38; A11 26/26 passed. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: 60 inherited + 13 domain migrations; 36 domain / 72 total tables including ledgers; 84 explicit indexes; 21 triggers; FK/integrity clean and schema/ledgers identical after the no-op second pass. |
| `npm run db:domain:migrate:local` | Migration 0012 applied to the existing development database; the fresh proof used a separate disposable target. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| `node scripts/files-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b5-review-final` | 139/139 passed, exit 0; 42 screenshots at 1440/1024/768/390/320px plus the loaded live design reference. |
| Changed JavaScript/JSX syntax and `git diff --check` | 42 syntax checks passed; diff check passed. The local preview argument guard also refused overrides before creating output or starting a Worker. |

The actual R2 smoke runs the domain inside a Worker bundled with existing esbuild and instantiated through the pinned Wrangler Miniflare runtime. The Node-side `getPlatformProxy` R2 preflight repeatedly stalled before returning a proxy; a direct Worker put/get/delete probe succeeded, so the stronger in-Worker harness exercises all D1/R2 boundaries there. No unverified upstream cause is asserted and no dependency/runtime configuration was changed. The harness refuses remote targets, owns temporary storage and disposes it.

Two normal Wrangler CLI previews stopped with `Error inside ProxyWorker` and an underlying `Network connection lost` cause, matching the failure signature in [workers-sdk #15317](https://github.com/cloudflare/workers-sdk/issues/15317). The exact dropped-connection trigger here is not established. `node scripts/files-preview-local.mjs` provides a reproducible loopback-only alternative: Wrangler first bundles the existing OpenNext output with an unconditional local `deploy --dry-run --no-autoconfig`, including its normal Node shims, then pinned Miniflare/workerd serves that exact bundle with the existing development D1/R2 state and asset binding. It refuses environment/remote arguments, checks the actual local binding identities and R2 mail transport, uses the pinned v5 `resourcePersistencePath`, validates health and removes only its owned temporary bundle on exit. No dependency or production configuration was changed. The disposable File smoke also uses that v5 persistence option for its owned temporary resources.

Browser acceptance then reproduced middleware stripping the File route's `private` cache directive. The narrow authenticated File-download path now retains `private, no-store`; adjacent paths and anonymous denial keep their existing policy. Middleware regressions verify that this creates no authorization exemption. Adversarial HTTP input also reproduced two failures where object-valued MIME/size fields with invalid conversion properties returned 500. Validation now rejects those types without coercion and returns sanitized 400 on both upload and retry; the 27 HTTP tests and built-Worker browser cases cover the correction. Browser failure diagnostics report Worker reachability, and full-page captures begin at the top so fixed navigation does not obscure File rows in the saved images.

The first full/Release A runs exposed an old A6 source-text assertion scanning all Client activity labels for the word “archive.” File history legitimately adds “File archived.” The assertion now checks the actual Client/contact mutation modules, preserving its original invariant that A6 creates no Client archive operation. Existing domain inventory, migration-prefix and permission-matrix tests were extended for B5 without changing prior business behavior. Recovery verification also caught cleanup starvation; failed checks now rotate and the new 13-generation regression proves all known orphan keys get a turn.

The final built Worker was served by the checked-in `files-preview-local.mjs` after both builds passed. Its full 144-check HTTP smoke and 21-check external verifier passed again before browser acceptance. The 139 browser/HTTP checks cover one real File/object/event under double-click and response-loss retry, exact saved bytes and headers for coordinator and Client, no-JavaScript control safety, five-width empty/upload/visibility/Team/portal/retry/archive layouts, keyboard chooser/Tab/Escape/focus after controls disappear, touch, reduced motion, sanitized late finalization failure and recovery, current scope/history revocation, strict input types and unchanged parent facts. Project, upload and portal captures were visually reviewed across all five widths; final retry/archive captures were reviewed at every width, with final Project/Team/portal spot checks. The preview was stopped after verification.

The completed run wrote logs and browser captures under `/tmp/bloomops-b5-*` and used external browser tooling at `/tmp/bloomops-a11-browser` (Playwright 1.63.0 / Chromium 153). These temporary artifacts and the browser installation were no longer present when the session resumed for PR finalization; they are not retained PR artifacts. The exact results above and checked-in verification harnesses remain the durable record. The live Bloomlab reference loaded successfully and was visually inspected during verification. Existing dependency advisories, SQLite experimental notice, build compatibility-date suggestion and `punycode` deprecation remain; none required a dependency or platform change for B5.

### Remaining gates and scope

B5's independent audit, user-controlled merge and both post-merge gates are complete on `4c6dad696d15fac4094b8172788b5c72642ff757`. Local verification did not replace those gates; both successful runs are recorded above.

Deliberate limits are 5 MiB per File, 200 Files including archives per Project, fixed Project/Deliverable attachment, read-only Team, explicit recovery with a five-minute active lease, bounded best-effort orphan cleanup, terminal archive retaining Ready bytes, and no scanning. Client uploads, other subject integrations, relinking, restoration, purge/retention policy, versions, approvals/history, comments, notifications, templates, specialist pipelines and future Request/Page/Finance placeholders are absent. B6 and B7 are recorded separately above; later releases remain unimplemented.

### Changed-file inventory

The net diff against verified B4 main contains 52 paths. The temporary task prompt has no net diff.

- Schema: `drizzle/0012_b5_files.sql`, `drizzle/meta/0012_snapshot.json`, `drizzle/meta/_journal.json`, `lib/bloomops/schema.mjs`.
- Domain and authorization: `lib/bloomops/activity.mjs`, `lib/bloomops/api-handler.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/client-activity.mjs`, `lib/bloomops/file-access.mjs`, `lib/bloomops/file-api.mjs`, `lib/bloomops/file-values.mjs`, `lib/bloomops/files.mjs`, `lib/bloomops/project-activity.mjs`, `middleware.js`.
- API routes: `app/api/bloomops/files/[fileId]/download/route.js`, `app/api/bloomops/files/[fileId]/retry/route.js`, `app/api/bloomops/files/[fileId]/route.js`, `app/api/bloomops/portal/files/[fileId]/route.js`, `app/api/bloomops/portal/projects/[id]/files/route.js`, `app/api/bloomops/projects/[id]/files/route.js`.
- UI: `app/(internal)/work/projects/[id]/page.jsx`, `app/bloomops.css`, `app/portal/page.jsx`, `components/bloomops/DeliverableControls.jsx`, `components/bloomops/Deliverables.jsx`, `components/bloomops/FileControls.jsx`, `components/bloomops/Files.jsx`, `components/bloomops/PortalHome.jsx`, `components/bloomops/Projects.jsx`.
- Tests and verification: `scripts/deliverables-smoke-local.mjs`, `scripts/files-preview-local.mjs`, `scripts/files-review-local.mjs`, `scripts/files-smoke-local.mjs`, `scripts/files-smoke-worker.mjs`, `tests/_files.mjs`, `tests/bloomops-activation.test.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-clients.test.mjs`, `tests/bloomops-deliverables-schema.test.mjs`, `tests/bloomops-files-access.test.mjs`, `tests/bloomops-files-domain.test.mjs`, `tests/bloomops-files-http.test.mjs`, `tests/bloomops-files-schema.test.mjs`, `tests/bloomops-files-ui.test.mjs`, `tests/bloomops-middleware.test.mjs`, `tests/bloomops-schema.test.mjs`.
- Documentation: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B4.md`, `docs/phases/B5.md`.

## Deliverables (B4)

B4 is closed through PR #18 and its two verified merge-SHA gates recorded above. This section preserves the historical local evidence. B4 adds client-receivable outputs inside existing Projects, independent of Actions and Dependencies. The implementation follows `phases/B4.md`; the final relational model is in `DOMAIN_MODEL.md`.

### Implementation decisions

- Migration `0011_b4_deliverables.sql` adds only `deliverables`: 14 columns, two indexes, workspace and composite workspace/Project foreign keys, and nine validation/coherence checks. The generated journal and snapshot match. Physical-name inspection found no inherited Deliverables table. No historical migration or Release A/B1/B2/B3 table is rewritten or rebuilt.
- Client, Service and Department derive from the Project. Internal title and optional Client label are bounded to 120 characters; optional multiline internal description to 5000; target date must be a real calendar date. Visibility starts internal. Every Deliverable starts Planned and uses the exact seven-state B4 matrix. Delivered owns one server timestamp; Cancelled owns none; both are terminal. Coordinators may correct details after either terminal state. No Deliverable operation changes parent or B3 work records.
- Owner/Admin/PM coordinate reachable Deliverables. Team is read-only through existing Client/Service/Project scope. Project ownership, Department membership and Action-only assignment grant nothing. Explicit Project assignment is required for PM/Team to read restricted parents or children. The Project visibility ceiling, live workspace/membership/role/scope and contact-link checks apply to reads and committing writes.
- The portal selects only safe fields and emits exactly `id`, `label`, `statusLabel`, `targetDate`, and `deliveredAt`. Blank Client labels display the literal **Deliverable**, never the internal title. Internal Review becomes **In progress**; Client Review becomes **Ready for review**. No Client approval action or approval history is introduced. Empty/hidden-only child sets produce no section, count or progress indicator.
- Each Project has a guarded ceiling of 200 Deliverables, following the bounded child-detail approach in B2/B3. Lists explicitly limit to 200 and use deterministic creation time/id ordering. Portal Home calls the same bounded projection for each already authorized Project; it does not build an assignment-ID `IN` list or change B1's Project listing semantics. A broad portal pagination/composition redesign is outside B4.
- UUIDv4 creation keys are unique per workspace/Project and compare normalized initial details in immutable creation activity. Retries converge after later edits; incompatible reuse conflicts; repeated titles can intentionally create separate outputs. Details and status use revision/CAS guards. Identical retries append no duplicate semantic history or second delivered timestamp. Events and facts share conditional D1 batches; late failures roll back both.
- Significant activity distinguishes creation, details (including changed visibility fields) and status. Client/Service context comes from Project. Project and Client histories filter past Deliverable events by current readability, so restriction or revoked scope removes old internal titles. Clients receive no internal Deliverable activity.
- Five route files expose Project list/create, child read/edit, transition, portal list and portal child read. All use real sessions, exact object-body allowlists, Origin checks, no-store responses and sanitized 400/403/404/409/500 answers. Guessed, foreign, hidden and other-domain IDs reveal no record existence.
- The existing Project page gains a distinct Deliverables section with create/edit/status controls, visibility and target dates. Bloom rows, typography, fields, dialogs, toast and responsive styles are reused. Buttons wait for hydration; dialogs preserve keyboard focus, including after terminal status controls disappear. No new destination, component library, state library or major dependency is introduced.
- The automatic remote zero-to-current workflow and its disposable-target, identity, command, cleanup and concurrency safeguards are unchanged. All acceptance mutations use disposable workerd/D1 or development loopback D1/R2 and example addresses. No staging business data, production, DNS, real email or Leadsthatbloom resources are touched.

### Verification

Node 22.22.1; dependency manifest and lockfile unchanged.

| Check | Result |
|---|---|
| `npm ci` | Passed: 560 packages installed, 561 audited. The existing 49 advisories remain (1 low, 43 moderate, 5 high). |
| `node --test tests/bloomops-deliverables-*.test.mjs` | 197/197 passed: 118 domain/lifecycle/retry/concurrency/rollback, 36 scope/visibility, 22 real-session HTTP, 17 schema and 4 UI tests. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed. |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 passed. |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 passed. |
| Release A/auth/authorization/security/domain regression command recorded in the B3 section | 421/421 passed. |
| `npm test` | 3,754/3,754 passed, zero failures/skips. |
| `npm run build` and `npm run cf:build` | Both passed, including the available lint/type checks. |
| `node scripts/deliverables-smoke-local.mjs` | 38/38 passed on actual disposable workerd/D1, including nonempty B3 parent/work preservation, combined Team histories within binding limits, capacity, retries, delivery concurrency, live revocation and late rollback. |
| `node scripts/projects-smoke-local.mjs`, `milestones-smoke-local.mjs`, `actions-smoke-local.mjs`, `release-a-hardening-smoke-local.mjs` | Actual D1 regressions: 25/25, 28/28, 47/47 and 26/26 passed. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: fresh/no-op, 60 inherited + 12 domain migrations, 33 domain / 69 total tables including ledgers, 77 explicit indexes, 15 triggers, FK/integrity clean and schema/ledgers identical after the second pass. |
| `npm run db:domain:migrate:local` | Migration 0011 applied to the existing development database before preview; the fresh proof above used a separate disposable target. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| JavaScript/JSX syntax and `git diff --check` | 33 changed/new script/module/component/route syntax checks passed; diff check passed. |

`node scripts/deliverables-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b4-review-final` passed **141/141** browser/HTTP checks with exit 0 and **42 screenshots** at **1440, 1024, 768, 390 and 320px**, plus the loaded live design reference. The flow covers multiple outputs in a service-specific B3 Project, derived Client/Service history, complete lifecycle, keyboard entry/validation/Tab trapping/Escape/focus after terminal controls disappear, 44px mobile targets, touch, reduced motion, exact portal DTO/HTML isolation, current scope/history restriction, response-loss retries, competing writes and late rollback.

Logs are under `/tmp/bloomops-b4-*`; final captures are in `/tmp/bloomops-b4-review-final/`. The live Bloomlab gallery returned HTTP 200 and was visually inspected after loading. Final Project, create/edit/status, read-only Team and portal captures were visually inspected across all five widths. Browser tooling remains outside the repo at `/tmp/bloomops-a11-browser` (Playwright 1.63.0 / Chromium 153); no browser dependency was added.

The unchanged dependency advisories are the same inherited tree assessed during B3. No dependency update is required for B4. The Cloudflare build also retains its existing compatibility-date suggestion and `punycode` deprecation notice.

### Verification corrections

The initial full run required narrow inventory updates for Deliverables in `BLOOMOPS_TABLES`, the migration count, two permissions in the role matrix and the activation invariant (zero automatically generated Deliverables). B3's migration test and local smoke now permit later migrations while preserving the exact B3 prefix. A portal test initially matched the word progress inside the deliberately safe status **In progress**; it now checks the forbidden JSON property precisely. No production behavior was changed to satisfy that assertion.

The first local preview started amid concurrent verification startup and did not respond. The HTTP harness initially could not connect; the owned preview was restarted, its development health and twelve migrations were confirmed, and HTTP acceptance restarted. Application mutations were not automatically retried after uncertain failures.

Visual review caught two acceptance-fixture issues: the reference screenshot needed to wait for the loaded Design gallery instead of its loading screen, and the Service API returns `service.id`, not a top-level `serviceEngagementId`. The final harness waits for the gallery and uses the correct Service ID, then explicitly asserts both the Project Service link and each Deliverable event's derived Client/Service context. Its preservation snapshot also includes Client and Service records. These corrections change verification only. The existing five-per-minute magic-link rate limit is preserved; browser retries are limited to explicit 429 responses.



### Remaining gates and scope

B4's audit, merge and both post-merge gates are complete on `ac71b358f27894af8dd8108f004499cd765fca69`, as recorded above. Deliberate B4 limits remain 200 Deliverables per Project, fixed parent identity, terminal Delivered/Cancelled lifecycle, read-only Team and coordinator-managed review states. B5 adds Files in a separate phase; versions, formal approval rounds/history, comments, notifications, templates, auto-generation, specialist pipelines and Home composition remain absent.

### Changed files by area

All 42 paths are relative to the repository root, including the supplied B4 contract. The temporary B4 Codex prompt has no net diff against main.

- Domain/access/history: `lib/bloomops/deliverables.mjs`, `lib/bloomops/deliverable-values.mjs`, `lib/bloomops/deliverable-access.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/activity.mjs`, `lib/bloomops/project-activity.mjs`, `lib/bloomops/client-activity.mjs`.
- API: `lib/bloomops/deliverable-api.mjs`, `app/api/bloomops/projects/[id]/deliverables/route.js`, `app/api/bloomops/projects/[id]/deliverables/[deliverableId]/route.js`, `app/api/bloomops/projects/[id]/deliverables/[deliverableId]/transition/route.js`, `app/api/bloomops/portal/projects/[id]/deliverables/route.js`, `app/api/bloomops/portal/projects/[id]/deliverables/[deliverableId]/route.js`.
- UI: `app/(internal)/work/projects/[id]/page.jsx`, `app/portal/page.jsx`, `app/bloomops.css`, `components/bloomops/DeliverableControls.jsx`, `components/bloomops/Deliverables.jsx`, `components/bloomops/PortalHome.jsx`, `components/bloomops/Projects.jsx`.
- Schema: `lib/bloomops/schema.mjs`, `drizzle/0011_b4_deliverables.sql`, `drizzle/meta/0011_snapshot.json`, `drizzle/meta/_journal.json`.
- Tests/verification: `tests/_deliverables.mjs`, `tests/bloomops-deliverables-domain.test.mjs`, `tests/bloomops-deliverables-access.test.mjs`, `tests/bloomops-deliverables-http.test.mjs`, `tests/bloomops-deliverables-schema.test.mjs`, `tests/bloomops-deliverables-ui.test.mjs`, `tests/bloomops-actions-schema.test.mjs`, `tests/bloomops-activation.test.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-schema.test.mjs`, `scripts/deliverables-smoke-local.mjs`, `scripts/deliverables-review-local.mjs`, `scripts/actions-smoke-local.mjs`.
- Documentation: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B4.md`.

## Actions + Dependencies (B3)

B3 adds internal daily Actions, optional same-Project Milestones, responsibility and priority, exact lifecycle/Waiting rules, atomic cycle-safe dependency edges, live authorization, semantic history, and functional Work/Project interfaces. `DOMAIN_MODEL.md` records the final model and `phases/B3.md` preserves the implementation contract. B3 is now closed by PR #17 and both verified post-merge gates; the following section preserves its local implementation evidence. B4 is recorded above.

### Implementation decisions

- Migration `0010_b3_actions_dependencies.sql` adds `actions` (18 columns), `action_dependencies` (6 columns), six indexes, two dependency triggers, and an additive unique Milestone workspace/Project/id index for the optional child FK. The generated Drizzle journal/snapshot agree. No historical migration or Release A/B1/B2 table is rewritten or rebuilt. Inherited schema inspection confirmed both physical table names were free.
- Actions derive Client/Service/Department from Project, including the existing service-type Department rule. Title is trimmed and bounded to 120 characters, optional multiline description to 5000, and Waiting explanation to 1000. Priority is Low/Normal/High/Urgent, default Normal. Actions start To Do and use the exact B3 transition matrix. Waiting requires the named type and explanation; leaving clears both. Done has one server timestamp; Cancelled has none; both are terminal. No Action operation changes a parent or sibling lifecycle.
- UUIDv4 creation keys are unique within workspace/Project and compare immutable initial details from canonical creation activity. This preserves retries after later edits or assignee deactivation, rejects incompatible key reuse, and permits intentionally repeated titles. Conditional D1 batches couple revisions, live authority/reference checks and semantic events. Identical retries converge; competing stale edits, status, assignment and dependency writes conflict. No uncertain mutation is retried automatically.
- Current direct Team assignment grants only that Action, including restricted work under a restricted Project, with minimal parent context. Project links and linked Milestone details still require independent B1/B2 access. Team can progress only its own active assignment, never structural details or dependencies. Reassignment, role changes and deactivation revoke live access even for issued sessions or previously loaded actors. PM restricted access requires explicit Project assignment; Owner/Admin may coordinate. Department membership and Project ownership grant nothing. Client Action reads, routes, projections, counts, history and navigation are absent.
- Dependency endpoint composite FKs require one workspace and Project. Unique pairs and self-edge checks protect storage. Recursive `UNION` reachability is evaluated inside the committing write and independently enforced by a database insert trigger; an update trigger makes endpoints immutable. A removed edge's opaque identity cannot delete a later re-addition of the same pair. Actual D1 tests cover 180-node chains, diamonds and six competing cycle additions. Done alone satisfies prerequisites; Cancelled remains unresolved. Blocking is derived, including a generic boolean for hidden prerequisites, without serializing hidden endpoint labels/counts/graph. Manual lifecycle changes stay independent of the graph.
- Central Action list/view/manage/progress/dependency permissions and SQL predicates are shared by APIs, pages, writes and history. API bodies have exact allowlists, real sessions and Origin checks; malformed objects, denied/guessed IDs, conflicts and failures are sanitized and no-store. Internal DTOs explicitly select fields. Activity distinguishes creation, details/priority, assignment, status and dependency add/remove; dependency events never copy a sibling title. Project/Client history filters old Action events by current readability.
- Work defaults to Actions and retains Projects in a separate tab. Mine includes all assigned Actions; Today/Upcoming exclude terminal work, Waiting/Review use explicit status, and Overdue requires a past due date with no unresolved prerequisite. Calendar days follow the existing Client IANA timezone, with UTC fallback, and deterministic tests cover midnight/DST. All seven requested filters use relational predicates. Lists paginate at 200 rows; facets disclose their 200-choice overflow. A guarded 200-Action per-Project ceiling keeps Project and prerequisite lists complete and bounded, following B2's parent-detail approach; the creation form states that limit without exposing hidden counts.
- Project detail supports create/edit/assignment/status controls and assigned Team progress. Individual Action details provide narrow access and dependencies. Bloom rows, fields, dialogs, toast and typography are reused. A native Filters disclosure keeps small-screen daily work near the top. Action controls stay disabled until their client handlers attach, and dialog/terminal/removal focus returns to a stable control or title. No generic UI or state dependency, editor rewrite, specialist pipeline or future-phase placeholder was added.
- The existing zero-to-current workflow and all command/config/identity/cleanup/concurrency safeguards are unchanged, including schema/Drizzle push triggers. No staging business data, production, DNS, real mail or Leadsthatbloom resource was mutated.

### Verification

Node 22.22.1, Wrangler 4.129.0, existing external Playwright 1.63.0 / Chromium. Local development Worker/R2 mail and disposable workerd/D1 only, using example.com fixture identities. No new dependency and no package/lockfile change.

| Check | Result |
|---|---|
| `npm ci` | Passed; same 49 existing advisories: 5 high, 43 moderate, 1 low. The A11 assessment below remains applicable. |
| `node --test tests/bloomops-actions-*.test.mjs` | 203/203 passed across seven files: schema, lifecycle, validation, scope/visibility, real-session HTTP, UI, dates/views, retries, write-lock revocation, dependency cycles and rollback. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed. |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 passed. |
| A8/A9/A10/A11 and auth/authorization/membership/invitation/mail/middleware/Client/Service/assignment regressions | 421/421 passed. |
| `npm test` | 3,557/3,557 passed; zero failures/skips. |
| `npm run build`; `npm run cf:build` | Both passed, including Next lint/type checks and OpenNext Worker generation. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: genuinely empty disposable DB; 60 inherited + 11 domain migrations; 68 total migration-defined tables including both ledgers / 32 domain tables; 75 explicit domain indexes and all 15 triggers; FK/quick_check; identical full schema and both ledgers after the no-op second pass. |
| `node scripts/actions-smoke-local.mjs` | 47/47 actual workerd/D1 checks passed, including long/diamond/concurrent cycles, rollback, stale authority, narrow assignment, timezone projection and 205-assignment pagination within bind limits. |
| `node scripts/projects-smoke-local.mjs`; `node scripts/milestones-smoke-local.mjs`; `node scripts/release-a-hardening-smoke-local.mjs` | B1 25/25, B2 28/28 and A11 26/26 passed against the current migrations. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| `node scripts/actions-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b3-review --playwright /tmp/bloomops-a11-browser` | 161/161 passed; 53 screenshots at 1440, 1024, 768, 390 and 320px. All daily views and combined filters, coordinator create/edit/status/dependencies, assigned Team progress, immediate revocation, Client denials, keyboard/focus, real touch, reduced motion and viewport geometry passed. |
| `node --check` on changed/new JS/MJS; `git diff --check` | 33 changed/new JS/MJS modules passed syntax checks; diff check passed. JSX is covered by the builds. |

The 421-test regression command was:

```sh
node --test tests/bloomops-onboarding-*.test.mjs tests/bloomops-activation.test.mjs tests/bloomops-hardening-*.test.mjs tests/bloomops-auth.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-invitations.test.mjs tests/bloomops-mail.test.mjs tests/bloomops-middleware.test.mjs tests/bloomops-clients.test.mjs tests/bloomops-services.test.mjs tests/bloomops-assignments.test.mjs
```

Logs and captures remain under `/tmp/bloomops-b3-*`, outside the repository. The live Bloomlab design reference returned HTTP 200 and was visually inspected at `/tmp/bloomops-b3-design.png`. Representative final Work, expanded Filters, Project, dialog, Action detail, Team and portal captures were visually inspected across all five widths.

### Verification corrections

The initial Department filter used only the optional Project department field. The invariant test correctly failed for service Projects, whose Department comes from the service type; the Action joins now follow the existing B1 rule. Full regressions required narrow inventory updates for B3's five permissions, extra internal page, tables/migration, and the activation invariant: activation must leave zero Action records, while Deliverables remain absent. The role matrix also now expects Clients to receive existence-hiding denials for internal Actions. B2's schema test and local D1 smoke accept later migrations while preserving its exact migration prefix. B1's browser harness explicitly opens the Projects tab now that Work defaults to Actions.

The first browser run reproduced a keyboard activation lost while an Action button was already visible but its React handler had not attached. The isolated readiness probe recorded `bound: false`, a focused enabled status button and no dialog; subsequent activation after attachment worked. Action controls now remain disabled until hydration completes, and keyboard acceptance waits for an enabled control rather than an arbitrary delay. Terminal transitions and dependency removals also verify focus after their opener disappears. Mobile visual review moved the seven filters into a native disclosure and corrected the active-view background to the existing Bloom lilac token. The browser harness retries only explicit magic-link 429 responses under the existing five-per-minute limit; it does not retry uncertain mutations or relax authentication. The D1 smoke status contestant was corrected to the valid To Do → In Progress transition so the test exercises a revision race rather than an invalid transition.

### Remaining gates and scope

B3 is closed: independent review and user-controlled merge produced PR #17 at `884051d2c2308839f95ecdac74c9d896edf221c5`, with staging run 34199099414 and remote zero-to-current run 34199099461 both successful on that exact SHA. Deliberate B3 limits remain 200 Actions per Project, 200 rows per Work page and 200 choices per facet; same-Project dependencies only; fixed parent identities; final Done/Cancelled lifecycle; no automatic dependency-driven transitions. B4 is recorded above. Files, comments, approvals, notifications, template generation, specialist pipelines, Finance and later Home composition remain unimplemented.

### Changed files by area

All 49 paths are relative to the repository root, including the supplied B3 contract. The temporary B3 Codex prompt has no net diff against main.

- Domain: `lib/bloomops/action-access.mjs`, `lib/bloomops/action-dependencies.mjs`, `lib/bloomops/action-values.mjs`, `lib/bloomops/actions.mjs`, `lib/bloomops/activity.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/client-activity.mjs`, `lib/bloomops/project-activity.mjs`.
- API: `app/api/bloomops/actions/[actionId]/dependencies/[dependencyId]/route.js`, `app/api/bloomops/actions/[actionId]/dependencies/route.js`, `app/api/bloomops/actions/[actionId]/route.js`, `app/api/bloomops/actions/[actionId]/transition/route.js`, `app/api/bloomops/actions/route.js`, `app/api/bloomops/projects/[id]/actions/route.js`, `lib/bloomops/action-api.mjs`.
- UI: `app/(internal)/work/actions/[actionId]/page.jsx`, `app/(internal)/work/page.jsx`, `app/(internal)/work/projects/[id]/page.jsx`, `app/(internal)/work/projects/new/page.jsx`, `app/bloomops.css`, `components/bloomops/ActionControls.jsx`, `components/bloomops/Actions.jsx`, `components/bloomops/ProjectForm.jsx`.
- Schema and migration: `drizzle/0010_b3_actions_dependencies.sql`, `drizzle/meta/0010_snapshot.json`, `drizzle/meta/_journal.json`, `lib/bloomops/schema.mjs`.
- Tests and verification: `scripts/actions-review-local.mjs`, `scripts/actions-smoke-local.mjs`, `scripts/milestones-smoke-local.mjs`, `scripts/projects-review-local.mjs`, `tests/_actions.mjs`, `tests/bloomops-actions-access.test.mjs`, `tests/bloomops-actions-dependencies.test.mjs`, `tests/bloomops-actions-domain.test.mjs`, `tests/bloomops-actions-http.test.mjs`, `tests/bloomops-actions-schema.test.mjs`, `tests/bloomops-actions-ui.test.mjs`, `tests/bloomops-actions-views.test.mjs`, `tests/bloomops-activation.test.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-milestones-schema.test.mjs`, `tests/bloomops-schema.test.mjs`, `tests/bloomops-shell.test.mjs`.
- Documentation: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B3.md`.

## Milestones (B2)

B2 adds ordered, workspace-scoped Project children, explicit Milestone lifecycle, internal waiting context, atomic semantic activity, scoped internal APIs and Project-detail controls, and a dedicated Client-safe Milestone/progress projection. B2 is closed by PR #16 and both verified post-merge gates recorded above. This section preserves its historical implementation and local evidence; B3 is recorded separately above.

### Implementation decisions

- Additive generated migration `0009_b2_milestones.sql` adds only `milestones` (16 columns) and four indexes, with matching Drizzle journal/snapshot. Composite workspace/Project FK, per-Project unique positions and request keys, date/name/status/visibility/completion/waiting/revision CHECKs protect stored facts. There are 30 domain tables; no Release A/B1 table is rebuilt.
- Client/Service/Department remain derived from the parent Project. Milestone creation and all changes leave Project status/health/revision, Client, Service and onboarding facts unchanged. Waiting has a bounded internal explanation because `AGENTS.md` requires work to record what or whom it waits on; that explanation is excluded from the portal.
- A UUID creation request key permits explicit response-loss retry without inventing name uniqueness. Server-generated Milestone IDs and immutable initial details in the creation event distinguish retries from key reuse, even after later edits. There are no automatic retries of uncertain mutations.
- A Project supports up to 200 Milestones. Reorder accepts the complete readable set plus its per-row revisions, preserves hidden slots, and parks rows before assigning final unique positions. A conditional canonical event is the transaction receipt; no Project ordering field or secondary status is introduced. Same-order retries add no event. Competing status/reorder and stale-set writes conflict, including under the D1 write lock.
- Owner/Admin/PM coordinate reachable children; Team Member stays read-only. Existing Client/Service/Project assignments govern reach; Department and ownership grant nothing. Restricted children use explicit Project assignment for PM/Team. Both parent and child must be client-visible with a current contact link for Client access. Fresh SQL predicates protect reads, write batches and historical activity against revocation.
- Six route files reuse A11/B1 session/origin, strict JSON/body fields, leak-safe 404s, sanitized 500s and no-store. The exact Client Milestone DTO is `id`, `label`, `statusLabel`, `targetDate`, `completedAt`; safe derived progress is computed only from visible rows, counting Completed and Skipped as finished. Empty progress is null and omitted from UI. B1 Project DTO fields remain unchanged.
- Project detail reuses Bloom primitives, dialogs and toast utilities. Create/edit/status and keyboard/touch reorder controls sit beside the ordered list; Team sees only readable rows. Client summaries nest under relevant Projects, with no global Milestone destination or future-phase placeholders. Project/Client activity filters Milestone events by current readability.
- The existing remote zero verifier's push path filter now includes `lib/bloomops/schema.mjs` and `drizzle/**`. Manual dispatch, database target, cleanup, identity checks, concurrency and isolation logic are unchanged. A workflow regression checks the new paths and retained controls.

### Verification

Node 22.22.1 / Wrangler 4.129.0; local D1 and development R2 mail only, with example.com fixture identities. Dependency manifests and lockfile are unchanged. No production deployment, staging business-data mutation, DNS, real email or Leadsthatbloom operation occurred.

| Check | Result |
|---|---|
| `npm ci` | Passed; package and lockfile unchanged. The same 49 existing advisory entries (5 high, 43 moderate, 1 low) documented by A11 remain; B2 introduces no dependency. |
| `node --test tests/bloomops-milestones-*.test.mjs` | 173/173 passed: 76 domain/lifecycle/rollback/revocation, 32 access/visibility, 25 real-session HTTP, 19 ordering/concurrency, 17 schema and 4 UI tests. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed. |
| A8/A9/A10/A11 + auth/authorization/security/Client/Service/assignment regressions | 421/421 passed, including A8 72, A9 44, A10 39 and A11 82. |
| `npm test` | 3,354/3,354 passed; zero failures/skips. |
| `npm run build`; `npm run cf:build` | Both passed, including Next lint/type checks and OpenNext Worker generation. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22 checks passed: genuinely empty disposable DB; 60 inherited and 10 domain migrations; 66 total migration-defined tables including ledgers / 30 domain tables; 68 explicit domain indexes and 13 immutability triggers; FK/integrity checks; identical complete schema and both ledgers after the no-op second pass. |
| `node scripts/milestones-smoke-local.mjs` | 28/28 actual workerd/D1 checks passed, including idempotent creates/completion, visibility revocation, atomic rollback and 200-row reorder within D1 bind limits. |
| `node scripts/projects-smoke-local.mjs`; `node scripts/release-a-hardening-smoke-local.mjs` | B1 25/25 and A11 26/26 actual D1 checks passed against the current migrations. B1 checks its original migration prefix while accepting B2. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed against the built local Worker. |
| `node scripts/milestones-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b2-review --playwright /tmp/bloomops-a11-browser` | 117/117 checks passed; 38 screenshots at 1440, 1024, 768, 390 and 320px. Real coordinator create/edit/status/keyboard and touch reorder, visible-only Client progress, Team denial, immediate visibility/contact/scope/suspension revocation, rollback, no-store, focus, reduced motion and responsive geometry passed. |
| `node --check` on changed/new JavaScript; `git diff --check` | 28 modules/scripts passed syntax checks; diff check passed. JSX is covered by the builds. |

Local logs and captures are `/tmp/bloomops-b2-*`; these are verification artifacts, not repository assets. The live Bloomlab design gallery rendered successfully and was inspected at `/tmp/bloomops-b2-design.png`. Existing external Playwright 1.63.0 / Chromium tooling is reused; no browser dependency was installed. Representative internal, dialog, Team and portal captures were visually inspected across all five widths, including the corrected tablet portal layout.

The six new B2 test files were also copied into an isolated archive of the unchanged verified B1 merge. All six fail to load because the Milestone implementation is absent there. This is a new-feature baseline check, not a claim of six pre-existing B1 defects. The final current implementation passes all 173 individual B2 tests.

Verification corrections: the initial order-test source had an invalid await inside a synchronous callback; this test syntax was corrected before the passing run. A portal render test initially rejected valid 0-of-1 progress; it now rejects fabricated 0-of-0 and independently proves hidden-only Projects render no Milestone progress. No application behavior was changed to satisfy that weak assertion. Browser acceptance initially expected 201 for the existing B1 assignment endpoint, which correctly returned 200; the harness now checks that established contract. A separate real-browser probe reproduced terminal Milestone status changes losing keyboard focus to the document body when the status control disappeared. B2 now restores focus to the surviving Edit control. The same probe passes on the final Worker (`/tmp/bloomops-b2-focus-before.log` and `focus-after.log`), and acceptance checks focus after every status mutation. The browser assertions wait for the existing asynchronous dialog/focus effects to settle instead of sampling before the requested animation frame; they still fail if focus is never restored. The final story also uses a real touch-enabled context for reordering and checks reduced motion. Tablet acceptance also reproduced a portal Project row that did not wrap its new full-width Milestone child above the mobile breakpoint (768px viewport measured 833px document width). A dedicated portal Project wrapping rule fixes the parent layout at every width; the browser probe measures 768px afterward, with no clipped content. The first HTTP smoke started before the preview listener was ready; its rerun follows a successful development health check. One local Next build attempt was terminated with SIGTERM during trace collection after compilation and type checks; the detached sequential rerun completed both builds with exit 0. The final external verifier initially received a safe 429 after the HTTP smoke consumed Better Auth’s existing five-per-60-second magic-link allowance. After that window expired, the unchanged verifier passed 21/21 against the same bundle; authentication limits were not relaxed.

### Remaining gates and scope

B2’s independent audit, merge and both post-merge gates are now closed as recorded above. The 200-Milestone bound, terminal Completed/Skipped, fixed parents and read-only Team coordination are deliberate B2 limits. B3 Actions + Dependencies, Deliverables, Files, comments, approvals, templates/generation, notifications and automatic Project completion remain outside this implementation.

### Changed files by area

All 44 paths are relative to the repository root. The supplied B2 contract is included; the temporary Codex prompt has no net diff against main.

- Domain: `lib/bloomops/activity.mjs`, `lib/bloomops/authorization.mjs`, `lib/bloomops/client-activity.mjs`, `lib/bloomops/milestone-access.mjs`, `lib/bloomops/milestone-values.mjs`, `lib/bloomops/milestones.mjs`, `lib/bloomops/project-activity.mjs`.
- API: `app/api/bloomops/portal/projects/[id]/milestones/[milestoneId]/route.js`, `app/api/bloomops/portal/projects/[id]/milestones/route.js`, `app/api/bloomops/projects/[id]/milestones/[milestoneId]/route.js`, `app/api/bloomops/projects/[id]/milestones/[milestoneId]/transition/route.js`, `app/api/bloomops/projects/[id]/milestones/reorder/route.js`, `app/api/bloomops/projects/[id]/milestones/route.js`, `lib/bloomops/milestone-api.mjs`.
- UI: `app/(internal)/work/projects/[id]/page.jsx`, `app/bloomops.css`, `app/portal/page.jsx`, `components/bloomops/MilestoneControls.jsx`, `components/bloomops/Milestones.jsx`, `components/bloomops/PortalHome.jsx`, `components/bloomops/Projects.jsx`.
- Schema/migrations: `drizzle/0009_b2_milestones.sql`, `drizzle/meta/0009_snapshot.json`, `drizzle/meta/_journal.json`, `lib/bloomops/schema.mjs`.
- Tests/verification: `.github/workflows/verify-zero-remote.yml`, `scripts/milestones-review-local.mjs`, `scripts/milestones-smoke-local.mjs`, `scripts/projects-smoke-local.mjs`, `tests/_milestones.mjs`, `tests/bloomops-authorization.test.mjs`, `tests/bloomops-milestones-access.test.mjs`, `tests/bloomops-milestones-domain.test.mjs`, `tests/bloomops-milestones-http.test.mjs`, `tests/bloomops-milestones-order.test.mjs`, `tests/bloomops-milestones-schema.test.mjs`, `tests/bloomops-milestones-ui.test.mjs`, `tests/bloomops-schema.test.mjs`, `tests/zero-verify-safety.test.mjs`.
- Docs: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B2.md`.

## Projects Core (B1)

B1 is closed: PR #15 merged as `cacb2d3`, with both gates verified above. The following section retains its historical implementation and local evidence. B2 extends it as recorded above.

B1 adds the canonical Project model, Project assignments, scoped internal APIs and Work screens, conditional Client Projects tab, and minimal safe Project summaries in the existing portal. The detailed lifecycle matrix and access rules are recorded in `DOMAIN_MODEL.md` under Projects. There are no Milestone/Action/Deliverable/File placeholders, automatic Project generation, notifications, or later Release B features.

### Implementation decisions

- Additive Drizzle migration `0008_b1_projects_core.sql` creates `projects` and `project_assignments` and the Service composite unique index needed for workspace-and-Client foreign-key enforcement. Historical migrations and Release A tables are preserved. There are now 29 domain tables.
- Parent Client and optional Service stay fixed in B1. Service-specific Department is derived; client-level Department is optional. New relationships validate active members/departments and open Services, with guards rechecked inside the committing batch.
- Explicit Project assignments add only Project scope. Client-wide and Service-specific assignments apply to their ordinary child Projects; Department and ownership grant nothing. Restricted Projects preserve A4's narrower visibility, including Project Manager restrictions.
- Status, health, responsibility and Client/Service lifecycles remain separate. A revision-based conditional batch atomically writes each change and its semantic activity. Retries converge without duplicate events; completion and its winning timestamp survive archiving. No natural name uniqueness is invented.
- Protected API routes retain A11 origin protection, body allowlists, sanitized failures, and `no-store`. SQL reads recheck live membership/scope/visibility; large assignment scopes use relational predicates. Portal selects only label/status/dates and Client context. Internal Client history also respects current Project restrictions.
- UI reuses Bloom's primitives, dialogs, field labels, toasts, typography and semantic colors. Work is now available; its list shows status, health, client/service context, owner and target date. Client and portal Project sections appear only for relevant records. Lists cap at 200 with an explicit notice and status/Client narrowing.

### Verification

All verification uses Node 22.22.1, isolated local D1/R2 and example.com identities. No production deployment, staging business-data mutation, real email, DNS, or Leadsthatbloom action was performed.

| Check | Result |
|---|---|
| `npm ci` | Passed; dependency manifests and lockfile unchanged. |
| `node --test tests/bloomops-projects-*.test.mjs` | 97/97 passed: lifecycle, relational/tenant constraints, real-session API denials, stale state, retries/concurrency, activity rollback, visibility, large scope, and conditional UI/portal projection. |
| Auth/authorization/membership/invitation/mail/middleware/Client/Service/assignment regressions plus A8/A9/A10/A11 | 421/421 passed. Includes A8 72, A9 44, A10 39 and A11 82. |
| `npm test` | 3,180/3,180 passed; zero failures/skips. |
| `npm run build`; `npm run cf:build` | Both passed, including Next lint/type checks and OpenNext Worker generation. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22/22 passed: empty disposable database, all 60 inherited and 9 domain migrations, 65 total migration-defined tables including ledgers / 29 domain tables, 64 domain indexes, 13 immutability triggers, foreign-key/integrity checks, identical complete schema and both ledgers after a no-op second pass. |
| `node scripts/projects-smoke-local.mjs` | 25/25 passed on actual disposable workerd/D1, including transaction rollback, conflicting transitions, assignments, immediate revocation and 230 assigned Projects. |
| `node scripts/release-a-hardening-smoke-local.mjs` | 26/26 A11 actual workerd/D1 checks passed against the new schema. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 built-Worker HTTP checks passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed; local target only. |
| `node scripts/projects-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-b1-review --playwright /tmp/bloomops-a11-browser` | 124/124 browser/HTTP checks passed, 42 screenshots at 1440/1024/768/390/320px. Covers create/double-click/validation, modal keyboard focus, lifecycle and independent health, assignment edit/removal, Team read-only scope, parent/sibling denials, conditional Client tab, safe single/multi-client portal, sanitized rollback, visibility revocation and suspended sessions. |
| `node --check` on changed/new JavaScript; `git diff --check` | 32 modules/scripts passed syntax checks; diff check passed. JSX is verified by both application builds. |

The local Worker received migration 0008 and runs via `npx --no-install opennextjs-cloudflare preview -- --log-level error`. This is separate from the fresh disposable migration proof. The live Bloomlab design gallery was successfully rendered and inspected; its capture is `/tmp/bloomops-b1-review/design-reference.png`. Creation, detail, Work list, portal and status-dialog captures were visually reviewed in addition to the automated geometry/keyboard assertions. Screenshots and command logs remain local `/tmp/bloomops-b1-*` evidence, not repository assets. Existing Playwright 1.63.0 / Chromium 153 tooling lives outside the repository at `/tmp/bloomops-a11-browser`; no browser dependency was added.

Verification corrections: the A4 action matrix now explicitly includes all four Project actions; shell/schema expectations account for B1. The old A9 assertion that Projects did not exist is replaced with the stronger current invariant that activation creates zero Project records. A11's disposable smoke still verifies the complete Release A migration prefix while accepting the additive B1 migration. The B1 D1 fixture now explicitly seeds active memberships and uses D1's supported `quick_check`. An existing Worker HTTP smoke `SELECT` met `SQLITE_BUSY` through its independent local Wrangler connection; its helper now retries at most three times, only for read-only queries and an explicit lock error. No application mutation or uncertain failure is retried by that correction. The SQLite/D1 transaction double is unchanged.

The initial Project browser run successfully created and assigned work, but its parent-denial check used GET on the existing PATCH-only Client endpoint. The harness now checks the real protected Client Projects GET instead and independently asserts both Project access and parent denial. A subsequent injected-failure check proved sanitized HTTP 500 plus unchanged Project/revision but rejected Next's additional `private, no-cache, max-age=0, must-revalidate` cache directives. The assertion now checks for the required `no-store` directive without rejecting stronger accompanying directives. Modal captures disable finite animations and use the actual viewport so fixed overlays are inspected after settling. Local magic-link rate-limit refusals are waited out; no general application failure is replayed.

A later browser attempt was interrupted when the local preview process exited with SIGTERM (143), causing a socket failure. The same verified bundle was restarted for final acceptance; no application change was made. Browser transport diagnostics now omit cookie/authorization/token lines, and sessions for the disposable B1 fixture identities were revoked before restarting that run.

An intermittent portal geometry assertion was isolated against the real page: its account control measured 44px after settling. Responsive measurements now wait for fonts, two animation frames and finite animations, and print exact geometry on a failure. The final preview runs in a separate local process so the verification terminal lifecycle does not own it. These are harness changes; the application builds and invariant-test evidence remain unchanged.

### Scope and next phase

B1 independent review, merge and both post-merge gates are complete. The internal list limit and fixed Project parents remain deliberate B1 boundaries. B2 Milestones follows, with its current evidence recorded above.

### Changed files by area

Paths below are relative to the repository root and cover the final B1 diff against verified main, including the supplied Release B/B1 planning commits. The temporary `B1_CODEX_PROMPT.txt` is removed with no net prompt-file diff against main.

- Domain: `lib/bloomops/project-values.mjs`, `projects.mjs`, `project-access.mjs`, `project-assignments.mjs`, `project-activity.mjs`, `authorization.mjs`, `activity.mjs`, `client-activity.mjs`.
- API: `lib/bloomops/project-api.mjs`; `app/api/bloomops/projects/route.js`, `projects/[id]/route.js`, `projects/[id]/transition/route.js`, `projects/[id]/assignments/route.js`, `projects/[id]/assignments/[assignmentId]/route.js`, `clients/[id]/projects/route.js`, `portal/projects/route.js`, `portal/projects/[id]/route.js` (all route paths under `app/api/bloomops/`).
- UI: `app/(internal)/work/page.jsx`, `work/projects/new/page.jsx`, `work/projects/[id]/page.jsx`, `clients/[id]/page.jsx` (under `app/(internal)/`); `app/portal/page.jsx`, `app/bloomops.css`; `components/bloomops/Projects.jsx`, `ProjectForm.jsx`, `ProjectControls.jsx`, `ProjectTeam.jsx`, `Clients.jsx`, `PortalHome.jsx`; `lib/bloomops/navigation.mjs`.
- Schema/migrations: `lib/bloomops/schema.mjs`, `drizzle/0008_b1_projects_core.sql`, `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json`.
- Tests/verification: `tests/_projects.mjs`, `bloomops-projects-domain.test.mjs`, `bloomops-projects-http.test.mjs`, `bloomops-projects-schema.test.mjs`, `bloomops-projects-ui.test.mjs`, `bloomops-activation.test.mjs`, `bloomops-authorization.test.mjs`, `bloomops-schema.test.mjs`, `bloomops-shell.test.mjs` (under `tests/`); `scripts/projects-smoke-local.mjs`, `projects-review-local.mjs`, `auth-smoke-local.mjs`, `release-a-hardening-smoke-local.mjs` (under `scripts/`).
- Docs: `docs/BUILD_STATE.md`, `docs/DOMAIN_MODEL.md`, `docs/INDEX.md`, `docs/RELEASE_B.md`, `docs/phases/B1.md`.

## Release A Hardening (A11)

### Strategy and verified base

A11 treats A3–A10 as a release candidate and attacks stored-state races, transaction failures, authorization and field boundaries, lifecycle recovery, migration safety, and the two Release A acceptance stories. Reproductions use real SQLite SQL/serialized batches and real Better Auth sessions; separate disposable workerd/D1 and built-Worker browser runs verify Cloudflare and user-facing behavior. No test double was changed. The A9 stale-sender injection now intercepts the transactional batch instead of replacing a Drizzle query's `returning` method with a Promise.

The branch starts at merged main `b7d65ee6bd998fe3b04bdec60860f447cd2452d1` (A10 PR #13), followed by task carrier `ee04c0e`. Read-only preflight confirmed [Deploy staging 34108338874](https://github.com/Beeyach/bloomops/actions/runs/34108338874) and [Verify zero-to-current 34108461749](https://github.com/Beeyach/bloomops/actions/runs/34108461749) completed successfully on that exact main SHA. The latter's logs explicitly prove deletion of its disposable database, exact restoration of the eight-database inventory, and unchanged staging identity. These are the pre-A11 gate, not verification of A11 or a future merge.

The final verification also ran the 82 new adversarial tests against an isolated archive of `ee04c0e` with its unchanged pre-hardening application code: 38 failed and 44 passed. The same tests pass 82/82 on the final A11 implementation. Failures reproduce all twelve correction areas below, including middleware caching, URL telemetry, and the four unsafe staging-config shapes. The comparison archive and its logs are disposable local evidence, not a second branch or a test-double change.

### Reproduced defects and corrections

| Defect | Correction and regression evidence |
|---|---|
| Generic invitation acceptance could grant/reactivate membership after token rotation/revocation or workspace suspension won the race, and leave partial membership/acceptance when a later event failed. | Generic and explicitly contact-bound invitations now share one fenced acceptance batch. Live token hash, expiry, workspace, membership state, and any intended contact are checked under the write lock. Concurrent acceptance converges to the accepted identity; inactive accepted-token retries are refused. Both acceptance events roll back with membership/contact/invitation writes. |
| Generic resend/revoke/expiry changed the invitation before separately recording activity. A failed event left token/status drift. A stale expiry lookup could invalidate a newly rotated token; revoke racing generic retargeting could record activity against the prior client. | Conditional event insertion and mutation share one batch and stored-state predicate. Expiry compares the old token and expiry; revoke compares its token snapshot; lookup rejects a token that rotated during the read. Activation-managed ownership is checked both before and within generic mutations. |
| Concurrent suspensions could remove both remaining Owners; failed membership activity left the status changed. | The last-Owner check now runs under the transaction's write lock. Membership status and its event commit together; the losing request returns a safe conflict. |
| Concurrent duplicate Client, Service, contact, and assignment edits/removals appended history for changes that happened only once. | Client/Service/assignment edits compare the stored snapshot and conditionally record events in the same batch. Contact editing validates its snapshot under the write lock before detail/primary writes; unlinked contact removal is conditional and atomic. No-op/stale attempts add no phantom events. |
| A successfully delivered activation invitation became unrecoverable after its seven-day expiry: delivery was `sent`, generic resend was correctly refused, and activation retry was a no-op. | The existing activation retry can renew an expired, unaccepted invitation. Its claim serializes concurrent renewals; the first delivery timestamp and initial lifecycle events remain singular. The existing activation panel explains expiry and exposes retry. Accepted/revoked invitations are not renewed by this path. |
| The existing resolution textarea allowed multiline input, but the server rejected ordinary line breaks. | Reason validation permits newline, carriage return, and tab while retaining the length bound and rejection of other control characters. Multiline rationale is retained and tested through the narrow-screen keyboard flow. |
| Malformed/null/array/scalar JSON on Client/contact/Service PATCH could be treated as an empty successful edit. | The shared body reader requires a JSON object and returns a safe 400 without a write. |
| Unexpected database/authorization/read errors in protected Release A routes escaped their JSON contract. | A small shared error boundary wraps every BloomOps route, preserves established statuses, sanitizes unexpected errors to JSON 500, and applies `no-store` to all responses. Forced late constraint failures are checked through real route handlers and the built Worker. |
| Middleware could replace a protected handler's `no-store` policy with weaker revalidation headers. | Middleware now preserves `no-store` for authenticated and denied responses, portal HTML, sign-in, and token-bearing invitation/auth routes. Regression tests cover the merged boundary, with a built-Worker assertion in browser acceptance. |
| Enabled Worker invocation logs/traces could persist raw invitation or magic-link tokens from request URLs. | Disable Worker observability logs, invocation logs, and traces until URL redaction is available. A regression resolves the actual Wrangler configuration for development, staging, and production and proves all three are disabled. Business activity remains in D1. |
| The supported 200-client list and large assigned scopes exceeded D1’s bound-variable limit, although SQLite unit calls passed. | Client scope and primary-contact lookups now bind the authorized ID set as one JSON parameter and apply relational `json_each` predicates with the existing workspace filter. Actual D1 proves both full-page reads and large assignment scope without leaking unassigned clients; two focused regressions also verify contact association and counts. |
| The staging config guard accepted additional D1/R2 bindings and an incorrect environment/origin despite validating the first resource names. | The guard now requires exactly one D1 and R2 binding, the staging environment, and the explicit staging origin. Disposable config-corruption tests prove rejection without contacting Cloudflare. |

All corrections use the existing schema, capabilities, lifecycle operations, reason mappings, and design primitives. No migration, historical migration rewrite, dependency, resource binding, product destination, or Release B feature was added.

### Security, data, lifecycle, and failure evidence

The new tests compare unauthorized portal responses byte-for-byte for unknown, foreign, internal, restricted, and instance-as-item identifiers; assert exact Client-facing field allowlists; deny Client calls into internal Client/Service/assignment/member/invitation/onboarding APIs; and invalidate already-issued sessions immediately after membership suspension/removal or workspace deactivation. Unsupported/prototype action names default deny. Existing A4–A10 regressions retain department/owner non-grants, canonical client/service assignment boundaries, workspace-body/query smuggling denial, restricted activity privacy, and same-email/contact-link acceptance refusals.

Direct SQL attacks reject fourteen additional A8–A10 foreign-parent combinations for provenance, activation, contact association, submissions, and resolutions. The existing migration/schema/compiler tests retain same-workspace composite FKs, partial uniqueness, immutable definitions/provenance/activity, deterministic generation, and bootstrap idempotency. Later master publication and contact-address edits preserve runtime snapshots and accepted identity. The domain-only fresh database has exactly the 27 Release A domain tables.

Lifecycle tests retain concurrent first activation, contact/service prerequisite changes, failed/missing local mail, uncertain acknowledgement, stale sender/token finalization, expired delivery leases, and late core rollback. New cases add workspace/role/status/primary/removal races and expiry recovery. A10 regression plus new adversarial tests cover duplicate completion/submission/verification, competing waiver/N/A rationale, submission versus verification, two final mutations, response-loss retries, late mutation rollback, hidden required work, optional work, independent service status, and protection of non-initial or unexpected Client lifecycle states. Significant lifecycle events are singular and immutable. Raw tokens remain hashed in storage and absent from public invitation DTOs and activity; test delivery uses only memory or development R2 capture.

### Verification

All required local verification passed on 2026-09-07/08; final browser acceptance completed on 2026-09-08 before updating the documentation index or opening the PR.

| Exact command | Result |
|---|---|
| `npm ci` | Passed; lockfile unchanged. |
| `node --test tests/bloomops-hardening-*.test.mjs` | 82/82 passed. |
| `node --test tests/bloomops-onboarding-runtime.test.mjs` | A10: 39/39 passed. |
| `node --test tests/bloomops-activation.test.mjs` | A9: 44/44 passed. |
| `node --test tests/bloomops-onboarding-compiler.test.mjs tests/bloomops-onboarding-templates.test.mjs` | A8: 72/72 passed. |
| `node --test tests/bloomops-auth.test.mjs tests/bloomops-authorization.test.mjs tests/bloomops-invitations.test.mjs tests/bloomops-membership.test.mjs tests/bloomops-mail.test.mjs tests/bloomops-middleware.test.mjs tests/bloomops-clients.test.mjs tests/bloomops-services.test.mjs tests/bloomops-assignments.test.mjs` | 184/184 passed. |
| `node --test tests/bloomops-schema.test.mjs tests/bloomops-shell.test.mjs tests/zero-verify-safety.test.mjs` | 56/56 passed. |
| `npm test` | 3,083/3,083 passed; zero failures/skips. |
| `npm run build` | Passed, including Next's lint/type checks. |
| `npm run cf:build` | Passed; OpenNext Worker bundle generated. |
| `node .github/scripts/verify-zero-remote.mjs --local` | 22 checks passed: genuinely empty disposable database, all 60 inherited and 8 domain migrations, exactly 63 migration-defined tables including ledgers (27 domain tables), all 55 explicit domain indexes and 13 immutability triggers, valid FKs/SQLite integrity, and second pass with identical complete schema and both ledgers. |
| `node scripts/release-a-hardening-smoke-local.mjs` | A11 actual workerd/D1: 26 checks passed. |
| `node scripts/onboarding-runtime-smoke-local.mjs` | A10 actual workerd/D1: 27 checks passed. |
| `node scripts/activation-smoke-local.mjs` | A9 actual workerd/D1: 14 checks passed. |
| `node scripts/onboarding-smoke-local.mjs` | A8 actual workerd/D1: 12 checks passed. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 passed. |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 passed; local target only. |
| `node scripts/onboarding-portal-review-local.mjs --url http://localhost:8787 --out /tmp/bloomops-a11-review --playwright /tmp/bloomops-a11-browser` | 174/174 checks passed; 42 acceptance screenshots at 1440/1024/768/390/320px, plus the live design-reference capture. |
| `node --check` on changed/new JavaScript scripts and modules; `git diff --check` | All 48 JavaScript files passed; diff check passed. |

These commands used Node 22.22.1. Browser tooling was installed outside the repository with `npm install --prefix /tmp/bloomops-a11-browser --no-audit --no-fund --fetch-retries=0 playwright` (Playwright 1.63.0; existing Chromium 153.0.8010.12). The built Worker ran through `npx --no-install opennextjs-cloudflare preview -- --log-level error`; this avoids local request-URL logging. The existing local Worker database also received `npm run db:schema:local`, `npm run db:migrate:local`, and `npm run db:domain:migrate:local` before HTTP acceptance; the genuinely fresh/no-op proof is the separate disposable verifier above.

The earlier fresh-migration attempt hit a Wrangler subprocess assertion (`message?.id === id`); a fresh disposable rerun passed all checks. No migration was modified to accommodate it. The final verification session reran npm installation and Node tests outside the filesystem/process sandbox: the sandbox blocked installation subprocesses/cache writes and reported only test-file counts, which were discarded as evidence. Local workerd checks also require loopback sockets that the sandbox refuses; their approved reruns remain local. Focused reproductions failed before their corrections; test-harness timing and event-metadata integration mistakes caught during verification were corrected before the passing runs.

Browser verification exposed four harness issues: the reference screenshot could precede the gallery's render; a standalone Wrangler fixture connection hit `SQLITE_BUSY` while the live Worker held the same local database; a fixed publication-marker title could already exist after a previous run, causing a false failure despite identical runtime snapshots; and two later Client-create fixtures omitted required contact fields, so validation correctly prevented the intended database-failure/multi-client checks. Reference capture now waits for the gallery heading and fonts. The new-version fixture insert uses a fixed ID with `ON CONFLICT(id) DO NOTHING`, retries only explicit lock errors, and verifies the exact stored definition hash. Its title is unique per run, preserving bootstrap's immutable-history behavior. Both Client fixtures now supply valid required contacts. Other fixture/application mutations are not blindly replayed, and application validation and runtime/D1 race tests are unchanged.

### Dependency advisory assessment

The supplementary `npm audit --json --fetch-retries=0` returned its expected nonzero advisory status: 49 affected package entries (5 high, 43 moderate, 1 low), including transitive duplicates. No lockfile or dependency was changed. This is not a zero-advisory dependency tree. The high-severity entries are brace-expansion, Browserslist, nanoid, PostCSS, and sharp; the first four concern build/query/CSS/generator inputs not accepted by Release A's onboarding APIs. The OpenNext Cloudflare image handler uses the optional Cloudflare Images binding, not sharp/libvips, and no Images binding is configured. Tiptap's [attribute-merging advisory](https://github.com/advisories/GHSA-cp6q-959q-f8rh) concerns an untrusted attribute-object boundary: Release A has no editor/import workflow, and the inherited editor uses fixed schemas and HTML content. No reachable Release A exploit was identified by this scoped assessment. Dependency maintenance and a separate inherited-editor review remain follow-up work; the audit's suggested major Next/Drizzle changes were not applied as unrelated release hardening.

### Acceptance, isolation, and release closure

Both Release A acceptance stories passed through the built Worker, real Better Auth sessions, local D1/R2, and Chromium. Story 1 creates Lawrence and Kajabi, assigns Ary, activates and accepts the local invitation, completes Common + Kajabi requirements, keeps submitted Kajabi access awaiting verification, and reaches Client Active only after Ary verifies it. The Service remains Planned and each significant lifecycle event occurs once. Story 2 creates James with Social + Ads + GHL, proves one Meta item linked to both applicable engagements, gives the Social contractor only canonical Social scope and Ary GHL scope, refuses parent/sibling/onboarding access without assignment, isolates both Clients, and preserves all generated items/provenance/service links after a new master version is published. The flow requires only Release A's 27 domain tables.

The 174 browser/HTTP checks include sign-in and invitation acceptance, five-width portal/internal layouts, accessible progress values/text, required/optional and awaiting-verification/completion states, keyboard completion/verification/multiline waiver/N/A, duplicate-click singularity, reload persistence, expired invitation recovery, safe malformed-input and late-failure responses with rollback, immediate session suspension, and separate single-/multi-client contexts. All 42 acceptance screenshots were captured at the stated widths; representative desktop/mobile states and both multi-client layouts were visually inspected. The text browsing tool refused the design-reference URL, but Chromium successfully opened the live design gallery; its fully rendered reference was captured and visually inspected.

No production, DNS/custom domain, staging data, or Leadsthatbloom resource was manually modified. Local Worker tests refuse non-loopback targets and require development R2 mail; D1 smoke uses disposable non-persistent local bindings. No real email was sent.

A11 adds no Release B features. Deliberate portal retargeting/revocation/reinvite, general file uploads, arbitrary template-editing UI, and later execution workflows remain outside Release A. Release A is complete and audited locally. Independent PR review, user-controlled merge, then staging deployment and remote zero-to-current verification on the actual merge SHA are still required before final release closure.

### Exact A11 file manifest

The net PR changes these 53 files relative to the verified main. The task carrier is deleted and has no net PR diff.

Domain consistency and activation UI:

- `components/bloomops/ClientActivation.jsx`
- `lib/bloomops/activity.mjs`
- `lib/bloomops/assignments.mjs`
- `lib/bloomops/client-activation.mjs`
- `lib/bloomops/client-contacts.mjs`
- `lib/bloomops/client-invitation-acceptance.mjs`
- `lib/bloomops/clients.mjs`
- `lib/bloomops/invitations.mjs`
- `lib/bloomops/membership.mjs`
- `lib/bloomops/onboarding-runtime.mjs`
- `lib/bloomops/services.mjs`

Protected API error boundary:

- `app/api/bloomops/clients/[id]/activate/route.js`
- `app/api/bloomops/clients/[id]/assignments/[assignmentId]/route.js`
- `app/api/bloomops/clients/[id]/assignments/route.js`
- `app/api/bloomops/clients/[id]/contacts/[contactId]/route.js`
- `app/api/bloomops/clients/[id]/contacts/route.js`
- `app/api/bloomops/clients/[id]/onboarding/items/[itemId]/[operation]/route.js`
- `app/api/bloomops/clients/[id]/onboarding/route.js`
- `app/api/bloomops/clients/[id]/retry-invitation/route.js`
- `app/api/bloomops/clients/[id]/route.js`
- `app/api/bloomops/clients/[id]/services/[serviceId]/assignments/[assignmentId]/route.js`
- `app/api/bloomops/clients/[id]/services/[serviceId]/assignments/route.js`
- `app/api/bloomops/clients/[id]/services/[serviceId]/route.js`
- `app/api/bloomops/clients/[id]/services/route.js`
- `app/api/bloomops/clients/_shared.mjs`
- `app/api/bloomops/clients/route.js`
- `app/api/bloomops/invitations/[id]/resend/route.js`
- `app/api/bloomops/invitations/[id]/revoke/route.js`
- `app/api/bloomops/invitations/accept/route.js`
- `app/api/bloomops/invitations/route.js`
- `app/api/bloomops/me/route.js`
- `app/api/bloomops/members/[id]/route.js`
- `app/api/bloomops/members/route.js`
- `app/api/bloomops/portal/onboarding/[id]/items/[itemId]/submit/route.js`
- `app/api/bloomops/portal/onboarding/[id]/route.js`
- `app/api/bloomops/portal/onboarding/route.js`
- `lib/bloomops/api-handler.mjs`
- `middleware.js`

Environment guards, tests, and verification scripts:

- `.github/scripts/ensure-staging-resources.mjs`
- `.github/scripts/verify-zero-remote.mjs`
- `wrangler.jsonc`
- `scripts/onboarding-portal-review-local.mjs`
- `scripts/release-a-hardening-smoke-local.mjs`
- `tests/bloomops-activation.test.mjs`
- `tests/bloomops-middleware.test.mjs`
- `tests/bloomops-hardening-config.test.mjs`
- `tests/bloomops-hardening-data.test.mjs`
- `tests/bloomops-hardening-http.test.mjs`
- `tests/bloomops-hardening-invitations.test.mjs`
- `tests/bloomops-hardening-lifecycle.test.mjs`

Documentation:

- `docs/BUILD_STATE.md`
- `docs/DOMAIN_MODEL.md`
- `docs/INDEX.md`

## Client Onboarding Portal (A10)

### Runtime and privacy

`onboarding-views.mjs` supplies a dedicated Client allowlist through the portal page and no-store GET APIs. It reloads active membership/contact scope and prefers the exact A9 activation instance, with a latest-instance fallback for existing generated work. It projects each reachable client into its own named section. Only visibility `client` items are read for the portal. Logical keys, template provenance, service relationships, membership/actor ids, raw invitations, and resolution rationale never reach Client props or API JSON. Internal views use the same A4 resource policy and omit restricted items for unnamed managers/team members; item activity follows that visibility too.

“Your steps” counts only client-visible, client-responsible required items. Completed/Waived/Not Applicable and durable verification submissions count as the Client having done their part. Optional items do not enter the denominator. A Client can reach 100% while overall onboarding still awaits agency verification or hidden work; the portal says they are all set for now without exposing hidden counts. Visible agency-owned work remains read-only.

### Mutations, durable facts, and completion

`onboarding-runtime.mjs` is the canonical mutation engine. `onboarding.submit` is Client-only and requires contact scope plus client visibility/responsibility. Non-verification work becomes Completed with completion actor/time; verification work becomes In Progress with an immutable submission and no completion/verification fields. Repeated submissions/completions are no-ops. There is no Client undo or arbitrary-status API.

`onboarding.verify` and `onboarding.manage` are Owner/Admin/Project Manager actions. Existing restricted-record policy still applies. A Team Member's assignment, department, or internal owner designation grants no write. Verification requires actual submission and records verified/completed actor/time together. Internal users can complete non-client work (including verification when configured). Waived/Not Applicable require a bounded non-empty reason, retained both operationally and in append-only activity; a terminal resolution cannot be overwritten. Client UI shows “No action needed” without the internal rationale.

The first real item mutation starts a Not Started instance; viewing does not. One D1 batch owns the item, durable fact, semantic event, instance lifecycle, and optional Client lifecycle transition. A compare-and-set guard rechecks membership, workspace, role, Client contact, item visibility/responsibility/verification and current status under the write lock. Contenders reload boundedly and converge to a no-op or safe refusal. Final predicates run after the item write against ALL required items, not the portal count. Completion records ONBOARDING_COMPLETED once and activates the Client only if this is A9's initial instance and relationship status is still Onboarding; a distinct CLIENT_ONBOARDING_COMPLETED event records that transition. Service status and unexpected Client lifecycle states are untouched. Late event failures roll back the whole batch; API errors never expose database details.

### Additive migration and UX boundary

Migration `0007_a10_onboarding_progress.sql` adds `onboarding_item_submissions` and `onboarding_item_resolutions`, their primary-key uniqueness and same-workspace item/member foreign keys, a bounded-reason CHECK, and four immutable-fact update/delete triggers. Drizzle schema, snapshot and journal match. There is no prior migration edit, table rebuild, or runtime schema repair. The item remains the canonical owner of outcome/status; its instance supplies the client relationship.

The portal and internal Client > Onboarding tab use existing Bloom components, an ordered list, accessible text progress, keyboard actions and status announcements. Internal resolution controls require reasons and show the stored rationale. Schema-v1 defines no input type/upload flag/URL: A10 acknowledges externally described steps, provides no file uploader, invents no links, and does not claim a Files module. No master definition or generated template snapshot is silently rewritten. No Release B features, payments, queues or additional notifications are included.

### A10 verification

Verification is local only, using memory or development R2 mail. No real email or staging, production, DNS/custom-domain, or Leadsthatbloom resource was modified. The live design reference could not be opened; repository design guidance was used. Final verification evidence follows. All Node checks use 22.22.1. No application dependency, AGENTS.md, deployment configuration, or workflow was changed.

| Check | Result |
|---|---|
| `npm ci` | Exit 0; lockfile/dependencies unchanged |
| A10 focused | 39/39 |
| A9 regression | 44/44 |
| A8 template/compiler regression | 72/72 |
| Affected authorization/client/service/assignment/invitation | 141/141 |
| Shell/schema | 36/36; combined regression invocation 332/332 |
| `npm test`, Node 22.22.1 | 3001/3001, no failures or skipped tests |
| `npm run build` | Exit 0, including lint/type checks |
| `npm run cf:build` | Exit 0; `.open-next/worker.js` emitted; non-blocking dependency `punycode` deprecation warning |
| Disposable workerd A10 smoke | 27/27, including canonical Lawrence/Kajabi/assignment/activation/acceptance/completion and late final-event rollback |
| Local zero-to-current and no-op pass | 19/19: fresh disposable local D1, all 60 inherited/eight domain migrations, 27 domain tables, 55 explicit indexes, 13 immutable-data triggers; second pass applies nothing and schema/both ledgers stay identical |
| Existing actual D1 regression smoke | A9 14/14; A8 12/12 |
| Built Worker HTTP smoke (`auth-smoke-local.mjs`) | 144/144 |
| External verifier against local Worker | 21/21; development R2 mail only |
| A10 built Worker HTTP/browser/Release A acceptance (`onboarding-portal-review-local.mjs`) | 95/95, including complete Story 1, Story 2 merged Meta and Client isolation, keyboard completion, reload persistence, internal verification, waiver/N/A and safe denials |
| Browser viewports | 1440/1024/768/390/320px; 20 screenshots in `/tmp/bloomops-a10-review`; representative phone todo/waiting/complete, phone internal, and desktop internal/complete inspected |
| Syntax and `git diff --check` | Pass |

One intermediate rebuild received SIGTERM without a compiler diagnostic while the preview was running; both final builds passed sequentially after stopping that preview. The first browser pass found that the touch-size assertion measured hidden buttons inside closed resolution panels; the corrected check measures visible controls and separately tests the opened resolution buttons. No production behavior was changed to satisfy that test. Formatting tooling and Playwright/Chromium are external to application dependencies.

The temporary `A10_CODEX_PROMPT.txt` is removed before the implementation commit, with no net prompt diff against main. No remote deployment is claimed. A11 must wait for independent A10 audit/merge, green staging on the merge SHA, and green remote zero-to-current on that same SHA (manually dispatch if the existing path filters do not trigger it).

## Post-merge A8 verifier cleanup correction (2026-09-07)

Read-only inspection of the Actions logs confirmed that [Deploy staging 34078492009](https://github.com/Beeyach/bloomops/actions/runs/34078492009) succeeded on `adcdec226f75b81969d510ac21a4d772a1cf5371`. Concurrent [zero-to-current run 34078492054](https://github.com/Beeyach/bloomops/actions/runs/34078492054) passed the disposable database verification: all 60 inherited and six domain migrations, all 23 domain tables, migration-defined triggers/indexes, and an identical no-op second pass. It deleted its disposable database and restored the exact original seven-database inventory. Only the final staging table-count assertion failed: the independent deploy legitimately applied migration 0005, taking staging from 58 to 59 tables during the verifier run.

The cleanup now compares stable staging UUID and creation time; before/after table counts are explicitly informational. `.github/scripts/zero-verify-safety.mjs` holds the pure checks used by the live verifier. Exact original account inventory (UUID, name, version, creation time) is still required, independent of API ordering. The disposable name protections, distinct environment IDs, fresh disposable ID checks, temporary disposable-only configuration, and exact identity check before deletion remain enforced. The command guard now explicitly requires the `DB` binding as well as that temporary config, rejects named protected targets even with a valid config, and rejects environment/config overrides. Staging access is limited to read-only `d1 info`. The migration paths and workflow concurrency are unchanged; staging deployment is neither serialized nor cancelled.

`tests/zero-verify-safety.test.mjs` adds 20 local regression tests covering the observed 58-to-59 race, changed/missing staging identity, wrong disposable deletion ID, extra/missing/changed inventory entries, protected names and IDs, valid scoped commands, and refused target/config overrides. The workflow runs these tests before account operations and watches the helper/test paths. Focused tests pass 20/20 and the full suite passes 2918/2918 under Node 22.22.1. The local zero-to-current verifier exits 0: all 60 inherited migrations, six domain migrations, 23 domain tables, 50 indexes, and five immutable-data triggers are present; the second pass applies nothing and preserves the schema and both ledgers exactly. Node syntax, workflow YAML parsing, and diff checks pass. Application builds are not rerun for this verifier/workflow/test/docs-only change; no application, dependency, schema, or migration changed, including migration 0005.

The temporary task prompt is removed before the implementation commit, leaving no net prompt-file diff against main. No remote Wrangler command or manual staging mutation is performed in this correction. Production, DNS, and Leadsthatbloom remain untouched. That acceptance gate was subsequently satisfied after PR #11 merged: remote zero-to-current run 34093902316 passed on main `420b1451a8e22d8b7bef39dc052263a176bcfa2d` before A9 began.

## Client Activation (A9)

Implementation on `codex/a9-client-activation`, updated by merge from current main `420b1451a8e22d8b7bef39dc052263a176bcfa2d`. This is the expected PR #11 verifier correction, not unrelated base movement. Its post-merge [Deploy staging 34093902305](https://github.com/Beeyach/bloomops/actions/runs/34093902305) and [zero-to-current 34093902316](https://github.com/Beeyach/bloomops/actions/runs/34093902316) both passed before A9 implementation. They satisfy the replacement acceptance gate established by the verifier correction; the historical failed run named in the temporary A9 prompt remains historical.

### A9 audit correction: generic invitation revoke

The audit of PR #12 at `b0e4d3f8c2154de40e1eddb7a30dbe87e73de755` found that generic revoke could invalidate a delivered activation invitation while leaving delivery status `sent`. The correction adds resend's existing workspace-scoped `invitationContact` guard to `revokeInvitation`, before any status write or activity. The unchanged route returns the existing `activation_managed` HTTP 409 response. Ordinary invitations, including Client-role invitations without a contact association, remain revocable.

Two regressions were confirmed to fail against the reviewed implementation: the domain primitive returned success and the real HTTP route returned 200. They now prove refusal preserves the pending invitation and association, usable original token (including successful acceptance), `sent` delivery status, all core A9 rows, client lifecycle and activity; no `INVITATION_REVOKED` is appended. Real-session HTTP coverage checks Owner/Admin refusal, missing/foreign invitation equivalence, unauthenticated/cross-origin/suspended denial, and ordinary Client invitation revocation. Existing generic resend/retarget and ordinary team invitation lifecycle tests remain passing.

Correction verification on Node 22.22.1: focused A9 44/44, invitations 13/13, auth/authorization 34/34 (91/91 combined); `npm test` 2962/2962 with no failures or skips; `npm run build` exits 0 including lint/type checks. `npm run cf:build` exits 0 and emits `.open-next/worker.js` (non-blocking dependency `punycode` deprecation warning); `git diff --check` passes. No migration, UI change, browser screenshot rerun, activation-specific revoke/reinvite, or A10 work is included. Mail uses test transports only. PR #12 remains for independent review against main `420b1451a8e22d8b7bef39dc052263a176bcfa2d`, without merging.

### Core transaction and authorization

`lib/bloomops/client-activation.mjs` implements the distinct `client.activate` action for Owner, Admin, and Project Manager, scoped by the existing internal client descriptor. It reloads active membership through the authorization engine even when called with a previously loaded actor. Department membership and internal ownership grant no access. The POST activation and retry-invitation routes use the existing origin/session/resource checks; body-supplied identities, workspace ids, services, and template ids are not read.

Initial activation requires Draft, one primary contact with a valid normalized invitation address, and at least one open purchased service. The exact database set of Planned/Onboarding/Active/Paused engagements is passed to A8; terminal services are excluded. The canonical docs define no concrete per-service team prerequisite, so none was invented. Content Calendar alone generates Common. A8 still validates publications/hashes, compiles and merges logical keys, and retains exact source versions.

A small A8 refactor exposes `prepareOnboardingWrites`: all the original plan validation plus prepared statements, without writing. The original standalone `persistOnboardingPlan` executes that same batch with unchanged conflict/rollback semantics. A9 composes these statements with `client_activations`, Draft → Onboarding, and CLIENT_ACTIVATED / ONBOARDING_STARTED in one D1 transaction. Mutable contact, service-set, active workspace, and actor membership prerequisites are checked again under the write lock. A stale edit aborts the whole batch through the existing lifecycle CHECK constraint and returns a calm conflict. Late failures cannot leave partial onboarding, lifecycle or core activity.

The open-onboarding unique index and unique initial client activation are the concurrency authority. Competing requests converge to the committed instance or a safe conflict requiring reload. An activation record survives later onboarding completion or client status changes, so a retry cannot mistake a later lifecycle for permission to start another initial activation. Service status, health, ownership, assignments, and source-template bindings are untouched.

### Invitation delivery and recovery

The activation row captures the primary contact, recipient address and display name. The existing invitation module creates/rotates its Client-role invitation, preserves the seven-day TTL and token hashing, and stores an explicit contact association. Initial invitation creation, association and INVITATION_SENT activity are atomic. Activation cannot repurpose an unrelated pending invitation, and generic invitation creation/resend cannot retarget or bypass an activation's delivery claim. Generic revoke also refuses contact-associated invitations with `activation_managed`, using the same ownership check as resend and the existing HTTP 409 mapping. It does not change activation delivery state; intentional portal-access revocation/reinvite remains a future lifecycle workflow.

A conditional database update claims delivery for five minutes. A send is bounded to thirty seconds; crashes leave a lease that another request can recover after expiry. Token creation/rotation checks the same claim at the database mutation, so an old sender cannot supersede a newer retry's token. Delivery finalization and its client-level event are fenced by the attempt id and commit together. No raw token is persisted, returned by the activation routes, or logged; it exists only for the immediate mail send through the existing mailer.

Core success plus mail failure is HTTP 200 with `activated: true` and a delivery warning. The separate retry route requires an already committed activation and never reruns core generation. Failed sends retain a pending invitation; retry rotates its hash and sends a new token. A confirmed successful send becomes a no-op on subsequent activation requests. An invitation accepted after an uncertain prior send proves receipt without sending again. A database failure around delivery also preserves the committed core; a stranded lease is recoverable after expiry.

External delivery is not exactly-once: if a provider accepts a message but the acknowledgement or final database write is lost, a retry may send a replacement. Only the latest pending token remains valid, and core facts and confirmed client invitation activity remain singular. No queue or provider SDK was added. Generic INVITATION_SENT / INVITATION_RESENT retain their existing meaning of token preparation; CLIENT_INVITED means the first confirmed activation invitation delivery. ONBOARDING_STARTED means generated onboarding was established, not that runtime item completion has begun.

### Portal linkage and migration

Additive migration `0006_a9_client_activation.sql` (generated Drizzle snapshot/journal, plus immutability triggers) adds `client_activations` and `client_invitation_contacts`, five unique indexes, and four triggers. No existing table is rebuilt and no prior migration is changed. Composite keys enforce the same workspace/client for activation, onboarding, contact and invitation relationships. The initial activation identity/snapshot and invitation-contact association are immutable; delivery fields remain mutable. The zero verifier derives all new tables, indexes and triggers from the schema/migrations.

`client-invitation-acceptance.mjs` handles only explicit associated invitations. Matching signed-in email, current intended contact address, Client role, active workspace, compatible membership, and absence of another linked client are checked at acceptance. Membership creation/reactivation, invitation acceptance, contact link, and activity are one transaction; a token rotated/revoked or a contact changed between reads and writes aborts the batch. Retry by the same active linked identity is idempotent. A changed primary marker still links the originally invited contact, not the new primary. Existing unlinked Client memberships can accept; internal memberships and conflicting client scope cannot be silently converted. A6's contact payload still exposes only `linked`, never user ids. Contacts referenced by activation/invitations cannot be removed through the address book; the FK refusal is translated to a calm response.

### Internal UX and boundary

The client detail offers the small `ClientActivation` form only when `client.activate` is allowed. Draft activation explains the effects, validation errors name the missing setup, confirmed activation refreshes the lifecycle, and pending/failed delivery remains visible after reload with a retry action when available. Activity renders the new facts in words. The Onboarding tab reports only whether generation occurred. Existing Bloom primitives and tokens are used; the live Bloomlab reference could not be opened in this environment, so no live visual-reference inspection is claimed.

A10's onboarding portal, item completion/verification and upload UX are not implemented. No Projects, Actions, Milestones, Deliverables, Social/Ads/Systems execution, Pages, Finance, payments, notifications beyond this invitation, or sample production/staging clients were added. Explicit contact retargeting/unlinking is deferred; changing the captured recipient address fails safely rather than guessing who should gain access.

### A9 verification

All verification used local development D1/R2 or disposable workerd storage. Cloudflare credentials were removed from local Worker commands; no real invitation email was sent. No staging data, production, DNS, custom domains, or Leadsthatbloom resources were modified.

| Check | Result |
|---|---|
| `npm ci` | Exit 0; lockfile/dependencies unchanged |
| Focused A9 (`tests/bloomops-activation.test.mjs`) | 42/42 pass |
| Focused A8 regression | 72/72 pass |
| Affected invitation/auth/authorization/client/service/assignment regression | 158/158 pass |
| `npm test` (Node 22.22.1, matching CI major) | 2960/2960 pass, zero skipped |
| `npm run build` | Exit 0, including Next lint/type checks |
| `npm run cf:build` | Exit 0, Worker built |
| `node .github/scripts/verify-zero-remote.mjs --local` | Exit 0; 19 checks, all 60 inherited and seven domain migrations; 25 domain tables, 55 migration-defined indexes, nine triggers; second pass applies nothing and preserves schema and both ledgers exactly |
| `node scripts/activation-smoke-local.mjs` | 14/14 pass on actual disposable workerd D1: activation, repeat, merged Meta links, acceptance/link/repeat, late core rollback |
| `node scripts/onboarding-smoke-local.mjs` | 12/12 pass on actual disposable workerd D1 |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 pass against the built local Worker, including A9 activation/delivery/repeat/acceptance/link/portal scope and denied requests |
| `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 pass against local Worker; development mailbox only |
| `node scripts/activation-review-local.mjs` | 37/37 browser checks at 1440, 1024, 768, 390 and 320px; 16 screenshots captured under `/tmp/bloomops-a9-review`, with phone draft/retry and desktop success inspected; keyboard activation, actionable validation, reload persistence and real recoverable invitation conflict/retry pass |
| `git diff --check` and new script syntax checks | Pass |

Browser review uses Playwright installed outside the repository and Chromium's local system prerequisites, with no application dependency added. `scripts/activation-review-local.mjs` requires the local smoke workspace and accepts `--playwright` for that external installation. The A9 test double serializes concurrent batches while retaining actual SQLite BEGIN/COMMIT/ROLLBACK; actual workerd smoke independently proves core transaction rollback. No remote A9 deployment was attempted; independent audit/merge and subsequent main verification remain outside this branch's local evidence.

## Onboarding Template Engine (A8)

A8 implements the template and relational generation engine. There is no new route, UI, activation, invitation, mail, identity linkage, project, action, deliverable, or client/service lifecycle write. A9 remains the orchestration boundary.

### Definition language and default configuration

`lib/bloomops/onboarding-definition.mjs` owns schema version 1: `{ schemaVersion, category, items }`. Categories are `common`, `social`, `ads`, `ghl`, `kajabi`; every template has `kind = onboarding`. Each item contains `logicalKey`, `title`, nullable/optional `instructions`, boolean `required` and `verificationRequired`, canonical `responsibleParty` and `visibility`, and integer `position`. Unknown fields (including progress/status/completion or membership identifiers), duplicate logical keys, invalid categories/enums, coercible non-booleans, and malformed values are rejected. Keys use lowercase letters/digits separated by underscores (64 characters maximum); titles are bounded at 200 characters, instructions at 10,000, and each definition at 100 items. Positions are signed 32-bit integers. Runtime assignment of a specific user is deferred; the blueprint can preserve `responsibleParty = user` without embedding mutable membership ids.

Canonical serialization recursively sorts object properties; validation trims text, normalizes missing/empty instructions to null, and orders items by position then logical key. SHA-256 is computed with Web Crypto over UTF-8 canonical JSON; no added package. Default JSON and precomputed SHA-256 constants live together in the sole defaults module, and tests independently recompute them with Node `createHash` over the stored bytes.

`lib/bloomops/onboarding-defaults.mjs` is the single source for the published V1 blueprints:

| Slug / name | Exact logical keys, in source order |
|---|---|
| `common` / Common | `agreement`, `brand_assets`, `kickoff_booking` |
| `social` / Social | `instagram_access`, `meta_business_access` |
| `ads` / Ads | `meta_business_access` |
| `ghl` / GHL | `ghl_access` |
| `kajabi` / Kajabi | `kajabi_access`, `course_videos` |

All defaults are client-visible and client-responsible. All are required except `course_videos`. Access requirements require verification; agreement, assets, kickoff booking, and course videos do not. Social and Ads intentionally share identical Meta instructions. Access wording requests approved business, delegated, or invited access and explicitly says not to send a password. The exact instructions and positions are stored in the canonical defaults module, not separately maintained as SQL or test fixtures.

The A7 `bootstrapPlan` now appends these defaults after the service catalogue. Existing workspaces receive them on the existing bootstrap path, and future workspaces use that same path. Conflict-targeted inserts preserve template metadata (including renamed/inactive templates), existing V1 bytes and state, and any newer published version. A missing V1 beside a newer publication is backfilled as retired with no invented publication timestamp. A second pass inserts nothing; no sample clients or runtime onboarding are seeded. No deployment was performed from the A8 branch; an existing remote workspace receives defaults when its normal bootstrap next runs after approval.

### Immutable versions and publication

`lib/bloomops/onboarding-templates.mjs` provides workspace-scoped template/version reads, current active published selection, validated creation, and publication. Domain primitives take a trusted server-side workspace context; they are not exposed through an HTTP route. A9 must authorize the actor and selected client/services before orchestration; department identity and membership grant nothing here.

Editing creates a new draft. `max(version_number) + 1` is computed inside the INSERT itself under SQLite/D1's write serialization, not selected before inserting. The existing template/version unique index remains the final authority; a matching constraint failure becomes `version_conflict`, while unrelated faults propagate. Concurrent real domain calls prove unique increasing numbers. Creator membership, when supplied, must be active in the same workspace.

Publication validates the stored canonical definition/hash, then atomically retires the old publication and publishes the target draft in one Drizzle D1 batch. Both updates are conditional on the target still being draft: a competing publisher cannot cause a stale request to retire a newer version. Publishing an already published target is a true no-op, and a retired target cannot be republished. There is no API to return published/retired versions to draft. Publication never writes definition fields. A forced second-update failure proves the first retirement rolls back.

### Provenance and migration

`drizzle/0005_a8_onboarding_templates.sql` and the matching Drizzle declaration/snapshot add:

- `onboarding_instance_templates(workspace_id, onboarding_instance_id, template_version_id, created_at)`, unique on instance/version, with same-workspace foreign keys to the instance and immutable version;
- `template_versions_published_uq`, a partial unique index on `template_id WHERE status = 'published'`;
- append-only update/delete guards for generated source provenance.

The junction is the canonical source history for composed onboarding. `onboarding_instances.template_version_id` is retained for compatibility and always left null by A8; `service_engagements.source_template_version_id` is untouched. Provenance is relational, not a JSON array or activity metadata. Foreign keys protect referenced versions, and audit guards prevent replacing/removing source relationships. They do not freeze runtime onboarding progress.

The zero-to-current verifier now derives trigger expectations from every journaled migration as it already did for indexes, so the new audit guards and partial index are verified alongside the 23 current domain tables. Historical schema tests now expect six domain migrations and retire a publication before publishing another, matching the new invariant.

### Selection, pure compilation, and merging

`prepareOnboardingPlan` validates the workspace client and the explicitly selected service engagements, then loads current published snapshots. Selection is bounded to 50 engagements to stay below D1's 100 bound-parameter limit. The stable mapping is:

| Service type slug | Template slug |
|---|---|
| `social-media-management` | `social` |
| `ads` | `ads` |
| `ghl` | `ghl` |
| `kajabi` | `kajabi` |
| `content-calendar` or another unmapped type | no service template |

Common is always included once. A required missing/inactive/unpublished template or a hash mismatch fails before runtime writes. Service eligibility/lifecycle policy belongs to A9; A8 checks that explicit selections belong to this client/workspace, without changing their states.

`lib/bloomops/onboarding-compiler.mjs` is pure and returns source version ids, selected service ids, and relational item values. Source precedence is Common, Social, Ads, GHL, Kajabi. Source items sort by position then logical key; services sort by id, and final positions normalize to increments of ten. Database return order does not affect output; caller arrays are not mutated.

Only `logicalKey` deduplicates. The first title by canonical precedence wins. Required flags merge with OR, as do verification flags. Responsible party and visibility must agree. Different meaningful instructions fail with `definition_conflict`; identical instructions survive, and one nonempty instruction wins over an empty one. Links are a sorted union of the engagements that caused each service-template requirement to exist. Common alone has no links. Social + Ads creates five requirements, one Meta item with both links, and an Instagram item linked only to Social. Kajabi course videos stays optional.

### Relational snapshots and atomic persistence

`persistOnboardingPlan` revalidates client/service/source ownership, recomputes source hashes, recompiles exact immutable versions, and compares the entire supplied plan. Caller-tampered fields, links, or provenance are rejected. An exact version selected before a newer publication may now be retired; persistence deliberately retains that captured version rather than silently refreshing the plan.

One Drizzle D1 batch inserts a pre-identified instance (`not_started`, legacy source null), every source junction row, relational items (`pending`), and every item-service link. Each insert stays below D1's parameter limit; the batch is never split. A late failure leaves none of the generated instance, source rows, items, or links. Tests use A7's transactional D1 double, and `scripts/onboarding-smoke-local.mjs` additionally proves actual workerd D1 rollback using a disposable local binding with `remoteBindings: false` and no persisted state.

An existing open instance returns `{ ok: false, reason: 'existing_open_instance', instanceId }` without changing anything. The partial unique open-client index handles concurrency; a losing batch rereads only this workspace/client's winning instance and returns the same safe result. A completed instance permits later generation, with old rows retained. No activation event is recorded.

Publishing Social V2 after generation leaves old item fields, links, and exact V1 provenance byte-for-byte unchanged. A second client uses V2. Separate tests prove runtime items can still evolve operationally while definitions and source provenance remain immutable.

### Verification (2026-09-07)

Baseline was verified on fetched `origin/main` at `999f2397b5695cb058bc87769e5142c6aa12c016` (PR #9 merge): 2826 tests passed, zero failures. The A8 branch was created from that exact commit, and no runtime change existed before the baseline run.

| Check | Result |
|---|---|
| `npm ci` | Exit 0 with the unchanged lockfile; no dependency added. npm reported 49 existing dependency vulnerabilities (1 low, 43 moderate, 5 high); dependency remediation is outside A8. |
| Focused `node --test tests/bloomops-onboarding-*.test.mjs tests/bloomops-schema.test.mjs` | 91 pass, 0 fail: 72 new A8 tests plus 19 existing schema tests. |
| `npm test` | 2898 pass, 0 fail, 0 skipped on finalized code. |
| `npm run build` | Exit 0; compile, lint/type validation, static generation, and traces passed. |
| `npm run cf:build` | Exit 0; OpenNext emitted `.open-next/worker.js`. |
| `node .github/scripts/verify-zero-remote.mjs --local` | Exit 0: an empty disposable local D1 reached all 60 inherited migrations and six domain migrations; all 23 domain tables, 50 indexes, and five immutable-data triggers present. Second pass applied nothing; schema and both ledgers identical. |
| Development local schema + inherited/domain migrations | Exit 0; built Worker health reports six domain migrations. |
| `node scripts/onboarding-smoke-local.mjs` | 12/12 checks on actual disposable workerd D1, including version creation/publication, Meta links, exact provenance, immutable generated fields, existing-open handling, and late-insert rollback. |
| `node scripts/auth-smoke-local.mjs --url http://localhost:8787` | 132/132 checks against the built local Worker, including internal/client shells, denied access, unchanged client lifecycle, services, assignments, suspension, and sign-out. |
| External `verify-staging.mjs --url http://127.0.0.1:8787 --expect-env development` | 21/21 checks; actual environment development, mail transport `r2-dev`, six domain migrations. |
| Diff/syntax checks | `git diff --check` and Node syntax checks passed; no app/UI/editor/config/package/AGENTS changes or tracked generated screenshots. |

The exact new tests are in `tests/bloomops-onboarding-compiler.test.mjs` (definition validation, canonical ordering, category selection, merge flags/conflicts/links, optional semantics, and pure tenant checks) and `tests/bloomops-onboarding-templates.test.mjs` (bootstrap/hash/idempotency, immutable creation, genuine competing publication/generation interleavings, database authority, stored snapshots/provenance, atomicity, safe open-instance handling, plan tampering, and same-workspace FK bypass attempts). Existing membership tests now accept either `NOT EXISTS` or conflict-targeted `DO NOTHING` guards; the separate data-level tests prove both forms insert nothing on a second pass.

Verification used installed Node 22.22.1, matching CI. Initial sandboxed runs hit subprocess/loopback restrictions (`EPERM`); they were rerun with the needed local permissions. The first app-smoke attempt used 127.0.0.1 while the configured magic-link origin was localhost; the successful run uses the explicit matching localhost URL and waits through normal auth rate limits. No production behavior was changed for these environment differences. No visual code changed, so the app/shell smoke replaced an unnecessary screenshot campaign.

No remote Wrangler operation, staging/production deploy/provisioning, real email, payment, DNS change, or Leadsthatbloom resource mutation occurred. Local test mail went only to simulated R2. GitHub publication consists solely of the A8 branch and its review PR; merging is reserved for the independent audit.

### A9 boundary and known limitations

No A9 activation/idempotency orchestration, client Draft → Onboarding write, service state write, invitation/email, `client_contacts.user_id`, onboarding completion/verification logic, portal, template settings/JSON editor, project/action/deliverable, or invented activation event exists. The Client Onboarding tab and both shells are unchanged. No inherited Pages/editor code was edited. No new dependency was added.

The one-published index intentionally fails migration if preexisting data violates publication uniqueness; A8 does not guess which source history to discard. Normal A7/bootstrap data contains no such competing publications. Template-management activity is deferred. Future A9 routes must enforce the existing authorization engine before calling these internal primitives. The standalone generation batch is not an A9 activation transaction; A9 must explicitly design the wider orchestration. The legacy nullable single-version source remains for compatibility only. There is no staging or production verification/deployment in this task: tests use isolated SQLite and local workerd/D1/R2 only.


## Deployment Path Decision (A1)

BloomOps deploys to Cloudflare Workers through the OpenNext Cloudflare adapter.

| Package | Before | After | Why |
|---|---|---|---|
| `@cloudflare/next-on-pages` | 1.13.16 | removed | Deprecated on npm (its `deprecated` field points to OpenNext), last release 1.13.16, Pages only, peer range caps Next at 15.5.2 |
| `@opennextjs/cloudflare` | none | 1.20.6 | Current release (2026-09-02), peer `next >=15.5.24 <16 \|\| >=16.3.3`, `wrangler ^4.125.0` |
| `next` | 15.4.11 | 15.5.25 | Newest 15.x. The smallest move that satisfies the adapter. Stays on the 15 line, no framework upgrade |
| `react`, `react-dom` | 18.3.1 | 18.3.1 | Unchanged. Next 15.5 accepts `^18.2.0` |
| `wrangler` | 4.110.0 | 4.129.0 | Adapter requires `^4.125.0` |
| `esbuild` | transitive only | 0.25.4 (devDependency) | `tests/_jsx-hooks.mjs` and OpenNext's bundler both require it from the project root. It used to arrive only as a hoisted dependency of the old adapter |

### Why not vinext

Cloudflare presents vinext as the default Next.js path on Workers today, with OpenNext as the alternative when compatibility requires it. vinext was checked on 2026-09-05 and rejected for this repository:

- vinext is `1.0.0-beta.9` (published 2026-09-02) and its README says it is not yet a production-ready solution for every workload
- it targets Next.js 16 only and states there is no support for deprecated APIs from older versions
- its peer dependencies require `react ^19.2.6`, `react-dom ^19.2.6`, and `vite ^8.0.0`
- it lists platform-specific route configuration (`runtime`) among its known gaps

This app is Next 15 with React 18.3.1, a React 18 TipTap editor, and 73 routes that carried an edge-runtime declaration. Moving to vinext would be a framework-level upgrade (Next 16 and React 19) on top of the infrastructure change, which A1 forbids. OpenNext builds on the standard `next build` output and is the mature option.

### Why the inherited adapter had to go

- `@cloudflare/next-on-pages` is deprecated and frozen. Its peer range `next >=14.3.0 && <=15.5.2` cannot pair with any Next 15.5 release that carries the fix for CVE-2025-66478 (documented in the inherited `LTB-OPENNEXT-CLOUDFLARE-PREVIEW-MIGRATION-REPORT.md`)
- the inherited `LTB-CLOUDFLARE-500-SAME-COMMIT-REBUILD-REPORT.md` records a production 500 inside the adapter's own output that no adapter version could fix
- it is a Cloudflare Pages adapter, and BloomOps needs Workers environments with their own bindings

### Compatibility evidence used

- npm registry metadata queried on 2026-09-05: versions, `peerDependencies`, `deprecated` flags, and publish dates for `@opennextjs/cloudflare`, `vinext`, `@cloudflare/next-on-pages`, `wrangler`, and `next`
- the vinext README on GitHub (status, Next 16 target, React 19 peers, known gaps)
- web search summaries of Cloudflare's "Next.js on Workers" framework guide and the OpenNext Cloudflare docs. Direct reads of `developers.cloudflare.com` and `opennext.js.org` are blocked by this environment's egress policy, so those two sites were not read first-hand
- the inherited reports `LTB-OPENNEXT-CLOUDFLARE-PREVIEW-MIGRATION-REPORT.md`, `LTB-OPENNEXT-PRODUCTION-CANDIDATE-READINESS-REPORT.md`, and `LTB-OPENNEXT-PRODUCTION-CANDIDATE-FINAL-VERIFICATION.md`, which document this same codebase migrated to `@opennextjs/cloudflare` in August 2026 on a branch: 65 edge-runtime removals, 25 context swaps, a preview Worker serving authenticated pages with binding parity, and the full test suite passing. The tracked `.open-next/` output that A0 inherited was a stale artifact of that experiment
- local proof in this repository, recorded under "Verified Working"

### Code changes the adapter required

- 73 `export const runtime = 'edge';` declarations removed under `app/`. OpenNext runs the Node.js runtime on Workers, and the edge runtime is not supported by the adapter
- `getRequestContext` from `@cloudflare/next-on-pages` replaced by `getCloudflareContext` from `@opennextjs/cloudflare` in 26 files: 23 route files, `lib/db.js`, `lib/workspace.mjs`, `middleware.js`, plus one dynamic import in `app/api/visual-evidence/route.js`. The returned `{ env, cf, ctx }` shape is the same, so call sites did not change otherwise
- `next.config.js` calls `initOpenNextCloudflareForDev()` during `next dev` instead of the old `setupDevPlatform()`, and reads `WORKERS_CI_COMMIT_SHA` before the old `CF_PAGES_COMMIT_SHA` for the build stamp
- stale comments that described the edge runtime, Pages, or `wrangler.toml` were rewritten. No component, query, or business logic changed
- new: `open-next.config.ts` (deliberately minimal, no cache), `wrangler.jsonc`, `.dev.vars.example`, `lib/infra-status.mjs`, `app/api/infra/route.js`

## Current Infrastructure

All names below are BloomOps names. None existed in Leadsthatbloom.

| Environment | Selected by | Worker | D1 binding `DB` | R2 binding `FILES` | `BLOOMOPS_ENV` |
|---|---|---|---|---|---|
| development | top-level config (no `--env`) | `bloomops-dev` | `bloomops-dev` (local id `bloomops-dev-local`) | `bloomops-files-dev` | `development` |
| staging | `--env staging` | `bloomops-staging` at `https://bloomops-staging.cool-sunset-2169.workers.dev` | `bloomops-staging` (id `4bb0c8e9-a08f-43d7-9ad7-68b28c371d23`) | `bloomops-files-staging` | `staging` |
| production | `--env production` | `bloomops-production` | `bloomops-production` | `bloomops-files-production` | `production` |

Every environment also has the `ASSETS` binding for static files from `.open-next/assets`.

Configuration lives in `wrangler.jsonc`. Wrangler does not inherit `d1_databases`, `r2_buckets`, or `vars` between environments, so each environment declares its own resources in full. The staging `database_id` is committed. The production `database_id` is still the placeholder `REPLACE_WITH_BLOOMOPS_PRODUCTION_D1_ID` until production is provisioned as a deliberate, separate step. A remote deploy fails on a placeholder, which is the intended failure. Compatibility date is `2025-05-01` with `nodejs_compat` and `global_fetch_strictly_public`, the combination the inherited migration proved on this codebase. Raising the date is a later, deliberate change.

Development runs entirely on wrangler's local D1 and R2 simulation (`.wrangler/state/`, gitignored). `next dev` reaches the same local bindings through `initOpenNextCloudflareForDev()`.

Secrets are per environment and never in the repository. `.dev.vars.example` documents the BloomOps auth and mail secrets for local use. Copy it to `.dev.vars` (gitignored). Public per-environment configuration (`BLOOMOPS_APP_URL`, `BLOOMOPS_MAIL_TRANSPORT`) lives in `wrangler.jsonc` vars.

### Commands

| Purpose | Command | Target |
|---|---|---|
| Dev server with local bindings | `npm run dev` | development, local |
| Worker build | `npm run cf:build` | writes `.open-next/` (gitignored) |
| Local Worker preview | `npm run preview` | development, local |
| Apply base schema | `npm run db:schema:local`, `db:schema:staging`, `db:schema:production` | `DB` binding of that environment |
| Apply migrations | `npm run db:migrate:local`, `db:migrate:staging`, `db:migrate:production` | `DB` binding of that environment |
| Prove a fresh database migrates from zero | `node .github/scripts/verify-zero-remote.mjs --local`, or the "Verify zero-to-current migration" workflow for a disposable remote D1 | a temporary config bound to one disposable database, never a named environment |
| Deploy | `npm run deploy:staging`, `npm run deploy:production` | named environment only |
| Binding types | `npm run cf:typegen` | writes `cloudflare-env.d.ts` (gitignored) |

There is no bare deploy script. Every remote command names its environment. The migration runner refuses `--remote` without `--env`.

### Resource isolation evidence

`wrangler deploy --dry-run` on 2026-09-05, one run per environment, bindings as printed by wrangler:

```
development:  env.DB (bloomops-dev)          D1   env.FILES (bloomops-files-dev)          R2   BLOOMOPS_ENV "development"
staging:      env.DB (bloomops-staging)      D1   env.FILES (bloomops-files-staging)      R2   BLOOMOPS_ENV "staging"
production:   env.DB (bloomops-production)   D1   env.FILES (bloomops-files-production)   R2   BLOOMOPS_ENV "production"
```

A dry run without `--env` prints wrangler's own warning that multiple environments are defined and none was chosen. No environment shares a database or bucket name with any other, and no configuration in the repository names a Leadsthatbloom database, bucket, Worker, or Pages project.

`GET /api/infra` (behind the session gate) reports the serving environment and whether its own `DB` and `FILES` bindings answer. Locally it returns `environment: development` with both bindings `ok`. On a deployed environment it is the runtime check that staging holds staging data only.

### Fresh database bootstrap

The inherited `schema.sql` already contains the tables and columns that 16 of the 60 migrations add, so replaying every migration on a fresh database failed on the third file. `scripts/migrate.mjs` now checks each pending migration's postconditions (the catalogue checks from `scripts/ledger-audit.mjs`) against the live schema and records a migration that is already fully present instead of executing it. On a fresh database this recorded 16 migrations and executed 44, leaving a ledger of 60 and 37 tables. A second run is a no-op. This is the inherited schema kept working on new databases. A2 replaces it with the BloomOps domain schema.

Bootstrap order for any new environment: `db:schema:<env>` then `db:migrate:<env>`.

## Domain Schema (A2)

The BloomOps relational model for Release A lives in `lib/bloomops/schema.mjs` (Drizzle, plain JavaScript) and is materialised by the SQL migrations under `drizzle/`. Runtime access goes through `lib/bloomops/db.mjs`, which wraps the environment's `DB` binding with `drizzle-orm/d1`. No route uses it yet. A2 builds the foundation, A3 onward builds on it.

| Item | Value |
|---|---|
| `drizzle-orm` | 0.45.2 (dependency) |
| `drizzle-kit` | 0.31.10 (devDependency), used for `generate` only, no push, no credentials in `drizzle.config.mjs` |
| Schema | `lib/bloomops/schema.mjs`, 22 tables |
| Migrations | `drizzle/0000_bloomops_release_a_foundation.sql` (tables, indexes, constraints), `drizzle/0001_immutability_triggers.sql` (custom SQL), journal in `drizzle/meta/` |
| Applied by | `wrangler d1 migrations apply DB` per environment, ledger table `d1_migrations`. `wrangler.jsonc` names `drizzle` as every environment's `migrations_dir` |
| Commands | `db:domain:generate`, `db:domain:migrate:local`, `db:domain:migrate:staging`, `db:domain:migrate:production`, `db:domain:status:local`, `db:domain:status:staging` |

### Tables

Identity and organisation: `workspaces`, `user`, `session`, `account`, `verification`, `workspace_memberships`, `workspace_invitations`, `departments`, `department_memberships`, `member_capabilities`.
Clients and services: `bloomops_clients` (exported as `clients`, see coexistence), `client_contacts`, `client_assignments`, `service_types`, `service_engagements`, `service_assignments`.
Templates and onboarding: `templates`, `template_versions`, `onboarding_instances`, `onboarding_items`, `onboarding_item_services`.
History: `activity_events`.

`onboarding_item_services` is the one table beyond the A2 list. It is the junction that lets a single merged onboarding item (Meta access, say) serve several service engagements, which the Release A merge story requires. No projects, tasks, deliverables, content, approvals, comments, requests, finance, notification, queue, or webhook tables were created.

The four auth tables are Better Auth 1.7.2's core schema for sqlite, generated with its CLI and copied field for field (`user`, `session`, `account`, `verification`, camelCase keys over snake_case columns, integer epoch-millisecond timestamps, cascade from `user`). A nullable `account.issuer` column is included ahead of Better Auth's documented account model. No auth behaviour exists. Better Auth itself is not installed.

### Constraints that carry the invariants

- Every business table has `workspace_id` with a foreign key to `workspaces`. Every child row also carries a composite foreign key `(workspace_id, parent_id)` to the parent's unique `(workspace_id, id)`, so a contact, assignment, engagement, onboarding row, invitation, or activity event can never reference a parent in another workspace. 53 foreign-key clauses in total.
- `workspace_memberships`: one row per user per workspace, `role` limited by CHECK to owner, admin, project_manager, team_member, client. `member_capabilities` holds dotted keys such as `finance.view` per membership, unique per pair, so finer permissions are data rather than roles.
- `bloomops_clients`: `relationship_status` and `health` are separate columns with separate CHECK vocabularies. `slug` is unique per workspace.
- `service_engagements`: many per client, own `status` vocabulary, optional `source_template_version_id`. `service_assignments` is unique per engagement and membership and is distinct from `client_assignments`.
- `templates` and `template_versions`: one row per template version number, `definition_json` plus `definition_hash` per snapshot, and a trigger that aborts any update of the definition, hash, template, or version number. A used version cannot be deleted (restrict).
- `onboarding_instances`: at most one open instance per client (partial unique index), so activation can be retried. `onboarding_items`: unique `(instance, logical_key)`, lowercase keys enforced by CHECK, structured status, responsible party, visibility, and position columns. Items and their service links cascade with their instance.
- `activity_events`: triggers abort UPDATE and DELETE, event types are upper-case constants, indexed by workspace, client, and subject.
- Domain timestamps are ISO-8601 text with millisecond precision, defaulted by the database. Ids are text, defaulted by the database when absent.
- No table stores a third-party platform password. Better Auth's `account.password` column exists for its credential provider only and stays unused with magic-link login.

### Coexistence with the inherited Leadsthatbloom schema

Both schemas live in the same D1 database per environment and never share a table.

- The inherited schema keeps its bootstrap: `schema.sql` then `scripts/migrate.mjs` over `migrations/` with the `_migrations` ledger (`db:schema:*`, `db:migrate:*`). Nothing there changed.
- The domain schema uses wrangler's native migrations over `drizzle/` with the `d1_migrations` ledger (`db:domain:migrate:*`). `wrangler.jsonc` now points `migrations_dir` at `drizzle` for all three environments, which only affects these wrangler commands.
- The one name collision is `clients`. The inherited prospecting app still reads and writes its own `clients` table from four routes, so the BloomOps client table is created as `bloomops_clients` and exported from the schema as `clients`. Application code only ever sees the export. When the inherited prospecting tables are dropped in a later phase, one Drizzle migration renames `bloomops_clients` to `clients`. No inherited SQL or behaviour was touched.
- Order does not matter. Applying domain migrations to the inherited dev database worked (37 inherited tables plus 22 plus the ledger), and applying `schema.sql` on top of a domain-first database also worked. The two ledgers never see each other's files.
- `GET /api/infra` now also reports `domain: { migrations, ok }` from the `d1_migrations` ledger and the presence of the anchor tables, and the staging verifier checks it.

### Local verification (2026-09-05)

| Check | Result |
|---|---|
| Schema module loads, `drizzle-kit generate` | 22 tables, 27 unique indexes, 17 indexes, 53 foreign-key clauses, 20 CHECK constraints. Re-running generate reports no changes |
| Fresh local D1 from zero, `db:domain:migrate:local` | 2 migrations applied, 22 tables, ledger 2. Second run: "No migrations to apply" |
| Existing dev D1 with the inherited schema | domain migrations applied cleanly on top, 60 tables in total, triggers present |
| Reverse order | `schema.sql` applied after the domain schema without conflict |
| `tests/bloomops-schema.test.mjs` | 19 invariant tests against a real SQLite built from the committed migrations |
| `npm ci` | ok |
| `npm test` | 2633 pass, 0 fail (2613 before A2, 20 new) |
| `npm run build`, `npm run cf:build` | exit 0 |
| Local Worker smoke (`verify-staging.mjs` against `wrangler dev`) | 15 of 15, including "BloomOps domain schema present" |
| Pages anchors | all eight unchanged, nothing under `components/` changed |

### Staging verification (2026-09-05)

The Deploy staging workflow runs `db:domain:migrate:staging` after the inherited migrations and before the deploy, and the live verifier requires `/api/infra` to report the domain schema. Two runs on branch `claude/bloomops-a2-database-foundation` did the work:

| Run | Commit | What happened |
|---|---|---|
| 33968508433 | `bf9bcdb` | Identity `hello@bloomwired.io`, account `Bloomwired`. Provisioning confirmed the committed staging D1 id `4bb0c8e9-a08f-43d7-9ad7-68b28c371d23` and bucket `bloomops-files-staging`. Inherited bootstrap: 28 schema statements, all 60 legacy migrations already applied. Domain migrations at 13:19:11Z: "About to apply 2 migration(s)", `0000_bloomops_release_a_foundation.sql` executed 67 commands, `0001_immutability_triggers.sql` executed 4 commands, both recorded in `d1_migrations`. Deployed version `fd0f1f3d-50be-49bf-82a1-0a0bfe9a9b7b`. The live verifier then failed only its new "BloomOps domain schema present" check because `/api/infra` was still answered by the previous Worker version two seconds after the last secret upload |
| 33968734285 | `ea075bc` | Same steps. Domain migrations: "No migrations to apply", so the second apply is a no-op on staging as it is locally. Deployed version `5ee00b71-0536-46ea-b6f8-233e5b9a44a0` at 13:24:26Z. Verifier 13:24:30Z to 13:24:34Z, 16 of 16 passed, including `build ea075bc is being served` and `BloomOps domain schema present ({"migrations":2,"ok":true})` |

The fix in `ea075bc` stamps the commit into the build (`WORKERS_CI_COMMIT_SHA`) and makes the verifier wait until `/api/version` reports that commit before it inspects bindings, so a verify run can no longer land on the previous version.

The staging database now holds the 35 inherited tables plus the 22 domain tables and both immutability triggers. No production database exists, and no Leadsthatbloom database was named or touched: every wrangler call in both runs carried `--env staging` and resolved to `bloomops-staging`.

### Zero-to-current remote verification (2026-09-05)

`docs/phases/A2.md` requires a fresh staging or remote database to migrate from zero. The staging runs above cannot show that, because `bloomops-staging` already carried the inherited schema and its full migration ledger when the domain migrations arrived. Commit `ee96d17` added `.github/scripts/verify-zero-remote.mjs` and the workflow `.github/workflows/verify-zero-remote.yml`, which create a disposable remote D1 database, migrate it from empty through the repository's own three paths, migrate it again, verify, and delete it. GitHub Actions run 33987071853 (job 101362522182, 19:26:03Z to 19:30:44Z) did this once:

| Item | Result |
|---|---|
| Disposable database | `bloomops-a2-zero-verify`, id `3426af49-50cb-4204-ac12-8da621e9db70`, created 19:26:10Z in region ENAM. The account inventory was read first: seven databases, none by that name, so it was newly created. Its id matched neither the committed staging id nor the production placeholder |
| Target isolation | every migration command ran with `--config` pointing at a wrangler config written to the runner's temp directory whose only D1 binding was that id. `wrangler.jsonc` was not edited and no staging or production id was repointed. The script routes every wrangler call through one guard that refuses any database command without that config and any account command naming anything but the disposable database (plus a read-only `d1 info` on `bloomops-staging`) |
| Began empty | `sqlite_master` held one Cloudflare-internal object, table `_cf_KV`, and no user objects |
| Inherited base schema | `schema.sql` executed as one remote batch with no failed statement |
| Inherited migration ledger | `scripts/migrate.mjs --remote --config`: 44 migrations executed, 16 recorded as already present because `schema.sql` already satisfied their postconditions, 0 previously applied, all 60 files accounted for. Afterwards `_migrations` held exactly the 60 file names |
| Drizzle migrations | `wrangler d1 migrations apply DB --config … --remote`: `0000_bloomops_release_a_foundation.sql` executed 67 commands, `0001_immutability_triggers.sql` executed 4 commands, both ✅. `d1_migrations` then held exactly those two names in committed order and `migrations list` reported nothing pending |
| Tables | all 22 BloomOps A2 tables present. 58 tables in total: 34 inherited tables, `_migrations`, 22 domain tables, and `d1_migrations`. `d1 info` reports the same 58 for `bloomops-staging`, so the fresh database and the incrementally migrated staging database have the same table set |
| Triggers | `template_versions_immutable_update`, `activity_events_immutable_update`, `activity_events_immutable_delete` all present |
| Second run | `schema.sql` again with no failed statement, `migrate.mjs` reported 0 applied, 0 recorded, 60 already applied, `migrations apply` reported "No migrations to apply". A full `sqlite_master` snapshot plus both ledgers was identical before and after the second run |
| Deletion | `d1 info bloomops-a2-zero-verify` resolved to the id created in this run, then `wrangler d1 delete bloomops-a2-zero-verify --skip-confirmation` at 19:30:40Z. The inventory afterwards listed the same seven databases as before, by uuid, name, version, and creation time, and the disposable name and id were gone |
| Untouched | `bloomops-staging`: 58 tables before and after, same uuid and creation time. No production database exists. The Leadsthatbloom database on the account appeared in the inventory by name only and was identical before and after. The account identity was `hello@bloomwired.io` on account `Bloomwired` |

The same script runs locally against wrangler's local D1 with `node .github/scripts/verify-zero-remote.mjs --local`, where it skips the create, inventory, and delete steps and passed the same checks before the remote run. `scripts/migrate.mjs` gained `--config <file>` for this; a bare `--remote` is still refused, and `tests/migrate.test.mjs` covers the argument handling.

### Deferred to A3 and later

- installing Better Auth, its routes, sessions, magic links, Resend, and any login UX (A3)
- seeding the four departments, service types, or any workspace (A7 and later, or explicit setup)
- Pages metadata columns (workspace, client, visibility) on the inherited `pages` table
- renaming `bloomops_clients` to `clients` after the inherited prospecting tables are dropped
- any use of `lib/bloomops/db.mjs` from routes

## Authentication and Membership (A3)

Better Auth owns identity (`user`), sessions (`session` plus a signed cookie), and the one-time magic-link token (`verification`). BloomOps owns everything about what a person may do: workspace membership, role, membership state, client scope, and capabilities, resolved from BloomOps tables on every protected request. A valid identity session never bypasses membership.

| Item | Value |
|---|---|
| `better-auth` | 1.7.2 (dependency). Latest release on npm as of 2026-09-05, published 2026-08-26, the same version A2 generated its tables from |
| Drizzle adapter | `@better-auth/drizzle-adapter` 1.7.2 (direct dependency; the current docs import it from this package, which `better-auth/adapters/drizzle` re-exports). `provider: 'sqlite'` over `drizzle-orm/d1` |
| Resend | REST API (`POST https://api.resend.com/emails`, bearer key, JSON body) through `lib/bloomops/mail.mjs`. The `resend` npm SDK (6.26.0 at the time) is not installed: the call is one `fetch`, and the SDK carries a React Email peer dependency the Worker has no use for |
| Auth routes | `app/api/auth/[...all]/route.js` hands GET and POST to `auth.handler`. Endpoints used: `POST /api/auth/sign-in/magic-link`, `GET /api/auth/magic-link/verify`, `GET /api/auth/get-session`, `POST /api/auth/sign-out` |
| BloomOps routes | `GET /api/bloomops/me`, `GET|POST /api/bloomops/invitations`, `POST /api/bloomops/invitations/:id/resend`, `POST /api/bloomops/invitations/:id/revoke`, `POST /api/bloomops/invitations/accept`, `GET /api/bloomops/members`, `PATCH /api/bloomops/members/:id`, public `GET /api/health` |
| Screens | `/sign-in` (form, check-your-email state, invalid or expired link state, no-workspace state), `/invite/<token>` (invalid, expired, withdrawn, already used, sign in to accept, wrong address, accept). `components/auth/AuthShell.jsx` frames them with the existing Bloom tokens. A5 owns the real design |
| Modules | `lib/bloomops/auth-config.mjs` (environment resolution), `auth.mjs` (Better Auth instance), `access.mjs` (per-request identity and membership), `membership.mjs`, `invitations.mjs`, `bootstrap.mjs`, `mail.mjs`, `activity.mjs` |

### Official documentation and API decisions

`better-auth.com` and `resend.com` are blocked by this environment's egress policy. The current documentation was read from the Better Auth repository's own docs source on GitHub (`docs/content/docs/...` on `main`: magic-link plugin, database concepts and hooks, Drizzle adapter, Next.js integration, options reference, session management, hooks) and cross-checked against the installed 1.7.2 package source, which is what actually runs. Resend's request and error shapes were read from the `resend-node` source and the Cloudflare Workers example on GitHub. Decisions taken on that basis:

- magic-link plugin: `expiresIn: 900`, `storeToken: 'hashed'`, sign-up left enabled so an invited person can create their identity on first click. Better Auth 1.7 consumes each token atomically on first verification (`allowedAttempts` is deprecated and ignored)
- restricting account creation: the documented `databaseHooks.user.create.before` hook throws an `APIError` unless a pending, unexpired invitation exists for the normalised address; the plugin turns that into an error redirect (`error=NOT_INVITED`) and no user or session is created. This is the supported mechanism; there is no second authentication system
- `hooks.before` on `/sign-in/magic-link` answers 503 for everyone when no mail transport is configured, before any address-dependent logic runs
- `baseURL` is always set explicitly (Better Auth's reference recommends against request inference); `trustedOrigins` is the app origin plus `BLOOMOPS_TRUSTED_ORIGINS`. Better Auth's `originCheck` limits `callbackURL`, `newUserCallbackURL`, and `errorCallbackURL` to those origins and to safe relative paths, and its CSRF check refuses a cross-site `Origin` on the sign-in request
- middleware follows the documented pattern of a cookie presence check only (`getSessionCookie` semantics, implemented locally against the fixed cookie names so the middleware imports nothing from Better Auth); every protected route and page performs the full check
- `emailAndPassword` stays disabled (its default), no social providers, no organization plugin. Telemetry is off explicitly

### A2 auth schema compared with the current Better Auth schema

`auth@1.7.2 generate` (the current CLI; `@better-auth/cli` 1.4.21 is the old package) was run against a Drizzle sqlite config with the magic-link plugin, and its output was compared field for field and index for index with the four A2 tables in `lib/bloomops/schema.mjs` and `drizzle/0000_bloomops_release_a_foundation.sql`. The magic-link plugin adds no tables.

| Table | Match | Difference |
|---|---|---|
| `user` | exact: `id`, `name`, `email` (unique `user_email_unique`), `email_verified`, `image`, `created_at`, `updated_at` | none |
| `session` | exact columns: `id`, `expires_at`, `token` (unique `session_token_unique`), `created_at`, `updated_at`, `ip_address`, `user_agent`, `user_id` (index `session_userId_idx`, cascade from `user`) | A2 gives `updated_at` a database default the CLI omits (a harmless superset; Better Auth always writes the column) |
| `account` | columns and `account_userId_idx` match | the CLI emits `issuer` as NOT NULL with a compound unique index `account_issuer_accountId_uidx (issuer, account_id)`; A2 has `issuer` nullable and no such index. A2 also gives `updated_at` a default the CLI omits |
| `verification` | exact: `id`, `identifier` (index `verification_identifier_idx`), `value`, `expires_at`, `created_at`, `updated_at` | none |

Migration `drizzle/0002_a3_auth_membership.sql` adds the compound unique index `account_issuer_accountId_uidx`, which is the smallest safe forward change: no `account` rows exist anywhere (magic-link sign-in creates users and sessions only, never accounts) and Better Auth 1.7 always supplies `issuer` when it does write one. Tightening `issuer` to NOT NULL would be a table rebuild in SQLite for a column no Release A code path writes, so it is deliberately left nullable and noted in the schema comment for the phase that first adds an OAuth or credential provider. The same migration adds `workspace_invitations.invitee_name` (nullable) and the partial unique index `workspace_invitations_pending_uq (workspace_id, email) WHERE status = 'pending'`, so one address can hold at most one usable invitation per workspace. Generated with `drizzle-kit generate --name a3_auth_membership`; a second `generate` reports no changes. Applied locally with `db:domain:migrate:local`; staging receives it from the deploy workflow.

### Magic links, sessions, origins

- a link is `https://<app origin>/api/auth/magic-link/verify?token=<32 characters from Better Auth's CSPRNG>&callbackURL=<path>`; it expires after 15 minutes, is consumed atomically on the first verification, and a second use redirects to `/sign-in?error=INVALID_TOKEN` without a session. Only the SHA-256 of the token is stored (`verification.identifier`); the raw token exists in the email alone, and nothing logs it (the tests capture the console to prove that)
- `BLOOMOPS_APP_URL` is the only origin links and redirects use in staging and production; it must be https, and a Host header never changes it. In development the request's own loopback origin (`localhost`, `127.0.0.1`, `[::1]`, any port) wins so `next dev` on :3000 and `npm run preview` on :8787 both work, and the loopback siblings are trusted for the Origin check because wrangler answers as `localhost` when a script typed `127.0.0.1`. A non-loopback host in development is ignored
- sessions live 30 days, extend once every 24 hours of use, and are read from the database on every request (no cookie cache), so sign-out and membership changes take effect immediately. Cookie `bloomops.session_token` (`__Secure-bloomops.session_token` on https), HttpOnly, SameSite=Lax, Path=/, signed with `BLOOMOPS_AUTH_SECRET` (32+ characters, required outside development; the development fallback value is refused if it ever reaches a deployed environment)
- Better Auth's built-in limiter (memory storage, 5 magic-link requests a minute per IP, active when `NODE_ENV` is production) is in force on the Worker; the local smoke runs into it when repeated within a minute, which is the expected behaviour

### Unknown addresses

`POST /api/auth/sign-in/magic-link` answers `{ "status": true }` for every well-formed address. The `sendMagicLink` callback delivers the email only when the address belongs to an existing `user` row or a pending, unexpired invitation; otherwise nothing is sent and the caller cannot tell. The token row Better Auth writes for an unknown address is never delivered and expires in 15 minutes. Even a delivered link creates no identity unless the invitation is still pending at click time (tested by revoking between delivery and click). The one residual difference is timing: a known address costs one Resend call. A mail failure for a known address is logged with transport, status, and error name only, and the response stays `{ "status": true }`.

### Membership enforcement

`lib/bloomops/access.mjs` is the one place a request becomes a person: `getAccess` reads the Better Auth session from the cookie, then resolves the earliest ACTIVE membership in an ACTIVE workspace for that user. `requireAccess` answers 401 without a session, 403 with a session but no active membership, 403 for a state-changing request whose `Origin` is not a trusted origin, and 403 for `manageMembers` unless the membership is an active Owner or Admin. `requireIdentity` (identity only) exists for exactly one route, invitation acceptance. The inherited `lib/workspace.mjs#getWorkspace`, which all 161 inherited data routes call, now returns the BloomOps workspace slug and a two-value role derived from the membership role (Owner and Admin are `admin`), or null, so the prospecting routes are scoped by membership without being edited. `app/page.jsx` performs the same check before rendering the inherited app. Suspending or removing a membership takes effect on the person's next request while their identity session remains valid; the tests and the Worker smoke both show `get-session` still answering while `/api/bloomops/me`, `/api/pages`, and `/` refuse. The last active Owner cannot be suspended or removed, and nobody can change their own membership.

### First workspace bootstrap

`scripts/bootstrap-workspace.mjs` builds a plan of eight literal SQL statements, each guarded by `NOT EXISTS`, and runs it with `wrangler d1 execute DB --file` (`--local`, or `--remote` with a required `--env`), then reports what the workspace holds with masked addresses. Inputs come from flags or `BLOOMOPS_BOOTSTRAP_WORKSPACE_NAME`, `BLOOMOPS_BOOTSTRAP_WORKSPACE_SLUG` (optional, derived), `BLOOMOPS_BOOTSTRAP_OWNER_EMAIL`, `BLOOMOPS_BOOTSTRAP_OWNER_NAME`, `BLOOMOPS_BOOTSTRAP_ADMIN_EMAIL`, `BLOOMOPS_BOOTSTRAP_ADMIN_NAME`. No address is in the source. Owner and Admin must differ. Rerunning creates nothing and rewrites nothing: an existing identity keeps its name, an existing membership keeps its role and status, and the report says when the database differs from the intent (exit 1) instead of correcting it. Bootstrapped identities start `email_verified = 0`; the first magic-link click proves the mailbox and Better Auth flips it. The staging workflow runs the same script on every deploy from repository secrets; without both addresses it skips with a warning, so nobody can sign in until they are supplied.

### Invitations

`lib/bloomops/invitations.mjs` implements Pending → Accepted | Expired | Revoked over the A2 table: 256-bit base64url token from the CSPRNG, SHA-256 hash stored, seven-day expiry, normalised address, role, optional client (required for the Client role, refused for the others, and the composite foreign key refuses a client from another workspace), optional invitee name, inviter membership. Creating an invitation for an address that already has a pending one rotates that row's token and expiry (the old link stops resolving) instead of adding a second; the partial unique index enforces it at the database as well. Resend rotates a pending invitation or replaces an expired one with a fresh row; revoked and accepted ones are left alone. Acceptance requires a signed-in identity whose normalised address equals the invitation's, creates the membership as `active` with the invited role (or reactivates a removed or suspended row, never a duplicate; the unique `(workspace_id, user_id)` index backs that), stamps `accepted_membership_id`, and is idempotent for the same person retrying. A wrong address, an expired, revoked, or already accepted invitation, and an invitation from another workspace are refused. Every transition writes an `activity_events` row (`INVITATION_SENT`, `INVITATION_RESENT`, `INVITATION_REVOKED`, `INVITATION_EXPIRED`, `INVITATION_ACCEPTED`, `MEMBERSHIP_CREATED` or `MEMBERSHIP_ACTIVATED`, plus `MEMBERSHIP_SUSPENDED`, `MEMBERSHIP_REINSTATED`, `MEMBERSHIP_REMOVED` for state changes), carrying the client id where the invitation had one. Client authorization rules themselves are A4.

### Mail

`lib/bloomops/mail.mjs` exposes `createMailer(env).send({ to, subject, text, html })` with three transports: `resend` (the REST call; key only in the Authorization header; errors carry status and Resend's error name, never the body or key), `r2-dev` (development only, refused elsewhere; writes the message as JSON into the local R2 simulation under `dev-mail/<sha256(recipient)>.json` so a local smoke can read a link back with `wrangler r2 object get --local`), and `none`. Templates (`magicLinkEmail`, `invitationEmail`) are short, plain, escape names, and name no other member. Configuration: `BLOOMOPS_RESEND_API_KEY` (secret), `BLOOMOPS_MAIL_FROM` (defaults to `BloomOps <onboarding@resend.dev>`, Resend's test sender, which delivers only to the Resend account's own address until a sending domain is verified there), `BLOOMOPS_MAIL_TRANSPORT` (optional; `resend` when a key exists). For staging, the safe path is a Resend key for a verified sending domain, or the onboarding sender while the only recipients are the account owner's address and Resend's test addresses (`delivered@resend.dev`, `bounced@resend.dev`).

### Old access-code login removed

Deleted: `lib/session.mjs`, `app/api/auth/route.js`, `app/gate/`, `docs/ACCESS-CODES.md`, `tests/session.test.mjs`. Rewritten: `middleware.js`, `lib/workspace.mjs`, `app/page.jsx`, the sign-out button in `components/GlassRail.jsx` (now `POST /api/auth/sign-out` then `/sign-in`), `app/api/credits/route.js` (known workspaces come from the `workspaces` table instead of the access-code map), `.dev.vars.example`, the staging workflow and verifier. `LTB_ACCESS_CODES` is read nowhere. `LTB_SESSION_SECRET` no longer signs or verifies anything; the inherited prospecting code still derives the Gmail token encryption key from it (`lib/secret-box.mjs`, `app/api/gmail/*`), which is not authentication and leaves with that code. `POST /api/auth` with a code answers 401 from Better Auth (unknown endpoint), and an `ltb_session` cookie opens nothing. `tests/bloomops-middleware.test.mjs` pins all of this and scans `app/`, `lib/`, `components/`, `.github/`, and `scripts/` for the old symbols.

### Local verification (2026-09-05)

| Check | Result |
|---|---|
| `npm ci` | ok from the regenerated lockfile. `npm install` needed `--force` once because Better Auth's optional SvelteKit peer chain wants a newer esbuild than OpenNext pins; npm installs none of those optional peers, and a clean `npm ci` reproduces the tree without flags |
| `npm test` | 2680 tests, 2680 pass, 0 fail (2634 before A3; 6 inherited access-code tests removed, 52 A3 tests added across `bloomops-auth`, `bloomops-invitations`, `bloomops-membership`, `bloomops-mail`, `bloomops-middleware`; `bloomops-schema` and the Pages and editor tests unchanged and green) |
| `npm run build` | exit 0, all new routes listed as dynamic |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 | `db:domain:migrate:local` applied 0000, 0001, 0002; bootstrap CLI run twice: 1 workspace, 2 users, 2 memberships, 3 activity events both times |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 (front door, `/gate` and `POST /api/auth` gone, inherited cookie worthless, health and schema, identical responses for two unknown addresses, malformed link refused, foreign callback origin refused, anonymous BloomOps routes refused) |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 40 of 40 through the real bundle on workerd with the r2-dev mailbox: bootstrap, unknown address, Owner link request, delivery, click, single use, `/api/bloomops/me`, home page, inherited `/api/pages` scoped to the slug, `/sign-in` redirecting a member home, invitation created and delivered without the token, invitee identity created on click, no access before acceptance, wrong-person acceptance refused, acceptance, idempotent retry, Team Member cannot manage, suspend (identity session survives, every protected surface refuses), self-suspension refused, cross-site origin refused, remove, old login gone, sign-out |

The A3 tests run Better Auth's real request handler and the drizzle D1 driver over a real SQLite (`tests/_bloomops-db.mjs` wears D1's interface, including `raw()` and `batch()`), built from the committed migrations, so the code path is the one Cloudflare runs. Two defects found and fixed during the Worker smoke, neither reachable from unit tests: the Origin check refused `127.0.0.1` while wrangler answered as `localhost` (now the loopback siblings are trusted in development only), and on the server-component path Next reports `x-forwarded-proto: https` for a loopback host, which selected the `__Secure-` cookie name (now a loopback host is always plain http for the purpose of picking the development origin).

### Staging verification (A3)

The deploy workflow (`.github/workflows/deploy-staging.yml`) now sets `BLOOMOPS_AUTH_SECRET`, `BLOOMOPS_RESEND_API_KEY`, and optionally `BLOOMOPS_MAIL_FROM` on `bloomops-staging` from `STAGING_BLOOMOPS_AUTH_SECRET`, `STAGING_BLOOMOPS_RESEND_API_KEY`, `STAGING_BLOOMOPS_MAIL_FROM`; runs the bootstrap from `STAGING_BLOOMOPS_WORKSPACE_NAME` (default "BloomOps Staging"), `STAGING_BLOOMOPS_OWNER_EMAIL`, `STAGING_BLOOMOPS_OWNER_NAME`, `STAGING_BLOOMOPS_ADMIN_EMAIL`, `STAGING_BLOOMOPS_ADMIN_NAME`; and no longer reads `STAGING_LTB_ACCESS_CODES` or `STAGING_LTB_SESSION_SECRET` (delete them from the repository). `BLOOMOPS_APP_URL` for staging is committed in `wrangler.jsonc`. The verifier fails the run when authentication is not configured and warns when mail is not. It cannot sign in: no endpoint exposes tokens, so the one manual acceptance step is a real click on a magic link from a real mailbox.

First run on this branch, GitHub Actions run 33991041976 (commit `438b062`, 20:45:22Z to 20:47:45Z): identity `hello@bloomwired.io`, staging D1 and R2 confirmed, inherited schema and migrations applied, domain migrations step succeeded (`0002_a3_auth_membership.sql` applied to `bloomops-staging`), Worker version `c63e1d10-17f6-4ee2-816c-ac0f25d9f329` deployed with bindings `DB` (bloomops-staging), `FILES` (bloomops-files-staging), `ASSETS`, `BLOOMOPS_ENV` staging, `BLOOMOPS_APP_URL`. The secrets step found no `STAGING_BLOOMOPS_AUTH_SECRET` (error logged) and no Resend key (warning); the bootstrap step found no addresses and skipped. The verifier confirmed build `438b062` was being served, anonymous `/api/infra` 401, and `/` redirecting to `/sign-in`, then failed because `/sign-in` answered 500: without an auth secret the Worker could not build its Better Auth instance and the server component surfaced that as an error. That was fail-closed but unreadable, so the next commit makes an unconfigured deployment render a "Sign-in is not set up" state on the signed-out pages, answer 503 on routes, and report `auth.configured: false` on the health probe; the verifier accepts that page state and fails on its explicit configuration check instead, naming the missing secret. The run also warned that `BLOOMOPS_MAIL_TRANSPORT` existed only at the top level of `wrangler.jsonc`; staging and production now name `resend` explicitly, and a named Resend transport without a key is treated as "not ready" rather than a configuration crash.

Second run, GitHub Actions run 33991512885 (commit `8bbc227`, 20:55:13Z to 20:57:19Z): same provisioning, schema, and migration steps, Worker version `5d4b23ca-7d53-4322-989f-ac7ca1b08c73` deployed with `BLOOMOPS_MAIL_TRANSPORT` now bound for staging and no wrangler vars warning. The verifier passed 11 live checks against the deployed Worker: build `8bbc227` served, anonymous `/api/infra` 401, `/` redirecting to `/sign-in`, `/sign-in` rendering the not-configured state with status 200, an inherited `ltb_session` cookie refused, `/gate` no longer a login page, `POST /api/auth` with a code refused without a cookie, `GET /api/auth` not the old session endpoint, `/api/health` answering `environment: staging` and `schema: { migrations: 3, ok: true }`; it then failed, as designed, at "authentication is configured" with `{ configured: false, mail: "none" }` and the instruction to set `STAGING_BLOOMOPS_AUTH_SECRET`. The old access-code flow is therefore proven gone on staging, the A3 migration is proven applied there, and the remaining checks (identical responses for unknown addresses, refused bad links and foreign callback origins, refused anonymous membership routes) run once the secret exists.

Third run, the same run 33991512885 re-run as attempt 2 by the repository owner after the secrets were added (commit `8bbc227`, 2026-09-06 00:05:16Z to 00:07:24Z): same provisioning, schema, and migration steps (all no-ops against the ledger), Worker version `68cc78e9-0aae-47a5-bfae-a3c8217c304e` deployed with the same bindings and `BLOOMOPS_MAIL_TRANSPORT` resend. The secrets step uploaded `BLOOMOPS_AUTH_SECRET` and `BLOOMOPS_RESEND_API_KEY` to the Worker (`STAGING_BLOOMOPS_MAIL_FROM` is unset, so the sender stays the default `onboarding@resend.dev`). The bootstrap step applied its 8 idempotent statements to the remote staging D1 and reported Owner `a***@bloomwired.io` (owner, active), Admin `h***@bloomwired.io` (admin, active), workspace slug `bloomops-staging` from the default name "BloomOps Staging". The verifier then passed all 22 checks: build `8bbc227` served, anonymous `/api/infra` 401, `/` 307 to `/sign-in`, `/sign-in` rendering the form with 200, the inherited `ltb_session` cookie refused, `/gate` no longer a login page, `POST /api/auth` with a code refused, `GET /api/auth` not the old session endpoint, `/api/health` 200 with `environment: staging`, `schema: { migrations: 3, ok: true }`, `auth: { configured: true, mail: "resend" }`, mail transport Resend, anonymous get-session null, a magic-link request for a random unknown address accepted with 200, two random unknown addresses answered identically (200/200), no session cookie issued by that request, a malformed magic link answered 302 to `/sign-in?error=INVALID_TOKEN`, a magic link with a foreign callback origin refused with 403, anonymous `/api/bloomops/me` 401, anonymous invitation acceptance 401, and an unknown invitation link rendering the not-found state with 200. The unknown-address requests send no mail by design (no identity, no pending invitation), so the verifier made no Resend call. GitHub reported the run and the PR head's check suite as successful.

Attempts 3 and 4 of the same run, 2026-09-06 00:32Z and 00:40Z. Between attempts 2 and 3 the owner and admin secrets were changed and `STAGING_BLOOMOPS_MAIL_FROM` was set. Attempt 3 deployed Worker version `77655ba4-0f9f-48e5-82b4-01525fd1a1f9` and uploaded all three secrets including `BLOOMOPS_MAIL_FROM`, then failed at the bootstrap step: the address now named as Admin already held the Owner membership it was given in attempt 2, the attempt 2 Admin membership remained as a third member, and the bootstrap reported `owner / active  (expected admin / active)` and `1 other membership(s)`, exited 1, and rewrote nothing. That is the intended behaviour: the bootstrap adds what is missing and never changes an existing membership. The verifier was skipped because of that exit. Attempt 4 ran with the Admin secret pointing back at the attempt 2 address: the bootstrap reported Owner `a***@bloomwired.io` owner/active, Admin `h***@bloomwired.io` admin/active, and `1 other membership(s)` (the extra membership created as Owner by attempt 3, still active), and the verifier passed all 22 checks again. Staging therefore holds three active memberships until the extra one is removed by hand or through the members API. The workflow never rewrote or removed a membership.

Fresh remote database: the "Verify zero-to-current migration" workflow ran on this branch (run 33991041981, commit `438b062`) because its workflow file changed, and succeeded: a disposable remote D1 went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the three Drizzle migrations including `0002_a3_auth_membership.sql`, took a second pass as a no-op, and was deleted with the account inventory unchanged.

The repository secrets now exist: the auth secret, the Resend key, and the owner and admin addresses for the bootstrap. None were guessed and none appear in source. The bootstrap addresses are masked in the workflow log. `STAGING_BLOOMOPS_MAIL_FROM` was set before attempt 3, so the Worker now carries `BLOOMOPS_MAIL_FROM` (its value is masked in the log). For the magic-link mail to arrive, that sender has to be on a domain verified in Resend, or, with the default `onboarding@resend.dev` sender, the recipient has to be the mailbox that owns the API key. The live Worker is not reachable from this build environment (egress policy), so run evidence comes from the workflow logs. Manual acceptance completed on 2026-09-06: a real magic-link email was delivered to a bootstrapped staging Owner mailbox through Resend using the configured verified sender, the link was opened, and the user successfully signed in to BloomOps staging. This closes A3's remaining manual acceptance step.

### Intentionally deferred to A4 and later

- the authorization engine (roles beyond Owner/Admin member management, client, service, and project assignment scope, record visibility, capabilities such as `finance.view`), and all client-facing authorization rules
- linking a Client-role membership to `client_contacts.user_id` on acceptance
- a workspace switcher for a person with several memberships (today the earliest active membership is the one; `resolveWorkspaceAccess` already takes a `workspaceId`)
- member and invitation management screens (the routes exist; A5 owns the shell), profile editing, session listing and revocation from the UI
- database-backed rate limiting for Better Auth (memory storage is per isolate), email change, and any second sign-in method
- `account.issuer NOT NULL`, with the first OAuth or credential provider

## Authorization (A4)

One engine, `lib/bloomops/authorization.mjs`, answers every "may this person do this to that?" for BloomOps. Route handlers and pages name an action and, for one record, hand over a resource descriptor; they never compare roles or capabilities themselves. Policy is three small tables in that file (`ROLE_CAPABILITIES`, `SCOPE_BY_ROLE`, `RESTRICTED_BY_ROLE`) plus the `ACTIONS` table, so a policy change is one line and one test row.

| Item | Value |
|---|---|
| Engine | `lib/bloomops/authorization.mjs`: `loadActor`, `evaluate`, `hasCapability`, `canAccessClient`, `canAccessService`, `inScope`, `canSeeVisibility`, `listCapabilities`, `grantCapability`, `revokeCapability`, `loadClientResource`, `loadServiceResource`, plus the vocabulary (`ROLES`, `INTERNAL_ROLES`, `CAPABILITIES`, `VISIBILITIES`, `ACTIONS`) |
| Request helpers | `lib/bloomops/access.mjs`: `requireAuthorized(req, { action, resource })` (identity, membership, origin, then the engine; answers 401/403/404 itself), `getActor(access)` (loads the actor once per request), `notFound()`. `requireAccess` (membership only) and `requireIdentity` (identity only, invitation acceptance) remain |
| Order of checks | identity, ACTIVE membership in an ACTIVE workspace, cross-site Origin on writes, then in `evaluate`: membership status, action known, resource in this workspace, resource within scope, visibility admits the actor, role may perform the action, capability held. Anything unknown or missing refuses |
| Routes moved | `GET /api/bloomops/members` and `PATCH /api/bloomops/members/:id` (`members.manage`); `GET|POST /api/bloomops/invitations`, `POST .../:id/resend`, `POST .../:id/revoke` (`invitations.manage`). `GET /api/bloomops/me` now lists the caller's capabilities and whether the inherited app is open to them |
| Removed | `canManageMembers` and the `manageMembers` option of `requireAccess` (the A3-only permission) |
| Schema | none. The A2 tables (`workspace_memberships`, `member_capabilities`, `client_assignments`, `service_assignments`, `client_contacts.user_id`, `bloomops_clients`, `service_engagements`) express every invariant A4 needs. `department_memberships` is read by nothing in the engine, on purpose |
| Activity | `CAPABILITY_GRANTED` and `CAPABILITY_REVOKED` join the event vocabulary |

### Roles and capabilities

Capabilities are the five dotted keys the domain model reserves: `members.manage`, `workspace.settings`, `templates.manage`, `finance.view`, `finance.edit`. A role carries some without a `member_capabilities` row; the rest are explicit grants on the membership.

| Role | By role | Grantable | Client/service scope | Restricted records | Inherited prospecting app |
|---|---|---|---|---|---|
| Owner | all five | yes | whole workspace | yes | yes |
| Admin | `members.manage`, `workspace.settings`, `templates.manage` | yes (Finance is an explicit grant) | whole workspace | yes | yes |
| Project Manager | none | yes | whole workspace | only when named on the record | no |
| Team Member | none | yes | assignments only | only when named on the record | no |
| Client | none | no (rows are ignored) | own client through `client_contacts.user_id` | never | no |

Decisions where the planning docs were silent, all in `authorization.mjs` and one line each to change:

- Owner holds every capability by role. The Owner is the workspace principal, cannot be locked out (A3's last-Owner rule), and can grant themself anything through `members.manage`, so withholding a capability from the role would be theatre. `docs/PRODUCT_SPEC.md` gives the Owner "full operational access"
- Admin is not Finance by role because the same document says the Admin's Finance access "is separately configurable"; `finance.view` and `finance.edit` are explicit grants
- Project Manager has workspace-wide client and service scope because `docs/PRODUCT_SPEC.md` gives the role "broad delivery visibility and coordination, but not security administration or Finance by default"; it therefore holds no capability by role and may not manage members, settings, or templates without a grant
- restricted visibility admits Owner and Admin, and anyone the record names in `restrictedToMembershipIds` (internal roles only, and still only inside their scope). It is deliberately not "all internal users", and a Client never sees a restricted record even when named
- a Client membership holds no capability whatever rows say, and `grantCapability` refuses to write one for a Client. Capabilities open internal areas, and a Client never enters those

### Actions

`ACTIONS` in `authorization.mjs`. Workspace-level: `members.manage`, `invitations.manage`, `capabilities.manage` (all need `members.manage`), `workspace.settings`, `templates.manage`, `finance.view`, `finance.edit` (each needs the capability of the same name). Record-level (refuse to run without a resource): `client.view` and `service.view` for every role that can reach the record, `client.manage` and `service.manage` for Owner, Admin, and Project Manager. Transitional: `legacy.prospecting` for Owner and Admin. Later phases add actions here as they add features; nothing else in the engine changes.

### Scope

- Owner, Admin, Project Manager: every client and every engagement in their workspace
- Team Member: a `client_assignments` row reaches that client and everything under it, including all of its engagements; a `service_assignments` row reaches that one engagement and the records under it, not the client record and not sibling engagements. A person on James' Social engagement cannot see James' GHL work. Department membership grants nothing
- Client: the clients whose `client_contacts.user_id` equals the caller's user id in this workspace, and every engagement of those clients. Nothing else links a Client to a client: not an address match, not an accepted invitation naming a client, not request input. A Client membership with no such row fails closed, which is where the unlinked A3 acceptance flow leaves a new Client until a later phase links the contact on acceptance
- a record naming a service is service-scoped; one naming only a client is client-scoped; one naming neither is workspace-level, reachable by internal roles and never by a Client
- assignments, capability rows, and contact links are read for the acting membership in the acting workspace only. The same person's Owner membership in Agency B gives them nothing in Agency A, and the reverse

### Visibility

Resource descriptors carry `visibility`: `internal`, `client`, or `restricted`. A missing value is `internal`, so a record that never declared itself client-visible is never shown to a Client. Scope is checked before visibility, so a client-visible record of another client is still out of reach. A Client sees only `client`; internal roles see `internal` and `client` within scope; `restricted` follows the table above. An unknown value refuses. The two loaders for today's tables mark a client record and an engagement `client`, since a client's own record and their own purchased services are by nature visible to them; what they see of either is a projection for the portal to decide.

### Leak safety over HTTP

`requireAuthorized` answers 401 with no identity, 403 with an identity but no active membership, 403 for a cross-site write, 403 when the actor can see the record (or there is no record) but may not act, and 404 `{ "error": "Not found." }` whenever admitting a record exists would say something: another workspace, out of scope, hidden by visibility, or simply absent. The tests compare the bodies and headers of the hidden and the absent case byte for byte. The engine's reasons (`foreign_workspace`, `scope`, `visibility`, `role`, `capability`, ...) exist for tests and logs and never reach a response.

### Legacy compatibility fence

`lib/workspace.mjs#getWorkspace`, which all inherited prospecting routes call, now returns null unless the engine allows `legacy.prospecting` for the membership (Owner and Admin), so a Project Manager, Team Member, or Client calling `/api/pages`, `/api/prospects`, `/api/settings`, or any of the other inherited routes is answered as an anonymous caller is (401). `app/page.jsx` applies the same decision: administrators get the inherited application, everyone else a plain "Nothing here yet" holding screen with sign-out, until A5 gives their role a home. Not rendering the app is not the boundary; the routes refuse on their own. No inherited route was edited. `legacyRole` still maps Owner and Admin to the inherited two-value `admin`.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2698 tests, 2698 pass, 0 fail (2681 before A4; 17 A4 tests added in `tests/bloomops-authorization.test.mjs`, 1 A3 test migrated from `canManageMembers` to the engine) |
| `npm run build` | exit 0 |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 | `db:schema:local`, `db:migrate:local`, `db:domain:migrate:local` from a fresh local simulation; a second `db:domain:migrate:local` reports nothing to apply |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 46 of 46 through the real bundle on workerd, the 40 A3 checks plus: the Owner holds every capability and the inherited app; a Team Member holds none, is refused member listing and invitation with the generic 403 and no reason, is refused `/api/pages`, `/api/prospects`, and `/api/settings` with 401, and sees the holding screen at `/` while the Owner still gets the inherited app and routes |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 (a first run seconds after the smoke hit Better Auth's per-minute magic-link limiter with 429, the documented A3 behaviour; the rerun passed) |

The A4 tests build two agencies with every role represented, real `client_assignments`, `service_assignments`, `department_memberships`, `client_contacts`, and `member_capabilities` rows, and sign people in through Better Auth's real handler where the HTTP answer is under test. They cover, with denied cases throughout: anonymous, no workspace, suspended and removed (session surviving); same-workspace versus foreign records; the full role-by-action matrix; capability baselines, explicit grants, revocation, a rogue row on a Client, an unknown key, and cross-workspace rows; Team Member client scope, service scope (not the sibling engagement, not the client record), and department membership; the linked, unlinked, and elsewhere-linked Client; all three visibilities against scope, including being named on a restricted record; member management for all five roles; identical answers for hidden and absent records; the Origin fence; the legacy fence for every role; and the same person in two workspaces.

### Intentionally deferred to A5 and later

- no route grants or revokes capabilities yet (`grantCapability` and `revokeCapability` exist in the library with their invariants tested; A5's Team screen or a later phase exposes them). Until then a grant on staging is a direct `member_capabilities` insert
- no route creates `client_assignments` or `service_assignments` (A7) or links `client_contacts.user_id` on Client invitation acceptance (A9/A10)
- no shell, navigation, or portal for the fenced roles; the holding screen is the whole experience of a Project Manager, Team Member, or Client until A5
- `/api/infra` (environment name and binding booleans, no data) still answers any active member; it reveals nothing about clients and is left for the phase that retires the inherited probes

## Shell (A5)

BloomOps has its own application shells now. An internal person (Owner, Admin, Project Manager, Team Member) signs in to a BloomOps internal application with the eleven-destination navigation from `docs/PRODUCT_SPEC.md`; a Client signs in to a separate client portal with no internal chrome at all. The inherited Leadsthatbloom application is no longer the root of anything: it lives at `/legacy`, off the navigation, for workspace administrators only, until later phases retire it. No migration was needed.

### Route architecture

| Route | File | Who | What |
|---|---|---|---|
| `/` | `app/(internal)/page.jsx` | internal roles | Home |
| `/clients`, `/onboarding`, `/work`, `/social`, `/ads`, `/systems`, `/pages`, `/team`, `/finance`, `/settings` | `app/(internal)/<area>/page.jsx` | internal roles | one page per destination, inside `app/(internal)/layout.jsx` |
| `/portal` | `app/portal/page.jsx` inside `app/portal/layout.jsx` | Client | Portal Home |
| `/legacy` | `app/legacy/page.jsx` | Owner, Admin (engine action `legacy.prospecting`) | the inherited prospecting application, unchanged |
| `/design` | `app/design/page.jsx` | internal roles, development only (or `BLOOMOPS_DESIGN_GALLERY=1`) | developer design gallery, `?section=<id>` isolates one section |
| `/sign-in`, `/invite/<token>` | unchanged routes, restyled | anyone | signed-out screens |
| any other address | `app/not-found.jsx` | anyone | not found |

The `(internal)` route group shares one layout that renders the internal shell; the portal is a separate tree with its own layout. Neither layout is the security boundary. `lib/bloomops/shell.mjs#resolveShellAccess` resolves a request through the A4 primitives (`getAccessOrProblem`, `getActor`, `evaluate`) and answers with a decision: redirect, not found, or render with the loaded actor. `lib/bloomops/shell-server.mjs#requireShell(area)` turns that into `redirect()` / `notFound()` for server components, memoised with React `cache()` so the layout and the page share one resolution per request. Every page and both layouts call it (`tests/bloomops-shell.test.mjs` checks that each file does), so a client-side navigation that skips the layout is checked by the page on its own, and a suspended or removed membership loses the shell on its very next request while its identity session survives.

### Root routing by role

| Actor | `/` and every internal address | `/portal` | `/legacy` |
|---|---|---|---|
| anonymous (no cookie) | middleware: `/sign-in?next=…` | `/sign-in` | `/sign-in` |
| identity, no active membership | `/sign-in` (which explains "No workspace access") | `/sign-in` | `/sign-in` |
| suspended or removed | `/sign-in` | `/sign-in` | `/sign-in` |
| Owner, Admin | renders the internal shell | redirect to `/` | renders the inherited app |
| Project Manager, Team Member | renders the internal shell | redirect to `/` | not found |
| Client | redirect to `/portal` | renders the portal shell | redirect to `/portal` |
| unconfigured deployment | `/sign-in` (which explains "Sign-in is not set up") | same | same |

A Client never renders the internal shell, with nothing hidden by CSS or conditionals: the redirect happens before any chrome exists. An internal person never becomes a portal user by opening `/portal`. Both are proven through real Better Auth sessions in `tests/bloomops-shell.test.mjs` and in the browser by `scripts/shell-review-local.mjs`.

### Internal shell

`components/bloomops/InternalShell.jsx`, rendered by `app/(internal)/layout.jsx`: a labelled sidebar (232px) from 1024px, a labelled rail (84px, icon over label) from 768px to 1023px, and on phones a top bar plus a bottom tab bar with four destinations (Home, Clients, Onboarding, Team) and More, which opens the other seven as a labelled sheet. Nothing is dropped at any width; the More sheet reuses the same list. The workspace name, the person, and their role appear once each (sidebar head and foot; top bar on phones). The account menu (`AccountMenu.jsx`) holds the identity, a Settings link, and Sign out; it closes on Escape and outside click and returns focus. Dialogs and toasts are shell infrastructure (`ShellHosts.jsx`, reading the inherited `lib/dialog.mjs` and `lib/toast.mjs` stores, so a page calls `confirmDialog(...)` or `toast(...)` and never mounts its own host). A skip link reaches `main`. Bloomlab's 104px rail was not copied: eleven labelled destinations in a stacked rail were cramped, so the desktop uses a compact sidebar and the rail is the tablet geometry.

### Navigation

One list, `lib/bloomops/navigation.mjs#INTERNAL_NAV`, feeds the sidebar, the rail, the tab bar, the More sheet, the active state (`activeKey(pathname)`: exact root, own path and everything under it), and the area map on Home. Order and labels are PRODUCT_SPEC's: Home, Clients, Onboarding, Work, Social, Ads, Systems, Pages, Team, Finance, Settings, in four groups (Home; Clients, Onboarding, Work; Social, Ads, Systems; Pages, Team, Finance, Settings) separated by hairlines. Every entry carries a one-sentence purpose and an `availability` of `now` (Home, Clients, Onboarding, Team, Settings) or `later`. The list is the same for every internal role; what a person may do inside an area is the engine's decision on the server. `PORTAL_NAV` is Home alone. No prospecting destination exists in either.

### Portal shell

`components/bloomops/PortalShell.jsx`, rendered by `app/portal/layout.jsx`: a top bar naming the agency's workspace ("Client portal" beneath it) and a compact account menu with Sign out, a narrow calm page, a one-line footer. No `nav` element, no internal path, no internal vocabulary; `tests/bloomops-shell.test.mjs` asserts all three on the rendered markup. Portal Home (`PortalHome.jsx`) reads only what A4 scope allows through `lib/bloomops/overview.mjs#portalClients` (the clients whose `client_contacts.user_id` is the caller): a linked Client sees their client's name and "Your portal is ready", with the plain statement that nothing is available to view yet and that requests, updates, or work shared through BloomOps will appear there (no claim about what the agency needs from them, since no requests, approvals, or deliverables exist yet to read); an unlinked Client (the A3 acceptance state, unchanged) sees "Your portal is not connected yet" with plain words and a suggestion to reply to whoever invited them. Nothing works around the missing link. Content, Projects, and Files join the portal only when those features exist.

### Pages in Release A

- **Home**: the workspace name, who you are signed in as and your role, then "Right now" (Clients, Onboarding, Services, and, only with `members.manage`, Team, each with a real count read through the actor's own scope by `lib/bloomops/overview.mjs#workspaceOverview`) and "Areas of BloomOps" (every destination, its purpose, and "Available now" or "Not available yet"). Zero reads as "None yet" or, for a Team Member, "None assigned to you yet". No metrics, charts, activity, or sample data
- **Clients**: the destination and its honest initial state. A read-only list of name and relationship status for the clients the actor may see (`visibleClients`, scoped like everything else), or "No clients yet" / "No clients are assigned to you". No creation, detail, editing, or links into detail; A6 owns those
- **Onboarding**: the destination, its purpose, and either "Nothing is being onboarded" or the count of clients with open onboarding, again scoped. The engine and checklist are A8 and A10
- **Team**: `teamViewFor(actor)` picks one of two screens. With `members.manage`, `TeamManager.jsx` shows the directory (name, email, role, status with label and glyph, joined date, "(you)" on yourself, removed members folded away), open invitations (name, address, role, expiry), and drives the real A3 routes: invite (email, optional name, role among the four internal roles; Client invitations need a client record and are not offered yet), resend, withdraw, suspend, reinstate, remove. Remove and withdraw confirm first. Every backend answer is shown as written (the last-Owner, self, removed, already-member, and expired rules live on the server and are not duplicated); after a change the server re-renders the screen (`router.refresh()`). The token never reaches the browser. Without `members.manage`, the page shows the person's own place (name, email, role, what the role means) and says the directory is managed by the Owner and Admins; the directory is never loaded
- **Settings**: account (name, email, sign out), workspace (name, your role, what it means), and "Your access" (the capabilities the engine lists for you, by label). Nothing is editable. No inherited Leadsthatbloom settings appear
- **Work, Social, Ads, Systems, Pages**: deliberate placeholders through one `AreaPreview` composition: the title, the purpose, what will live there, and "This area is part of a later BloomOps release. Nothing here is live yet." No records, counts, or controls. Pages says the editor is ready and connecting it to the workspace with client-safe visibility is a later step
- **Finance**: `financeViewFor(actor)`. With `finance.view` (the Owner by role; anyone else by explicit grant), the same placeholder treatment. Without it, "Finance is open to the workspace Owner and to people who have been given finance access. It is not open to you." and nothing else

### Legacy transition

`app/page.jsx` is gone; `ProspectsApp.jsx` renders only from `app/legacy/page.jsx`, which calls `requireShell('legacy')`: a Client is sent to the portal, an internal role the engine does not admit to `legacy.prospecting` gets not found, Owner and Admin get the inherited application exactly as A4 left it. It is not in the navigation, not linked from any BloomOps screen, and its data routes keep the A4 fence in `lib/workspace.mjs`. No inherited route, component, or stylesheet was edited; `app/globals.css` still serves the inherited app and the Pages editor, and `app/bloomops.css` sits beside it under its own `--bo-*` / `.bo-*` namespace, so a BloomOps surface looks the same whatever `html[data-theme]` the inherited theme boot script set.

### Design system implementation

- **Tokens** (`app/bloomops.css`): the Bloomlab palette (Cloud, Snow, Mist, Soft Lilac, Ink, Deep Ink, Ink Soft, Ink Faint, the seven accents, Success, Warning, Error, Info, Link/focus), darker semantic text values that clear AA on Cloud, the 4px spacing scale, radius 6/10/16/24/full, three restrained shadows, the 120/200/300/420ms motion family with reduced-motion zeroing
- **Fonts**: Bricolage Grotesque (display, variable weight 200–800) and Inter (interface, variable 100–900), self-hosted under `public/fonts/` as latin and latin-ext woff2 from the fontsource packages, with their OFL licences beside them. Declared in `app/bloomops.css`, served through the existing `/fonts/*` immutable cache rule; no remote font dependency and nothing fetched at build time
- **Primitives** (`components/bloomops/`): `Button` (primary, secondary, ghost, danger; 44px; 1px press; spinner with `aria-busy`), `Field` with `fieldAria` (real label, hint, sentence-and-glyph error, 16px controls, custom select chevron), `Status` (label plus glyph, five tones), `PageHeader`, `Section`, `Surface` (snow, mist, tint), `Facts`, `EmptyState`, `Notice`, `AreaPreview`, `Dialog` (focus trap, Escape, outside click, scroll lock, focus return; a bottom sheet on phones), `Icons` (eleven navigation glyphs and a dozen controls, one stroke weight), `InternalNav`/`NavList`, `MobileNav`/`TabBar`/`MoreSheet`, `AccountMenu`, `ShellHosts`, `InternalShell`, `PortalShell`, `HomeOverview`, `PortalHome`, `TeamManager`. No universal Card; operational lists are hairline rows (`.bo-rows`), and surfaces are used only where a group of facts needs an edge
- **Typography**: display at 32px (27px on phones) and 40px for the portal title, tracking −0.02em; section headings 20px; body 15px Inter; small 13.5px; tabular numerals on counts; no monospace, no eyebrow labels, no gradient text
- **Gallery**: `/design`, developer-only, showing palette, typography, surfaces, buttons, forms, status, navigation, and states for the primitives above, with `?section=<id>` isolation
- **Visual reference**: the live Bloomlab gallery at `bloomlab-preview.cool-sunset-2169.workers.dev/design` could not be opened from this session (the sandbox's egress proxy refused the connection), so the design was built from `docs/DESIGN_SYSTEM.md` and the local reference snapshots under `docs/reference-code/bloomlab/` (tokens, Button, Field, Surface, StatusPill, gallery). No Bloomlab runtime code was imported

### Accessibility

Landmarks (`aside` workspace, `nav` Main, `main`, `header`, `footer`), a skip link, `aria-current="page"` on the active destination, `aria-expanded`/`aria-haspopup` on More and the account button, `role="menu"` with `menuitem`s, dialogs with `aria-modal`, `aria-labelledby`, a focus trap, Escape, and focus return, labels programmatically tied to every control with `aria-describedby` for hints and errors and `aria-invalid` on failure, status never colour alone, 44px targets for navigation, buttons, menu items, dialog controls, and the toast dismiss on phones and coarse pointers (36px small buttons on desktop pointers), 16px minimum control text, no hover-only information, reduced motion respected throughout. Keyboard order (skip link, then Home) and dialog focus behaviour are checked in the browser by `scripts/shell-review-local.mjs`.

### Responsive strategy

Widths: sidebar from 1024px; rail 768–1023px; top bar plus tab bar below 768px, with page padding reserved for the bar. Rows with actions (`.bo-row-wrap`) put their actions under the text on phones; rows with only a chevron or a pill never wrap. The page header stacks its action under the title on phones. Dialogs become bottom sheets under 480px with stacked full-width actions. The account menu opens upward from the sidebar foot and downward from the top bar. The portal is a narrow single column at every width.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2715 tests, 2715 pass, 0 fail (2698 before A5; 17 A5 tests in `tests/bloomops-shell.test.mjs`) |
| `npm run build` | exit 0, no warnings |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 | fresh simulation: `db:schema:local`, `db:migrate:local`, `db:domain:migrate:local` (3 applied); a second `db:domain:migrate:local` reports nothing to apply |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: all checks pass through the real bundle on workerd, the 46 A4 checks (updated where the home page changed) plus the A5 ones: the Owner's `/` is the internal shell with the full navigation and no prospecting markup, `/team` is the directory with the invite action, `/legacy` still opens for the Owner without BloomOps chrome, the Owner opening `/portal` is sent to `/`; the Team Member's `/` is the internal shell, `/team` is the limited view without the directory or other people's addresses, `/finance` says it is not open to them and describes nothing, `/legacy` is 404 |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 |
| Browser review | `node scripts/shell-review-local.mjs --url http://localhost:8787 --out …`: every review state at 1440, 1024, 768, 390, and 320 (sign-in; Home, Clients, Onboarding, Team, Settings, Work, Finance, and the gallery as Owner; Home, Team, Clients as Team Member; Finance as Project Manager; the portal as a linked and an unlinked Client; the account menu, invite dialog, invalid-invite state, remove confirmation, More sheet, and portal account menu open) in headless Chromium, checking no horizontal overflow, 16px controls and 44px targets on phones, the Client-to-portal and Owner-from-portal redirects and the Team Member's 404 at `/legacy` in the browser, keyboard order, and dialog focus behaviour: all structural checks pass. Screenshots were reviewed by eye against `docs/DESIGN_CHECKLIST.md` and the no-AI-slop list |

`tests/bloomops-shell.test.mjs` covers: the navigation list and its invariants (order, labels, one path each, no prospecting, four on the phone bar and seven behind More, active-key resolution); the pure shell decision (unknown area, unconfigured deployment, no session, no membership, unknown role, each role against each area); every role through real Better Auth sessions, with the refused decision carrying no access or actor; suspension and removal taking the shell away while the session survives; Team and Finance views by capability, including a Project Manager and an Admin gaining Finance by explicit grant only; Home, Clients, Onboarding, and portal reads scoped to the actor (workspace-wide, assigned-only, none, and never internal counts for a Client); the internal shell markup (navigation once per geometry, every destination reachable, no prospecting, skip link, landmarks, no emoji); one current destination and the More sheet's seven; the portal markup carrying no navigation, no internal path, and no internal vocabulary, and Portal Home's linked and unlinked states in plain words; Home's honest zero by scope and the area map's availability; Team rows offering only the actions the server would accept and never a token; the signed-out frame keeping the anchors the deploy verifier reads; the inherited application no longer being the root and every shell page re-checking on the server; and the middleware still bouncing anonymous callers from every new address.

### Intentionally deferred to A6 and later

- the Clients feature (list depth, create, detail, contacts, status and health editing, assignments, activity, archive): A6
- services and departments, assignments management: A7; the onboarding engine: A8; activation and client linkage on acceptance: A9 and A10
- Work, Social, Ads, Systems, Finance features, and Pages inside the BloomOps shell; the placeholders stand until each phase
- a capability grant/revoke screen (the library functions exist since A4; the Team screen does not expose them yet)
- an appearance preference: BloomOps is light by design (Bloomlab's Cloud ground; dark Ink surfaces are for focused execution contexts later), and the inherited dark/text-size toggles belong to the inherited palette, so Settings shows none
- portal destinations (Content, Projects, Files) until the features behind them exist
- Playwright as a dependency: `scripts/shell-review-local.mjs` runs on a locally installed `playwright-core` and Chromium and is a developer tool, not a test-suite step
- removal of the inherited prospecting code; it is unreachable from BloomOps navigation but still in source and still served at `/legacy` for administrators

## Clients (A6)

The first real BloomOps business domain. Clients stops being a destination with an honest empty state and becomes the thing the agency actually works in: a scoped list with lifecycle filters, a create flow, a detail screen with the five Release A tabs, multiple contacts with one primary, an internal owner, manually managed health, and a real operational history. One migration, one new authorization action, one new resource descriptor.

| Item | Value |
|---|---|
| Domain | `lib/bloomops/clients.mjs` (vocabulary, validation, slug, reads, create, update, owner candidates), `lib/bloomops/client-contacts.mjs` (contacts and the primary marker), `lib/bloomops/client-activity.mjs` (reading history and saying it in words) |
| Routes | `POST /api/bloomops/clients`, `PATCH /api/bloomops/clients/:id`, `POST /api/bloomops/clients/:id/contacts`, `PATCH|DELETE /api/bloomops/clients/:id/contacts/:contactId`, plus `app/api/bloomops/clients/_shared.mjs` |
| Screens | `app/(internal)/clients/page.jsx` (list and filters), `app/(internal)/clients/new/page.jsx` (create), `app/(internal)/clients/[id]/page.jsx` (detail and its five tabs) |
| Components | `components/bloomops/Clients.jsx` (presentational: `ClientStatus`, `ClientHealth`, `ClientRow`, `ClientFilters`, `ClientDetailHeader`, `ClientTabs`, `ContactRow`, `ActivityRow`), `ClientForm.jsx`, `ClientOverview.jsx`, `ClientContacts.jsx` |
| Authorization | one new action, `client.create` (Owner, Admin, Project Manager; no resource), and one new descriptor, `loadInternalClientResource` |
| Migration | `drizzle/0003_a6_primary_contact.sql`: one partial unique index |
| Activity | eight `CLIENT_*` event types |

### Architecture

Reads go straight from a server component to the domain layer; mutations go over HTTP to a route that authorises, picks the keys it names, calls one domain function, and maps the result. No business rule is written twice, no route handler compares a role, and no React component reaches the database.

A route handler is four steps and nothing else:

1. `requireAuthorized` (identity, membership, origin, engine) — or `requireClient` in `_shared.mjs`, which does the same and loads the client as an internal record
2. `pick(body, [...])`, so only the keys the route names reach the domain
3. one domain call
4. `domainProblem(result)` or a success body

`_shared.mjs` also owns the leak-safe mapping. A domain `not_found` answers with exactly the engine's own 404 body (`{"error":"Not found."}`, no `reason`), because a contact id that belongs to another client and a client the caller may not see have to be one answer or the difference between them is the leak.

### Authorization

`client.create` is the one delivery action with no resource: the record it decides about does not exist yet, so it asks only whether this role may bring a client into the workspace. Owner, Admin, and Project Manager, matching `client.manage`. `ACTIONS` and the A4 role matrix in `tests/bloomops-authorization.test.mjs` were updated together; nothing in the engine changed.

`loadInternalClientResource` returns the same descriptor as `loadClientResource` with `visibility: 'internal'`. That single word is what keeps a Client membership out of the A6 surfaces. The generic descriptor is client-visible on purpose, because a portal contact may legitimately be shown a projection of their own client; the internal Clients area is health, the owner, the contact directory, operational history, and the controls over all of it. Every A6 page and route loads its client through the internal descriptor, so a Client calling an internal endpoint directly is refused by the engine on visibility and answered 404 — not by a UI that happens not to link there. There is no second authorization model.

### Role behaviour

| Role | List | Create | Detail | Edit, contacts, owner, health | Activity |
|---|---|---|---|---|---|
| Owner | workspace-wide | yes | yes | yes | yes |
| Admin | workspace-wide | yes | yes | yes | yes |
| Project Manager | workspace-wide | yes | yes | yes | yes |
| Team Member | only clients they hold a `client_assignments` row for | no | assigned only, read-only | no controls rendered, and the routes refuse | read-only within the detail |
| Client | never | never | never | never | never |

A Team Member assigned only to a *service* engagement reaches that engagement, not the client record, exactly as A4 says: their Clients list stays empty and the client's detail is a leak-safe not-found. An Admin gains no Finance and a Project Manager gains no member administration from anything here.

### The list and its filters

`listClients(db, actor, { filter })` builds the WHERE clause from the actor's scope first and adds the lifecycle filter to it, so a filter can only ever narrow. An unknown value falls back to All (`normalizeFilter`), including prototype names. Counts are per lifecycle and are the actor's own, so a Team Member's "All 1" is the truth for them.

The filters are links, not buttons: the list is server-rendered, so `?status=active` is part of the address, works without JavaScript, is keyboard and screen-reader ordinary, and can be bookmarked. Changing one cannot widen authorization because the server rebuilds the scope from the actor on every request.

A row shows the client's name, the primary contact, the internal owner, the start date, and the two state markers. Not every fact is a pill: status and health are compact `Status` markers with a label and a glyph, and the rest is one quiet line of context.

### Create

`/clients/new`, a route rather than a dialog: seven fields want an address a person can return to, a real back step, and room on a phone without a sheet fighting the keyboard. Required: client or company name, primary contact name, primary contact email. Optional: website, time zone, start date, internal owner.

The existing `clients.name` is the canonical display name. The nullable `company` column is not surfaced: nobody is made to type the same business name twice. It stays available to the domain layer (`updateClient` accepts it) for a later phase that has a reason for it.

A new client is always `draft` and always `on_track`, whatever the request says. Creating a client invites nobody: no invitation row, no membership, no email, no Better Auth user, and no `client_contacts.user_id`, even when the address already belongs to somebody who can sign in. That is asserted in the unit tests, in the Worker smoke, and by the fact that neither create path imports the mailer or the invitation module.

The client, its primary contact, and the `CLIENT_CREATED` event are one `db.batch`, so a failure leaves nothing behind — no client without its contact, no client without its history. Ids are generated in application code in the same shape the schema default produces (32 lower-case hex characters), because the contact row has to name the client before the batch runs.

### Slug

Generated server-side from the name and never asked for. `slugify` normalises, strips accents, and collapses to `a-z0-9-`; an empty result becomes `client`. `slugCandidates` reads what is already taken and offers the plain slug, then numbered ones, then random-suffixed ones; `createClient` tries them in order and retries on the unique-index refusal rather than assuming a candidate is still free. A duplicate name inside one workspace is creatable and gets `name-2`; the same name in another workspace keeps the plain slug. Slug is never a tenant boundary: the canonical route stays `/clients/:id` on the opaque id, and authorization never reads the slug.

### Lifecycle, and the A9 boundary

**A6 displays lifecycle and never writes it.** `updateClient` refuses `relationshipStatus` outright with `status_not_editable` rather than ignoring it, so a caller reaching for it learns why. There is no Activate control anywhere, and no A6 code path creates an onboarding instance, a service engagement, or an invitation.

The reasoning, recorded because the canonical documents are silent on manual transitions:

- Draft to Onboarding (or Active) is the A9 activation transaction: validate, generate onboarding, create the instance, move the client, prepare portal access, invite, record activity. A plain field edit that set `relationship_status` would bypass all of it, and would be the easy thing to leave behind.
- Paused, Completed, and Ended describe an engagement that A7 has not built, and no canonical document gives transition rules for them. Inventing a state machine without support is the larger mistake.
- Least privilege and least irreversible: a phase that shows a fact and refuses to write it is trivially extended; one that wrote it wrongly is not.

`CLIENT_STATUS_CHANGED` is deliberately not in the activity vocabulary. The phase that moves the lifecycle adds the event that records it. Status and health independence is proven at the domain and route layers instead: a health change leaves `relationship_status` untouched, in both directions, and every lifecycle value is refused through the API.

### Health

Manually managed in Release A, as `docs/phases/A6.md` allows. Three values with their canonical labels (On Track, Needs Attention, At Risk), a three-button group on the Overview tab, one `CLIENT_HEALTH_CHANGED` event carrying the old and new value, and no effect on lifecycle. Setting the health a client already has is a no-op and records nothing.

### Contacts and the primary invariant

The existing schema had no database guarantee that at most one contact per client is primary; the UI, a sequence of updates, and hope were all that stood behind it. Migration `0003_a6_primary_contact.sql` adds the smallest thing that fixes it:

```sql
CREATE UNIQUE INDEX `client_contacts_primary_uq` ON `client_contacts` (`client_id`) WHERE is_primary = 1;
```

One statement, additive, matching `lib/bloomops/schema.mjs`. It is partial, so a client with no primary is allowed and contacts that do not claim it are not counted. The application writes the switch as one `db.batch` that clears the old primary and sets the new one together, so the index never sees two and a failure leaves the client with the primary it started with. `tests/bloomops-clients.test.mjs` proves the database refuses two primaries with the domain layer bypassed entirely, through a raw `INSERT` and a raw `UPDATE`.

A client may have any number of contacts. Add, edit, remove, make primary, and clear primary are all supported. Removing or standing down the only primary leaves the client with none and promotes nobody: who speaks for a client is a decision, not a default. `client_contacts` keeps its existing unique `(client_id, email) WHERE email IS NOT NULL`, so one address per client is refused with a readable message and the same address on another client is fine.

### The portal identity link

`client_contacts.user_id` is the durable relationship between a contact and a person who can sign in to the portal, and A9/A10 own its whole lifecycle. A6 never writes it, never accepts it from a request at any spelling, and never infers it from a matching address, an existing identity, or invitation history. `pick()` in the routes names the four contact fields and `isPrimary`, and nothing else reaches the domain.

Where a contact is already linked, A6 chooses fail-safe:

- **removal is refused** (409 `linked`). Deleting the row would revoke a real person's access to their own portal from a screen about the agency's address book.
- **clearing their email address is refused**, for the same reason: it would leave somebody who can sign in with no way for the agency to reach them.
- **ordinary editing is allowed** — name, title, phone, a different address, and the primary marker. None of it touches the link, and the tests check the link survives.

The screen does not offer a Remove control on a linked contact rather than offering one that will fail, and says plainly that the contact can sign in to the client portal. The user id itself never leaves the server: `listContacts` projects it to a boolean `linked`.

### Owner

`owner_membership_id` is operational responsibility and nothing else. The A4 engine does not read it, so naming somebody the owner of a client grants them no access they did not already have, and setting an owner writes no `client_assignments` row. A7 owns assignment management. Both facts have tests.

Because ownership grants nothing, offering any membership as owner would make it easy to hand a client to somebody who then cannot open it. The A6 candidate policy is therefore:

- anyone whose role already reaches every client in the workspace: Owner, Admin, Project Manager
- plus, for one named client, a Team Member who already reaches that client through a real `client_assignments` row

A service-only assignment does not qualify, because under A4 it does not reach the client record. Client memberships are never candidates. A membership from another workspace is refused with the same message as a wrong id ("Choose an owner from the list.") and says nothing about the other workspace. A7 may widen this once a manager can grant the access in the same place they name the owner.

An owner may stop qualifying as a *new* owner after they were assigned: suspended, removed, or a Team Member whose client assignment went away. They keep their place on the record. Nothing silently reassigns the client, the detail reports them with `active: false`, the Team tab explains it, and the edit form keeps them in its list so that saving an unrelated field cannot drop them.

The server has to agree with that, and `updateClient` makes keeping the stored owner a different question from naming a new one. A supplied `ownerMembershipId` equal to the id already stored is a no-op: not checked against the candidate policy, not written, and not recorded. Any different value, the empty one that clears the owner included, goes through the candidate policy exactly as before, so a suspended, removed, Client-role, foreign-workspace, or unscoped Team Member membership is still refused as a *new* owner. `createClient` is unchanged and always strict, because a client being created has no stored owner to keep. Without that distinction the edit form's own preservation behaviour would defeat itself: the form sends every field on save, so an unrelated website or start-date edit on a client with an ineligible owner would fail with "Choose an owner from the list." Three tests in `tests/bloomops-clients.test.mjs` cover the suspended owner, the Team Member who lost their assignment (including that ownership gave none of their scope back), and every ineligible membership still being refused as an actual change.

### The detail and its tabs

Canonical route `/clients/:id`; the five Release A tabs are `?tab=`, so each section is an address that can be shared and returned to and the browser's own back step works. The page asks the engine twice: `client.view` on the internal record to decide whether the client exists for this person at all, and `client.manage` to decide whether any control renders.

- **Overview** — the real work. Status, health, website, time zone, start date (end date when set), internal owner, and the contacts. Managers get Edit details (a dialog), the three-way health control, and full contact management. A Team Member assigned to the client gets the same facts as a read-only projection with no controls, and a line saying who changes a client.
- **Services** — A7's. A deliberate, true state: what will live there and that nothing has been set up for this client. No catalogue, no package fields, no fabricated rows.
- **Onboarding** — A8's, A9's, and A10's. Says onboarding has not started for this client and that it is generated at activation. No progress, checklist, or percentage.
- **Team** — only what A6 owns: who is responsible for this client inside the agency, the explicit statement that the owner is responsibility and not access, and the note that assigning people to a client and its services is a later release. No `client_assignments` CRUD, no department or service assignment, no workload, and no weakening of `members.manage`: the owner picker is its own narrow projection (`ownerCandidates`), built only for actors who may manage the client, and never the Team administration directory.
- **Activity** — real history.

### Activity

Eight event types joined `ACTIVITY`: `CLIENT_CREATED`, `CLIENT_DETAILS_UPDATED`, `CLIENT_OWNER_CHANGED`, `CLIENT_HEALTH_CHANGED`, `CLIENT_CONTACT_ADDED`, `CLIENT_CONTACT_UPDATED`, `CLIENT_CONTACT_REMOVED`, `CLIENT_PRIMARY_CONTACT_CHANGED`.

Every event carries the workspace, the client id, the subject type and id, the acting membership and user, a timestamp, and small metadata: the fields that changed and their old and new values, a contact's name, an owner's name on both sides so the line still reads after somebody leaves. Never a request body, never a copy of every address a contact has held.

No event is written for a validation failure, an authorization failure, a refused origin, or a true no-op, and one request never records the same fact twice. One request can record two or three genuinely distinct facts — details, health, and owner are three different things — and each gets its own line.

`activity_events` remains append-only: the A2 triggers abort every UPDATE and DELETE, and the tests prove it still holds with A6 rows in the table. A6 created no `client_history`, `audit_log`, or `client_events_v2`; every event goes through `recordActivity`/`activityValues`, and `activityValues` exists so an event can be written inside the same batch as the change it describes.

`clientActivity` reads the table back and `describeEvent` turns a row into a sentence: "Client created", "Health changed / From On Track to Needs Attention.", "Primary contact changed / Sam is now the primary contact." Event codes, ids, and metadata JSON never reach the browser, an unknown event type still renders as words, and ordering falls back to insert order within one timestamp so two events from one batch read in the order they happened. Activity is internal; nothing exposes it to the portal.

### Validation

Server-side regardless of the browser, in the domain layer, per field:

- **name** — trimmed, non-empty, at most 120 characters (an over-long value is an error the person can fix, never a silent truncation)
- **website** — completed to `https://` when a scheme is missing, then parsed: http(s) only, a hostname with a dot, stored absolute and trailing-slash-free. `mailto:` and `javascript:` are refused, so nothing unparsed is rendered into an href
- **time zone** — null, or a real IANA zone with a region, checked against `Intl`. The picker offers `Intl.supportedValuesOf('timeZone')` where the runtime has it and a small useful list where it does not, and a typed value is validated either way
- **dates** — `YYYY-MM-DD` calendar dates that actually exist (2026-02-30 is refused), and an end date may not precede the start date
- **health** — one of the three values
- **owner** — a candidate under the policy above
- **contacts** — non-empty name, normalised lower-case email of valid shape, bounded phone and title, one address per client, and the contact must belong to the named client

Nothing is trusted from the browser: not the workspace id, not the actor, not a client id in a body when the route already names one, not a role, and not `user_id`.

### Leak safety

Four cases and one answer. Another workspace's client, a client a Team Member is not assigned to, a contact belonging to a different client, and an id that never existed all produce `404 {"error":"Not found."}`, byte for byte, on both the API and the page. A Client membership calling an internal client route is refused on visibility and gets the same 404, including for their own client. An owner membership id from another workspace is refused with the same words as a wrong id. The tests compare the bodies directly rather than the status alone.

### Design

Built inside the A5 shell with the A5 primitives; nothing about the shell changed. New semantic components sit above them, and the styling is one `bo-client-*` section in `app/bloomops.css`.

Clients are ordinary operational records, so there is no holographic treatment, no gradient, no hero, no card grid, and no fake analytics. The list is hairline rows at medium-to-high density; the detail is semantic sections of label/value facts. Status and health are separate compact markers, each a label plus a glyph, never colour alone.

Two responsive decisions worth recording. Seven lifecycle filters do not fit as pills at 320px, so the filter strip scrolls inside itself with one clear selected state, keyboard-ordinary links, and 44px targets on coarse pointers; the page never scrolls sideways. Five tabs do not shrink into nine-point type, so the tab strip scrolls the same way with a visible focus ring and an obvious active tab. On a phone a client row puts its two state markers under the name and keeps the chevron pinned to the right edge rather than giving it a line of its own.

Two bugs the review found and A6 fixed:

- **date fields were 15px on phones.** The inherited `app/globals.css` carries `input[type="date"] { font: inherit }`, which is more specific than `.bo-control` and dragged the field to the body size. Below 16px a phone browser zooms the page on focus, which `docs/DESIGN_CHECKLIST.md` rules out. `app/bloomops.css` now takes the size back with `.bo-control[type='date']` (and `datetime-local`, `time`). The inherited stylesheet is untouched; a test asserts both halves so it cannot silently regress.
- **a row's title and meta line ran together.** `.bo-row-title` and `.bo-row-meta` are now block by default, which is what a title and the line under it always want; the two inline `display: block` styles A5 had added in `TeamManager.jsx` are gone as redundant.

### Design gallery

`/design` gained a small Clients section (developer-only, as before): both state markers in every value, the filter strip, three client rows, the tab strip, two contact rows, and an activity list. Its fixtures live in that file and nowhere else — no BloomOps screen ever renders a sample client, and staging was not seeded with any.

### Archive and restore

Not implemented in A6. The canonical client schema has no archive state, and A6 does not invent one: no `archived_at`, no `deleted_at`, no archive machinery. `Ended` is a lifecycle status, not an archive flag, and A6 does not write the lifecycle at all. `docs/phases/A6.md` lists archive/restore conditionally ("if implemented"), and nothing in the repository reveals an intended mechanism to implement.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2765 tests, 2765 pass, 0 fail (2715 before A6; 50 A6 tests in `tests/bloomops-clients.test.mjs`, including three for the owner-preservation correction below) |
| `npm run build` | exit 0, no warnings |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 from zero | `.wrangler/state` deleted, then `db:schema:local`, `db:migrate:local` (44 executed, 16 recorded as already present), `db:domain:migrate:local` (4 applied). Second pass: "No migrations to apply", inherited ledger unchanged, base schema re-applied with no failed statement. `client_contacts_primary_uq` present on the fresh database |
| Zero-to-current | `node .github/scripts/verify-zero-remote.mjs --local`: every check passed with the four domain migrations, including the identical-after-second-run comparison |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 89 of 89 through the real bundle on workerd |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 17 of 17 |
| Browser review | `node scripts/shell-review-local.mjs`: every A5 and A6 state at 1440, 1024, 768, 390, and 320 in headless Chromium |

The 47 A6 tests run the real route handlers over a real SQLite built from the committed migrations, with real Better Auth sessions, and render the real components. They cover: the `client.create` policy and the internal descriptor; creation by each role with the denied cases, the forced Draft and On Track, the primary contact, the absence of any invitation, membership, identity, email, or portal link, the `CLIENT_CREATED` event and its metadata, duplicate names and cross-workspace slugs, and field-by-field refusals that write nothing; every lifecycle filter, the scope of every role including the service-only Team Member, and that no filter widens anything; the four leak-safe not-found cases compared byte for byte; editing, its refusals, and the silent no-op; health through all three values in both directions with the lifecycle untouched; the lifecycle refused through the API for every value, including smuggled beside a legitimate field, with no onboarding, engagement, or invitation created; the owner set, changed, and cleared, granting no scope and writing no assignment, and preserved when its holder is suspended; contacts added, edited, removed, and switched, at most one primary with the database refusing two under a bypass, one address per client and the same address elsewhere, a foreign contact unreachable, `user_id` unwritable and uninferable, and a linked contact protected from removal and address clearing while ordinary edits pass through; activity in words with the right actor, workspace, and client, immutable, never duplicated, and never leaking across workspaces; the origin fence on all five state-changing calls; two workspaces with no authority bleed; and the rendered markup of every semantic component.

The Worker smoke adds, over HTTP through the real bundle: the Owner's Clients area and create form, a client created as Draft and On Track with its primary contact and no invitation, the list and a filter that hides it, the detail with its five tabs and no Activate control, a health change that leaves the lifecycle alone, the lifecycle refused, a second contact promoted to primary with exactly one primary in the database, a duplicate address refused, the Activity tab in words with no event codes, a cross-site write refused, an unassigned Team Member's empty list and 404 detail and 403 create and 404 create form, and a linked Client redirected away from the internal Clients area and answered 404 by the internal API for their own client while their portal still opens.

The browser review adds the A6 states at all five widths: the list empty and populated, a non-All filter, the create form and its validation state, the Overview, Services, Onboarding, Team, and Activity tabs, the edit dialog, the add-contact dialog, the removal confirmation, a client with a very long name and a very long contact address, and a Team Member's read-only detail. It also checks in the browser that a Client deep-linking their own client's internal detail lands on the portal with no internal facts on the page, that an assigned Team Member's detail renders no Edit, Add contact, Make primary, or Remove control, and that an unassigned client is a 404 for them.

### Intentionally deferred to A7 and later

- purchased services, the service-type catalogue, and service lifecycle: A7. The Services tab says so and shows nothing invented
- departments, `client_assignments` and `service_assignments` management, and any scoped team-assignment UI: A7. The Team tab shows only the owner
- onboarding template generation: A8. The Onboarding tab says onboarding has not started
- activation, the lifecycle transitions it owns, `CLIENT_STATUS_CHANGED`, client invitation, and `client_contacts.user_id` linkage: A9 and A10
- the full client onboarding portal: A10
- archive and restore: not implemented, and no column was added for it
- the `clients.company` column stays unsurfaced; `clients.name` is the canonical A6 display name
- projects, work, social, ads, systems, and finance records: Release B and later

## Services and Departments (A7)

One client can now hold several purchased services at once, each with its own lifecycle, and internal people can be assigned to a client as a whole or to one of its services. The Services and Team tabs of the client detail stop being placeholders. One migration (a partial unique index), three new authorization actions, one new resource descriptor, nine new activity events.

| Item | Value |
|---|---|
| Domain | `lib/bloomops/service-catalog.mjs` (the default departments and service types, both seeding paths, catalogue reads), `lib/bloomops/services.mjs` (engagement vocabulary, validation, reads, create, update, the duplicate invariant), `lib/bloomops/assignments.mjs` (candidates, reads, add/update/remove for both kinds of assignment) |
| Routes | `POST /api/bloomops/clients/:id/services`, `PATCH /api/bloomops/clients/:id/services/:serviceId`, `POST /api/bloomops/clients/:id/assignments`, `PATCH\|DELETE /api/bloomops/clients/:id/assignments/:assignmentId`, `POST /api/bloomops/clients/:id/services/:serviceId/assignments`, `PATCH\|DELETE /api/bloomops/clients/:id/services/:serviceId/assignments/:assignmentId` |
| Screens | the real Services and Team tabs in `app/(internal)/clients/[id]/page.jsx` |
| Components | `components/bloomops/Services.jsx` (presentational: `ServiceStatus`, `ServiceRow`, `AssignmentRow`, `ServiceTeamHeading`), `ClientServices.jsx`, `ClientTeam.jsx` |
| Authorization | three new actions, `service.create`, `client.assign`, `service.assign` (Owner, Admin, Project Manager; each about a record), and one new descriptor, `loadInternalServiceResource` |
| Migration | `drizzle/0004_a7_open_service_uq.sql`: one partial unique index |
| Activity | nine new event types: three `SERVICE_*` and six `*_ASSIGNMENT_*` |

### The default catalogue, and where it is defined

The four departments and the five initial service types are declared once, in `lib/bloomops/service-catalog.mjs`, and nowhere else.

Departments, in position order:

| Slug | Name | Position |
|---|---|---|
| `social` | Social | 10 |
| `ads` | Ads | 20 |
| `systems` | Systems | 30 |
| `operations` | Operations | 40 |

Service types, each on one of those departments:

| Slug | Name | Department |
|---|---|---|
| `social-media-management` | Social Media Management | Social |
| `ads` | Ads | Ads |
| `ghl` | GHL | Systems |
| `kajabi` | Kajabi | Systems |
| `content-calendar` | Content Calendar | Social |

Operations deliberately has no default service type: it is where internal work lives, not something the agency sells. `docs/PRODUCT_SPEC.md` also lists funnels, email sequences, automation, course builds, and integrations as examples; those are deliverables inside a Systems engagement rather than separate purchases, so seeding them would only lengthen the picker. They were left out on purpose.

### Seeding strategy, and why it is not a data migration

Two paths put the catalogue into a workspace, and both read the same constants:

- `ensureWorkspaceServiceCatalog(db, workspaceId)` — Drizzle, for a workspace that already has an id. Two passes, because a service type needs its department's id.
- `catalogStatements({ workspaceSlug })` — literal `INSERT ... SELECT ... WHERE NOT EXISTS` statements, appended to the plan in `lib/bloomops/bootstrap.mjs`, because that plan is handed to `wrangler d1 execute --file` against a remote database where none of our JavaScript runs.

Both are idempotent by slug and neither ever rewrites a row it did not create: a workspace that renamed Ads or deactivated Kajabi keeps its decision. A test asserts the two paths produce identical rows, so they cannot drift.

An existing workspace picks the catalogue up without a data migration because `.github/workflows/deploy-staging.yml` runs `scripts/bootstrap-workspace.mjs` on every push to main, and a second pass inserts nothing. That is why the catalogue is not in a schema migration: it is workspace-scoped configuration, one workspace's rows are not another's, and the bootstrap already owns "make this workspace's starting state true, again and again".

Nothing seeds a client, a contact, or an engagement anywhere. The catalogue is configuration; there is no sample data in any environment.

### Service engagements

A service engagement is one purchased service for one client. James with Social, Ads, and GHL is one client record with three engagement rows, and nothing in `lib/bloomops/services.mjs` writes to `bloomops_clients` at all.

Creation takes a service type (required, from this workspace's own active catalogue), and optionally a package name, a start date, and scope notes. `approval_preference` and `source_template_version_id` exist from A2, belong to later phases, and are never read from a request or offered by a form.

**A new engagement is always Planned.** The route does not read `status` from the body. Onboarding and Active describe work that activation (A9) coordinates, and letting a create request name them would let a client skip it.

Creating an engagement changes no client field, generates no onboarding, instantiates no template, sets no `source_template_version_id`, invites nobody, sends no mail, and creates no project or action. The engagement row and its `SERVICE_ENGAGEMENT_CREATED` event are one batch, so a failure leaves neither.

### Lifecycle, and its independence from the client

A manager may move an engagement through all six canonical statuses: Planned, Onboarding, Active, Paused, Completed, Cancelled. The service type itself is never editable — an engagement is the purchase of one service, and buying a different one is a different engagement.

Service status and client relationship status are two separate canonical facts on two separate records. Pausing a service leaves an active client active; a service reaching Onboarding generates nothing. Tests walk every status in turn and assert the client's relationship status, health, and dates after each one.

### The duplicate invariant

A client may hold at most **one non-terminal engagement of the same service type at a time**. Non-terminal is Planned, Onboarding, Active, Paused; terminal is Completed and Cancelled. So a completed Social may be replaced with a new one, and a live Social may not be duplicated.

The invariant is the database's, not a check in code: `service_engagements_client_type_open_uq`, a partial unique index over `(client_id, service_type_id)` that applies only while the status is open. A read-then-insert would let two simultaneous requests both pass their check and both insert; the index is what makes the rule true. The domain still checks first, but only so the refusal has human wording, and it catches the constraint error as the same refusal when it loses a race.

The open and terminal lists are declared once in `lib/bloomops/schema.mjs` and the index's `WHERE` clause is built from them, so the schema declaration and the migration cannot disagree.

Reopening a terminal engagement into a conflict (one completed Social, one current planned Social, then trying to make the completed one Active) is refused with the same calm message, never a raw database error.

### Assignment, and exactly what each row grants

Nothing in A7 interprets assignment rows. The A4 engine already does, in `loadAssignedScope` and `canAccessService`, and A7 did not touch it: this phase writes the rows the engine reads, and scope widens or narrows on the next request because the actor is loaded fresh every time.

- **`client_assignments`** grants the client record and every service engagement under it, including engagements added later.
- **`service_assignments`** grants exactly one engagement: not the client record, not the client's other engagements, not another client's engagement of the same service type.
- **`department_memberships`** grants nothing. Belonging to Social organises a person; A4 ignores the table entirely and A7 keeps it that way.

The two narrowing cases are proved explicitly, through freshly loaded actors:

- Somebody holding both a client assignment and a service assignment on James → Social, whose **client** assignment is removed, loses the James record and implicit access to James' other services, and **keeps** James → Social through the explicit row. Nothing cascades; the service row is not deleted.
- The same person whose **service** assignment is removed instead **keeps** Social, because the client assignment still grants every service. Removing a narrower assignment never revokes broader access that still exists.

### Assignment candidates, and rows that outlive eligibility

A new assignment may name only an active internal membership of this workspace: Owner, Admin, Project Manager, Team Member. Never a Client membership, never a suspended or removed one, never a pending invitation, never a membership of another workspace, never a bare user id. Assignment records use membership ids; the workspace comes from the session and the client and service from the route, never from a body.

Somebody who was legitimately assigned and has since been suspended or removed **keeps their row**. The engine refuses them anyway, the Team tab says "No longer active in this workspace" in words, and a manager decides whether to take the row away. Nothing deletes an assignment because a membership changed.

Assignment roles are `lead` and `member`, and no third was invented. The canonical documents do not ask for exactly one lead, so nothing enforces one: a client or a service may have several leads, or none.

Re-assigning the same person is never a second row: the same role is a no-op that records nothing, a different role is a role change that records one update event.

Those semantics hold under concurrent requests, not only sequential ones, and two things in `addAssignment` make that true.

**Atomicity.** The assignment row and its `*_ASSIGNMENT_ADDED` event are one `db.batch`, with the id generated in the domain so the event can name the row before either exists. D1 applies a batch as one transaction, so there is no state in which an assignment exists without the significant activity event that records it.

**Concurrency.** The read before the write is a fast path and never the authority; the unique indexes on `(client_id, membership_id)` and `(service_engagement_id, membership_id)` are. Two requests can both read nothing before either writes, and one then loses the index. That loser does not fail: it re-reads the winning row by workspace, parent, and membership and resolves through exactly the semantics above, so the caller gets the answer it would have got had the two requests arrived in order. Detection is scoped to a UNIQUE violation naming that kind's own table and both of its index columns, read down the error's cause chain; a foreign key failure, a CHECK failure, or a unique violation anywhere else is re-thrown rather than mistaken for a re-assignment. Two attempts, then a calm `conflict` refusal, so a row that keeps vanishing cannot spin.

### Owner versus assignment

A6 established that `clients.owner_membership_id` is operational responsibility and not an authorization grant, and A7 preserves it in both directions: assigning somebody writes no owner, naming an owner writes no assignment row, and removing an assignment leaves the owner exactly as recorded. A Team Member who owns a client and loses their assignment keeps the ownership record and loses the scope. Ownership alone still grants nothing.

`ownerCandidates` in `lib/bloomops/clients.mjs` was not widened. A7 could now grant client access in the same place an owner is named, but the A6 rule (a Team Member qualifies as owner only through a real client assignment) is still the correct one and needed no change.

### Authorization

Three new actions, each about a record that already exists, so each proves reach as well as role:

| Action | Resource | Owner | Admin | Project Manager | Team Member | Client |
|---|---|---|---|---|---|---|
| `service.create` | the client the engagement is added to | yes | yes | yes | no | no |
| `client.assign` | the client | yes | yes | yes | no | no |
| `service.assign` | the engagement | yes | yes | yes | no | no |

`service.create` names the client rather than nothing, because the engagement does not exist yet and asking only about the role would let a manager add a service to a client they cannot otherwise reach. None of the three needs `members.manage`: putting a colleague on a client decides who does the work, while who is in the workspace at all stays where A4 put it. The A4 role matrix test now covers all sixteen actions and asserts that every action naming a record has one and every action naming none has none.

`loadInternalServiceResource` is the service counterpart of A6's `loadInternalClientResource`. `loadServiceResource` stays client-visible, because a portal contact may one day be shown a projection of a service their own client bought; the package, the scope notes, the lifecycle, and the internal team are not that, so every internal route asks about an `internal` record and the engine refuses a Client on visibility. `loadServiceResource` also takes an optional `clientId`, put into the lookup rather than compared afterwards, so an engagement under a different client of the same workspace answers exactly as one that never existed.

### Activity

Nine new event types on the existing append-only `activity_events`; no second history table.

`SERVICE_ENGAGEMENT_CREATED`, `SERVICE_DETAILS_UPDATED`, `SERVICE_STATUS_CHANGED`, `CLIENT_ASSIGNMENT_ADDED`, `CLIENT_ASSIGNMENT_UPDATED`, `CLIENT_ASSIGNMENT_REMOVED`, `SERVICE_ASSIGNMENT_ADDED`, `SERVICE_ASSIGNMENT_UPDATED`, `SERVICE_ASSIGNMENT_REMOVED`.

Every one carries the workspace and the client, so a client's history reads as one story; the service ones also carry the engagement. Details and status are two distinct facts and record one event each. A validation failure, a refused request, and a no-op record nothing, and one request never records the same fact twice.

Metadata carries the safe display names it needs to stay readable later — the service type's name, the member's name, and old and new roles — and nothing else: no request body, no contact address, no whole service record. `lib/bloomops/client-activity.mjs` renders each one as a sentence, and event codes, ids, and metadata JSON never reach the screen:

- "Service added — Social Media Management (Growth) was added."
- "Service status changed — Social Media Management changed from Planned to Active."
- "Client team member added — Maria Reyes was assigned to this client as member."
- "Service team member removed — Tomas Bell was removed from Social Media Management."

Client-wide and service-specific assignment read differently on purpose, so somebody skimming the history can tell the two amounts of access apart without opening the Team tab.

### The Services tab

Real for a manager: one hairline row per purchased service with the service name, its department, its status as a label plus a glyph, the package and start date on a quiet second line, and the scope note clamped to two lines underneath. Add service and Edit are small dialogs, not wizards. No card per service, no department icon, no progress ring, no statistic.

A Team Member who reaches the client reads the same rows on the server with no controls at all. Which services they see is the engine's answer, not the page's: a client-level assignment shows all of them, a service-level assignment shows that one.

The Add service form offers only service types that could actually start now — active, with no open engagement already — so the screen does not invite the duplicate the server would refuse. When a client already has every service in the catalogue, the form says so and offers nothing rather than fields that cannot be submitted. The server is still the boundary either way.

### The Team tab

Three sections, kept apart because they are three different facts:

- **Internal owner** (A6): who is responsible, with the plain statement that it is not who has access.
- **Client-wide team**: "People here work across every service this client has, including services added later."
- **Service teams**: one indented, left-ruled block per engagement, each with its own heading, status, and list, under "People here work on one service only. Being on a service team does not give access to this client's other services."

They are never collapsed into one ambiguous "Team" list. Assignment roles are words beside the name, never a colour, and a member whose workspace membership has ended is marked in words. Owner, Admin, and Project Manager may assign, change a role, and remove, with a confirmation before a removal that says exactly what the person loses and what they keep. A Team Member who can reach the client reads both lists with no controls; a Client never reaches the tab at all.

### Migration

`drizzle/0004_a7_open_service_uq.sql`, generated by `drizzle-kit` from the schema declaration:

```sql
CREATE UNIQUE INDEX `service_engagements_client_type_open_uq` ON `service_engagements` (`client_id`,`service_type_id`) WHERE status IN ('planned', 'onboarding', 'active', 'paused');
```

No column was added, no table was redesigned, and the A6 primary-contact migration is untouched. `.github/scripts/verify-zero-remote.mjs` gained an index check, read from the migration files themselves, because two phases in a row have added nothing but an index and a table-only check would have passed with it missing.

### Local verification (2026-09-06)

| Check | Result |
|---|---|
| `npm ci` | ok |
| `npm test` | 2826 tests, 2826 pass, 0 fail (2765 before A7; 61 A7 tests across `tests/bloomops-services.test.mjs` and `tests/bloomops-assignments.test.mjs`, including the seven added by the correction pass below) |
| `npm run build` | exit 0 |
| `npm run cf:build` | exit 0, `Worker saved in .open-next/worker.js` |
| Local D1 from zero | `.wrangler/state` deleted, then `db:schema:local`, `db:migrate:local`, `db:domain:migrate:local` (5 applied). Second pass: "No migrations to apply". `client_contacts_primary_uq` and `service_engagements_client_type_open_uq` both present on the fresh database |
| Zero-to-current | `node .github/scripts/verify-zero-remote.mjs --local`: every check passed with the five domain migrations, including the new "every index the migrations create exists" (48 indexes) and the identical-after-second-run comparison |
| End-to-end smoke against the local Worker | `node scripts/auth-smoke-local.mjs --url http://localhost:8787`: 132 of 132 through the real bundle on workerd (89 before A7) |
| External verifier against the local Worker | `node .github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development`: 21 of 21 |
| Browser review | `node scripts/shell-review-local.mjs`: 538 of 538 structural checks, every A5, A6, and A7 state at 1440, 1024, 768, 390, and 320 in headless Chromium, 249 screenshots inspected |

The 54 A7 tests run the real route handlers over a real SQLite built from the committed migrations, with real Better Auth sessions, and render the real components.

`tests/bloomops-services.test.mjs` covers: the catalogue (exactly four departments and five service types with the right mappings, Operations with none, a second pass adding nothing, a row with a canonical slug left exactly as the workspace made it, two workspaces with independent rows and a foreign department refused by the foreign key, the bootstrap plan and the domain helper producing identical rows, the plan giving an existing workspace the catalogue without rewriting anything, and department membership granting no scope); creation by each role with the denied cases, the forced Planned status, the ignored `status`, `clientId`, `workspaceId`, `approvalPreference`, and `sourceTemplateVersionId`, and the absence of any onboarding, invitation, mail, or portal link; one client holding Social, Ads, and GHL as one record; a foreign, inactive, and invented service type all refused identically; bounded validation that writes nothing; the duplicate invariant in all four open statuses and its release in both terminal ones, a direct database insert refused, and a terminal reopen into a conflict refused in words; every canonical status accepted with the client's status, health, and dates unmoved after each; the service type refused as an edit; activity with the right actor, workspace, client, and engagement, readable after a rename, absent on failure and no-op, and immutable; leak safety across four cases compared byte for byte; the origin fence on both routes; what the add form offers; and the rendered markup of every semantic component.

`tests/bloomops-assignments.test.mjs` covers: the two new actions' policy; assignment by each role with the denied cases; a client assignment granting the client, its list entry, its detail, and every engagement including a later one; its removal taking all of that away on the next request; a service assignment granting exactly one engagement and not the client, its siblings, another client's, or another agency's; both narrowing cases; department membership granting nothing even as lead of all four departments; the candidate list and the five refused kinds of assignee plus a user id; a suspended assignee keeping their row and being marked; re-assignment semantics with no duplicate row and one event per real change; several leads allowed; one row per client and per service for the same person with the database refusing a second; owner and assignment separate in both directions; activity in words with the right actor, client, and engagement; leak safety across six cases; a body-supplied workspace and client ignored; the origin fence on all six routes; and no bleed for one identity with memberships in two workspaces.

The Worker smoke adds, over HTTP through the real bundle: the seeded catalogue and its no-op second pass, the real Services tab, Social added and starting Planned despite the request, GHL added to the same client, both under one client record, a duplicate Social refused in words with no database wording, a status change with the client's lifecycle unmoved and nothing activated behind it, a service-only assignment that does not give the client record, a client-wide assignment that gives every service read-only, the Team tab's two separated sections, a cross-site assignment change refused, a Team Member refused when assigning, the client-wide assignment removed with the client lost and the explicit service row intact, department membership alone reaching nothing, a leak-safe not-found, and the Activity tab in words with no codes or ids.

The browser review adds the A7 states at all five widths: the services list with several statuses and a long package and scope note, the empty state, a client whose catalogue is spoken for, the Team tab with both assignment layers and an inactive member, the empty team, the mixed A6/A7 activity, a Team Member's read-only services and team, the add and edit dialogs, the status selector, the exhausted-catalogue state, both assignment dialogs, and the unassignment confirmation. It also checks in the browser that the two assignment layers are separate sections in order, that each service names its own team through an aria-label, that the assignment role is a word, that an inactive member says so, that a service row carries its department and status, that the Services tab states the lifecycle independence, that A6 and A7 history read as words together with no code, id, or JSON, and that a Team Member is offered no control on either tab.

Two defects the browser review found and A7 fixed before this was recorded:

- **the assignment role ran into the name in the accessible text.** `AssignmentRow` separated the name and the Lead/Member marker with a CSS margin only, so `textContent` and a screen reader both got "Priya ManagerLead". A real space now sits between them, with a render test asserting it.
- **the per-service assign button overflowed a 320px screen.** Its label carried the whole service name ("Assign to Social Media Management", 293px inside a padded block), which pushed the document 3px wider than the viewport. The service is named by the heading directly above it, so the button now reads "Assign someone" and carries the full name in its accessible label.

### Intentionally deferred to A8 and later

- onboarding template generation and instantiation: A8. Nothing in A7 sets `source_template_version_id` or creates an onboarding row
- activation, the client lifecycle transitions it owns, and any coordinated Planned → Onboarding move for services: A9. A7 built the choices activation will use and none of the activation
- client invitation and `client_contacts.user_id` linkage: A9 and A10
- the client portal's own view of a service: A10. `loadServiceResource` stays client-visible for it, and no portal projection was written
- service-type administration: no catalogue CRUD, no pricing, no packages catalogue, no custom service builder, no template binding UI. The catalogue is read-only in the product and exists so a manager can choose what a client bought
- departments administration: no department management screen, no department membership editor, no department dashboard, no workload by department. Departments appear where they are useful (on a service type and on a service row) and nowhere else
- `approval_preference` on an engagement: the column exists from A2 and no route or form touches it
- a direct service detail route: not invented. Navigation for a service-only Team Member belongs to the later Social, Ads, and Systems areas, and A7 did not weaken A4 to make the client detail convenient
- workload analytics, department-wide authorization, projects, milestones, actions, and deliverables: Release B and later

## Leadsthatbloom Reference Audit (A1)

| Reference | Where it was | What happened |
|---|---|---|
| Pages project `bloomtrack-pro`, D1 `bloomtrack-pro` id `412a33ad-…`, preview env on the same database, `RENDER_URL`, `VIDEO_BASE_URL` | `wrangler.toml` | File deleted. Replaced by `wrangler.jsonc` with BloomOps resources only. Neither var is BloomOps configuration |
| `pages:build` script, `@cloudflare/next-on-pages` | `package.json` | Removed. Package name is now `bloomops` |
| `wrangler pages dev` launch config | `.claude/launch.json` | Replaced with `npm run dev` and `npm run preview` |
| Worker `bloomwired-review`, R2 bucket `bloomwired-pdfs`, cron drain against the Leadsthatbloom app | `workers/bloomwired-review/wrangler.toml` | Quarantined. Worker name and bucket renamed to non-existent BloomOps-prefixed placeholders with a do-not-deploy header, so a deploy from that directory is refused. Source kept because tests pin its cron cadence and routing. Removal belongs with the prospecting cleanup |
| `wrangler d1 execute bloomtrack-pro --remote` | `scripts/canary-create.mjs`, `canary-followup.mjs`, `repair-send-events.mjs`, `retire-legacy-sequence.mjs`, `tools/audit-triage/push-results.mjs` | Deleted. Nothing imported them |
| `wrangler d1 execute bloomtrack-pro --remote` | `scripts/migrate.mjs`, `ledger-audit.mjs`, `cutover-dry-run.mjs`, `shadow-followups.mjs`, `reconstruct-replies.mjs` | Kept (tests import or read them). Retargeted to the `DB` binding, `--local` by default, `--remote` refused without `--env` |
| `bloomtrack` commands in comments | `schema.sql` | Rewritten to `DB --env <environment>` |
| PDF upload to R2 through the Leadsthatbloom Worker | `scripts/upload-pdf.sh`, `scripts/upload_pdf.py`, `upload-pdfs.ps1`, `check-pdfs.ps1` | Deleted |
| Windows launcher into `F:\bloomtrack-pro` | `Bloomtrack.bat` | Deleted |
| Tracked generated Worker output (204 files, 13 MB) | `.open-next/` | Removed from version control and gitignored. Regenerated by `npm run cf:build` |
| Prospect exports (5 files, 700 KB) | `all-prospects.json`, `all-emailed-prospects.csv`, `ellen-coaches.csv`, `done-coaches.csv`, `coaches.json` | No runtime source referenced them. Deleted and gitignored by name |
| `LTB_ACCESS_CODES`, `LTB_SESSION_SECRET` | `lib/session.mjs`, `middleware.js`, `app/api/auth/route.js`, `docs/ACCESS-CODES.md` | Removed in A3 with the access-code login. `LTB_SESSION_SECRET` survives only as the Gmail token encryption key in the inherited prospecting code (`lib/secret-box.mjs`, `app/api/gmail/*`), which goes with that code |
| `LTB_SHARED_APIFY_TOKEN`, `RENDER_SECRET`, `UPLOAD_SECRET`, `CRON_SECRET`, `GOOGLE_*`, `GMAIL_*`, `BRAVE_API_KEY`, `SERPER_API_KEY` | prospecting routes and `lib/` | Prospecting secrets. Not configured for any BloomOps environment. They go with the prospecting code |
| `NEXT_PUBLIC_LTB_*` build stamps | `next.config.js`, `lib/version.mjs` | Kept. Build-time version badge, not infrastructure. Rename with the app identity later |
| `CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH` | `app/api/system-health/route.js` | Kept. Reports `unknown` on Workers. Prospecting system page |
| `audit-render` Cloud Run service | `services/audit-render/` (Dockerfile, gcloud README), `lib/runner.mjs`, `tools/audit-triage/scan.mjs` | Kept. Tests import its pure modules. Not a Cloudflare resource, deploys only through an explicit `gcloud` login. Goes with the prospecting code |
| `leadsthatbloom.com`, `file.gobloomwired.com` URLs | `scripts/visual-acceptance.mjs`, `scripts/port-pages.mjs`, `lib/bloom-api.mjs`, prospecting routes, skills, root reports | Kept. HTTP references, not resource configuration. No BloomOps command uses them |

## Verified Working

Verified on 2026-09-05 in a clean Linux container (Node 22.22.2, npm 10.9.7):

| Check | Result |
|---|---|
| `npm ci` from the regenerated lockfile | OK |
| `npm test` | 2613 tests, 2613 pass, 0 fail (2605 inherited, 8 new) |
| `npm run build` (Next.js 15.5.25) | exit 0, no warnings. The old edge-runtime warnings are gone |
| `npm run cf:build` (OpenNext 1.20.6) | exit 0, `Worker saved in .open-next/worker.js`, no unsupported features reported |
| `wrangler deploy --dry-run` for development, staging, production | exit 0 each, bindings as listed above |
| Fresh local D1 bootstrap | `db:schema:local` then `db:migrate:local`: 16 recorded, 44 executed, ledger 60, 37 tables, second run no-op |
| `npm run preview` (local Worker) | `/gate` 200, `/` redirects to `/gate`, `/api/infra` 401 without a session, sign-in 200, `/api/infra` reports `development` with D1 and R2 `ok`, `/api/pages` 200 with seeded pages, page create 201 and read back, `/api/version` `/api/clients` `/api/settings` `/api/prospects` `/api/today` `/api/system-health` all 200, authenticated `/` 200 with no Next error markers |
| `next dev` | sign-in 200, `/api/infra` reports `development` with D1 and R2 `ok` through the dev hook |
| Pages anchors | all eight A0 anchor files unchanged, no file under `components/` changed |

New tests: `tests/infra-status.test.mjs` (binding report never carries ids or secrets, failures are reported not thrown) and four cases in `tests/migrate.test.mjs` (already-present migrations are recorded not executed, missing ones execute and inform later checks, the runner without a schema reader behaves as before).

## Staging Deployment

First completed on 2026-09-05 by GitHub Actions run 33966322588 of `.github/workflows/deploy-staging.yml` at commit `9442c11`. The same workflow runs on every push to `main` and, until PR #2 and PR #3 merge, on pushes to their branches, so staging stays current on its own. The latest deploy is recorded under "Staging verification" in "Domain Schema (A2)".

| Item | Value |
|---|---|
| Cloudflare identity | User API token for `hello@bloomwired.io`, account `Bloomwired`. The account id lives only in the repository secret |
| Worker | `bloomops-staging` at `https://bloomops-staging.cool-sunset-2169.workers.dev` |
| Deployed version | `a876ed03-2fe0-405a-9a60-e883c9870501`, deployed 2026-09-05T12:40:14Z |
| D1 | `bloomops-staging`, id `4bb0c8e9-a08f-43d7-9ad7-68b28c371d23`, committed in `wrangler.jsonc` under `env.staging` |
| R2 | `bloomops-files-staging`, present on the account, bound as `FILES` |
| Bindings at deploy | `DB` (bloomops-staging), `FILES` (bloomops-files-staging), `ASSETS`, `BLOOMOPS_ENV` = `staging` |
| Schema | `db:schema:staging`: 28 statements executed on the staging database |
| Migrations | `db:migrate:staging`: 16 recorded as already present, 44 executed, none previously applied (fresh database) |
| Secrets | `LTB_ACCESS_CODES` and `LTB_SESSION_SECRET` set on `bloomops-staging` from throwaway repository secrets |
| Bundle | 9811 KiB, 1981 KiB gzipped, 25 ms startup |

Remote verification by `.github/scripts/verify-staging.mjs` against the live URL, 12:40:19Z to 12:40:25Z, 14 of 14 checks passed:

- anonymous `/api/infra` refused with 401, `/gate` renders 200, anonymous `/` redirects to `/gate`
- sign-in with the throwaway staging code returns 200 and issues a session cookie
- `/api/infra` returns `environment: staging`, `d1: bound, ok`, `r2: bound, ok`
- `/api/pages` returns 200 with the 4 seeded pages
- a disposable page was created (201), read back, deleted (200), and no longer listed. The row remains soft-deleted in the staging trash and holds no real data

Isolation proof. The staging Worker binds only the resources above, and their names and id differ from every other environment: development runs on wrangler's local simulation with id `bloomops-dev-local`, and production still carries the placeholder id and has no Worker. The provisioning script refuses to run if the staging block names anything other than the BloomOps staging resources or shares an id with production, and it passed.

Leadsthatbloom and BloomOps production untouched. The run's wrangler operations were `whoami`, `d1 list`, `r2 bucket info`, `d1 execute DB --env staging --remote`, `deploy --env staging`, and `secret put --env staging`. Every mutating call carried `--env staging`. No production environment was deployed, no production database or bucket was created, and no Leadsthatbloom database, bucket, Worker, Pages project, or secret was named or touched.

Re-running the workflow is safe. Schema and migrations are idempotent, the provisioning step verifies the committed id against the account, and the verifier creates and deletes its own page.

## Known Risks

- the default catalogue reaches an existing workspace through the bootstrap step of the staging deploy, not through a migration. If that step is ever skipped (it is skipped with a warning when the owner or admin secret is missing), a workspace has departments and service types only from whenever the bootstrap last ran, and the Services tab's Add form has nothing to offer. The seeding is idempotent, so re-running the bootstrap fixes it
- the A7 duplicate rule (one open engagement per service type per client) is a Release A decision taken where the canonical documents are silent about re-selling. It is one partial unique index plus the open/terminal split in `lib/bloomops/schema.mjs`; widening or narrowing it means a migration, not a code change
- a service-only Team Member has no navigation to the engagement they are assigned to. The engine grants it, `listClientServices` returns it, and no route or screen in A7 exposes a service on its own, because the client detail is behind the client record they deliberately do not have. C1 now provides scoped Social Content list/create/detail/edit and minimal Social-service context; a standalone Service detail remains outside C1
- `describeEvent` falls back to "Client updated" for an event type it does not know, which is right for a screen but means a future phase that adds an event and forgets its renderer degrades quietly rather than loudly
- A6 shows the client lifecycle and never writes it, so a client created today stays Draft until A9 exists. That is the deliberate boundary (see "Lifecycle, and the A9 boundary"), but it means the lifecycle filters other than Draft can only show clients whose status was set outside the application
- the A6 owner-candidate policy (workspace-wide roles, plus a Team Member already assigned to that client) is a decision taken where the canonical documents are silent, made because ownership grants no access. It is one function, `ownerCandidates`, and A7 may widen it once assignment management exists
- `owner_membership_id` is operational responsibility and the A4 engine does not read it. A future phase that decided ownership should imply scope would have to change the engine deliberately, not the client domain
- a slug race falls back to random suffixes and, if every candidate loses, answers a plain "try again" rather than a constraint error. It has not been observed; the retry loop exists so it cannot surface as a raw unique-constraint failure
- `app/globals.css` (inherited) carries element-level rules that can outrank `.bo-*` classes. A6 hit one (`input[type="date"] { font: inherit }`) and answered it in `app/bloomops.css` with a more specific selector plus a test. Other element rules there could do the same to a future control
- the inherited Leadsthatbloom application is still in source and still served to Owner and Admin at `/legacy` (no longer the root, not in navigation); its Pages editor is the part worth keeping, and retiring the rest is later work
- the inherited prospecting routes are fenced, not authorized: Owner and Admin reach all of them as `admin`, and no other role reaches any. Every inherited route still knows nothing of client, service, or visibility scope, which is why the fence admits nobody else until later phases replace those surfaces
- the shell layouts and pages resolve access through React `cache()` per request; a page that forgets to call `requireShell` would render inside the shell without its own check. `tests/bloomops-shell.test.mjs` fails if any page or layout under `app/(internal)` or `app/portal` omits the call
- `app/bloomops.css` and the inherited `app/globals.css` both load on every page; the BloomOps layer is namespaced, but a future inherited-CSS change to element selectors (`html`, `body`, focus rings) could still reach BloomOps surfaces. `html:has(.bo-root)` and `.bo-root` reset the ground, font, and focus colour deliberately
- the `/design` gallery is gated to development or an explicit `BLOOMOPS_DESIGN_GALLERY=1` var plus an internal membership; staging does not set the var, so the gallery does not exist there
- the restricted-visibility policy (Owner, Admin, and named memberships) and the Owner-holds-everything capability baseline are A4 decisions taken where the planning docs are silent; each is one line in `lib/bloomops/authorization.mjs` and one row in the tests to change
- a Client membership created through the A3 invitation flow has no `client_contacts.user_id` link yet and therefore reaches nothing until a later phase links the contact on acceptance; that is the intended fail-closed state, not an oversight
- Better Auth's rate limiter uses memory storage, which is per Worker isolate; the magic-link path is still bounded (5 requests a minute per IP per isolate) but not globally
- staging can sign in only its bootstrapped addresses. Real magic-link delivery and sign-in were manually verified on 2026-09-06 from a bootstrapped staging Owner mailbox using the configured verified Resend sender domain
- staging holds one extra active membership, created as Owner when the bootstrap addresses were changed between workflow attempts on 2026-09-06. The bootstrap never rewrites or removes memberships, so it stays until removed by hand or through the members API
- the `resend` transport sends from `onboarding@resend.dev` until `BLOOMOPS_MAIL_FROM` names an address on a domain verified in Resend; that sender only delivers to the Resend account's own mailbox
- prospecting code, skills, tools, `services/audit-render/`, the quarantined `workers/bloomwired-review/`, and the Leadsthatbloom report markdown files at the repository root remain until replacement phases make removal safe
- the inherited schema is still bootstrapped from `schema.sql` plus postcondition-aware migrations. A2 added the BloomOps domain schema beside it. The inherited schema is retired only when the prospecting code that reads it is removed
- `open-next.config.ts` configures no cache. Every inherited route is dynamic, so nothing is lost today. Revisit when a route needs ISR
- `compatibility_date` is `2025-05-01`. Wrangler suggests a newer date. Raise it deliberately with a test pass
- the production D1 id is a placeholder until production is provisioned deliberately
- two migration systems coexist in one database until the inherited prospecting schema is retired: keep running the inherited bootstrap before the domain migrations on a brand-new database, as the workflow does, even though either order works today
- the BloomOps client table is physically named `bloomops_clients` until the inherited `clients` table is dropped

## Intentionally Not Done in A7

- no service-type administration: no catalogue CRUD, no pricing, no packages catalogue, no custom service builder, no template binding UI
- no departments administration: no management screen, no membership editor, no dashboard, no workload by department. Department membership still grants no client or service scope
- no activation of any kind: no onboarding instance, no template instantiation, no `source_template_version_id`, no client invitation, no `client_contacts.user_id` write, no mail, no project, no action
- no client lifecycle write. A service status change touches the service and nothing else
- no `approval_preference` in any route or form, though the column exists from A2
- no direct service detail route. Navigation for a service-only Team Member belongs to the later specialist areas; A4 was not weakened to make the client detail convenient
- no portal projection of a service. `loadServiceResource` stays client-visible for A10 and nothing renders it yet
- no "one lead only" constraint. The canonical documents do not ask for one, so several leads are allowed
- no workload analytics, no department-wide authorization
- no staging deployment from this branch, and no fake client or engagement seeded anywhere. The default departments and service types are real workspace configuration and reach staging through the existing bootstrap step

## Intentionally Not Done in A6

- no purchased services, service types, or service lifecycle (A7); the Services tab is an honest state
- no departments, `client_assignments` or `service_assignments` management, or scoped team-assignment UI (A7); the Team tab shows only the internal owner
- no onboarding template generation (A8), activation (A9), client invitation or `client_contacts.user_id` linkage (A9/A10), or client onboarding portal (A10)
- no client lifecycle write of any kind, and no Activate control: `updateClient` refuses `relationshipStatus`, and `CLIENT_STATUS_CHANGED` is left for the phase that moves the lifecycle
- no archive or restore, and no `archived_at` or `deleted_at` column
- no `clients.company` field in the UI; `clients.name` is the canonical display name
- no second authorization model: one new action and one new descriptor, both in `lib/bloomops/authorization.mjs`
- no change to the A5 shell, navigation, or portal, and no new portal destination
- no edit to any inherited prospecting route, component, or the Pages/editor system; `app/globals.css` is untouched (the date-field fix is in `app/bloomops.css`)
- no staging deploy from the branch and no production provisioning; no staging data was created or seeded, and no workflow trigger was changed
- no removal of inherited code

## Intentionally Not Done in A5

- no Clients CRUD or detail, no service or department management, no onboarding engine, no activation or client linkage, no projects, milestones, actions, deliverables, social, ads, systems, or finance records, no payment or billing, no public registration, no new auth method, no Better Auth organization plugin, no workload analytics
- no capability grant/revoke screen, no appearance preference, no portal destinations beyond Home
- no schema change or migration
- no edit to any inherited prospecting route, component, or the Pages/editor system; `app/globals.css` is untouched
- no staging deploy from the branch and no production provisioning; the extra A3 staging membership is untouched; no workflow trigger was changed
- no removal of inherited code; the inherited application is served at `/legacy` for administrators until later phases retire it

## Intentionally Not Done in A4

- no Clients, client detail, onboarding, project, task, social, ads, systems, finance, settings, or portal features; no A5 shell or navigation; no member or invitation management UI; no capability, assignment, or contact-link routes
- no change to Better Auth, the sign-in or invitation screens, or the magic-link flow; no new auth method, no organization plugin
- no schema change or migration
- no edit to any inherited prospecting route; the fence is in `lib/workspace.mjs` and `app/page.jsx` only
- no staging deploy from the branch and no production provisioning; the extra staging membership A3 recorded is untouched
- no removal of the extra A3 staging membership or any other staging data

## Intentionally Not Done in A3

- no authorization engine, capabilities, assignment scope, or visibility rules (A4)
- no member or invitation management UI, no shell or navigation changes, no redesign of the sign-in screens (A5)
- no social OAuth, no email and password, no Better Auth organization plugin
- no production provisioning, secrets, or deployment
- no removal of prospecting code beyond the access-code login itself
- no change to the Pages/editor system

## Intentionally Not Done in A2

- no Better Auth install, routes, sessions, magic links, Resend, or login UX
- no Clients, Onboarding, or Templates UI
- no seed data beyond test fixtures
- no changes to inherited tables, SQL, or behaviour, and no rename of the inherited `clients` table
- no production provisioning or migration
- no A3 work

## Intentionally Not Done in A1

- no Better Auth, no Drizzle domain tables, no Clients, no Onboarding, no navigation changes
- no removal of prospecting routes, components, or libraries
- no rename of inherited `LTB_*` login secrets (A3 replaces the login)
- no change to the Pages/editor system
- no production provisioning or deployment
- no A2 work

## Context Discipline

For the current phase and its audit, read:

1. `AGENTS.md`
2. this file
3. `docs/phases/C4.md`

Read additional canonical planning docs only when the phase file or `docs/INDEX.md` calls for them.

## Next Planned Phase

Finish C4 independent ChatGPT audit and user-controlled merge, then verify Deploy staging and Verify zero-to-current on the exact C4 merge SHA. The next planned phase is C5 — Approvals + Revision History, after those gates and a separate implementation instruction. C5+ remains unimplemented.

### The A7 phase, for reference

A7, Services and Departments. Complete. It seeds the four departments and the initial service types, gives one client several purchased service engagements with their own lifecycle, and builds assignment at both the client and the engagement level. The Services and Team tabs of the client detail (`app/(internal)/clients/[id]/page.jsx`) are where its screens land; both say today, honestly, that services and assignments are a later release. `service.view` and `service.manage` already exist in `ACTIONS`, and `loadServiceResource` already builds the descriptor; A7 adds whatever creation action it needs beside `client.create` and may widen `ownerCandidates` in `lib/bloomops/clients.mjs` once a manager can grant client access in the same place they name an owner. The A4 rule that a service assignment reaches the engagement and not the client record is load-bearing and is covered by tests in both `tests/bloomops-authorization.test.mjs` and `tests/bloomops-clients.test.mjs`.

## Last Verification

2026-09-08, C4. 111 focused tests, all C1–C3/B1–B7/A-core regressions, 4,490 full tests, both builds, 39 JS/JSX syntax checks, clean diff check, 22 fresh/no-op checks, C4 real workerd/D1/R2 64, all prior runtime smokes, built HTTP 144, external verifier 21 and final browser/HTTP 75 with 47 captures passed. The leading C4 section is the current evidence and gate record; the paragraphs below are historical. Package/lock unchanged; exact current C3-base and C4 audit both 53, zero delta. C4 remains pending independent audit, user-controlled merge and exact-merge-SHA post-merge gates; C5+ is unimplemented.

2026-09-08, C1. Canonical Content Items and the real Social list/create/detail/edit flow passed 133 focused tests, all B1–B7 and A/core regressions, and 4,163/4,163 full tests. Both builds, 33 JS/JSX syntax checks, whitespace checks, 22 fresh/no-op checks, C1 actual D1 43, prior B1/B2/B3/B4/B5/B6/B7/A11 actual D1/R2 25/28/47/38/42/34/86/26, built HTTP 144, external verifier 21, and final browser/HTTP 96 with 33 captures all passed. Package/lock unchanged; audit 49 advisories, zero current base/branch delta. The C1 section records the 44-path inventory, exact schema/field/auth choices, pagination/choice limits, complete commands and local evidence limitations. The temporary prompt is gone with no net diff. C1 awaits independent audit, user-controlled merge and both exact-C1-merge-SHA gates; C2+ is not implemented.

2026-09-08, B7. Schema-free Release B hardening reproduced and corrected exact Project body validation, Work query validation and a mobile toast obstructing a dialog. B7 focused 29/29 (34 shared race assertions), B1–B6 97/173/203/197/171/76, A/core 421/421 and full 4,030/4,030 passed with zero failures/skips. Install, Next/Cloudflare builds including lint/type checks, 21 JavaScript syntax checks and whitespace checks passed. Fresh/no-op zero: 22/22 with unchanged 60 inherited + 13 domain migrations. Actual D1 B1/B2/B3/B4/B6/A11: 25/28/47/38/34/26; actual Files D1/R2: 42; integrated B7 D1/R2: 86. Final built HTTP: 144; external: 21; B7 browser: 273 with 62 captures; Files browser: 143 with 44 captures plus reference. All five required widths passed, including immediate 390/320 toast hit tests. The B7 section records exact commands, the 28-path inventory, audit matrix, local evidence limits and unchanged 49-advisory count/severity baseline. This is historical B7 local evidence. B7/Release B subsequently closed through PR #21 and both successful exact-SHA gates on `c6509aa395a5db58310e2a0ae22a8a808082f77b`. C1 is recorded above.

2026-09-08, B6. Schema-free canonical Home/Work projections passed 76/76 focused tests, B1/B2/B3/B4/B5 regressions 97/173/203/197/171, Release A/core 421/421 and the full suite 4,001/4,001, all with zero failures/skips. Install, both builds including lint/type validation, 16 JS/JSX syntax checks and diff checks passed. Fresh/no-op verification: 22/22, unchanged 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 indexes and 21 triggers. Actual D1 B6: 34/34 with 240 assignments, Home 14 metadata queries and a maximum 64 bindings / 12,918 SQL bytes; no R2 binding. Prior D1/R2 B1/B2/B3/B4/B5/A11: 25/28/47/38/42/26. Final built HTTP: 144/144; external verifier: 21/21; B6 browser/HTTP: 144/144 with 47 captures at 1440/1024/768/390/320, including keyboard/focus, mobile anchor positioning, touch, reduced motion and no-JavaScript Home. Exact commands, the 23-path inventory, query/date/attention rules, fixture/UI corrections, local runtime limitations and unchanged 49 dependency advisories are recorded in the B6 section. This is historical B6 local evidence. B6 subsequently closed through PR #20 and both gates on `58647bda6dd40739b7670e6c0f907b6f33689e5d`; current B7 evidence is recorded above.

2026-09-08, B5. Focused Files 171/171, B1/B2/B3/B4 97/173/203/197, Release A/core 421/421 and full suite 3,925/3,925 passed with zero failures/skips. Install, both builds with lint/type checks, 42 JavaScript/JSX syntax checks and diff checks passed. Fresh/no-op verification: 22/22, 60 inherited + 13 domain migrations, 36 domain / 72 total tables, 84 explicit indexes and 21 triggers. Actual D1/R2 B5 42/42; prior D1 B1/B2/B3/B4/A11 25/28/47/38/26; built HTTP 144/144; external verifier 21/21; browser/HTTP 139/139 with 42 screenshots at five widths plus the live design reference, exit 0. The B5 section records the complete 52-path inventory, 5 MiB upload and recovery limits, middleware/input corrections, reproducible local preview alternative and unchanged 49 dependency advisories. This is historical B5 local evidence. B5 is closed through PR #19 and both post-merge gates on `4c6dad696d15fac4094b8172788b5c72642ff757`. Current B6 work is recorded above.

2026-09-08, B4. Focused Deliverables 197/197, B1 97/97, B2 173/173, B3 203/203, Release A/core 421/421 and full suite 3,754/3,754 passed with zero failures/skips. Install, both builds with lint/type checks, 33 JavaScript/JSX syntax checks and diff checks passed. Fresh/no-op verification: 22/22, 60 inherited + 12 domain migrations, 33 domain / 69 total tables, 77 explicit indexes and 15 triggers. Actual D1 B4/B1/B2/B3/A11: 38/25/28/47/26; built HTTP: 144/144; local external verifier: 21/21; final B4 browser/HTTP: 141/141 with 42 screenshots across all five widths plus the live design reference, exit 0. Exact commands, 42 changed paths, limits, fixture corrections and the unchanged 49 dependency advisories are in the B4 section above. This is historical B4 local evidence; B4 is now closed through PR #18 and both gates on `ac71b358f27894af8dd8108f004499cd765fca69`. B5 is recorded above.

2026-09-08, B3. Focused Actions 203/203, B1 97/97, B2 173/173, Release A/auth/security/domain regressions 421/421 and full suite 3,557/3,557 passed with zero failures/skips. Install, both builds including lint/type checks, 33 changed/new JavaScript syntax checks and diff checks passed. Fresh/no-op migrations: 22/22 checks, 60 inherited + 11 domain migrations, 32 domain tables, 75 explicit indexes and 15 triggers. Actual D1 B3/B1/B2/A11: 47/25/28/26; built-Worker HTTP: 144/144; local external verifier: 21/21; B3 browser/HTTP: 161/161 with 53 screenshots at all five widths. Exact commands, decisions, corrections, changed paths and unchanged 49 dependency advisories are in the B3 section above. This is historical B3 local evidence. B3 is now closed by PR #17 and both verified post-merge gates; B4 is recorded above.

2026-09-08, B2. Focused Milestones 173/173, B1 Projects 97/97, Release A/auth/security/domain regressions 421/421 and full suite 3,354/3,354 passed with zero failures/skips. Install, both builds with lint/type checks, 28 changed/new JavaScript syntax checks and diff checks passed. Fresh/no-op migrations: 22 checks; actual D1 B2/B1/A11: 28/25/26; built-Worker HTTP: 144/144; external local verifier: 21/21; B2 browser/HTTP acceptance: 117/117 with 38 screenshots at all five widths. Implementation, exact commands, verification corrections and existing dependency advisories are recorded in the B2 section above. This is historical B2 local evidence; B2 is now closed by PR #16 and both verified post-merge gates. B3 is recorded above.

2026-09-08, A11. New adversarial tests 82/82 (38 failures reproduced against unchanged pre-hardening code); A10 39/39, A9 44/44, A8 72/72, auth/security/domain 184/184, schema/shell/verifier safety 56/56. Full suite 3,083/3,083 with zero failures/skips on Node 22.22.1. Install, both builds including lint/type checks, all 48 changed/new JavaScript syntax checks, and diff checks passed. Fresh/no-op migrations 22 checks; actual workerd/D1 A11/A10/A9/A8 smoke 26/27/14/12; built Worker HTTP 144/144; external local verifier 21/21; both Release A browser stories and responsive hardening 174/174 with 42 screenshots at five widths. Four browser-fixture defects were corrected before the final passing acceptance run. The dependency advisory assessment and exact commands/files are recorded above. Release A is complete and audited locally, pending independent PR review/merge and both post-merge runs on the actual merge SHA. No real email or manual staging, production, DNS, or Leadsthatbloom mutation occurred.

2026-09-07, A10. Focused A10 39/39; A9 44/44; A8 72/72; affected domain/access 141/141; shell/schema 36/36, combined 332/332. Full suite 3001/3001 on Node 22.22.1. Install and both final builds exit 0. Fresh/no-op local verifier 19/19; A10/A9/A8 disposable D1 smoke 27/14/12; built Worker HTTP smoke 144/144; external verifier against local Worker 21/21; A10 HTTP/browser/Release A acceptance 95/95 with 20 screenshots at five widths. Exact architecture, evidence and limitations are above. All email used memory/development R2, and no staging, production, DNS or Leadsthatbloom resources were modified. A11 is next after independent audit/merge and the merged-main gate.

2026-09-07, A9. Focused A9 42/42, A8 72/72, affected access/domain regressions 158/158, full suite 2960/2960 on Node 22.22.1. Install and both builds exit 0. Fresh/no-op zero verifier passes with seven domain migrations, 25 tables, 55 indexes and nine triggers. Actual D1 A9 smoke 14/14 and A8 smoke 12/12; built local Worker smoke 144/144; external verifier against local Worker 21/21; browser review 37/37. Full evidence and limitations are under "Client Activation (A9)". A10 is next. All mail was fake or local R2; staging, production, DNS and Leadsthatbloom were untouched.

2026-09-07, post-merge A8 verifier correction. Focused safety tests 20/20, full suite 2918/2918, local zero-to-current exit 0 with all six domain migrations and an identical no-op second pass. Syntax, YAML parsing, and diff checks pass. No application build was needed for this verifier/workflow/test/docs-only change. The corrected remote workflow must still pass on main after independent merge before A9 begins. See "Post-merge A8 verifier cleanup correction" above.

2026-09-07, A8. Baseline 2826/2826 on `999f2397`; final 2898/2898, focused A8/schema 91/91, both builds and `npm ci` exit 0, fresh/no-op migrations and zero-to-current pass, actual D1 engine smoke 12/12, app Worker smoke 132/132, external verifier 21/21. Full evidence and environment notes are recorded under "Onboarding Template Engine (A8)" above. A9 is not implemented; staging, production, and Leadsthatbloom were untouched.

2026-09-06, A7 correction pass after an independent audit of PR #8. The audit found one blocking problem in `lib/bloomops/assignments.mjs`: `addAssignment` read then inserted, so two concurrent requests assigning the same person to the same parent could both read nothing and the loser would surface a raw unique-constraint failure instead of the documented re-assignment semantics; and the assignment insert and its `*_ASSIGNMENT_ADDED` event were two separate writes, so an assignment could exist without the event that records it. Both are fixed in the shared implementation, so client and service assignments behave identically (see "Assignment, and exactly what each row grants"). Seven regression tests were added, including three that arrange the real interleaving (the pre-read finds nothing, another writer commits through the real domain path, the insert meets the real index) and one that proves the batch rolls back when the event write fails. Each was confirmed to fail against the unfixed code before being kept.

One test-harness correction came with it: the D1 double in `tests/_bloomops-db.mjs` ran a batch as sequential statements with no rollback, so it could not have proved atomicity for A6's `createClient` or A7's `createServiceEngagement` either. It now wraps a batch in a real SQLite transaction, matching what D1 does. Correct domain code fails the new atomicity test against the old double, which is why the change was necessary.

The optional dialog cleanup the audit flagged was taken: the assignment form no longer renders a role selector when nobody is left to assign.

Re-verified: 2826 tests pass (2819 before this pass), `npm run build` and `npm run cf:build` exit 0, the local Worker smoke passes 132 of 132, and a focused browser check of the changed dialog passes at 1440, 390, and 320 in both its states. No migration was added or changed, so the zero-to-current proof from the A7 execution stands. No staging or production resource was touched, and no wrangler command was authenticated: the only wrangler operations run were local. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A7 execution. Results are in "Local verification (2026-09-06)" under "Services and Departments (A7)": 2819 tests pass (2765 before A7), `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes 132 of 132 and the external verifier 21 of 21 against the local Worker built from this branch, and the browser review passes 538 of 538 structural checks at all five widths with 249 screenshots inspected by hand. A7 added migration `0004_a7_open_service_uq.sql`, so zero-to-current was re-proved: `node .github/scripts/verify-zero-remote.mjs --local` passed every check, including a new one asserting that every index the committed migrations create is present on a database built only from them, and the local D1 went from an empty simulation through all five domain migrations with a no-op second pass. The browser review found two defects (the assignment role running into the name in the accessible text, and the per-service assign button overflowing a 320px screen); both were fixed and re-reviewed before this was recorded. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A6 correction pass after an independent audit of PR #7. The audit found one blocking bug: `updateClient` validated a supplied `ownerMembershipId` as a new-owner candidate before comparing it to the id already stored, so a client whose owner had become ineligible could not have any unrelated field edited. Fixed in the domain layer (see "Owner" above), with three regression tests. Re-verified: 2765 tests pass, `npm run build` and `npm run cf:build` exit 0, the local Worker smoke passes every check including a new one for this case, and the local domain migrations remain a no-op (no migration was added or changed). No production, staging, or Leadsthatbloom resource was touched.

2026-09-06, A6 execution. Results are in "Local verification (2026-09-06)" under "Clients (A6)": 2765 tests pass (2715 before A6), `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes 89 of 89 and the external verifier 17 of 17 against the local Worker built from this branch, the browser review passes 353 of 353 structural checks at all five widths, and a local D1 was migrated from an empty simulation through all four domain migrations with a no-op second pass. A6 added migration `0003_a6_primary_contact.sql`, so zero-to-current was re-proved: `node .github/scripts/verify-zero-remote.mjs --local` passed every check including the identical-after-second-run comparison, and `client_contacts_primary_uq` is present on a database built only from the committed migrations. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `d1 migrations list --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A5 execution. Results are in "Local verification (2026-09-06)" under "Shell (A5)": 2715 tests pass, `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes every check and the external verifier 21 of 21 against the local Worker built from this branch, the browser review passes every structural check at all five widths, and the local D1 was migrated from a fresh simulation with a no-op second pass. No migration was added, so the zero-to-current proof from A3 stands unchanged. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `d1 migrations list --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-06, A4 execution. Results are in "Local verification (2026-09-06)" under "Authorization (A4)": 2698 tests pass, `npm run build` and `npm run cf:build` exit 0, the end-to-end smoke passes 46 of 46 and the external verifier 21 of 21 against the local Worker built from this branch, and the local D1 was migrated from a fresh simulation with a no-op second pass. No migration was added, so the zero-to-current proof from A3 stands unchanged. No staging or production resource was touched from this session: no wrangler command was authenticated, and the only wrangler operations run were local (`d1 execute --local`, `d1 migrations apply --local`, `d1 migrations list --local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`). `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

2026-09-05, A3 execution, updated 2026-09-06 with the staging result. Local results are in "Local verification (2026-09-05)" under "Authentication and Membership (A3)": 2680 tests pass, `npm run build` and `npm run cf:build` exit 0, the external verifier passes 21 of 21 and the end-to-end smoke 40 of 40 against the local Worker, and the bootstrap CLI is idempotent against the local D1. Staging runs 33991041976 and 33991512885 deployed and migrated successfully. The second passed 11 live checks (including the A3 migration present and the access-code flow gone) and failed only at the explicit "authentication is configured" check for lack of the new repository secrets. On 2026-09-06, after the secrets were added, run 33991512885 was re-run as attempt 2 and passed end to end: secrets set on the Worker, bootstrap created the Owner and Admin memberships, and all 22 verifier checks passed against Worker version `68cc78e9`. Attempt 3 (00:32Z) failed at the bootstrap by design after the owner and admin secrets changed between runs, and attempt 4 (00:40Z) passed end to end again, 22 of 22, with the sender address secret now set. The zero-to-current workflow (run 33991041981) proved a fresh remote D1 reaches the A3 schema. Details under "Staging verification (A3)". No production resource was touched. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `wrangler dev` through `opennextjs-cloudflare preview`, `r2 object get --local`).

Earlier the same day, A2 execution. Local results are in "Domain Schema (A2)". GitHub Actions run 33968508433 applied the two domain migrations to `bloomops-staging`, and run 33968734285 (commit `ea075bc`) deployed and passed all 16 live checks, including the domain schema check. Run 33987071853 (commit `ee96d17`) then proved the fresh-remote case: a disposable D1 named `bloomops-a2-zero-verify` went from empty to the current schema through `schema.sql`, `scripts/migrate.mjs`, and the Drizzle migrations, took a second pass as a no-op, and was deleted, with the account inventory and `bloomops-staging` unchanged. A2 satisfies every verification item in `docs/phases/A2.md`, including "fresh staging DB migrates from zero". No production resource was provisioned. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched.

Earlier the same day, A1 execution. Results are in "Verified Working". Later the same day the remote staging step ran from GitHub Actions (run 33966322588) and passed every check, as recorded under "Staging Deployment". A1 satisfies every verification item in `docs/phases/A1.md`. `Beeyach/bloomtrack-pro` and every Leadsthatbloom Cloudflare resource were untouched: no wrangler command in this session was authenticated, and the only wrangler operations run were local (`--local`, `--dry-run`, `wrangler dev`).
