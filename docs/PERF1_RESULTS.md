# PERF1 navigation performance evidence

Implementation is ready for independent audit. PERF1 is **not closed**: authenticated staging improvement, independent audit, merge and both gates on the exact resulting main SHA remain outstanding. D2 remains blocked.

## Baseline and method

Exact base: `e5bc81630c47fb6eb51e9bdc6be1687947683643`, the closed D1 merge. Read-only GitHub checks verified PR #31 merged and Deploy staging `34496059835` / Verify zero-to-current `34496059875` succeeded on that SHA. Baseline application content is byte-identical to the previously built, verified D1 head `b3e4ef3`; the two intervening PERF1 branch commits contain documentation only. Measurements preceded application changes.

The actual built OpenNext Worker ran in local workerd/Miniflare with repository D1/R2 bindings. A local-only wrapper records D1 call count, start/duration, classification, binding count, SQL length, response availability and body completion. It records neither SQL nor bound values, cookies, tokens, row payloads or private content. The wrapper is absent from the deployed entrypoint/configuration. It can inject a fixed delay before each D1 call; concurrent calls overlap. This models round-trip sensitivity, **not Cloudflare regional placement, remote D1 scheduling or production CPU**.

An isolated synthetic workspace contains 12 Clients, 24 Projects, 72 Milestones, 240 Actions, 72 Deliverables and 48 Content Items. It uses actual issued local magic-link sessions with the development R2 mailbox. Timing uses Owner; separate actor probes use Admin, Team Member and Client. The Team member has 24 Project assignments. Baseline and after runs reuse the same fixture.

Chromium at 1440 × 900 clicks actual main-navigation links and the canonical Project link from Systems. Each run contains 10 rounds per route; the first two are discarded, leaving **eight warm samples per route**. Four runs cover baseline/after at 0 and 100 ms injected D1 delay: 280 navigations including warmups. No browser CPU or network throttling is applied. Click-to-visible starts at the DOM click event and ends after the destination's visible completed heading/detail marker and two animation frames. It does not measure the click automation's preparatory wait. The native Project document navigation preserves only a measurement timestamp across documents. Browser resource/response timing and Worker traces distinguish initial response from completed streamed content. Discarded warmups are retained in the evidence; they are not a controlled isolate cold-start study.

[Machine-readable samples](evidence/PERF1_navigation.json) contain every navigation, actor probe and public staging request, including warmups. Full local traces, logs and screenshots are at `/home/ary/.cache/bloomops-perf1/`; session files are outside Git with mode 0600. The old preliminary `before-*` files used a different inherited fixture; the tables below use only `baseline-*` and `after-*` with the representative PERF1 fixture.

## Local click-to-visible results

All timings are milliseconds: **median (minimum–maximum)** over eight retained samples. Query counts are deterministic across those samples and include identity, membership, actor and page reads for the navigation.

| Route | Baseline, no injected delay | After, no injected delay | D1 calls before → after |
|---|---:|---:|---:|
| Home `/` | 109.30 (93.60–126.70) | 94.95 (94.10–95.30) | 18 → 14 |
| Clients `/clients` | 61.85 (60.40–62.20) | 62.80 (62.40–63.30) | 7 → 4 |
| Work `/work` | 160.35 (147.90–214.20) | 128.00 (121.70–157.30) | 11 → 8 |
| Social `/social` | 76.85 (70.40–91.30) | 61.90 (53.70–78.40) | 8 → 6 |
| Systems `/systems` | 78.70 (77.90–93.90) | 79.00 (77.70–79.50) | 10 → 8 |
| Team `/team` | 61.95 (56.60–78.00) | 62.65 (61.90–79.00) | 6 → 4 |
| Project detail | 117.20 (93.00–202.50) | 89.65 (84.50–103.50) | 19 → 15 |

All top-level medians remain comfortably below 200 ms. Sub-millisecond differences on Clients, Systems and Team are within frame/scheduling noise; their server work still falls. The earlier D1 re-audit Work median of 76.75 ms used a smaller fixture, so it is not a like-for-like baseline for the representative 240-Action workspace. The paired Work measurement improves from 160.35 to 128.00 ms.

| Route | Baseline, 100 ms per D1 call | After, 100 ms per D1 call | Median reduction |
|---|---:|---:|---:|
| Home | 694.20 (678.20–694.90) | 477.70 (476.30–495.50) | 216.50 |
| Clients | 778.75 (762.30–779.00) | 362.30 (358.10–364.40) | 416.45 |
| Work | 724.35 (715.20–758.90) | 431.45 (415.60–436.50) | 292.90 |
| Social | 878.35 (878.00–894.50) | 478.05 (460.90–481.20) | 400.30 |
| Systems | 779.15 (778.40–795.60) | 578.70 (577.80–579.30) | 200.45 |
| Team | 570.75 (560.00–579.10) | 362.45 (361.60–363.00) | 208.30 |
| Project detail | 1091.10 (1084.30–1105.20) | 597.75 (587.80–632.90) | 493.35 |

The 100 ms figures are a controlled experiment, not staging timings or a sub-500 ms staging claim. Systems and detail still exceed 500 ms in this experiment because dependent authorized page reads remain.

## Proven application costs and corrections

1. **Identity and actor preparation were unnecessarily serial.** Better Auth performed separate session and user D1 reads. Its installed 1.7.2 Drizzle adapter supports joined reads; `advanced.database.joins` now reads both current records in one call using ORM relationship metadata for existing foreign keys. Cookie caching stays disabled. Owner additionally loaded explicit capabilities even though its existing policy already grants every capability; that query is removed. Owner preparation falls from four serial calls to two. Admin falls from four to three. Team previously loaded capability, Project, Client and Service assignments serially after identity/membership; these independent current-truth reads now overlap. Its seven calls become six with three sequential stages. Client contact loading remains current and its total falls from four to three.
2. **Clients used three sequential page reads.** Counts and rows now overlap, and the current primary contact joins the Client rows with both workspace and Client keys. The existing partial unique primary-contact index guarantees one joined row per Client. DTO fields and authorization scope stay the same; the third call disappears.
3. **Non-date Action views loaded an unused timezone map.** `all`, `mine`, `waiting` and `review` do not use the SQL date predicate. Only `overdue`, `today` and `upcoming` load its timezone map. Every returned Action still computes overdue using its own Client timezone. This removes two calls from Home and one from the default Work page, in addition to shared access savings.
4. **Social option loading had avoidable serial dependencies.** The authorized list and options now overlap; independent Client/Service option reads overlap. Member choices remain gated on eligible parents. Invalid filters retain the no-options error path.
5. **Project metadata and body repeated the same Project read.** Both now use one React request-local cached authorized read. The next render/request constructs a fresh result. Independent Project option reads also overlap. Detail drops one duplicate page read and the unused Action timezone read, plus two shared Owner reads.

The existing shell's request-local deduplication was working; no duplicate layout/page actor load was found. No global authorization cache, route static output, spinner, loading boundary, prefetch policy, UI or navigation component was changed.

For the 100 ms experiment, median completed Worker body time falls from 731 to 319.5 ms for Clients, 840.5 to 428.5 ms for Social, and 1057 to 564 ms for Project detail. Top-level RSC first-byte time remains about 5 ms while completed content takes hundreds of milliseconds: initial response timing alone hides the database waits. After optimization, the difference between median body completion and median visible commit is about 34–61 ms (including the deliberately measured two frames), not a two-second hidden commit delay. Home produced data-independent prefetch responses with zero D1 reads; the subsequent protected content request still rechecked identity and membership. No measured evidence justified changing prefetch or streaming behavior.

The issued-session `/api/bloomops/me` probes isolate actor preparation. Each role has five requests with the first discarded, leaving four samples at 100 ms injected D1 delay:

| Role | Baseline median (range) | After median (range) | D1 calls before → after |
|---|---:|---:|---:|
| Admin | 424.55 (423.34–426.46) | 322.02 (321.35–322.26) | 4 → 3 |
| Team Member | 734.03 (733.02–736.40) | 328.70 (327.46–329.59) | 7 → 6, actor calls overlap |
| Client | 424.80 (422.58–429.91) | 318.66 (317.83–319.62) | 4 → 3 |

## Deployed-path evidence and remaining uncertainty

No safe already-issued authenticated staging browser session was available. No real email was sent and no production data or resources were changed. The safe deployed measurement is read-only public GETs against the existing D1 staging build, from this execution environment, with Cloudflare's response indicating MIA. Each path has 10 requests, two discarded warmups and eight retained samples. These are fetch-to-body-completion timings, not browser click-to-visible:

| Public staging path | Status | Median (range), ms |
|---|---:|---:|
| `/api/version` | 200 | 260.95 (257.52–271.04) |
| `/api/health` | 200 | 736.32 (716.49–739.34) |
| `/sign-in` | 200 | 271.67 (265.88–500.55) |
| anonymous `/systems` | 307 | 252.09 (250.29–257.05) |

Source inspection shows health performs two sequential D1 reads while version performs none. Its roughly 475 ms additional median supports the inference that database access contributes materially to this deployed path. It does **not** directly measure individual D1 latency, database region, placement, queueing, isolate cold starts or authenticated route cost. Public paths indicate a roughly 250 ms request floor from this environment. The controlled local experiment proves avoidable application round trips amplify database latency; it cannot establish the user's exact two-second delay or prove all remaining remote latency is external to BloomOps.

Authenticated staging before/after confirmation remains required after deployment to an approved environment. Use the read-only browser runner with a safely supplied staging storage-state file and an accessible Project ID, retain identical warmups/sample counts and compare completed content rather than only TTFB. Do not enable session/cookie caching, D1 replicas or change placement based on this approximation alone. D2 remains blocked until PERF1's audit, merge, exact-SHA gates and staging exit conditions are satisfied.

## Verification

| Check | Result |
|---|---|
| Full `npm test` | 4,762/4,762 pass; no failures, skips, cancellations or TODOs |
| Focused auth/authorization/new performance regression | 39/39 pass; new regression is 5 tests |
| Affected Clients/Actions/Content/Projects/new regressions | 904/904 pass |
| Shared Service/auth/membership/shell/Client/B1–B7 regressions | 1,098/1,098 pass |
| Release C regressions | 665/665 pass |
| D1 Systems and schema regressions | 84/84 pass (62 + 22) |
| `npm run build`; `npm run cf:build` | Both pass |
| `npm run db:domain:generate` | No schema change, nothing to migrate |
| `scripts/auth-smoke-local.mjs --url http://localhost:8787` | 144/144 pass against ordinary built Worker |
| `.github/scripts/verify-staging.mjs --url http://localhost:8787 --expect-env development` | 21/21 pass |
| `.github/scripts/verify-zero-remote.mjs --local` | 22/22 pass; both migration ledgers and schema identical on second run |
| `scripts/systems-smoke-local.mjs` | 23/23 pass; 240 assignments, six projection queries, at most 65 bindings / 13,419 SQL bytes |
| `scripts/projections-smoke-local.mjs` | 34/34 pass; 240 assignments, 12 Home projection queries (previously 14), at most 64 bindings / 12,918 SQL bytes |
| `scripts/release-b-smoke-local.mjs`; `scripts/release-c-smoke-local.mjs` | 86/86 and 29/29 pass in disposable workerd/D1/R2 |
| `scripts/navigation-review-local.mjs` | 87 checks, 70 screenshots: all seven routes at 1440/1024/768/390/320 with JavaScript on and off; next-request Project metadata/body revocation; no browser errors |
| `scripts/systems-review-local.mjs` | 122 checks, 47 screenshots: native no-JS filters, visible completed data, keyboard/focus, reduced motion, touch, five widths, issued-session revocation |
| Changed JS/JSX syntax | All 16 files pass Node syntax / esbuild JSX parsing |
| Whitespace and exact dependency/DDL/config diff | `git diff --check` clean; packages/lock, DDL, migrations/snapshots, Drizzle/Next/OpenNext/Worker config, environment types and workflows unchanged |

The full test command uses this environment's existing Python alias via `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test`; browser commands use its external Playwright installation, with Chromium shared libraries in `LD_LIBRARY_PATH=/tmp/bloomlab-webhook-browser-wraMkD/libs/usr/lib/x86_64-linux-gnu`. No dependency changes were needed. Desktop Clients and narrow no-JS Project captures were also visually inspected. Existing design controls and the absence of a Systems loading boundary are preserved.

The five new tests use real migrated SQLite/D1 queries, Better Auth and issued cookies. They prove session deletion, current user updates, membership suspension/removal, independent Client/Service/Project unassignment, Admin/Team capability revocation, portal child/Project visibility and Client contact unlinking take effect on the next protected request. Foreign/missing IDs remain indistinguishable; Department membership and Project ownership grant no access. Existing shared/Release C/runtime tests continue to prove broader tenant boundaries, portal allowlists and stale actor denial. Browser verification additionally exercises the request-local Project metadata cache across unassignment.

`lib/bloomops/schema.mjs` adds **ORM relationship metadata only**, describing existing auth foreign keys. It changes no table, column, index, DDL or migration. The Better Auth join option is a narrowly scoped application setting, supported by the installed [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle) and [database configuration](https://better-auth.com/docs/concepts/database). No infrastructure, dependency, deployment, production or Leadsthatbloom mutation occurred. No future Systems functionality was added.

## Reproduction

Use a current migrated development database and a built Worker. For a fresh disposable local checkout, run the existing local schema, inherited migration and domain migration commands before building. Preserve this branch's measurement scripts in a temporary checkout of the exact base to reproduce the baseline; its database schema is identical. Run previews serially on port 8787 and reuse the same synthetic fixture and local D1/R2 persistence across baseline/after measurements.

```sh
npm run cf:build
node scripts/navigation-perf-local.mjs
```

In another terminal, create the synthetic fixture once, then obtain its Project ID from the generated `fixture.json`. It generates development mail only. Supply the directory containing the existing Playwright installation via `--playwright` if different:

```sh
node scripts/navigation-perf-fixture.mjs --out /tmp/bloomops-perf1-fixture
node scripts/navigation-perf.mjs --storage-state /tmp/bloomops-perf1-fixture/owner-state.json --project PROJECT_ID --out /tmp/bloomops-perf1-zero
node scripts/navigation-review-local.mjs --fixture /tmp/bloomops-perf1-fixture
```

Stop the preview and restart it with `--d1-delay-ms 100`, then rerun the same measurement command into a different output directory. Repeat with the other application build and unchanged fixture. The fixture generator issues four normal local sessions and respects the real login throttle; if rate limited, allow the ordinary throttle window to expire. Do not weaken rate limiting for measurement.

For a public staging sample, `node scripts/navigation-perf-public.mjs` prints sanitized JSON and cannot authenticate or send mail. For authorized authenticated staging measurement, the browser runner accepts `--url https://bloomops-staging.cool-sunset-2169.workers.dev` with an explicit existing storage-state file and Project ID; it performs navigation only. Do not commit storage state or expose credentials in reports. Independent review should rerun the full verification against the PR's final exact head.
