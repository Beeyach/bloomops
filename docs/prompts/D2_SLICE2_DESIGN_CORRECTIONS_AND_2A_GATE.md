# D2 Slice 2 — Required design corrections and 2A implementation gate

Canonical baseline:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

Performance remains closed. D2 Slice 1 is merged. This task is **design correction and contract freeze only**. Do not edit schema, migrations, runtime code, tests, APIs, UI, bootstrap code, or application behavior. Do not implement 2A yet.

The independent Slice 2 storage/provenance audit returned **PASS WITH REQUIRED DESIGN CORRECTIONS**. The three-table direction remains viable and does not need a redesign. Incorporate the required corrections below into a final implementation-ready Slice 2 design and decide whether corrected 2A is ready to implement.

## Required policy decisions — approved for the corrected design

Treat these as explicit product decisions for D2:

1. **Parent retention — revised policy approved**
   - Deliberately retain the target Project and exact Template Version through receipt foreign keys.
   - Store initiating Membership ID and User ID as validated immutable historical attribution **without adding a new receipt → Membership FK**.
   - This does not promise that workspace/member/project purge is generally supported. Any aggregate purge/retention feature remains separately designed and out of D2.

2. **Explicit trusted Service Type bindings — approved**
   - Use an explicit workspace-scoped Service Type → Systems Template binding.
   - Never infer from Service Type slug, Template display name, Project name, Department label, or other display text.
   - `service_engagements.source_template_version_id` is not repurposed for this relationship.

3. **Zero-version bootstrap adoption — revised policy approved**
   - Do not automatically adopt or initialize a pre-existing empty `systems/ghl_build` Template based only on kind/slug/active state.
   - A pre-existing empty Template requires **explicit initialization of that exact Template ID**.
   - For a newly created canonical default, Template creation + initial version provisioning must be treated as one owned initialization operation where the repository/D1 pattern permits it.
   - Any existing version, including draft-only or retired-only history, prevents automatic fallback initialization.
   - Never silently republish or resurrect a withdrawn publication.

## Required correction 1 — identity and replacement protection

The corrected design must protect immutable/historical identities against all relevant write paths, not only ordinary INSERT/UPDATE.

Explicitly design protections for:

- incoming reuse of a historically reserved generated Milestone/Action/Deliverable UUID via INSERT **or UPDATE** of an unrelated row;
- receipt identity, Project uniqueness and request-ID uniqueness;
- mapping identity and logical-key uniqueness;
- Service Type binding identity;
- bound Systems Template identity/kind;
- Systems Template Version immutable identity/source metadata;
- `INSERT OR REPLACE` / `UPDATE OR REPLACE` or equivalent conflict paths that can remove/replace rows without relying on normal delete triggers;
- correctness independent of `recursive_triggers` behavior.

Do not block legitimate binding configuration updates or legal Template publication transitions.

For generated Work rows, enumerate the protected fields precisely:

- entity ID
- workspace ID
- Project ID
- original `creation_request_id`

Do **not** freeze normal operational fields.

In particular, a generated Action may later be reassigned to another Milestone through existing authorized Work Core behavior. Provenance records the original Action→Milestone relationship in the immutable plan; D2 storage must not turn that original relationship into a permanent live constraint.

## Required correction 2 — binding validity must survive parent mutation

2A may validate `templates.kind = 'systems'` at binding insert/update, but that is insufficient if the referenced Template can later change identity/kind.

The corrected 2A contract must include parent-side protection so that a Template referenced by a Service Type binding cannot silently change the identity fields that make it a valid Systems blueprint family.

Clarify exactly which Template fields are identity and protected while bound versus which metadata remains editable.

At minimum:

- workspace/Template identity cannot change;
- Template kind cannot change away from `systems` while referenced;
- stable family identity used by the binding cannot silently change;
- human-facing metadata such as name/description may remain editable if consistent with existing Template rules;
- active/inactive state must remain a separate configuration concern, not be confused with identity.

Include replacement-path protection tests in corrected 2A acceptance criteria.

## Required correction 3 — total constraints and nullability

Every required identity column in the proposed schema must be explicitly `NOT NULL`, including text primary-key IDs where SQLite would otherwise allow NULL behavior.

For JSON/check constraints:

- malformed/missing fields must evaluate to false, never SQL NULL that passes CHECK;
- validate JSON/type before extracting nested values;
- boolean values must be constrained explicitly;
- revision/version fields must be positive integers where required;
- UTF-8 byte limits must use byte length, not character count;
- canonicalization and SHA-256 validation stay in trusted domain code; SQL checks do not pretend to prove cryptographic hashes.

Document the exact CHECK/guard strategy at design level for each proposed Slice 2 table.

## Required correction 4 — provenance access boundary

Storage can preserve the full immutable compiled plan, but later reads must not equate `project.manage` with permission to see every historical child title/relationship.

Freeze these future read boundaries now:

- provenance never enters ordinary Project/Work/portal DTO spreads;
- idempotent replay acknowledgement can return success/receipt identity without automatically disclosing the full historical plan;
- full historical plan access requires a separate explicit internal policy;
- adopt **Owner/Admin-only full snapshot access as the conservative initial policy** unless an existing narrower safe policy is already proven by repository contracts;
- a deleted or now-restricted child does not grant historical disclosure;
- any presentation filtering happens at read time without modifying immutable stored provenance.

This does not require implementing any read API in Slice 2.

## Corrected storage model to preserve

Unless the corrections above expose a contradiction, retain the audited direction:

### A. `service_type_blueprint_bindings`

One explicit binding per `(workspace_id, service_type_id)` in D2 v1.

Binding points to a Systems Template family, not a specific version.

Expected properties:

- server-generated opaque ID
- explicit NOT NULL identity/scope columns
- same-workspace Service Type + Template references
- enabled flag
- optimistic revision
- created/updated actor attribution when available
- created/updated timestamps
- current configuration may be disabled or repointed using legal revisioned updates
- deletion removes only current configuration; existing receipts retain immutable historical binding ID/revision snapshots and no FK to the binding
- recreation receives a fresh binding ID
- no slug/name inference

### B. `systems_blueprint_generations`

Immutable committed generation receipt.

Retain:

- one generation per workspace/Project
- one request identity per workspace
- exact immutable Template Version FK
- target Project FK
- immutable source-chain IDs
- source binding ID/revision as historical values, not live FK
- initiating Membership/User IDs as validated historical values without new receipt→Membership FK
- canonical selected components
- exact compiled plan JSON/hash
- definition/compiler/schema versions and blueprint family key
- immutable timestamps and hashes

Explicitly account for replacement-write protection across every immutable unique key.

### C. `systems_blueprint_generation_items`

Immutable historical mapping with **no live child FK**.

Retain:

- generation/workspace/Project scope
- typed entity kind
- immutable logical key
- original entity UUID
- composite scoped FK only to the generation receipt
- typed insertion proof against the actual live Work table at mapping creation
- exact initial plan-shape comparison
- same-generation original Action→Milestone proof at insertion
- no new D2 deletion block on generated Work rows
- historical UUID reuse protection for both INSERT and UPDATE paths

Original dependency pairs remain in the immutable compiled plan; do not add a dependency-provenance table.

## Corrected Slice 2 ordering

The independent audit concluded that **2A is not ready as previously written but can stand independently after correction**.

Freeze the implementation sequence as:

### 2A — Binding storage + parent identity protection

Scope only:

- `service_type_blueprint_bindings` schema/migration
- parent Template identity/kind protection required to keep bindings valid
- direct database constraint/trigger tests
- no Project eligibility wiring
- no generation
- no provisioning/default initialization
- no receipt/mapping tables
- no APIs/UI

Required 2A proofs:

- explicit NOT NULL IDs
- cross-workspace parents rejected
- only Systems Templates can be bound
- duplicate Service Type binding rejected
- binding ID/service/workspace identity cannot mutate
- legal enabled/target configuration updates follow revision rules
- replacement writes cannot bypass binding uniqueness/identity protections
- bound Template cannot mutate out of the required Systems family identity
- harmless allowed Template metadata edits remain possible
- delete/recreate binding yields a new identity
- no inferred binding from any slug/display name

### 2B — Immutable provenance storage

Correct receipt/mapping guards, Work historical-ID protections and approved retention policy.

### 2C — Systems Template/version primitives

Publication/source immutability using the corrected identity/replacement protections.

### 2D — Explicit defaults/bootstrap integration

Use the revised explicit initialization policy. No implicit adoption of arbitrary empty family collisions.

### 2E — Storage gate verification

Native D1/migration/full-suite/integration verification. Constraint tests must already exist in each preceding slice; 2E is not the first proof of invariants.

## Slice 4 boundaries remain deferred

Do not move generation transaction logic into Slice 2.

Preserve these Slice 4 gates:

- fresh identity/membership/Project authorization at commit;
- trusted current binding/preparation preconditions;
- existing empty planned Project;
- deterministic recompilation;
- all writes receipt-gated;
- one atomic transaction;
- exact D1 SQL/bind/query/byte budgets;
- native D1 rollback/contention/zero-row tests;
- post-transaction authorized exact-receipt resolution;
- complete immutable receipt/mapping consistency before success/replay;
- lost-response replay without duplication;
- partial/inconsistent provenance is integrity failure, never auto-repair;
- current visibility/authorization always governs access despite historical provenance.

## Task

Produce the **final corrected Slice 2 design freeze**.

Do not implement code.
Do not edit schema/migrations/tests/runtime files.
Do not open a PR.
Do not begin 2A.
Do not modify this prompt.

You may create no repository files during this task unless explicitly instructed by a later prompt. Return the corrected design in your response only.

Your response must contain:

1. final corrected storage model;
2. exact three-table column/key/FK/check design;
3. exact replacement/identity-protection strategy;
4. exact binding parent-side protection strategy;
5. explicit Work fields protected vs still editable;
6. final parent-retention policy;
7. final provenance-read policy;
8. final bootstrap/default-initialization policy;
9. corrected 2A acceptance criteria and adversarial test matrix;
10. confirmation that 2A no longer depends on unresolved policy choices;
11. any remaining blocker that would prevent 2A implementation.

Finish with exactly one verdict:

- `2A READY FOR IMPLEMENTATION`
- `2A BLOCKED — <reason>`

No implementation is authorized by this prompt.