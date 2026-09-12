# D2 Slice 2C — Systems Template Version lifecycle and immutability

## Status and scope

Implemented, locally verified and independently reviewed on `feat/d2-slice2c-version-guards`, based on verified main
`6697d40398645a40607175c74348353890e38535`. Slice 2B is closed; D2 is not.
The owner accepted the recommended retention rule: unused drafts may be deleted;
published, retired and generation-referenced versions are retained.

This slice adds storage safeguards through a custom SQL migration over existing
`templates` and `template_versions`. No new table, column, index, publication
API, provisioning/default writer, generation writer or UI is included. Existing
onboarding lifecycle/default bootstrap behavior must remain unchanged. Current
status and evidence belong in [BUILD_STATE.md](../BUILD_STATE.md).

## Contract

- Systems ownership is the existing same-workspace parent Template's `systems`
  kind; labels, slugs, bindings and active flags do not confer authority.
- New Systems versions start as `draft` with null `published_at`, a positive
  safe-integer version number, nonempty NUL-free identity/timestamp fields and
  existing same-workspace foreign keys. Nullable creator attribution remains
  supported. This is storage integrity, not caller authorization.
- The only status changes are `draft → published → retired`. Same-status
  metadata updates remain possible. Publication requires a nonempty NUL-free
  timestamp; later writes cannot replace or clear it. Retired is terminal.
  The existing partial unique index still permits at most one published version
  per Template. Publishing a successor requires explicit retirement and
  publication in one future authorized atomic batch; replacement is not publish.
- Version identity, physical rowid, workspace, parent, number, definition JSON,
  hash, notes, creator and creation timestamp cannot change for Systems rows.
  Existing migration 0001 still rejects even no-op updates naming its guarded
  definition/context columns. Ordinary `updated_at` changes are allowed.
- Deletion is allowed only for a draft without a matching generation receipt.
  Both its original version ID and parent/version-number pair count as a
  reference. Published/retired versions cannot be deleted. Nothing changes the
  previously approved deletion of generated live work.
- Incoming INSERT/UPDATE must refuse replacement of any retained Systems
  snapshot through primary IDs, parent/version numbers, published-slot uniqueness
  or rowid, including writes presented as another Template kind or workspace.
  Ordinary insertion does not become an idempotent upsert; later writers must
  resolve retries explicitly. Historical generation-referenced version IDs and
  parent/version-number pairs remain reserved even if a legacy source row is
  missing. Unused, actually deleted drafts have no new tombstone/ID reservation.
- A Template with versions cannot move into or out of Systems or change its
  identity/workspace while it owns Systems versions. Incoming replacements
  cannot bypass that rule via another unique key or rowid. Names, descriptions,
  activity and unbound slugs remain editable under existing constraints.
- Guards apply to new writes without rewriting existing snapshots or inventing
  historical publication dates. Existing retired timestamps remain preserved,
  including legacy null dates. No automatic repair or data deletion is allowed.
- SQLite's unspecified `NEW.rowid` retains the existing conservative behavior:
  matching a protected atypical rowid fails closed; no negative sentinel is
  exempted and no writer may expose or depend on physical rowids.

Definition validation, canonical JSON/hash verification, actor permission checks,
concurrent publication orchestration and generation eligibility remain later
writer responsibilities. Passing these SQL guards is not proof of a valid
compiled blueprint, an authorized publication or a committed generation.

## Acceptance

1. Reproduce current lifecycle/replacement/deletion gaps before keeping tests.
2. Cover all legal/illegal transitions, timestamp and identity protections,
   permitted draft deletion, retained/referenced history, cross-workspace and
   cross-kind replacement, every existing unique key and physical rowid path,
   both recursive-trigger settings and SQL conflict policies.
3. Prove permitted parent metadata edits and unchanged onboarding bootstrap,
   publication and missing historical-default recovery behavior.
4. Prove migration of an existing valid version population without mutation;
   preserve all 44 table definitions, indexes and prior snapshots.
5. Exercise native local D1 publication competition and late batch failure
   rollback. Verify fresh migrations and an identical no-op pass through the
   repository verifier. Keep D1 remote trigger CASE syntax compatible.
6. Run affected tests, required migration checks and one fresh Sol High read-only
   review. Record any remaining deployment/approval gates rather than closing
   this slice from local evidence alone.

## Local verification and review (2026-09-11)

- Before-migration reproduction: the initial focused matrix with `0020` omitted
  produced 135 failures out of 227 tests. The final matrix adds conflict-policy,
  rollback, rowid-alias, NULL/default and supplied creator-ID regressions.
- `node --test tests/bloomops-systems-version-schema.test.mjs tests/d1-migration-compatibility.test.mjs`:
  273/273 pass (251 Systems checks plus 22 compatibility checks).
- `node scripts/systems-version-smoke-local.mjs`: 74/74 native disposable
  workerd/D1 checks pass with recursive triggers OFF and ON. This exercises real
  publication contention, publication/deletion competition and atomic rollback.
- `node scripts/blueprint-generation-smoke-local.mjs`: existing Slice 2B smoke
  passed 80/80 during this slice's initial verification.
- `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test`: final candidate passes
  5,737/5,737 with no failures or skips; the temporary Python alias is external
  and uncommitted. Changed JavaScript syntax and `git diff --check` pass.
- Final `node .github/scripts/verify-zero-remote.mjs --local`: 22/22 checks pass,
  exit 0. All 60 inherited and 21 domain migrations apply, with 44 domain / 80
  total tables, 109 explicit domain indexes and every migration-defined trigger.
  Integrity/FKs are clean; the second pass preserves the exact schema and both
  ledgers. The disposable local directory was removed.
- One fresh Sol High read-only review and the one permitted focused re-review
  found no remaining material defects. Review reproduced malformed supplied
  creator IDs passing the existing membership FK; the final nullable-aware
  identity predicate and focused/native cases correct this. Final inspection
  also reproduced and fixed explicit NULL status invoking SQLite's draft
  default under `UPDATE OR REPLACE`, which otherwise bypassed retained history.
- Read-only staging preflight found zero existing Systems Template Versions.
  This does not establish remote application of `0020`. No application build,
  browser verification or remote mutation is claimed for this local slice.

Evidence: `/tmp/bloomops-d2-2c/{focused-before.log,focused.log,native-final.log,prior-native.log,full-final.log,zero-local-final.log}`.
The original checkout retains its branch and unrelated work; this worktree owns
implementation. The owner approved commit/push/merge and the resulting staging
migration/deployment and remote disposable verifier on 2026-09-11, requesting no
repeated approval prompts within that scope. Publication is proceeding; no
passing remote result is claimed yet. Both required workflows must pass
on the eventual exact merge SHA, with staging confirmation, before closure.
