# D2 Slice 2B — generation provenance storage

## Status and authorization

**Slice 2B is CLOSED on main `6697d40398645a40607175c74348353890e38535`.**
[PR #41](https://github.com/Bloomwired/bloomops/pull/41) merged correction
`eedda3f3d303ba19292142370e4aaa84ca8fa071`, parenthesizing two top-level CASE
expressions in migration `0019` for D1 remote `/query` compatibility without
changing its storage contract. Original remote failure/rollback and corrected
apply/no-op behavior were reproduced on a guarded disposable database. Affected
981 tests, 80 native D1 checks, full remote zero verification (30 checks) and a
fresh Sol High review all passed, with no material review findings.

[Deploy staging 34673400835](https://github.com/Bloomwired/bloomops/actions/runs/34673400835)
and [Verify zero-to-current 34673400821](https://github.com/Bloomwired/bloomops/actions/runs/34673400821)
both succeeded on the exact merge SHA. Staging reports `6697d40`; metadata
confirms migration `0019` and both provenance tables. A direct read-only account
check confirms disposable cleanup. The zero workflow's log tail is truncated;
its complete job/step result and independent cleanup check, alongside the full
pre-merge remote verifier evidence, are recorded in [BUILD_STATE.md](../BUILD_STATE.md).
D2 remains open. Next is Slice 2C lifecycle/immutability scoping, not a generation
writer or new UI.

Historical implementation and first deployment attempt:

The owner approved preserving immutable generation history while allowing future
otherwise-authorized deletion of live work. This resolves Slice 1's
provenance/deletion decision. Slice 2B is implemented, locally verified and independently reviewed. It is open
in [PR #40](https://github.com/Bloomwired/bloomops/pull/40), unmerged and undeployed. No generation
writer, API or UI is included, and D2 is not complete.

Slice 2A closed through PR #39 on verified main
`a4ceb813afa0aad028ac67457940b734dbeb9412`. Implementation and verification ran in the existing
`feat/d2-slice2a-binding-storage` checkout at `74cc2ef`. The owner then authorized
commit/push/PR preparation in a clean worktree on
`feat/d2-slice2b-generation-provenance`, based on canonical main `a4ceb813`.
Those base trees are identical. All eight implementation/migration/test files
are byte-identical to the reviewed candidate; only handoff documentation differs.
The original checkout and its pre-existing guide/configuration work are preserved
and excluded from this PR. Leave the Slice 2B PR unmerged; no deployment or 2C+
implementation is authorized. Current handoff status is in
[BUILD_STATE.md](../BUILD_STATE.md).

PR implementation commit: `54d4372fca9f9c4f3739dd961647efa732b522bb`.
The subsequent documentation-only commit records this handoff without changing
any reviewed implementation file. The PR branch/worktree is
`feat/d2-slice2b-generation-provenance` at `/home/ary/Developer/bloomops-d2-slice2b`.
The original implementation checkout remains preserved. The owner subsequently
approved the merge, staging migration/deployment and disposable D1 verification.
[Deploy staging 34672104559](https://github.com/Bloomwired/bloomops/actions/runs/34672104559)
and [Verify zero-to-current 34672104558](https://github.com/Bloomwired/bloomops/actions/runs/34672104558)
initially failed before execution due to personal-account billing. Both attempt-2
reruns started under Bloomwired on the exact same merge SHA. Staging failed at
domain migration `0019` before deployment; fresh-database domain migration also failed with the same error. Its disposable
database cleanup, exact account inventory restoration and staging identity check
succeeded. Staging still reports prior SHA `a4ceb81`. Repair the migration failure before closure or
Slice 2C. Current evidence is in [BUILD_STATE.md](../BUILD_STATE.md).

## Approved retention behavior

History survives deletion of generated Milestones, Actions, Deliverables and
Projects. Slice 2B adds no deletion endpoint, permission or relaxation of existing
canonical FKs. It also adds no new FK or DELETE trigger that permanently prevents
those live rows from being deleted. Once deleted, the original Project ID and
kind-specific item ID remain reserved in history: neither INSERT nor an incoming
UPDATE can reuse them, including in another workspace. Fresh IDs remain valid.

While present, a generated Project's ID/workspace/Client/Service identity and a
mapped item's ID/workspace/Project identity cannot change. Ordinary names,
descriptions, lifecycle, visibility, revision and ordering remain canonical live
facts. Editing them does not alter provenance. Binding disablement, revision,
repointing, deletion and recreation do not rewrite the recorded binding identity
and revision. Historical source and actor IDs are snapshots, never live authority
or a license to join a newly recreated source as if it were the original.

Later generation retries must not recreate deleted work, revert edits, or treat
an emptied Project as eligible for another generation. Missing immutable receipt
or mapping facts are an integrity failure. Missing live work after permitted
deletion is different from missing history. A deleted or inaccessible Project
cannot become readable through its receipt. These are requirements for the later
writer/read paths; no such path exists in this slice.

## Relational storage contract

Migration `0019_d2_slice2b_generation_provenance.sql` adds exactly two tables.
The generated snapshot leaves all 42 previous table definitions unchanged. The
journal contains 20 domain migrations; there are 44 domain tables.

`systems_blueprint_generations` has 21 required columns:

| Columns | Meaning and constraints |
| --- | --- |
| `id`, `workspace_id` | Opaque default TEXT ID, explicit NOT NULL PK; retained workspace FK, DELETE RESTRICT |
| `project_id`, `client_id`, `service_engagement_id`, `service_type_id` | Original live context, validated together on insertion, retained as identities |
| `binding_id`, `binding_revision` | Exact configuration used, revision integer 1..9,007,199,254,740,991 |
| `template_id`, `template_version_id`, `template_version_number` | Original same-workspace Systems source, version number in the same safe integer range |
| `request_id` | Lowercase UUIDv4; unique within workspace |
| `blueprint_key`, `definition_schema_version`, `compiler_version` | Bounded lowercase key and supported v1 envelope |
| `definition_json`, `definition_hash` | Exact source Version definition bytes/hash copied at insertion |
| `plan_json`, `plan_hash` | Immutable compiled-plan snapshot (including normalized selected component keys) and SHA-256-format hash |
| `created_by_membership_id`, `created_at` | Active same-workspace actor at insertion; historical attribution/time thereafter |

IDs and time are nonempty TEXT without NUL. Hashes are 64 lowercase hexadecimal
characters. JSON must be a valid object, at most 32,768 UTF-8 bytes. Plan envelope
versions/key must match the relational fields; arrays are bounded to 1–14 selected
components, 1–13 Milestones, 1–14 Actions, 0–8 Deliverables and 0–49 dependencies.
Selected components are unique strings; each item array has unique, bounded
logical keys. These are storage-envelope checks, not a second compiler.

Three explicit unique indexes cover `(workspace_id,id)`, `project_id`, and
`(workspace_id,request_id)`. The global Project reservation follows the existing
Project PK and prevents identity reuse after deletion across tenants. Each table
also has SQLite's PK index.

`systems_blueprint_generation_items` has seven required columns: `id`,
`workspace_id`, `generation_id`, `kind`, `logical_key`, `record_id`, `created_at`.
Kind is `milestone|action|deliverable`. The original record must belong to the
receipt's exact live workspace/Project when mapped, and the logical key must
appear in that kind's plan array. Explicit unique indexes cover
`(generation_id,kind,logical_key)` and `(kind,record_id)`. The latter reserves
canonical global IDs per table. FKs reference only the workspace and the
same-workspace immutable receipt, both DELETE RESTRICT. There is no live-record FK.

## Guards and scope boundary

Six provenance triggers reject UPDATE/DELETE and incoming INSERT collisions by
PK, unique identity and explicit physical rowid. Eight live-table triggers guard
Project/Milestone/Action/Deliverable INSERT and UPDATE against historical identity
reuse, outgoing identity changes, and incoming replacements by every current
unique key or physical rowid. Every guard refusal uses `RAISE(ABORT)` so earlier
changes in the same SQL statement roll back. REPLACE and colliding UPSERT cannot
substitute for an immutable write even with recursive triggers OFF.

As in Slice 2A, SQLite's undefined implicit `NEW.rowid` may conservatively collide
with a manually assigned negative protected rowid. Explicit atypical rowids are
covered; physical rowids are neither application input nor provenance identity.
This preserves fail-closed behavior without exempting a sentinel or introducing
a positive-rowid invariant.

The receipt INSERT guard validates the existing Project → Service → Service Type
→ binding → Systems Template → exact Version relationships and active actor
attribution. It deliberately does not introduce generation eligibility: a disabled
binding or inactive/unpublished Template remains valid storage context. It does
not check caller role, assignments, current Project emptiness/status, approved
publishing, canonical normalization, SHA-256 computation or whether the plan is
exactly the compiler output. Later preparation must load trusted sources,
validate/recompile with the existing compiler, normalize and hash exact bytes,
and establish fresh authorization and eligibility. No application writes these
tables yet.

Similarly, storage alone allows a receipt before its full set of item mappings;
this is necessary for receipt-first atomic batches. It does not certify complete
committed generation. Slice 4 must gate every work/mapping/activity write on the
winning receipt and return success/replay only after resolving the exact
authorized immutable receipt and complete expected mappings. A resolved batch or
zero-row guard is not success. Partial/inconsistent history must never trigger
repair or regeneration. The native smoke proves atomic storage batches, not an
implemented generation transaction.

No Template Version lifecycle protections (2C), provisioning, Project eligibility
API, management UI, deletion implementation, provider calls, new permission,
deployment, dependency/configuration change or D3+ work is included. Activity
remains operational history; these two tables retain the irreducible generation
identity and mapping facts, not a competing Project or history lifecycle.

## Verification and review

- Focused: `node --test tests/bloomops-blueprint-generation-schema.test.mjs` —
  360/360 passed, recursive triggers OFF and ON, zero failures/skips.
- Affected: `node --test tests/bloomops-*schema.test.mjs tests/bloomops-onboarding-*.test.mjs tests/bloomops-systems-blueprint-compiler.test.mjs tests/schema-drift.test.mjs` — 960/960 passed, zero failures/skips.
- Native storage: `node scripts/blueprint-generation-smoke-local.mjs` — 80 checks
  passed in disposable workerd/D1 with both recursive modes. Includes retention,
  denied scope, replacement protection, competing batches (one winner), late
  failure rollback and FK integrity. Uses the installed Wrangler/Miniflare path;
  no remote binding or deployed configuration, and removes only its own temp state.
- The first focused run exposed a fixture-only nonexistent Service `name` column;
  the fixture was corrected before the passing runs. No failed assertion was
  removed or skipped.
- Full suite: `PATH=/tmp/bloomops-c6-tools/bin:$PATH npm test` — 5,464/5,464
  passed, zero failures/skips, using only the pre-existing external Python wrapper.
- `npm run cf:build` — exit 0 after the final schema correction, including Next's
  build/configured validation and emitted `.open-next/worker.js`.
- Four changed/new JS module syntax checks, phase links, unchanged guide/config
  preservation checks and `git diff --check` pass.
- Final local fresh/no-op verifier: `node .github/scripts/verify-zero-remote.mjs --local`
  — 22/22 checks passed against the final migration, including all 60 inherited
  and 20 domain migrations, 44 domain / 80 total tables, 109 explicit domain
  indexes, FK/integrity checks, an identical-schema/ledgers no-op second pass and
  disposable local cleanup. No remote database was queried or changed.
- Final inspection reproduced SQLite accepting a NUL suffix after an otherwise
  valid request ID/hash. Explicit NUL checks now cover request/key/hash fields;
  eight focused regressions include matching source-Version hash/key cases in
  both recursive modes, and four native D1 checks cover request/hash rejection.
  The final affected/full/native/build runs above include the correction.
- One fresh read-only **GPT-5.6 Sol High** reviewer inspected the final scoped diff
  and reported **no confirmed material findings**. It independently confirmed the
  same NUL validation class during review; the final patch resolves it. Review
  covered tenant/source/actor joins, immutable history, permitted live deletion,
  all current live unique-key/rowid replacement paths, ID reservation, snapshot
  consistency and focused results. Final affected/full/native/build and fresh/no-op reruns completed
  successfully after its report; all results above are for the corrected files.
  No second reviewer or further review loop is required.

Local logs live outside Git under `/tmp/bloomops-d2-2b/`. Local migration commands
follow the existing verifier and current
[Cloudflare D1 Wrangler documentation](https://developers.cloudflare.com/d1/wrangler-commands/).
The later approval covers staging migration/deployment and disposable D1 verification
through the existing workflows, including reruns after the billing issue is resolved.
No real email or production action is authorized.
