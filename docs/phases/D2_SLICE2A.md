# D2 Slice 2A — explicit blueprint binding storage

## Base and boundary

Implemented locally on `feat/d2-slice2a-binding-storage` from exact canonical
main `77bbb6b3ea7dff0b873e6fa72c583027159942b1` (merged D2 Slice 1).
Before editing, remote refs and the successful exact-SHA post-merge jobs were
verified: [Deploy staging 34617425161](https://github.com/Beeyach/bloomops/actions/runs/34617425161)
and [Verify zero-to-current 34617425293](https://github.com/Beeyach/bloomops/actions/runs/34617425293).

This is configuration storage, not generation authority. No receipt/mapping
tables, Project eligibility, lookup/preview/management API, UI, provisioning,
default initialization, publishing, provider execution or generation transaction
is implemented. An empty binding table is correct. A Service Type's name or
slug (including `ghl`) grants nothing. Performance remains closed. 2B and later
slices require separate authorization; this branch must not be pushed or opened
as a PR during this task.

## Storage contract

`service_type_blueprint_bindings` has exactly ten columns:

| Column | Contract |
|---|---|
| `id` | Explicit TEXT NOT NULL PK, existing database default `lower(hex(randomblob(16)))` |
| `workspace_id`, `service_type_id`, `template_id` | Required TEXT, nonempty, no NUL; composite references enforce tenant ownership |
| `enabled` | INTEGER 0/1, default 1 (Drizzle boolean helper emits equivalent SQL `true`) |
| `revision` | INTEGER 1..9,007,199,254,740,991; starts at exactly 1 |
| `created_by_membership_id`, `updated_by_membership_id` | Nullable same-workspace membership references |
| `created_at`, `updated_at` | Required TEXT, existing UTC millisecond ISO timestamp defaults |

`id` has the same nonempty TEXT/no-NUL constraint as the required scope fields.
SQLite affinity applies before constraints: the guarantees describe stored
values, not a future API's input validation. Explicit NULL in any required
column is refused before `REPLACE` can substitute a default; omitting a column
with a default remains valid.

Exactly five FKs use **ON DELETE RESTRICT / ON UPDATE NO ACTION**: workspace,
same-workspace Service Type, same-workspace Template and both optional actors.
Exactly four explicit indexes: unique `(workspace_id, service_type_id)` plus
lookup `(workspace_id, template_id)`, `(workspace_id, created_by_membership_id)`
and `(workspace_id, updated_by_membership_id)`. The PK adds SQLite's automatic
unique index. There are six CHECK constraints (four identifiers, boolean,
safe-integer revision).

A target must be a same-workspace `systems` Template; active/publication/version
requirements are deliberately absent. Binding an inactive, unpublished Template
is valid configuration but is not evidence of generation eligibility.

Binding ID, workspace, Service Type, creator and creation timestamp are immutable.
Template, enabled state, updater and update timestamp may change only with
`NEW.revision = OLD.revision + 1`, without overflow. A revision-only update also
increments; a future no-op writer should avoid issuing an UPDATE. Storage supports
`WHERE id = expectedBindingId AND revision = expectedRevision` within workspace
scope: stale CAS returns zero changes, not success. Comparing the binding ID
also prevents a stale writer from targeting recreated configuration at revision 1.
No management writer or request outcome contract is added here.

On insert both supplied actors must be active in the same workspace. On update
the supplied/resulting updater must be active; the immutable historical creator
is not revalidated. A suspended creator does not invalidate stored configuration.
If a former updater is suspended, a subsequent writer must attribute the update
to an active membership (or use the permitted null attribution), not retain that
actor as attribution for the new operation. These checks do not authorize a
person to manage configuration and do not grant role, assignment or capability.

Physical binding deletion is permitted. Recreating configuration through the
database default yields a fresh opaque ID at revision 1. There is no tombstone
and no attempt to reserve deleted IDs. Future provenance is not stored here.

## Migration and guards

`0018_d2_slice2a_binding_storage.sql` follows migration 0017. Drizzle generated
the table/index/FK/CHECK SQL, `0018_snapshot.json` and journal entry from the
schema declaration; the four trigger bodies were added using the existing
hand-authored migration convention. No existing table is rebuilt.

| Trigger | Responsibility |
|---|---|
| `service_type_blueprint_bindings_insert_guard` | Required values, initial revision, Systems target, active actors; incoming ID, workspace/Service Type and physical-row collision |
| `service_type_blueprint_bindings_update_guard` | Immutable OLD identity, next revision, target, current updater; incoming collisions with another binding |
| `templates_bound_blueprint_insert_guard` | Incoming collisions with any bound Template's global ID, workspace/ID, workspace/kind/slug or physical row |
| `templates_bound_blueprint_update_guard` | Bound OLD ID/workspace/kind/slug immutability; incoming collisions with another bound Template even when the source is unbound |

All guards use `RAISE(ABORT)`, not FAIL/IGNORE or a DELETE trigger. Both enabled
and disabled bindings protect the parent. Ordinary INSERT/UPDATE is the intended
write interface; colliding UPSERT/REPLACE is not an alternative revision writer.
Physical rowids are not business identities; collision guards cover their aliases
too. No rowid is persisted in configuration or provenance.

While bound, Template name/description/active and normal timestamps remain
editable without changing the binding or generating work. Parent deletion fails
through the FK. Once all referencing bindings are deleted/repointed, 2A's parent
guard no longer applies; unrelated existing Template/version constraints remain.
No Systems Version lifecycle or immutability policy is implemented (2C).

SQLite documents `NEW.rowid` as undefined before INSERT when an integer rowid
was not explicitly supplied. The incoming guard conservatively refuses a match
to an existing protected row, rather than exempting a sentinel and allowing an
explicit-rowid replacement bypass. Repository-generated physical rowids are
positive; a manually assigned protected rowid such as -1 can therefore cause a
conservative refusal of an otherwise fresh implicit-rowid INSERT on the tested
SQLite runtime. Explicit negative/zero/max-int collisions are still refused.
This edge and engine portability deserve independent audit; no trigger disabling
or delete/recreate workaround is introduced. See [SQLite BEFORE-trigger cautions](https://www.sqlite.org/lang_createtrigger.html#cautions_on_the_use_of_before_triggers).

## Acceptance matrix and evidence

`tests/bloomops-blueprint-binding-schema.test.mjs` uses the actual ordered
migrations and real SQLite with foreign keys enabled. Every case below runs
with recursive triggers both OFF and ON. Refusal assertions compare full binding
and Template snapshots (including physical row identity) before/after, not only
error text.

| Prompt cases | Explicit coverage |
|---|---|
| 1–2 | NULL ordinary/replacement writes for all required columns; empty/NUL/blob identifiers |
| 3–7 | Missing/foreign parents, missing workspace, non-Systems target |
| 8–10 | Duplicate Service Type, immutable ID/scope/creator/creation timestamp, including NULL replacement updates |
| 11–13 | Toggle, inactive/unpublished Systems repoint, invalid repoint rollback |
| 14–16 | Invalid booleans, initial/next revision validation, last safe increment and overflow refusal |
| 17 | Successful CAS followed by stale zero-row CAS and unchanged data |
| 18–19 | Missing/foreign/inactive attribution, historical suspension, no assignment/capability grants |
| 20–23, 34 | INSERT/UPDATE OR REPLACE across binding identities, all rowid aliases, explicit -1/-2/0/max-int rowids, colliding UPSERT |
| 24–25, 34 | Bound outgoing and unbound incoming Template replacement; enabled and disabled; global ID, tenant/family and physical row |
| 26–27 | Allowed Template metadata and activation edits leave binding/work unchanged |
| 28–30 | RESTRICT parent/actor deletion, explicit binding deletion, parent freedom afterward, fresh default ID and revision |
| 31–32 | Migration leaves empty bindings; catalogue name/slug alone creates no binding/version/work |
| 33 | Multi-row binding/Template insert/update abort restores earlier statement changes |

The safe-integer boundary test temporarily removes only the update guard to
seed a near-exhausted revision, then reinstalls its exact migrated SQL before
testing the final increment/overflow. It does not pretend to execute quadrillions
of updates. Real CHECK constraints stay installed during setup.

Verified on Node **22.23.2**, Wrangler **4.129.0**, against the final implementation:

| Verification | Result |
|---|---|
| Focused binding schema | **206/206**, zero failures/skips; all 34 matrix requirements covered in both recursive modes |
| Affected schema, onboarding and compiler suites | **598/598**, zero failures/skips (includes the 206 new tests) |
| Full repository suite | **5,102/5,102**, zero failures/skips |
| Existing local zero-to-current verifier | **22 checks passed**, 60 inherited + 19 domain migrations; 42 domain / 78 total tables, 104 explicit domain indexes; clean FK/integrity checks |
| Second migration pass | No new migration, schema and both ledgers byte-equivalent to first pass |
| `npm run cf:build` | Exit 0, including `next build`, lint/type validity checks and emitted `.open-next/worker.js` |
| Changed-module syntax / diff hygiene | Passed |
| Generated snapshot comparison | All 41 prior tables unchanged, exactly one added table, correct predecessor snapshot |

Commands:

```sh
node --test tests/bloomops-blueprint-binding-schema.test.mjs
node --test tests/bloomops-*schema.test.mjs tests/bloomops-onboarding-*.test.mjs tests/bloomops-systems-blueprint-compiler.test.mjs tests/schema-drift.test.mjs
npm test
node .github/scripts/verify-zero-remote.mjs --local
npm run cf:build
node --check lib/bloomops/schema.mjs
node --check tests/bloomops-blueprint-binding-schema.test.mjs
node --check tests/bloomops-schema.test.mjs
git diff --check
```

As in Slice 1, `npm test` used only the existing external temporary PATH wrapper
mapping `python` to `/usr/bin/python3` for inherited packaged-skill tests. No
wrapper, dependency or environment change was committed. The local verifier
created and removed only its own disposable temporary database/config; no
staging or production database was queried/migrated. The Cloudflare/Wrangler
skills informed local-only validation, with CLI syntax checked against current
[D1 Wrangler documentation](https://developers.cloudflare.com/d1/wrangler-commands/).

Two test-fixture issues were corrected during development (SQLite's null-prototype
rows versus plain objects, and full-width rowid snapshot serialization); no
constraint failure was hidden or skipped. Final tests additionally cover shared
parents and stale binding identity after delete/recreate. Build artifacts and
test logs remain outside the commit.

## Deferred review gates

Independent audit should verify replacement identity coverage, revision/CAS
semantics and historical-vs-current actor handling. No independent audit verdict
is claimed by these implementation tests. Provenance/deletion semantics remain
2B+; immutable exact committed-receipt proof remains Slice 4. Storage tests do
not claim live authorization, generation success, automatic retries or recovery.
No staging/production deployment, remote migration, browser session mutation,
push or PR was performed.
