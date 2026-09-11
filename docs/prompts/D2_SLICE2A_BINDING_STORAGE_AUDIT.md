# D2 Slice 2A — Independent Binding Storage Audit

You are performing an independent review only. Do not implement fixes unless explicitly authorized after the audit.

## Canonical base and candidate

Canonical merged base:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

Local candidate branch:

`feat/d2-slice2a-binding-storage`

Local candidate commit:

`7ba4fc1e1c1fd8f56efae754f7bd82c534b1b1fc`

The candidate has not been pushed. Inspect it from the existing local repository.

D2 Slice 2A scope is intentionally narrow: binding storage plus the minimum bound-Template identity protection required to keep the binding invariant true. No receipts/mappings, provisioning, generation, Project eligibility, APIs, UI, provider execution, or Slice 2B+ work is authorized.

Performance remains closed.

## First gate

Before auditing:

1. Fetch remote refs.
2. Verify `origin/main` still equals the canonical base above.
3. Verify the local candidate is exactly the stated commit and based on that base.
4. Verify the working tree is clean.
5. Read completely:
   - `docs/RELEASE_D.md`
   - `docs/phases/D2_SLICE1.md`
   - `docs/phases/D2_SLICE2A.md`
   - `docs/BUILD_STATE.md`
   - `lib/bloomops/schema.mjs`
   - `drizzle/0018_d2_slice2a_binding_storage.sql`
   - `drizzle/meta/0018_snapshot.json`
   - `drizzle/meta/_journal.json`
   - `tests/bloomops-blueprint-binding-schema.test.mjs`
   - `tests/bloomops-schema.test.mjs`
   - relevant existing Template, membership, Service Type and migration helpers/tests.

If the candidate/base identity does not match, stop and report the mismatch. Do not audit a different tree silently.

## Audit objectives

### 1. Scope integrity

Confirm the diff contains only the expected 2A work:

- `service_type_blueprint_bindings` schema
- migration/snapshot/journal updates
- bound-Template parent identity protection
- direct storage/constraint tests
- minimal schema-test/doc state updates

Flag any accidental:

- receipt or generated-item storage
- Project eligibility logic
- generation transaction
- provisioning/default Template creation
- API/UI routes
- provider execution
- authorization expansion
- Slice 2B+ implementation

### 2. Table shape and constraints

Independently inspect `service_type_blueprint_bindings`.

Required design:

- explicit `TEXT NOT NULL` identity/scope columns, including primary key
- stable binding ID
- workspace scope
- explicit Service Type ID
- explicit Systems Template ID
- `enabled` exactly integer 0/1
- `revision` positive safe integer, initial 1
- optional creator/updater membership attribution
- immutable creation timestamp
- mutable update timestamp
- one binding per `(workspace_id, service_type_id)`
- same-workspace FKs for Service Type, Template and optional membership actors
- all FKs restrictive; no cascade/SET NULL introduced

Check that schema.mjs, SQL migration and snapshot are semantically identical.

Check every required identifier rejects NULL, empty strings and embedded NUL where the contract requires that.

Check integer/type predicates are total and do not pass because a SQLite `CHECK` evaluates to NULL.

### 3. Template-kind and parent-side protection

A binding may point only to `templates.kind = 'systems'`.

Critically audit the invariant after the binding already exists.

While any binding references a Template, these Template identity fields must not change:

- `id`
- `workspace_id`
- `kind`
- stable family `slug`

But these must remain normally mutable:

- name
- description
- active
- ordinary update metadata

Audit both outgoing parent changes and incoming identity collisions from another Template.

Test/reason about bindings that are disabled as well as enabled. Disabled bindings must still protect the referenced Template identity.

### 4. Replacement-write protection

This is a priority audit area.

SQLite `REPLACE` behavior can delete conflicts without relying on ordinary delete-trigger behavior. The candidate claims protection independent of `recursive_triggers`.

Attempt to break the design using:

- `INSERT OR REPLACE`
- `UPDATE OR REPLACE`
- conflicts on binding ID
- conflicts on `(workspace_id, service_type_id)`
- explicit physical `rowid` collision paths where applicable
- replacement into a protected Template ID
- replacement into a protected Template `(workspace, kind, slug)` identity

Verify the original protected rows and references survive every rejected write.

Run relevant cases with `PRAGMA recursive_triggers = OFF` and `ON`.

Do not accept a test that only asserts an error if the protected row was actually replaced/deleted before the error.

### 5. Revision/CAS semantics

Audit exact revision rules:

- initial revision exactly 1
- every executed update requires `NEW.revision = OLD.revision + 1`
- no unchanged revision
- no skipped revision
- no fractional/non-integer value
- no zero/negative value
- no overflow beyond the repository safe integer ceiling
- a stale expected revision in future trusted SQL should affect zero rows without mutation
- a no-op configuration request is expected to avoid issuing an update rather than incrementing revision gratuitously

2A does not need to implement an actor-facing helper, but its database constraints must make future CAS behavior possible and unambiguous.

### 6. Attribution semantics

Audit creator/updater membership behavior:

- non-null attribution must be same-workspace
- attribution at the time of creation/update should require a valid active membership if that is what the candidate contract states
- creator identity and creation timestamp are immutable
- later suspension/revocation of a historical creator must not invalidate the binding
- attribution must not grant authority

Check whether database-only enforcement can actually prove “active at operation time”; if this relies on a trigger, verify it. If some aspect belongs in a trusted future domain writer instead, flag documentation/schema mismatch rather than pretending SQL proves it.

### 7. Binding lifecycle

Independently verify:

- duplicate workspace/Service Type binding is rejected
- disable/re-enable succeeds with correct revision
- repoint to another same-workspace Systems Template succeeds with correct revision
- repoint to foreign-workspace or non-Systems Template fails atomically
- explicit binding deletion succeeds
- referenced Template deletion fails through FK
- delete then recreate must use a fresh binding identity; 2A itself does not add a historical tombstone ledger
- no Service Type slug/name inference creates a binding
- empty binding table after migration remains empty

### 8. Migration correctness and repeatability

Audit migration `0018_d2_slice2a_binding_storage.sql` as a real migration, not just schema.mjs.

Verify:

- fresh zero-to-current schema works
- migration rerun semantics match repository ledger expectations
- no hidden data provisioning occurs
- snapshot/journal are internally consistent
- existing databases with no 2A data remain unchanged except for schema objects
- no table rebuild or unrelated schema mutation slipped in
- foreign key behavior is correct with repository PRAGMA settings

Run the existing local migration verifier yourself.

### 9. Trigger inventory

Enumerate every 2A trigger and prove what each one protects.

The implementation handoff reported four binding/Template write guards. Confirm that is accurate and sufficient.

For each trigger, check:

- BEFORE vs AFTER semantics
- INSERT vs UPDATE coverage
- correct old/new-row logic
- multi-row statement behavior
- no dependence on trigger ordering unless explicitly guaranteed
- no accidental blocking of legitimate metadata edits
- no `RAISE(IGNORE)` / partial-success behavior
- replacement paths covered before destructive conflict resolution

### 10. Adversarial acceptance matrix

At minimum independently exercise or inspect tests for all of these outcomes:

1. NULL binding ID or required scope value → reject.
2. Empty/invalid required identifier → reject.
3. Missing Service Type or Template → reject.
4. Foreign-workspace Service Type → reject.
5. Foreign-workspace Template → reject.
6. Non-Systems Template → reject.
7. Duplicate workspace/Service Type binding → reject, original unchanged.
8. Binding ID/workspace/Service Type mutation → reject.
9. Creator/creation timestamp mutation → reject.
10. Disable/re-enable with correct revision → succeed.
11. Repoint to another same-workspace Systems Template with correct revision → succeed.
12. Repoint to foreign/non-Systems target → reject atomically.
13. Invalid boolean or fractional/nonpositive revision → reject.
14. Revision unchanged/skipped/overflowing → reject.
15. Stale expected revision → zero affected rows, no mutation.
16. Non-null invalid/foreign updated actor → reject.
17. Historical creator later suspended → stored configuration remains valid and grants no authority.
18. `INSERT OR REPLACE` via binding ID or Service Type uniqueness → reject; original survives.
19. `UPDATE OR REPLACE` targeting another binding → reject.
20. Explicit rowid replacement/collision path → reject; protected row survives.
21. Bound Template ID/workspace/kind/slug mutation → reject, even if binding disabled.
22. Unrelated Template updated/replaced into bound identity → reject.
23. Bound Template name/description edit → succeed.
24. Bound Template deactivate/reactivate → succeed without changing identity or creating work.
25. Bound Template deletion → reject.
26. Explicit binding deletion → succeed without Template deletion.
27. Delete + recreate using fresh ID → succeed as new identity at revision 1.
28. Service Type named/sluggified `ghl` without binding → nothing created.
29. Empty binding table after migration → still empty.
30. Rejected multi-row mutation → no partial statement changes.
31. Protection behaves the same with recursive triggers OFF and ON.
32. Existing unrelated Template/onboarding behavior remains unchanged.
33. No generated Work, receipt, mapping or provider rows can result from migration or binding operations.
34. No Project eligibility or generation authority is conferred merely by a binding.

If any reported “34 acceptance requirements” are materially different, reconcile them explicitly rather than silently substituting this list.

### 11. Test quality

Do not simply trust the reported counts.

Independently run the focused binding/schema tests and inspect whether the assertions actually prove row survival, state after rejection, and recursive-trigger independence.

Look for:

- tests that only match an error message without checking persisted state
- tests that accidentally share state/order dependence
- missing foreign-key enforcement
- mocked constraints rather than actual migrated SQLite schema
- tests that fail to cover replacement conflict identities
- migration tests that do not inspect the second pass

Run additional adversarial SQL directly if needed.

You do not need to rerun all 5,102 tests unless findings justify it, but verify the reported focused/migration checks independently enough to support your verdict.

### 12. Repository compatibility

Confirm:

- existing Template/onboarding behavior is not broken by parent guards
- ordinary unbound Templates retain their prior legal mutations
- Service Type behavior is unchanged
- schema inventory/table-count expectations are updated intentionally
- generated Drizzle snapshot matches migration semantics
- no dependency/config/workflow changes were introduced

## Audit verdict

Return exactly one:

- `PASS`
- `PASS WITH NONBLOCKING NOTES`
- `FAIL — CORRECTION REQUIRED`

For every finding include:

- severity
- exact file/line or SQL object
- violated contract
- concrete reproduction if applicable
- smallest correction
- whether it blocks push/PR and whether it blocks 2B

Also report:

1. exact base and candidate SHAs audited
2. independently observed trigger/index/FK/check inventory
3. focused tests actually rerun and results
4. migration verifier result
5. recursive-trigger OFF/ON result
6. whether rowid/replacement protection is sound
7. whether revision and attribution semantics are sound
8. whether 2A stayed strictly in scope
9. whether `7ba4fc1e1c1fd8f56efae754f7bd82c534b1b1fc` is safe to push/open for review

## Hard stop

Do not modify files.
Do not commit.
Do not push.
Do not open a PR.
Do not deploy.
Do not begin 2B.
