// BloomOps domain schema, Release A (phase A2).
//
// This is the canonical relational model for BloomOps business records. It is
// declared with Drizzle and materialised through generated SQL migrations in
// ./drizzle, applied with `wrangler d1 migrations apply` per environment.
// Runtime code never creates or alters tables.
//
// Conventions
// - Every business table carries workspace_id. Child rows also carry a
//   composite foreign key (workspace_id, parent_id) to the parent's
//   (workspace_id, id), so a row can never point at a parent in another
//   workspace. Parents expose a unique (workspace_id, id) index for that.
// - Ids are text. The database supplies one when the caller does not.
// - Domain timestamps are ISO-8601 text in UTC with millisecond precision.
//   The four Better Auth tables use integer epoch milliseconds instead,
//   because that is what Better Auth's Drizzle adapter writes and reads.
// - Lifecycle states are plain text columns guarded by CHECK constraints.
//   Client relationship status, client health, service status, onboarding
//   status, and onboarding item status are separate columns on separate
//   records, never one shared field.
// - JSON appears only where the model calls for an immutable snapshot
//   (template_versions.definition_json) or open-ended event metadata
//   (activity_events.metadata_json). Operational state is relational.
// - No raw third-party platform password is stored anywhere here. The
//   Better Auth `account.password` column exists for Better Auth's own
//   credential provider only and stays unused while login is magic-link.
//
// Coexistence with the inherited Leadsthatbloom tables
// The inherited prospecting app still owns a table named `clients`, so the
// BloomOps client table is created as `bloomops_clients` and exported here as
// `clients`. Application code only ever sees the export. When the inherited
// prospecting tables are dropped in a later phase, one migration renames
// `bloomops_clients` to `clients` and nothing above the schema changes.

import { sql } from 'drizzle-orm';
import { CONTENT_TYPES, CONTENT_STAGES } from './content-values.mjs';
import { MILESTONE_STATUSES } from './milestone-values.mjs';
import { ACTION_STATUSES, ACTION_PRIORITIES, ACTION_WAITING_TYPES } from './action-values.mjs';
import { DELIVERABLE_STATUSES } from './deliverable-values.mjs';
import { FILE_MAX_BYTES, FILE_STATUSES } from './file-values.mjs';
export { MILESTONE_STATUSES } from './milestone-values.mjs';
import { sqliteTable, text, integer, index, uniqueIndex, foreignKey, check, primaryKey } from 'drizzle-orm/sqlite-core';
import { PROJECT_STATUSES, PROJECT_HEALTHS } from './project-values.mjs';
export { PROJECT_STATUSES, PROJECT_HEALTHS } from './project-values.mjs';

// ── shared column helpers ────────────────────────────────────────────────

const NOW_ISO = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
const NEW_ID = sql`(lower(hex(randomblob(16))))`;
const NOW_MS = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

const id = () => text('id').primaryKey().default(NEW_ID);
const createdAt = () => text('created_at').notNull().default(NOW_ISO);
const updatedAt = () => text('updated_at').notNull().default(NOW_ISO);
const bool = (name, dflt = false) => integer(name, { mode: 'boolean' }).notNull().default(dflt);
const oneOf = (column, values) => sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);

// Composite (workspace_id, parent_id) → parent (workspace_id, id).
const sameWorkspace = (name, t, parentTable, childColumn) =>
  foreignKey({
    name,
    columns: [t.workspaceId, childColumn],
    foreignColumns: [parentTable.workspaceId, parentTable.id],
  });

// ── lifecycle vocabularies (mirrors docs/DOMAIN_MODEL.md) ────────────────

export const WORKSPACE_ROLES = ['owner', 'admin', 'project_manager', 'team_member', 'client'];
export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'removed'];
export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'];
export const CLIENT_RELATIONSHIP_STATUSES = ['draft', 'onboarding', 'active', 'paused', 'completed', 'ended'];
export const CLIENT_HEALTHS = ['on_track', 'needs_attention', 'at_risk'];
export const SERVICE_ENGAGEMENT_STATUSES = ['planned', 'onboarding', 'active', 'paused', 'completed', 'cancelled'];
// A service engagement is either still running (open) or finished with
// (terminal). The split is one fact, declared once: the database invariant
// that stops a client holding two live engagements of the same service type
// is built from it below, and the domain layer reads the same two lists.
export const SERVICE_TERMINAL_STATUSES = ['completed', 'cancelled'];
export const SERVICE_OPEN_STATUSES = SERVICE_ENGAGEMENT_STATUSES.filter((s) => !SERVICE_TERMINAL_STATUSES.includes(s));
export const ONBOARDING_STATUSES = ['not_started', 'in_progress', 'ready', 'complete', 'blocked'];
export const ONBOARDING_ITEM_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'waived', 'not_applicable'];
export const RESPONSIBLE_PARTIES = ['client', 'team', 'user', 'external'];
export const VISIBILITIES = ['internal', 'client', 'restricted'];
export const TEMPLATE_KINDS = ['onboarding', 'project', 'social', 'systems', 'ads'];
export const TEMPLATE_VERSION_STATUSES = ['draft', 'published', 'retired'];

// ── identity and organisation ────────────────────────────────────────────

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('workspaces_slug_uq').on(t.slug),
    check('workspaces_status_chk', oneOf('status', ['active', 'suspended', 'archived'])),
  ],
);

// Better Auth core tables (better-auth 1.7.2, sqlite, Drizzle adapter). The
// shapes below match the `auth generate` output of that version (A3 re-ran
// the current CLI and compared field for field, see docs/BUILD_STATE.md).
// Two deliberate deviations: `account.issuer` is nullable here where the CLI
// emits NOT NULL, because tightening a column is a table rebuild in SQLite
// and no code path in Release A writes account rows (magic-link sign-in
// creates users and sessions only); and `session`/`account` `updated_at`
// carry a database default the CLI omits, which is a harmless superset.
// The compound unique index on (issuer, account_id) that Better Auth 1.7
// expects was added by A3 (migration 0002).
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(NOW_MS).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(NOW_MS).$onUpdate(() => new Date()).notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(NOW_MS).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(NOW_MS).$onUpdate(() => new Date()).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer'),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(NOW_MS).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(NOW_MS).$onUpdate(() => new Date()).notNull(),
  },
  (t) => [
    uniqueIndex('account_issuer_accountId_uidx').on(t.issuer, t.accountId),
    index('account_userId_idx').on(t.userId),
  ],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(NOW_MS).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(NOW_MS).$onUpdate(() => new Date()).notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// A user's place in one workspace. Role is one of five values; anything finer
// than a role is a capability row, so new permissions never need new roles.
export const workspaceMemberships = sqliteTable(
  'workspace_memberships',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    status: text('status').notNull().default('invited'),
    invitedByMembershipId: text('invited_by_membership_id'),
    joinedAt: text('joined_at'),
    suspendedAt: text('suspended_at'),
    removedAt: text('removed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('workspace_memberships_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('workspace_memberships_ws_user_uq').on(t.workspaceId, t.userId),
    index('workspace_memberships_user_idx').on(t.userId),
    check('workspace_memberships_role_chk', oneOf('role', WORKSPACE_ROLES)),
    check('workspace_memberships_status_chk', oneOf('status', MEMBERSHIP_STATUSES)),
  ],
);

export const workspaceInvitations = sqliteTable(
  'workspace_invitations',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('pending'),
    // Only a hash of the invitation token is stored. The token itself travels
    // in the invitation email and is never persisted.
    tokenHash: text('token_hash').notNull(),
    // What the inviter called the person, used as the display name of the
    // identity created when they accept. Nullable: not every invite has one.
    inviteeName: text('invitee_name'),
    clientId: text('client_id'),
    invitedByMembershipId: text('invited_by_membership_id'),
    acceptedMembershipId: text('accepted_membership_id'),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    revokedAt: text('revoked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('workspace_invitations_ws_client_id_uq').on(t.workspaceId, t.clientId, t.id),
    uniqueIndex('workspace_invitations_token_hash_uq').on(t.tokenHash),
    index('workspace_invitations_ws_email_idx').on(t.workspaceId, t.email),
    // One usable invitation per address per workspace. Resending rotates the
    // token on that row instead of adding a second pending row.
    uniqueIndex('workspace_invitations_pending_uq').on(t.workspaceId, t.email).where(sql`status = 'pending'`),
    sameWorkspace('workspace_invitations_client_fk', t, clients, t.clientId),
    sameWorkspace('workspace_invitations_inviter_fk', t, workspaceMemberships, t.invitedByMembershipId),
    sameWorkspace('workspace_invitations_accepted_fk', t, workspaceMemberships, t.acceptedMembershipId),
    check('workspace_invitations_role_chk', oneOf('role', WORKSPACE_ROLES)),
    check('workspace_invitations_status_chk', oneOf('status', INVITATION_STATUSES)),
  ],
);

// Departments are organisational views. Membership in one grants nothing by
// itself; access to a client comes from client_assignments and
// service_assignments.
export const departments = sqliteTable(
  'departments',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    position: integer('position').notNull().default(0),
    active: bool('active', true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('departments_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('departments_ws_slug_uq').on(t.workspaceId, t.slug),
  ],
);

export const departmentMemberships = sqliteTable(
  'department_memberships',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    departmentId: text('department_id').notNull(),
    membershipId: text('membership_id').notNull(),
    isLead: bool('is_lead', false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('department_memberships_dept_member_uq').on(t.departmentId, t.membershipId),
    sameWorkspace('department_memberships_department_fk', t, departments, t.departmentId),
    sameWorkspace('department_memberships_membership_fk', t, workspaceMemberships, t.membershipId),
  ],
);

// Capabilities are dotted keys such as finance.view or templates.manage,
// granted per membership. They are deliberately not an enum so a new
// capability is data, not a migration.
export const memberCapabilities = sqliteTable(
  'member_capabilities',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    membershipId: text('membership_id').notNull(),
    capability: text('capability').notNull(),
    grantedByMembershipId: text('granted_by_membership_id'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('member_capabilities_member_cap_uq').on(t.membershipId, t.capability),
    sameWorkspace('member_capabilities_membership_fk', t, workspaceMemberships, t.membershipId),
    sameWorkspace('member_capabilities_granted_by_fk', t, workspaceMemberships, t.grantedByMembershipId),
    check('member_capabilities_capability_chk', sql.raw("capability GLOB '[a-z]*.[a-z]*'")),
  ],
);

// ── clients ──────────────────────────────────────────────────────────────

// One client is one client, whatever they buy. Relationship status and
// health are independent columns. See the coexistence note at the top for
// the physical table name.
export const clients = sqliteTable(
  'bloomops_clients',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    company: text('company'),
    slug: text('slug').notNull(),
    relationshipStatus: text('relationship_status').notNull().default('draft'),
    health: text('health').notNull().default('on_track'),
    timezone: text('timezone'),
    website: text('website'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    ownerMembershipId: text('owner_membership_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('bloomops_clients_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('bloomops_clients_ws_slug_uq').on(t.workspaceId, t.slug),
    index('bloomops_clients_ws_status_idx').on(t.workspaceId, t.relationshipStatus),
    sameWorkspace('bloomops_clients_owner_fk', t, workspaceMemberships, t.ownerMembershipId),
    check('bloomops_clients_relationship_status_chk', oneOf('relationship_status', CLIENT_RELATIONSHIP_STATUSES)),
    check('bloomops_clients_health_chk', oneOf('health', CLIENT_HEALTHS)),
  ],
);

export const clientContacts = sqliteTable(
  'client_contacts',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    clientId: text('client_id').notNull(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    title: text('title'),
    // Null until the contact accepts a portal invitation and becomes a user.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    isPrimary: bool('is_primary', false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('client_contacts_ws_client_id_uq').on(t.workspaceId, t.clientId, t.id),
    index('client_contacts_client_idx').on(t.clientId),
    uniqueIndex('client_contacts_client_email_uq').on(t.clientId, t.email).where(sql`email IS NOT NULL`),
    // A client may have many contacts and at most one primary. The database
    // holds that invariant, so no sequence of updates, no concurrent request,
    // and no caller outside the domain layer can leave two primaries behind.
    // A client with no primary at all is allowed; the partial index only
    // counts the rows that claim it.
    uniqueIndex('client_contacts_primary_uq').on(t.clientId).where(sql`is_primary = 1`),
    sameWorkspace('client_contacts_client_fk', t, clients, t.clientId),
  ],
);

// Internal people attached to a client as a whole.
export const clientAssignments = sqliteTable(
  'client_assignments',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    clientId: text('client_id').notNull(),
    membershipId: text('membership_id').notNull(),
    assignmentRole: text('assignment_role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('client_assignments_client_member_uq').on(t.clientId, t.membershipId),
    index('client_assignments_member_idx').on(t.membershipId),
    sameWorkspace('client_assignments_client_fk', t, clients, t.clientId),
    sameWorkspace('client_assignments_membership_fk', t, workspaceMemberships, t.membershipId),
    check('client_assignments_role_chk', oneOf('assignment_role', ['lead', 'member'])),
  ],
);

// ── services ─────────────────────────────────────────────────────────────

// The catalogue. A service type is what the agency can sell; an engagement
// is one client actually buying it.
export const serviceTypes = sqliteTable(
  'service_types',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    departmentId: text('department_id'),
    description: text('description'),
    active: bool('active', true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('service_types_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('service_types_ws_slug_uq').on(t.workspaceId, t.slug),
    sameWorkspace('service_types_department_fk', t, departments, t.departmentId),
  ],
);

export const serviceEngagements = sqliteTable(
  'service_engagements',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    clientId: text('client_id').notNull(),
    serviceTypeId: text('service_type_id').notNull(),
    packageName: text('package_name'),
    status: text('status').notNull().default('planned'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    approvalPreference: text('approval_preference'),
    scopeNotes: text('scope_notes'),
    sourceTemplateVersionId: text('source_template_version_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('service_engagements_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('service_engagements_ws_client_id_uq').on(t.workspaceId, t.clientId, t.id),
    // One client may buy the same service twice over time, but never hold
    // two live engagements of it at once. A check-then-insert would let two
    // simultaneous requests both pass, so the invariant is the database's:
    // the pair is unique only while the engagement is still open, which
    // leaves a completed or cancelled one free to be replaced (A7).
    uniqueIndex('service_engagements_client_type_open_uq')
      .on(t.clientId, t.serviceTypeId)
      .where(sql.raw(`status IN (${SERVICE_OPEN_STATUSES.map((s) => `'${s}'`).join(', ')})`)),
    index('service_engagements_client_idx').on(t.clientId),
    index('service_engagements_ws_status_idx').on(t.workspaceId, t.status),
    sameWorkspace('service_engagements_client_fk', t, clients, t.clientId),
    sameWorkspace('service_engagements_service_type_fk', t, serviceTypes, t.serviceTypeId),
    sameWorkspace('service_engagements_template_version_fk', t, templateVersions, t.sourceTemplateVersionId),
    check('service_engagements_status_chk', oneOf('status', SERVICE_ENGAGEMENT_STATUSES)),
  ],
);

// Assignment at the client-service level. A contractor on James' Social
// engagement gets this row and nothing for James' GHL engagement.
export const serviceAssignments = sqliteTable(
  'service_assignments',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    serviceEngagementId: text('service_engagement_id').notNull(),
    membershipId: text('membership_id').notNull(),
    assignmentRole: text('assignment_role').notNull().default('member'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('service_assignments_engagement_member_uq').on(t.serviceEngagementId, t.membershipId),
    index('service_assignments_member_idx').on(t.membershipId),
    sameWorkspace('service_assignments_engagement_fk', t, serviceEngagements, t.serviceEngagementId),
    sameWorkspace('service_assignments_membership_fk', t, workspaceMemberships, t.membershipId),
    check('service_assignments_role_chk', oneOf('assignment_role', ['lead', 'member'])),
  ],
);

// ── projects (B1) ────────────────────────────────────────────────────────

// Client and optional Service are stable parents. For service-specific work,
// Department is read from the Service Type; only client-level work stores an
// explicit Department. Ownership never grants access. Revision is an internal
// optimistic concurrency token, not a second lifecycle fact.
export const projects = sqliteTable('projects', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  clientId: text('client_id').notNull(),
  serviceEngagementId: text('service_engagement_id'),
  departmentId: text('department_id'),
  name: text('name').notNull(),
  clientLabel: text('client_label'),
  status: text('status').notNull().default('planned'),
  health: text('health').notNull().default('on_track'),
  ownerMembershipId: text('owner_membership_id'),
  startDate: text('start_date'),
  targetDate: text('target_date'),
  completedAt: text('completed_at'),
  visibility: text('visibility').notNull().default('internal'),
  statusReason: text('status_reason'),
  revision: integer('revision').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('projects_ws_id_uq').on(t.workspaceId, t.id),
  index('projects_ws_client_idx').on(t.workspaceId, t.clientId),
  index('projects_ws_service_idx').on(t.workspaceId, t.serviceEngagementId),
  index('projects_ws_status_idx').on(t.workspaceId, t.status, t.targetDate),
  index('projects_ws_owner_idx').on(t.workspaceId, t.ownerMembershipId),
  index('projects_ws_visibility_idx').on(t.workspaceId, t.visibility, t.clientId),
  sameWorkspace('projects_client_fk', t, clients, t.clientId),
  foreignKey({ name: 'projects_service_client_fk', columns: [t.workspaceId, t.clientId, t.serviceEngagementId], foreignColumns: [serviceEngagements.workspaceId, serviceEngagements.clientId, serviceEngagements.id] }),
  sameWorkspace('projects_department_fk', t, departments, t.departmentId),
  sameWorkspace('projects_owner_fk', t, workspaceMemberships, t.ownerMembershipId),
  check('projects_status_chk', oneOf('status', PROJECT_STATUSES)),
  check('projects_health_chk', oneOf('health', PROJECT_HEALTHS)),
  check('projects_visibility_chk', oneOf('visibility', VISIBILITIES)),
  check('projects_name_chk', sql`length(trim(name)) BETWEEN 1 AND 120`),
  check('projects_label_chk', sql`client_label IS NULL OR length(trim(client_label)) BETWEEN 1 AND 120`),
  check('projects_department_source_chk', sql`service_engagement_id IS NULL OR department_id IS NULL`),
  check('projects_dates_chk', sql`start_date IS NULL OR target_date IS NULL OR target_date >= start_date`),
  check('projects_completion_chk', sql`(status <> 'completed' OR completed_at IS NOT NULL) AND (completed_at IS NULL OR status IN ('completed','archived'))`),
  check('projects_reason_chk', sql`(status IN ('waiting','blocked') AND status_reason IS NOT NULL AND length(trim(status_reason)) BETWEEN 1 AND 1000) OR (status NOT IN ('waiting','blocked') AND status_reason IS NULL)`),
  check('projects_revision_chk', sql`revision >= 1`),
]);

export const projectAssignments = sqliteTable('project_assignments', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull(),
  membershipId: text('membership_id').notNull(),
  assignmentRole: text('assignment_role').notNull().default('member'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('project_assignments_project_member_uq').on(t.projectId, t.membershipId),
  index('project_assignments_ws_member_idx').on(t.workspaceId, t.membershipId, t.projectId),
  sameWorkspace('project_assignments_project_fk', t, projects, t.projectId),
  sameWorkspace('project_assignments_member_fk', t, workspaceMemberships, t.membershipId),
  check('project_assignments_role_chk', oneOf('assignment_role', ['lead', 'member'])),
]);

// Ordered Project children. Creation request IDs are retry metadata, scoped
// to this parent; Client/Service/Department context stays on the Project.
export const milestones = sqliteTable('milestones', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull(),
  creationRequestId: text('creation_request_id').notNull(),
  name: text('name').notNull(),
  clientLabel: text('client_label'),
  status: text('status').notNull().default('upcoming'),
  position: integer('position').notNull(),
  startDate: text('start_date'),
  targetDate: text('target_date'),
  completedAt: text('completed_at'),
  waitingReason: text('waiting_reason'),
  visibility: text('visibility').notNull().default('internal'),
  revision: integer('revision').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('milestones_ws_id_uq').on(t.workspaceId, t.id),
  uniqueIndex('milestones_ws_project_id_uq').on(t.workspaceId, t.projectId, t.id),
  uniqueIndex('milestones_project_position_uq').on(t.projectId, t.position),
  uniqueIndex('milestones_project_request_uq').on(t.workspaceId, t.projectId, t.creationRequestId),
  index('milestones_ws_project_visibility_idx').on(t.workspaceId, t.projectId, t.visibility),
  sameWorkspace('milestones_project_fk', t, projects, t.projectId),
  check('milestones_status_chk', oneOf('status', MILESTONE_STATUSES)),
  check('milestones_visibility_chk', oneOf('visibility', VISIBILITIES)),
  check('milestones_name_chk', sql`length(trim(name)) BETWEEN 1 AND 120`),
  check('milestones_label_chk', sql`client_label IS NULL OR length(trim(client_label)) BETWEEN 1 AND 120`),
  check('milestones_request_chk', sql`length(creation_request_id) = 36`),
  check('milestones_position_chk', sql`typeof(position) = 'integer' AND position BETWEEN 0 AND 9007199254740991`),
  check('milestones_revision_chk', sql`typeof(revision) = 'integer' AND revision >= 1`),
  check('milestones_start_date_chk', sql`start_date IS NULL OR (length(start_date)=10 AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(start_date, '+0 days') IS NOT NULL AND date(start_date, '+0 days')=start_date)`),
  check('milestones_target_date_chk', sql`target_date IS NULL OR (length(target_date)=10 AND target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(target_date, '+0 days') IS NOT NULL AND date(target_date, '+0 days')=target_date)`),
  check('milestones_dates_chk', sql`start_date IS NULL OR target_date IS NULL OR target_date >= start_date`),
  check('milestones_completion_chk', sql`(status='completed' AND completed_at IS NOT NULL) OR (status<>'completed' AND completed_at IS NULL)`),
  check('milestones_waiting_chk', sql`(status='waiting' AND waiting_reason IS NOT NULL AND length(trim(waiting_reason)) BETWEEN 1 AND 1000) OR (status<>'waiting' AND waiting_reason IS NULL)`),
]);

// Client-receivable output, separate from internal Actions. Project is the
// sole owner of Client/Service/Department context.
export const deliverables = sqliteTable('deliverables', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull(),
  creationRequestId: text('creation_request_id').notNull(),
  title: text('title').notNull(),
  clientLabel: text('client_label'),
  description: text('description'),
  status: text('status').notNull().default('planned'),
  visibility: text('visibility').notNull().default('internal'),
  targetDate: text('target_date'),
  deliveredAt: text('delivered_at'),
  revision: integer('revision').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('deliverables_project_request_uq').on(t.workspaceId, t.projectId, t.creationRequestId),
  uniqueIndex('deliverables_ws_project_id_uq').on(t.workspaceId, t.projectId, t.id),
  index('deliverables_ws_project_visibility_idx').on(t.workspaceId, t.projectId, t.visibility),
  sameWorkspace('deliverables_project_fk', t, projects, t.projectId),
  check('deliverables_status_chk', oneOf('status', DELIVERABLE_STATUSES)),
  check('deliverables_visibility_chk', oneOf('visibility', VISIBILITIES)),
  check('deliverables_title_chk', sql`length(trim(title)) BETWEEN 1 AND 120`),
  check('deliverables_label_chk', sql`client_label IS NULL OR length(trim(client_label)) BETWEEN 1 AND 120`),
  check('deliverables_description_chk', sql`description IS NULL OR length(trim(description)) BETWEEN 1 AND 5000`),
  check('deliverables_request_chk', sql`length(creation_request_id)=36`),
  check('deliverables_revision_chk', sql`typeof(revision)='integer' AND revision >= 1`),
  check('deliverables_target_date_chk', sql`target_date IS NULL OR (length(target_date)=10 AND target_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(target_date, '+0 days') IS NOT NULL AND date(target_date, '+0 days')=target_date)`),
  check('deliverables_delivery_chk', sql`(status='delivered' AND delivered_at IS NOT NULL) OR (status<>'delivered' AND delivered_at IS NULL)`),
]);

// C1: fixed Client/Social-service identity; editorial state remains relational.
export const contentItems = sqliteTable('content_items', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  clientId: text('client_id').notNull(),
  serviceEngagementId: text('service_engagement_id'),
  creationRequestId: text('creation_request_id').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  pillar: text('pillar'),
  ownerMembershipId: text('owner_membership_id'),
  hook: text('hook'),
  script: text('script'),
  caption: text('caption'),
  cta: text('cta'),
  recordingRequired: bool('recording_required', false),
  internalReviewRequired: bool('internal_review_required', true),
  clientApprovalRequired: bool('client_approval_required', true),
  stage: text('stage').notNull().default('idea'),
  stageContext: text('stage_context'),
  targetPublishDate: text('target_publish_date'),
  publishedAt: text('published_at'),
  visibility: text('visibility').notNull().default('internal'),
  revision: integer('revision').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex('content_items_ws_id_uq').on(t.workspaceId, t.id),
  index('content_items_ws_target_id_idx').on(t.workspaceId, t.targetPublishDate, t.id),
  uniqueIndex('content_items_client_request_uq').on(t.workspaceId, t.clientId, t.creationRequestId),
  index('content_items_ws_stage_created_idx').on(t.workspaceId, t.stage, t.createdAt, t.id),
  check('content_items_stage_context_chk', sql`stage_context IS NULL OR (stage IN ('waiting_for_recording','revision_requested') AND length(trim(stage_context)) BETWEEN 1 AND 2000)`),
  index('content_items_ws_created_idx').on(t.workspaceId, t.createdAt, t.id),
  index('content_items_ws_client_created_idx').on(t.workspaceId, t.clientId, t.createdAt, t.id),
  index('content_items_ws_service_created_idx').on(t.workspaceId, t.serviceEngagementId, t.createdAt, t.id),
  sameWorkspace('content_items_client_fk', t, clients, t.clientId),
  sameWorkspace('content_items_owner_fk', t, workspaceMemberships, t.ownerMembershipId),
  foreignKey({ columns: [t.workspaceId, t.clientId, t.serviceEngagementId], foreignColumns: [serviceEngagements.workspaceId, serviceEngagements.clientId, serviceEngagements.id] }),
  check('content_items_type_chk', oneOf('type', CONTENT_TYPES)),
  check('content_items_stage_chk', oneOf('stage', CONTENT_STAGES)),
  check('content_items_visibility_chk', oneOf('visibility', VISIBILITIES)),
  check('content_items_title_chk', sql`length(trim(title)) BETWEEN 1 AND 200`),
  ...Object.entries({ pillar: 120, hook: 2000, script: 20000, caption: 10000, cta: 1000 }).map(([key, max]) => check(`content_items_${key}_chk`, sql.raw(`${key} IS NULL OR length(trim(${key})) BETWEEN 1 AND ${max}`))),
  ...['recording_required', 'internal_review_required', 'client_approval_required'].map(key => check(`content_items_${key}_chk`, sql.raw(`${key} IN (0,1)`))),
  check('content_items_request_chk', sql`length(creation_request_id)=36`),
  check('content_items_revision_chk', sql`typeof(revision)='integer' AND revision>=1`),
  check('content_items_target_chk', sql`target_publish_date IS NULL OR (length(target_publish_date)=10 AND target_publish_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(target_publish_date,'+0 days') IS NOT NULL AND date(target_publish_date,'+0 days')=target_publish_date)`),
  check('content_items_published_chk', sql`(stage='published' AND published_at IS NOT NULL) OR (stage<>'published' AND published_at IS NULL)`),
]);

// C3 associations carry channel context only. Dates/stages remain on Content.
export const contentPlatforms = sqliteTable('content_platforms', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  contentId: text('content_id').notNull(),
  platformKey: text('platform_key').notNull(),
  label: text('label').notNull(),
}, t => [
  primaryKey({ columns: [t.workspaceId, t.contentId, t.platformKey] }),
  foreignKey({ columns: [t.workspaceId, t.contentId], foreignColumns: [contentItems.workspaceId, contentItems.id] }),
  index('content_platforms_ws_key_content_idx').on(t.workspaceId, t.platformKey, t.contentId),
  check('content_platforms_key_chk', sql`length(trim(platform_key)) BETWEEN 1 AND 120`),
  check('content_platforms_label_chk', sql`length(trim(label)) BETWEEN 1 AND 60`),
]);

// B5: one canonical File and one fixed attachment. Recovery attempts retain
// their opaque keys, including after uncertain failures. No bytes live in D1.
export const assets = sqliteTable('assets', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  creationRequestId: text('creation_request_id').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(),
  uploaderMembershipId: text('uploader_membership_id').notNull(),
  initialVisibility: text('initial_visibility').notNull(),
  visibility: text('visibility').notNull().default('internal'),
  status: text('status').notNull().default('uploading'),
  objectKey: text('object_key').notNull(),
  leaseUntil: text('lease_until'),
  etag: text('etag'),
  revision: integer('revision').notNull().default(1),
  readyAt: text('ready_at'),
  archivedAt: text('archived_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('assets_ws_id_uq').on(t.workspaceId, t.id),
  uniqueIndex('assets_ws_request_uq').on(t.workspaceId, t.creationRequestId),
  uniqueIndex('assets_key_uq').on(t.objectKey),
  sameWorkspace('assets_uploader_fk', t, workspaceMemberships, t.uploaderMembershipId),
  check('assets_status_chk', oneOf('status', FILE_STATUSES)),
  check('assets_visibility_chk', oneOf('visibility', VISIBILITIES)),
  check('assets_initial_visibility_chk', oneOf('initial_visibility', VISIBILITIES)),
  check('assets_name_chk', sql`length(trim(filename)) BETWEEN 1 AND 180 AND instr(filename, char(0))=0 AND instr(filename, char(10))=0 AND instr(filename, char(13))=0 AND instr(filename, '/')=0 AND instr(filename, char(92))=0`),
  check('assets_mime_chk', sql`length(mime_type) BETWEEN 3 AND 127 AND instr(mime_type, '/')>1 AND instr(mime_type, char(10))=0 AND instr(mime_type, char(13))=0`),
  check('assets_size_chk', sql.raw(`typeof(byte_size)='integer' AND byte_size BETWEEN 1 AND ${FILE_MAX_BYTES}`)),
  check('assets_hash_chk', sql`length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'`),
  check('assets_request_chk', sql`length(creation_request_id)=36`),
  check('assets_revision_chk', sql`typeof(revision)='integer' AND revision>=1`),
  check('assets_ready_chk', sql`(status='ready' AND ready_at IS NOT NULL AND etag IS NOT NULL) OR (status='archived') OR (status IN ('uploading','failed') AND ready_at IS NULL AND etag IS NULL)`),
  check('assets_archive_chk', sql`(status='archived' AND archived_at IS NOT NULL) OR (status<>'archived' AND archived_at IS NULL)`),
  check('assets_lease_chk', sql`(status='uploading' AND lease_until IS NOT NULL) OR (status<>'uploading' AND lease_until IS NULL)`),
]);

export const assetLinks = sqliteTable('asset_links', {
  assetId: text('asset_id').primaryKey().notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull(),
  deliverableId: text('deliverable_id'),
  createdAt: createdAt(),
}, (t) => [
  sameWorkspace('asset_links_asset_fk', t, assets, t.assetId),
  sameWorkspace('asset_links_project_fk', t, projects, t.projectId),
  foreignKey({ columns: [t.workspaceId, t.projectId, t.deliverableId], foreignColumns: [deliverables.workspaceId, deliverables.projectId, deliverables.id] }),
  index('asset_links_ws_project_idx').on(t.workspaceId, t.projectId, t.deliverableId),
]);

// C4 keeps Content attachments separate from B5's fixed Project family.
// Migration triggers enforce family exclusivity and immutable association.
export const contentAssetLinks = sqliteTable('content_asset_links', {
  assetId: text('asset_id').primaryKey().notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  contentId: text('content_id').notNull(),
  purpose: text('purpose').notNull(),
  createdAt: createdAt(),
}, t => [
  sameWorkspace('content_asset_links_asset_fk', t, assets, t.assetId),
  sameWorkspace('content_asset_links_content_fk', t, contentItems, t.contentId),
  index('content_asset_links_ws_content_idx').on(t.workspaceId, t.contentId),
  check('content_asset_links_purpose_chk', sql`purpose IN ('recording','asset')`),
]);

export const assetUploadAttempts = sqliteTable('asset_upload_attempts', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  assetId: text('asset_id').notNull(),
  objectKey: text('object_key').notNull(),
  cleanupCheckedAt: text('cleanup_checked_at'),
  createdAt: createdAt(),
}, (t) => [
  sameWorkspace('asset_attempts_asset_fk', t, assets, t.assetId),
  uniqueIndex('asset_attempts_key_uq').on(t.objectKey),
  index('asset_attempts_cleanup_idx').on(t.workspaceId, t.assetId, t.cleanupCheckedAt),
]);

// Internal daily work. Parent context is derived through Project. An optional
// Milestone is constrained to that exact workspace and Project.
export const actions = sqliteTable('actions', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull(),
  milestoneId: text('milestone_id'),
  creationRequestId: text('creation_request_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('to_do'),
  priority: text('priority').notNull().default('normal'),
  assigneeMembershipId: text('assignee_membership_id'),
  dueDate: text('due_date'),
  waitingType: text('waiting_type'),
  waitingReason: text('waiting_reason'),
  visibility: text('visibility').notNull().default('internal'),
  revision: integer('revision').notNull().default(1),
  completedAt: text('completed_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('actions_ws_project_id_uq').on(t.workspaceId, t.projectId, t.id),
  uniqueIndex('actions_project_request_uq').on(t.workspaceId, t.projectId, t.creationRequestId),
  index('actions_ws_project_status_due_idx').on(t.workspaceId, t.projectId, t.status, t.dueDate),
  index('actions_ws_assignee_status_due_idx').on(t.workspaceId, t.assigneeMembershipId, t.status, t.dueDate),
  sameWorkspace('actions_project_fk', t, projects, t.projectId),
  sameWorkspace('actions_assignee_fk', t, workspaceMemberships, t.assigneeMembershipId),
  foreignKey({ name: 'actions_milestone_fk', columns: [t.workspaceId, t.projectId, t.milestoneId], foreignColumns: [milestones.workspaceId, milestones.projectId, milestones.id] }),
  check('actions_title_chk', sql`length(trim(title)) BETWEEN 1 AND 120`),
  check('actions_description_chk', sql`description IS NULL OR length(trim(description)) BETWEEN 1 AND 5000`),
  check('actions_status_chk', oneOf('status', ACTION_STATUSES)),
  check('actions_priority_chk', oneOf('priority', ACTION_PRIORITIES)),
  check('actions_visibility_chk', oneOf('visibility', ['internal', 'restricted'])),
  check('actions_request_chk', sql`length(creation_request_id)=36`),
  check('actions_revision_chk', sql`typeof(revision)='integer' AND revision >= 1`),
  check('actions_due_date_chk', sql`due_date IS NULL OR (length(due_date)=10 AND due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(due_date, '+0 days') IS NOT NULL AND date(due_date, '+0 days')=due_date)`),
  check('actions_waiting_type_chk', sql`waiting_type IS NULL OR ${oneOf('waiting_type', ACTION_WAITING_TYPES)}`),
  check('actions_waiting_chk', sql`(status='waiting' AND waiting_type IS NOT NULL AND waiting_reason IS NOT NULL AND length(trim(waiting_reason)) BETWEEN 1 AND 1000) OR (status<>'waiting' AND waiting_type IS NULL AND waiting_reason IS NULL)`),
  check('actions_completion_chk', sql`(status='done' AND completed_at IS NOT NULL) OR (status<>'done' AND completed_at IS NULL)`),
]);

export const actionDependencies = sqliteTable('action_dependencies', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  projectId: text('project_id').notNull(),
  actionId: text('action_id').notNull(),
  dependsOnActionId: text('depends_on_action_id').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('action_dependencies_pair_uq').on(t.workspaceId, t.projectId, t.actionId, t.dependsOnActionId),
  index('action_dependencies_prerequisite_idx').on(t.workspaceId, t.projectId, t.dependsOnActionId),
  ...[['action', t.actionId], ['prerequisite', t.dependsOnActionId]].map(([name, column]) => foreignKey({
    name: `action_dependencies_${name}_fk`, columns: [t.workspaceId, t.projectId, column], foreignColumns: [actions.workspaceId, actions.projectId, actions.id],
  })),
  check('action_dependencies_self_chk', sql`action_id <> depends_on_action_id`),
]);

// ── templates ────────────────────────────────────────────────────────────

// A template is a named blueprint. Every edit that matters produces a new
// template_versions row; instantiation records which version it used.
export const templates = sqliteTable(
  'templates',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    active: bool('active', true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('templates_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('templates_ws_kind_slug_uq').on(t.workspaceId, t.kind, t.slug),
    check('templates_kind_chk', oneOf('kind', TEMPLATE_KINDS)),
  ],
);

// An immutable snapshot of a template's definition. definition_json,
// definition_hash, template_id, and version_number never change after insert
// (enforced by triggers in migration 0001). Status may move
// draft → published → retired.
export const templateVersions = sqliteTable(
  'template_versions',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    templateId: text('template_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull().default('draft'),
    definitionJson: text('definition_json').notNull(),
    definitionHash: text('definition_hash').notNull(),
    notes: text('notes'),
    createdByMembershipId: text('created_by_membership_id'),
    publishedAt: text('published_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('template_versions_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('template_versions_template_version_uq').on(t.templateId, t.versionNumber),
    uniqueIndex('template_versions_published_uq').on(t.templateId).where(sql`status = 'published'`),
    sameWorkspace('template_versions_template_fk', t, templates, t.templateId),
    sameWorkspace('template_versions_created_by_fk', t, workspaceMemberships, t.createdByMembershipId),
    check('template_versions_status_chk', oneOf('status', TEMPLATE_VERSION_STATUSES)),
    check('template_versions_version_number_chk', sql.raw('version_number >= 1')),
  ],
);

// ── onboarding ───────────────────────────────────────────────────────────

// One generated onboarding run for a client activation. At most one open
// instance per client, so activation can be retried without duplicating.
export const onboardingInstances = sqliteTable(
  'onboarding_instances',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    clientId: text('client_id').notNull(),
    templateVersionId: text('template_version_id'),
    status: text('status').notNull().default('not_started'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    completedByMembershipId: text('completed_by_membership_id'),
    overrideReason: text('override_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('onboarding_instances_ws_client_id_uq').on(t.workspaceId, t.clientId, t.id),
    uniqueIndex('onboarding_instances_ws_id_uq').on(t.workspaceId, t.id),
    index('onboarding_instances_client_idx').on(t.clientId),
    uniqueIndex('onboarding_instances_open_client_uq').on(t.clientId).where(sql`status <> 'complete'`),
    sameWorkspace('onboarding_instances_client_fk', t, clients, t.clientId),
    sameWorkspace('onboarding_instances_template_version_fk', t, templateVersions, t.templateVersionId),
    sameWorkspace('onboarding_instances_completed_by_fk', t, workspaceMemberships, t.completedByMembershipId),
    check('onboarding_instances_status_chk', oneOf('status', ONBOARDING_STATUSES)),
  ],
);

// Canonical provenance for composed onboarding. The legacy nullable single
// templateVersionId on the instance remains unused by the A8 engine.
export const onboardingInstanceTemplates = sqliteTable(
  'onboarding_instance_templates',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    onboardingInstanceId: text('onboarding_instance_id').notNull(),
    templateVersionId: text('template_version_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('onboarding_instance_templates_uq').on(t.onboardingInstanceId, t.templateVersionId),
    sameWorkspace('onboarding_instance_templates_instance_fk', t, onboardingInstances, t.onboardingInstanceId),
    sameWorkspace('onboarding_instance_templates_version_fk', t, templateVersions, t.templateVersionId),
  ],
);

// A structured requirement inside an onboarding run. logical_key is the
// stable identity a template gives the requirement (for example
// `meta.business_access`), so two services that both need Meta access merge
// into one item regardless of how each labels it.
export const onboardingItems = sqliteTable(
  'onboarding_items',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    onboardingInstanceId: text('onboarding_instance_id').notNull(),
    logicalKey: text('logical_key').notNull(),
    title: text('title').notNull(),
    instructions: text('instructions'),
    required: bool('required', true),
    verificationRequired: bool('verification_required', false),
    responsibleParty: text('responsible_party').notNull().default('client'),
    responsibleMembershipId: text('responsible_membership_id'),
    status: text('status').notNull().default('pending'),
    visibility: text('visibility').notNull().default('client'),
    position: integer('position').notNull().default(0),
    dueDate: text('due_date'),
    completedAt: text('completed_at'),
    completedByMembershipId: text('completed_by_membership_id'),
    verifiedAt: text('verified_at'),
    verifiedByMembershipId: text('verified_by_membership_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('onboarding_items_ws_id_uq').on(t.workspaceId, t.id),
    uniqueIndex('onboarding_items_instance_key_uq').on(t.onboardingInstanceId, t.logicalKey),
    index('onboarding_items_instance_status_idx').on(t.onboardingInstanceId, t.status),
    foreignKey({
      name: 'onboarding_items_instance_fk',
      columns: [t.workspaceId, t.onboardingInstanceId],
      foreignColumns: [onboardingInstances.workspaceId, onboardingInstances.id],
    }).onDelete('cascade'),
    sameWorkspace('onboarding_items_responsible_fk', t, workspaceMemberships, t.responsibleMembershipId),
    sameWorkspace('onboarding_items_completed_by_fk', t, workspaceMemberships, t.completedByMembershipId),
    sameWorkspace('onboarding_items_verified_by_fk', t, workspaceMemberships, t.verifiedByMembershipId),
    check('onboarding_items_status_chk', oneOf('status', ONBOARDING_ITEM_STATUSES)),
    check('onboarding_items_responsible_party_chk', oneOf('responsible_party', RESPONSIBLE_PARTIES)),
    check('onboarding_items_visibility_chk', oneOf('visibility', VISIBILITIES)),
    check('onboarding_items_logical_key_chk', sql.raw("length(logical_key) > 0 AND logical_key = lower(logical_key)")),
  ],
);

// A10 runtime facts. The item determines its client through its instance;
// composite FKs keep the item and attributable actor in one workspace.
export const onboardingItemSubmissions = sqliteTable('onboarding_item_submissions', {
  onboardingItemId: text('onboarding_item_id').primaryKey().notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  submittedByMembershipId: text('submitted_by_membership_id').notNull(),
  submittedAt: text('submitted_at').notNull(),
}, (t) => [
  sameWorkspace('onboarding_submissions_item_fk', t, onboardingItems, t.onboardingItemId),
  sameWorkspace('onboarding_submissions_actor_fk', t, workspaceMemberships, t.submittedByMembershipId),
]);

// Canonical outcome stays on the item. This immutable fact retains the
// internal rationale and actor for that terminal waiver/N/A resolution.
export const onboardingItemResolutions = sqliteTable('onboarding_item_resolutions', {
  onboardingItemId: text('onboarding_item_id').primaryKey().notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  reason: text('reason').notNull(),
  resolvedByMembershipId: text('resolved_by_membership_id').notNull(),
  resolvedAt: text('resolved_at').notNull(),
}, (t) => [
  sameWorkspace('onboarding_resolutions_item_fk', t, onboardingItems, t.onboardingItemId),
  sameWorkspace('onboarding_resolutions_actor_fk', t, workspaceMemberships, t.resolvedByMembershipId),
  check('onboarding_resolutions_reason_chk', sql`length(trim(reason)) BETWEEN 1 AND 1000`),
]);

// Which service engagements an onboarding item serves. One merged item (say,
// Meta access) can serve both the Social and the Ads engagement.
export const onboardingItemServices = sqliteTable(
  'onboarding_item_services',
  {
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    onboardingItemId: text('onboarding_item_id').notNull(),
    serviceEngagementId: text('service_engagement_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('onboarding_item_services_uq').on(t.onboardingItemId, t.serviceEngagementId),
    index('onboarding_item_services_engagement_idx').on(t.serviceEngagementId),
    foreignKey({
      name: 'onboarding_item_services_item_fk',
      columns: [t.workspaceId, t.onboardingItemId],
      foreignColumns: [onboardingItems.workspaceId, onboardingItems.id],
    }).onDelete('cascade'),
    sameWorkspace('onboarding_item_services_engagement_fk', t, serviceEngagements, t.serviceEngagementId),
  ],
);

// ── activity ─────────────────────────────────────────────────────────────

// Append-only history of significant operational events. Rows are never
// updated or deleted (enforced by triggers in migration 0001).
export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: id(),
    workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    eventType: text('event_type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    actorMembershipId: text('actor_membership_id'),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    clientId: text('client_id'),
    serviceEngagementId: text('service_engagement_id'),
    metadataJson: text('metadata_json'),
    occurredAt: text('occurred_at').notNull().default(NOW_ISO),
    createdAt: createdAt(),
  },
  (t) => [
    index('activity_events_ws_occurred_idx').on(t.workspaceId, t.occurredAt),
    index('activity_events_client_occurred_idx').on(t.clientId, t.occurredAt),
    index('activity_events_subject_idx').on(t.subjectType, t.subjectId),
    sameWorkspace('activity_events_actor_fk', t, workspaceMemberships, t.actorMembershipId),
    sameWorkspace('activity_events_client_fk', t, clients, t.clientId),
    sameWorkspace('activity_events_engagement_fk', t, serviceEngagements, t.serviceEngagementId),
    check('activity_events_event_type_chk', sql.raw("event_type GLOB '[A-Z]*' AND event_type = upper(event_type)")),
  ],
);

// A9's initial activation is durable even after its onboarding completes.
// Delivery is a recoverable external effect, independent of client lifecycle.
export const clientActivations = sqliteTable('client_activations', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  clientId: text('client_id').notNull(),
  onboardingInstanceId: text('onboarding_instance_id').notNull(),
  contactId: text('contact_id').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  inviteeName: text('invitee_name').notNull(),
  actorMembershipId: text('actor_membership_id').notNull(),
  invitationId: text('invitation_id'),
  deliveryStatus: text('delivery_status').notNull().default('pending'),
  deliveryAttemptId: text('delivery_attempt_id'),
  deliveryLeaseUntil: text('delivery_lease_until'),
  deliveredAt: text('delivered_at'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('client_activations_client_uq').on(t.clientId),
  uniqueIndex('client_activations_instance_uq').on(t.onboardingInstanceId),
  sameWorkspace('client_activations_client_fk', t, clients, t.clientId),
  sameWorkspace('client_activations_actor_fk', t, workspaceMemberships, t.actorMembershipId),
  foreignKey({ columns: [t.workspaceId, t.clientId, t.onboardingInstanceId], foreignColumns: [onboardingInstances.workspaceId, onboardingInstances.clientId, onboardingInstances.id] }),
  foreignKey({ columns: [t.workspaceId, t.clientId, t.contactId], foreignColumns: [clientContacts.workspaceId, clientContacts.clientId, clientContacts.id] }),
  foreignKey({ columns: [t.workspaceId, t.clientId, t.invitationId], foreignColumns: [workspaceInvitations.workspaceId, workspaceInvitations.clientId, workspaceInvitations.id] }),
  check('client_activations_delivery_chk', oneOf('delivery_status', ['pending', 'sending', 'sent', 'failed'])),
]);

// Explicit invitation -> contact relationship; email matching elsewhere
// never grants portal access. Kept separately to avoid rebuilding invitations.
export const clientInvitationContacts = sqliteTable('client_invitation_contacts', {
  invitationId: text('invitation_id').primaryKey().notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  clientId: text('client_id').notNull(),
  contactId: text('contact_id').notNull(),
  createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.workspaceId, t.clientId, t.invitationId], foreignColumns: [workspaceInvitations.workspaceId, workspaceInvitations.clientId, workspaceInvitations.id] }),
  foreignKey({ columns: [t.workspaceId, t.clientId, t.contactId], foreignColumns: [clientContacts.workspaceId, clientContacts.clientId, clientContacts.id] }),
]);

// Every table this schema owns, by physical name. Tests use it to check the
// generated migrations cover the schema and nothing else.
export const BLOOMOPS_TABLES = [
  workspaces, user, session, account, verification,
  workspaceMemberships, workspaceInvitations, departments, departmentMemberships, memberCapabilities,
  clients, clientContacts, clientAssignments,
  serviceTypes, serviceEngagements, serviceAssignments,
  projects, projectAssignments, milestones, actions, actionDependencies, deliverables, contentItems, contentPlatforms,
  assets, assetLinks, assetUploadAttempts, contentAssetLinks,
  templates, templateVersions,
  onboardingInstances, onboardingInstanceTemplates, onboardingItems, onboardingItemServices,
  activityEvents, clientActivations, clientInvitationContacts, onboardingItemSubmissions, onboardingItemResolutions,
];
