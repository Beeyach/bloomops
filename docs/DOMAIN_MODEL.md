# BloomOps Domain Model

This document contains durable domain and permission truth.

## Top-Level Hierarchy

Workspace
→ Members / Users

Workspace
→ Clients

Client
→ Contacts
→ Onboarding
→ Service Engagements
→ Projects
→ Content
→ Files
→ Pages
→ Finance
→ Activity

Service Engagement
→ Projects
→ Milestones
→ Actions
→ Deliverables

## Canonical Source Rule

Each fact has one canonical source.

Examples:

- Client health lives on Client.
- Project status lives on Project.
- Action status lives on Action.
- Content status lives on Content Item.
- Approval outcome lives in Approval history.

Dashboards and department views project canonical records rather than maintaining separate copies.

## Identity and Organization

### workspaces

Represents an agency workspace.

### users

Owned by authentication provider.

### workspace_memberships

Links user to workspace.

Roles:
- Owner
- Admin
- Project Manager
- Team Member
- Client

Membership states:
- Invited
- Active
- Suspended
- Removed

### workspace_invitations

Invitation lifecycle:
- Pending
- Accepted
- Expired
- Revoked

Acceptance, membership changes, and their activity commit atomically. A pending acceptance must still hold the current unexpired token under the database write lock. Retrying an accepted invitation succeeds only for its accepted identity with active workspace access. Generic resend, revoke, and expiry commit with their activity; a stale expiry lookup cannot invalidate a replacement token.

### client_invitation_contacts (A9)

An immutable invitation-to-contact association for portal activation. It names the workspace, client, invitation, and intended contact, with composite foreign keys enforcing the same client and workspace on both parents. A primary-contact change cannot retarget an existing invitation. Acceptance checks the signed-in email against the invitation and the intended contact's current address, then atomically accepts the invitation, creates/reactivates the Client membership, links `client_contacts.user_id`, and records activity. A different linked user, an internal-role membership, or a Client identity already linked to another client in this workspace is refused. Legacy invitations without this explicit association do not infer access from email.

### departments

Initial:
- Social
- Ads
- Systems
- Operations

### department_memberships

Department association does not itself grant access to every client.

### member_capabilities

Examples:
- finance.view
- finance.edit
- members.manage
- workspace.settings
- templates.manage

## Clients

### clients

Key concepts:
- workspace
- name/company
- relationship status
- health
- timezone
- website
- start/end dates
- owner

Client lifecycle:
- Draft
- Onboarding
- Active
- Paused
- Completed
- Ended

Client health:
- On Track
- Needs Attention
- At Risk

Status and health are independent.

### client_contacts

A client may have multiple contacts.

Fields conceptually include:
- client
- name
- email
- title
- linked user id, nullable until portal acceptance
- primary flag

### client_assignments

Assigns internal users to the client.

## Services

### service_types

Reusable catalog items.

Fields:
- workspace
- name
- slug
- department
- active

### service_engagements

A specific purchased service for a specific client.

Possible states:
- Planned
- Onboarding
- Active
- Paused
- Completed
- Cancelled

Possible fields:
- client
- service type
- package name
- start/end
- approval preference
- scope notes
- source template version

### service_assignments

Assignment at the client-service level.

This is important for contractor scope.

## Onboarding

### client_activations (A9)

One immutable initial activation record per client, pointing to the exact generated onboarding instance and the primary contact invited at activation. It snapshots recipient email and name for safe retry, retains the activating membership, and uses same-workspace/same-client foreign keys. Client lifecycle and onboarding lifecycle remain their own facts; this record proves that the initial A9 operation already committed, even after those lifecycles advance.

The mutable invitation delivery fields are `pending`, `sending`, `sent`, or `failed`, with an attempt id, lease expiry, invitation reference, and confirmed-delivery timestamp. A database claim coordinates retries; it is not a notification or queue subsystem. Mail runs outside the core transaction. Retry can rotate a pending token, but cannot regenerate onboarding or repeat the initial lifecycle transition. Editing a contact address never silently retargets this activation: delivery/acceptance fail safely if the intended address no longer matches. Deliberate retargeting/unlinking UI is deferred. An expired, unaccepted activation invitation can be renewed through this same retry path even after its first delivery succeeded. Renewal retains the first confirmed-delivery timestamp and does not repeat activation, onboarding, or the initial Client-invited event. Generic invitation management still refuses activation-bound resend, revoke, and retargeting; accepted or deliberately withdrawn invitations are not renewed by expiry recovery.

### onboarding_instances

One generated onboarding instance for a client activation.

Overall states:
- Not Started
- In Progress
- Ready
- Complete
- Blocked

### onboarding_instance_templates

Canonical relational provenance for generated onboarding. One instance records every exact immutable template version used to compile it, through unique instance/version relationships with same-workspace foreign keys. These source relationships are append-only. The legacy nullable single `onboarding_instances.template_version_id` field is retained for compatibility and left null by the A8 engine.

Generated items are relational runtime snapshots. They may evolve through their own operational lifecycle, but later master-template edits or publication must not silently rewrite them or their service relationships.

### onboarding_items

Item states:
- Pending
- In Progress
- Completed
- Blocked
- Waived
- Not Applicable

Responsible party:
- Client
- Team
- Specific User
- External

Useful fields:
- stable logical key
- title
- instructions
- required
- verification required
- responsible party
- due date
- completed date
- visibility
- position
- related services

Completion rule:

Required items must be Completed, Waived, or Not Applicable before onboarding can complete, unless an authorized override with reason is recorded.

### onboarding_item_submissions (A10)

One immutable submission per onboarding item, keyed by item id, with workspace id, submitting membership and timestamp. Composite foreign keys keep the item and actor in the same workspace; the item reaches its client through the existing instance relationship. A submission is a durable Client confirmation of the described external step, with no payload or credentials. Verification-required Client work remains In Progress with completion/verification fields unset until an authorized coordinator verifies it. Repeated submission is a no-op.

### onboarding_item_resolutions (A10)

One immutable resolution reason per item, with workspace id, resolving membership and timestamp. Composite foreign keys retain workspace isolation. The canonical outcome remains the item's Waived or Not Applicable status; this relation owns the non-empty reason (maximum 1000 characters). An append-only activity event records the outcome and rationale in the same transaction. Terminal resolutions cannot be silently overwritten, and the Client projection never includes internal rationale.

### Runtime actions, progress, and completion (A10)

`onboarding.view` follows the existing resource visibility and client scope. `onboarding.submit` permits only an active Client contact to fulfill client-visible, client-responsible work. `onboarding.verify` and `onboarding.manage` are Owner/Admin/Project Manager coordination actions; Department membership, internal ownership and Team Member assignment confer no write authority. Restricted visibility still denies unnamed Project Managers. Internal users can complete non-client work or resolve a requirement as Waived/Not Applicable with reason. Client-owned verification requires a prior Client submission; Clients cannot self-verify, waive, or reopen work.

The first real item progress mutation starts a Not Started instance. Each mutation, its semantic activity, optional instance completion, and initial Client Onboarding → Active transition share one transaction. Compare-and-set guards reload after concurrent writes; final completion predicates read all required items under the database write lock. Only Completed, Waived and Not Applicable satisfy overall completion. Optional work never blocks it. Completion does not change Service status and never changes an unexpected Client lifecycle to Active. Only the A9 activation's initial instance may cause the automatic Client transition.

Client-facing “your steps” counts only client-visible, client-responsible required items. Durable submission counts as the Client having done their part, while awaiting internal verification still blocks overall completion. Hidden agency requirements never appear in Client counts. One account can reach several clients through A4 contact links; each is rendered in its own named context. The dedicated portal allowlist excludes logical keys, actor ids, template provenance, service relationships, hidden items, and internal resolution reasons.

Schema-v1 templates define no input type, upload flag or external URL. A10 supports confirmation of externally described steps; it neither infers file upload from labels nor invents links. File storage/upload workflows and a general Files module remain outside A10.

## Projects

### projects

Implemented in B1 by additive migration `0008_b1_projects_core.sql`.

A Project belongs to exactly one workspace and Client. Its optional Service Engagement must belong to that same workspace **and Client**, enforced by a composite foreign key. The migration adds a unique `(workspace_id, client_id, id)` Service index to support this relationship; it does not rebuild any Release A table. Parents are fixed through B1 application operations. Creation may select an open Service; closing the Service later does not rewrite or disable its existing Projects.

Service-specific Projects derive Department through the Service Type. They store no competing Department value. Client-level Projects may name an active Department in their workspace. Department organizes work and never grants access.

The bounded name is required; the optional client-facing label defaults to the name only for explicitly client-visible presentation. Optional responsibility is an active internal workspace membership when assigned or changed. Ownership grants no access; a later inactive owner remains recorded until deliberately reassigned. Dates are optional valid calendar dates with target on or after start. Completion is a server-recorded timestamp. Created/updated timestamps and a positive `revision` support history and optimistic concurrency.

Status and health are independent Project facts. Neither changes Client relationship/health, Service lifecycle, or onboarding. Health is On Track, Needs Attention, or At Risk. Every Project starts Planned. The explicit status matrix is:

| From | Allowed next states |
|---|---|
| Planned | Ready, Cancelled |
| Ready | In Progress, Cancelled |
| In Progress | Waiting, Blocked, Review, Cancelled |
| Waiting | In Progress, Cancelled |
| Blocked | In Progress, Cancelled |
| Review | In Progress, Completed, Cancelled |
| Completed | Archived |
| Cancelled | Archived |
| Archived | None |

Waiting records the expected dependency/person; Blocked records the unexpected impediment. Entering either requires a bounded explanation. Leaving clears that explanation. Completion is irreversible in B1 and its timestamp survives archiving. An identical retry changes neither revision nor history; competing stale changes return a conflict. Concurrent identical completion accepts the winner's timestamp.

Details, health, owner, lifecycle and assignments use conditional D1 batches with their semantic events. The write rechecks live membership, workspace, scope, visibility, revision, and changed relationship prerequisites. A late activity failure rolls back the mutation. Names are not a natural unique key: two intentional creates may have the same name and get separate IDs and creation events.

Visibility defaults to internal and may be internal, client, or restricted. Owner/Admin/Project Manager coordinate Projects, subject to A4 restricted visibility. Owner/Admin can see restricted work; Project Managers and Team Members require an explicit Project assignment for it. Project Managers can restrict an existing Project when explicitly assigned; Owner/Admin can create restricted Projects. Client-wide assignment covers ordinary Projects under that Client; Service assignment covers only Projects tied to that Service; explicit Project assignment covers only that Project. Client/Service siblings and parents never become reachable merely from a Project assignment.

Project history uses canonical `activity_events` with `subject_type='project'`, Project subject ID, and existing Client/Service context. Creation, changed details/health/owner/status, and added/updated/removed assignments have distinct semantic events. Internal Client history filters Project events by **current** Project scope and visibility, including after a Project becomes restricted. Clients never receive Project history.

The portal selects a dedicated allowlist: `id`, `label`, `statusLabel`, `targetDate`, `completedAt`, `clientId`, `clientName`. It requires a current contact link and explicit client visibility, including for guessed IDs. It selects no owner, assignments, health, internal explanation, revision, or Service/Department IDs. Portal Home renders only relevant Project sections, separated by reachable Client. Internal list reads use relational assignment predicates and show at most 200 rows with an explicit overflow notice and status/Client narrowing.

### project_assignments

Maps a Project to an internal workspace membership with Lead or Member responsibility. A unique `(project_id, membership_id)` prevents duplicates; composite foreign keys protect both workspace relationships. Assigning requires an active internal member. Inactive historical assignments remain visible internally but grant no authorization, and may be removed. Assignment removal leaves ownership unchanged. There is no new workspace role or department-wide grant.

## Milestones

### milestones

Possible states:
- Upcoming
- In Progress
- Waiting
- Completed
- Skipped

Useful fields:
- project
- internal name
- client-facing label
- position
- dates
- client visibility

## Actions

Database may use `tasks`; UI calls them Actions.

Possible states:
- To Do
- In Progress
- Waiting
- Review
- Done
- Cancelled

Useful fields:
- client
- service
- project
- milestone
- department
- title
- description
- assignee
- priority
- due date
- waiting reason/type
- visibility

Waiting reasons:
- Client
- Ellen
- Ary
- Team
- External
- Dependency
- Other

### task_dependencies

Simple dependency edges:
- task_id
- depends_on_task_id

Cycles must be prevented.

A downstream action blocked by an incomplete prerequisite should not be treated as ordinary overdue work.

## Deliverables

Deliverables describe what the client receives.

Possible states:
- Planned
- In Progress
- Internal Review
- Client Review
- Approved
- Delivered
- Cancelled

Examples:
- funnel
- sales page
- email sequence
- course build
- automation map
- report

Deliverables may have files, versions, approvals, client visibility, and activity.

## Requests

Possible states:
- Submitted
- Triage
- Need Info
- Accepted
- Declined

Accepted requests may be converted to an Action or Project.

## Content

### content_items

Useful fields:
- client
- service
- title
- type
- pillar
- owner
- hook
- script
- caption
- CTA
- workflow flags
- target publish date
- published date
- visibility

Workflow flags:
- recording_required
- internal_review_required
- client_approval_required

Default pipeline:
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

### content_platforms

Associates content item with platforms.

## Assets / Files

### assets

D1 metadata for R2 objects.

Possible states:
- Uploading
- Ready
- Failed
- Archived

Useful fields:
- workspace
- R2 key
- filename
- mime
- size
- uploader
- status
- visibility

### asset_links

Generic relationship:
- asset
- subject type
- subject id
- purpose

Files may attach to Clients, Onboarding, Projects, Milestones, Actions, Deliverables, Content, Requests, and Pages.

Visibility:
- Internal
- Client
- Restricted

## Approvals

Approval history is append-only by round.

Possible states:
- Requested
- Approved
- Changes Requested
- Withdrawn

Store:
- subject type/id
- round number
- requested by
- requested from
- status
- feedback
- requested/responded timestamps

Do not overwrite prior approval rounds.

## Comments

Comments attach to work.

Fields conceptually include:
- subject type/id
- author
- body
- visibility
- timestamps

No separate PM chat system is required.

## Pages

Inherited Pages remain the freeform document layer.

Add metadata as needed:
- workspace
- client
- service
- project
- category
- visibility
- owner

Do not use Pages to replace structured operational tables.

## Templates

### templates

Examples:
- Onboarding
- Project
- Social
- Systems
- Ads

### template_versions

Store immutable/versioned definitions, potentially as `definition_json`.

Instantiation creates relational runtime records.

Editing the master template must not mutate existing client work.

## Finance

### finance_records

Potential fields:
- client
- service
- record type
- amount
- currency
- status
- due date
- paid date
- provider
- reference
- notes

Invoice states:
- Draft
- Sent
- Paid
- Overdue
- Void

Payment states:
- Pending
- Completed
- Failed
- Refunded

Finance is capability-protected.

## Activity

### activity_events

Immutable significant operational events. Client, service, contact, assignment, membership-status, and invitation changes commit with their semantic events, conditional on the same stored state, so concurrent duplicate edits cannot append history for a change that did not occur.

Possible fields:
- actor
- event type
- subject type/id
- client
- project
- metadata
- timestamp

Examples:
- CLIENT_CREATED
- CLIENT_ACTIVATED
- CLIENT_INVITED
- ONBOARDING_STARTED
- ONBOARDING_ITEM_COMPLETED
- ONBOARDING_COMPLETED
- SERVICE_STARTED
- SERVICE_PAUSED
- SERVICE_COMPLETED
- PROJECT_CREATED
- PROJECT_STARTED
- PROJECT_WAITING
- PROJECT_COMPLETED
- ACTION_ASSIGNED
- ACTION_WAITING
- ACTION_COMPLETED
- CONTENT_CREATED
- CONTENT_RECORDING_RECEIVED
- CONTENT_READY_FOR_REVIEW
- CONTENT_READY_FOR_CLIENT
- CONTENT_APPROVED
- CONTENT_REVISION_REQUESTED
- CONTENT_SCHEDULED
- CONTENT_PUBLISHED
- APPROVAL_REQUESTED
- APPROVAL_RESPONDED
- FILE_UPLOADED
- REQUEST_SUBMITTED
- REQUEST_ACCEPTED
- PAYMENT_RECORDED

## External Events

### external_events

Used for webhook idempotency.

Fields conceptually:
- provider
- external event id
- event type
- payload hash
- received/processed timestamps
- status

Unique:
- provider + external event id

## Permission Model

Four layers:

Identity
→ Role
→ Scope
→ Visibility

Every protected request should conceptually verify:

1. authenticated user
2. active workspace membership
3. resource belongs to workspace
4. role/action permission
5. assignment scope where required
6. record visibility
7. special capability where required

Default deny.

Department membership alone does not grant all clients.

White-label staff are Team Members initially, not separate tenants.

Provider identity should not automatically be exposed to clients.

## Tenant Rule

Use `workspace_id` consistently for business records where appropriate.

Development, staging, and production must not share the same operational database.

No cross-workspace mutable Client object in V1.
