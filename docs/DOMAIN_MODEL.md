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

Implemented in B2 by additive migration `0009_b2_milestones.sql`. One Milestone belongs to one workspace and one Project, protected by a composite foreign key. Client, Service and Department context derive from that Project. No Release A or B1 table is rebuilt.

The required internal name and optional Client label are bounded to 120 characters. A Client label defaults to the name only for explicitly shared presentation. Start/target dates are optional valid calendar dates, with target on or after start. Visibility is internal by default, or client/restricted. Position, revision, created/updated timestamps and server-owned completion are relational fields. A parent-scoped UUID `creation_request_id` is retry metadata: the server still generates the Milestone ID. Its immutable creation event snapshots the normalized initial details, so a retry can identify its original creation even after later operational edits. Reusing that key for different initial details conflicts; deliberate same-name creates with different keys remain separate.

Every Milestone starts Upcoming. Its lifecycle is independent of Project status/health, Client relationship/health, Service lifecycle and onboarding:

| From | Allowed next states |
|---|---|
| Upcoming | In Progress, Waiting, Skipped |
| In Progress | Waiting, Completed, Skipped |
| Waiting | In Progress, Completed, Skipped |
| Completed | None |
| Skipped | None |

Waiting requires an internal explanation of what or whom it is waiting on, bounded to 1000 characters with ordinary multiline text supported, following `AGENTS.md`. Leaving Waiting clears the explanation. Completed records one server-owned timestamp; Skipped has none. Terminal status cannot reopen through B2 operations, though details may still be corrected. Identical retries change neither revision nor history; competing stale edits/status changes conflict. Concurrent identical completion accepts the winner's timestamp.

Owner/Admin/Project Manager coordinate reachable Milestones; Team Member is read-only. Milestone scope follows the existing parent Project's Client, Service or explicit Project assignment. A Project assignment never grants the parent Client, Service or siblings. Department membership and Project ownership grant nothing. Parent Project visibility caps every child. Owner/Admin may see restricted Milestones; PM/Team Member need an explicit assignment to that Project. The same assignment is required for a PM to create or change a Milestone to restricted. Live SQL rechecks identity membership, role, workspace, scope and visibility, including inside committing batches.

Projects support up to 200 Milestones. Each Project has unique integer position slots, appended under the write lock. Reads order by position and ID. Reorder accepts exactly the actor's complete readable set with each row's expected revision; hidden rows keep their slots and never enter the request or progress. A conditional semantic event acts as a transaction receipt, then two guarded updates park the selected rows above the Project's occupied range and assign their requested slots. This avoids SQLite's immediate unique-index collisions. Every selected revision advances once. Snapshot membership/revisions are checked under the lock, so concurrent reorder/status and visible creation races cannot silently overwrite. A winning-order retry is a no-op. No Project ordering token, counter or second lifecycle field is added.

Progress is derived only from currently readable Milestones. Completed and Skipped count as **finished**. Zero readable rows produce null progress. Clients require both current parent and child visibility=client and a current contact link. The dedicated Client Milestone DTO is exactly `id`, `label`, `statusLabel`, `targetDate`, `completedAt`; its enclosing summary is `items` plus `progress` (`total`, `finished`, `percentage`, or null). The server consumes raw status and grouping IDs before serialization. No positions, revisions, request keys, internal names where a Client label exists, waiting explanations, team identities, Service/Department IDs or hidden counts appear. Existing B1 Project DTO fields are unchanged.

Canonical activity uses `subject_type='milestone'`, with Client/Service context derived from the Project. Created, details updated, status changed and order changed are distinct semantic events. Mutations and history share one D1 batch; stale/concurrent losers append no events, and failures roll back both. Order history contains no ordered ID list or hidden count. Project and Client history filter all child events by **current** Milestone and Project readability, including events recorded before restriction. Clients receive no internal Milestone history.

Milestones live inside the internal Project detail with accessible create/edit/status dialogs, keyboard/touch reorder controls, scoped read-only Team presentation and derived progress. The portal nests only nonempty safe Milestone summaries under their visible Projects. There is no new global Milestones navigation destination, automatic Project completion or template generation. B3 Actions remain separate records as described below.

## Actions

### actions (B3)

Implemented by additive migration `0010_b3_actions_dependencies.sql`. Preflight found no inherited `actions` or `action_dependencies` table collision. The UI consistently calls these records Actions.

Each Action belongs to exactly one workspace and Project. Client, Service Engagement and Department are derived through the Project, including B1's service-type Department rule. An optional Milestone has a composite `(workspace_id, project_id, milestone_id)` foreign key; B3 adds the corresponding unique Milestone index without rebuilding that table. The assignee FK belongs to the same workspace. No parent identity or lifecycle is duplicated onto an Action.

The 18 stored columns are `id`, `workspace_id`, `project_id`, `milestone_id`, `creation_request_id`, `title`, `description`, `status`, `priority`, `assignee_membership_id`, `due_date`, `waiting_type`, `waiting_reason`, `visibility`, `revision`, `completed_at`, `created_at`, and `updated_at`.

Title is required, trimmed and bounded to 120 characters. Description is optional, trimmed and bounded to 5000 characters with ordinary multiline text allowed. Priority is Low/Normal/High/Urgent (`low`, `normal`, `high`, `urgent`), default Normal. Due date is a real calendar date or null. Visibility is `internal` or `restricted`, enforced by both application and database; Actions have no Client-visible state or portal representation.

Every Action starts To Do. The exact transition matrix is:

| From | Allowed next states |
|---|---|
| To Do | In Progress, Waiting, Cancelled |
| In Progress | Waiting, Review, Done, Cancelled |
| Waiting | In Progress, Review, Done, Cancelled |
| Review | In Progress, Done, Cancelled |
| Done | None |
| Cancelled | None |

Waiting requires a type (`client`, `ellen`, `ary`, `team`, `external`, `dependency`, `other`) and a trimmed explanation of 1–1000 characters; ordinary multiline text is supported. Leaving Waiting clears both fields. Done records one server-owned completion timestamp; Cancelled has none. Terminal lifecycle states cannot reopen, though coordinators can correct structural details. Action operations never change another Action, Project, Milestone, Client, Service, onboarding or Department lifecycle. Dependency blocking does not add an undocumented transition gate or automatically change status.

A UUIDv4 creation request key is unique inside its workspace/Project. The immutable creation event snapshots normalized initial details, so identical retries converge after later edits and key reuse with different initial details conflicts. Intentional same-title Actions remain distinct. A positive integer revision guards structural changes, assignment, lifecycle and dependency mutations. Identical retries are no-ops; competing stale writes conflict; concurrent Done retries accept the winning timestamp. Conditional D1 batches commit semantic activity with each changed fact, or roll back together. Live authorization, reference eligibility and revisions are checked under the committing write lock. No uncertain mutation is retried automatically.

Assignment names an active internal workspace membership when first set or changed. A later inactive or noninternal assignee remains historical responsibility until deliberately reassigned, but grants no authorization. Ordinary edits can retain that historical assignment.

Owner/Admin/Project Manager coordinate Actions in Projects they can manage. Team Members read through existing Client, Service or explicit Project assignments and may progress only Actions currently assigned to their own active membership. Current direct Action assignment grants only that Action, including a restricted Action or an Action in a restricted Project, with minimal parent labels. It never changes permission to the full Project, Client, Service, sibling Actions or Milestones. DTOs provide a Project link only when B1 independently allows that Project; linked Milestone details require independent B2 readability. Reassignment or membership deactivation revokes the narrow grant immediately, including for previously loaded actors and issued sessions.

Restricted Action access is limited to Owner/Admin, explicitly Project-assigned PMs, and Team Members explicitly assigned to the Project or currently assigned to that Action. Department membership and Project ownership grant nothing. Central permissions are `action.list`, `action.view`, `action.manage`, `action.progress`, and `action.dependencies`; Team progress has its additional current-assignee rule. Clients cannot list/read/progress Actions or see Action history, graph, counts or navigation.

Work opens on Actions and retains Projects at `/work?tab=projects`. Mine means all Actions assigned to the actor, including terminal work; Today selects nonterminal due dates equal to the current Client calendar day; Upcoming selects nonterminal due dates strictly later than that day. Waiting and Review select explicit lifecycle states. All includes terminal work. Overdue requires a past due date, nonterminal status and no unresolved prerequisite. Each Client's configured IANA timezone determines its calendar day; absent settings use UTC. Tests supply time explicitly, including midnight and DST boundaries.

Client, Department, Service, Project, Assignee, Status and Priority filters use relational predicates. Work pages contain at most 200 Actions with next/previous navigation. Facets contain at most 200 readable choices and disclose overflow. B3 also enforces a 200-Action ceiling per Project atomically, following B2's bounded parent-detail approach: this keeps Project rows and prerequisite choices complete and bounded. The create form states that limit; hidden rows never expose counts. No unbounded assignment-ID parameter lists are constructed.

Project detail supports manual creation, structural edits, assignment and assigned-work progress. `/work/actions/:id` supports narrow Action-only access and dependency management. Internal DTOs explicitly select needed fields; raw database rows, creation keys, actor records, membership directories and hidden Milestone/endpoint details never cross the API/UI boundary. Views reuse Bloom rows, dialogs and controls, with a native Filters disclosure, focus restoration, keyboard/touch support and responsive layouts.

### action_dependencies (B3)

Each edge stores `id`, `workspace_id`, `project_id`, `action_id`, `depends_on_action_id`, and `created_at`. Both composite endpoint foreign keys require the same workspace and Project. A unique endpoint-pair index prevents duplicates and a CHECK prevents self-edges. Edge identity lets a delayed removal be an idempotent no-op after that pair has been removed and recreated under a new ID.

Cycle prevention runs as a recursive `UNION` reachability predicate inside the committing conditional write, independently reinforced by a `BEFORE INSERT` database trigger. Nodes are visited once even in diamonds. Competing edge additions cannot both pass a stale graph; edge endpoints are immutable in place through an update trigger. Removal does not alter either lifecycle. Unknown/already removed edge IDs are no-op removals after source authorization; additions and existing-edge removals require both endpoints currently readable.

Done is the only satisfying prerequisite state. Cancelled remains unresolved. `dependencyBlocked` is derived from direct prerequisites, including inaccessible ones, without storing a second lifecycle field. Inaccessible prerequisite IDs, labels, counts and graph structure are omitted; the generic blocking boolean still prevents falsely classifying downstream work as ordinary overdue. Manual completion remains independent of dependencies.

Canonical events distinguish Action creation, details, assignment, status, dependency addition and dependency removal. Priority edits are coherent detail changes. Dependency events retain only the source Action title, never a sibling title or complete graph. Project and Client history filter every Action event through that Action's current live readability so past titles disappear after restriction or scope revocation. No Action history is exposed to Clients.

## Deliverables

Implemented in B4 as the relational `deliverables` table. Deliverables describe what the Client receives, such as a funnel, sales page, email sequence, course build, automation map or report. They are separate from internal Actions and their assignment, due dates, dependencies and lifecycle.

Each Deliverable belongs to exactly one workspace and Project through a composite foreign key. Client, Service and Department derive from that Project. Parent identities are fixed by the creation route and cannot be edited through a Deliverable mutation.

Stored fields are `id`, `workspace_id`, `project_id`, `creation_request_id`, `title`, `client_label`, `description`, `status`, `visibility`, `target_date`, `delivered_at`, `revision`, `created_at`, and `updated_at`. The internal title is required, trimmed and bounded to 120 characters; the optional Client label is bounded to 120, and optional multiline internal description to 5000. Target date is an optional real calendar date. Visibility defaults to internal and supports internal/client/restricted. Each Project accepts at most 200 Deliverables, with an atomic creation guard and deterministic, explicitly bounded lists.

Every Deliverable starts Planned. B4 uses this exact lifecycle:

| From | Allowed next states |
|---|---|
| Planned | In Progress, Cancelled |
| In Progress | Internal Review, Cancelled |
| Internal Review | In Progress, Client Review, Approved, Cancelled |
| Client Review | In Progress, Approved, Cancelled |
| Approved | Delivered, Cancelled |
| Delivered | None |
| Cancelled | None |

Delivered owns one server-generated timestamp; Cancelled has none. Both lifecycles are terminal, while coordinators may still correct details. No Deliverable mutation changes Project, Milestone, Action, Client, Service or Onboarding facts or lifecycles. Approved and Client Review are coordinator-managed states, without formal approval rounds or Client approval actions.

Owner/Admin/Project Manager coordinate reachable Deliverables. Team Members are read-only through their existing Client, Service or Project scope. Department membership, Project ownership and an Action-only assignment grant no Deliverable access. Restricted parent or child visibility requires explicit Project assignment for PM/Team; Owner/Admin retain access. Live SQL predicates check workspace status, membership, role, scope and visibility both during reads and inside committing writes.

Clients require a current contact link plus explicit client visibility on both the Project and Deliverable. The dedicated portal DTO contains exactly `id`, `label`, `statusLabel`, `targetDate`, and `deliveredAt`. A blank Client label displays the literal **Deliverable**, never the internal title. Internal Review projects as **In progress**; Client Review as **Ready for review**. Other states use plain delivery wording. Queries never select internal title/description for the portal; revision, request metadata, identities, activity, Service/Department IDs and hidden counts are absent. Zero visible children produces no portal section or fabricated progress. Portal Home loads the same bounded per-Project projection for its already authorized Projects.

UUIDv4 creation keys are unique within workspace/Project. Immutable `DELIVERABLE_CREATED` activity snapshots the normalized initial details, so identical retries converge even after later edits; incompatible key reuse conflicts. Detail/status mutations use positive integer revisions and compare-and-swap writes. Identical response-loss retries append no duplicate history; competing writes conflict. Canonical events distinguish creation, detail changes (including visibility) and status changes. Events and facts commit in the same D1 batch, with rollback on late failure. Project/Client history filters all old Deliverable events through current readability before presenting their titles.

B5 adds File attachments as described below. Versions, formal approvals/history, comments, notifications, templates and automatic generation remain later work. B4 introduced no placeholder records or controls for them.

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

## Assets / Files (B5)

B5 implements Files in additive migration `0012_b5_files.sql`, with D1 owning metadata, authorization and lifecycle, and the existing environment-specific `FILES` R2 binding owning bytes. The schema has no inherited name collision. No bucket, binding, Worker compatibility date, historical migration or prior domain table is rebuilt or renamed.

### assets

The 19 columns are `id`, `workspace_id`, `creation_request_id`, `filename`, `mime_type`, `byte_size`, `sha256`, `uploader_membership_id`, `initial_visibility`, `visibility`, `status`, `object_key`, `lease_until`, `etag`, `revision`, `ready_at`, `archived_at`, `created_at`, and `updated_at`. Uploader membership has a same-workspace FK. Workspace/id, workspace/request and object key are unique. Twelve CHECKs enforce bounded/coherent metadata and lifecycle. Immutable initial details, including original visibility, distinguish an intentional new upload from a replay after an operational visibility change. Original File identity, filename, type, size, checksum, request key, uploader and creation timestamp cannot be rewritten.

Files accept **1–5,242,880 bytes (5 MiB)**. Display filenames are NFC-normalized, trimmed and bounded to 180 UTF-16 code units; paths, C0/C1 controls, bidi formatting and malformed UTF-16 are refused. MIME is a normalized type/subtype, bounded to 127 characters, without parameters or controls. Unknown browser types use `application/octet-stream`. No authorization or content trust is inferred from the extension or MIME. No scanning service exists or is claimed.

A single upload request contains a percent-encoded exact JSON metadata allowlist in `x-bloomops-file` (maximum 4096 header characters) and a raw `application/octet-stream` body. The initial fields are `requestId`, `filename`, `mimeType`, `byteSize`, optional `visibility` and optional `deliverableId`. Retry by File ID accepts only filename, MIME and size plus the same bytes. The route validates metadata before allocating one bounded buffer, reads incrementally, checks actual and declared lengths, and stops oversized streams; it never calls unbounded `formData()` or `arrayBuffer()` on an incoming request. SHA-256 is computed by the server and supplied to R2 for integrity verification. D1 contains no bytes or signed URL.

### asset_links

Each File has one fixed relational attachment: `asset_id`, `workspace_id`, `project_id`, optional `deliverable_id`, and `created_at`. The asset is the primary key. Composite FKs bind File and Project to the same workspace, and the optional Deliverable to that exact workspace and Project. B5 adds a unique `(workspace_id, project_id, id)` Deliverable index to support this FK. The link has a workspace/Project/Deliverable lookup index. Link update/delete triggers prevent silent relinking or loss of historical authorization.

B5 deliberately implements **Project and Deliverable attachments** because these have the required current upload surface and a shared, well-defined parent permission ceiling. Files for a Client are presented under that Client's reachable Projects. Client-only, Milestone, Action and onboarding attachment workflows are not exposed in B5; there is no generic polymorphic endpoint or future Content/Request/Page/Finance placeholder. The link owns parent context; File metadata does not duplicate Client, Service or Project lifecycle facts. Each Project has an atomically enforced ceiling of 200 Files including archives, with complete bounded active lists.

### asset_upload_attempts and storage protocol

Attempt rows hold `id`, `workspace_id`, `asset_id`, `object_key`, `cleanup_checked_at`, and `created_at`. File FK is same-workspace; keys are unique, with a workspace/File/last-check index. Identity and keys are immutable and rows are retained, including after cleanup, so an interrupted writer cannot leave an untracked generation. A last-check timestamp describes a cleanup attempt, not confirmed absence forever.

1. Current coordinator authorization, Project/Deliverable reach and intended restriction are checked. One conditional D1 batch reserves the File as **Uploading**, its fixed link and its first attempt. Keys use `bloomops-files/<encoded-workspace-id>/<server-file-id>/<server-random-id>`; no filename or caller storage key enters the key. A five-minute lease protects the in-progress attempt.
2. R2 `put` must return the expected key, positive exact size, MIME, etag and SHA-256. Then one conditional D1 batch checks live actor/parents/File visibility, current key and revision and commits **Ready**, one server readiness timestamp and exactly one `FILE_UPLOADED` event. Uploading has no semantic upload event. Lease expiry alone does not invalidate a writer; a competing recovery claim changes its key and fences it atomically.
3. Put/finalize failure marks an owned Uploading generation **Failed** when D1 is available, then best-effort cleans only keys proven permanently ineligible for readiness. Unknown D1 outcomes never justify blind deletion. A lost finalize response is accepted only after a fresh authorized Ready read and matching R2 `head`; its committed object is retained. An unavailable database may leave an Uploading row and known key until explicit recovery.
4. Same workspace/request UUID plus identical normalized initial details and bytes converges on the same File. Changed details or bytes conflict. Concurrent active uploads return a conflict; a later retry converges after success. A Failed or expired Uploading retry claims a new unique key and attempt using CAS and live predicates. Old writers and cleaners cannot overwrite or delete the new generation. No uncertain mutation is blindly replayed.
5. Recovery/Ready response-loss retries and archive retry inspect at most ten eligible attempt keys per cleanup pass, rotating both successful and failed checks. Old keys are never reused. Records remain durable after deletion because a previously interrupted PUT could finish late; later explicit retries can revisit them. This is bounded best-effort recovery, not a claim that R2 and D1 commit atomically or that all abandoned bytes are immediately gone. No cron, production sweep, purge or retention policy is introduced.

**Archived** is terminal and removes the File from active lists and all downloads. Archive and `FILE_ARCHIVED` commit together; identical retries are no-ops. Already Ready bytes and their readiness timestamp are retained. Archiving an incomplete upload fences finalization and permits best-effort cleanup of its unusable attempt. Ready visibility changes use revision/CAS and `FILE_VISIBILITY_CHANGED`; bytes, original request facts and parent lifecycles stay fixed. Six migration triggers reinforce fixed attachments, immutable attempts/request facts, and generation transitions; a failed key cannot become Ready or be reused.

### Authorization, download and presentation

Owner/Admin/Project Manager coordinate according to current Project scope. Team is read-only through existing Client/Service/Project assignments. Department, Project ownership and Action-only assignment confer no File grant. PM/Team require explicit Project assignment for a restricted Project, Deliverable or File. Every file query and committing batch checks live workspace, membership, identity, role, scope and parent visibility through relational predicates, without expanding assigned-ID lists.

Clients need a current contact link, Ready status, File visibility=client, Project visibility=client and, for a Deliverable attachment, Deliverable visibility=client. The exact six-field portal DTO is `id`, `filename`, `mimeType`, `byteSize`, `readyAt`, and `attachmentLabel`. A Deliverable attachment label uses its Client label or the literal **Deliverable**; Project attachments have null labels. Internal titles, uploader identities, original request data, storage keys, hashes, revisions, leases, hidden counts and activity never enter the portal. Empty/hidden-only File sets render no portal module or navigation.

Authenticated downloads resolve the opaque File ID through D1, require current readable Ready metadata, then fetch only its canonical R2 key. They recheck current permissions and generation/revision after the R2 await before returning bytes. Non-ready, missing, hidden, foreign and missing-object cases share a sanitized 404; unexpected storage failures are sanitized 500. Missing objects cause no mutating read repair. Bytes already delivered cannot be recalled; authorization is checked before handing over the response stream.

Responses use safe ASCII plus RFC 5987 attachment filenames, `private, no-store`, `nosniff`, a sandboxed content policy and same-origin resource policy. Metadata is `no-store`; mutation routes have Origin protection and exact field allowlists. R2 metadata is never forwarded wholesale. No public URL, raw-key route, public cache, presigned upload or anonymous download exists.

Internal Project Files support upload, fixed Project/Deliverable selection, download, failed/interrupted retry, Ready visibility and archive. Ready attachments also appear under the corresponding Deliverable. Bloom rows, dialogs, live announcements, keyboard file input, pending guards, focus restoration, touch targets and pre-hydration safety are reused. Project/Client history filters every past File event by the File's current parent-capped readability, including after restriction. Clients receive no internal File history.

The 5 MiB policy is deliberately below the platform request ceiling and keeps buffered memory bounded. Preflight used the committed Wrangler configuration, installed Wrangler/Miniflare runtime, and current official [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) and [R2 consistency model](https://developers.cloudflare.com/r2/reference/consistency/). The existing compatibility date is `2025-05-01`; no platform-limit increase or configuration change was required. Actual in-Worker D1/R2 smoke confirms put/checksum/head/get/delete and the full lifecycle on disposable local bindings.

## Work and Home Projections (B6)

B6 is **schema-free**. `work-projections.mjs` reads Projects, Milestones, Actions/dependencies, Deliverables, Files/links and immutable activity. There are no dashboard tables, cached business counters, new lifecycle facts or dashboard mutation endpoints. The internal Home and Work pages require the existing internal shell and fresh server reads; the B1–B5 portal DTOs remain unchanged.

Every Project and child aggregate uses its canonical live read condition, including active identity/membership/workspace/role, scope and parent visibility. A readable Project does not make all children count. Milestone progress is finished (Completed or Skipped) over currently readable Milestones, rounded to a percentage, and absent when the readable total is zero. Action counts are open (not Done/Cancelled), Waiting, Review and canonical Overdue. Deliverable totals and status counts remain separate. File presence counts only currently readable Ready metadata, including the attached Deliverable's permission ceiling; rendering these summaries never reads R2. Direct Action assignment permits only that Action and B3's minimal context. Department membership and Project ownership grant no dashboard reach.

Work retains its separate Actions and Projects tabs. All seven B3 Action views and filters, Client-local calendar days, UTC fallback, pagination and dependency-blocked Overdue exclusion reuse the canonical Action helpers. Project rows retain their 200-row cap and status filter, adding links to the existing Milestone/Action/Deliverable/File sections and filtered Action views.

Home omits empty sections and bounds each Action section (Overdue, Today, Waiting, Review) to four rows, Projects needing attention to five, Deliverables to six and recent outputs to six. Each query fetches one extra readable row to determine overflow; hidden rows cannot cause an overflow notice. Links lead to canonical Work/Project surfaces; Home provides no management controls.

Derived Project attention is deterministic and never writes health/status. Completed, Cancelled and Archived Projects do not enter attention. For the others, the first matching reason wins: At Risk health; Blocked status; Needs Attention health; Waiting status; readable overdue Actions; Deliverables in Client Review; Deliverables in Internal Review; Actions in Review; Actions waiting. Attention sorts by that priority, target dates with undated last, Project name, then ID. Ordinary Work Projects retain target/date/name/ID ordering and include terminal records.

Home Deliverables include Client Review, Approved and Internal Review even without a target, plus other nonterminal outputs whose target is through fourteen Client calendar days ahead (including past targets). Delivered and Cancelled are excluded from this section. Ordering is Client Review, Approved, Internal Review, then other dated outputs; target date (undated last) and ID break ties. These are delivery targets, not another Action overdue state.

Recent output uses only `DELIVERABLE_STATUS_CHANGED` events to Delivered for currently Delivered records and `FILE_UPLOADED` events for currently Ready Files, between the injected/current instant minus fourteen elapsed days and that instant, inclusively. It selects current readable titles/filenames and Project/Client context, never historical titles, raw event metadata, uploader identities, object keys, hashes or upload generations. Each kind is bounded before merging by event timestamp descending and event ID descending. Restriction, archive, assignment/contact changes and membership/workspace/role revocation are evaluated through existing canonical permissions; inaccessible historical names disappear on the next read. This recent section is internal only.

Queries use relational assignment predicates rather than binding a materialized list of assigned IDs. B6 verification covers 240 assigned Projects and checks each generated statement against D1's 100-binding/100 KB statement bounds. The actual D1 Home composition uses fourteen metadata queries, with no R2 binding supplied in its disposable runtime proof.

## Work HTTP input boundary (B7)

Project create/edit/status/assignment JSON accepts only its named fields; unknown keys reject the whole request with a sanitized 400 instead of silently applying the recognized subset. Existing valid forms and lifecycle operations are unchanged. Other Work JSON and upload metadata retain their existing exact allowlists.

Work resource and portal endpoints accept no query inputs. The internal Project collection accepts one `status` and one `clientId`; the Action collection retains its B3 filter allowlist. Unknown or duplicate query keys return a sanitized, uncached 400 after authorization. Unauthenticated or inaccessible resources keep their existing 401/403/404 behavior. Downloads preserve their post-R2 authorization check and cancel any prepared stream before rejecting unsupported query input. This adds no domain field, lifecycle, permission grant or migration.

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
