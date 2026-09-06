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
import { sqliteTable, text, integer, index, uniqueIndex, foreignKey, check } from 'drizzle-orm/sqlite-core';

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
    uniqueIndex('onboarding_instances_ws_id_uq').on(t.workspaceId, t.id),
    index('onboarding_instances_client_idx').on(t.clientId),
    uniqueIndex('onboarding_instances_open_client_uq').on(t.clientId).where(sql`status <> 'complete'`),
    sameWorkspace('onboarding_instances_client_fk', t, clients, t.clientId),
    sameWorkspace('onboarding_instances_template_version_fk', t, templateVersions, t.templateVersionId),
    sameWorkspace('onboarding_instances_completed_by_fk', t, workspaceMemberships, t.completedByMembershipId),
    check('onboarding_instances_status_chk', oneOf('status', ONBOARDING_STATUSES)),
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

// Every table this schema owns, by physical name. Tests use it to check the
// generated migrations cover the schema and nothing else.
export const BLOOMOPS_TABLES = [
  workspaces, user, session, account, verification,
  workspaceMemberships, workspaceInvitations, departments, departmentMemberships, memberCapabilities,
  clients, clientContacts, clientAssignments,
  serviceTypes, serviceEngagements, serviceAssignments,
  templates, templateVersions,
  onboardingInstances, onboardingItems, onboardingItemServices,
  activityEvents,
];
