# PERF2 independent audit

**AUDIT RESULT: PASS**

Audited on 2026-09-10 PDT. The exact target was PR #33 at implementation head `209ebde0bd96bcca452192ab2393cea3ce60e572`, against base `d0533cb9a7b3646134cbc194767af669c75f5adf`. At the final provenance check the PR was open, not a draft, unmerged, based on `main`, and still pointed at the audited head.

## 1. Merge recommendation

PR #33 may be merged only if its head is still exactly `209ebde0bd96bcca452192ab2393cea3ce60e572`.

The implementation safely reduces protected-navigation D1 invocation count and reduces sequential D1 depth on the three claimed routes without changing current-truth authorization, tenant isolation, query bounds, no-JavaScript output, or Drizzle result mapping. PERF2 remains operationally open until post-merge **Deploy staging** plus **Verify zero-to-current** pass on the exact merge SHA and the user retests signed-in staging successfully. D2 must not begin before those gates pass.

## 2. Findings

None.

No correctness, security, tenancy, result-mapping, boundedness, schema, dependency, or deployment blocker was found. No implementation correction is recommended from this audit.

## 3. Fresh verification

- Full repository tests: **4,769/4,769 passed**, 0 failed, skipped, or todo. The first host run was 4,764/4,769 because this machine had `python3` but no `python` executable; all five failures were inherited packaged-skill ZIP checks failing to spawn `python`. A temporary executable alias outside the repository was used for the clean rerun; no production behavior or repository file was changed to accommodate it.
- Broad affected regression selection: **846/846 passed**.
- Exact new PERF2 test files: **12/12 passed**: navigation/auth performance 6, read batching 3, and metrics 3.
- Built Worker auth/runtime smoke: **144/144 passed**.
- Local external verifier: **21/21 passed**. Its first attempt safely stopped on the normal auth rate limiter (`429`); a later unweakened rerun passed.
- Local zero-to-current verifier: **22/22 passed**, including 18 BloomOps domain migrations and 60 inherited migrations on a fresh database plus the current-schema no-op path.
- Actual workerd/D1/R2 smokes: Systems **23/23**, projections **34/34**, Release B **86/86**, and Release C **29/29**.
- Browser acceptance: navigation **87/87**, with 70 screenshots over seven routes, five widths (`1440`, `1024`, `768`, `390`, `320`), and JavaScript enabled/disabled; Systems **122/122**, with 47 screenshots and the same five widths. Completed destination content—not an early shell—was required. There were no hydration/runtime errors or horizontal overflow.
- Changed JavaScript/JSX syntax: **25/25 files passed**. `npm run build`, `npm run cf:build`, and `git diff --check` passed.
- Independent adapter probes also passed for short/null/undefined/failed batch results, native rejection, no retry, empty rows, boolean/timestamp/text decoding, writes taking the normal path, a failed second 32-statement chunk, separate D1 bindings, and reversed unordered-select behavior.

The checked-in `docs/evidence/PERF2_navigation.json` was independently parsed and recomputed: 672 browser samples, 672 completed request samples, 3,984 invocation timings, 336 local SQL rows, and 40 public-probe rows. Every distribution, statement/invocation/depth vector, warmup exclusion, response status, body-completion flag, and no-prefetch assertion matched. Its SHA-256 is `40fcdd18db10e865c39289af8b95ec6c8ac30a68afbb1694fd5efae2e1db870b`. The independently recomputed application-diff fingerprint is `c6220231ad4d5e5385adae0abc38dedc0aab804c226dcebb9e3d66aa8318898e`, matching the evidence.

## 4. Batching-layer correctness

The adapter in `lib/bloomops/read-batch.mjs:11` creates a private Drizzle D1 session and queue for one awaited composition. Its symbol guard only affects nesting on that private session; it neither patches the shared database nor stores results or authorization state globally. A microtask flush and a 32-statement native-batch cap bound current call sites, while dependencies awaited by the caller naturally form later invocations.

Only prepared selected-field `SELECT ... all()` operations are intercepted (`lib/bloomops/read-batch.mjs:42`). Writes, custom mappers, unsupported methods, non-D1 databases, and calls outside the composition use their normal implementation. There is no retry path. The native batch is mapped by statement position; an incorrect result count, a failed/undefined/null result, or a rejected batch rejects the affected readers instead of trusting partial output.

The positional `bo_cN` CTE aliases prevent D1 object-row key collisions while retaining the original SQL, placeholders, predicates, ordering, limits, and Drizzle field decoder. Fresh tests covered duplicate column names, aliased/nested objects, nullable joins, booleans, millisecond timestamps, text/numeric values, JSON custom decoding, CTEs, ordering, limits, and prepared placeholders. A read-only SQLite run with `reverse_unordered_selects` enabled also preserved the tested ordered result.

The only production call sites are finite page/read compositions in `lib/bloomops/authorization.mjs:307`, `lib/bloomops/clients.mjs:402`, `lib/bloomops/systems.mjs:59`, `lib/bloomops/work-projections.mjs:148`, `app/(internal)/social/page.jsx:13`, `app/(internal)/team/page.jsx:39`, `app/(internal)/work/page.jsx:22`, and `app/(internal)/work/projects/[id]/page.jsx:41`. No N+1 loop or cross-request queue was found. Fresh stress traces stayed at no more than 37 bindings per statement, well below D1's limit, and checked-in evidence stayed within 100 bindings and 100,000 SQL bytes. The seam also passed the built Worker and actual workerd/D1 smokes, rather than only SQLite mocks.

## 5. Security and tenant isolation

Authorization remains server-side and current on each protected request. Session identity and active membership are still serial prerequisites before the actor-support batch. Page batching receives a current actor, and each private query retains workspace, assignment, visibility, and capability predicates in SQL.

Fresh issued-session tests covered session deletion/invalidity, membership suspension and removal, Client assignment removal, Service assignment removal, Project assignment removal, Admin and Team capability removal, Project and child visibility restriction, and Client-contact unlinking. They also covered foreign-workspace isolation, identical guessed/missing-ID 404s, Department-only and Project-owner-only non-grants, narrow Team scope, and next-request Project metadata/body revocation. The concentrated cases are in `tests/bloomops-navigation-performance.test.mjs:33`, `:46`, `:59`, `:84`, `:98`, and `:108`; the broader auth, HTTP, portal, Release B/C, and browser suites supplied independent overlap.

Specific changed paths remained equivalent:

- Live actor capabilities and three assignment scopes batch only after current identity/membership resolution; they are not cached.
- `authorizeProject()` reuses the live authorized Project DTO but reevaluates `projectReadCondition()` in SQL, so an earlier actor or React request memo cannot bypass an assignment revocation (`lib/bloomops/projects.mjs:140`).
- Home keeps separate Action and Project timezone scopes, so Action-only access does not widen Project visibility (`lib/bloomops/work-projections.mjs:148`).
- Social parent-directory eligibility moved into an authorized SQL predicate; unreadable parents do not leak through rows, counts, facets, options, or overflow state (`lib/bloomops/content.mjs:181`).
- An unfiltered Systems read no longer waits on facets, but every data query retains live Systems and Project-read predicates. Selected filters are still validated before use (`lib/bloomops/systems.mjs:35` and `:59`).

Portal DTO allowlists and Better Auth cookie/session-cache behavior did not change from the audited base. No protected stale output or load-then-client-filter authorization was introduced.

## 6. Performance methodology and result

The independent comparison rebuilt both exact SHAs separately. The base worktree contained the exact base application source; only the candidate's local measurement wrapper/helper were overlaid. Base and candidate used the same isolated synthetic D1 database and issued sessions. Each block ran sequentially for 12 rounds, excluded two warmups, retained ten samples per route, disabled prefetch, and waited for completed destination content plus two animation frames.

Statement, invocation, and observed sequential-depth vectors were exact at both scales and delays:

| Route | SQL statements, base -> candidate | D1 invocations, base -> candidate | Sequential depth, base -> candidate |
| --- | ---: | ---: | ---: |
| Home | 14 -> 12 | 14 -> 4 | 4 -> 4 |
| Clients | 4 -> 4 | 4 -> 3 | 3 -> 3 |
| Work | 8 -> 8 | 8 -> 3 | 3 -> 3 |
| Social | 6 -> 6 | 6 -> 3 | 4 -> 3 |
| Systems | 8 -> 7 | 8 -> 4 | 5 -> 4 |
| Team | 4 -> 4 | 4 -> 3 | 3 -> 3 |
| Project detail | 15 -> 14 | 15 -> 4 | 5 -> 4 |

Fresh zero-delay completed-content timings are median/p95 milliseconds:

| Route | Representative, base -> candidate | Stress, base -> candidate |
| --- | ---: | ---: |
| Home | 111.35/111.80 -> 94.40/94.90 | 144.00/178.20 -> 110.65/128.10 |
| Clients | 78.85/95.40 -> 79.10/95.70 | 127.85/143.40 -> 112.25/144.70 |
| Work | 181.75/243.10 -> 180.45/215.90 | 203.70/273.50 -> 194.25/239.40 |
| Social | 143.60/225.10 -> 127.90/176.40 | 143.90/160.10 -> 134.65/158.40 |
| Systems | 127.70/143.80 -> 126.90/143.10 | 136.35/160.50 -> 128.00/160.10 |
| Team | 76.65/77.80 -> 61.45/76.60 | 61.90/78.70 -> 74.00/77.90 |
| Project detail | 178.15/428.60 -> 162.20/178.50 | 178.05/310.30 -> 153.50/178.00 |

The controlled 100 ms-per-D1-invocation sensitivity experiment produced these median/p95 completed-content timings. These are **not staging evidence**:

| Route | Representative, base -> candidate | Stress, base -> candidate |
| --- | ---: | ---: |
| Home | 495.20/528.00 -> 495.20/512.10 | 511.45/511.60 -> 511.55/512.00 |
| Clients | 379.00/396.00 -> 379.30/395.50 | 412.40/428.60 -> 412.35/429.20 |
| Work | 478.40/494.80 -> 470.30/510.50 | 510.90/543.20 -> 494.00/510.60 |
| Social | 544.25/625.70 -> 436.35/508.20 | 544.45/592.20 -> 444.45/477.40 |
| Systems | 626.50/708.50 -> 526.10/544.30 | 635.20/660.80 -> 527.00/545.80 |
| Team | 375.15/378.90 -> 376.50/378.20 | 377.30/378.50 -> 369.35/378.80 |
| Project detail | 678.35/711.70 -> 545.90/578.20 | 678.40/706.00 -> 560.50/611.80 |

This supports a real one-round-trip sensitivity benefit for Social, Systems, and Project detail. Home, Clients, Work, and Team retain the same sequential depth; their lower invocation counts are a capacity/request-count improvement and are **not** claimed here as a user-visible remote-latency improvement.

## 7. Representative and stress scale

The representative fixture contained 50 Clients, 100 Projects, 300 Milestones, 1,000 Actions, 300 Deliverables, 250 Content Items, 200 file-metadata rows, and 100 Project assignments. The exact 3x fixture contained 150/300/900/3,000/900/750/600/300 respectively. Both included real Client contacts, Project assignments, Action ownership, Social/Systems service relationships, and Client timezones; assignments were used by route authorization and were not decorative row-count padding.

UI limits, pagination/overflow behavior, and SQL/binding bounds remained stable. On the stress fixture, candidate read-only SQLite SQL medians/p95 were: Home 19.538/20.128 ms, Clients 0.401/0.663, Work 28.910/29.638, Social 3.717/4.324, Systems 9.130/9.547, Team 0.042/0.048, and Project detail 2.601/2.852. The largest single statement was 7.837 ms. Query-plan review found indexed searches on the scoped hot reads; the remaining scans were bounded batch CTE/`json_each` work or bounded Social option-directory scans. No scale cliff or migration-worthy plan regression appeared.

## 8. Staging evidence

Authenticated candidate staging was **not** measured and the user's Philippines experience is therefore still unverified. No magic-link email was sent, no cookie or token was requested, and auth was not weakened.

Public probes only showed that the currently reachable deployment served base SHA `d0533cb`, not the candidate. Over eight retained samples from the client edge reported as SJC, medians/p95 were `/api/version` 207.87/228.39 ms, `/api/health` 560.25/575.07, `/sign-in` 219.40/254.27, and anonymous `/systems` redirect 204.30/337.27. Those probes cannot attribute Worker execution placement, D1 serving placement, authenticated query depth, or candidate behavior, and are not evidence that the staging problem is solved.

## 9. Schema, dependencies, and infrastructure

The exact diff from base for `package.json`, `package-lock.json`, schema, migrations, Drizzle config, Next/OpenNext config, Wrangler config, and workflows is empty. No hidden DDL, migration, dependency, storage, auth, queue, deployment, or workflow change exists.

The installed stack used Drizzle 0.45.2, Next 15.5.25, OpenNext 1.20.6, and Wrangler 4.129.0. Current Cloudflare Workers D1 types and official D1 batch semantics were checked independently; the adapter's use of ordered prepared-statement results matches them. `npm audit` reports 53 inherited advisories (1 low, 43 moderate, 9 high, 0 critical), but the lockfile is identical to base, so PERF2 adds zero dependency advisories.

## 10. Remaining uncertainty

- The candidate has no authenticated remote staging measurement, particularly none from the user's Philippines path. Actual client-edge, Worker-execution, D1-serving placement, and end-to-end benefit remain post-merge operational questions.
- The adapter intentionally touches a small Drizzle 0.45 internal preparation seam. It is covered against current local, built Worker, actual workerd/D1, and current type/API behavior, but must be retested on a Drizzle upgrade.
- The positional CTE wrapper passed ordering tests, including SQLite reversed-unordered-select mode, but preserving this contract should remain an explicit upgrade regression.
- Synthetic 100 ms delay and local SQLite/workerd data isolate round-trip sensitivity; they do not predict the user's exact remote latency.
- Ten retained samples make p95 equal the retained maximum. The raw ranges were checked, but post-merge remote sampling should be longer if the user's result remains ambiguous.
- Existing dependency advisories remain repository risk outside the unchanged PERF2 diff.

## 11. Final next action

Recheck that PR #33 is still open and its head is exactly `209ebde0bd96bcca452192ab2393cea3ce60e572`, then obtain user approval to merge. After merge, run **Deploy staging** and **Verify zero-to-current** against the exact merge SHA. Only after both pass should the user retest signed-in staging and, if safely available, collect authenticated completed-content measurements. Keep PERF2 open and D2 blocked until those steps succeed.
