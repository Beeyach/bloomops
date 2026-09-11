# D2 Slice 2B — Immutable Provenance Storage Implementation

## Mode

Implementation task only. Implement **D2 Slice 2B** and stop for independent audit.

Do not begin 2C, 2D, 2E, Slice 3, Slice 4, D3, or later work.

Performance remains closed.

## Canonical base and hard precondition

Canonical expected base:

`a4ceb813afa0aad028ac67457940b734dbeb9412`

Before making any change:

1. Fetch latest remote refs.
2. Verify `origin/main` is still exactly the SHA above.
3. Verify both automatic post-merge gates for that exact SHA completed successfully:
   - Deploy staging: `34653350194`
   - Verify zero-to-current migration: `34653350149`
4. If either run is not `completed/success`, or main moved, **STOP** and report the mismatch. Do not implement against a different baseline.
5. Confirm working tree is clean.

## Governing contracts

Read fully before editing:

- `AGENTS.md`
- `docs/RELEASE_D.md`
- `docs/BUILD_STATE.md`
- `docs/phases/D2_SLICE1.md`
- `docs/phases/D2_SLICE2A.md`
- the merged Slice 1 compiler/default/definition modules
- the merged Slice 2A binding schema/migration/tests
- existing Template/version, Work Core, Action dependency, Activity, onboarding provenance, schema, migration, and zero-to-current patterns

Use the Cloudflare/D1 skill and current official D1/SQLite semantics where platform behavior matters.

## Scope

Implement only **2B — immutable generation receipt/mapping storage, source-retention protections, and historical generated-Work identity guards**.

2B is storage/integrity infrastructure. It does **not** generate work.

Allowed:

- add `systems_blueprint_generations`
- add `systems_blueprint_generation_items`
- add required indexes/FKs/CHECKs/triggers
- add source Template/version protections necessary to make stored provenance immutable
- add historical binding-ID reuse protection once a receipt references a binding
- add generated Work identity protections necessary to preserve historical mappings
- add direct database/schema/migration tests
- update schema snapshots/journal/inventory
- update D2 2B documentation/state

Not allowed:

- generation writer or generation transaction
- receipt creation API/helper used by product runtime
- preview API
- Project eligibility wiring
- binding management API/UI
- Systems Template publishing/admin UI
- default Template provisioning
- automatic Service Type binding
- provider execution
- Work lifecycle changes
- portal/provenance read API
- queues/jobs/checkpoints
- 2C+ work

Tests may insert fixtures directly to exercise database invariants. Do not turn test fixture helpers into product generation behavior.

## Frozen policy decisions

### Historical mapping model

Use immutable historical mappings with **no live FK from mapping to Milestone/Action/Deliverable**.

Insertion proves the original typed live row existed in the exact workspace/Project and matched its initial plan identity. Later permitted deletion of live Work must not delete provenance and must never authorize regeneration.

### Retention

- Receipt retains target Project via scoped `RESTRICT` FK.
- Receipt retains exact Template Version via scoped `RESTRICT` FK.
- Initiating Membership and User IDs are historical attribution values only. Validate them at insertion, but add **no receipt FK** to Membership/User.
- No aggregate purge behavior is introduced.

### Provenance disclosure

Storage must remain absent from ordinary Work/Project/portal DTOs.

No provenance read API is part of 2B.

### Generated Work fields protected permanently

For a mapped generated Milestone/Action/Deliverable, protect only:

- `id`
- `workspace_id`
- `project_id`
- original `creation_request_id`

Do **not** freeze:

- names/titles/descriptions/client labels
- status/visibility/priority
- dates/waiting/completion data
- assignments
- Milestone position
- Action `milestone_id`
- normal operational fields

Authorized Action→Milestone reassignment must remain possible. The receipt plan preserves the original relationship.

No D2 delete trigger may block deletion of a generated Work row solely because it was generated.

## Table A — `systems_blueprint_generations`

Add an immutable receipt table representing exactly one generation per Project.

All required columns must be explicitly `NOT NULL`.

Required columns:

- `id` — server-owned lowercase UUIDv4, PK
- `workspace_id`
- `project_id`
- `receipt_schema_version` — exactly 1
- `template_version_id`
- `request_id` — lowercase UUIDv4
- `normalized_request_hash` — 64 lowercase hex
- `definition_hash` — 64 lowercase hex
- `definition_schema_version` — exactly supported Slice 1 value (currently 1)
- `compiler_version` — exactly supported Slice 1 value (currently 1)
- `blueprint_key` — Slice 1 logical-key grammar, current supported family `ghl_build`
- `selected_component_keys_json` — canonical JSON array, 1–14 unique selections, <= 1024 UTF-8 bytes
- `compiled_plan_json` — canonical plan object, <= 32768 UTF-8 bytes
- `compiled_plan_hash` — 64 lowercase hex
- `source_client_id`
- `source_service_engagement_id`
- `source_service_type_id`
- `source_department_id`
- `source_template_id`
- `source_binding_id`
- `source_binding_revision` — positive safe integer
- `initiated_by_membership_id`
- `initiated_by_user_id`
- `created_at` — server UTC timestamp

Keys/indexes:

- PK `id`
- UNIQUE `(workspace_id, project_id)`
- UNIQUE `(workspace_id, request_id)`
- UNIQUE `(workspace_id, project_id, id)` for mapping ownership
- index `(workspace_id, template_version_id)`
- index `(workspace_id, initiated_by_membership_id)` as historical lookup only, not FK

FKs:

- workspace
- scoped Project
- scoped exact Template Version

All use `ON DELETE RESTRICT`, `ON UPDATE NO ACTION`.

No receipt FK to:

- Membership/User
- current binding
- Client/Service/Service Type/Department historical IDs

Those source/actor values are immutable historical snapshots validated at insertion.

## Receipt structural guards

SQL must fail closed for malformed/missing JSON. Remember SQLite `CHECK` values that evaluate to NULL can pass.

Use total predicates.

At minimum:

- validate TEXT and `json_valid` before extraction
- enforce required top-level plan fields:
  - schemaVersion
  - compilerVersion
  - blueprintKey
  - selectedComponentKeys
  - milestones
  - actions
  - deliverables
  - dependencies
- validate required JSON container types
- enforce bounded collection sizes
- reject duplicate selected keys
- reject duplicate entity logical keys
- reject duplicate dependency pairs
- enforce ceilings:
  - 13 Milestones
  - 14 Actions
  - 8 Deliverables
  - 35 total entities
  - 49 dependency edges
- require plan version/family/selection to agree with receipt columns
- use `length(CAST(value AS BLOB))` for stored UTF-8 byte ceilings
- validate UUID/hash/logical-key/counter/timestamp shape with bounded total predicates

Do not attempt to prove SHA-256 correctness in SQL.

Trusted domain code in later slices owns canonicalization/recompilation/hash verification. 2B storage only establishes relational/structural integrity.

## Receipt insertion guard

The insertion guard must validate the immutable source chain without implementing authorization or generation:

- exact workspace/Project exists
- Project source Client/Service chain matches the stored historical source IDs
- Service Type/Department relationship is the expected canonical Systems relationship
- `source_binding_id` resolves to the exact current binding in the workspace for that Service Type
- binding revision matches `source_binding_revision`
- binding targets `source_template_id`
- exact `template_version_id` belongs to `source_template_id`
- Template is `kind = 'systems'`
- Template/version family + definition metadata agree with receipt fields
- initiating Membership/User relationship is valid at insertion time

This is historical validation, not fresh runtime authorization.

Do not require the binding to remain enabled later, and do not require the Version to remain published later.

## Receipt immutability and replacement protection

Receipts are immutable: no UPDATE, no DELETE.

Protect against replacement semantics before destructive conflict resolution.

Cover every relevant identity, including:

- receipt ID
- `(workspace_id, project_id)`
- `(workspace_id, request_id)`
- scoped mapping-parent key
- physical row collision where applicable

Protection must hold with `recursive_triggers` OFF and ON.

Do not assume ordinary delete triggers alone protect `INSERT OR REPLACE` / `UPDATE OR REPLACE`.

## Table B — `systems_blueprint_generation_items`

All six columns are `TEXT NOT NULL`:

- `generation_id`
- `workspace_id`
- `project_id`
- `entity_kind`
- `logical_key`
- `original_entity_id`

Keys/indexes:

- PK `(generation_id, entity_kind, logical_key)`
- UNIQUE `(generation_id, logical_key)`
- UNIQUE `(entity_kind, original_entity_id)`
- index `(workspace_id, project_id, generation_id)`

Only FK:

`(workspace_id, project_id, generation_id)` → receipt scoped key, `ON DELETE RESTRICT`, `ON UPDATE NO ACTION`

Checks:

- `entity_kind` exactly one of `milestone`, `action`, `deliverable`
- logical-key grammar/length matches Slice 1
- `original_entity_id` lowercase UUIDv4

Mappings are immutable: no UPDATE, no DELETE.

Replacement protection must cover:

- all declared PK/unique identities
- physical row collisions where applicable
- both outgoing and incoming protected identities
- recursive triggers OFF and ON

## Mapping insertion guard

For each mapping insertion, prove:

1. Exact scoped parent receipt exists.
2. `logical_key` occurs exactly once in the correct plan collection.
3. Correctly typed live Work row exists at `original_entity_id`, exact workspace and Project.
4. Initial live fields match the stored plan for that entity:
   - name/title
   - Milestone position where applicable
   - canonical initial status/visibility
   - Action priority
5. The live row's `creation_request_id` equals its generated entity UUID (`original_entity_id`).
6. For an Action's initial Milestone, the plan relationship resolves through a Milestone mapping from the same generation.
7. No conflicting historical identity exists.

Do not require the live Work row to remain forever after the mapping is inserted.

Dependency provenance remains only in `compiled_plan_json`; do not add dependency mapping/provenance rows.

## Source Template/version protection required in 2B

Because receipts retain an exact immutable source, add only the protections necessary to prevent future mutation/replacement from invalidating provenance.

For Systems Templates/Versions used by receipts, preserve historical identity/definition:

Template family identity that must not silently change once used by receipt provenance:

- Template ID
- workspace
- kind
- slug/family

Version identity/content that must not silently change once used by receipts:

- Version ID
- workspace
- Template ID
- version number
- definition JSON/hash
- creator/creation metadata
- first publication timestamp once established

Historical Systems Versions referenced by receipts cannot be deleted/replaced.

Do **not** implement the future Systems Template/version management API or publisher in 2B. 2C owns those primitives.

Keep legal existing onboarding behavior unchanged.

## Historical binding-ID reservation after receipt exists

2A permits binding deletion/recreation with fresh IDs. Once a generation receipt snapshots `source_binding_id`, that historical binding ID must never be reassigned to a newly inserted binding.

Add the smallest database protection necessary to reject reuse of a receipt-reserved binding ID through INSERT/UPDATE/replacement paths.

Do not make deleted bindings themselves immutable records or add a tombstone table.

## Generated Work historical identity guards

Once a Work entity is mapped in `systems_blueprint_generation_items`:

- the mapped live row cannot mutate `id`, `workspace_id`, `project_id`, or its original `creation_request_id`
- an unrelated live row cannot later acquire a historically reserved generated UUID through INSERT or UPDATE
- replacement operations must not delete/replace a mapped row through another unique constraint

Protect incoming replacement conflicts against every relevant live uniqueness capable of replacing the mapped row, including as applicable:

- entity UUID
- creation-request uniqueness
- Milestone Project-position uniqueness
- other existing unique keys that could cause a mapped row to be replaced
- physical row collision where relevant

Do **not** freeze Milestone position itself on the mapped row. A normal authorized position update may remain legal if it does not replace another protected mapped row.

Do **not** freeze Action `milestone_id`.

No D2-specific DELETE trigger on Milestone/Action/Deliverable.

After dependencies/files/other existing references are removed, an otherwise legal child deletion should still be possible; immutable mapping survives.

A deleted historical generated UUID cannot be reused.

## Replacement-write requirements

Audit correction is mandatory:

- protect both outgoing protected identity and incoming historically reserved identity
- protect replacement collisions on every relevant immutable unique key, not merely PKs
- include rowid collision paths for rowid tables where necessary
- test with `PRAGMA recursive_triggers = OFF` and `ON`
- use `RAISE(ABORT, ...)` so rejected multi-row statements do not partially apply
- do not depend on REPLACE as a supported mutation mechanism

## Adversarial tests required in 2B

At minimum cover all of these with direct database/migration tests:

1. Receipt NULL/invalid required identifiers rejected.
2. Invalid UUID/hash/logical-key/counter/timestamp rejected.
3. Malformed/missing/wrong-type JSON fails closed, including NULL-producing extraction paths.
4. Selection/plan byte and count ceilings enforced.
5. Duplicate selected keys/entity keys/dependency pairs rejected.
6. Foreign workspace Project/source chain rejected.
7. Binding/Template/Version/source mismatch rejected.
8. Invalid initiating Membership/User relationship rejected.
9. One receipt per workspace/Project.
10. Request ID unique across workspace; same request ID on another Project conflicts.
11. Receipt UPDATE/DELETE rejected.
12. Receipt REPLACE collisions rejected under recursive triggers OFF and ON.
13. Mapping wrong workspace/Project rejected.
14. Mapping wrong entity kind rejected.
15. Mapping logical key absent/wrong collection/duplicate mismatch rejected.
16. Mapping UUID points to wrong typed table rejected.
17. Mapping live row wrong Project rejected.
18. Mapping initial-field mismatch rejected.
19. Action initial Milestone mapping mismatch rejected.
20. Mapping UPDATE/DELETE/REPLACE rejected.
21. Generated Action deletion after removable dependencies: deletion permitted when existing constraints allow; mapping survives.
22. Generated Milestone/Deliverable analogous deletion behavior where existing references permit.
23. Deleted generated UUID cannot be reused by INSERT.
24. Deleted generated UUID cannot be acquired by UPDATE of unrelated row.
25. Incoming `INSERT OR REPLACE` / `UPDATE OR REPLACE` cannot destroy mapped Work through UUID/request/position/other protected uniqueness.
26. Mapped Action later authorized `milestone_id` reassignment remains storage-legal.
27. Mapped Milestone position normal update remains storage-legal when no protected collision occurs.
28. Status/visibility/priority/date/label/title operational edits remain storage-legal under existing constraints.
29. Receipt-referenced Template family identity cannot mutate/replace.
30. Receipt-referenced Version identity/definition/creator/creation metadata cannot mutate/replace/delete.
31. Existing legal publication/retirement behavior not unintentionally broken beyond frozen provenance requirements.
32. Deleted binding ID referenced historically by receipt cannot be reused.
33. Current binding can still be deleted/recreated with a fresh ID if other references permit.
34. Multi-row rejected mutation leaves zero partial changes.
35. All replacement protections behave identically with recursive triggers OFF and ON.
36. Existing non-D2 Work/Templates/onboarding behavior remains unchanged.

Add additional cases whenever implementation exposes another collision path.

## Migration/schema requirements

- Generate the next ordered migration after merged 2A.
- Update `lib/bloomops/schema.mjs`.
- Update Drizzle snapshot/journal using repository conventions.
- Update table inventory/schema tests as required.
- No table rebuild unless objectively necessary; explain if one becomes unavoidable before proceeding.
- Do not modify existing migrations.
- Zero-to-current must remain idempotent and second-pass identical.

## Verification

At minimum run:

1. New focused 2B schema/constraint tests.
2. 2A binding tests.
3. Relevant schema, Template/onboarding, Work Core, Action dependency, Activity, Slice 1 compiler suites.
4. Local zero-to-current verifier twice/idempotence according to repository convention.
5. Full test suite.
6. Next/Cloudflare build and available lint/type validation.
7. Syntax checks for changed JS/MJS/test files.
8. `git diff --check`.
9. Snapshot comparison proving only intended new tables/protections changed.

Do not claim native D1 bind/query feasibility for the future generation writer. 2E/Slice 4 own that proof.

## Documentation

Add/update minimal state documentation for 2B, including:

- exact base SHA
- exact migration
- exact table/trigger/index/FK/CHECK inventory
- frozen retention/deletion policy
- replacement/identity protections
- test counts and commands
- explicit boundary that no generation writer/API/provisioning/read surface exists
- 2C not begun

## Commit and stop

Create a new implementation branch from exact verified main, suggested:

`feat/d2-slice2b-immutable-provenance`

Commit the complete 2B candidate locally as one implementation commit unless a necessary corrective follow-up is discovered during verification.

Do **not** push.
Do **not** open a PR.
Do **not** deploy.
Do **not** begin 2C.

Return:

1. branch name
2. commit SHA
3. migration filename
4. exact files changed
5. receipt table inventory
6. mapping table inventory
7. trigger/protection inventory
8. deletion/retention behavior proven
9. replacement-write behavior proven
10. focused/affected/full/migration/build results
11. any known limitations or audit targets
12. confirmation working tree is clean

The next step after this task is an independent GPT-5.6 Sol High audit, not 2C implementation.