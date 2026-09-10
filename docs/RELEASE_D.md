# Release D - Systems Delivery

## Baseline

Release D starts from current verified `main` at `1638e3ed9fd33c3725aa3449935b08335b73f1a9`.

That baseline contains the audited and merged Release C product plus two workflow-only follow-up fixes that make both required post-merge gates automatic. On this exact baseline:

- Deploy staging `34478365157` completed successfully.
- Verify zero-to-current migration `34478365145` completed successfully.

Release C is treated as closed for forward development from this baseline. Historical C7 evidence remains in `docs/BUILD_STATE.md`.

## Goal

Release D turns Systems fulfillment into a practical specialist operating area for GHL and Kajabi delivery without creating a second project-management engine.

At Release D completion, authorized internal users should be able to:

1. see and manage Systems work from a dedicated Systems destination
2. start repeatable GHL and Kajabi delivery work from safe versioned build blueprints
3. execute delivery through canonical Projects, Milestones, Actions, Deliverables and Files
4. understand current phase, blockers, QA, Client Review, launch and handoff from canonical shared facts
5. give Clients a calm view of relevant Projects, Deliverables and Files without exposing internal Systems detail
6. preserve workspace, Client, Service, assignment, visibility, activity, retry and concurrency guarantees from Releases A-C

## Core Architecture Decision

Systems is a specialist projection over the shared Work Core.

A Systems build is not a new parallel lifecycle object by default. The canonical runtime records remain:

- Service Engagement identifies the purchased Systems service.
- Project is the build or implementation workstream.
- Milestones are ordered delivery phases.
- Actions are internal execution steps and dependencies.
- Deliverables are what the Client actually receives.
- Files use the existing D1 metadata and private R2 authority.
- Activity remains the canonical history system.
- Existing Client, Service and Project assignments remain authorization scope.

Do not add `systems_status`, duplicate project state, duplicate task state, duplicate deliverable state, or a second File/approval/history system merely to power the Systems UI.

A small Systems-specific relational extension is allowed only when a required Systems fact cannot be represented safely by those canonical records. Examples that may justify an extension later are immutable blueprint provenance or a safely scoped final handoff link. Any such extension must not own a competing lifecycle.

Department is organization only. A Systems department membership never grants access to every Systems Client or Project.

## Systems Eligibility

The Systems specialist area is based on canonical Service Type department relationships and Projects tied to Systems Service Engagements.

Do not infer Systems authority or platform from free-text Project names, Service labels or Department display text when a relational relationship exists.

Client-level Projects without a Systems Service Engagement remain ordinary Work projects unless a later phase defines an explicit safe rule.

## GHL Delivery Direction

The default GHL build blueprint should support these phases, conditionally including only the work selected for that build:

- Discovery
- Access
- Funnel
- Forms
- Calendar
- Pipeline
- Automations
- Email/SMS
- Integrations
- QA
- Client Review
- Launch
- Handoff

Typical GHL outputs are canonical Deliverables such as a funnel, form set, calendar, pipeline, automation, email sequence, SMS sequence or integration.

The blueprint must not force every phase into every project. Unselected components must not generate fake work.

## Kajabi Delivery Direction

The default Kajabi build blueprint should support:

- Access / Assets
- Architecture
- Course Build
- Funnel / Checkout
- Email / Nurture
- QA
- Client Review
- Launch
- Handoff

Typical Kajabi outputs are canonical Deliverables such as a course build, checkout/offer setup, landing or sales page, nurture sequence, affiliate setup or integration.

Again, selected components determine generated work. Do not create decorative or irrelevant phases.

## Blueprint Rules

Release D may introduce a Systems build-blueprint engine, but it must follow the repository's permanent Template rules:

- blueprint definitions are versioned
- existing instantiated work never silently changes when a blueprint changes later
- generated runtime work is relational Project/Milestone/Action/Deliverable data
- generation uses stable logical keys or another durable provenance mechanism where deduplication is required
- retries are idempotent
- partial or concurrent creation cannot silently duplicate phases or outputs
- snapshot/config JSON is acceptable only for immutable blueprint definition or provenance where relational querying is not required

Template management UI remains a later Operations-layer feature. Release D only needs the safe backend/default definitions required to operate Systems delivery.

## Credentials and Access

Never store raw GHL, Kajabi, Meta, Google, Stripe or other third-party passwords in BloomOps.

Access work should describe the required delegated/invited/OAuth/vaulted access and track the operational step, not store credentials.

Release D does not add a password vault.

## Client Experience

Do not create a new Client portal Systems navigation module in Release D.

Clients should continue to use the canonical portal surfaces that already exist:

- Home
- Projects
- Files

Systems Projects, client-visible Milestones, Deliverables and Files may appear there only through their existing safe allowlists and current contact/visibility rules.

Internal QA, Actions, assignments, contractor identities, access details, internal descriptions, blueprint provenance and operational history must not leak to Clients.

## Release D Does Not Own

- Ads campaigns, Ads performance or Ads approvals
- Pages/SOP management
- Team workload management
- Finance
- generalized template-management UI
- notifications, queues or reminders
- direct GHL/Kajabi provider API integrations
- automated publishing or account changes in third-party tools
- credential storage
- production DNS/payment changes
- Leadsthatbloom work
- commercialization or SaaS billing

## Phase Sequence

### D1 - Systems Foundation

Replace the Systems placeholder with a real bounded specialist projection over canonical Systems Service Engagements and Projects. Establish exact scope, authorization, filters, project summaries, navigation and useful entry points without creating duplicate lifecycle state. D1 is expected to be schema-free unless repository evidence proves a minimal relational addition is necessary.

### D2 - GHL Build Blueprint

Create the reusable Systems blueprint/generation foundation and the first GHL build definition. Starting a GHL build should generate only the selected canonical Milestones, Actions and Deliverables with immutable blueprint provenance, idempotent retries and coherent authorization.

### D3 - Kajabi Build Blueprint

Reuse the D2 engine for Kajabi. Do not fork a second generation architecture. Prove conditional Course, Checkout, Funnel, Email/Nurture, QA, Client Review, Launch and Handoff work while preserving the same provenance and retry rules.

### D4 - Systems Execution + QA

Make active Systems projects practical to run from the specialist area. Derive current phase/progress from canonical Milestones and Actions, surface blockers/waiting/review accurately, and support QA through canonical work and Deliverable Internal Review rather than a competing QA lifecycle.

### D5 - Launch + Handoff

Complete the operating path from approved work through Launch and Handoff. Reuse Deliverable approval/delivery, Files and Pages where appropriate. Add only the minimum safe structured handoff metadata that real operation proves necessary. No credentials.

### D6 - Systems Client Experience + Operations

Verify and refine how Systems Projects, client-visible Milestones, Deliverables and Files project into the existing Client portal and internal Home/Work surfaces. Keep the Client portal calm and exact. Add no separate Systems portal module.

### D7 - Release D Hardening

No new product features. Attack tenant isolation, Client/Service/Project assignment scope, blueprint idempotency, partial/concurrent generation, hidden-count leakage, Deliverable/File authorization, launch/handoff safety, portal leakage, responsive UX and the integrated GHL + Kajabi acceptance story.

## Release-Level Acceptance Direction

A final Release D acceptance story should demonstrate one multi-service workspace containing at least:

- one GHL Systems project
- one Kajabi Systems project
- scoped internal users with different Client/Service/Project access
- conditional blueprint generation
- ordered Milestones and dependent Actions
- client-facing Deliverables moving through Internal Review, Client Review, Approved and Delivered as applicable
- private Files and client-visible handoff output
- QA, Launch and Handoff work
- current portal projection
- assignment or Service/Client revocation while sessions remain issued

The story must prove that current authorization facts remove inaccessible Projects, work, Deliverables, Files and summaries immediately without exposing hidden counts or historical names.

Use synthetic/local/disposable data only.

## Release Gate

Release D closes only after:

1. D1-D7 are individually implemented, independently audited and merged
2. the final D7 audit passes on the exact final head
3. D7 is merged into `main`
4. Deploy staging succeeds on the exact resulting Release D merge SHA
5. Verify zero-to-current migration succeeds automatically on that same SHA

Do not begin Ads or Release E automatically after Release D closes.