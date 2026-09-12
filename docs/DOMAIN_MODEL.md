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

## Content (C1–C5)

Additive `0013_c1_content.sql` implements canonical `content_items`; inherited tables have no name collision. Content is independent of Projects, Actions and Deliverables. C1 stores editorial work and workflow intent only.

### content_items

C1's 23 columns are `id`, `workspace_id`, `client_id`, optional `service_engagement_id`, `creation_request_id`, `title`, `type`, optional `pillar`, optional `owner_membership_id`, optional `hook`, `script`, `caption`, `cta`, `recording_required`, `internal_review_required`, `client_approval_required`, `stage`, optional `target_publish_date`, optional `published_at`, `visibility`, `revision`, `created_at`, `updated_at`.

Workspace, Client and optional Service binding are fixed at creation. Composite foreign keys enforce the same workspace Client, the same workspace/Client Service, and the same workspace owner membership. A Service must resolve through its canonical Service Type to the same workspace Department with slug `social`; labels or Service Type slugs do not determine this. SQL insertion and every authorized read/write enforce that rule. Service lifecycle status adds no invented eligibility restriction. Database triggers prevent identity, parent, request-key and creation-timestamp mutation.

The one value/label module is `content-values.mjs`. Types are exactly `reel` (Reel), `static_post` (Static Post), `carousel` (Carousel), `story` (Story), `video` (Video), `email` (Email), `ad_creative` (Ad Creative), `other` (Other). Ad Creative grants no Ads operations.

Text limits in UTF-16 code units are title 200, pillar 120, hook 2,000, script 20,000, caption 10,000 and CTA 1,000. Text is NFC-normalized, line endings normalized and outer whitespace trimmed; optional blanks become null. Title and pillar are single-line; editorial fields allow line breaks and tabs. Controls, bidi formatting and malformed UTF-16 are rejected. Target publish date is an exact real `YYYY-MM-DD` calendar date. New owners must be current active internal workspace members. Existing inactive responsibility can be retained while editing other details; ownership never grants access.

Workflow flags are exact booleans, defaulting to recording false, internal review true, Client approval true. They express requirements; C1 does not execute a workflow. Storage admits the complete canonical stages: `idea`, `script`, `waiting_for_recording`, `editing`, `internal_review`, `client_review`, `revision_requested`, `approved`, `scheduled`, `published`. All C1 creation starts at **Idea**, revision 1, with no published timestamp. Ordinary details cannot mutate stage or published timestamp; C2 adds the dedicated transition operation below. The database requires published timestamp/stage coherence for later phases.

Visibility is `internal`, `client` or `restricted`, default internal. `client` is future eligibility and grants no Client access in C1. Owner/Admin coordinate all current workspace Content. PM coordinates ordinary Content; restricted PM/Team access requires an explicit current Client or exact Service assignment. Team may read/create/edit within those same canonical assignments: Client assignment reaches Client-level Content and that Client's Social services; Service-only assignment reaches just that Social service. Department membership, Content ownership, Project assignment and direct Action assignment grant no Content scope. Client role has no internal Social access or Content portal DTO/routes.

All SQL reads and committing writes check current active workspace, membership, unchanged role, scope, canonical parent and visibility. Relational assignment predicates avoid huge bound-ID lists. Historical Client activity also checks each Content item's current readability before exposing any old title or event.

### Retry, revision and activity

UUIDv4 creation request keys are normalized to lowercase and unique per workspace/Client. Immutable `CONTENT_CREATED` activity holds the normalized initial details and exact optional Service context. Identical response-loss retries return the original item even after later edits, without reverting it; incompatible reuse or retargeting conflicts. Conditional insertion and activity commit atomically, including concurrent requests. The snapshot is creation provenance, never mutable Content state.

Detail edits use strict positive-integer revision CAS. One competing request wins one revision and one `CONTENT_DETAILS_UPDATED` event. Stale edits conflict even when their supplied values match the winner. A current-revision no-op creates no event. Late fact/event failure rolls back the whole batch. Existing activity immutability applies unchanged.

### Internal Social reads and routes

`/social`, `/social/new`, `/social/:contentId`, and `/social/:contentId/edit` render the real list/create/detail/edit flow. List filters are Client, exact Social Service, type, owner, exact stage and normalized platform. Pages contain at most 200 visible records ordered by creation timestamp descending then ID descending; one extra visible record determines truthful overflow. Offset pages have no lifetime creation cap; concurrent insertions can shift page boundaries. Parent choices fetch at most 200 Client-level and 200 Social-service contexts, with Client-name search and explicit overflow. Owner choices show at most 200 active internal memberships and announce overflow; ownership may remain unset. An existing selected owner remains editable without silent reassignment.

Protected APIs are `GET /api/bloomops/content`, `GET/PATCH /api/bloomops/content/:contentId`, and `POST /api/bloomops/clients/:id/content` or `/api/bloomops/clients/:id/services/:serviceId/content`. Parent context comes from the authorized route, never arbitrary JSON. Real session/workspace authorization precedes exact query/body validation, including duplicate query rejection and malformed/non-object JSON. Responses use safe errors and no-store; mutations require Origin.

C1 itself adds no platform table. C3 platforms/calendar, C4 recording/assets, and C5 formal review snapshots/rounds are documented below. General Content portal navigation (C6), comments, notifications and templates remain unimplemented.

### Conditional production pipeline (C2)

`0014_c2_content_pipeline.sql` adds only nullable `stage_context` to Content (24 columns total) and `content_items_ws_stage_created_idx` on workspace/stage/creation timestamp/ID. The SQL uses additive `ALTER TABLE ADD` with an inline CHECK, equivalent to the Drizzle snapshot's constraint, to preserve existing rows and C1 identity/Social-parent triggers. It requires no table rebuild. Other tables and historical migrations remain unchanged.

The dedicated `POST /api/bloomops/content/:contentId/transition` takes exactly `targetStage`, `expectedRevision`, and optional `context`. `contentNextStages` derives the next applicable forward stage from current relational facts: Idea → Script → Waiting for Recording → Editing → Internal Review → Client Review → Approved → Scheduled → Published. A false recording/internal-review/client-approval flag skips its corresponding future stage. Disabling a flag while already in its stage preserves that stage; forward resolution uses the new flags. Callers cannot skip enabled stages or move backward arbitrarily.

Internal Review or Client Review may branch to Revision Requested; that branch returns only to Editing. Entering Waiting for Recording or Revision Requested requires normalized non-empty context, at most 2,000 UTF-16 code units. Waiting context describes what recording is needed and from whom. Context uses C1 text normalization and controls/bidi/malformed-Unicode rejection. It is stored on Content, survives ordinary editorial edits, and clears when leaving the contextual stage. SQL additionally limits non-null context to those two stages and bounded nonblank text. Historical C1 rows may retain null context; no fabricated backfill is created. Activity does not own mutable context.

Published is terminal. Only the winning server transition sets `published_at`; its value survives all ordinary edits and retries. Approved alone remains a production marker, not proof of a formal Client decision for historical/approval-disabled Content. C5 blocks direct internal Client Review → Approved when Client approval is required; only a matching formal Client response can perform that transition. Scoped Team retains ordinary production fulfillment, not formal request/withdraw/response authority. Clients never gain access to the generic internal transition endpoint.

`content.transition` uses the same role/scope/visibility rules as C1 management. The committing predicate rechecks current active workspace, membership/user/role identity, canonical Client/optional Social Service, assignment, visibility, source stage, expected revision, all three workflow flags and absence of publication. A conditional `CONTENT_STAGE_CHANGED` insert precedes its identically guarded update in one atomic D1 batch. A committed transition consumes one revision and appends one immutable event; either late failure rolls both back.

No request-key column or shadow workflow table is needed. Content ID + consumed expected revision identifies one immutable operation. Its transition event records small `from`, `to`, normalized context and expected-revision facts. An identical retry under current read authorization acknowledges that operation without writing, even after later edits/stages or another revision pass. A different target/context or a revision consumed by an ordinary edit conflicts. Two identical concurrent transitions converge with one event; different transitions or transition/edit races have one canonical winner. Matching the current stage alone is never retry proof. Historical event evidence is queried relationally with the current Content visibility/scope predicate; inaccessible history cannot acknowledge a retry.

The Social detail shows only legal actions, requires context in the existing focus-trapped dialog, preserves keyboard focus after transition, and offers safe reload feedback on conflicts/revocation. The list's exact stage filter projects `content_items.stage`; there is no duplicate pipeline state or drag/drop bypass. C4 adds recordings and C5 adds approval history independently of this stage engine.

### Platforms and calendar (C3)

`0015_c3_calendar_platforms.sql` adds the relational `content_platforms` table: `workspace_id`, `content_id`, `platform_key`, `label`. The composite primary key prevents duplicate workspace/Content/key associations. A direct workspace FK and composite workspace/Content FK enforce tenant identity. A workspace/key/Content lookup index supports platform filters. Content gains only a composite workspace/id unique index for that FK and workspace/target-date/id index for calendar range ordering: still 24 columns, now seven indexes, with C1/C2 triggers preserved. There is no calendar table, schedule column or provider account identity.

Canonical docs and history (including the original `0757d45` model) specify platform associations but no fixed network vocabulary. C3 therefore uses user-entered channel labels, never an invented provider allowlist. A set contains 0–12 labels. Each label is NFC-normalized, trimmed, internal Unicode whitespace collapsed to one ordinary space, nonempty and bounded to 60 UTF-16 units. Its key is the normalized lowercase label, NFC-normalized again and bounded to 120 UTF-16 units to accommodate case expansion. C0/C1 controls, all Unicode format characters (including bidi/invisible controls) and malformed UTF-16 are refused. Duplicate normalized keys reject the entire set. Display spelling is retained; a deliberate case-only label edit is significant. Canonical sets sort by Unicode code point to match SQLite BINARY/UTF-8 ordering, including mixed BMP/astral labels. Database CHECKs independently constrain nonblank key/label lengths; application validation owns Unicode normalization and the set ceiling.

Creation accepts optional `platforms` labels in the existing authorized parent route. Content, initial associations and `CONTENT_CREATED` provenance commit in one D1 batch. The immutable creation event includes the initial normalized set; legacy C1/C2 events without it mean an empty initial set. Creation retries remain valid after subsequent platform/detail/stage changes without restoring old values.

`PUT /api/bloomops/content/:contentId/platforms` accepts exactly `{platforms, expectedRevision}` and no query parameters. It replaces the entire set using the shared Content revision. Current-revision identical sets (including removing an already absent association) are silent no-ops. Significant changes append one immutable `CONTENT_PLATFORMS_CHANGED` event with the expected revision and bounded normalized set. Activity, conditional deletion, conditional association insertion and the revision/timestamp update are one atomic batch. The revision update is last so every preceding statement uses the same unconsumed CAS predicate. Every committing statement checks live Content readability, identity, active workspace/membership, exact current role/assignment and visibility. No platform operation changes Client/Service, workflow flags, stage, current stage context, target date or publication timestamp.

A Content ID plus consumed expected revision identifies retry evidence. The event is joined to currently readable Content. An identical retry acknowledges the original operation even after later changes; incompatible reuse or a revision consumed by another kind of edit conflicts. Competing identical sets converge once; different sets, removal, detail edit or transition have one revision winner. Any late activity/delete/insert/fact failure rolls back the complete set and history. Current authorization is required for retries as well as new writes. Internal Client history filters these events by current Content access, and Clients get no internal C3 access. Owner/Department/Project/Action responsibility remain non-grants.

`GET /api/bloomops/content/calendar` is a read-only projection. It requires exact real `start` and `end` dates with an inclusive range of 1–42 days. Other exact optional query keys are the Content list filters: Client, exact Social Service, type, owner, stage, platform and page. Unsupported or duplicate query values receive sanitized 400 after real-session authorization. Platform filtering normalizes the exact label/key; it is not substring search. Empty platform input clears the filter. Dates use the existing date helper's supported years 0100–9999; a target date is floating calendar data, never converted into a browser-local instant. `published_at` remains the C2 server-owned instant. Rows appear on `target_publish_date` even when actual publication happened on another date; undated Content remains in the list.

The calendar selects only currently readable rows, ordered by target date ascending then Content ID ascending, with 200 visible rows plus one visible overflow probe. Hidden records cannot affect overflow or empty states. One correlated bounded ordered aggregate reads platform labels; an `EXISTS` platform filter avoids duplicated Content rows. The calendar uses one SQL SELECT, relational assignment predicates, no materialized assignment-ID list, no per-item API/DB requests, no editorial-copy fields and no R2 binding. Offset pagination is deterministic for unchanged facts; concurrent date/scope changes can move page boundaries.

`/social/calendar` defaults to the current UTC month and offers exact month, Client, stage and platform filters plus previous/next month and page navigation. It uses a monthly agenda grouped by date: the inherited `DatabaseViewNode` seven-column calendar is draggable and title-only, while C3 needs full long titles, Client/type/stage and multiple channel labels at narrow widths and dense dates. All returned same-day items remain visible without per-date clipping. Explicit date edits stay in the canonical Content form; no drag/drop write path exists. Social list retains stage filtering and adds platform filtering. Create, edit and detail expose the same channel-label model. Published presentation reads the current C2 stage and timestamp, with no copied scheduling state.

C4 adds recordings/File subjects and C5 adds formal review revisions/rounds below. C6 adds general Client Content reads below. Comments, notifications, templates and provider integrations remain future work.

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

## Content recordings and assets (C4)

`content_asset_links` extends the canonical B5 `assets` and `asset_upload_attempts`; it does not hold independent file metadata or bytes. Columns are `asset_id` (primary key), `workspace_id`, `content_id`, exact `purpose` (`recording` or `asset`), and `created_at`. Direct workspace and composite workspace/asset and workspace/Content FKs enforce ownership. One workspace/Content index supports bounded lists and the lifetime capacity check. Migration 0016 makes the entire association immutable and prevents a File from entering both Content and Project/Deliverable attachment families in either insertion order. No runtime relinking, attachment copying, versions or generic polymorphic subjects exist.

Purpose is a fixed production label, not a pipeline status, approval, or visibility grant. Files never change Content stage/context/flags/revision, platform associations, target publish date, published timestamp, Client or Service identity. The 200-File per-Content cap includes archived rows; a conditional reservation batch makes concurrent creation respect the final slot. There is no global workspace Content lifetime cap.

The shared B5 storage protocol retains its 5 MiB positive-byte bound, exact request metadata/body validation, server SHA-256, opaque workspace-separated keys, Uploading/Ready/Failed/Archived statuses, five-minute lease, fresh recovery generation, durable attempt evidence, CAS changes, and conservative cleanup. Ready requires matching R2 key, size, MIME, etag and checksum and one atomic `FILE_UPLOADED` event. Lost finalization response recovery rechecks authorization after R2 head as well. Missing Ready objects fail safely without read repair. The cap was not raised: the existing buffered hash/protocol remains bounded; a larger-media protocol needs separate design and verification. Unknown browser MIME is accepted as `application/octet-stream`, not represented as verified media or malware-scanned content.

Internal action `content.file.manage` admits Owner/Admin/PM/Team only through current C1–C3 Content readability. Team needs exact Client or exact Social Service assignment. PM/Team need that same assignment for restricted Content or Files and to choose restricted File visibility. Ownership, departments, Project and Action assignments do not grant Content File access. B5 `file.manage` remains unchanged. Mutation adapters fix their attachment family and Content parent; no API body supplies policy or storage authority.

The narrow Client exception uses `recording.view` and `recording.upload`. It requires active identity/membership/workspace, current `client_contacts.user_id` linkage, Content visibility `client`, `recording_required=true`, `stage=waiting_for_recording`, and a still-canonical optional same-client Social Service. File reads additionally require purpose `recording` and visibility `client`; downloads require Ready. Client upload visibility is server-selected `client`; callers cannot send visibility. Retry is limited to that uploader's existing eligible recording. Client archive, visibility mutation and general production-asset access do not exist. Current conditions are SQL-checked at reservation/recovery/finalization and on both sides of the R2 download await. Stage movement or flag removal withdraws the recording request and its Client byte access; uploading never moves the stage itself.

Portal Home conditionally shows “Recording needed”, linking to `/portal/recordings/[contentId]`. C6 adds separate general Content navigation; there is no internal Social portal navigation. Request DTO is exactly `{id,title}`; the Content title is intentionally client-safe only for the eligible request. File DTO is exactly `{id,filename,mimeType,byteSize,status,readyAt}`. Failed/Uploading entries appear only for their uploader's retry; Ready shared recordings may be read by linked contacts. Internal Content fields, owner, hook, script, caption, CTA, all waiting/revision `stage_context`, revision, internal activity, service/department IDs, file visibility/purpose, storage keys/hashes/leases/attempts and hidden counts are not serialized. Request projection filters eligibility before its 200-row limit and emits no hidden overflow/count signal. File lists are at most 200 and metadata-only.

Internal APIs are Content `/files` GET/POST, `/files/[fileId]` PATCH, and `/files/[fileId]/retry` POST. Narrow portal APIs are `/portal/recordings/[contentId]/files` GET/POST and its File `/retry` POST. The existing opaque `/files/[fileId]/download` resolves the fixed attachment family internally and retains B5 private/no-store, safe attachment disposition, nosniff, sandbox and same-origin headers. Internal/portal API authorization precedes body/query validation; inaccessible IDs remain sanitized 404s.

Canonical File upload/archive/visibility activity derives Client/Service from Content. Internal Content File history and Client history filter every historical filename by current Content+File authority and exclude archived Files. A separate bounded Content-file history query merges with the B5 history by timestamp and rowid, keeping each D1 statement below the bind limit. No R2 probes occur in metadata, history, request, list or C3 calendar rendering. No File history is exposed to Clients.

## Work HTTP input boundary (B7)

Project create/edit/status/assignment JSON accepts only its named fields; unknown keys reject the whole request with a sanitized 400 instead of silently applying the recognized subset. Existing valid forms and lifecycle operations are unchanged. Other Work JSON and upload metadata retain their existing exact allowlists.

Work resource and portal endpoints accept no query inputs. The internal Project collection accepts one `status` and one `clientId`; the Action collection retains its B3 filter allowlist. Unknown or duplicate query keys return a sanitized, uncached 400 after authorization. Unauthenticated or inaccessible resources keep their existing 401/403/404 behavior. Downloads preserve their post-R2 authorization check and cancel any prepared stream before rejecting unsupported query input. This adds no domain field, lifecycle, permission grant or migration.

## Content approvals and review history (C5)

Additive `0017_c5_content_approvals.sql` introduces two Content-specific relational tables, seven indexes and ten triggers. It does not rebuild Content or rewrite migrations 0013–0016. Current domain inventory is 41 tables / 18 migrations. General Deliverable approvals remain unimplemented.

`content_review_revisions` owns a distinct immutable ID, workspace, Content, positive per-Content sequence number, title, type, optional hook/script/caption/CTA/target date, ordered `platforms_json` label array, and creation timestamp. Composite workspace/Content ownership and unique workspace/Content/ID and sequence indexes prevent cross-parent references. Insert validation requires an exact capture of current eligible Content and its ordered platform labels; update/delete triggers make the captured revision immutable. This is formal review history, not a keystroke log.

`content_approval_rounds` owns ID, workspace, Content, `revision_id`, per-Content `number`, request UUID, consumed `request_revision`, requester membership/time, and relational status `requested|approved|changes_requested|withdrawn`. Terminal fields are responder membership/time and feedback, or withdrawer membership/time and optional reason; an internal unique-operation receipt and consumed `completion_revision` fence the atomic Content mutation. Composite FKs require the revision to belong to that same workspace/Content and all provenance memberships to belong to the same workspace. Unique sequence, revision and request indexes prevent reuse; a partial unique workspace/Content index permits at most one Requested round. Insert/update triggers fix initial provenance and permit exactly one Requested → terminal transition. Terminal rounds and all round deletions are immutable. Earlier feedback cannot be rewritten.

### Requests, freeze and responses

Owner/Admin/PM may request or withdraw within current C1 Content scope. PM/Team restricted history still needs the exact Client or Social Service assignment; Team can read history but cannot request/withdraw. Request requires Client approval enabled, current `client_review`, Client eligible visibility, canonical current Client/optional same-client Social Service, the expected Content CAS revision, and no Requested round. The D1 batch captures current SQL fields/platform labels under its write lock, allocates the next sequence, inserts revision/round and `CONTENT_APPROVAL_REQUESTED`, then consumes one Content CAS revision without changing stage. A request retry must match the original requester, request UUID and consumed revision; immutable round evidence acknowledges it without another write, even after later work, under current Content authorization.

While Requested, title/type/hook/script/caption/CTA/target date, all three workflow flags, platform associations, stage and stage context are frozen by live conditional mutation predicates and additive database triggers. Internal pillar and ownership remain editable. Visibility, assignments, contact links, membership, role and workspace status remain live/revocable; changing these never edits the historical snapshot. C1/C3 mutations and C2 transitions compete with requests/responses through the one `content_items.revision` CAS counter. That counter is never the durable review identity, and Content has no duplicate approval-status field.

Any currently linked active Client contact for the exact Content Client may respond; C5 does not snapshot a named reviewer grant. Live SQL rechecks active identity/membership/workspace/unchanged role, current contact linkage, Client Content visibility, canonical optional Social Service, Requested round and current `client_review`/approval-required facts. The Client supplies only decision and feedback, never internal IDs, stage, actor, snapshot or CAS authority. The transaction resolves the round first, then a unique terminal receipt gates the semantic approval event, stage event and strict current-stage/current-revision Content update. Any late failure rolls back all facts; a competing zero-row operation produces no event.

Approved records responder/time and moves Content to `approved`. Changes Requested requires non-empty normalized plain-text feedback, up to 2,000 UTF-16 code units using the C2 context rules; it records immutable feedback/responder/time and moves Content to `revision_requested` with that feedback as current `stage_context`. Later Editing clears only current context, never round feedback. Withdraw records coordinator/time and optional normalized reason, preserves revision and round, leaves stage `client_review`, consumes CAS and unlocks editing. A later explicit request always creates a fresh revision and next round.

C5 blocks generic internal Client Review → Approved for approval-required Content, even without an open round. An open round also blocks internal Client Review → Revision Requested. Internal Review → Revision Requested and Revision Requested → Editing remain valid. Approval-disabled Content keeps C2's existing conditional skips, and Published remains terminal. Generic C2 retries exclude C5 response events, so Client response evidence is not mistaken for an internal transition receipt.

### Narrow API and portal projection

- `POST /api/bloomops/content/:contentId/approvals`: exactly `requestId,expectedRevision`.
- `POST /api/bloomops/approvals/:roundId/withdraw`: exactly `expectedRevision` and optional `reason`.
- `GET /api/bloomops/portal/approvals/:roundId`: exactly `{item:{id,number,requestedAt,snapshot}}` for an actionable round.
- `POST` to that same portal endpoint: exactly `decision` (`approved|changes_requested`) and optional/required `feedback` as above.

All API routes reject unknown/duplicate query inputs after current authorization, reject malformed/non-object/extra JSON, enforce the shared Origin boundary, use no-store responses and sanitize 400/401/403/404/409/500 failures. Foreign/hidden/non-actionable IDs are opaque 404s. A completed POST retry is acknowledged only for the same responder and normalized decision/feedback (withdraw retries also match coordinator/reason/consumed CAS), under current live access. It returns only `ok,roundId,unchanged`: completed GET is unavailable and no Client historical snapshot browsing is added. The browser keeps a just-completed confirmation locally.

The immutable snapshot allowlist is exactly `title,type,hook,script,caption,cta,targetPublishDate,platforms` (ordered display labels). It excludes pillar, owner, memberships, CAS, internal stage context/activity, raw rows/HTML, Service/Department internals, and all File/storage metadata. Rendering is escaped plain text. C4 has no immutable File versions, so **all Files are deliberately excluded from approval snapshots**; the UI states this explicitly. C4 remains the only File/R2 system and approval operations neither query R2 nor change File facts.

Portal Home conditionally shows “Approval needed” and links to `/portal/approvals/:roundId`. Eligible requests are filtered in SQL before stable ordering and a 200+1 read; only eligible overflow is indicated, and more requests become visible as responses complete. Hidden rows cannot affect count/overflow/empty state. C6 adds a general `/portal/content` projection below; Social/calendar navigation and a Client history endpoint remain absent. Internal Content detail shows 20 rounds per page (number descending), timestamps, current safe names for durable provenance memberships, terminal feedback/reason and expandable immutable snapshots. Reads use bounded SQL with relational assignment checks and no per-row API or File/R2 lookups. Client operational activity filters each Content event through current Content readability; activity is never the canonical approval state.

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


## Client Content portal (C6)

C6 is schema-free. `/portal/content` and `/portal/content/:contentId` project canonical C1–C5 records. The shared Client predicate checks a live active workspace/membership with unchanged role, current Client contact linkage, Content visibility `client`, an existing same-workspace Client and any optional same-client canonical Social Service relationship. A service-less Content Item is eligible. Service completion does not silently revoke Content. Department, owner, Project and Action associations grant no Content access. C4 recording and C5 approval predicates reuse this base and retain their narrower action gates.

The shell and `/portal/content` index gate share `hasPortalContent`, a one-row SQL projection of current Client authorization and the union of discoverable views: non-Published Content or Published Content in the inclusive preceding 30 days, excluding future timestamps. The Current and Recently published lists reuse those same stage/window predicates. Hidden, foreign, invalid-parent/service and older Published rows cannot activate the destination. An authenticated portal Client with no discoverable Content is redirected from the index to `/portal`; ordinary shell authentication runs first. Eligibility is independent of the selected view/page, so recent Published-only Content keeps the destination and its valid empty Current/Needs you views. Every ordinary navigation requests a fresh shell. Projects, onboarding, Deliverables and B5 Files keep their existing Home projections.

`GET /api/bloomops/portal/content` accepts only one `view` (`current`, `action`, `published`) and one positive decimal `page` (1–999999), defaulting to current/page 1. Current means all readable non-Published Content; Needs you means a live C4 recording request or C5 Requested approval; Recently published means canonical Published with `published_at` in the inclusive preceding 30 days and no future timestamp. All predicates run in SQL before 20+1 pagination. Current/action order is planned date ascending, undated last, opaque Content ID ascending; Published order is timestamp descending then ID ascending. Only eligible `hasMore` is returned; there is no total, hidden overflow or raw stage. A record moving between requests can shift offset pages; no cached snapshot is promised.

The exact list envelope is `{ok,items,view,page,hasMore}`. Each item contains only `id,title,type,clientName,statusLabel,targetPublishDate,publishedAt,platforms,recordingNeeded,approvalRoundId,hasFiles`. Platforms are display labels. Stage presentation maps Idea to Planned, production/review stages to In progress, Approved to Ready, Scheduled to Scheduled and Published to Published. `GET /api/bloomops/portal/content/:contentId` accepts no query inputs and returns `{item}` with that same summary plus `files:{items}`. It batches metadata reads in one D1 transaction, rechecking authority even after route authorization. No copy, raw stage/context, revision/CAS, internal owner, service/member/workspace IDs, activity, completed rounds or review snapshots enter these DTOs.

General File metadata uses C4's current predicate unchanged: client-visible, Ready, unarchived recordings attached to this exact Content, while recording is required and the stage is Waiting for Recording. It contains only `id,filename,mimeType,byteSize,status,readyAt`, at most the existing lifetime limit of 200. Uploading/Failed retry state remains on the C4 recording page. Internal/restricted Files and generic Content assets stay hidden, even when an asset is marked client-visible. The same canonical opaque download endpoint rechecks permission after R2 reads. Leaving Waiting for Recording hides File metadata and revokes those downloads; a C6 summary never grants more File authority. No File counts or storage URLs are exposed.

C6 adds no writes. Recording needed and Approval needed link to C4/C5 pages and reuse their existing upload/response operations, with live parent/round checks. Only an explicitly requested C5 snapshot can reveal its submitted review copy. Authentication precedes query validation, reads are dynamic/no-store, missing and inaccessible details return indistinguishable 404s, and failures are sanitized. Conditional navigation, list/detail, loading, empty, invalid-query/error recovery and no-action states use the existing portal shell and Bloom primitives.


## Systems Foundation (D1)

Systems is an internal, read-only specialist projection of the Work Core. Eligibility follows the current same-workspace, same-Client `Project.serviceEngagementId -> Service Engagement.serviceTypeId -> Service Type.departmentId -> Department.slug='systems'` relationship. Project/Service/Department names and Client-level Project department metadata are not substitutes. Renaming display text does not change eligibility; changing the relational department or Project Service does. Catalog active flags and Client/Service lifecycle do not silently close or exclude an otherwise active Project.

D1 adds no schema or persisted Systems lifecycle, platform, counter, progress, assignment, activity or file state. It reuses B6 Project summaries/attention and forward Deliverables, including every live B1–B5 child predicate. A Project/Client/Service assignment may supply its existing Project scope; Department membership and Project ownership grant nothing. Action-only scope remains in canonical Work and never produces Systems parent rows, facets or sibling summaries. Client/Service facets contain only the minimal context of readable Systems Projects and never grant parent management authority.

`/systems` defaults to nonterminal Projects (all except Completed, Cancelled and Archived), with Client, Service Engagement and exact Project-status filters. All statuses, including terminal work, remain selectable. Project pages contain 50 readable rows plus a readable-only overflow probe; pages are bounded to 1–10000. B6 attention priority comes first, followed by target date (null last), name and id. Closed Projects never gain an attention reason. Forward Deliverables use B6's six-row review/approved/14-Client-calendar-day target window across the entire selected Project set, independently of the Project page. Summaries and output remain derived and never touch R2 bytes.

Client and Service facets are independently limited to 200 readable choices with overflow, plus one separately authorized current selection if it falls beyond the cap. Client selection narrows Service choices. Invalid, missing, foreign, revoked or incompatible filter ids return the same generic recovery state without showing other work. No hidden child or Project can contribute to totals, progress, attention, facet choices or overflow. Each constituent read reapplies current membership/workspace/scope/visibility predicates.

The established internal shell retains its fixed navigation for all staff roles. Systems is now available, with an honest empty view and a Work link where no readable Systems Project exists. Creation and management remain on the canonical Work/Project/Action surfaces. There is no Systems-specific editor, platform inference, blueprint generation or Client portal Systems navigation in D1.

## Request-local D1 read composition (PERF2)

`lib/bloomops/read-batch.mjs#readTogether` groups independent SELECTs in an explicitly awaited server composition into native D1 batches, with at most 32 statements per invocation. It creates a private Drizzle session and a microtask queue for that composition only; it does not patch shared database objects, cache results, cache authority, intercept writes, or select from a replica. Dependencies still await their prerequisites. Non-D1 drivers without native batch support retain their original execution path; database errors are not silently retried.

The adapter names selected columns by ordinal in a CTE before batching, then uses the original Drizzle decoder and join-nullability mapping. This prevents duplicate SQL column names in joined reads from collapsing in D1's name-keyed batch results. Original bindings, predicates, row bounds, ordering and DTO shapes remain authoritative. This is a small Drizzle 0.45 internal adapter seam, covered by mapping/order/error/placeholder tests and real workerd/D1 smokes; review it when upgrading Drizzle. Production retains the no-op query logger. Numeric-only local instrumentation is never a deployed endpoint.

Current identity must be accepted before membership can authorize anything, and actor support is loaded before page authorization. Independent actor support reads share one batch; no permission truth survives the request. Authorized page reads batch only after their existing gates. Project metadata/body retain React's request-local shared result; the Project DTO's live SQL predicate also supplies its resource descriptor without a duplicate read. Restricted descriptors carry only the acting membership's proven grant, not an assignment directory.

Home shares one exact Action timezone read and one exact Project timezone read without conflating their scopes. Systems shares its own Project timezone read. JavaScript computes IANA calendar days from those current, readable Client settings before date-sensitive SQL; no UTC-only approximation or stored derived day is introduced. Social's member-choice query uses SQL existence checks over the same readable parent choices before loading directory rows. Systems' ordinary unfiltered data and facets can overlap; selected-ID validation and out-of-cap selection semantics remain intact. These are execution changes, not new domain facts or permission grants.

## Current-session workspace composition (PERF3)

`workspace-session.mjs` provides Better Auth's Drizzle adapter a private database facade. Within an awaited `getAccess` only, its existing signed-cookie session/user lookup also selects the earliest active membership of an active workspace as a correlated scalar subquery. `workspaceAccessQuery` owns the same predicate and created-at/ID ordering for both this selection and the ordinary loader. The selection is one bounded row, with schema-derived JSON keys and Drizzle column decoding. It is not another business-state store.

Better Auth still verifies the cookie signature before this database lookup, checks current expiry, performs ordinary session refresh/cleanup, and returns its original sanitized identity DTO. The extra membership result is removed before Better Auth receives the row. Request-local AsyncLocalStorage exposes it only after Better Auth accepts the exact captured session/user pair, and only for the same D1 binding. No result, grant or session survives this scope; the cached auth factory is not an authorization cache. Membership rejection still produces no workspace access. Actor support, resource predicates and 401/403/404 boundaries remain unchanged.

The integration uses Drizzle's relational `findFirst`/`extras` API and Better Auth's current joined-user query shape. Unsupported shapes retain the ordinary fresh membership lookup; database/decoding errors propagate without retry or partial access. Auth endpoints outside `getAccess`, other queries and writes use their ordinary paths. Review this seam on Better Auth/Drizzle upgrades; issued-cookie, refresh-race, concurrent-binding, DTO, current-workspace and revocation tests cover it.

`navigation-timing.mjs` publishes only fixed stage/event labels when a diagnostics-channel subscriber exists. Only the loopback performance wrapper subscribes and adds coarse relative timestamps, D1 counts and stream byte counts. No production subscriber, timing endpoint, authorization cache or private payload logging is added. The PERF3 browser harness measures completed server-rendered destination content and two animation frames independently of first response headers; it does not introduce a UI completion boundary.

## Ads campaign work (E1)

E1 replaces the internal Ads placeholder with a read-only Campaign work projection over canonical Projects. Eligibility follows the current same-workspace/same-Client Project Service → Service Type → Department slug `ads` relationship. A Project's name, department metadata, owner, department membership or a Social Ad Creative type grants nothing. Service/catalog lifecycle does not silently close or hide readable delivery work. Project status describes agency work, never provider operation.

`department-work.mjs` owns the bounded composition extracted from the Systems overview; `ads.mjs` and `systems.mjs` supply fixed department selectors. It reuses every canonical Project/child predicate, Work summary, attention rule, delivery date calculation and request-local read batch. All rows, facets, overflow and selected filters use live workspace/membership/role/assignment/visibility predicates. Project-only scope supplies minimal Client/Service labels, not parent management authority; Action-only scope stays in Work. Restricted parents and children retain their existing rules, including immediate revocation.

`/ads` accepts only scalar Client, Service, exact Project-status and page filters. It defaults to open Projects, offers 50 rows per page, bounds facets to 200 readable choices plus a separately authorized selected value, and shows the canonical six forward Deliverables independently of the current Project page. Invalid, missing, foreign, revoked and incompatible selected filters produce the same safe reset state. Unknown and array query fields are rejected. Hidden records never influence counts, progress, attention or overflow.

The page uses native GET filters, pagination, canonical Work create/detail/summary links, separate Client/Service metadata and existing state badges. Ads opts into a structured WorkSummary mode that renders secondary progress/review facts as wrapping Status badges without operational dot separators; other Work views retain their existing presentation. It works without JavaScript and provides a sanitized retry/reset error view. Clients remain in the existing portal; E1 adds no Ads portal navigation, DTO or authority. No provider facts, Campaign table, writes, new schema/migration, Content eligibility, approval action, metrics or R2 byte reads are introduced. Later Ads creative/approval/reporting work is governed by RELEASE_E, not implied by E1.

## Content production context (E2A)

`0022_e2a_content_context.sql` extends canonical Content to 26 columns using two additive column operations, preserving every existing row, reference, immutable receipt and approval snapshot. `production_area` is required and defaults to `social`; it accepts only `social` or `ads`. `ads_project_id` references `projects.id`, without cascading updates/deletes. The pair is immutable: Social always has a null Project; Ads always has a Project. Existing `ad_creative` rows remain Social. Type names never choose production area.

Ads insertion must match the Project's exact workspace, Client and non-null Service, whose current Service Type belongs to the canonical Ads department. The Project's existence FK and Content's existing composite Client/Service foreign keys remain. Database triggers prohibit Content context changes and referenced Project parent changes through UPDATE or conflicting replacement inserts; ordinary Project edits and unrelated Projects retain their previous behavior. The historical Social-service insert trigger retains its name and runs for Social rows. Service Type department reassignment remains allowed and never rewrites Content identity or history. Ads replacement inserts additionally preserve every original immutable Content identity field. Same-context Social conflict handling remains compatible with the E1 insertion shape. Two additional indexes support workspace/area and workspace/Ads Project ordered reads.

At the accepted E2A baseline, no Ads Content surface or creation operation is active. Every existing Content read/write, calendar/platform/pipeline, File-family download/history, portal Content/recording and approval path remains explicitly Social-only, including Owner/Admin access and Ads Services subsequently reassigned to Social. Shared Work Project visibility and Project assignments grant no Content access. Existing Social roles, assignments, lifecycle and response/input allowlists remain unchanged.

Social creation explicitly binds Social/null context. Its atomic insert excludes an occupied workspace/Client/request key across all areas, preserving retry behavior and returning a safe conflict for an unreadable Ads collision. Existing immutable creation receipts stay unchanged and readable; no backfill or receipt-format conversion is required. E2A must be accepted/deployed before E2B activates Ads creation. Once Ads records exist, E2A is the minimum compatible application fallback; no destructive down-migration or pre-E2A fallback is assumed safe.

## Internal Ads creative production (E2B)

E2B implements internal `/ads/creative` list/create/detail/edit over canonical Content. New creation is scoped to `/api/bloomops/projects/:id/creative`; it derives workspace, Client and Service from the live Ads Project. Content identity, area and Project remain immutable. Existing Social creation routes/receipts and explicit Social page, calendar, approval and portal predicates are preserved. Internal per-ID mutations and File operations dispatch from stored context through separate live Ads predicates and typed server-loaded resources.

Owner/Admin retain broad access. PM retains broad ordinary Project access; Team requires Client, Service or exact Project assignment. Restricted Projects, Ads Content and Ads Files require explicit Project assignment for PM/Team. Ownership, department membership and Action assignment grant nothing. Every mutation/retry/storage boundary rechecks the exact current parent tuple, membership, Ads eligibility and child visibility. A Project-only creative grant does not authorize its Client/Service management. Detail history is scoped to current Content and File access; Ads File events in a Client aggregate additionally require independent Client access. Existing Client Content-event aggregates stay Social-only.

Ads starts at Idea, moves through Script, Editing and Internal Review, and supports required-context Revision Requested back to Editing. Recording is fixed false, internal review and client approval fixed true. E2B accepts only internal/restricted visibility and working assets (`purpose='asset'`), never client visibility, recording requests, client review, approval, scheduling or publication. Malformed stored workflow fails closed for edits/production/assets. Canonical File limits, leases, hashes, retries, archive, revisions and raw-byte download apply; generic Ads File retry resolves its actual Content family. Working media is not immutable approval evidence; E3 owns that boundary.

Lists return 50 plus a scoped overflow probe; dynamic facets and Project/owner choices use 200 plus overflow, with bounded literal Project/Client/Service search and a separately authorized selected Project. Platform facets deduplicate canonical keys. Detail history returns the latest 60 authorized events with a 61st-row overflow probe and stable timestamp/ID ordering. Shared UI controls preserve Ads save/cancel/reload routes; client/recording/workflow bypass controls are absent. No new migration or dependency. Acceptance and deployed status are recorded in BUILD_STATE; this section describes the E2B implementation, not a separate release gate.

## Review media evidence foundation (E3A)

`0023_e3a_review_media.sql` adds immutable review scope/count to canonical review revisions and an ordered `content_review_assets` manifest. Existing Social snapshots default to copy-only with zero media; current C5 inserts bind those values explicitly. The manifest pins 1–10 exact ready internal Content File generations through composite revision and attachment ownership, with original filename/type/size/hash/key/ETag/ready-time evidence. It creates no duplicate File or R2 object.

Prospective Ads capture requires Internal Review, internal Content, fixed E2 flags and the current ordinary Ads Project/Client/Service tuple. A canonical round at Client Review seals the complete contiguous manifest after rechecking each selected generation. Database guards reject mutation, deletion and conflicting replacement of evidence, retained File generations, attachment identity and round provenance. File archive and visibility revocation remain legal; historical bytes remain retained. Cleanup excludes manifest-pinned keys and fails closed if the retention lookup fails.

E3A leaves every active approval/portal route and DTO Social-only. It is storage and compatibility groundwork, not Ads sharing activation. E3B needs its own request/response/media access contract and acceptance. Once E3B creates evidence, E3A is the minimum compatible fallback; no down-migration or fallback lacking retention-aware cleanup is safe. Exact verification and release status live in BUILD_STATE.
