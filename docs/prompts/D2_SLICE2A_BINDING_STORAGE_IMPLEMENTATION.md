# D2 Slice 2A — Binding storage implementation

## Starting point

Canonical verified main:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

D2 Slice 1 is merged. Performance remains closed.

This prompt authorizes **D2 Slice 2A only**.

Do not begin 2B, 2C, 2D, 2E, Slice 3, Slice 4, D3–D7, or any performance work.

Before editing:

1. Fetch latest remote refs.
2. Verify `origin/main` is still exactly the SHA above. If it moved, STOP and report the new SHA without rebasing or implementing.
3. Verify the post-merge gates for that SHA have already succeeded.
4. Read completely:
   - `docs/RELEASE_D.md`
   - `docs/BUILD_STATE.md`
   - `docs/phases/D2_SLICE1.md`
   - the current schema/migrations around Templates, Service Types, memberships and existing immutability triggers
   - existing schema test patterns
5. Create a fresh implementation branch from exact main, e.g. `feat/d2-slice2a-binding-storage`.

## Scope

Implement only:

1. `service_type_blueprint_bindings` storage.
2. Its schema/migration objects.
3. Necessary bound-Template parent identity/kind protection.
4. Direct database constraint/trigger tests.
5. Minimal existing schema-test expectation updates and D2 state documentation required to describe Slice 2A.

Do **not** add:

- generation receipts
- generated-item mappings
- Project eligibility wiring
- Project/service lookup APIs
- generation transactions
- preview APIs
- UI
- provisioning/default initialization
- provider execution
- template publishing APIs
- direct GHL/Kajabi integration
- any inferred `serviceType.slug === "ghl"` behavior

An empty binding table after migration is correct.

## Approved binding model

Create exactly one new table for this slice:

`service_type_blueprint_bindings`

Columns:

- `id` — TEXT NOT NULL primary key, server/database-generated opaque identity using the repository’s existing ID convention.
- `workspace_id` — TEXT NOT NULL.
- `service_type_id` — TEXT NOT NULL.
- `template_id` — TEXT NOT NULL.
- `enabled` — INTEGER NOT NULL DEFAULT 1, exactly 0 or 1.
- `revision` — INTEGER NOT NULL DEFAULT 1, positive safe integer.
- `created_by_membership_id` — nullable TEXT.
- `updated_by_membership_id` — nullable TEXT.
- `created_at` — TEXT NOT NULL using existing server/database timestamp convention.
- `updated_at` — TEXT NOT NULL using existing timestamp convention.

Keys/indexes:

- PK `(id)`.
- UNIQUE `(workspace_id, service_type_id)`.
- INDEX `(workspace_id, template_id)`.
- Add appropriate lookup indexes for nullable membership FKs when consistent with repository conventions.

Foreign keys:

- `workspace_id -> workspaces.id`.
- `(workspace_id, service_type_id) -> service_types(workspace_id, id)`.
- `(workspace_id, template_id) -> templates(workspace_id, id)`.
- Each non-null actor reference uses `(workspace_id, membership_id) -> workspace_memberships(workspace_id, id)`.

All new FKs:

- `ON DELETE RESTRICT`
- `ON UPDATE NO ACTION`

Do not cascade configuration/provenance identity.

## Binding invariants

### Required value constraints

- Every required identity/scope field is explicitly NOT NULL.
- Required identifiers are nonempty TEXT without embedded NUL.
- `enabled` is exactly integer 0 or 1.
- `revision` is stored as INTEGER and must stay within `1..9007199254740991`.
- Initial revision is exactly 1.
- Revision increments must not overflow.

### Template target

A binding may point only to a same-workspace Template whose `kind = 'systems'`.

Do not require the Template to be active or published in Slice 2A. Those are later generation/preparation concerns.

Binding to an inactive Systems Template is valid configuration but does not make it eligible for generation.

### Immutable binding fields

Once inserted, these cannot change:

- `id`
- `workspace_id`
- `service_type_id`
- `created_by_membership_id`
- `created_at`

Mutable configuration fields are limited to:

- `template_id`
- `enabled`
- `updated_by_membership_id`
- `updated_at`
- `revision` under the revision contract

Every executed update must satisfy:

`NEW.revision = OLD.revision + 1`

Future application writers will also use `WHERE revision = expectedRevision`; a zero-row CAS is not success. Slice 2A only needs storage/constraint support, not a new management API.

A no-op configuration request should eventually return unchanged without issuing an update; do not force no-op update support into this slice if no writer exists yet.

### Attribution

If creator/updater membership IDs are non-null at insertion/update time, they must resolve to an active same-workspace membership for that operation.

Historical suspension/revocation later does not invalidate the stored binding and grants no authority.

## Bound-Template parent-side protection

The binding invariant must remain true even if someone later mutates a Template directly.

While a Template has any binding, enabled **or disabled**, protect these Template fields:

- `id`
- `workspace_id`
- `kind`
- `slug`

The bound Template must remain `kind = 'systems'`.

Permitted Template edits while bound:

- `name`
- `description`
- `active`
- normal metadata/update timestamp behavior

Changing `active` must not mutate the binding or create work.

Deleting a referenced Template must fail through the FK.

Deleting a binding itself is permitted in Slice 2A.

After the binding is deleted, no permanent tombstone policy is introduced by 2A.

## Replacement-write protection

This is a hard requirement from the independent design audit.

Do not rely on ordinary DELETE triggers or `recursive_triggers` behavior to protect identity.

SQLite `REPLACE` can delete conflicting rows before insertion, so protection must operate on the incoming write and every relevant unique identity.

For bindings protect against replacement/collision through:

- binding `id`
- `(workspace_id, service_type_id)`
- physical row/rowid collision where applicable

For bound Templates protect against incoming replacement/collision through:

- Template `id`
- `(workspace_id, id)`
- `(workspace_id, kind, slug)` or the exact repository unique family identity
- physical row/rowid collision where applicable

On UPDATE:

- preserve protected OLD identity
- reject NEW identity that collides with another protected/bound row

`INSERT OR REPLACE` and `UPDATE OR REPLACE` must not silently remove a protected binding or bound Template.

Test protection with `recursive_triggers` both OFF and ON.

Use ordinary INSERT/UPDATE semantics for legitimate writes. Do not implement REPLACE as the normal configuration update mechanism.

## Required trigger/constraint responsibilities

Use the smallest clear schema/trigger set that proves the contract.

At minimum, implement equivalent protection for:

- binding insert target validity (`kind = 'systems'`, tenant scope, valid actors)
- binding update identity/revision/target validity
- binding replacement collisions
- bound Template outgoing identity/kind/slug mutation
- incoming Template replacement/collision into a bound Template identity

Do not over-generalize existing Template behavior unrelated to bound Systems Templates.

Do not introduce Systems Version protections yet unless they are strictly required to make 2A correct. Version primitives belong to 2C.

## Acceptance/adversarial matrix

Add direct tests against actual migrated SQLite-backed repository schema, not mocked constraint outcomes.

Every case below must be explicitly tested or covered by an equivalent stronger test:

1. NULL binding ID or required scope value -> reject, including replacement forms.
2. Empty/invalid required identifier -> reject.
3. Missing Service Type -> reject.
4. Missing Template -> reject.
5. Foreign-workspace Service Type -> reject.
6. Foreign-workspace Template -> reject.
7. Non-Systems Template -> reject.
8. Duplicate `(workspace, Service Type)` binding -> reject; original unchanged.
9. Binding `id/workspace/service_type` mutation -> reject.
10. Creator/creation timestamp mutation -> reject.
11. Disable/re-enable with exactly next revision -> succeed; preserve identity.
12. Repoint to another same-workspace Systems Template with exactly next revision -> succeed.
13. Repoint to foreign or non-Systems Template -> reject atomically.
14. Invalid boolean -> reject.
15. Fractional/zero/negative/overflowing revision -> reject.
16. Revision unchanged, skipped or overflowed -> reject.
17. Stale expected revision semantics are representable as zero-row CAS; no mutation.
18. Non-null invalid/foreign updated actor -> reject.
19. Historical creator later suspended -> stored binding remains valid and gains no authority.
20. `INSERT OR REPLACE` collision by binding ID -> reject; original survives.
21. `INSERT OR REPLACE` collision by Service Type uniqueness -> reject; original survives.
22. `UPDATE OR REPLACE` targeting another binding -> reject.
23. Replacement through explicit rowid/physical collision, where applicable -> reject; protected row survives.
24. Bound Template `id/workspace/kind/slug` mutation -> reject while binding exists, even when disabled.
25. Unrelated Template updated/replaced into bound Template unique identity -> reject.
26. Bound Template `name/description` edit -> succeed.
27. Bound Template deactivate/reactivate -> succeed without altering binding.
28. Bound Template delete while referenced -> reject through FK.
29. Explicit binding delete -> succeed; Template remains.
30. Recreate configuration afterward using a fresh server/database-generated ID -> revision 1, new identity.
31. Service Type named or slugged `ghl` without explicit binding -> no binding exists; no automatic behavior.
32. Empty binding table immediately after migration -> remains empty.
33. Rejected multi-row mutation -> no partial statement changes.
34. Repeat critical replacement suite with `recursive_triggers = OFF` and `ON`; protection remains equivalent.

Also rerun relevant existing Template/onboarding/schema tests to prove unrelated Template behavior is unchanged.

## Migration/schema integration

Follow the repository’s existing Drizzle/migration conventions.

Expected implementation surfaces may include:

- `lib/bloomops/schema.mjs`
- one new ordered migration after current head
- schema snapshot/metadata files if this repo requires them
- direct D2 2A schema/constraint tests
- existing schema inventory/table-count expectations
- `docs/BUILD_STATE.md`
- a durable `docs/phases/D2_SLICE2A.md` contract/evidence file if consistent with prior phase documentation
- `docs/INDEX.md` only when needed for discoverability

Do not manually edit generated metadata incorrectly. Use the repository’s established generation process where applicable and review the resulting migration.

## Verification

Before committing:

1. Run the focused new 2A tests.
2. Run directly affected existing Template/onboarding/schema tests.
3. Run migration from zero to current locally using the existing verifier.
4. Run the migration a second time if the verifier supports idempotency/rerun proof.
5. Run the full test suite.
6. Run the normal Next/Cloudflare build used by the repository.
7. Run syntax checks and `git diff --check`.
8. Inspect the final diff for accidental 2B+ scope.

If the inherited full suite requires the known external `python -> python3` PATH shim, use only the same external temporary approach already documented. Do not commit a workaround or dependency change.

Do not deploy staging or production during this implementation task.

## Commit and stopping point

If and only if all required 2A verification passes:

- Commit the implementation on the fresh 2A branch.
- Keep the working tree clean.
- Do **not** push.
- Do **not** open a PR.
- Do **not** begin 2B.

Report:

1. implementation branch
2. commit SHA
3. exact files changed
4. migration name/number
5. schema/trigger/index inventory
6. acceptance matrix results
7. focused/full test counts
8. migration verifier result
9. build result
10. explicit confirmation no receipt/mapping tables, provisioning, APIs, UI, eligibility wiring, generation transaction, or later-slice work was added
11. any remaining concerns requiring independent audit

If any invariant cannot be implemented cleanly within 2A without pulling in 2B+, STOP and report the conflict instead of broadening scope.

Do not modify this prompt file.