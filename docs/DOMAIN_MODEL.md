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

### onboarding_instances

One generated onboarding instance for a client activation.

Overall states:
- Not Started
- In Progress
- Ready
- Complete
- Blocked

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

## Projects

### projects

Possible states:
- Planned
- Ready
- In Progress
- Waiting
- Blocked
- Review
- Completed
- Cancelled
- Archived

Useful fields:
- client
- service engagement
- department
- name
- owner
- health
- start/target/completed
- client visibility
- client-facing label

Waiting means expected dependency/person.

Blocked means unexpected impediment.

### project_assignments

Maps users to project work.

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

Immutable significant operational events.

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
