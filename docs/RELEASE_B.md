# Release B — Work Core

## Goal

Release B makes BloomOps useful for day-to-day post-onboarding delivery work.

Release A proved Client activation and onboarding. Release B adds the structured operational layer that begins replacing the agency's Notion workflow.

At Release B completion, authorized internal users should be able to:

1. create and manage Projects for a Client and Service Engagement
2. organize Projects with Milestones
3. create, assign, prioritize, and progress Actions
4. express simple Action dependencies without cycles
5. track client-facing Deliverables separately from internal Actions
6. attach and retrieve Files through the isolated R2 foundation
7. use Work and Home views that project canonical Project, Milestone, Action, Deliverable, and File state
8. preserve existing Client, Service, Onboarding, authorization, tenant-isolation, and activity guarantees

Release B does not include the specialized Social production pipeline, Ads operations, Systems QA/launch workflows, Finance, payment automation, or commercialization.

## Canonical Boundaries

- A Project belongs to one workspace and one Client. It may be tied to a Service Engagement when the work is service-specific.
- Department is organizational metadata, never an authorization grant.
- Project ownership or assignment is responsibility, not global authorization.
- Team Members remain assignment-scoped. Owner/Admin/Project Manager keep workspace-wide delivery coordination scope unless a narrower canonical rule applies.
- Client visibility is explicit. Internal or restricted records must never leak through client-facing reads, counts, activity projections, or guessed IDs.
- Actions are internal work. Deliverables describe what the Client receives. Do not collapse them into one table or one lifecycle.
- Dashboards and department views project canonical records. They do not maintain duplicate status facts.
- Files use D1 metadata plus R2 objects. Do not store raw platform passwords or credentials.

## Phase Sequence

### B1 — Projects Core

Merged as PR #15 at `cacb2d3b8f4ff634fb5a3470a4fd5f91930ef2c1`; staging and remote zero-to-current both passed on that SHA.

Project schema, lifecycle, assignments, authorization, activity, internal Client/Work UI, and safe client-visible project projection where appropriate.

### B2 — Milestones

Closed after PR #16 merged as `74eb09a619516ae4969622f5e79a64c35d300d39`; staging run 34190261299 and remote zero-to-current run 34190261285 both succeeded on that exact SHA.

Milestone schema, ordering, lifecycle, Project detail integration, visibility, activity and derived progress. The implementation contract is `docs/phases/B2.md`; current verification and remaining gates are recorded in `docs/BUILD_STATE.md`.

### B3 — Actions + Dependencies

B3 closed after PR #17 merged as `884051d2c2308839f95ecdac74c9d896edf221c5`. Read-only preflight confirmed [Deploy staging 34199099414](https://github.com/Beeyach/bloomops/actions/runs/34199099414) and [remote zero-to-current 34199099461](https://github.com/Beeyach/bloomops/actions/runs/34199099461) succeeded on that exact SHA.

Internal Actions, revocable assignment, priority/dates/Waiting, exact lifecycle, atomic cycle-safe dependencies, canonical activity, Project integration and scoped daily Work views. Contract and historical local evidence remain in `phases/B3.md` and `BUILD_STATE.md`.

### B4 — Deliverables

B4 closed after PR #18 merged as `ac71b358f27894af8dd8108f004499cd765fca69`. Read-only preflight confirmed [Deploy staging 34207017617](https://github.com/Beeyach/bloomops/actions/runs/34207017617) and [remote zero-to-current 34207017646](https://github.com/Beeyach/bloomops/actions/runs/34207017646) succeeded on that exact SHA.

Separate Deliverables, exact lifecycle, Project coordination, visibility, Client-safe labels/status and atomic activity remain defined in `DOMAIN_MODEL.md` and `phases/B4.md`.

### B5 — Files

B5 closed after PR #19 merged as `4c6dad696d15fac4094b8172788b5c72642ff757`. Read-only preflight confirmed [Deploy staging 34221696674](https://github.com/Beeyach/bloomops/actions/runs/34221696674) and [remote zero-to-current 34221696667](https://github.com/Beeyach/bloomops/actions/runs/34221696667) succeeded on that exact SHA. D1 asset metadata, fixed Project/Deliverable links, bounded R2 upload/recovery, current download authorization and conditional Client Files remain defined in `DOMAIN_MODEL.md`; historical evidence is in `BUILD_STATE.md`.

### B6 — Work + Home Projections

B6 on `codex/b6-work-home-projections` replaces orientation Home with bounded operational sections and adds readable Milestone/Action/Deliverable/Ready File summaries to Work Projects. It reuses B3's exact views, filters, timezone and dependency rules. All facts remain canonical; B6 is schema-free and dashboard File composition uses D1 metadata only. Current implementation, deterministic attention/date rules and verification are in `DOMAIN_MODEL.md`, `phases/B6.md` and `BUILD_STATE.md`. Independent audit, user-controlled merge and both gates on the actual B6 merge SHA remain required. The schema-free diff does not match the zero-verifier's push path filter, so dispatch that existing workflow manually on the merge SHA if it does not run automatically.

### B7 — Release B Hardening

Unimplemented. After B6 closes, attack tenant isolation, assignment scope, visibility, lifecycle, dependency cycles, file authorization, retries, concurrency, responsive UX, and Release B acceptance stories. No new product features and no automatic start.

This sequence is implementation guidance. If repository evidence requires a smaller safe split, preserve the same product boundaries rather than pulling later Release features forward.

## Release-Level Acceptance Direction

A canonical Release B story should eventually prove that an onboarded multi-service Client can have service-specific Projects, assigned internal work, milestones, dependencies, deliverables and files while a scoped contractor sees only assigned work and a Client sees only explicitly client-visible outputs.

Exact acceptance stories should be finalized phase-by-phase from the current implementation, not by inventing Release C/D behavior.

## Release Gate

Release B is not complete merely because pages render.

It requires:

- correct Project/Milestone/Action/Deliverable lifecycles
- assignment and role scope enforcement
- Client and workspace isolation
- dependency cycle prevention
- safe file authorization and object lifecycle
- immutable significant activity
- canonical dashboard projections
- desktop/mobile usability
- clean staging deployment and remote zero-to-current verification on the final merge SHA
