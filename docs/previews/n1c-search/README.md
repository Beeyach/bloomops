# N1C workspace search preview

Local built Worker, synthetic records only, 14 September 2026. Based on merged main `9763650`; this search slice is not deployed.

[Desktop](search-1440.png), [phone](search-390.png), [narrow phone](search-320.png), [client portal](portal-search-390.png), [loading](loading-1440.png).

Search uses names/titles and existing permission rules for prospects, clients, Tasks, Pages and ready Files. Portal results contain shared Pages and downloadable Files. Queries require explicit submission and remain out of URL history. No private body snippets, persistent recent searches or global counts. More results opens a bounded type view with pagination. The existing official logo, prospect favicon detection and garden SVG fallback are reused.

## Verification

- 65 focused tests pass: search permissions and bounds, Page sharing, workspace sessions and shell guards. No video tests ran.
- `npm run cf:build` passes, including Next build/lint/type validation. No migration or dependency change.
- [45 native/browser assertions](acceptance.json) pass on the built Worker with isolated D1/R2. Real search API, no application table writes, canonical navigation, file bytes, client portal downloads/revocation, keyboard Tab/Enter, pagination, delayed/offline responses, stale-response cancellation and real workspace switching are covered.
- Actual screenshots were inspected at desktop 1440, tablet 768 and phone 390/320; overflow/reachable Search checks also pass at 1024. Fixed tablet duplicate Search controls and missing Files artwork before final captures. Full-page phone captures include the existing fixed bottom navigation at the initial viewport boundary; scrolling allows later rows to remain reachable.
- Page departure and persisted-page restoration are exercised with browser lifecycle events. This is not a claim of exercising Chromium's real back-forward cache eviction or a second browser engine. Membership, role, assignment, contact and inherited Page changes are exercised against real SQLite; client Page grant revocation is also verified through the built API.
- The external design gallery could not be fetched in this run. Committed design guidance, official branding and the actual built screens were inspected instead.

No external provider requests, production/DNS actions, real prospect imports, outreach or original LTB changes. Private session/cookie/fixture material remains outside the repository.

## Measured load

[Before/after measurements](performance.json) compare the accepted main runtime against this final build on equivalent isolated synthetic fixtures. Home/Clients/Work remain at one navigation request, 11/3/7 statements and two D1 invocations respectively. Each cold route fetches ten scripts: 390,649 bytes before and 390,661 after (+12 bytes, webpack route manifest). Search UI code stays route-local. Five retained samples per route/width followed two warm-up rounds. Local medians remain about 62–63ms; these small samples establish no production speedup.

One native all-types Owner request used two D1 invocations: one identity statement plus a six-statement read batch, maximum 38 bindings. Domain role coverage reaches 66 bindings. The original workspace has 229 synthetic prospects; bounded results are not a claim of constant-cost substring scans at arbitrary scale. No index or external search service was added without evidence.

One fresh GPT-5.6 Sol High read-only review found no material findings. The reviewer inspected the diff, canonical predicates/routes and supplied evidence; write-capable/browser harnesses were run by the implementer. No re-review was needed.
