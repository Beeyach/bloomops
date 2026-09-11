# D2 Slice 2 — Storage / Provenance Design Gate

Canonical main candidate:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

Performance remains closed.

D2 Slice 1 is merged. Slice 2 implementation is **not** authorized by this prompt.

This task is DESIGN ONLY. Do not edit application code, schema, migrations, tests, docs, workflows, configuration, or dependencies. Do not open a PR. Do not begin Slice 3 or later work.

## Hard precondition

Before doing any Slice 2 design work, verify BOTH automatic post-merge gates for exact main SHA `77bbb6b3ea7dff0b873e6fa72c583027159942b1`:

- Deploy staging — run `34617425161`
- Verify zero-to-current migration — run `34617425293`

If either run is not completed successfully on that exact SHA, STOP and report the current status. Do not continue the design task.

If both are successful, verify `origin/main` is still exactly `77bbb6b3ea7dff0b873e6fa72c583027159942b1` or explain any newer main commit before proceeding.

## Read first

Read the actual current repository contracts and relevant implementations, including at minimum:

- `docs/RELEASE_D.md`
- `docs/BUILD_STATE.md`
- `docs/phases/D2_SLICE1.md`
- `lib/bloomops/systems-blueprint-definition.mjs`
- `lib/bloomops/systems-blueprint-compiler.mjs`
- `lib/bloomops/systems-blueprint-defaults.mjs`
- `lib/bloomops/schema.mjs`
- existing Template / Template Version schema and migrations
- existing immutable provenance patterns, including onboarding template/version/instance provenance
- `lib/bloomops/onboarding-generation.mjs`
- Work Core Milestone / Action / Deliverable create, retry, update and delete behavior
- Action dependency storage and delete behavior
- Activity/history immutability and visibility rules
- Service Type / Service Engagement / Project relational model
- project authorization / visibility rules
- bootstrap/default provisioning patterns

Use repository behavior as authority. Do not assume a delete API exists or does not exist: inspect it.

## Goal

Produce an implementation-ready Slice 2 design for:

1. immutable blueprint-generation provenance storage
2. generated-item identity mappings
3. safe provenance behavior if live generated Work Core rows are later deleted
4. trusted canonical Project/service-to-blueprint relationship
5. workspace-scoped default GHL blueprint/version provisioning
6. database uniqueness / tenant-isolation invariants required before Slice 3/4

Do NOT design the generation transaction itself beyond the storage invariants Slice 4 will rely on.

## Required decision 1 — Provenance vs live-record deletion

This is the primary Slice 2 design gate.

The merged Slice 1 contract requires that immutable provenance must not:

- disappear because a generated Milestone/Action/Deliverable is deleted
- accidentally make generated Work Core records permanently undeletable through restrictive provenance foreign keys unless that behavior is explicitly approved

Inspect current Work Core deletion semantics and determine the correct storage model.

Evaluate at least these approaches where technically applicable:

A. Hard FK from provenance mapping to live entity with RESTRICT
B. Hard FK with CASCADE
C. Hard FK with SET NULL plus preserved immutable generated entity ID
D. Immutable generated entity ID/type stored without a live FK
E. Separate immutable historical identity plus optional current live reference

For each option explain:

- what happens on live record deletion
- whether immutable provenance survives
- whether tenant integrity remains enforceable
- whether the database can still prove the original entity belonged to the same workspace/project
- whether replay/idempotency remains safe
- whether it silently changes current Work Core deletion policy
- migration / query complexity

Recommend ONE model.

The recommendation must preserve original generated identity permanently while avoiding accidental product-policy changes to Work Core deletion.

If current Work Core records are not deletable today, still design forward-compatible semantics rather than relying on that incidental limitation.

## Required decision 2 — Canonical Project/service-to-blueprint relationship

Slice 1 deliberately does NOT encode `serviceType.slug === "ghl"` or infer platform from names.

Design the trusted relationship used later by preparation/generation to determine that a Project is eligible for the GHL blueprint.

Inspect existing Template / Service Type / Service Engagement relationships first.

Evaluate whether the canonical relationship should be represented by:

- a Service Type → published Systems blueprint/template binding
- Service Engagement → pinned blueprint/version binding
- Project → pinned blueprint/version binding
- an existing template/source field that can safely serve this purpose
- another minimal relational mapping justified by current repository architecture

Requirements:

- no display-name inference
- no magic slug authorization
- workspace-scoped
- tenant-safe at DB and domain layers
- distinguish blueprint family/default from exact immutable version
- new template publication must not mutate already generated provenance
- later Slice 3 preview must be able to resolve a trusted exact published version server-side
- configuration should support later Kajabi D3 without forcing provider-specific schema duplication

Recommend ONE relationship model and explain why it is the smallest reusable design.

## Required decision 3 — Generation receipt schema

Design the immutable generation receipt table proposed during D2 scoping.

At minimum decide exact columns / constraints for:

- id
- workspace
- Project
- exact template version
- request identity
- normalized request hash
- definition hash
- definition schema version
- compiler version
- normalized selected-component snapshot
- compiled-plan snapshot and/or plan hash
- historical source identifiers necessary to explain eligibility at generation time
- initiating membership / user identity
- server timestamp

Determine which fields should be relational columns vs immutable JSON snapshots.

The design must support these future Slice 4 outcomes:

- same request ID + same normalized input → authorized replay of original receipt
- same request ID + different input/project → conflict
- different request ID on already-generated Project → already-generated conflict
- exactly one generation per Project in D2 v1
- retries after human edits return original generation without resetting work
- revoked users cannot use possession of a request key as authority

Do not implement these behaviors yet. Design only the storage invariants needed to make them possible.

## Required decision 4 — Generated-item mapping schema

Design immutable mapping rows for the original generated entities.

Need to represent:

- generation
- workspace
- Project
- entity kind (`milestone`, `action`, `deliverable`)
- Slice 1 logical key
- original generated opaque entity UUID
- any optional live-reference mechanism chosen by Required Decision 1

Requirements:

- one mapping per generation/entity-kind/logical-key
- one original generated identity per mapping
- typed entity kinds, not an unconstrained arbitrary polymorphic identifier
- no title/name-based identity
- no cascade that erases provenance
- cross-workspace/project mismatches rejected
- later replay can return original identities even after operational edits

Explain indexes, unique constraints, CHECK constraints and FK strategy.

## Required decision 5 — Default GHL blueprint/version provisioning

Slice 2 is expected to provision the approved Slice 1 manifest through existing Template/version patterns.

Design how the default is created for a workspace.

Requirements:

- reuse permanent Template rules
- workspace-scoped
- immutable published version
- idempotent provisioning
- repeated bootstrap does not overwrite workspace customization
- GET/read routes never repair or provision data as a side effect
- existing workspace configuration is not silently replaced when code defaults evolve
- definition/hash/version/compiler compatibility verified before publishing
- future Kajabi defaults can reuse the mechanism

Determine whether the current bootstrap path is appropriate and identify the exact existing pattern to reuse.

Do not write the bootstrap code yet.

## Required decision 6 — Immutability and retention

Specify exact mutation policy for:

- generation receipts
- generated-item mappings
- blueprint/template versions referenced by receipts
- service/project blueprint bindings

Clarify:

- which tables are update/delete forbidden
- which configuration rows may change for future generations
- whether referenced template versions can be retired but must remain stored
- how foreign-key retention is enforced
- whether a workspace/project/client deletion path exists and what should happen to immutable D2 records

Do not hand-wave database deletion chains. Trace current parent-delete behavior where it exists.

## Required decision 7 — Schema / migration shape

Produce the proposed schema diff in design form only.

For every proposed new table/index/constraint/trigger include:

- name
- purpose
- columns and types
- primary/unique keys
- indexes
- FKs and delete actions
- CHECK constraints
- immutability triggers

Favor the smallest extension. Do not add:

- Systems lifecycle/status tables
- generation job/queue tables
- failed/running checkpoint rows
- provider credentials/resources
- duplicate Work Core state
- automatic repair metadata
- attempt telemetry

## Required decision 8 — Limits and D1 feasibility

Using the merged Slice 1 maximum plan:

- 13 Milestones
- 14 Actions
- 8 Deliverables
- up to 20 default-manifest dependency edges
- generic compiler edge safety ceiling 49

Estimate Slice 2 storage row counts and future Slice 4 transaction statement/bind implications.

Check against current repository/D1 constraints and existing Work Core limits.

Do not redesign Slice 1 bounds unless a concrete incompatibility is proven.

If the future full generation cannot safely fit one atomic D1 batch, identify that as a blocking design issue now. Do not propose silently splitting generation across independently committed batches.

## Security / authorization boundary

Slice 2 schema must make future tenant mistakes difficult even if domain code is wrong.

Design for:

- same-workspace composite relationships where available
- same-Project generated mappings
- no cross-workspace version binding
- no cross-Project generated-item mapping
- provenance unavailable to broad Client DTO spreads
- initiating user/membership history without turning historical membership into current authority

Do not add new authorization capabilities in this design unless current actions cannot express the required later behavior; if one is genuinely needed, justify it explicitly rather than adding it silently.

## Scope boundaries

This prompt does NOT authorize:

- schema changes
- migrations
- default provisioning code
- generation writer
- preview/read API
- UI
- Project eligibility implementation
- direct GHL/Kajabi APIs
- queues/workflows
- Slice 3–6 implementation
- performance work

## Output

Return a structured design review containing:

1. verified main/gate status
2. current repository facts discovered
3. recommended provenance/deletion model
4. recommended canonical service/Project-to-blueprint relationship
5. exact proposed generation receipt schema
6. exact proposed generated-item mapping schema
7. default provisioning design
8. immutability/retention policy
9. proposed migration/schema objects
10. D1 transaction/limit feasibility assessment
11. security/tenant-isolation invariants
12. alternatives rejected and why
13. unresolved decisions, if any
14. risks
15. exact Slice 2 implementation slices in recommended order
16. recommended first Slice 2 implementation step
17. whether an independent design audit is required before schema implementation

Do not modify files.
Do not commit.
Do not push.
Do not open a PR.
Do not begin implementation.
