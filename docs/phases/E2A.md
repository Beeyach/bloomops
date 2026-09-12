# E2A — Content context and Social compatibility

## Objective

Establish explicit production context and safe Ads parent storage inside canonical Content while every existing Content surface remains Social-only. This is the first implementation slice under [E2](E2.md) and [RELEASE_E](../RELEASE_E.md). **CLOSED** through [PR #56](https://github.com/Bloomwired/bloomops/pull/56) on verified `2a73193d23e8e83673153e0e4512ddcae2bb6505`, with staging/zero/live acceptance and 23 migrations; [BUILD_STATE](../BUILD_STATE.md) owns current status.

Start from verified `f2a2bb0c7e665a5bd77cd010544a226c4da934a9`, with 22 migrations. Read the canonical working agreements, E2 identity/containment rules, and relevant current schema, C1–C6 Content/access/File/approval code before editing. Work in the isolated checkout and preserve unrelated original schema/D2/instruction work.

## Owns / excludes

E2A owns one additive migration, canonical schema/snapshot updates, explicit Social discriminators on existing access paths, compatible Social create/retry handling, and focused migration/isolation/regression acceptance.

No Ads create/list/detail UI or endpoint activation, Project-only Content grant, Content workflow change, new File behavior, client visibility, approval operation, metric, provider action, template, configuration dependency or production deployment. E1 Campaign work remains unchanged. Synthetic tests may insert valid Ads rows solely to prove containment and integrity.

## Storage contract

Add these canonical fields to `content_items`, preserving all existing columns and records:

| Field | Storage and invariant |
| --- | --- |
| `productionArea` / `production_area` | Non-null text, default `social`, exact allowlist `social`/`ads`, immutable |
| `adsProjectId` / `ads_project_id` | Nullable Project ID, default null, immutable; null exactly for Social and required exactly for Ads |

Use additive column operations, not a Content table rebuild. A nullable Project reference with a null default can be added using SQLite's supported column syntax; added CHECK constraints must also accept every existing row. Validate the actual migration in native D1 rather than assuming local SQLite establishes deployed compatibility. See [SQLite ADD COLUMN restrictions](https://www.sqlite.org/lang_altertable.html#alter_table_add_column).

The Project ID references `projects.id` with no cascading delete/update. This single-column existence FK is **not** sufficient tenant integrity: additional database guards must prove the exact same workspace/Client/Service Project tuple on Ads insertion, including a non-null Service with the current canonical Ads department relationship. Existing Content Client/Service composite FKs remain intact.

Required database defenses:

1. A paired context check forbids Social with a Project, Ads without a Project and unknown/null production areas. Add the area column before the Project column/check so legacy rows obtain valid defaults.
2. Preserve `content_items_identity_immutable` and add an immutable-context guard covering area and Ads Project. Raw SQL cannot reclassify or move existing Content, even while still at Idea.
3. Recreate the existing **same-named** `content_items_social_service` insert trigger with its existing Social validation conditional on `production_area='social'`. Add a distinct Ads insert guard for the exact eligible Project tuple. Do not replace the old trigger with a new name: the current zero verifier inventories historical trigger names.
4. Prevent raw Project workspace/Client/Service identity changes while Ads Content references that Project. A nullable single-ID FK alone cannot preserve the composite relationship when parent columns change. Project deletion must remain FK-protected. Do not change unrelated Project edit/lifecycle behavior.
5. Service Type department reassignment remains allowed and does not rewrite Content identity or history. It revokes current eligibility through live reads. It must never make an Ads record become Social, including for the portal. Catalog/Service lifecycle does not imply production-area conversion.
6. Preserve all existing Content/platform/File/approval immutability and freeze triggers, request uniqueness, foreign keys and existing data. Do not disable foreign keys, write `sqlite_schema`, delete rows, reset ledgers or edit prior migrations.

Add only indexes justified by area/Project reads, initially workspace+area+createdAt+ID and workspace+AdsProject+createdAt+ID. Preserve existing indexes used by Social. Generate with the repository command, inspect SQL/snapshot/journal, then adjust generated SQL to the supported additive form while keeping the final schema equivalent. The next available migration number is expected to follow `0021`; inspect the actual journal before naming it. No migration is created during contract preparation.

## Existing application paths stay Social-only

`contentReadCondition` and `contentClientReadCondition` must explicitly require `production_area='social'` and null Ads Project. Apply row predicates in queries that actually have a Content row; `contentParentCondition` also serves Client-root creation/options queries and cannot blindly reference Content columns there.

All current creation paths remain Social and explicitly bind both new fields in the insertion values. `createContent` constructs a SELECT for every schema column using `getTableColumns`; leaving values undefined can break creation despite SQL defaults. No body/query field may choose production area or Ads Project. Preserve exact existing Social response allowlists and UI behavior; keep new routing fields internal to the domain until the Ads interface needs them.

Keep immutable legacy creation receipts valid. If new Social receipts include context, absent context on old receipts normalizes to Social/null for comparison. Do not rewrite old activity JSON, change the existing Client-scoped request key, or treat an Ads collision as a successful Social retry. Return no identifier or receipt from an unreadable record.

Inspect and test every caller below rather than assuming one helper change covers everything:

| Boundary | Minimum caller set |
| --- | --- |
| Content list/detail/create/edit | `content.mjs`, `content-api.mjs`, Social pages and current Client/Service creation routes |
| Pipeline/platform/calendar | `content-pipeline.mjs`, `content-platforms.mjs`, `content-calendar.mjs`, their helpers and routes |
| Files | `content-file-access.mjs`, `content-file-api.mjs`, `content-files.mjs`, `content-file-activity.mjs`, generic File-family download dispatch; bytes/retry/archive/visibility paths |
| Approval/portal | `content-approval-access.mjs`, `content-approvals.mjs`, `portal-content.mjs`, recording requests and portal navigation/approval inbox |
| Aggregate history | `client-activity.mjs` and any Content event/subject projection; count/facet/overflow queries |

An Ads fixture must remain unavailable in every current path even when its Service is subsequently moved to Social. Existing clients, sessions and Social grants remain valid; no caller receives a new Project grant in E2A. Sharing an Ads Project in the Work portal still grants no Content, recording, File or approval access through these paths.

## Migration rollout and compatibility

E2A introduces compatible storage and containment before Ads creation exists. Verify that the prior E1 application's explicit Social insert shape still succeeds after migration, using defaults, and that the E2A application also creates/edits/retries Social Content correctly. New-schema code runs only after migration, following the existing staging workflow.

Do not activate E2B or seed remote Ads records before the E2A version is accepted and deployed. After E2B creates Ads records, an old pre-E2A application is not an assumed safe rollback target: it lacks explicit area containment if departments later change. Use the accepted E2A version as the minimum compatible application fallback; no destructive down-migration is part of this work.

## Acceptance and closure

- **Additive upgrade:** apply all existing migrations to a disposable database, populate representative Social records at different stages plus platform links, Files, open/terminal approvals and immutable events, then apply E2A. Existing values/IDs/revisions/timestamps/receipts/links remain identical, with only Social/null context defaults added. Old triggers and foreign keys still enforce their rules.
- **Raw database invariants:** reject invalid area/Project pairs; absent, foreign-workspace, wrong-Client, wrong-Service, service-less and non-Ads Projects; context changes; referenced parent reparent/delete; and Social creation against an Ads Service. Accept a valid Ads fixture. Verify allowed department reassignment does not reclassify data.
- **Cross-area containment:** for every role, including Owner/Admin, neither ordinary nor guessed-ID Social APIs expose or modify Ads fixtures. Cover list/calendar/platform/pipeline/Files/activity/facets/overflow and all Client portal/recording/approval paths. Test department reclassification, restricted parent/child, revoked membership/contact/assignment and old loaded actors. Check serialized bodies and denied byte downloads, not only empty UI lists.
- **Social compatibility:** verify service-less and Service-bound Social, existing `ad_creative` records, original roles/restricted grants, platform edits, workflow transitions, current recording uploads, immutable approval snapshots/responses/withdrawals and create/edit/retry concurrency. Open Social approvals survive migration and can still resolve afterward. A failed batch changes no Content or activity.
- **Migration/native:** run focused schema/migration/access/HTTP tests, full Node suite for this shared-table change, native disposable D1 upgrade/fresh/repeat checks and affected D1/R2 file/approval harnesses. Check actual journal/snapshot consistency and update only tests/verifiers whose expected current migration count changes. No weakening safety checks or ignoring trigger failures.
- **Build/browser:** Cloudflare build and a real local Worker regression walkthrough covering Social creation, edit, transition, File access and portal approval/recording, plus denied Ads fixture IDs. There is no new UI design surface; reuse existing browser harnesses rather than inventing a new styling suite. E1 remains reachable and unchanged.
- **Review/publication:** one fresh read-only Sol High implementation review after verification, with at most one focused re-review if findings cause fixes. Publish within standing authorization only after local acceptance; verify exact merged-source staging, zero-to-current and live schema identity before closing E2A. Update BUILD_STATE/INDEX and implemented DOMAIN_MODEL facts with evidence and any limitations.

Planning preparation alone requires source/link/diff checks and self-review under the usage-aware policy. It does not satisfy these implementation gates or authorize calling E2A complete. No user decision or credential currently blocks the E2A implementation contract.

## Closure

Implemented and deployed as `2a73193`; `0022_e2a_content_context` is the 23rd migration. Full Node acceptance, 73 affected review-fix tests, 224 native D1/R2 checks, final fresh/repeat verification, Cloudflare build and 145 browser/HTTP checks /53 captures pass. One Sol High review and one focused re-review resolved the Ads replacement-identity finding. Exact-SHA staging `34707425150` and zero-to-current `34707425223` passed; live staging identity/schema match. BUILD_STATE records the full evidence and downloaded-log limitation. No Ads creative activation or production change. The [E2B implementation](E2B.md) is now CLOSED through PR #57 on verified `09de9d6`, with exact-SHA release gates passed; E3A foundation acceptance is underway.
