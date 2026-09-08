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

## Proposed Phase Sequence

### B1 — Projects Core

Project schema, lifecycle, assignments, authorization, activity, internal Client/Work UI, and safe client-visible project projection where appropriate.

### B2 — Milestones

Milestone schema, ordering, lifecycle, project detail integration, visibility, activity, and progress projection.

### B3 — Actions + Dependencies

Action schema, assignment, priority/dates/waiting semantics, dependency edges, cycle prevention, scoped Work views, and overdue/dependency behavior.

### B4 — Deliverables

Separate deliverable lifecycle, client visibility, internal/client review state foundation, project integration, and activity.

### B5 — Files

D1 asset metadata, R2 object lifecycle, subject links, visibility, upload/download authorization, and safe failure/retry behavior.

### B6 — Work + Home Projections

Mine/Today/Upcoming/Waiting/Review/Overdue/All views, Project summaries, and a useful Home dashboard built from canonical records.

### B7 — Release B Hardening

No new product features. Attack tenant isolation, assignment scope, visibility, lifecycle, dependency cycles, file authorization, retries, concurrency, responsive UX, and Release B acceptance stories.

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
