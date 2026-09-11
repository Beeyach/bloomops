# D2 Slice 2 — Independent Storage/Provenance Design Audit

You are performing an **independent design audit only** for BloomOps Release D, phase D2 Slice 2.

Do **not** implement schema, migrations, code, tests, docs, API routes, UI, provisioning, or generation writes.
Do **not** modify files.
Do **not** push, open a PR, merge, deploy, or begin Slice 2 implementation.
Performance work remains closed.

## Verified baseline

Canonical `main`:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

PR #38 (D2 Slice 1 pure GHL blueprint compiler) is merged on that SHA.
The required exact-SHA post-merge gates have passed:

- Deploy staging: `34617425161`
- Verify zero-to-current migration: `34617425293`

Before auditing, verify `origin/main` is still exactly the SHA above. If main moved, STOP and report the new SHA instead of auditing a mixed baseline.

## Repository sources to inspect

Read the actual current repository contracts, including at minimum:

- `AGENTS.md`
- `docs/RELEASE_D.md`
- `docs/BUILD_STATE.md`
- `docs/phases/D2_SLICE1.md`
- `lib/bloomops/schema.mjs`
- `lib/bloomops/systems-blueprint-definition.mjs`
- `lib/bloomops/systems-blueprint-compiler.mjs`
- `lib/bloomops/systems-blueprint-defaults.mjs`
- `lib/bloomops/onboarding-templates.mjs`
- `lib/bloomops/onboarding-generation.mjs`
- `lib/bloomops/onboarding-defaults.mjs`
- `lib/bloomops/bootstrap.mjs`
- `lib/bloomops/services.mjs`
- `lib/bloomops/projects.mjs`
- `lib/bloomops/project-access.mjs`
- `lib/bloomops/milestones.mjs`
- `lib/bloomops/actions.mjs`
- `lib/bloomops/deliverables.mjs`
- `lib/bloomops/action-dependencies.mjs`
- `lib/bloomops/activity.mjs`
- relevant Drizzle migrations and schema tests

Use the Cloudflare/D1 skill and current official D1 documentation where needed for foreign-key, batch, trigger, statement/bind and transaction assumptions.

## Scope already approved from Slice 1

D2 v1 eventually generates canonical BloomOps Work records from a versioned Systems blueprint.

Approved product boundaries:

1. Generation targets an **existing, empty, planned Project**. D2 does not create the Project.
2. Exactly **one blueprint generation per Project** in D2 v1. No append/reconcile/amend/regenerate feature.
3. Slice 1's merged GHL manifest/logical keys are the approved v1 compiler contract.
4. No direct GHL/Kajabi provider API execution.
5. No `serviceType.slug === "ghl"` eligibility rule or display-name inference.
6. Slice 2 is storage/configuration only. No generation API/preview/UI/writer belongs here.
7. Exact committed-receipt proof remains a **Slice 4** requirement. A resolved D1 batch alone must never be treated as proof of generation success.

## Proposed Slice 2 design to audit

The prior design pass proposes **three new tables only** plus Systems template/version guards and default provisioning.

Your job is to challenge this design. Do not assume it is correct merely because it is proposed.

---

# A. Provenance/deletion model

## Proposed choice: historical generated-item identity with NO FK to the live Work row

Each immutable generated-item mapping stores:

- `generation_id`
- `workspace_id`
- `project_id`
- `entity_kind` (`milestone`, `action`, `deliverable`)
- `logical_key`
- `original_entity_id`

The mapping does **not** hold a live FK to the generated Milestone/Action/Deliverable.

At insertion time, database/domain guards must prove that the correctly typed live entity:

- exists
- has exactly `original_entity_id`
- is in the same workspace
- belongs to the same Project
- corresponds to the appropriate logical key in the stored compiled plan
- has the expected initial generated identity/parent shape

After insertion, the immutable mapping is historical proof of the original generated identity.
Later operational edits are allowed.
Later deletion of the live child must **not** delete provenance and must **not** be newly blocked merely because the row was blueprint-generated.

Proposed protections:

- mapping identity, kind, workspace, Project, generation and original UUID never change
- mapping update/delete prohibited
- mapped Work entity identity/parent/request-key fields cannot be changed while it exists
- deleted historical generated UUID may never be reused for a new live row of the same kind
- labels, statuses, visibility, dates, assignments and other normal operational fields remain editable
- D2 adds no new trigger that blocks deletion of generated children
- a missing live child never authorizes regeneration
- missing/inconsistent immutable mapping is an integrity failure, not an auto-repair condition

### Audit this choice against alternatives

Explicitly compare it with:

- live FK + RESTRICT
- live FK + CASCADE
- SET NULL + preserved historical ID
- historical mapping + separate mutable live-reference table

Determine whether the proposed no-live-FK model is actually the safest minimal design in this repository.

Pay particular attention to whether database insertion guards can establish sufficient historical tenant/Project/type proof without a continuing live FK.

---

# B. Canonical Service Type → blueprint relationship

## Proposed table: `service_type_blueprint_bindings`

Purpose: explicit trusted configuration from a workspace Service Type to a Systems Template.

Proposed columns:

- `id TEXT PRIMARY KEY`
- `workspace_id TEXT NOT NULL`
- `service_type_id TEXT NOT NULL`
- `template_id TEXT NOT NULL`
- `enabled INTEGER NOT NULL DEFAULT 1`
- `revision INTEGER NOT NULL DEFAULT 1`
- `created_by_membership_id TEXT NULL`
- `updated_by_membership_id TEXT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Proposed invariants:

- one binding per `(workspace_id, service_type_id)` in D2 v1
- same-workspace Service Type and Template
- Template must be `kind = systems`
- binding points to a Template family, **not** a Template Version
- later preparation resolves the exact current published version server-side
- binding has a stable row identity and optimistic `revision`
- identity fields are immutable
- update increments revision
- binding may be enabled/disabled or repointed for **future** generation
- receipt snapshots the historical binding ID/revision/template identity
- receipts do not FK to the mutable binding row
- deletion of current binding is permitted because committed receipts retain their own immutable source snapshot
- recreating configuration produces a new binding ID
- no Service Type slug or display-name inference
- having a Service Type slug `ghl` grants nothing without an explicit binding
- binding does not replace relational Systems classification or authorization

Trusted resolution path proposed for later Slice 3:

`Project → Service Engagement → Service Type → blueprint binding → Systems Template → exact published Version`

The Template's stable blueprint family key may be `ghl_build`; this is Template identity, not a reserved Service Type slug.

Audit whether this is the correct canonical relationship or whether an existing repository field/table should be used instead.
Specifically inspect `service_engagements.source_template_version_id` and explain whether it is suitable or unsuitable for this contract.

---

# C. Generation receipt design

## Proposed table: `systems_blueprint_generations`

One immutable committed-generation receipt per Project.

Proposed columns, all NOT NULL unless repository constraints force a justified exception:

- `id` — server UUID
- `workspace_id`
- `project_id`
- `receipt_schema_version` — initially 1
- `template_version_id` — exact immutable source version
- `request_id` — normalized lowercase UUIDv4 retry identity
- `normalized_request_hash` — SHA-256 of canonical request envelope
- `definition_hash`
- `definition_schema_version`
- `compiler_version`
- `blueprint_key`
- `selected_component_keys_json`
- `compiled_plan_json`
- `compiled_plan_hash`
- `source_client_id`
- `source_service_engagement_id`
- `source_service_type_id`
- `source_department_id`
- `source_template_id`
- `source_binding_id`
- `source_binding_revision`
- `initiated_by_membership_id`
- `initiated_by_user_id`
- `created_at`

Proposed uniqueness/indexing:

- primary key `id`
- unique `(workspace_id, project_id)` — one generation per Project
- unique `(workspace_id, request_id)` — request identity may not be reused for another Project
- unique `(workspace_id, project_id, id)` for mapping parent FK
- index `(workspace_id, template_version_id)`
- index `(workspace_id, initiated_by_membership_id)`

Proposed live FKs with RESTRICT:

- workspace
- Project
- Template Version
- initiating Membership

Proposed **historical snapshots, not FKs**:

- source Client
- source Service Engagement
- source Service Type
- source Department
- source Template
- source Binding
- initiating User ID

Insertion guard must validate these relationships at commit time.

Audit whether this mixture of live FKs and historical snapshot IDs is coherent.

### Parent-retention question

The proposed receipt intentionally retains its Project, exact Template Version and initiating Membership through RESTRICT FKs.
This means D2 can indirectly prevent future deletion/purge of those aggregate/source rows even though it does not block generated child deletion.

This is an explicit unresolved product/data-retention policy, not something to wave away.

Audit:

- whether retaining Project is required
- whether retaining Template Version is required
- whether retaining initiating Membership is required
- whether any of these should instead be immutable historical IDs without live FKs
- implications for future workspace/client/project/member purge
- consistency with current Activity/onboarding history behavior

Do not silently approve parent retention just because existing repository records also use RESTRICT.

---

# D. Request identity and replay envelope

Proposed canonical normalized request hash envelope:

```json
{
  "receiptSchemaVersion": 1,
  "workspaceId": "...",
  "projectId": "...",
  "templateVersionId": "...",
  "definitionHash": "...",
  "definitionSchemaVersion": 1,
  "compilerVersion": 1,
  "blueprintKey": "...",
  "selectedComponentKeys": ["..."]
}
```

No timestamp, actor identity or current live status belongs in the replay hash.

Desired future replay semantics:

- same request ID + same normalized envelope + current authority → return original receipt
- same request ID + different input or Project → conflict
- different request ID + already-generated Project → conflict
- later Work edits/deletions → preserve original receipt; never reset/regenerate
- later publication/binding changes → replay original receipt, do not reinterpret against newest config
- revoked current membership/scope → deny replay; request ID is never authority

Audit whether the envelope contains enough identity to distinguish semantically different generation requests and no mutable/nonsemantic data.

---

# E. Generated-item mapping constraints

Proposed table: `systems_blueprint_generation_items`

Proposed constraints:

- PK `(generation_id, entity_kind, logical_key)`
- UNIQUE `(generation_id, logical_key)` because Slice 1 logical keys are cross-kind unique
- UNIQUE `(entity_kind, original_entity_id)` to prevent historical identity reuse
- index `(workspace_id, project_id, generation_id)`
- composite FK `(workspace_id, project_id, generation_id)` → receipt corresponding unique key, RESTRICT
- CHECK `entity_kind` is one of milestone/action/deliverable
- logical key follows Slice 1 grammar/length
- original entity ID is UUIDv4

Insertion guard must:

1. resolve exact parent receipt
2. confirm the logical key belongs to the correct plan collection/kind
3. resolve the matching live Work row with exact UUID/workspace/Project
4. check its generated initial shape against the original plan
5. check Action→Milestone generated relationships through the same receipt/mapping set
6. reject conflicting historical identities

Dependency provenance remains in `compiled_plan_json`; do **not** create separate historical dependency mapping rows merely because live dependency edges can later be removed.

Audit whether the uniqueness keys and insertion-time proof are sufficient and not over-constraining.

---

# F. Immutability and trigger model

Proposed new/extended guards include:

### Binding
- insert guard validating Systems Template and tenant shape
- update guard preserving identity, legal target and revision increment

### Generation receipt
- insert guard validating source chain, exact version/compiler/definition metadata, actor attribution and snapshot coherence
- no update
- no delete

### Generated mapping
- insert guard validating typed plan key and original live ownership/shape
- no update
- no delete

### Systems Template / Template Version
- preserve Systems family/template identity once used
- protect immutable version identity/creator/creation metadata
- legal publication transitions
- retain historical Systems versions

### Generated live Work rows
- prohibit changing mapped entity identity/parent/request-key fields
- reject reuse of deleted historical generated UUIDs
- **do not** block ordinary operational edits
- **do not** add a D2 deletion prohibition

Audit all of this for:

- `INSERT OR REPLACE` / REPLACE-style attacks
- SQL NULL behavior in CHECK constraints
- recursive trigger assumptions
- foreign-key action interactions
- update of composite identity fields
- UUID reuse
- accidental lifecycle locking
- accidental permanent no-delete policy
- consistency with existing migration/trigger conventions

If the trigger inventory is overengineered, say so and identify a smaller set that proves the actual invariants.

---

# G. Default Systems Template/version provisioning

Proposed default:

- Template kind: `systems`
- Template family/slug/key: `ghl_build`
- initial version: 1
- definition is exactly merged `GHL_BUILD_BLUEPRINT_V1`
- validated immutable version/hash
- does not generate Project/Work rows

Proposed provisioning rule:

- insert canonical default Template only when absent; do not overwrite existing metadata/active state
- initialize V1 **only if the active canonical default Template has zero versions**
- if any version exists — draft, published or retired — leave all history/publication state untouched
- do not silently publish a fallback when a workspace intentionally has no currently published version
- an interrupted bootstrap may resume an empty default Template
- provisioning occurs only from explicit bootstrap/provisioning flows, never from GET/read requests
- default provisioning must **not** guess a Service Type binding
- bindings require explicitly supplied trusted same-workspace Service Type IDs
- no slug-based backfill of existing catalogue rows

Audit this against current onboarding default/template behavior and determine whether it preserves workspace customization safely.

### Explicit unresolved policy

Decide whether this should be approved:

> An existing active canonical `ghl_build` Systems Template with **zero versions** is treated as resumable initial provisioning; any existing version prevents automatic initialization.

Look for edge cases involving an intentionally empty Template, inactive Template, interrupted bootstrap, or custom user-created family collisions.

---

# H. D1 feasibility

Merged Slice 1 maximum default plan currently compiles to:

- 13 Milestones
- 14 Actions
- 8 Deliverables
- 20 dependency edges
- 35 generated Work entities
- 4,966-byte normalized definition
- 6,628-byte compiled plan

The generic compiler safety ceiling allows up to 49 dependency edges.

Prior design estimated a maximum generation might eventually write roughly:

- 1 receipt
- 35 immutable mappings
- 35 canonical Work entities
- 20 edges
- up to 56 creation/dependency/generation-summary Activity rows

≈147 rows for the approved default manifest, ≈205 rows under the generic 49-edge ceiling if Activity is emitted individually.

Audit D1 feasibility using current official limits and actual repository adapter patterns.

Do **not** design the Slice 4 writer here, but determine whether anything in the proposed Slice 2 storage schema makes the future one-atomic-batch requirement obviously infeasible.

Check:

- bind/parameter limits
- query/statement counts
- row/string limits
- batch duration assumptions
- Free vs Paid limits where relevant
- whether future bounded multi-row insert/insert-select patterns appear necessary

Require Slice 4 to prove exact SQL/bind/query counts and native D1 rollback/receipt behavior later.

---

# I. Security/tenant boundaries

Audit these assumptions:

- configuration/binding grants no business-record authority
- later generation still requires fresh Project authorization and existing delivery permissions
- restricted Project assignment rules remain unchanged
- Team/Client roles gain no generation authority
- all storage relationships are workspace-scoped
- provenance is never added to broad Work/Project/portal DTOs
- full historical plan/labels need explicit internal management authorization when later read
- request IDs are retry identity only, never bearer credentials
- historical actor IDs are attribution only, never current authority
- no credentials/provider secrets/access tokens are stored

---

# J. Three explicit product/data-policy approvals

The design pass identified these decisions that require explicit approval before implementation.

Audit each and return **APPROVE / REVISE / REJECT** with reasoning:

1. **Parent retention:** committed receipt retains live FKs to Project, exact Template Version and initiating Membership; future aggregate purge is a separately designed feature.
2. **Binding configuration:** Service Type→Template bindings are created only from explicit trusted Service Type IDs; existing catalogue rows are never auto-bound by slug/name.
3. **Bootstrap resumability:** active canonical default Systems Template with zero versions may be initialized/resumed automatically by explicit bootstrap; any existing version prevents automatic initialization.

If you recommend a change, give the smallest design correction.

---

# K. Proposed implementation slicing

The design proposes:

### 2A — Binding storage
Only binding schema/migration/direct constraint tests.
No Project eligibility wiring.

### 2B — Immutable provenance storage
Receipt/mapping schema, guards, deletion-safe historical identity and schema/migration tests.

### 2C — Systems Template/version primitives
Systems definition publication/read helpers reusing existing Template mechanisms and merged Slice 1 validation/compiler.

### 2D — Explicit defaults/bootstrap integration
Default Systems Template/version provisioning plus explicitly configured bindings only.

### 2E — Storage gate verification
Fresh/zero-to-current migration, rerun, local/native D1 constraint checks, full suite/build and independent review.

Audit whether this ordering is safe.
In particular, determine whether 2A can genuinely be implemented independently before 2B without committing to a flawed source/provenance contract.

---

# Required adversarial checks

Try to break the design conceptually with at least these cases:

1. generated Action is later deleted after its dependencies are removed
2. deleted generated UUID is manually reused
3. mapping inserted for a same-UUID row in the wrong Project
4. mapping kind says `action` but UUID belongs to a Deliverable
5. receipt request ID reused for another Project
6. same Project receives two concurrent request IDs
7. binding changes between preview and future generation commit
8. bound Template is retired/replaced after a successful generation
9. initiating Membership later revoked/deleted
10. Project later becomes inaccessible/restricted
11. `INSERT OR REPLACE` attempted against immutable receipt/mapping
12. malformed JSON passes SQL CHECK via NULL semantics
13. Systems Template exists with zero versions after interrupted bootstrap
14. Systems Template exists with retired-only versions
15. custom workspace already owns a `ghl_build` family
16. foreign-workspace Service Type/Template supplied to binding
17. binding row is deleted/recreated with same Service Type
18. live generated child is edited before an idempotent replay
19. live generated child is deleted before replay
20. source Project/Service/Client relationship is later changed or retired where repository semantics permit

For each, state the expected invariant/outcome.

---

# Verdict

Return exactly one overall verdict:

- **PASS**
- **PASS WITH REQUIRED DESIGN CORRECTIONS**
- **FAIL — REDESIGN REQUIRED**

For every issue, include:

- severity
- affected proposed table/constraint/trigger/policy
- repository or D1 contract it conflicts with
- smallest safe correction
- whether it blocks **2A**, **2B**, or all Slice 2 implementation

Then provide:

1. final recommended provenance/deletion model
2. final recommended Service Type→blueprint binding model
3. final recommended receipt/mapping key/FK strategy
4. final recommendation on the three explicit product/data-policy approvals
5. any trigger simplifications or missing guards
6. D1 feasibility judgment
7. security/tenant judgment
8. whether implementation may begin with **2A only**
9. exact hard gates that must remain deferred to Slice 4

Do not modify files.
Do not create implementation branches.
Do not implement fixes.
Do not open a PR.
Do not begin Slice 2 implementation.
