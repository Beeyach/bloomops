# D2 Slice 2A — PR #39 merge gate

## Objective

Perform the final integration gate for PR #39 and squash-merge it **only** if the exact approved Slice 2A candidate is still intact.

Do not begin Slice 2B.
Do not modify implementation code unless this prompt explicitly tells you to stop and report a failed gate.
Do not deploy manually.
Do not modify this prompt file.

## Canonical expected state

Repository: `Beeyach/bloomops`

Expected base main before merge:

`77bbb6b3ea7dff0b873e6fa72c583027159942b1`

PR:

`#39`

Expected branch:

`feat/d2-slice2a-binding-storage`

Expected exact PR head:

`74cc2efd2420c76053cab145de792eb54dd83a1c`

Audited implementation commit retained beneath that follow-up:

`7ba4fc1e1c1fd8f56efae754f7bd82c534b1b1fc`

Independent audit verdict:

`PASS WITH NONBLOCKING NOTES`

The only audit follow-up is the negative physical-rowid regression. It must not change production behavior.

## Approved PR scope

The PR may change only these paths:

- `docs/BUILD_STATE.md`
- `docs/INDEX.md`
- `docs/phases/D2_SLICE2A.md`
- `drizzle/0018_d2_slice2a_binding_storage.sql`
- `drizzle/meta/0018_snapshot.json`
- `drizzle/meta/_journal.json`
- `lib/bloomops/schema.mjs`
- `tests/bloomops-blueprint-binding-schema.test.mjs`
- `tests/bloomops-schema.test.mjs`

The intended Slice 2A product boundary is only:

- one new `service_type_blueprint_bindings` table;
- same-workspace restricted FKs;
- binding identity/revision/attribution constraints;
- bound-Template identity/kind/family protection;
- replacement-write protection including `REPLACE`, `UPDATE OR REPLACE`, and physical row collisions;
- direct schema/constraint tests and documentation.

The PR must contain **none** of the following:

- `systems_blueprint_generations` receipt table;
- `systems_blueprint_generation_items` mapping table;
- generation writer or transaction logic;
- Project eligibility or preparation logic;
- default provisioning/bootstrap behavior;
- API or UI;
- provider execution;
- Slice 2B or later work;
- workflow/dependency/deployment configuration changes;
- prompt files.

## Gate 1 — refresh and provenance

1. Fetch latest remote refs.
2. Confirm `origin/main` is still exactly `77bbb6b3ea7dff0b873e6fa72c583027159942b1`.
3. Fetch PR #39 from GitHub.
4. Confirm:
   - open;
   - not draft;
   - not merged;
   - mergeable/conflict-free;
   - base is `main` at the expected SHA;
   - head is exactly `74cc2efd2420c76053cab145de792eb54dd83a1c`.
5. If main or the PR head changed, **STOP**. Do not rebase, merge, or guess. Report the mismatch.

## Gate 2 — exact scope

Read the full PR changed-file inventory from GitHub.

Require it to equal exactly the nine approved paths above.

Inspect the actual PR diff enough to confirm:

- exactly one new binding table;
- no receipt/mapping tables;
- no generation/provisioning/API/UI/eligibility logic;
- no workflow/config/dependency changes;
- no prompt files;
- the follow-up is test/docs only relative to the audited implementation unless Git history proves otherwise.

If scope exceeds this boundary, **STOP** and report it.

## Gate 3 — review state

Read:

- submitted PR reviews;
- unresolved inline review threads.

Require:

- no blocking review;
- no unresolved thread requiring action.

If there is a blocking review or unresolved actionable thread, **STOP**.

## Gate 4 — lightweight verification

Do not rerun the entire 5,102-test suite or the full Cloudflare/Next build unless a new code change or suspicious diff makes that necessary.

Run the merge-gate verification from the exact PR head:

1. Binding-focused tests:
   - `node --test tests/bloomops-blueprint-binding-schema.test.mjs`
2. Affected schema/onboarding/compiler suite used by the follow-up.
3. Local zero-to-current verifier:
   - `node .github/scripts/verify-zero-remote.mjs --local`
4. Syntax checks for changed JavaScript modules/tests.
5. `git diff --check` against the expected base.

The expected prior verified evidence is:

- 208 focused tests passed;
- 600 affected tests passed;
- 22 local migration checks passed;
- second-pass migration/schema/ledger equality passed;
- recursive-trigger OFF and ON replacement protections passed;
- original implementation previously passed 5,102 full-suite tests and the Cloudflare/Next build.

Treat the negative-rowid case as a documented **fail-closed compatibility limitation**, not a reason to introduce a positive-rowid product contract. Future application writers must not expose or depend on physical rowids.

If any lightweight gate fails, **STOP**. Do not patch during this task.

## Gate 5 — protected squash merge

Immediately before merging:

1. Refetch PR #39.
2. Reconfirm exact head SHA `74cc2efd2420c76053cab145de792eb54dd83a1c`.
3. Reconfirm mergeable/open/not-draft state.

Then squash-merge PR #39 using exact-head protection.

Use a concise merge title such as:

`feat: add D2 Slice 2A blueprint binding storage`

Do not merge if the head moved.

## Post-merge verification

After merge:

1. Fetch `origin/main` and record the exact new main SHA.
2. Confirm PR #39 is closed/merged.
3. Query automatic push-triggered workflows for that exact new main SHA.
4. Report the run IDs/status for:
   - `Deploy staging`
   - `Verify zero-to-current migration`
5. Do not manually trigger or rerun deployment/workflows.
6. Do not wait for or start Slice 2B in this task.

## Final report

Return:

- merge decision: `MERGED` or `STOPPED`;
- PR URL;
- exact pre-merge head;
- exact new main SHA if merged;
- confirmation of approved path inventory;
- lightweight verification results;
- review/thread status;
- post-merge workflow run IDs/status;
- explicit confirmation:
  - no manual deployment;
  - prompt unchanged;
  - 2B not started.

Stop after reporting.