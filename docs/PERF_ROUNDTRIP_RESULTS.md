# Historical Home/Systems round-trip optimization evidence

Preserved from documentation-only commit `88b56ed6661dd0394aa59cab29ce81067f031458`. This describes the original staging run, not a new deployment or integration-branch measurement. See [PERFORMANCE_INTEGRATION.md](PERFORMANCE_INTEGRATION.md) for the clean PR scope and final verification. The historical PERF4 diagnostic runtime is not part of this integration.

## PERF4 D1 round-trip optimization (2026-09-11)

Source tracing found no duplicate layout/page identity read and no N+1 query. React request caching already shares `requireShell` access between the internal layout and page. The first live wait remains the required Better Auth session/user plus active workspace membership read. On Home, the second wait contained the independently authorized Action and Project Client-timezone reads, Waiting/Review Actions and recent Deliverable/File outputs; Overdue/Today Actions, Project summaries and forward Deliverables waited for those timezone results and formed a third wait. Systems similarly placed its two facets plus authorized Project timezones in the second wait, then Project summaries and forward Deliverables in the third.

Application commit `137773bc2b70b322694c33a0c756714c00003833` keeps every authorization-scoped timezone read and every projection predicate fresh. It derives a generic Client-day map from the runtime's canonical IANA timezone list, allowing the scoped timezone validation reads and dependent projections to enqueue together in one request-local native D1 batch. Cached `Intl.DateTimeFormat` objects contain no request, user, membership or business state. If current authorized rows contain a valid legacy timezone alias outside the canonical enumeration, only the affected provisional date projections are discarded and rerun together using the exact scoped timezone rows. Selected-ID Systems facet validation remains sequenced as before. There is no schema, migration, dependency, D2, cross-request auth cache or authorization-policy change.

Actual disposable workerd/D1 checks prove Home remains ten bounded statements but falls from two projection batches to one, and Systems remains five statements but falls from two projection batches to one. Valid `US/Pacific` legacy-alias fixtures preserve the correct Client day through exactly one additional authorized fallback batch. Home passed 35/35 checks at 240 assignments with at most 64 bindings / 13,047 SQL bytes; Systems passed 24/24 with at most 65 bindings / 13,548 SQL bytes. Focused domain tests passed 71/71. The full suite passed 4,832/4,832 with a temporary external `python` to `python3` PATH alias required by five inherited packaging tests. `npm run build`, `npm run cf:build` and `git diff --check` passed.

The exact application candidate was deployed only to `bloomops-staging`; Cloudflare version ID is `9562b510-e68a-43d7-9e95-dda4ac3c7aa4`. `/api/version` returned HTTP 200 with `sha: 137773b`, branch `perf/perf4-d1-roundtrip-optimization`, and build time `2026-09-11T13:00:00.120Z`. No migration or production deployment ran.

Using the existing authenticated Windows Chrome session, one complete Home → Systems → Ads cycle was discarded, followed by ten retained warm cycles per route. Timing begins immediately before the actual navigation-link click and ends when the destination pathname and visible final `h1` are present. No throttling was used. PERF4 baseline and current click-to-visible results are:

| Route | PERF4 baseline | Optimized retained samples (ms) | Optimized median / range |
|---|---:|---|---:|
| Home | 821.9 median; 811.2–828.8 | 844.6, 598.5, 694.7, 595.8, 706.9, 1780.9, 662.6, 769.6, 765.2, 672.0 | **700.8** / 595.8–1780.9 |
| Systems | 775.1 median; 770.0–777.6 | 551.7, 545.7, 565.9, 532.5, 549.6, 618.9, 672.6, 614.6, 621.8, 609.6 | **587.8** / 532.5–672.6 |
| Ads control | 396.1 median; 391.6–397.7 | 355.4, 352.6, 352.1, 357.3, 546.6, 390.1, 373.9, 387.8, 375.7, 378.3 | **374.8** / 352.1–546.6 |

Systems improves materially and all ten retained clicks stay below one second. Home's median improves by 121.1 ms and nine of ten clicks stay below one second, but it remains above the approximately 500 ms target and is not consistently fast. Its 1,780.9 ms outlier had 1,133.2 ms RSC TTFB before the 1,775.8 ms response completion. The Ads control's 546.6 ms outlier similarly had 537.3 ms TTFB, so live edge/network variance remains material. This optimization removes the identified projection round trip, but does not close PERF3/PERF4 or justify D2.
