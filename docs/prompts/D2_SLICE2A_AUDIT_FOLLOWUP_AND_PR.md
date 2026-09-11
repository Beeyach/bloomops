# D2 Slice 2A — Audit follow-up and PR gate

## Starting point

Canonical base:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

Existing local candidate branch:

`feat/d2-slice2a-binding-storage`

Audited candidate commit:

`7ba4fc1e1c1fd8f56efae754f7bd82c534b1b1fc`

Independent audit verdict:

**PASS WITH NONBLOCKING NOTES**

The candidate is safe to push/open for review. Do not begin 2B.

## Scope

This task is limited to:

1. Add one narrow regression test for the independently reproduced fail-closed nonpositive physical-rowid edge, if it can be expressed without changing production behavior.
2. Re-run the focused/affected verification needed for that test-only follow-up.
3. Commit that follow-up separately.
4. Push `feat/d2-slice2a-binding-storage`.
5. Open a 2A-only PR against `main`.
6. Verify exact head, changed-file list, base, mergeability/conflict status, and that no 2B+ work is included.
7. Leave the PR open and unmerged.

Do not modify this prompt file.

## Hard boundaries

Do NOT:

- change production schema/migration behavior unless the audit regression proves the current behavior is actually incorrect;
- add a positive-rowid application invariant;
- expose physical `rowid` through application/domain APIs;
- change binding revision/CAS semantics;
- change attribution semantics;
- add receipt/mapping tables;
- add provisioning/default initialization;
- add Project eligibility or blueprint resolution;
- add API/UI routes;
- add generation transactions;
- begin 2B, 2C, 2D, 2E, D3–D7, or performance work;
- deploy anything;
- merge the resulting PR.

## Audit note to preserve

The independent audit found one low-severity compatibility limitation only:

- A protected binding or Template manually assigned a nonpositive physical `rowid` (for example `-1`) can cause a later unrelated INSERT with an implicit rowid to fail closed because SQLite documents `NEW.rowid` as undefined in a BEFORE INSERT trigger when the rowid is not explicitly assigned.
- The protected row survives.
- Repository-generated rowids are positive, and physical rowids are not application input.
- No integrity contract is violated.
- This does not block push/PR or 2B, provided future writers never expose or depend on physical rowids.

Prefer to encode this as a regression test documenting the fail-closed behavior rather than changing runtime behavior.

If a faithful regression test would require changing production semantics, do not add it. Instead leave the candidate unchanged and document why.

## Regression test requirements

If added, the test must:

- use the real migrated schema and existing SQLite-backed repository test pattern;
- run with `PRAGMA recursive_triggers = OFF` and `ON` where the harness supports both;
- create a protected binding or bound Template with an explicitly assigned negative physical rowid;
- prove the protected row remains unchanged;
- prove a later unrelated implicit-rowid INSERT fails closed or is refused exactly as independently reproduced;
- assert no partial mutation occurred;
- avoid asserting that negative rowids are supported application behavior;
- clearly label the test as a conservative compatibility/fail-closed regression;
- not add rowid to any application/domain contract.

Do not weaken the existing replacement protections to make the insert succeed.

## Re-verify Slice 2A boundaries

Before pushing, confirm the branch still contains only the approved Slice 2A scope:

- `service_type_blueprint_bindings` schema/migration;
- same-workspace restricted FKs;
- explicit indexes/checks;
- binding INSERT/UPDATE guards;
- bound-Template INSERT/UPDATE identity protections;
- schema/migration metadata;
- direct constraint/trigger tests;
- required schema expectation updates;
- Slice 2A documentation/state updates;
- optional audit regression test only.

Explicitly confirm absence of:

- `systems_blueprint_generations`;
- `systems_blueprint_generation_items`;
- generation writer/receipt logic;
- Project eligibility wiring;
- default provisioning;
- APIs or UI;
- provider execution;
- 2B+ implementation.

## Verification

Run, at minimum:

1. Slice 2A focused binding/schema tests.
2. Relevant inherited schema/onboarding/compiler suites that were used for the candidate.
3. Local zero-to-current migration verifier, including second-pass idempotence/schema-ledger equality.
4. Syntax checks and `git diff --check`.

If the only code change is a regression test and all focused/affected checks pass, you do not need to rerun the entire 5,102-test suite unless the test exposes a broader issue or the implementation changed.

If production implementation changes for any reason, rerun the full suite and normal Next/Cloudflare build before proceeding.

## Commit

If the regression test is added, commit it separately from the audited candidate with a narrow message such as:

`test: cover D2 binding negative-rowid fail-closed edge`

Do not squash the local branch before PR creation. Preserve the audited implementation commit plus any test-only audit follow-up as separate commits for review.

## Push and PR

After verification passes:

1. Push `feat/d2-slice2a-binding-storage` to origin.
2. Check whether an open PR already exists for that head. Reuse it if one exists; do not create duplicates.
3. Otherwise open a PR against `main`.

Recommended PR title:

`feat: D2 Slice 2A blueprint binding storage`

The PR body must state:

- Base main SHA: `77bbb6b3ea7dff0b873e6fa72c583027159942b1`.
- Slice 2A only.
- One new table: `service_type_blueprint_bindings`.
- No receipt/mapping tables, generation, provisioning, API/UI, eligibility wiring, or 2B+ work.
- Binding rows grant no authorization.
- Bound Template identity/kind/family is protected while referenced.
- Binding configuration supports explicit same-workspace Systems Template targets, enabled state, revision/CAS, and attribution semantics.
- Replacement-write protections were tested with recursive triggers both OFF and ON.
- The independent audit verdict was **PASS WITH NONBLOCKING NOTES**.
- The negative-rowid behavior is a conservative fail-closed compatibility edge, not supported application input; mention the added regression test if committed.
- Focused/affected/migration verification results.
- No deployment is part of the PR.
- **Leave the PR unmerged.**

## Final PR verification

After opening/reusing the PR, verify from GitHub:

- PR base is `main`;
- exact PR head equals the pushed local branch HEAD;
- PR is open, non-draft, and conflict-free/mergeable if GitHub has calculated mergeability;
- changed-file inventory contains only Slice 2A-approved files plus the optional regression-test edit;
- no prompt file from `ops/d2-slice2a-audit-followup-pr-prompt` is included;
- no unexpected workflow/config/dependency/application surface changes exist;
- no blocking reviews or unresolved review threads exist at the time of reporting.

Do not merge.

## Return

Report:

1. Whether the optional negative-rowid regression test was added, and why.
2. Audit-follow-up commit SHA, if any.
3. Final pushed branch HEAD SHA.
4. PR number and URL.
5. Exact changed-file inventory.
6. Focused/affected/migration verification results.
7. Confirmation recursive-trigger OFF/ON replacement protections still pass.
8. Confirmation the PR is Slice 2A only and 2B has not begun.
9. PR mergeability/conflict/review-thread status.

Then stop.
