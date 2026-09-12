# D2 preparation and committed generation backend (Slices 3–4)

Base: merge `854863af8b8997781c3358aa0de245df2a8f007d`. Implementation begins
after Slice 2D's exact-SHA gates pass. The owner requested autonomous continuation
through the established implementation/review/publication/staging workflow until
a real product decision, missing access or other owner input is needed.

## Scope and authority

Provide backend blueprint options, preview and committed generation for an
existing empty planned Systems Project. Preparation and persistence share one
validation path and are reviewed as one connected change. No Project creation,
append, amend, reconciliation, regeneration, API/UI, automatic service binding,
provider call, schema/migration or D3–D7 behavior belongs to this slice.

- Reuse `project.manage` and current Project readability: Owner/Admin/PM only;
  restricted Projects require the existing exact assignment for PM. Team and
  Client cannot generate even with template-management capability. Workspace,
  membership, role, identity and visibility are rechecked by SQL at read/commit.
- A Project must belong through its exact Service Engagement and Service Type
  to the canonical `systems` Department. New generation requires an active
  Department/Service Type, a Service not completed/cancelled, a planned Project,
  an enabled explicit binding, an active Systems Template and its published
  version. Names, service slugs and department membership confer no authority.
- Empty means no Milestones, Actions, Deliverables or Project File links and no
  prior generation receipt. Project assignments and ordinary Project activity
  are not generated work and do not disqualify an otherwise empty Project.
- Decode only bounded stored definitions, verify canonical normalized JSON/hash,
  supported schema/compiler and `ghl_build` key, then use the existing compiler.
  Do not accept client-supplied definition, plan, labels, IDs or lifecycle values.
  Options expose a bounded component list and optimistic preconditions; preview
  includes only compiler-selected proposed work and those preconditions.

## Commit and retry

- A first attempt supplies a UUIDv4 request ID, selected component keys and exact
  preconditions: Project revision, binding ID/revision, Template Version ID and
  definition hash. Normalize UUID case; component order is normalized by the
  compiler. Reject unknown/missing fields and malformed preconditions.
- Preconditions guard first creation; semantic retry identity is workspace,
  Project, request ID and normalized component selection. A successful retry
  does not require the Project revision/status or current binding/publication
  to remain at their pre-generation values. It still needs current Project
  management authority and an exact validated immutable receipt.
- Under one D1 batch, conditionally insert the winning immutable receipt with
  all live authority, source, revision, emptiness and request-uniqueness checks.
  Every following insert/update is gated by that attempt's fresh receipt ID.
  Losers cannot insert work, dependencies, mappings, events or revision changes.
- Materialize canonical Milestones, Actions and Deliverables with server IDs,
  fixed compiler initial values, unique per-entity request IDs, no assignments
  or dates, and internal visibility. Persist exact logical-key/record mappings
  and selected dependencies, one `PROJECT_BLUEPRINT_GENERATED` internal activity
  event, and a single Project revision increment. Project status stays planned.
- Group bounded rows into receipt-gated INSERT/SELECT statements using transient
  JSON parameters where needed; runtime records remain relational. Keep the
  complete operation below 50 queries/statements, each below 100 bindings and
  100 KB SQL. One transaction only; no split commit or manual BEGIN/COMMIT.
- Resolving a batch or returning zero rows is not success. Load a currently
  authorized exact receipt and validate canonical definition, recompiled plan,
  both hashes, the complete immutable kind/logical-key mapping set, the singular
  matching generation event and advancement beyond its recorded pre-generation
  Project revision. Later ordinary Project updates remain valid. Partial
  or inconsistent provenance is an integrity failure, never automatic repair.
- Live generated records may subsequently evolve or be deleted under existing
  Work Core rules. Replay retains the original receipt/counts and never rebuilds
  missing live work. Missing/mismatched immutable mapping rows are not equivalent
  to permitted live deletion. A different request or selection conflicts.
- Unexpected database failures propagate; transaction failure rolls back all
  facts. An ambiguous acknowledged/lost response is resolved by exact receipt
  proof on a caller retry, never by blindly resubmitting uncertain mutations.

## Verification and gates

Tests must exercise all-component and worst-edge plans, internal initial values,
canonical dependencies, single event/revision, normalized retries, competing
same/different requests and selections, stale preconditions, configuration and
permission changes before commit, new work before commit, late failures, absent
receipts/partial mappings, permitted live deletion and cross-tenant/role denial.
Use actual migrated SQLite/Drizzle and the same domain functions over disposable
native D1, with both recursive-trigger settings and measured statement bounds.
Retain existing compiler/storage/Work Core behavior. Run affected/full checks,
app build and one fresh Sol High read-only review, with at most one focused
re-review for fixes. Both exact-merge-SHA workflows and staging identity remain
required before closing this backend slice. HTTP/UI acceptance follows later.

Platform references checked during scoping:
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and
[D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## D2 generation backend local acceptance (2026-09-11)

- Shared options/preview eligibility and receipt-gated atomic generation are implemented for existing empty planned Systems Projects. The writer proves complete immutable provenance, one matching internal event and the Project revision advance before reporting success; retries preserve later live work edits/deletions. No schema/migration, HTTP/UI, automatic binding or provider execution is included.
- Verification: 56 new generation tests, 818 affected tests, 5,836 full-suite tests, 26 native D1 checks across both recursive-trigger modes, and Cloudflare/OpenNext build pass. The largest measured operation uses 18 queries, including one eight-statement batch; maximum statement size is 4,017 bytes with 49 bound parameters. Logs: `/tmp/bloomops-d2-generation/{affected.log,full.log,native.log,build.log}`.
- One fresh Sol High read-only reviewer found no material correctness, authorization, isolation, atomicity, replay or regression findings. Independent syntax and patch checks passed; no re-review was required.
- Work is isolated on `feat/d2-generation-backend` from verified `854863af8b8997781c3358aa0de245df2a8f007d`. Original branches and unrelated guide/configuration changes remain preserved. Publication and both exact-merge-SHA gates are pending; this backend and D2 are not yet closed. Next: publish, merge and verify staging under the owner's standing authorization, then continue HTTP/UI integration.

## D2 generation backend closure (2026-09-11)

- [PR #44](https://github.com/Bloomwired/bloomops/pull/44) merged reviewed `1a9141bde53221372e39705fa95a5b4bdf37c4df` as `8df6d318ae1889691fe73a7fd19e155c4f6f5d69`; reviewed and merge trees match exactly. No migration or live binding was performed.
- [Deploy staging 34678235589](https://github.com/Bloomwired/bloomops/actions/runs/34678235589), job `103511861579`, and [Verify zero-to-current 34678235591](https://github.com/Bloomwired/bloomops/actions/runs/34678235591), job `103511861598`, passed on the exact merge SHA. Every required step succeeded. Live staging reports `8df6d31`; all eight original D1 IDs/names are restored and the disposable database is absent.
- Complete run/job metadata, archived CI logs, staging identity and inventories are under `/tmp/bloomops-d2-generation/`. As in earlier runs, verbose verifier stdout is truncated in the archive; no complete remote integrity/no-op log tail is claimed. Successful step metadata and direct inventory verification establish the gate.
- Local acceptance remains 818 affected / 5,836 full tests, 26 native D1 checks and Cloudflare build; one fresh Sol High review found no material findings. No implementation changed during publication; final syntax and commit diff checks passed. Original branches and unrelated guide/configuration work remain preserved.
- Next: [D2_INTERFACE.md](D2_INTERFACE.md). Read-only catalogue inspection found separate active Systems GHL and Kajabi types, neither bound; no catalogue change has been made.
