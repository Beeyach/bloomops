# Release C - Social

## Current state

C1 closed through PR #22 on `f1003c236cbce5102efcddd1bf7cda20e4f8ed8b`. Read-only checks verified [Deploy staging 34276571767](https://github.com/Beeyach/bloomops/actions/runs/34276571767) and [Verify zero-to-current 34276571760](https://github.com/Beeyach/bloomops/actions/runs/34276571760), including disposable-database cleanup, succeeded on that exact merge SHA. C2 closed through PR #23 on `fed68697ff9f45e5c0228655bec2aaee3583f1c2`. Deploy staging `34291205923` and Verify zero-to-current `34291205922`, including disposable cleanup, succeeded on that exact SHA. C3 Calendar + Platforms is implemented and locally verified on `codex/c3-calendar-platforms`, ready for independent ChatGPT audit. Independent audit, user-controlled merge and both exact-C3-merge-SHA gates must precede C4. C4+ remains unimplemented. See `BUILD_STATE.md`.

## Goal

Release C makes Social fulfillment a first-class operational system instead of a generic Project/Action approximation.

Release B closed the shared Work Core. Release C builds structured Content on top of those canonical Client, Service, authorization, File, activity and portal foundations.

At Release C completion, authorized internal users should be able to:

1. create and manage structured Content Items for a Client and, where applicable, a Social service engagement
2. progress each Content Item through the conditional Social production pipeline
3. see scheduled work in a practical calendar by Client and platform
4. receive Client recording uploads inside the exact Content Item that needs them
5. request and preserve formal Client approval rounds and revision history
6. give Clients a calm Content portal that exposes only explicitly client-visible Social work and required actions
7. preserve Release A/B tenant, authorization, storage, activity and responsive-UX guarantees

Release C does not implement Ads campaign operations, Systems/GHL/Kajabi specialist workflows, Pages/SOP operations, Finance, generalized notifications/queues, commercialization, or Release D+ placeholders.

## Canonical Boundaries

- Content is first-class structured data. Do not model the Social pipeline as Pages, generic Deliverables, or a pile of Actions.
- A Content Item belongs to one workspace and one Client. It may reference one current Service Engagement of that same Client when the work is service-specific.
- Existing Client and Service assignments define scope. Department is organization only and never an authorization grant.
- Content owner fields are responsibility, not permission.
- Content visibility is explicit and must not widen parent Client/Service scope.
- Actions remain internal next steps. Deliverables remain client-facing outputs from the shared Work Core. Content is specialized Social production state and must not collapse either model.
- Files remain D1 metadata plus private R2 bytes. Content recording/assets extend the canonical File foundation rather than inventing a second storage system.
- Formal approvals are append-only rounds. Prior approval/revision history is never overwritten.
- Calendar and dashboards project canonical Content facts. They do not maintain duplicate schedule or stage state.
- Client portal reads use dedicated safe DTOs. Internal script/caption/notes/history must never leak merely because a Content Item is client-visible.

## Product Vocabulary

Initial Content types from the product specification:

- Reel
- Static Post
- Carousel
- Story
- Video
- Email
- Ad Creative
- Other

Ad Creative here is only a Content type. Release C does not add Ads campaign or performance behavior.

Default production stages:

- Idea
- Script
- Waiting for Recording
- Editing
- Internal Review
- Client Review
- Revision Requested
- Approved
- Scheduled
- Published

Stages are conditional. Content-specific workflow flags decide which steps apply. C2 defines exact legal transitions through a dedicated operation; ordinary detail edits cannot write stage or publication authority.

## Phase Sequence

### C1 - Content Items Core

Create the canonical Content Item relational model and internal Social list/detail/create/edit experience. Establish exact tenant/scope/visibility rules, normalized Content fields, retry/CAS/activity behavior, and bounded internal reads. New Content begins at Idea; C1 does not implement the production transition engine, calendar, Client uploads, formal approvals, revision rounds, or Client Content portal.

### C2 - Production Pipeline

Implement the exact conditional Social stage transition engine over C1 Content. Workflow flags govern recording, internal review and Client approval requirements. Add safe transition UI, Waiting/Revision context, canonical activity and concurrency/retry rules without duplicating Actions or Deliverables.

### C3 - Calendar + Platforms

Add platform/channel association and calendar composition as needed from canonical Content dates/stages. Support useful Client/platform/date filtering and scheduled/published presentation without creating a duplicate schedule table unless evidence proves one is required.

### C4 - Recordings + Content Assets

Extend the B5 File foundation so recordings/assets live inside the exact Content Item. Client recording uploads must be scoped to a client-visible Content Item and private R2 flow, with current authorization, recovery and download rules at least as strong as B5.

### C5 - Approvals + Revision History

Add append-only approval rounds and durable revision history for Content. Client Review, approval, change requests and later rounds must preserve prior state and feedback. Do not overwrite earlier rounds or turn activity metadata into mutable state.

### C6 - Client Content Portal

Expose only safe, relevant Content to Clients. Conditional Content navigation, current status, required recording/approval actions, safe assets and recent results should use exact allowlisted DTOs and current contact/visibility rules. Never expose internal Actions, owner identities, private scripts/notes, hidden counts or internal activity.

### C7 - Release C Hardening

No new product features. Attack tenant isolation, assignment scope, visibility, pipeline legality, approval/revision history, Content File authorization, concurrent transitions, date/calendar correctness, portal leakage, responsive UX and the integrated Social acceptance story.

If repository evidence requires a smaller safe split, preserve these product boundaries instead of pulling later Release features forward.

## Release-Level Acceptance Direction

A canonical Release C story should prove that a real multi-service Client can have Social Content Items with structured copy and dates, a conditional production pipeline, private recordings/assets, formal approval history and a Client-safe Content portal while a scoped Social contractor sees only canonical assigned Client/Service work.

The same story must prove that restricting/reassigning records while sessions remain issued immediately removes inaccessible Content, counts, history and files.

## Release Gate

Release C is not complete merely because Content pages render.

It requires:

- correct Content identity and parent binding
- exact production-stage legality and conditional workflow rules
- role/scope/visibility enforcement under current database truth
- append-only approval and revision history
- safe Content File/R2 authorization and recovery
- canonical calendar projections
- exact Client portal allowlists with no hidden-count/history leakage
- concurrency/retry correctness
- desktop/mobile/accessibility acceptance
- clean staging deployment and remote zero-to-current verification on the final Release C merge SHA

Do not begin Release D automatically after Release C closes.
