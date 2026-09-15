# PR79 parent-key verifier correction

Reviewed feature: `d60abaa091c2e2e7acd062fef3e2e3815509920b`.
Base: `c33370772d444d140f7c21761b498fc769e87840`.

The independent P2 found that `hasWorkspaceForeignKey` could approve a mandatory
composite path whose referenced columns were not a valid SQLite parent key.
The shipped schema remains correct; no application/schema/migration change is
needed. Portal and follow-up corrections are retained without edits.

The helper now validates every traversed target tuple against a complete primary
key or a non-partial unique index using table_info/index_list/index_xinfo. It
rejects expressions and incomplete/unrelated keys, preserves FK sequence mapping,
and permits SQLite's valid permutation of index columns. SQLite's read-only
EXPLAIN preparation also rejects DML-only FK errors, including index collations
that disagree with declared parent-column collations. No probe is executed.
Enforcement must be enabled; a broken FK anywhere on a traversed table fails
closed. Existing mandatory-column, workspace continuity and cycle checks remain.

Shared synthetic fixtures cover nine malformed and six valid parent-key cases.
All DDL succeeds. A real orphan write reports mismatch/missing table for malformed
keys, and FOREIGN KEY constraint failure for valid keys, proving enforcement.
The checker rejects/accepts the corresponding paths. The shipped mentions path
is tested separately, and its existing cross-workspace/update/deletion tests are
unchanged. Native Miniflare D1 repeats all 15 fixture DDL/write checks in separate
disposable databases plus the existing 22 mentions checks on all 47 migrations.

Before the helper changed, the new checker suite failed 9/17 (8 passed), exactly
at the false-positive assertions after proving the corresponding DML errors.
After correction it passes 17/17. The full execution receipts, code/diff hashes,
commands and final remote results are exported outside the worktree in the
focused correction addendum; no passing historical result substitutes for a new
run. No independent acceptance is claimed by this correction.

Commands (repository root, unchanged lockfile/runtime):

```sh
node --test tests/workspace-fk-invariant.test.mjs
node --test tests/bloomops-projects-ui.test.mjs tests/bloomops-shell.test.mjs tests/bloomops-schema.test.mjs tests/followup-schedule.test.mjs tests/portal-vocabulary.test.mjs tests/workspace-fk-invariant.test.mjs tests/mention-workspace.test.mjs
node scripts/mention-workspace-native-local.mjs
npm test
git diff --check
```

Use the documented external Python alias for npm test when the host lacks
`python`. Existing non-deploying PR validation runs its configured feature build,
browser suite and full suite on the new merge candidate. Application/browser
acceptance is not manually repeated. PR79 remains draft; merge/deployment are
unauthorized. Next gate: focused independent re-review of this correction.
