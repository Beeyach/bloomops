# D2 Slice 2D — authorized GHL blueprint setup

Base: verified main `ea18733e98ddff4e29ea1dff41800d3e294e59dd`.
Slice 2C is closed. The owner requested autonomous continuation through the
existing BloomOps workflow until a real decision or missing access is needed.

## Bounded contract

Provide server-side domain functions for provisioning the existing immutable
GHL v1 default and reading/setting an explicit Service Type blueprint binding.
This is the first remaining dependency for preparation and generation. No new
schema, migration, general template editor, HTTP route, UI, automatic workspace
bootstrap or live Service Type configuration is included in this slice.

- Every read and committing write checks the live workspace, membership,
  identity, role and existing `templates.manage` capability. Owner/Admin inherit
  this capability; PM/Team need a current explicit grant. Clients cannot hold
  it. Stale cached grants, assignment and department membership grant nothing.
- Default provisioning creates the existing GHL manifest as version 1, first
  draft and then published, in one atomic batch with its new Systems Template.
  The reserved Template slug `ghl-build` locates this default only; it never
  identifies a Service Type or confers Project eligibility.
- An already active default is a read-only replay only when its sole version
  is published version 1 with the exact canonical GHL v1 JSON/hash. Existing
  drafts, retired/inactive/customized or inconsistent default history conflict;
  do not repair, reactivate, replace, republish or overwrite it automatically.
  Concurrent first provisioning converges on one complete default. All new
  writes are tied to the fresh Template/version IDs generated for that batch.
- Binding creation requires explicit Service Type and Template IDs plus
  `expectedBinding: null`. Editing requires the exact binding ID and safe
  revision. Omitted preconditions are invalid; stale state conflicts. A matching
  current no-op leaves revision, timestamps and attribution unchanged.
- Setup accepts only an active same-workspace Service Type whose active
  Department has canonical slug `systems`. It requires a same-workspace Systems
  Template, allowing inactive or unpublished targets for configuration as 2A
  permits. Generation will separately require an enabled, usable binding.
- Every actual binding update increments revision exactly once and attributes
  the live caller. Concurrent create/update has one winner. Recreated bindings
  cannot satisfy an old ID/revision. Overflow is refused. No binding deletion
  endpoint, caller-supplied actor attribution, physical rowids or service-name
  inference is introduced.
- Return success only from an authorized returned mutation or verified exact
  existing default. A zero-row guarded mutation conflicts; resolving a batch
  is insufficient. Unexpected database failures propagate with rollback.

This internal setup slice retains the existing deferral of template-management
activity/UI. Future exposed management operations must scope their activity and
HTTP boundaries. It does not generate Projects/work, expose definitions to
Clients, imply publication authority from a Service binding, or call providers.

## Acceptance

Exercise actual migrated SQLite/Drizzle and native disposable D1: role and live
capability changes, tenant isolation, denied reads with no data leakage, exact
default replay, conflicting history, concurrent provisioning/binding writes,
CAS/no-op/overflow, revocation between preflight and commit, and late rollback.
Preserve all existing schema/compiler/onboarding behavior. Run affected tests,
app build as applicable and one fresh read-only Sol High review with at most one
focused re-review. Record publication and exact-SHA staging/remote gates in
`BUILD_STATE.md`; local verification alone does not close this slice.

## Local evidence

- Affected setup/storage/compiler/onboarding tests: 644/644 passed, including
  43 new setup cases. Full Node suite: 5,780/5,780, no failures or skips.
- Actual setup functions over disposable native D1: 26/26 checks passed with
  recursive triggers OFF/ON, at most 21 bindings and under 100 KB per statement.
  The first native run exposed a fixture without the required Department link;
  the fixture was corrected to establish explicit relational Systems ownership.
- `npm run cf:build` passed, including the configured Next validation and
  OpenNext Worker bundle. Changed JavaScript syntax and diff checks pass.
- Schema/migrations remain byte-identical to the verified baseline. Native
  checks apply all current migrations; no redundant local zero replay was run.
- One fresh Sol High read-only review found no material findings. No publish/merge/deployment
  result is claimed yet. Evidence: `/tmp/bloomops-d2-2d/{affected.log,full.log,native.log,build.log}`.
