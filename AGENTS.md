# BloomOps

`AGENTS.md` is the canonical repository instruction file for coding agents. Read and follow it before implementation work.

BloomOps is an agency operations and client portal system. The owner-approved target also includes internal prospecting in a fresh workspace; see [the Prospecting and Pages roadmap](docs/PROSPECTING_ROADMAP.md). That roadmap is planned work, not a statement that the features have shipped.

It is being built first for Ellen's agency, with Ary as an administrator and systems/GHL fulfillment provider. It may later become a product used by other agencies, so tenant boundaries should be designed correctly now without prematurely building SaaS billing or commercialization features.

## Product Boundary

BloomOps owns post-sale agency operations:

- clients
- service engagements
- onboarding
- projects
- milestones
- actions/tasks
- deliverables
- social content production
- approvals and revisions
- files and client uploads
- team assignments
- systems/GHL/Kajabi delivery
- ads operations
- Pages/SOPs
- lightweight finance tracking
- client portal
- operational activity/history

The 13 September 2026 owner direction adds internal prospecting to BloomOps:

- selected raw prospect import into a new workspace
- website audits and qualification
- structured full-page prospect profiles
- outreach, Gmail replies and optional approved follow-ups
- a prospecting Skills Library and accurate Results
- a same-workspace prospect-to-client-to-onboarding handoff

Follow [docs/PROSPECTING_ROADMAP.md](docs/PROSPECTING_ROADMAP.md) for scope and phase order. Prospecting has its own contextual sidebar using the BloomOps design system. Notion-style Pages remains a main BloomOps area. Do not port every old Leads That Bloom feature or its monolithic application shell.

The original Leads That Bloom app, or at minimum Ary's original workspace, must remain intact and accessible. Its prospect/audit/outreach history stays separate. The fresh workspace receives only explicitly selected untouched raw prospect fields through reviewed export/import; importing never starts outreach or AI work. Keep every existing voice recording. Video work, voice generation and video tests are paused until the owner resumes that phase.

These requirements supersede the previous separate-product prohibition. Existing workspace, portal, credential and environment-isolation rules still apply.

## Source Repository Relationship

BloomOps was seeded from a clean snapshot of `Beeyach/bloomtrack-pro`.

`bloomtrack-pro` remains an independent live application.

Never modify, deploy, migrate, delete, reconfigure, or otherwise affect Leadsthatbloom production resources while working on BloomOps unless the user explicitly requests it.

Do not assume inherited Leadsthatbloom architecture is correct for BloomOps merely because code already exists.

Reuse mature generic code where appropriate. Replace prospecting-specific architecture rather than stretching it into unrelated domains.

## Core Product Truths

These are product invariants unless the user explicitly changes them.

### Workspaces

BloomOps has an existing operational workspace for Ellen's agency. The prospecting roadmap requires a distinct fresh workspace for Ary; do not merge the existing workspaces or their records. Workspace creation and import remain phase work, not effects of this instruction update.

The data model must remain compatible with multiple workspaces later.

Business records should belong to a workspace where appropriate.

A user may eventually belong to multiple workspaces.

Do not build cross-workspace shared mutable client records in V1.

### Clients and Services

One client is one client.

Do not create separate client records for each purchased service.

A client can have multiple simultaneous service engagements.

Example:

James
- Social Media
- Ads
- GHL Systems

Service types and purchased service engagements are different concepts.

### Departments

Initial operational departments are:

- Social
- Ads
- Systems
- Operations

Departments are organizational views, not separate data silos or authorization boundaries.

Kajabi, GHL, funnels, automations, email sequences, course builds, and integrations generally live under Systems unless product requirements later justify another department.

### Shared Operational Engine

Projects, milestones, actions, deliverables, files, approvals, comments, activity, users, and assignments are shared domain concepts.

Social, Ads, Systems, Home, Client views, and Team views should project the same canonical records rather than create duplicated versions of the same fact.

Each fact should have one canonical source.

Do not create multiple independent status fields for the same underlying state merely to satisfy different screens.

### Internal vs Client-Facing

Internal work and client-facing presentation are different layers.

Clients must not automatically see:

- internal tasks
- internal notes
- contractor information
- internal QA details
- unrelated services
- team workload
- restricted files
- finance
- other clients

A client should see calm, understandable milestones, requests, deliverables, content, approvals, files, and actions that genuinely require them.

The client portal is not a read-only copy of the internal UI.

### Pages

Reuse the mature Notion-style Page/editor system from Leadsthatbloom.

Pages are appropriate for:

- SOPs
- briefs
- meeting notes
- welcome kits
- strategy
- brand guidelines
- internal documentation
- client documentation

Do not use freeform Pages as fake databases for structured operational data.

Tasks remain Tasks.
Content remains Content.
Approvals remain Approvals.
Projects remain Projects.
Onboarding requirements remain structured onboarding records.

### Templates

Templates are reusable blueprints.

Instantiating a template creates real operational records.

Existing client work must not silently mutate when a master template changes.

Templates must be versionable or snapshot their relevant definition at instantiation. Template versions and stored definition snapshots are immutable. Instantiation creates relational runtime records; those records may evolve operationally, but must not silently change when the master template changes later.

Stable logical keys should be used where template-generated onboarding requirements need deduplication.

Do not deduplicate based only on visible labels.

### Deliverables

Actions/tasks describe work performed by the team.

Deliverables describe things the client is actually receiving.

Examples:

- GHL funnel
- Kajabi course
- landing page
- email sequence
- automation
- report
- ad creative set

Content Items remain specialized domain objects for social/content production.

## Lifecycle Principles

Separate lifecycle concepts must remain separate.

Client relationship status is not project status.
Project status is not task status.
Client health is not relationship status.
Service status is not client status.

Initial client states:

- Draft
- Onboarding
- Active
- Paused
- Completed
- Ended

Initial client health:

- On Track
- Needs Attention
- At Risk

Initial project states:

- Planned
- Ready
- In Progress
- Waiting
- Blocked
- Review
- Completed
- Cancelled
- Archived

Initial action/task states:

- To Do
- In Progress
- Waiting
- Review
- Done
- Cancelled

Waiting work should record what or whom it is waiting on.

Dependencies should be explicit enough that downstream work is not incorrectly treated as overdue when an upstream dependency is incomplete.

## Security and Authorization

Authorization is server-side.

Hiding UI is not authorization.

Default to deny when access is unclear.

Permission evaluation conceptually considers:

1. authenticated identity
2. active workspace membership
3. workspace ownership of the resource
4. role
5. client/service/project assignment where required
6. record visibility
7. special capabilities

Initial roles:

- Owner
- Admin
- Project Manager
- Team Member
- Client

Sensitive capabilities such as Finance should be independently controllable rather than encoded as dozens of special roles.

A team member does not gain access to every client merely because they belong to a department.

Client access must remain scoped to the appropriate client and client-visible resources.

Avoid revealing the existence of inaccessible resources through authorization errors where practical.

Suspending membership must revoke workspace authorization even if the identity session itself remains valid.

### Visibility

Collaborative records may use concepts such as:

- internal
- client
- restricted

Do not expose internal or restricted data through APIs, embedded views, exports, search, public Pages, or file URLs.

### Credentials

Do not store raw Instagram, TikTok, Meta, Google, GHL, Kajabi, or other third-party account passwords.

Prefer platform invitations, business access, OAuth, delegated access, or a proper external credential vault.

## Technical Direction

The current intended stack is:

- Next.js
- React
- Tailwind
- existing custom Bloom design primitives
- Cloudflare Workers
- Cloudflare D1
- Drizzle for new BloomOps domain schema
- Cloudflare R2 for files/assets
- Better Auth for identity and sessions
- magic-link login initially
- Resend for transactional email
- Cloudflare Queues for reliable background jobs when needed
- Cloudflare Workflows later where durable multi-step orchestration is warranted
- existing `node:test` coverage where appropriate
- Playwright for critical browser and authorization flows

Do not introduce an additional database, auth provider, object-storage provider, UI framework, state framework, queue system, or major infrastructure dependency without a concrete requirement and justification.

Do not install a generic component library merely to accelerate UI work if the existing design system can support the feature cleanly.

### Environment Isolation

Development, staging, and production data must be isolated.

Never intentionally point a BloomOps preview/staging deployment at production client data.

Do not copy Leadsthatbloom's production D1 database into BloomOps.

Schema changes must use migrations.

Do not create or repair production schema dynamically during normal requests.

## Reuse From Leadsthatbloom

Treat these inherited areas as valuable generic infrastructure and inspect them before replacing them:

- `components/RichEditor.jsx`
- `components/PageView.jsx`
- `components/BlockInsertMenu.jsx`
- `components/DatabaseViewNode.jsx`
- `components/PublicReader.jsx`
- `components/EmbedView.jsx`
- `components/EquationNode.jsx`
- `components/EmojiPicker.jsx`
- `components/Icons.jsx`
- `components/Select.jsx`
- dialog utilities
- toast utilities
- theme/text-size utilities
- `lib/editor-extensions.mjs`
- page tree/navigation helpers
- useful responsive/accessibility/error patterns

Do not casually rewrite the editor or Page system.

`DatabaseViewNode` already demonstrates useful Board, Calendar, Gallery, and Table projections over live structured data. Adapt that concept rather than duplicating data into documents.

Prospecting-specific UI, APIs, jobs, Gmail logic, scanning, qualification, auditing, outreach, AI spend logic and follow-up code are inherited source material for the new prospecting area. Reuse only what the current roadmap phase needs, with current workspace authorization and design. Remove unused legacy paths only after dependency and reachability checks; do not delete useful source merely because an older instruction classified prospecting as out of scope.

Do not perform giant deletion sweeps while unrelated code still imports those modules.

## Application Architecture

Do not turn the inherited `ProspectsApp.jsx` into a giant BloomOps application component.

BloomOps should move toward route-based application areas with a shared internal shell and a separate client portal shell.

Conceptual internal destinations:

- Home
- Prospecting (planned, with its own contextual sidebar)
- Clients
- Onboarding
- Work
- Social
- Ads
- Systems
- Pages
- Team
- Finance
- Settings

Conceptual portal destinations:

- Home
- Content when applicable
- Projects when applicable
- Files when applicable

Portal navigation should hide irrelevant sections rather than display empty modules.

## Design Direction

BloomOps should feel calm, premium, editorial, polished, and understandable to non-technical clients.

Avoid generic SaaS-dashboard styling, excessive cards, visual noise, icon clutter, or exposing internal implementation detail to clients.

The design reference is:

https://bloomlab-preview.cool-sunset-2169.workers.dev/design

For visual work, inspect the design reference when browser access is available.

Do not claim to have inspected a visual reference if access failed.

Reuse and evolve the existing Bloom design tokens and components before inventing an unrelated design language.

Repo-wide readability requirements apply to future UI work and the planned cleanup:

- Dot-separated UI metadata chains are banned. Do not substitute pipes/slashes for the same cramped chain or turn every property into a badge.
- Use labelled fields, clear identity/role hierarchy, comfortable typography and separate spacing for headings, instructions, labels and controls.
- Cut duplicated/excessive explanation. Put optional detail behind a clearly named disclosure, while keeping decision-critical information visible.
- Prefer full-page working views and inline editing over cramped or stacked drawers.
- Keep the prospecting/editor code and data fetching out of unrelated route bundles and loaders; measure regressions rather than promising none.

Use [docs/DESIGN_CHECKLIST.md](docs/DESIGN_CHECKLIST.md) as the acceptance checklist. These rules do not request unrelated code changes during a documentation-only task.

## How to Work in This Repository

Before materially changing code:

- inspect the relevant implementation
- inspect relevant tests
- inspect recent git history when it affects the task
- understand current behavior before proposing replacement behavior

Never speculate about code you have not inspected.

Work on the requested phase or subphase only.

Do not pre-build future roadmap features.

Do not perform unrelated refactors just because you noticed them.

If an unrelated bug blocks the requested phase, fix the smallest root cause necessary and document why.

If repository evidence contradicts a proposed implementation detail, investigate and choose the safer or simpler approach while preserving the product invariant. Explain material architectural deviations.

Prefer root-cause fixes over patches that only hide symptoms.

Keep changes coherent enough to review and revert.

## Database Work

Every schema change must have a migration.

A fresh database must be able to reach the current schema from repository migrations.

Preserve workspace isolation in schema and queries.

Use relational operational records for runtime business data.

JSON is acceptable for versioned template definitions or other blueprint/configuration data when relational querying is not required.

Do not hide important operational state inside opaque JSON merely because it is quicker.

## Testing

Tests should prove business invariants, not merely mirror implementation details.

When a phase changes authorization, lifecycle transitions, template generation, dependency behavior, or data isolation, test those invariants explicitly.

Critical flows eventually require browser tests.

Security tests should include denied access, not only successful access.

Do not change production behavior merely to make a weak test pass.

Do not hardcode special-case data that exists only for a test.

## External and Destructive Actions

Do not:

- force-push
- delete remote repositories
- delete production resources
- destroy databases or buckets
- mutate Leadsthatbloom resources
- send real client communication
- trigger real payments
- alter DNS
- publish irreversible external changes

unless the current user request explicitly requires that action.

Prefer reversible changes and isolated staging verification.

## Long-Running Project State

This project is implemented incrementally across multiple coding-agent sessions.

At the beginning of a session:

1. read this file
2. inspect `docs/BUILD_STATE.md` if it exists
3. inspect relevant recent git commits
4. verify the current repository state before continuing

At the end of a completed task:

- run the relevant tests
- run the appropriate build/type/lint checks available in the repo
- update `docs/BUILD_STATE.md`
- leave the working tree understandable
- create a coherent commit when the task calls for committing

Do not claim a phase is complete without verification evidence.

## Completion Reports

At the end of an implementation task, report concisely:

- what changed
- important implementation decisions
- migrations added
- tests/checks run and their outcomes
- commit(s), if created
- anything intentionally left out
- blockers or risks
- the next planned phase

Do not claim future roadmap work was implemented unless it actually was.
