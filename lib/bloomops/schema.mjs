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

import { relations, sql } from 'drizzle-orm';
import { CONTENT_TYPES, CONTENT_STAGES } from './content-values.mjs';
import { MILESTONE_STATUSES } from './milestone-values.mjs';
import { ACTION_STATUSES, ACTION_PRIORITIES, ACTION_WAITING_TYPES } from './action-values.mjs';
import { DELIVERABLE_STATUSES } from './deliverable-values.mjs';
import { FILE_MAX_BYTES, FILE_STATUSES } from './file-values.mjs';
export { MILESTONE_STATUSES } from './milestone-values.mjs';
import { sqliteTable, text, integer, index, uniqueIndex, foreignKey, check, primaryKey } from 'drizzle-orm/sqlite-core';
import { PROJECT_STATUSES, PROJECT_HEALTHS } from './project-values.mjs';
import { PROSPECT_FIELDS } from './prospect-values.mjs';
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
    purpose: text('purpose').notNull().default('operations'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('workspaces_slug_uq').on(t.slug),
    check('workspaces_status_chk', oneOf('status', ['active', 'suspended', 'archived'])),
    check('workspaces_purpose_chk', oneOf('purpose', ['operations', 'prospecting'])),
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
    uniqueIndex('workspace_memberships_ws_identity_uq').on(t.workspaceId, t.id, t.userId),
    uniqueIndex('workspace_memberships_ws_user_uq').on(t.workspaceId, t.userId),
    index('workspace_memberships_user_idx').on(t.userId),
    check('workspace_memberships_role_chk', oneOf('role', WORKSPACE_ROLES)),
    check('workspace_memberships_status_chk', oneOf('status', MEMBERSHIP_STATUSES)),
  ],
);

// Explicit fresh-workspace creation receipts, never imported identities.
export const workspaceCreations = sqliteTable('workspace_creations', {
  userId: text('user_id').notNull().references(() => user.id),
  requestId: text('request_id').notNull(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  initialName: text('initial_name').notNull(), createdAt: createdAt(),
}, t => [primaryKey({columns:[t.userId,t.requestId]}), uniqueIndex('workspace_creations_workspace_uq').on(t.workspaceId)]);

// P1 canonical profiles are isolated from inherited slug-keyed job tables.
export const prospects = sqliteTable('bloomops_prospects', {
  id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  creationRequestId:text('creation_request_id').notNull(),creationHash:text('creation_hash').notNull(),
  createdByMembershipId:text('created_by_membership_id').notNull(),revision:integer('revision').notNull().default(1),
  businessName:text('business_name').notNull(),personName:text('person_name'),website:text('website'),platform:text('platform'),
  niche:text('niche'),services:text('services'),publicEmail:text('public_email'),location:text('location'),timeZone:text('time_zone'),
  fit:text('fit').notNull().default('unknown'),fitReason:text('fit_reason'),observedFacts:text('observed_facts'),unknowns:text('unknowns'),proposedWork:text('proposed_work'),
  evidenceDate:text('evidence_date'),evidenceTarget:text('evidence_target'),evidenceReport:text('evidence_report'),evidenceInteraction:text('evidence_interaction'),evidenceLimitations:text('evidence_limitations'),
  draftSubject:text('draft_subject'),draftBody:text('draft_body'),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
  uniqueIndex('bloomops_prospects_ws_id_uq').on(t.workspaceId,t.id),uniqueIndex('bloomops_prospects_request_uq').on(t.workspaceId,t.creationRequestId),
  index('bloomops_prospects_created_idx').on(t.workspaceId,t.createdAt,t.id),index('bloomops_prospects_email_idx').on(t.workspaceId,t.publicEmail),index('bloomops_prospects_list_idx').on(t.workspaceId,t.businessName,t.id),index('bloomops_prospects_fit_idx').on(t.workspaceId,t.fit,t.businessName,t.id),
  sameWorkspace('bloomops_prospects_creator_fk',t,workspaceMemberships,t.createdByMembershipId),
  check('bloomops_prospects_revision_chk',sql`typeof(revision)='integer' AND revision>=1`),
  check('bloomops_prospects_fit_chk',oneOf('fit',['unknown','strong','hold','skip'])),
  check('bloomops_prospects_name_chk',sql`length(trim(business_name)) BETWEEN 1 AND 180`),
  check('bloomops_prospects_hash_chk',sql`length(creation_hash)=64 AND creation_hash NOT GLOB '*[^0-9a-f]*'`),
]);
export const prospectFieldSources = sqliteTable('prospect_field_sources', {
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),fieldKey:text('field_key').notNull(),
  sourceKind:text('source_kind').notNull().default('manual'),sourceUrl:text('source_url'),verification:text('verification').notNull().default('unverified'),
  checkedAt:text('checked_at'),updatedByMembershipId:text('updated_by_membership_id').notNull(),updatedAt:updatedAt(),
},t=>[
  primaryKey({columns:[t.workspaceId,t.prospectId,t.fieldKey]}),sameWorkspace('prospect_field_sources_prospect_fk',t,prospects,t.prospectId),
  sameWorkspace('prospect_field_sources_actor_fk',t,workspaceMemberships,t.updatedByMembershipId),
  check('prospect_field_sources_key_chk',oneOf('field_key',Object.keys(PROSPECT_FIELDS))),
  check('prospect_field_sources_kind_chk',sql`source_kind='manual'`),
  check('prospect_field_sources_verification_chk',sql`(verification='unverified' AND checked_at IS NULL) OR (verification='checked' AND checked_at IS NOT NULL)`),
]);

// P3A explicit sender identity and three-message draft/content approval.
// P3B keeps OAuth credentials separate from legacy mailbox connections.
export const prospectGoogleConnections=sqliteTable('prospect_google_connections',{
 workspaceId:text('workspace_id').primaryKey().references(()=>workspaces.id),revision:integer('revision').notNull(),senderEmail:text('sender_email').notNull(),accountEmail:text('account_email'),tokenBox:text('token_box'),grantedScope:text('granted_scope'),active:integer('active').notNull(),authorizedByMembershipId:text('authorized_by_membership_id').notNull(),authorizerUpdatedAt:text('authorizer_updated_at').notNull(),createdAt:createdAt(),updatedAt:updatedAt(),
 checkId:text('check_id'),checkExpiresAt:text('check_expires_at'),checkedAt:text('checked_at'),checkStatus:text('check_status').notNull().default('unchecked'),
},t=>[sameWorkspace('prospect_google_connections_actor_fk',t,workspaceMemberships,t.authorizedByMembershipId),check('prospect_google_connections_revision_chk',sql`typeof(revision)='integer' AND revision>=1`),check('prospect_google_connections_active_chk',sql`active IN (0,1) AND (active=0 OR (token_box IS NOT NULL AND account_email IS NOT NULL AND granted_scope IS NOT NULL))`)]);
export const prospectGoogleAttempts=sqliteTable('prospect_google_attempts',{
 stateHash:text('state_hash').primaryKey(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),membershipId:text('membership_id').notNull(),memberUpdatedAt:text('member_updated_at').notNull(),sessionHash:text('session_hash').notNull(),senderRevision:integer('sender_revision').notNull(),connectionRevision:integer('connection_revision').notNull(),senderEmail:text('sender_email').notNull(),verifierBox:text('verifier_box').notNull(),createdAt:createdAt(),expiresAt:text('expires_at').notNull(),consumedAt:text('consumed_at'),
},t=>[sameWorkspace('prospect_google_attempts_actor_fk',t,workspaceMemberships,t.membershipId),index('prospect_google_attempts_member_idx').on(t.workspaceId,t.membershipId,t.expiresAt),check('prospect_google_attempts_revision_chk',sql`typeof(sender_revision)='integer' AND sender_revision>=1 AND typeof(connection_revision)='integer' AND connection_revision>=0`)]);

export const prospectSenders = sqliteTable('prospect_senders', {
 workspaceId:text('workspace_id').primaryKey().notNull().references(()=>workspaces.id),provider:text('provider').notNull(),email:text('email').notNull(),displayName:text('display_name'),revision:integer('revision').notNull(),updatedByMembershipId:text('updated_by_membership_id').notNull(),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[sameWorkspace('prospect_senders_actor_fk',t,workspaceMemberships,t.updatedByMembershipId),check('prospect_senders_provider_chk',sql`provider='google_workspace'`),check('prospect_senders_revision_chk',sql`typeof(revision)='integer' AND revision>=1`)]);
export const prospectOutreachDrafts = sqliteTable('prospect_outreach_drafts', {
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),revision:integer('revision').notNull(),profileRevision:integer('profile_revision').notNull(),sourceResultId:text('source_result_id'),
 recipient:text('recipient'),timeZone:text('time_zone'),subject:text('subject'),intro:text('intro'),followUp2:text('follow_up_2'),followUp3:text('follow_up_3'),updatedByMembershipId:text('updated_by_membership_id').notNull(),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex('prospect_outreach_drafts_ws_id_uq').on(t.workspaceId,t.id),uniqueIndex('prospect_outreach_drafts_prospect_uq').on(t.workspaceId,t.prospectId),index('prospect_outreach_drafts_list_idx').on(t.workspaceId,t.updatedAt,t.id),sameWorkspace('prospect_outreach_drafts_prospect_fk',t,prospects,t.prospectId),sameWorkspace('prospect_outreach_drafts_source_fk',t,prospectSkillResults,t.sourceResultId),sameWorkspace('prospect_outreach_drafts_actor_fk',t,workspaceMemberships,t.updatedByMembershipId),check('prospect_outreach_drafts_revision_chk',sql`typeof(revision)='integer' AND revision>=1 AND typeof(profile_revision)='integer' AND profile_revision>=1`)]);
export const prospectOutreachApprovals = sqliteTable('prospect_outreach_approvals', {
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),draftId:text('draft_id').notNull(),draftRevision:integer('draft_revision').notNull(),profileRevision:integer('profile_revision').notNull(),senderRevision:integer('sender_revision').notNull(),approvedByMembershipId:text('approved_by_membership_id').notNull(),approverUpdatedAt:text('approver_updated_at').notNull(),snapshotJson:text('snapshot_json').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('prospect_outreach_approvals_ws_id_uq').on(t.workspaceId,t.id),sameWorkspace('prospect_outreach_approvals_draft_fk',t,prospectOutreachDrafts,t.draftId),sameWorkspace('prospect_outreach_approvals_actor_fk',t,workspaceMemberships,t.approvedByMembershipId),uniqueIndex('prospect_outreach_approvals_version_uq').on(t.workspaceId,t.draftId,t.draftRevision,t.profileRevision,t.senderRevision,t.approvedByMembershipId,t.approverUpdatedAt),check('prospect_outreach_approvals_revision_chk',sql`typeof(draft_revision)='integer' AND draft_revision>=1 AND typeof(profile_revision)='integer' AND profile_revision>=1 AND typeof(sender_revision)='integer' AND sender_revision>=1`),check('prospect_outreach_approvals_snapshot_chk',sql`json_valid(snapshot_json) AND json_type(snapshot_json)='object'`)]);

// A controlled introduction has one permanent receipt; no retry can recreate it.
export const prospectDeliveries=sqliteTable('prospect_deliveries',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),approvalId:text('approval_id').notNull(),messageId:text('message_id').notNull(),state:text('state').notNull().default('prepared'),createdByMembershipId:text('created_by_membership_id').notNull(),createdAt:createdAt(),updatedAt:updatedAt(),attemptedAt:text('attempted_at'),accountEmail:text('account_email'),providerMessageId:text('provider_message_id'),providerThreadId:text('provider_thread_id'),acceptedAt:text('accepted_at'),
},t=>[uniqueIndex('prospect_deliveries_reply_uq').on(t.workspaceId,t.prospectId,t.id),uniqueIndex('prospect_deliveries_prospect_uq').on(t.workspaceId,t.prospectId),uniqueIndex('prospect_deliveries_message_uq').on(t.messageId),sameWorkspace('prospect_deliveries_prospect_fk',t,prospects,t.prospectId),sameWorkspace('prospect_deliveries_approval_fk',t,prospectOutreachApprovals,t.approvalId),sameWorkspace('prospect_deliveries_actor_fk',t,workspaceMemberships,t.createdByMembershipId),check('prospect_deliveries_state_chk',sql`state IN ('prepared','submitting','uncertain','accepted','cancelled')`),check('prospect_deliveries_attempt_chk',sql`(state IN ('prepared','cancelled') OR (attempted_at IS NOT NULL AND account_email IS NOT NULL)) AND (state!='accepted' OR (provider_message_id IS NOT NULL AND provider_thread_id IS NOT NULL AND accepted_at IS NOT NULL))`)]);

// Returned provider identity is separate from the immutable submitted receipt.
export const prospectDeliveryIdentities=sqliteTable('prospect_delivery_identities',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),deliveryId:text('delivery_id').notNull(),accountEmail:text('account_email').notNull(),providerMessageId:text('provider_message_id').notNull(),providerThreadId:text('provider_thread_id').notNull(),rfcMessageId:text('rfc_message_id').notNull(),verifiedByMembershipId:text('verified_by_membership_id').notNull(),connectionRevision:integer('connection_revision').notNull(),senderRevision:integer('sender_revision').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('prospect_delivery_identities_ws_id_uq').on(t.workspaceId,t.id),uniqueIndex('prospect_delivery_identities_delivery_uq').on(t.workspaceId,t.deliveryId),uniqueIndex('prospect_delivery_identities_rfc_uq').on(t.workspaceId,t.accountEmail,t.rfcMessageId),uniqueIndex('prospect_delivery_identities_provider_uq').on(t.workspaceId,t.accountEmail,t.providerMessageId),
 foreignKey({name:'prospect_delivery_identities_delivery_fk',columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectDeliveries.workspaceId,prospectDeliveries.prospectId,prospectDeliveries.id]}),
 sameWorkspace('prospect_delivery_identities_actor_fk',t,workspaceMemberships,t.verifiedByMembershipId),
 check('prospect_delivery_identities_revision_chk',sql`typeof(connection_revision)='integer' AND connection_revision>=1 AND typeof(sender_revision)='integer' AND sender_revision>=1`),
 check('prospect_delivery_identities_rfc_chk',sql`length(rfc_message_id) BETWEEN 5 AND 903 AND rfc_message_id GLOB '<*@*>' AND instr(rfc_message_id,char(10))=0 AND instr(rfc_message_id,char(13))=0`),
]);

// P3C3B: saved reply observations and monotonic holds/stops, separate from sends.
export const prospectReplyStates=sqliteTable('prospect_reply_states',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),deliveryId:text('delivery_id').notNull(),revision:integer('revision').notNull(),
 holdState:text('hold_state').notNull().default('clear'),checkStatus:text('check_status').notNull().default('never'),checkId:text('check_id'),checkExpiresAt:text('check_expires_at'),checkedAt:text('checked_at'),
 stopReason:text('stop_reason'),stopNote:text('stop_note'),stoppedByMembershipId:text('stopped_by_membership_id'),stoppedAt:text('stopped_at'),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.prospectId]}),uniqueIndex('prospect_reply_states_receipt_uq').on(t.workspaceId,t.prospectId,t.deliveryId),
 foreignKey({name:'prospect_reply_states_delivery_fk',columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectDeliveries.workspaceId,prospectDeliveries.prospectId,prospectDeliveries.id]}),
 sameWorkspace('prospect_reply_states_stop_actor_fk',t,workspaceMemberships,t.stoppedByMembershipId),
 check('prospect_reply_states_revision_chk',sql`typeof(revision)='integer' AND revision>=1`),
 check('prospect_reply_states_hold_chk',sql`hold_state IN ('clear','held','stopped')`),
 check('prospect_reply_states_check_chk',sql`check_status IN ('never','checking','checked','unresolved') AND ((check_status='checking' AND check_id IS NOT NULL AND check_expires_at IS NOT NULL) OR (check_status!='checking' AND check_id IS NULL AND check_expires_at IS NULL))`),
 check('prospect_reply_states_stop_chk',sql`(hold_state='stopped' AND stop_reason IS NOT NULL AND stop_note IS NOT NULL AND stop_reason IN ('opt_out','declined','hard_bounce','manual') AND length(trim(stop_note)) BETWEEN 1 AND 1000 AND stopped_by_membership_id IS NOT NULL AND stopped_at IS NOT NULL) OR (hold_state!='stopped' AND stop_reason IS NULL AND stop_note IS NULL AND stopped_by_membership_id IS NULL AND stopped_at IS NULL)`),
]);
export const prospectReplyObservations=sqliteTable('prospect_reply_observations',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),deliveryId:text('delivery_id').notNull(),accountEmail:text('account_email').notNull(),providerMessageId:text('provider_message_id').notNull(),receivedAt:text('received_at').notNull(),kind:text('kind').notNull(),match:text('match').notNull(),observedByMembershipId:text('observed_by_membership_id').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('prospect_reply_observations_provider_uq').on(t.workspaceId,t.accountEmail,t.providerMessageId),index('prospect_reply_observations_list_idx').on(t.workspaceId,t.prospectId,t.createdAt,t.id),
 foreignKey({name:'prospect_reply_observations_state_fk',columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectReplyStates.workspaceId,prospectReplyStates.prospectId,prospectReplyStates.deliveryId]}),
 sameWorkspace('prospect_reply_observations_actor_fk',t,workspaceMemberships,t.observedByMembershipId),
 check('prospect_reply_observations_kind_chk',sql`kind IN ('reply_unreviewed','automatic_response','delivery_report','needs_review')`),check('prospect_reply_observations_match_chk',sql`match IN ('reply_chain','unresolved')`),
]);

// Account history progress never establishes verified coverage of older mail.
export const prospectDiscoveryStates=sqliteTable('prospect_discovery_states',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),accountEmail:text('account_email').notNull(),revision:integer('revision').notNull(),baselineHistoryId:text('baseline_history_id'),historyId:text('history_id'),coverageStatus:text('coverage_status').notNull().default('unverified'),checkStatus:text('check_status').notNull(),checkId:text('check_id'),checkExpiresAt:text('check_expires_at'),checkedAt:text('checked_at'),lastReason:text('last_reason'),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.accountEmail]}),check('prospect_discovery_states_revision_chk',sql`typeof(revision)='integer' AND revision>=1`),
 check('prospect_discovery_states_coverage_chk',sql`coverage_status IN ('unverified','gap')`),
 check('prospect_discovery_states_check_chk',sql`check_status IN ('checking','checked','unresolved') AND ((check_status='checking' AND check_id IS NOT NULL AND check_expires_at IS NOT NULL) OR (check_status!='checking' AND check_id IS NULL AND check_expires_at IS NULL))`),
 check('prospect_discovery_states_cursor_chk',sql`(history_id IS NULL AND baseline_history_id IS NULL) OR (history_id IS NOT NULL AND baseline_history_id IS NOT NULL AND length(history_id) BETWEEN 1 AND 25 AND history_id NOT GLOB '*[^0-9]*' AND substr(history_id,1,1)!='0' AND length(baseline_history_id) BETWEEN 1 AND 25 AND baseline_history_id NOT GLOB '*[^0-9]*' AND substr(baseline_history_id,1,1)!='0')`),
]);
export const prospectDiscoveryRuns=sqliteTable('prospect_discovery_runs',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),accountEmail:text('account_email').notNull(),kind:text('kind').notNull().default('discovery'),sourceHistoryId:text('source_history_id'),actorMembershipId:text('actor_membership_id').notNull(),actorStamp:text('actor_stamp').notNull(),connectionRevision:integer('connection_revision').notNull(),senderRevision:integer('sender_revision').notNull(),status:text('status').notNull().default('checking'),resultHistoryId:text('result_history_id'),reason:text('reason'),createdAt:createdAt(),finishedAt:text('finished_at'),
},t=>[uniqueIndex('prospect_discovery_runs_ws_id_uq').on(t.workspaceId,t.id),
 foreignKey({name:'prospect_discovery_runs_state_fk',columns:[t.workspaceId,t.accountEmail],foreignColumns:[prospectDiscoveryStates.workspaceId,prospectDiscoveryStates.accountEmail]}),sameWorkspace('prospect_discovery_runs_actor_fk',t,workspaceMemberships,t.actorMembershipId),
 check('prospect_discovery_runs_revision_chk',sql`typeof(connection_revision)='integer' AND connection_revision>=1 AND typeof(sender_revision)='integer' AND sender_revision>=1`),
 check('prospect_discovery_runs_status_chk',sql`(status='checking' AND finished_at IS NULL AND result_history_id IS NULL AND reason IS NULL) OR (status IN ('checked','unresolved','superseded') AND finished_at IS NOT NULL AND reason IS NOT NULL AND ((status='checked' AND result_history_id IS NOT NULL) OR (status!='checked' AND result_history_id IS NULL)))`),
]);
export const prospectDiscoveryTargets=sqliteTable('prospect_discovery_targets',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),runId:text('run_id').notNull(),prospectId:text('prospect_id').notNull(),deliveryId:text('delivery_id').notNull(),identityId:text('identity_id'),replyRevision:integer('reply_revision').notNull(),
},t=>[primaryKey({columns:[t.workspaceId,t.runId,t.deliveryId]}),sameWorkspace('prospect_discovery_targets_run_fk',t,prospectDiscoveryRuns,t.runId),sameWorkspace('prospect_discovery_targets_identity_fk',t,prospectDeliveryIdentities,t.identityId),
 foreignKey({name:'prospect_discovery_targets_delivery_fk',columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectDeliveries.workspaceId,prospectDeliveries.prospectId,prospectDeliveries.id]}),check('prospect_discovery_targets_revision_chk',sql`typeof(reply_revision)='integer' AND reply_revision>=1`),
]);

export const prospectRecoveryCollections=sqliteTable('prospect_recovery_collections',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),runId:text('run_id').notNull(),from:text('from_at').notNull(),startHistoryId:text('start_history_id').notNull(),catchupHistoryId:text('catchup_history_id'),catchupStatus:text('catchup_status').notNull(),reason:text('reason').notNull(),matchedCount:integer('matched_count').notNull(),unassignedCount:integer('unassigned_count').notNull(),createdAt:createdAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.runId]}),sameWorkspace('prospect_recovery_collections_run_fk',t,prospectDiscoveryRuns,t.runId),
 check('prospect_recovery_collections_count_chk',sql`typeof(matched_count)='integer' AND typeof(unassigned_count)='integer' AND matched_count>=0 AND unassigned_count>=0 AND matched_count+unassigned_count<=80`),
 check('prospect_recovery_collections_history_chk',sql`length(start_history_id) BETWEEN 1 AND 25 AND start_history_id NOT GLOB '*[^0-9]*' AND substr(start_history_id,1,1)!='0' AND ((catchup_status='unresolved' AND catchup_history_id IS NULL) OR (catchup_status='complete' AND catchup_history_id IS NOT NULL AND length(catchup_history_id) BETWEEN 1 AND 25 AND catchup_history_id NOT GLOB '*[^0-9]*' AND substr(catchup_history_id,1,1)!='0' AND (length(catchup_history_id)>length(start_history_id) OR (length(catchup_history_id)=length(start_history_id) AND catchup_history_id>=start_history_id))))`),
]);
export const prospectRecoveryMessages=sqliteTable('prospect_recovery_messages',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),runId:text('run_id').notNull(),providerMessageId:text('provider_message_id').notNull(),providerThreadId:text('provider_thread_id').notNull(),receivedAt:text('received_at').notNull(),kind:text('kind').notNull(),deliveryId:text('delivery_id'),prospectId:text('prospect_id'),
},t=>[primaryKey({columns:[t.workspaceId,t.runId,t.providerMessageId]}),
 foreignKey({columns:[t.workspaceId,t.runId],foreignColumns:[prospectRecoveryCollections.workspaceId,prospectRecoveryCollections.runId]}),
 foreignKey({columns:[t.workspaceId,t.runId,t.deliveryId],foreignColumns:[prospectDiscoveryTargets.workspaceId,prospectDiscoveryTargets.runId,prospectDiscoveryTargets.deliveryId]}),
 foreignKey({columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectDeliveries.workspaceId,prospectDeliveries.prospectId,prospectDeliveries.id]}),
 check('prospect_recovery_messages_assignment_chk',sql`((delivery_id IS NULL AND prospect_id IS NULL AND kind='needs_review') OR (delivery_id IS NOT NULL AND prospect_id IS NOT NULL AND kind IN ('reply_unreviewed','automatic_response','delivery_report','needs_review')))`),
]);
export const prospectRecoveryScopes=sqliteTable('prospect_recovery_scopes',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),runId:text('run_id').notNull(),intervalFrom:text('interval_from').notNull(),listingPages:integer('listing_pages').notNull(),listedCount:integer('listed_count').notNull(),metadataProcessedCount:integer('metadata_processed_count').notNull(),enumerationComplete:integer('enumeration_complete').notNull(),includeSpamTrash:integer('include_spam_trash').notNull(),maxMessages:integer('max_messages').notNull(),maxPages:integer('max_pages').notNull(),createdAt:createdAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.runId]}),foreignKey({name:'prospect_recovery_scopes_collection_fk',columns:[t.workspaceId,t.runId],foreignColumns:[prospectRecoveryCollections.workspaceId,prospectRecoveryCollections.runId]}),
 check('prospect_recovery_scopes_bounds_chk',sql`listing_pages BETWEEN 1 AND 3 AND listed_count BETWEEN 0 AND 40 AND metadata_processed_count=listed_count AND enumeration_complete=1 AND include_spam_trash=1 AND max_messages=40 AND max_pages=3`),
]);

// Local delivery-report checks: safe terminal facts, never raw correspondence.
// Explicit future-check starting point; older-mail coverage remains unchanged.
export const workspacePages=sqliteTable('bloomops_pages',{
  id:text('id').primaryKey().notNull(),
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  creationRequestId:text('creation_request_id').notNull(),
  title:text('title').notNull().default('Untitled'),
  body:text('body').notNull().default(''),
  revision:integer('revision').notNull().default(1),
  createdAt:text('created_at').notNull(),
  updatedAt:text('updated_at').notNull(),
},t=>[
  uniqueIndex('bloomops_pages_workspace_id_uq').on(t.workspaceId,t.id),
  uniqueIndex('bloomops_pages_request_uq').on(t.workspaceId,t.creationRequestId),
  index('bloomops_pages_updated_idx').on(t.workspaceId,t.updatedAt,t.id),
  check('bloomops_pages_title_ck',sql`length(trim(${t.title})) BETWEEN 1 AND 200`),
  check('bloomops_pages_body_ck',sql`length(CAST(${t.body} AS BLOB))<=1800000`),
  check('bloomops_pages_revision_ck',sql`${t.revision}>=1`),
]);

// Reusable documents retain the canonical Page/editor and immutable saved bodies.
export const pageTemplates=sqliteTable('bloomops_page_templates',{
 pageId:text('page_id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 revision:integer('revision').notNull(),active:integer('active').notNull().default(1),mutationId:text('mutation_id').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[
 uniqueIndex('page_templates_ws_page_uq').on(t.workspaceId,t.pageId),
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 check('page_templates_revision_ck',sql`typeof(${t.revision})='integer' AND ${t.revision} BETWEEN 1 AND 9007199254740991`),
 check('page_templates_active_ck',sql`${t.active} IN (0,1)`),
]);
export const pageTemplateVersions=sqliteTable('bloomops_page_template_versions',{
 id:text('id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),pageId:text('page_id').notNull(),
 version:integer('version').notNull(),sourceRevision:integer('source_revision').notNull(),title:text('title').notNull(),body:text('body').notNull(),
 actorUserId:text('actor_user_id').notNull().references(()=>user.id),actorMembershipId:text('actor_membership_id').notNull(),
 requestId:text('request_id').notNull(),intentHash:text('intent_hash').notNull(),createdAt:text('created_at').notNull(),
},t=>[
 uniqueIndex('page_template_versions_ws_id_uq').on(t.workspaceId,t.id),
 uniqueIndex('page_template_versions_number_uq').on(t.workspaceId,t.pageId,t.version),
 uniqueIndex('page_template_versions_request_uq').on(t.workspaceId,t.actorUserId,t.requestId),
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[pageTemplates.workspaceId,pageTemplates.pageId]}),
 foreignKey({columns:[t.workspaceId,t.actorMembershipId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id]}),
 check('page_template_versions_numbers_ck',sql`typeof(${t.version})='integer' AND ${t.version}>=1 AND typeof(${t.sourceRevision})='integer' AND ${t.sourceRevision}>=1`),
 check('page_template_versions_title_ck',sql`length(trim(${t.title})) BETWEEN 1 AND 200`),
 check('page_template_versions_body_ck',sql`length(CAST(${t.body} AS BLOB))<=1800000`),
]);
export const pageTemplateCreations=sqliteTable('bloomops_page_template_creations',{
 pageId:text('page_id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 versionId:text('version_id').notNull(),actorUserId:text('actor_user_id').notNull().references(()=>user.id),actorMembershipId:text('actor_membership_id').notNull(),
 requestId:text('request_id').notNull(),intentHash:text('intent_hash').notNull(),createdAt:text('created_at').notNull(),
},t=>[
 uniqueIndex('page_template_creations_request_uq').on(t.workspaceId,t.actorUserId,t.requestId),
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 foreignKey({columns:[t.workspaceId,t.versionId],foreignColumns:[pageTemplateVersions.workspaceId,pageTemplateVersions.id]}),
 foreignKey({columns:[t.workspaceId,t.actorMembershipId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id]}),
]);

// Hierarchy has its own revision; moving a document must not conflict with writing.
export const workspacePageTrees=sqliteTable('bloomops_page_trees',{
 workspaceId:text('workspace_id').primaryKey().notNull().references(()=>workspaces.id),
 revision:integer('revision').notNull().default(0),
},t=>[check('bloomops_page_trees_revision_ck',sql`${t.revision}>=0`)]);
export const workspacePageLocations=sqliteTable('bloomops_page_locations',{
 pageId:text('page_id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 parentId:text('parent_id'),position:integer('position').notNull(),
},t=>[
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 foreignKey({columns:[t.workspaceId,t.parentId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 index('bloomops_page_locations_parent_idx').on(t.workspaceId,t.parentId,t.position,t.pageId),
 check('bloomops_page_locations_self_ck',sql`${t.parentId} IS NULL OR ${t.parentId}!=${t.pageId}`),
 check('bloomops_page_locations_position_ck',sql`${t.position}>=0`),
]);

export const workspacePageSettings=sqliteTable('bloomops_page_settings',{
 pageId:text('page_id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 icon:text('icon').notNull().default('file'),inheritAccess:integer('inherit_access').notNull().default(1),
},t=>[
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 check('bloomops_page_settings_inherit_ck',sql`${t.inheritAccess} IN (0,1)`),
 check('bloomops_page_settings_icon_ck',sql`${t.icon} IN ('file','flower','sprout','book-open','lightbulb','target','star','heart','table','calendar-check')`),
]);
// N4: organizational context never grants access or copies operational data.
// Its revision is separate from document autosaves and hierarchy changes.
export const workspacePageContexts=sqliteTable('bloomops_page_contexts',{
 pageId:text('page_id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 clientId:text('client_id'),projectId:text('project_id'),revision:integer('revision').notNull(),
 mutationId:text('mutation_id').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 foreignKey({columns:[t.workspaceId,t.clientId],foreignColumns:[clients.workspaceId,clients.id]}),
 foreignKey({columns:[t.workspaceId,t.clientId,t.projectId],foreignColumns:[projects.workspaceId,projects.clientId,projects.id]}),
 index('bloomops_page_contexts_client_idx').on(t.workspaceId,t.clientId,t.pageId),
 index('bloomops_page_contexts_project_idx').on(t.workspaceId,t.projectId,t.pageId),
 check('bloomops_page_contexts_parent_ck',sql`${t.projectId} IS NULL OR ${t.clientId} IS NOT NULL`),
 check('bloomops_page_contexts_revision_ck',sql`typeof(${t.revision})='integer' AND ${t.revision}>=1`),
 check('bloomops_page_contexts_mutation_ck',sql`length(${t.mutationId})=36`),
]);

export const workspacePageGrants=sqliteTable('bloomops_page_grants',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),pageId:text('page_id').notNull(),membershipId:text('membership_id').notNull(),
 recipientRole:text('recipient_role').notNull(),contactId:text('contact_id'),permission:text('permission').notNull(),
},t=>[
 primaryKey({columns:[t.pageId,t.membershipId]}),
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 foreignKey({columns:[t.workspaceId,t.membershipId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id]}),
 foreignKey({columns:[t.workspaceId,t.contactId],foreignColumns:[clientContacts.workspaceId,clientContacts.id]}),
 index('bloomops_page_grants_member_idx').on(t.workspaceId,t.membershipId,t.pageId),
 check('bloomops_page_grants_permission_ck',sql`${t.permission} IN ('view','comment','edit','none')`),
 check('bloomops_page_grants_recipient_ck',sql`(${t.recipientRole} IN ('project_manager','team_member') AND ${t.contactId} IS NULL) OR (${t.recipientRole}='client' AND ${t.contactId} IS NOT NULL)`),
]);

export const pageCommentThreads=sqliteTable('bloomops_page_comment_threads',{
 id:text('id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),pageId:text('page_id').notNull(),
 authorMembershipId:text('author_membership_id').notNull(),authorUserId:text('author_user_id').notNull().references(()=>user.id),resolved:integer('resolved').notNull().default(0),revision:integer('revision').notNull().default(1),
 lastRequestId:text('last_request_id').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),
},t=>[
 uniqueIndex('page_comment_threads_workspace_uq').on(t.workspaceId,t.id),
 uniqueIndex('page_comment_threads_scope_uq').on(t.workspaceId,t.pageId,t.id),
 foreignKey({columns:[t.workspaceId,t.pageId],foreignColumns:[workspacePages.workspaceId,workspacePages.id]}),
 foreignKey({columns:[t.workspaceId,t.authorMembershipId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id]}),
 index('page_comment_threads_list_idx').on(t.workspaceId,t.pageId,t.resolved,t.createdAt,t.id),
 check('page_comment_threads_state_ck',sql`${t.resolved} IN (0,1) AND ${t.revision}>=1`),
]);
export const pageComments=sqliteTable('bloomops_page_comments',{
 id:text('id').primaryKey().notNull(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),pageId:text('page_id').notNull(),threadId:text('thread_id').notNull(),
 authorMembershipId:text('author_membership_id').notNull(),authorUserId:text('author_user_id').notNull().references(()=>user.id),body:text('body').notNull(),createdAt:text('created_at').notNull(),
},t=>[
 foreignKey({columns:[t.workspaceId,t.pageId,t.threadId],foreignColumns:[pageCommentThreads.workspaceId,pageCommentThreads.pageId,pageCommentThreads.id]}),
 foreignKey({columns:[t.workspaceId,t.authorMembershipId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id]}),
 uniqueIndex('page_comments_scope_uq').on(t.workspaceId,t.pageId,t.threadId,t.id),
 index('page_comments_thread_idx').on(t.workspaceId,t.threadId,t.createdAt,t.id),
 check('page_comments_body_ck',sql`length(trim(${t.body}))>=1 AND length(CAST(${t.body} AS BLOB))<=8000`),
]);

export const prospectMonitoringCheckpoints=sqliteTable('prospect_monitoring_checkpoints',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),runId:text('run_id').notNull(),sourceRunId:text('source_run_id').notNull(),createdAt:createdAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.runId]}),uniqueIndex('prospect_monitoring_checkpoints_source_uq').on(t.workspaceId,t.sourceRunId),
 foreignKey({name:'prospect_monitoring_checkpoints_run_fk',columns:[t.workspaceId,t.runId],foreignColumns:[prospectDiscoveryRuns.workspaceId,prospectDiscoveryRuns.id]}),
 foreignKey({name:'prospect_monitoring_checkpoints_source_fk',columns:[t.workspaceId,t.sourceRunId],foreignColumns:[prospectRecoveryCollections.workspaceId,prospectRecoveryCollections.runId]}),
]);

// Explicit evidence-bound historical interval; never monitoring or send authority.
export const prospectHistoricalCoverages=sqliteTable('prospect_historical_coverages',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),accountEmail:text('account_email').notNull(),sourceRunId:text('source_run_id').notNull(),checkpointRunId:text('checkpoint_run_id').notNull(),intervalFrom:text('interval_from').notNull(),intervalThrough:text('interval_through').notNull(),actorMembershipId:text('actor_membership_id').notNull(),actorStamp:text('actor_stamp').notNull(),connectionRevision:integer('connection_revision').notNull(),senderRevision:integer('sender_revision').notNull(),discoveryRevision:integer('discovery_revision').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('prospect_historical_coverages_checkpoint_uq').on(t.workspaceId,t.checkpointRunId),index('prospect_historical_coverages_account_idx').on(t.workspaceId,t.accountEmail,t.createdAt),
 foreignKey({name:'prospect_historical_coverages_state_fk',columns:[t.workspaceId,t.accountEmail],foreignColumns:[prospectDiscoveryStates.workspaceId,prospectDiscoveryStates.accountEmail]}),
 foreignKey({name:'prospect_historical_coverages_source_fk',columns:[t.workspaceId,t.sourceRunId],foreignColumns:[prospectRecoveryScopes.workspaceId,prospectRecoveryScopes.runId]}),
 foreignKey({name:'prospect_historical_coverages_checkpoint_fk',columns:[t.workspaceId,t.checkpointRunId],foreignColumns:[prospectMonitoringCheckpoints.workspaceId,prospectMonitoringCheckpoints.runId]}),
 sameWorkspace('prospect_historical_coverages_actor_fk',t,workspaceMemberships,t.actorMembershipId),
 check('prospect_historical_coverages_revision_chk',sql`connection_revision>=1 AND sender_revision>=1 AND discovery_revision>=1`),check('prospect_historical_coverages_interval_chk',sql`julianday(interval_from) IS NOT NULL AND julianday(interval_through) IS NOT NULL AND julianday(interval_from)<=julianday(interval_through)`),
]);

export const prospectReportChecks=sqliteTable('prospect_report_checks',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),accountEmail:text('account_email').notNull(),
 recoveryRunId:text('recovery_run_id').notNull(),providerMessageId:text('provider_message_id').notNull(),
 status:text('status').notNull(),actorMembershipId:text('actor_membership_id').notNull(),actorStamp:text('actor_stamp').notNull(),
 connectionRevision:integer('connection_revision').notNull(),senderRevision:integer('sender_revision').notNull(),discoveryRevision:integer('discovery_revision').notNull(),
 createdAt:createdAt(),expiresAt:text('expires_at').notNull(),finishedAt:text('finished_at'),reason:text('reason'),
 deliveryId:text('delivery_id'),prospectId:text('prospect_id'),action:text('action'),statusCode:text('status_code'),
},t=>[
 uniqueIndex('prospect_report_checks_workspace_id').on(t.workspaceId,t.id),
 uniqueIndex('prospect_report_checks_active').on(t.workspaceId,t.accountEmail).where(sql`status='checking'`),
 uniqueIndex('prospect_report_checks_associated').on(t.workspaceId,t.accountEmail,t.providerMessageId).where(sql`status='associated'`),
 index('prospect_report_checks_account').on(t.workspaceId,t.accountEmail,t.createdAt),
 foreignKey({columns:[t.workspaceId,t.recoveryRunId,t.providerMessageId],foreignColumns:[prospectRecoveryMessages.workspaceId,prospectRecoveryMessages.runId,prospectRecoveryMessages.providerMessageId]}),
 foreignKey({columns:[t.workspaceId,t.actorMembershipId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id]}),
 foreignKey({columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectDeliveries.workspaceId,prospectDeliveries.prospectId,prospectDeliveries.id]}),
 check('prospect_report_checks_revision_chk',sql`typeof(connection_revision)='integer' AND typeof(sender_revision)='integer' AND typeof(discovery_revision)='integer' AND connection_revision>=1 AND sender_revision>=1 AND discovery_revision>=1`),
 check('prospect_report_checks_state_chk',sql`((status='checking' AND finished_at IS NULL AND reason IS NULL) OR (status IN ('associated','unresolved','superseded') AND finished_at IS NOT NULL AND reason IS NOT NULL AND reason IN ('associated','invalid_context','invalid_message','invalid_report','unmatched_original','conflicting_evidence','recipient_mismatch','provider_unavailable','observation_conflict','lease_expired')))`),
 check('prospect_report_checks_evidence_chk',sql`((status='associated' AND reason='associated' AND delivery_id IS NOT NULL AND prospect_id IS NOT NULL AND action IS NOT NULL AND action IN ('failed','delayed','delivered','relayed','expanded') AND status_code IS NOT NULL AND status_code GLOB '[245].[0-9]*.[0-9]*' AND status_code NOT GLOB '*[^0-9.]*' AND length(status_code)-length(replace(status_code,'.',''))=2 AND instr(substr(status_code,3),'.') BETWEEN 2 AND 4 AND length(substr(status_code,3))-instr(substr(status_code,3),'.') BETWEEN 1 AND 3) OR (status!='associated' AND delivery_id IS NULL AND prospect_id IS NULL AND action IS NULL AND status_code IS NULL))`),
]);
export const prospectReportTargets=sqliteTable('prospect_report_targets',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),checkId:text('check_id').notNull(),
 deliveryId:text('delivery_id').notNull(),prospectId:text('prospect_id').notNull(),identityId:text('identity_id').notNull(),replyRevision:integer('reply_revision').notNull(),
},t=>[
 primaryKey({columns:[t.workspaceId,t.checkId,t.deliveryId]}),
 foreignKey({columns:[t.workspaceId,t.checkId],foreignColumns:[prospectReportChecks.workspaceId,prospectReportChecks.id]}),
 foreignKey({columns:[t.workspaceId,t.prospectId,t.deliveryId],foreignColumns:[prospectDeliveries.workspaceId,prospectDeliveries.prospectId,prospectDeliveries.id]}),
 foreignKey({columns:[t.workspaceId,t.identityId],foreignColumns:[prospectDeliveryIdentities.workspaceId,prospectDeliveryIdentities.id]}),
 check('prospect_report_targets_revision_chk',sql`reply_revision>=1`),
]);

// Immutable manual result artifacts; profile fields remain canonical.
export const prospectSkillResults = sqliteTable('prospect_skill_results', {
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),prospectId:text('prospect_id').notNull(),
 requestId:text('request_id').notNull(),requestHash:text('request_hash').notNull(),resultHash:text('result_hash').notNull(),createdByMembershipId:text('created_by_membership_id').notNull(),
 skillId:text('skill_id').notNull(),skillVersion:text('skill_version').notNull(),sourceRevision:integer('source_revision').notNull(),appliedRevision:integer('applied_revision').notNull(),
 fullReport:text('full_report').notNull(),documentJson:text('document_json').notNull(),acceptedFieldsJson:text('accepted_fields_json').notNull(),createdAt:createdAt(),
},t=>[
 uniqueIndex('prospect_skill_results_ws_id_uq').on(t.workspaceId,t.id),uniqueIndex('prospect_skill_results_request_uq').on(t.workspaceId,t.requestId),uniqueIndex('prospect_skill_results_result_uq').on(t.workspaceId,t.prospectId,t.resultHash),
 index('prospect_skill_results_list_idx').on(t.workspaceId,t.prospectId,t.createdAt,t.id),
 sameWorkspace('prospect_skill_results_prospect_fk',t,prospects,t.prospectId),sameWorkspace('prospect_skill_results_actor_fk',t,workspaceMemberships,t.createdByMembershipId),
 check('prospect_skill_results_revision_chk',sql`typeof(source_revision)='integer' AND source_revision>=1 AND typeof(applied_revision)='integer' AND applied_revision>source_revision`),
 check('prospect_skill_results_hash_chk',sql`length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*' AND length(result_hash)=64 AND result_hash NOT GLOB '*[^0-9a-f]*'`),
 check('prospect_skill_results_json_chk',sql`json_valid(document_json) AND json_type(document_json)='object' AND json_valid(accepted_fields_json) AND json_type(accepted_fields_json)='object'`),
 check('prospect_skill_results_report_chk',sql`length(trim(full_report)) BETWEEN 1 AND 12000`),
]);

// P2B3 append-only receipts and per-file outcomes; imported rows own source identity.
export const prospectImportReceipts = sqliteTable('prospect_import_receipts', {
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),sourceWorkspaceId:text('source_workspace_id').notNull().references(()=>workspaces.id),
 requestId:text('request_id').notNull(),requestHash:text('request_hash').notNull(),createdByMembershipId:text('created_by_membership_id').notNull(),
 selectedCount:integer('selected_count').notNull(),importedCount:integer('imported_count').notNull(),duplicateCount:integer('duplicate_count').notNull(),rejectedCount:integer('rejected_count').notNull(),
 sealed:integer('sealed').notNull().default(0),createdAt:createdAt(),
},t=>[
 uniqueIndex('prospect_import_receipts_request_uq').on(t.workspaceId,t.requestId),uniqueIndex('prospect_import_receipts_source_uq').on(t.workspaceId,t.id,t.sourceWorkspaceId),
 index('prospect_import_receipts_list_idx').on(t.workspaceId,t.createdAt,t.id),sameWorkspace('prospect_import_receipts_actor_fk',t,workspaceMemberships,t.createdByMembershipId),
 check('prospect_import_receipts_counts_chk',sql`selected_count BETWEEN 1 AND 50 AND imported_count BETWEEN 1 AND selected_count AND duplicate_count>=0 AND rejected_count>=0 AND selected_count=imported_count+duplicate_count+rejected_count`),
 check('prospect_import_receipts_hash_chk',sql`length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*'`),check('prospect_import_receipts_sealed_chk',sql`sealed IN (0,1)`),
 check('prospect_import_receipts_distinct_chk',sql`workspace_id<>source_workspace_id`),
]);
export const prospectImportRows = sqliteTable('prospect_import_rows', {
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),receiptId:text('receipt_id').notNull(),sourceWorkspaceId:text('source_workspace_id').notNull().references(()=>workspaces.id),ordinal:integer('ordinal').notNull(),
 status:text('status').notNull(),prospectId:text('prospect_id'),sourceRecordId:integer('source_record_id'),businessName:text('business_name'),sourceLabel:text('source_label'),fieldsJson:text('fields_json'),reasonsJson:text('reasons_json').notNull(),
},t=>[
 primaryKey({columns:[t.workspaceId,t.receiptId,t.ordinal]}),
 foreignKey({name:'prospect_import_rows_receipt_fk',columns:[t.workspaceId,t.receiptId,t.sourceWorkspaceId],foreignColumns:[prospectImportReceipts.workspaceId,prospectImportReceipts.id,prospectImportReceipts.sourceWorkspaceId]}),
 sameWorkspace('prospect_import_rows_prospect_fk',t,prospects,t.prospectId),
 uniqueIndex('prospect_import_rows_identity_uq').on(t.workspaceId,t.sourceWorkspaceId,t.sourceRecordId).where(sql`status='imported'`),
 uniqueIndex('prospect_import_rows_profile_uq').on(t.workspaceId,t.prospectId).where(sql`prospect_id IS NOT NULL`),
 check('prospect_import_rows_ordinal_chk',sql`typeof(ordinal)='integer' AND ordinal BETWEEN 1 AND 50`),
 check('prospect_import_rows_outcome_chk',sql`(status='imported' AND prospect_id IS NOT NULL AND typeof(source_record_id)='integer' AND source_record_id>0 AND fields_json IS NOT NULL AND json_valid(fields_json)) OR (status IN ('duplicate','rejected') AND prospect_id IS NULL AND fields_json IS NULL)`),
 check('prospect_import_rows_reasons_chk',sql`json_valid(reasons_json) AND json_type(reasons_json)='array'`),
]);

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

// Immutable creation identity for explicit client-form submissions. Existing
// clients and prospect conversion receipts retain their own canonical history.
export const clientCreationReceipts = sqliteTable('client_creation_receipts', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  requestId: text('request_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'restrict' }),
  clientId: text('client_id').notNull(),
  fingerprint: text('fingerprint').notNull(),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.workspaceId, t.requestId] }),
  uniqueIndex('client_creation_receipts_client_uq').on(t.workspaceId, t.clientId),
  sameWorkspace('client_creation_receipts_client_fk', t, clients, t.clientId),
  check('client_creation_receipts_hash_chk', sql`length(fingerprint)=64`),
]);

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
    uniqueIndex('client_contacts_ws_id_uq').on(t.workspaceId,t.id),
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
  uniqueIndex('projects_ws_client_id_uq').on(t.workspaceId, t.clientId, t.id),
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

// Fixed production context and Client/Service identity; editorial state stays relational.
export const contentItems = sqliteTable('content_items', {
  id: id(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  clientId: text('client_id').notNull(),
  serviceEngagementId: text('service_engagement_id'),
  productionArea: text('production_area').notNull().default('social'),
  adsProjectId: text('ads_project_id').references(() => projects.id),
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
  check('content_items_production_area_chk', sql`production_area IN ('social','ads')`),
  check('content_items_production_context_chk', sql`(production_area='social' AND ads_project_id IS NULL) OR (production_area='ads' AND ads_project_id IS NOT NULL)`),
  index('content_items_ws_area_created_idx').on(t.workspaceId, t.productionArea, t.createdAt, t.id),
  index('content_items_ws_ads_project_created_idx').on(t.workspaceId, t.adsProjectId, t.createdAt, t.id),
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

// C5: immutable structured review revisions; relational approval lifecycle.
// Snapshot identity is independent of content_items.revision (the shared CAS).
export const contentReviewRevisions = sqliteTable('content_review_revisions', {
  id: id(), workspaceId: text('workspace_id').notNull().references(()=>workspaces.id), contentId: text('content_id').notNull(),
  number: integer('number').notNull(), title: text('title').notNull(), type: text('type').notNull(),
  hook: text('hook'), script: text('script'), caption: text('caption'), cta: text('cta'),
  targetPublishDate: text('target_publish_date'), platformsJson: text('platforms_json').notNull(), createdAt: createdAt(),
  reviewScope: text('review_scope').notNull().default('copy_only'), mediaCount: integer('media_count').notNull().default(0),
}, t => [
  uniqueIndex('content_review_revisions_parent_id_uq').on(t.workspaceId,t.contentId,t.id),
  uniqueIndex('content_review_revisions_number_uq').on(t.workspaceId,t.contentId,t.number),
  sameWorkspace('content_review_revisions_content_fk',t,contentItems,t.contentId),
  check('content_review_revisions_number_chk',sql`typeof(number)='integer' AND number>=1`),
  check('content_review_revisions_scope_chk',sql`review_scope IN ('copy_only','copy_and_media')`),
  check('content_review_revisions_media_count_chk',sql`typeof(media_count)='integer' AND ((review_scope='copy_only' AND media_count=0) OR (review_scope='copy_and_media' AND media_count BETWEEN 1 AND 10))`),
  check('content_review_revisions_platforms_chk',sql`json_valid(platforms_json) AND json_type(platforms_json)='array' AND json_array_length(platforms_json)<=12`),
]);
export const contentApprovalRounds = sqliteTable('content_approval_rounds', {
  id: id(), workspaceId: text('workspace_id').notNull().references(()=>workspaces.id), contentId: text('content_id').notNull(),
  revisionId: text('revision_id').notNull(), number: integer('number').notNull(),
  requestId: text('request_id').notNull(), requestRevision: integer('request_revision').notNull(),
  requestedBy: text('requested_by').notNull(), requestedAt: text('requested_at').notNull(),
  status: text('status').notNull().default('requested'), respondedBy: text('responded_by'), respondedAt: text('responded_at'), feedback: text('feedback'),
  withdrawnBy: text('withdrawn_by'), withdrawnAt: text('withdrawn_at'), withdrawalReason: text('withdrawal_reason'),
  completionRevision: integer('completion_revision'), completionId: text('completion_id'),
}, t => [
  uniqueIndex('content_approval_rounds_number_uq').on(t.workspaceId,t.contentId,t.number),
  uniqueIndex('content_approval_rounds_revision_uq').on(t.workspaceId,t.contentId,t.revisionId),
  uniqueIndex('content_approval_rounds_request_uq').on(t.workspaceId,t.contentId,t.requestId),
  uniqueIndex('content_approval_rounds_requested_uq').on(t.workspaceId,t.contentId).where(sql`status='requested'`),
  index('content_approval_rounds_status_idx').on(t.workspaceId,t.status,t.requestedAt,t.id),
  foreignKey({columns:[t.workspaceId,t.contentId,t.revisionId],foreignColumns:[contentReviewRevisions.workspaceId,contentReviewRevisions.contentId,contentReviewRevisions.id]}),
  ...['requestedBy','respondedBy','withdrawnBy'].map(k=>sameWorkspace(`content_approval_rounds_${k}_fk`,t,workspaceMemberships,t[k])),
  check('content_approval_rounds_status_chk',sql`status IN ('requested','approved','changes_requested','withdrawn')`),
  check('content_approval_rounds_number_chk',sql`typeof(number)='integer' AND number>=1 AND typeof(request_revision)='integer' AND request_revision>=1`),
  check('content_approval_rounds_request_chk',sql`length(request_id)=36`),
  check('content_approval_rounds_feedback_chk',sql`feedback IS NULL OR length(trim(feedback)) BETWEEN 1 AND 2000`),
  check('content_approval_rounds_reason_chk',sql`withdrawal_reason IS NULL OR length(trim(withdrawal_reason)) BETWEEN 1 AND 2000`),
  check('content_approval_rounds_resolution_chk',sql`(status='requested' AND responded_by IS NULL AND responded_at IS NULL AND feedback IS NULL AND withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdrawal_reason IS NULL AND completion_revision IS NULL AND completion_id IS NULL)
    OR (completion_revision>=request_revision+1 AND completion_id IS NOT NULL AND ((status IN ('approved','changes_requested') AND responded_by IS NOT NULL AND responded_at IS NOT NULL AND withdrawn_by IS NULL AND withdrawn_at IS NULL AND withdrawal_reason IS NULL AND ((status='approved' AND feedback IS NULL) OR (status='changes_requested' AND feedback IS NOT NULL)))
    OR (status='withdrawn' AND withdrawn_by IS NOT NULL AND withdrawn_at IS NOT NULL AND responded_by IS NULL AND responded_at IS NULL AND feedback IS NULL)))`),
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
  uniqueIndex('content_asset_links_ws_content_asset_uq').on(t.workspaceId, t.contentId, t.assetId),
  check('content_asset_links_purpose_chk', sql`purpose IN ('recording','asset')`),
]);

// E3A: ordered, immutable evidence of an existing successful File generation.
export const contentReviewAssets = sqliteTable('content_review_assets', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  contentId: text('content_id').notNull(), revisionId: text('revision_id').notNull(), assetId: text('asset_id').notNull(),
  position: integer('position').notNull(), fileRevision: integer('file_revision').notNull(),
  filename: text('filename').notNull(), mimeType: text('mime_type').notNull(), byteSize: integer('byte_size').notNull(),
  sha256: text('sha256').notNull(), objectKey: text('object_key').notNull(), etag: text('etag').notNull(), readyAt: text('ready_at').notNull(),
}, t => [
  primaryKey({columns:[t.workspaceId,t.revisionId,t.assetId]}),
  foreignKey({columns:[t.workspaceId,t.contentId,t.revisionId],foreignColumns:[contentReviewRevisions.workspaceId,contentReviewRevisions.contentId,contentReviewRevisions.id]}),
  foreignKey({columns:[t.workspaceId,t.contentId,t.assetId],foreignColumns:[contentAssetLinks.workspaceId,contentAssetLinks.contentId,contentAssetLinks.assetId]}),
  uniqueIndex('content_review_assets_position_uq').on(t.workspaceId,t.revisionId,t.position),
  index('content_review_assets_asset_idx').on(t.assetId), index('content_review_assets_key_idx').on(t.objectKey),
  check('content_review_assets_position_chk',sql`typeof(position)='integer' AND position BETWEEN 1 AND 10`),
  check('content_review_assets_revision_chk',sql`typeof(file_revision)='integer' AND file_revision>=1`),
  check('content_review_assets_size_chk',sql`typeof(byte_size)='integer' AND byte_size BETWEEN 1 AND 5242880`),
  check('content_review_assets_hash_chk',sql`length(sha256)=64 AND sha256 NOT GLOB '*[^0-9a-f]*'`),
  check('content_review_assets_type_chk',sql`mime_type IN ('image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm')`),
  check('content_review_assets_evidence_chk',sql`length(filename) BETWEEN 1 AND 180 AND length(object_key)>0 AND length(etag)>0 AND length(ready_at)>0`),
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
  uniqueIndex('actions_workspace_uq').on(t.workspaceId,t.id),
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

// D2 2A configuration only: no eligibility or generation authority. The
// migration additionally guards revisions, active attribution, Systems targets
// and incoming replacement writes (including bound Template identities).
export const serviceTypeBlueprintBindings = sqliteTable('service_type_blueprint_bindings', {
  id: text('id').primaryKey().notNull().default(NEW_ID),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict', onUpdate: 'no action' }),
  serviceTypeId: text('service_type_id').notNull(),
  templateId: text('template_id').notNull(),
  enabled: bool('enabled', true),
  revision: integer('revision').notNull().default(1),
  createdByMembershipId: text('created_by_membership_id'),
  updatedByMembershipId: text('updated_by_membership_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex('service_type_blueprint_bindings_ws_service_uq').on(t.workspaceId, t.serviceTypeId),
  index('service_type_blueprint_bindings_ws_template_idx').on(t.workspaceId, t.templateId),
  index('service_type_blueprint_bindings_ws_creator_idx').on(t.workspaceId, t.createdByMembershipId),
  index('service_type_blueprint_bindings_ws_updater_idx').on(t.workspaceId, t.updatedByMembershipId),
  sameWorkspace('service_type_blueprint_bindings_service_fk', t, serviceTypes, t.serviceTypeId).onDelete('restrict').onUpdate('no action'),
  sameWorkspace('service_type_blueprint_bindings_template_fk', t, templates, t.templateId).onDelete('restrict').onUpdate('no action'),
  sameWorkspace('service_type_blueprint_bindings_creator_fk', t, workspaceMemberships, t.createdByMembershipId).onDelete('restrict').onUpdate('no action'),
  sameWorkspace('service_type_blueprint_bindings_updater_fk', t, workspaceMemberships, t.updatedByMembershipId).onDelete('restrict').onUpdate('no action'),
  ...['id', 'workspace_id', 'service_type_id', 'template_id'].map(column =>
    check(`service_type_blueprint_bindings_${column}_chk`, sql.raw(`typeof(${column}) = 'text' AND length(${column}) > 0 AND instr(${column}, char(0)) = 0`))),
  check('service_type_blueprint_bindings_enabled_chk', sql`typeof(enabled) = 'integer' AND enabled IN (0, 1)`),
  check('service_type_blueprint_bindings_revision_chk', sql`typeof(revision) = 'integer' AND revision BETWEEN 1 AND 9007199254740991`),
]);

// An immutable snapshot of a template's definition. definition_json,
// definition_hash, template_id, and version_number never change after insert
// (enforced by triggers in migration 0001). Status may move
// draft → published → retired. D2 migration 0020 additionally protects Systems
// identity/attribution/notes, publication timestamps and replacement paths. It
// retains published/retired or generation-referenced versions, while allowing
// otherwise-unreferenced drafts to be deleted; onboarding behavior is unchanged.
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
    uniqueIndex('template_versions_ws_template_id_uq').on(t.workspaceId, t.templateId, t.id),
    uniqueIndex('template_versions_template_version_uq').on(t.templateId, t.versionNumber),
    uniqueIndex('template_versions_published_uq').on(t.templateId).where(sql`status = 'published'`),
    sameWorkspace('template_versions_template_fk', t, templates, t.templateId),
    sameWorkspace('template_versions_created_by_fk', t, workspaceMemberships, t.createdByMembershipId),
    check('template_versions_status_chk', oneOf('status', TEMPLATE_VERSION_STATUSES)),
    check('template_versions_version_number_chk', sql.raw('version_number >= 1')),
  ],
);

// N4 mutation fencing and immutable receipts for canonical Project templates.
// Definitions stay in template_versions; generated work stays in Work Core.
export const workSetupStates = sqliteTable('work_setup_states', {
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  templateId:text('template_id').notNull(), revision:integer('revision').notNull(),
  mutationId:text('mutation_id').notNull(), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.templateId]}),
  sameWorkspace('work_setup_state_template_fk',t,templates,t.templateId),
  check('work_setup_state_revision_ck',sql`typeof(revision)='integer' AND revision BETWEEN 1 AND 9007199254740991`),
]);
export const workSetupSaves = sqliteTable('work_setup_saves', {
  workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  actorUserId:text('actor_user_id').notNull(), actorMembershipId:text('actor_membership_id').notNull(),
  requestId:text('request_id').notNull(), intentHash:text('intent_hash').notNull(),
  templateId:text('template_id').notNull(), templateVersionId:text('template_version_id').notNull(),
  operation:text('operation').notNull(), revision:integer('revision').notNull(), createdAt:createdAt(),
},t=>[primaryKey({columns:[t.workspaceId,t.actorUserId,t.requestId]}),
  foreignKey({columns:[t.workspaceId,t.actorMembershipId,t.actorUserId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id,workspaceMemberships.userId]}),
  foreignKey({columns:[t.workspaceId,t.templateId,t.templateVersionId],foreignColumns:[templateVersions.workspaceId,templateVersions.templateId,templateVersions.id]}),
  foreignKey({columns:[t.workspaceId,t.templateId],foreignColumns:[workSetupStates.workspaceId,workSetupStates.templateId]}),
  check('work_setup_save_operation_ck',sql`operation IN ('save','retire','restore') AND typeof(revision)='integer' AND revision>=1 AND length(intent_hash)=64`),
]);
export const workSetupGenerations = sqliteTable('work_setup_generations', {
  id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  projectId:text('project_id').notNull(),templateId:text('template_id').notNull(),templateVersionId:text('template_version_id').notNull(),
  actorUserId:text('actor_user_id').notNull(),actorMembershipId:text('actor_membership_id').notNull(),
  requestId:text('request_id').notNull(),intentHash:text('intent_hash').notNull(),
  eventName:text('event_name').notNull(),eventDate:text('event_date').notNull(),planHash:text('plan_hash').notNull(),planJson:text('plan_json').notNull(),createdAt:createdAt(),
  milestoneCount:integer('milestone_count').notNull(),actionCount:integer('action_count').notNull(),
  deliverableCount:integer('deliverable_count').notNull(),dependencyCount:integer('dependency_count').notNull(),
},t=>[uniqueIndex('work_setup_generation_ws_request_uq').on(t.workspaceId,t.actorUserId,t.requestId),
  uniqueIndex('work_setup_generation_project_uq').on(t.workspaceId,t.projectId),
  sameWorkspace('work_setup_generation_project_fk',t,projects,t.projectId),
  foreignKey({columns:[t.workspaceId,t.actorMembershipId,t.actorUserId],foreignColumns:[workspaceMemberships.workspaceId,workspaceMemberships.id,workspaceMemberships.userId]}),
  foreignKey({columns:[t.workspaceId,t.templateId,t.templateVersionId],foreignColumns:[templateVersions.workspaceId,templateVersions.templateId,templateVersions.id]}),
  check('work_setup_generation_hash_ck',sql`length(intent_hash)=64 AND length(plan_hash)=64`),
  check('work_setup_generation_plan_ck',sql`json_valid(plan_json) AND json_extract(plan_json,'$.schemaVersion')=1`),
  check('work_setup_generation_counts_ck',sql`typeof(milestone_count)='integer' AND milestone_count BETWEEN 0 AND 20 AND typeof(action_count)='integer' AND action_count BETWEEN 0 AND 60 AND typeof(deliverable_count)='integer' AND deliverable_count BETWEEN 0 AND 20 AND typeof(dependency_count)='integer' AND dependency_count BETWEEN 0 AND 180`),
  check('work_setup_generation_date_ck',sql`length(event_date)=10 AND date(event_date,'+0 days') IS NOT NULL AND date(event_date,'+0 days')=event_date`),
]);

// D2 2B: immutable historical identities, deliberately not FKs to live work
// or binding/source/actor rows. Insert guards validate those relationships;
// history survives later permitted deletion without granting current access.
export const systemsBlueprintGenerations = sqliteTable('systems_blueprint_generations', {
  id: text('id').primaryKey().notNull().default(NEW_ID),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  projectId: text('project_id').notNull(),
  clientId: text('client_id').notNull(),
  serviceEngagementId: text('service_engagement_id').notNull(),
  serviceTypeId: text('service_type_id').notNull(),
  bindingId: text('binding_id').notNull(),
  bindingRevision: integer('binding_revision').notNull(),
  templateId: text('template_id').notNull(),
  templateVersionId: text('template_version_id').notNull(),
  templateVersionNumber: integer('template_version_number').notNull(),
  requestId: text('request_id').notNull(),
  blueprintKey: text('blueprint_key').notNull(),
  definitionSchemaVersion: integer('definition_schema_version').notNull(),
  compilerVersion: integer('compiler_version').notNull(),
  definitionJson: text('definition_json').notNull(),
  definitionHash: text('definition_hash').notNull(),
  planJson: text('plan_json').notNull(),
  planHash: text('plan_hash').notNull(),
  createdByMembershipId: text('created_by_membership_id').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('systems_blueprint_generations_ws_id_uq').on(t.workspaceId, t.id),
  uniqueIndex('systems_blueprint_generations_project_uq').on(t.projectId),
  uniqueIndex('systems_blueprint_generations_ws_request_uq').on(t.workspaceId, t.requestId),
  ...['id', 'workspace_id', 'project_id', 'client_id', 'service_engagement_id', 'service_type_id',
    'binding_id', 'template_id', 'template_version_id', 'created_by_membership_id', 'created_at'].map(column =>
    check(`systems_blueprint_generations_${column}_chk`, sql.raw(`typeof(${column}) = 'text' AND length(${column}) > 0 AND instr(${column}, char(0)) = 0`))),
  ...['binding_revision', 'template_version_number'].map(column =>
    check(`systems_blueprint_generations_${column}_chk`, sql.raw(`typeof(${column}) = 'integer' AND ${column} BETWEEN 1 AND 9007199254740991`))),
  check('systems_blueprint_generations_versions_chk', sql`definition_schema_version = 1 AND compiler_version = 1`),
  check('systems_blueprint_generations_blueprint_key_chk', sql`typeof(blueprint_key) = 'text' AND length(blueprint_key) BETWEEN 1 AND 64 AND blueprint_key NOT GLOB '*[^a-z0-9_]*' AND instr(blueprint_key, char(0)) = 0`),
  check('systems_blueprint_generations_request_chk', sql`typeof(request_id) = 'text' AND length(request_id) = 36 AND instr(request_id, char(0)) = 0
    AND substr(request_id,9,1) = '-' AND substr(request_id,14,1) = '-' AND substr(request_id,19,1) = '-' AND substr(request_id,24,1) = '-'
    AND substr(request_id,15,1) = '4' AND substr(request_id,20,1) IN ('8','9','a','b')
    AND length(replace(request_id,'-','')) = 32 AND replace(request_id,'-','') NOT GLOB '*[^0-9a-f]*'`),
  ...['definition_hash', 'plan_hash'].map(column =>
    check(`systems_blueprint_generations_${column}_chk`, sql.raw(`typeof(${column}) = 'text' AND length(${column}) = 64 AND ${column} NOT GLOB '*[^0-9a-f]*' AND instr(${column}, char(0)) = 0`))),
  ...['definition_json', 'plan_json'].map(column =>
    check(`systems_blueprint_generations_${column}_chk`, sql.raw(`CASE WHEN typeof(${column}) = 'text' AND length(CAST(${column} AS BLOB)) BETWEEN 2 AND 32768 AND json_valid(${column}) THEN json_type(${column}) = 'object' ELSE 0 END`))),
]);

// Only the immutable receipt is a parent FK. The original live record may
// disappear; its kind/ID remains reserved by the migration's live-table guards.
export const systemsBlueprintGenerationItems = sqliteTable('systems_blueprint_generation_items', {
  id: text('id').primaryKey().notNull().default(NEW_ID),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  generationId: text('generation_id').notNull(),
  kind: text('kind').notNull(),
  logicalKey: text('logical_key').notNull(),
  recordId: text('record_id').notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('systems_blueprint_generation_items_key_uq').on(t.generationId, t.kind, t.logicalKey),
  uniqueIndex('systems_blueprint_generation_items_record_uq').on(t.kind, t.recordId),
  sameWorkspace('systems_blueprint_generation_items_generation_fk', t, systemsBlueprintGenerations, t.generationId).onDelete('restrict'),
  check('systems_blueprint_generation_items_kind_chk', oneOf('kind', ['milestone', 'action', 'deliverable'])),
  check('systems_blueprint_generation_items_key_chk', sql`typeof(logical_key) = 'text' AND length(logical_key) BETWEEN 1 AND 64 AND logical_key NOT GLOB '*[^a-z0-9_]*' AND instr(logical_key, char(0)) = 0`),
  ...['id', 'workspace_id', 'generation_id', 'record_id', 'created_at'].map(column =>
    check(`systems_blueprint_generation_items_${column}_chk`, sql.raw(`typeof(${column}) = 'text' AND length(${column}) > 0 AND instr(${column}, char(0)) = 0`))),
]);

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
    // Runtime guidance is separate from immutable generated/template text.
    guidanceInstructions: text('guidance_instructions'),
    actionType: text('action_type').notNull().default('unconfigured'),
    actionUrl: text('action_url'),
    guidanceRevision: integer('guidance_revision').notNull().default(0),
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
    check('onboarding_items_action_type_chk', oneOf('action_type', ['unconfigured', 'confirmation', 'agreement', 'upload', 'booking', 'access', 'link'])),
    check('onboarding_items_guidance_revision_chk', sql`guidance_revision BETWEEN 0 AND 2147483647`),
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
    uniqueIndex('activity_events_scope_uq').on(t.workspaceId,t.id),
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
// P5: one immutable sale receipt is also the permanent prospect outreach stop.
export const prospectConversions = sqliteTable('prospect_conversions', {
  id:id(), workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  prospectId:text('prospect_id').notNull(), requestId:text('request_id').notNull(), requestHash:text('request_hash').notNull(),
  profileRevision:integer('profile_revision').notNull(), reviewHash:text('review_hash').notNull(),
  clientId:text('client_id').notNull(), clientCreated:bool('client_created',false), clientName:text('client_name').notNull(),
  serviceEngagementId:text('service_engagement_id').notNull(), serviceTypeId:text('service_type_id').notNull(),
  serviceCreated:bool('service_created',false), serviceName:text('service_name').notNull(),
  packageName:text('package_name'), scopeNotes:text('scope_notes').notNull(),
  recipientEmailsJson:text('recipient_emails_json').notNull(),
  convertedByMembershipId:text('converted_by_membership_id').notNull(), createdAt:createdAt(),
},t=>[
  uniqueIndex('prospect_conversions_ws_id_uq').on(t.workspaceId,t.id),
  uniqueIndex('prospect_conversions_ws_client_id_uq').on(t.workspaceId,t.clientId,t.id),
  uniqueIndex('prospect_conversions_prospect_uq').on(t.workspaceId,t.prospectId),
  uniqueIndex('prospect_conversions_request_uq').on(t.workspaceId,t.requestId),
  index('prospect_conversions_client_idx').on(t.workspaceId,t.clientId),
  sameWorkspace('prospect_conversions_prospect_fk',t,prospects,t.prospectId),
  sameWorkspace('prospect_conversions_client_fk',t,clients,t.clientId),
  sameWorkspace('prospect_conversions_service_type_fk',t,serviceTypes,t.serviceTypeId),
  sameWorkspace('prospect_conversions_actor_fk',t,workspaceMemberships,t.convertedByMembershipId),
  foreignKey({name:'prospect_conversions_engagement_fk',columns:[t.workspaceId,t.clientId,t.serviceEngagementId],foreignColumns:[serviceEngagements.workspaceId,serviceEngagements.clientId,serviceEngagements.id]}),
  check('prospect_conversions_revision_ck',sql`typeof(profile_revision)='integer' AND profile_revision>=1`),
  check('prospect_conversions_hash_ck',sql`length(request_hash)=64 AND request_hash NOT GLOB '*[^0-9a-f]*' AND length(review_hash)=64 AND review_hash NOT GLOB '*[^0-9a-f]*'`),
  check('prospect_conversions_scope_ck',sql`length(trim(scope_notes)) BETWEEN 1 AND 2000 AND (package_name IS NULL OR length(package_name)<=120)`),
  check('prospect_conversions_recipients_ck',sql`json_valid(recipient_emails_json) AND json_type(recipient_emails_json)='array' AND json_array_length(recipient_emails_json)<=3`),
]);

// Sale-time items for multiple purchased services. Legacy receipts stay intact.
export const prospectConversionServices=sqliteTable('prospect_conversion_services',{
  id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
  conversionId:text('conversion_id').notNull(),clientId:text('client_id').notNull(),
  serviceEngagementId:text('service_engagement_id').notNull(),serviceTypeId:text('service_type_id').notNull(),
  serviceName:text('service_name').notNull(),serviceCreated:bool('service_created',false),
  packageName:text('package_name'),scopeNotes:text('scope_notes').notNull(),
},t=>[
  uniqueIndex('prospect_conversion_services_type_uq').on(t.workspaceId,t.conversionId,t.serviceTypeId),
  uniqueIndex('prospect_conversion_services_engagement_uq').on(t.workspaceId,t.conversionId,t.serviceEngagementId),
  foreignKey({name:'prospect_conversion_services_receipt_fk',columns:[t.workspaceId,t.clientId,t.conversionId],foreignColumns:[prospectConversions.workspaceId,prospectConversions.clientId,prospectConversions.id]}),
  foreignKey({name:'prospect_conversion_services_engagement_fk',columns:[t.workspaceId,t.clientId,t.serviceEngagementId],foreignColumns:[serviceEngagements.workspaceId,serviceEngagements.clientId,serviceEngagements.id]}),
  sameWorkspace('prospect_conversion_services_type_fk',t,serviceTypes,t.serviceTypeId),
  check('prospect_conversion_services_scope_ck',sql`length(trim(scope_notes)) BETWEEN 1 AND 2000 AND (package_name IS NULL OR length(package_name)<=120)`),
]);

// Reviewed CSV imports; canonical prospects remain the only business records.
export const prospectCsvBatches=sqliteTable('prospect_csv_batches',{
 id:id(),workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),requestId:text('request_id').notNull(),requestHash:text('request_hash').notNull(),fileHash:text('file_hash').notNull(),fileName:text('file_name').notNull(),createdByMembershipId:text('created_by_membership_id').notNull(),createdAt:createdAt(),
},t=>[uniqueIndex('prospect_csv_batches_ws_id_uq').on(t.workspaceId,t.id),uniqueIndex('prospect_csv_batches_request_uq').on(t.workspaceId,t.requestId),uniqueIndex('prospect_csv_batches_file_uq').on(t.workspaceId,t.fileHash),sameWorkspace('prospect_csv_batches_actor_fk',t,workspaceMemberships,t.createdByMembershipId),check('prospect_csv_batches_hash_chk',sql`length(request_hash)=64 AND length(file_hash)=64`)]);
export const prospectCsvRows=sqliteTable('prospect_csv_rows',{
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),batchId:text('batch_id').notNull(),ordinal:integer('ordinal').notNull(),prospectId:text('prospect_id'),status:text('status').notNull(),fieldsJson:text('fields_json').notNull(),reason:text('reason'),
},t=>[primaryKey({columns:[t.workspaceId,t.batchId,t.ordinal]}),uniqueIndex('prospect_csv_rows_prospect_uq').on(t.workspaceId,t.prospectId),sameWorkspace('prospect_csv_rows_batch_fk',t,prospectCsvBatches,t.batchId),sameWorkspace('prospect_csv_rows_prospect_fk',t,prospects,t.prospectId),check('prospect_csv_rows_status_chk',sql`(status='added' AND prospect_id IS NOT NULL) OR (status IN ('skipped','invalid') AND prospect_id IS NULL)`),check('prospect_csv_rows_json_chk',sql`json_valid(fields_json)`)]);

// N2D: one typed discussion model for operational records. Pages retain their
// established sharing model. Nullable parent columns are constrained to exactly
// one shape; composite FKs prevent cross-workspace and cross-project links.
export const recordDiscussionThreads = sqliteTable('record_discussion_threads', {
  id: text('id').primaryKey().notNull(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  parentType: text('parent_type').notNull(), parentId: text('parent_id').notNull(),
  clientId: text('client_id'), projectId: text('project_id'), actionId: text('action_id'), deliverableId: text('deliverable_id'),
  audience: text('audience').notNull().default('internal'),
  authorMembershipId: text('author_membership_id').notNull(), authorUserId: text('author_user_id').notNull().references(() => user.id),
  resolved: integer('resolved').notNull().default(0), revision: integer('revision').notNull().default(1),
  lastRequestId: text('last_request_id').notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex('record_discussion_threads_scope_uq').on(t.workspaceId, t.id),
  index('record_discussion_threads_list_idx').on(t.workspaceId, t.parentType, t.parentId, t.resolved, t.createdAt, t.id),
  sameWorkspace('record_discussion_client_fk', t, clients, t.clientId),
  sameWorkspace('record_discussion_project_fk', t, projects, t.projectId),
  sameWorkspace('record_discussion_author_fk', t, workspaceMemberships, t.authorMembershipId),
  foreignKey({columns: [t.workspaceId, t.projectId, t.actionId], foreignColumns: [actions.workspaceId, actions.projectId, actions.id]}),
  foreignKey({columns: [t.workspaceId, t.projectId, t.deliverableId], foreignColumns: [deliverables.workspaceId, deliverables.projectId, deliverables.id]}),
  check('record_discussion_parent_ck', sql`(
    (parent_type='client' AND client_id IS NOT NULL AND parent_id=client_id AND project_id IS NULL AND action_id IS NULL AND deliverable_id IS NULL) OR
    (parent_type='project' AND project_id IS NOT NULL AND parent_id=project_id AND client_id IS NULL AND action_id IS NULL AND deliverable_id IS NULL) OR
    (parent_type='action' AND project_id IS NOT NULL AND action_id IS NOT NULL AND parent_id=action_id AND client_id IS NULL AND deliverable_id IS NULL) OR
    (parent_type='deliverable' AND project_id IS NOT NULL AND deliverable_id IS NOT NULL AND parent_id=deliverable_id AND client_id IS NULL AND action_id IS NULL))`),
  check('record_discussion_audience_ck', sql`audience IN ('internal','client') AND (parent_type<>'action' OR audience='internal')`),
  check('record_discussion_state_ck', sql`resolved IN (0,1) AND typeof(revision)='integer' AND revision>=1`),
]);
export const recordDiscussionComments = sqliteTable('record_discussion_comments', {
  id: text('id').primaryKey().notNull(), workspaceId: text('workspace_id').notNull().references(() => workspaces.id), threadId: text('thread_id').notNull(),
  authorMembershipId: text('author_membership_id').notNull(), authorUserId: text('author_user_id').notNull().references(() => user.id),
  body: text('body').notNull(), creationHash: text('creation_hash').notNull(), revision: integer('revision').notNull().default(1),
  lastRequestId: text('last_request_id').notNull(), editedAt: text('edited_at'), removedAt: text('removed_at'), createdAt: createdAt(),
}, t => [
  uniqueIndex('record_discussion_comments_scope_uq').on(t.workspaceId, t.threadId, t.id),
  sameWorkspace('record_discussion_comment_thread_fk', t, recordDiscussionThreads, t.threadId),
  sameWorkspace('record_discussion_comment_author_fk', t, workspaceMemberships, t.authorMembershipId),
  index('record_discussion_comments_list_idx').on(t.workspaceId, t.threadId, t.createdAt, t.id),
  check('record_discussion_comment_body_ck', sql`length(trim(body))>=1 AND length(CAST(body AS BLOB))<=8000`),
  check('record_discussion_comment_revision_ck', sql`typeof(revision)='integer' AND revision>=1`),
]);
export const recordDiscussionMentions = sqliteTable('record_discussion_mentions', {
  workspaceId: text('workspace_id').notNull(), threadId: text('thread_id').notNull(), commentId: text('comment_id').notNull(),
  membershipId: text('membership_id').notNull(), userId: text('user_id').notNull().references(() => user.id),
}, t => [
  primaryKey({columns: [t.commentId, t.membershipId]}),
  foreignKey({columns: [t.workspaceId, t.threadId, t.commentId], foreignColumns: [recordDiscussionComments.workspaceId, recordDiscussionComments.threadId, recordDiscussionComments.id]}),
  sameWorkspace('record_discussion_mention_member_fk', t, workspaceMemberships, t.membershipId),
  index('record_discussion_mentions_recipient_idx').on(t.workspaceId, t.membershipId, t.threadId),
]);

// In-app deliveries store references only; titles and previews are live reads.
export const notificationPreferences = sqliteTable('notification_preferences', {
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  membershipId: text('membership_id').notNull(),
  userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  mentions: integer('mentions').notNull().default(1), replies: integer('replies').notNull().default(1), assignments: integer('assignments').notNull().default(1),
}, t => [primaryKey({columns:[t.workspaceId,t.membershipId,t.userId]}),
  sameWorkspace('notification_preferences_member_fk',t,workspaceMemberships,t.membershipId).onDelete('cascade'),
  check('notification_preferences_flags_ck',sql`mentions IN (0,1) AND replies IN (0,1) AND assignments IN (0,1)`)]);
export const notificationMutes = sqliteTable('notification_mutes', {
  workspaceId:text('workspace_id').notNull().references(() => workspaces.id), membershipId:text('membership_id').notNull(),
  userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  kind:text('kind').notNull(), threadId:text('thread_id').notNull(), recordThreadId:text('record_thread_id'), pageThreadId:text('page_thread_id'),
}, t => [primaryKey({columns:[t.workspaceId,t.membershipId,t.userId,t.kind,t.threadId]}),
  sameWorkspace('notification_mute_member_fk',t,workspaceMemberships,t.membershipId).onDelete('cascade'),
  sameWorkspace('notification_mute_record_fk',t,recordDiscussionThreads,t.recordThreadId).onDelete('cascade'),
  sameWorkspace('notification_mute_page_fk',t,pageCommentThreads,t.pageThreadId).onDelete('cascade'),
  check('notification_mute_target_ck',sql`(kind='record' AND record_thread_id IS NOT NULL AND thread_id=record_thread_id AND page_thread_id IS NULL) OR (kind='page' AND page_thread_id IS NOT NULL AND thread_id=page_thread_id AND record_thread_id IS NULL)`)]);
export const notifications = sqliteTable('notifications', {
  sequence:integer('sequence').primaryKey({autoIncrement:true}),
  id:text('id').notNull(), workspaceId:text('workspace_id').notNull().references(() => workspaces.id),
  eventId:text('event_id').notNull(), membershipId:text('membership_id').notNull(),
  userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
  category:text('category').notNull(), recordThreadId:text('record_thread_id'), recordCommentId:text('record_comment_id'),
  pageId:text('page_id'), pageThreadId:text('page_thread_id'), pageCommentId:text('page_comment_id'), actionId:text('action_id'),
  readAt:text('read_at'), createdAt:createdAt(),
}, t => [uniqueIndex('notifications_id_uq').on(t.id),uniqueIndex('notifications_event_recipient_uq').on(t.eventId,t.membershipId),
  index('notifications_inbox_idx').on(t.workspaceId,t.membershipId,t.createdAt,t.id),
  sameWorkspace('notification_member_fk',t,workspaceMemberships,t.membershipId).onDelete('cascade'),
  sameWorkspace('notification_action_fk',t,actions,t.actionId).onDelete('cascade'),
  foreignKey({columns:[t.workspaceId,t.recordThreadId,t.recordCommentId],foreignColumns:[recordDiscussionComments.workspaceId,recordDiscussionComments.threadId,recordDiscussionComments.id]}).onDelete('cascade'),
  foreignKey({columns:[t.workspaceId,t.pageId,t.pageThreadId],foreignColumns:[pageCommentThreads.workspaceId,pageCommentThreads.pageId,pageCommentThreads.id]}).onDelete('cascade'),
  foreignKey({columns:[t.workspaceId,t.pageId,t.pageThreadId,t.pageCommentId],foreignColumns:[pageComments.workspaceId,pageComments.pageId,pageComments.threadId,pageComments.id]}).onDelete('cascade'),
  sameWorkspace('notification_event_fk',t,activityEvents,t.eventId),
  check('notification_target_ck',sql`(
    (category IN ('mentions','replies') AND record_thread_id IS NOT NULL AND record_comment_id IS NOT NULL AND page_id IS NULL AND page_thread_id IS NULL AND page_comment_id IS NULL AND action_id IS NULL) OR
    (category='replies' AND page_id IS NOT NULL AND page_thread_id IS NOT NULL AND page_comment_id IS NOT NULL AND record_thread_id IS NULL AND record_comment_id IS NULL AND action_id IS NULL) OR
    (category='assignments' AND action_id IS NOT NULL AND record_thread_id IS NULL AND record_comment_id IS NULL AND page_id IS NULL AND page_thread_id IS NULL AND page_comment_id IS NULL))`)]);

// N3A: private manual drafts; observations stay relational and versioned by header.
export const clientReportDrafts = sqliteTable('client_report_drafts', {
 id:id(), workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 clientId:text('client_id').notNull(), serviceEngagementId:text('service_engagement_id').notNull(),
 templateId:text('template_id').notNull(), templateVersion:integer('template_version').notNull(),
 title:text('title').notNull(), periodStart:text('period_start').notNull(), periodEnd:text('period_end').notNull(), timezone:text('timezone').notNull(),
 channel:text('channel').notNull(), accountLabel:text('account_label').notNull(), scopeLabel:text('scope_label').notNull(), commentary:text('commentary').notNull(),
 clientSummary:text('client_summary').notNull().default(''), workCompleted:text('work_completed').notNull().default(''),
 limitations:text('limitations').notNull().default(''), nextActions:text('next_actions').notNull().default(''),
 archivedAt:text('archived_at'), publicationFloor:integer('publication_floor').notNull().default(0),
 archiveRequestId:text('archive_request_id'), archiveIntentHash:text('archive_intent_hash'),
 creatorMembershipId:text('creator_membership_id').notNull(), creatorUserId:text('creator_user_id').notNull().references(()=>user.id),
 updaterMembershipId:text('updater_membership_id').notNull(), updaterUserId:text('updater_user_id').notNull().references(()=>user.id),
 requestId:text('request_id').notNull(), creationHash:text('creation_hash').notNull(), mutationId:text('mutation_id').notNull(),
 revision:integer('revision').notNull(), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[
 uniqueIndex('client_report_ws_id_uq').on(t.workspaceId,t.id),
 uniqueIndex('client_report_request_uq').on(t.workspaceId,t.creatorUserId,t.requestId),
 index('client_report_list_idx').on(t.workspaceId,t.clientId,t.createdAt,t.id),
 foreignKey({columns:[t.workspaceId,t.clientId,t.serviceEngagementId],foreignColumns:[serviceEngagements.workspaceId,serviceEngagements.clientId,serviceEngagements.id]}),
 sameWorkspace('client_report_creator_fk',t,workspaceMemberships,t.creatorMembershipId),
 sameWorkspace('client_report_updater_fk',t,workspaceMemberships,t.updaterMembershipId),
 check('client_report_template_ck',sql`template_version=1 AND template_id IN ('ghl_campaign','social')`),
 check('client_report_revision_ck',sql`typeof(revision)='integer' AND revision>=1`),
 check('client_report_period_ck',sql`period_start<=period_end`),
]);
export const clientReportMetrics = sqliteTable('client_report_metrics', {
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id), reportId:text('report_id').notNull(),
 metricKey:text('metric_key').notNull(), state:text('state').notNull(), value:integer('value'),
 sourceNote:text('source_note').notNull(), collectedAt:text('collected_at'),
 sourceKind:text('source_kind').notNull().default('manual'), importId:text('import_id'),
},t=>[primaryKey({columns:[t.workspaceId,t.reportId,t.metricKey]}),
 sameWorkspace('client_report_metric_parent_fk',t,clientReportDrafts,t.reportId).onDelete('cascade'),
 check('client_report_metric_value_ck',sql`(state='value' AND value IS NOT NULL AND typeof(value)='integer' AND value BETWEEN 0 AND 1000000000) OR (state IN ('missing','unavailable','not_tracked') AND value IS NULL)`),
 check('client_report_metric_source_ck',sql`source_kind IN ('manual','csv') AND (source_kind='manual' OR import_id IS NOT NULL)`),
]);

// Append-only release ledger. A withdrawal is a new fact, never an edit to
// published content. Only the latest publish entry is available to clients.
export const clientReportPublications = sqliteTable('client_report_publications', {
 id:id(), workspaceId:text('workspace_id').notNull().references(()=>workspaces.id), reportId:text('report_id').notNull(),
 sequence:integer('sequence').notNull(), kind:text('kind').notNull(), draftRevision:integer('draft_revision').notNull(),
 snapshotJson:text('snapshot_json'), snapshotHash:text('snapshot_hash'),
 actorMembershipId:text('actor_membership_id').notNull(), actorUserId:text('actor_user_id').notNull().references(()=>user.id),
 requestId:text('request_id').notNull(), intentHash:text('intent_hash').notNull(), createdAt:createdAt(),
},t=>[
 uniqueIndex('client_report_publication_ws_id_uq').on(t.workspaceId,t.id),
 uniqueIndex('client_report_publication_sequence_uq').on(t.workspaceId,t.reportId,t.sequence),
 uniqueIndex('client_report_publication_request_uq').on(t.workspaceId,t.actorUserId,t.requestId),
 sameWorkspace('client_report_publication_report_fk',t,clientReportDrafts,t.reportId),
 sameWorkspace('client_report_publication_actor_fk',t,workspaceMemberships,t.actorMembershipId),
 check('client_report_publication_sequence_ck',sql`typeof(sequence)='integer' AND sequence>=1 AND typeof(draft_revision)='integer' AND draft_revision>=1`),
 check('client_report_publication_kind_ck',sql`(kind='publish' AND snapshot_json IS NOT NULL AND snapshot_hash IS NOT NULL AND json_valid(snapshot_json)) OR (kind='withdraw' AND snapshot_json IS NULL AND snapshot_hash IS NULL)`),
]);

// Optional draft comparison selection. Publication freezes the reviewed numeric
// comparison; this relation is operational draft state, not a mutable snapshot.
export const clientReportComparisons = sqliteTable('client_report_comparisons', {
 workspaceId:text('workspace_id').notNull().references(()=>workspaces.id),
 reportId:text('report_id').notNull(), publicationId:text('publication_id').notNull(),
},t=>[primaryKey({columns:[t.workspaceId,t.reportId]}),
 sameWorkspace('client_report_comparison_report_fk',t,clientReportDrafts,t.reportId).onDelete('cascade'),
 sameWorkspace('client_report_comparison_publication_fk',t,clientReportPublications,t.publicationId),
]);

// F3 manual finance. Parent identity is immutable in the writer; no payment execution.
export const financeRecords = sqliteTable('finance_records', {
 id:id(), workspaceId:text('workspace_id').notNull().references(()=>workspaces.id,{onDelete:'restrict'}),
 clientId:text('client_id').notNull(), serviceEngagementId:text('service_engagement_id'),
 kind:text('kind').notNull(), title:text('title').notNull(), amountMinor:integer('amount_minor').notNull(),
 currency:text('currency').notNull(), currencyDigits:integer('currency_digits').notNull(), status:text('status').notNull(),
 dueDate:text('due_date'),paidDate:text('paid_date'),renewalDate:text('renewal_date'),
 provider:text('provider').notNull(),reference:text('reference').notNull(),notes:text('notes').notNull(),
 archived:integer('archived').notNull().default(0),revision:integer('revision').notNull().default(1),
 requestId:text('request_id').notNull(),creationHash:text('creation_hash').notNull(),
 creatorUserId:text('creator_user_id').notNull(),creatorMembershipId:text('creator_membership_id').notNull(),
 updaterMembershipId:text('updater_membership_id').notNull(),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
 uniqueIndex('finance_records_ws_id_uq').on(t.workspaceId,t.id),
 uniqueIndex('finance_records_creation_uq').on(t.workspaceId,t.creatorUserId,t.requestId),
 index('finance_records_list_idx').on(t.workspaceId,t.archived,t.createdAt,t.id),
 index('finance_records_client_idx').on(t.workspaceId,t.clientId,t.serviceEngagementId),
 sameWorkspace('finance_records_client_fk',t,clients,t.clientId),
 foreignKey({name:'finance_records_service_fk',columns:[t.workspaceId,t.clientId,t.serviceEngagementId],foreignColumns:[serviceEngagements.workspaceId,serviceEngagements.clientId,serviceEngagements.id]}).onDelete('restrict'),
 sameWorkspace('finance_records_creator_fk',t,workspaceMemberships,t.creatorMembershipId),
 sameWorkspace('finance_records_updater_fk',t,workspaceMemberships,t.updaterMembershipId),
 check('finance_records_amount_chk',sql.raw("amount_minor >= 0 AND amount_minor <= 1000000000000 AND typeof(amount_minor)='integer' AND currency_digits BETWEEN 0 AND 4")),
 check('finance_records_state_chk',sql.raw("(kind='invoice' AND status IN ('draft','sent','paid','overdue','void')) OR (kind='payment' AND status IN ('pending','completed','failed','refunded'))")),
 check('finance_records_revision_chk',sql.raw('revision >= 1 AND archived IN (0,1)')),
]);

export const BLOOMOPS_TABLES = [
  financeRecords,
  workSetupStates, workSetupSaves, workSetupGenerations,
  clientReportComparisons, clientReportPublications, clientReportDrafts, clientReportMetrics,
  notifications, notificationPreferences, notificationMutes,
  recordDiscussionThreads, recordDiscussionComments, recordDiscussionMentions,
  prospectCsvBatches, prospectCsvRows,
  prospectConversions,
  prospectConversionServices,
  workspaces, workspaceCreations, workspacePages, pageTemplates, pageTemplateVersions, pageTemplateCreations, workspacePageTrees, workspacePageLocations, workspacePageSettings, workspacePageContexts, workspacePageGrants, pageCommentThreads, pageComments, prospects, prospectFieldSources, prospectImportReceipts, prospectImportRows, prospectSkillResults, prospectSenders, prospectOutreachDrafts, prospectOutreachApprovals, prospectDeliveries, prospectDeliveryIdentities, prospectReplyStates, prospectReplyObservations, prospectDiscoveryStates, prospectDiscoveryRuns, prospectDiscoveryTargets, prospectRecoveryCollections, prospectRecoveryMessages, prospectRecoveryScopes, prospectMonitoringCheckpoints, prospectHistoricalCoverages, prospectReportChecks, prospectReportTargets, prospectGoogleConnections, prospectGoogleAttempts, user, session, account, verification,
  workspaceMemberships, workspaceInvitations, departments, departmentMemberships, memberCapabilities,
  clients, clientCreationReceipts, clientContacts, clientAssignments,
  serviceTypes, serviceEngagements, serviceAssignments,
  projects, projectAssignments, milestones, actions, actionDependencies, deliverables, contentItems, contentPlatforms,
  assets, assetLinks, assetUploadAttempts, contentAssetLinks, contentReviewRevisions, contentApprovalRounds, contentReviewAssets,
  templates, templateVersions, serviceTypeBlueprintBindings, systemsBlueprintGenerations, systemsBlueprintGenerationItems,
  onboardingInstances, onboardingInstanceTemplates, onboardingItems, onboardingItemServices,
  activityEvents, clientActivations, clientInvitationContacts, onboardingItemSubmissions, onboardingItemResolutions,
];

// ORM relationship metadata only; no database schema change. Better Auth uses
// these existing foreign keys to read a session and its user in one D1 call.
export const authUserRelations = relations(user, ({ many }) => ({ sessions: many(session), accounts: many(account) }));
export const authSessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }));
export const authAccountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }));
