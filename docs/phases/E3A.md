# E3A — Review media evidence and compatibility foundation

## Status and objective

Implementation contract prepared on 2026-09-12. Start from accepted `09de9d61d419add9a9e85d8e5e933936b5561154`, 23 migrations. Follow [E3](E3.md), [RELEASE_E](../RELEASE_E.md) and [BUILD_STATE](../BUILD_STATE.md). E3A implementation and local acceptance are complete in the isolated checkout. One fresh Sol High review and one focused re-review resolved the requested-round replacement finding. Additive migration 0023 and scoped compatibility/retention changes await exact-source publication gates; they are not yet deployed.

Establish immutable ordered media evidence within canonical Content review revisions while all active approval request/response/portal paths remain Social-only. Existing E2B internal creative workflows and shared Work/Social storage keep working. E3A must be verified and deployed before E3B creates Ads review rounds or exposes selected media.

Use the isolated execution checkout. Preserve original D2/schema/instruction work and branch. Astra High is owner-confirmed and appropriate; one fresh read-only Sol High implementation review applies after local acceptance, with at most one focused re-review. This planning-only document needs self-review, not a new reviewer.

## Additive storage contract

Add a reviewed, ledgered domain migration after `0022_e2a_content_context` (inspect the actual journal before naming it; `0023` is expected). Generate with the repository's Drizzle command, review SQL/snapshot/journal, then adapt to supported additive SQL. Do not rebuild Content, Files, review revisions or rounds. Preserve prior migrations and historical snapshots. Keep existing trigger names when extending guards; no blanket trigger removal or weakened migration-verifier policy.

Extend `content_review_revisions` with:

| Column | Contract |
| --- | --- |
| `review_scope` | Non-null text, default `copy_only`; exactly `copy_only` or `copy_and_media` |
| `media_count` | Non-null integer, default 0; `copy_only` requires 0, `copy_and_media` requires 1–10 |

Defaults preserve every existing Social snapshot and old application insert. No backfill changing historical copy, number, identity, platforms or timestamps. Existing API/portal Social snapshot shapes remain unchanged. In the updated C5 request code explicitly supply `copy_only` and 0: `insertFrom` enumerates schema columns and otherwise supplies null instead of allowing the SQL default. No Ads API input or domain dispatcher is activated in E3A.

Add `content_review_assets`, an immutable ordered manifest, not another File/version lifecycle table:

| Column(s) | Meaning and constraints |
| --- | --- |
| `workspace_id`, `content_id`, `revision_id` | Exact canonical review revision ownership; composite FK to `(workspace_id, content_id, id)` |
| `asset_id` | Exact existing Content File; composite FK to `(workspace_id, content_id, asset_id)` on `content_asset_links`, backed by an additive unique index |
| `position` | Integer 1–10; unique per review revision; positions must be contiguous through `media_count` when a round seals the manifest |
| `file_revision` | Positive selected canonical File revision, checked against the ready File when captured |
| `filename`, `mime_type`, `byte_size`, `sha256` | Exact original File details, never supplied independently by the caller |
| `object_key`, `etag`, `ready_at` | Exact successful stored generation evidence, including non-null ready time and ETag |

Use `(workspace_id, revision_id, asset_id)` as the primary/unique row identity and `(workspace_id, revision_id, position)` uniqueness. Index lookup by `asset_id` and by `object_key` for retention guards; manifest reads are bounded by 10. No new opaque media ID is necessary. Multiple review revisions may reference the same successful canonical File; one revision cannot include that File twice. Add normal domain FKs/checks rather than relying only on application validation. Storage keys and hashes are internal evidence, never general-purpose API fields.

## Database invariants and sealing

Retain C5's exact copy/platform snapshot validation, sequential revision numbers, one requested round per Content, immutable round request identity, terminal responses, completion receipts and requested-field/platform freeze.

Extend the same-named review revision insertion guard with explicit area branches:

- Social/null Project: retain existing Client Review/client visibility/client-approval conditions, exact copy/platform snapshot, and require copy-only/zero media. Do not change which currently supported Social creation/response calls succeed.
- Ads/exact Project: require the same workspace/Client/Service tuple as immutable E2A Content context and the current canonical Ads Service department; ordinary Project, internal Content, fixed E2 flags, null publication, Internal Review, and no requested round. Capture exact current copy/platforms and valid E3 scope/count. Authorization remains in runtime SQL; a database structural guard is not an actor grant.

Each manifest insert must match its exact Ads review revision and current Content File link (`purpose='asset'`), with a ready internal File, supported E3 media MIME type and exact File revision/name/type/size/hash/key/ETag/ready-time equality. The revision must be unsealed (no canonical round references it), and its scope/count must permit that position. Reject wrong workspace, Content, Work family, Social File, archived/uploading/failed File, restricted/client visibility, unsupported type or any forged evidence. No manifest rows for copy-only revisions.

Extend the round insertion guard so an Ads round seals exactly `media_count` valid manifest rows with positions 1..N and no extras; zero for copy-only. Revalidate live File evidence, ordinary Project/internal Content and exact current Ads eligibility at sealing. E3B will move Content to Client Review before inserting the round; require that stage, fixed flags and null publication when sealing. Scope/count and every evidence row become immutable once created; no later update/delete or append to a sealed revision. No alternative row replacement may rewrite retained evidence or reopen/retarget an existing round.

Explicitly test `INSERT OR REPLACE` and uniqueness collisions, not just UPDATE/DELETE. Guard retained revision/round identities and all their historical fields, including request/completion provenance. Before inserting a File with an existing pinned identity, prevent replacement of the referenced original row or its authority state. Preserve canonical harmless `INSERT ... ON CONFLICT DO NOTHING` upload behavior for competing request IDs; do not treat an idempotent loser as a successful replacement. Native foreign keys plus explicit guards must cover other uniqueness collisions.

A staged revision and its manifest exist only within the eventual E3B atomic request batch; they have no independently editable draft lifecycle or endpoint. The round is the seal. E3B must roll back all such rows if it cannot commit the round and stage together. E3A fixtures may use direct SQL to prove these prospective invariants; application callers cannot create Ads evidence yet.

## Pinned File generation and retention

Once any review manifest references a File, its original identity and successful generation evidence cannot change through UPDATE, DELETE, replacement, retry, cleanup or a different File family. Preserve original name/type/size/hash, object key, ETag and ready time. Keep legal ready → archived changes and live visibility/revision metadata changes available: those can revoke access while retaining historical bytes. Do not freeze a File's entire row or make revocation impossible.

The existing successful-generation guard prevents normal retry key rotation; add evidence-specific guards for retained metadata and replacement paths. Reject direct attempts to revive archived pinned Files, clear their successful evidence or retarget a link. Preserve unchanged Work/Social uploads, failed-attempt recovery, leases, archive and visibility behavior when no manifest references the File.

Update `files.mjs::cleanupAttempts` to explicitly exclude any object key retained by a review manifest before issuing `bucket.delete`, in addition to all existing fenced-attempt conditions. A failed evidence lookup must fail closed for deletion. The existing D1 lifecycle rules must prevent a cleanup-eligible failed/stale key from becoming valid pinned evidence between selection and deletion. Test the race with native D1/R2. No cleanup job, bucket policy, public access, copy, paid resource or new object-key family is introduced.

This is application-enforced immutable evidence in the existing R2 bucket, not a compliance/WORM or account-administrator protection claim. The later download adapter verifies retained bytes and fails closed on external corruption/loss.

## Application compatibility and permitted changes

Ownership: `schema.mjs`, the new migration/journal/snapshot, narrowly affected C5 snapshot inserts and storage cleanup, and focused schema/compatibility/native fixtures plus task-owned docs. Inspect actual table declaration order and schema exports before adding the manifest; preserve existing relationships. No broad access/pipeline/UI refactor, new dependencies or unrelated D2 files.

Keep `contentReadCondition`, `contentClientReadCondition`, all approval domain/HTTP resource loaders and round response predicates explicitly Social. Keep existing portal DTOs and request input allowlists unchanged. Ads request, withdrawal, response, recording and round-media guesses must remain unavailable after E3A, including after department reassignment. E2B must still create/edit/progress/upload/download internal Ads creative normally. No additional internal/portal page or navigation is activated.

Prove old E2B application Social requests and new E3A Social requests against the upgraded database, and resolve a Social round requested before migration. New model defaults must not turn legacy input into null constraint failures or change receipt identity. Do not reinterpret an old copy-only revision as approving its current attachments. Prove default values and unchanged historical records after fresh/populated/repeat migration paths.

E3A becomes the minimum compatible application fallback once E3B creates Ads media evidence, because it understands evidence retention while keeping portal activation closed. Do not roll back to a build lacking pin-aware storage cleanup or remove this migration. Falling back may temporarily make Ads rounds unavailable; it must not expose them through Social or delete their media.

## Acceptance and release gates

1. Schema tests: exact ownership/FKs, scope/count and contiguous complete seal, selection/order bounds, supported media types, exact ready evidence, copy-only exclusion, wrong parent/family/visibility and all update/delete/replacement denials. Preserve terminal rounds, request uniqueness, original snapshot/Content identity and old trigger names.
2. Compatibility fixtures: populated pre-migration Social Content, platforms, requested and completed rounds, Work Files and E2B Ads assets. Assert unchanged data/defaults, old/new Social create/request/response/retry behavior, E2B production and all Ads approval/portal denials. Include every-column insert compatibility.
3. Native disposable D1/R2: apply all migrations, capture/seal direct SQL media fixtures, compare actual bytes/hash/ETag, attempt generation/replacement corruption, archive and restrict retained Files, retry interrupted/failed uploads and prove cleanup preserves every pinned key. Include uncertain finalize and late storage/revocation cases; restore no old attempt as ready. E3B portal download/UI is not E3A evidence.
4. Run focused schema/Content/approval/File/portal tests and the full Node suite; JavaScript syntax/diff checks and Cloudflare build. Run native existing File/R2, Social approval and E2B Ads creative regressions. Run the built-Worker Social approval/recording walkthrough plus E2B creative workflow and denied Ads approval/portal IDs at the established five widths; existing UI behavior must remain compatible.
5. Fresh and repeat zero-to-current verification must preserve ledgers, historical triggers/indexes, foreign keys and integrity. Upgrade from the populated accepted 23-migration baseline as well as fresh schema; expected new count is 24 if one migration suffices. Derive/assert the actual journal count, not a fabricated result. No remote fixture or real client communication.
6. After local acceptance obtain one fresh Sol High read-only review. Give the bounded contract, final relevant diff/new files and actual results; at most one focused re-review after valid fixes. Do not reuse the completed E2B review as E3A approval.
7. Update existing BUILD_STATE/INDEX and implemented DOMAIN_MODEL facts. Publish within standing authorization only after acceptance; verify exact merge SHA for staging, disposable remote zero-to-current and live identity/schema before closing E3A. Record actual cleanup evidence and limitations. E3 remains open; next write E3B's exact activation/routes/query/DTO/atomic request contract from the accepted foundation.

The original contract preparation was documentation-only. Implementation acceptance and release evidence are recorded in BUILD_STATE; this contract does not independently assert gate completion.
