# PERF1 - Navigation Performance Hardening

## Objective

Fix the real staging-wide navigation latency reported after Release C/D1 without weakening BloomOps authorization, tenant isolation, immediate revocation, or canonical data rules.

PERF1 begins from the exact closed D1 merge SHA:

`e5bc81630c47fb6eb51e9bdc6be1687947683643`

On that exact SHA:

- PR #31 is merged.
- Deploy staging run `34496059835` completed successfully.
- Verify zero-to-current run `34496059875` completed successfully.
- D1 is closed.

The user reports that ordinary staging navigation between internal tabs often takes roughly two seconds per click. Local D1 re-audit measurements were much faster (roughly 61-94 ms warm click-to-visible for Social/Work/Systems), so this phase must investigate the deployed-path difference instead of assuming local timing explains staging.

D2 is blocked until PERF1 is independently audited, merged, both post-merge gates pass, and staging navigation is materially improved or the remaining latency is proven to be outside BloomOps application control.

## Read First

Read completely before editing:

- `AGENTS.md`
- `docs/BUILD_STATE.md`
- `docs/RELEASE_D.md`
- `docs/PRODUCT_SPEC.md`
- `docs/DOMAIN_MODEL.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/DESIGN_CHECKLIST.md`
- `docs/phases/D1.md`
- current internal and portal layouts/shell/navigation code
- `lib/bloomops/access.mjs`
- `lib/bloomops/auth.mjs`
- `lib/bloomops/shell.mjs`
- `lib/bloomops/shell-server.mjs`
- `lib/bloomops/membership.mjs`
- `lib/bloomops/authorization.mjs`
- current Home, Work, Social, Systems and Client pages/read models
- current OpenNext/Cloudflare configuration and staging verifier
- current browser/runtime harnesses

Inspect before proposing changes. Measure before optimizing.

## Non-Negotiable Security Rule

Do not trade correctness for speed.

BloomOps currently relies on current database truth so that membership suspension/removal, assignment changes, Client contact unlinking, visibility restrictions and other authorization changes take effect on the next protected request.

PERF1 must preserve that guarantee.

Do not:

- enable long-lived permission or membership caches
- cache authorization decisions across requests in a way that permits stale access
- enable Better Auth cookie/session caching unless you can prove revocation semantics remain equivalent on the very next protected request
- skip server-side authorization because navigation is client-side
- trust client state as authorization
- turn protected pages into stale static output
- weaken 401/403/404 existence-hiding behavior

Request-local deduplication, query consolidation, safe parallelization and data-independent client prefetching are acceptable when current truth is still rechecked for each protected request.

## Phase 1: Reproduce and Attribute

Build a repeatable performance harness before making material optimizations.

Measure at least these internal routes under an authenticated Owner/Admin session:

- `/`
- `/clients`
- `/work`
- `/social`
- `/systems`
- `/team`

Also sample at least one detail route with representative data, such as a Project or Content detail.

For each route/navigation, distinguish where practical:

- browser click to first visible destination content
- RSC/document request duration
- Worker/server execution time if observable safely
- Better Auth session lookup
- workspace membership lookup
- actor/assignment/contact/capability load
- page read-model queries
- serialization/streaming/visible commit delay
- Next prefetch behavior or lack of it
- cold vs warm behavior

Do not log tokens, cookies, magic links, passwords, secrets, Client content or private row payloads.

If remote staging cannot be authenticated safely from the automated harness, document that limitation and reproduce the server path locally with controlled latency where possible. Do not invent remote results.

## Known Starting Evidence

Do not regress the D1 loading-boundary fix.

The D1 re-audit measured six retained warm samples after two warmups:

- Work median click-to-visible: about 76.75 ms
- Social median: about 61.40 ms
- Systems median: about 93.65 ms

The prior Systems-only loading boundary caused about 345 ms median and was removed.

The user still observes roughly two-second staging navigation across tabs. That broader issue is the target of PERF1.

## Likely Investigation Areas

Treat these as hypotheses, not conclusions:

- sequential session -> membership -> actor D1 reads
- actor loading that performs several serial authorization-support queries
- repeated request work not actually deduplicated across layout/page boundaries
- unnecessary server-component serialization or streaming waits
- route-level `force-dynamic` interactions
- missing or ineffective Next prefetching
- expensive aggregate/read-model queries on Home/Work/Social/Systems
- Worker isolate cold starts
- Cloudflare D1 regional placement / cross-region latency
- OpenNext behavior on RSC navigation
- duplicated page data fetches
- browser-visible commit delayed after network completion

Do not optimize an area merely because it looks suspicious. Prove its contribution first.

## Preferred Optimization Order

Prefer the smallest root-cause corrections with broad benefit:

1. eliminate duplicate work within one protected request
2. parallelize independent current-truth reads
3. consolidate queries where this reduces network/database round trips without widening access
4. avoid loading authorization facts a page does not need while preserving identical decisions
5. reuse already-loaded request-local access/actor state
6. improve safe Next navigation/prefetch behavior
7. optimize expensive bounded read models/index usage when measurements prove they matter
8. only then consider larger architectural changes

Do not add Redis, another database, another auth provider, a client state framework, or a new caching service.

## UX Rule

Do not treat a spinner or skeleton as a performance fix.

A loading state may improve perceived continuity for genuinely unavoidable work, but PERF1 succeeds by reducing actual click-to-visible latency.

Do not reintroduce the no-JavaScript/streaming defect previously found in D1.

## Performance Acceptance Direction

The primary goal is for ordinary warm internal navigation to feel immediate.

For the controlled local built-Worker harness with representative data:

- median click-to-visible for ordinary top-level routes should remain comfortably below 200 ms
- no changed route should regress materially from the D1 re-audit baselines
- query counts should remain bounded and deterministic under large assignment scopes

For staging, measure from the strongest safe environment available. Target sub-500 ms median warm click-to-visible for ordinary internal top-level navigation where network conditions permit. If that target cannot be reached, the final report must attribute the remaining latency with evidence rather than hand-waving.

Do not claim staging speed based only on localhost results.

## Authorization Acceptance

After every optimization, prove at minimum that an already-issued session immediately loses relevant access after:

- workspace membership suspension/removal
- Client/Service/Project assignment revocation
- Project/child visibility restriction where applicable
- Client contact unlinking for portal access

Also preserve:

- foreign workspace isolation
- guessed-ID existence hiding
- Department non-grant
- Project ownership non-grant
- Team Member assignment scope
- Client portal allowlists

## Scope

PERF1 owns performance-related changes to shared navigation/auth/read paths only when measurement proves they materially contribute.

PERF1 does not own:

- D2 GHL blueprint generation
- new Systems features
- Ads
- Pages
- Finance
- notifications/queues
- commercialization
- production provisioning
- DNS
- Leadsthatbloom
- unrelated dependency upgrades
- broad UI redesign

## Schema / Infrastructure Rule

PERF1 is expected to be schema-free and infrastructure-light.

A schema/index change is allowed only if measured query plans prove it is required for a hot canonical read path. Any migration must be additive and tightly justified.

Do not alter production resources. Do not point staging at production data.

## Verification

Run the strongest current equivalents of:

- focused performance harness and before/after comparison
- auth/membership/shell/authorization tests
- Team/Client scope and revocation regressions
- B1-B7 shared Work regressions
- Release C regressions
- D1 Systems regressions
- full `npm test`
- `npm run build`
- `npm run cf:build`
- local Worker auth/runtime verification
- local zero-to-current verification
- browser acceptance for changed navigation/shell behavior at 1440/1024/768/390/320
- no-JavaScript checks where changed streaming/loading behavior matters
- keyboard/focus/reduced-motion checks where changed UI behavior matters
- large assignment/bind-limit behavior
- changed JS/JSX syntax
- `git diff --check`
- exact package/lock/schema/migration/config diff against the PERF1 base

Performance measurements must include sample count, warmup treatment, median and range or percentile. Avoid one-off timing claims.

## Documentation and Handoff

Before final handoff:

- update `docs/BUILD_STATE.md` to record D1 closure and PERF1 evidence
- update `docs/INDEX.md` so PERF1 is the active task before D2
- update durable docs only if architecture actually changes
- remove `PERF1_CODEX_PROMPT.txt` before the final implementation commit
- keep working tree clean
- push the branch
- open a PR against `main`
- leave it unmerged for independent audit

Report:

- exact base SHA
- exact final head SHA
- reproduced baseline timings
- root causes proven
- exact changes made
- before/after local timings
- any staging measurements actually obtained
- query-count/round-trip changes
- security/revocation verification
- tests/build/runtime/browser results
- schema/dependency/infrastructure changes, if any
- remaining uncertainty

## Exit Criteria

PERF1 is complete only when:

- the broad navigation latency has been measured and attributed
- proven avoidable application latency is corrected
- warm local navigation remains fast across representative routes
- staging is materially improved or remaining remote latency is explicitly attributed with evidence
- immediate revocation/current-truth authorization remains intact
- no hidden-content loading workaround is introduced
- full regressions remain green
- independent audit passes
- PR is merged
- Deploy staging and Verify zero-to-current pass on the exact resulting main SHA

Do not begin D2 until PERF1 closes.