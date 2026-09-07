// The BloomOps authorization engine (A4).
//
// One place answers "may this person do this to that?" for every BloomOps
// route and page. The layers, in the order they are checked, follow
// docs/DOMAIN_MODEL.md and docs/phases/A4.md:
//
//   identity        a Better Auth session (lib/bloomops/access.mjs)
//   membership      an ACTIVE membership in an ACTIVE workspace (access.mjs)
//   workspace       the resource belongs to that workspace
//   scope           the actor's client/service reach covers the resource
//   visibility      the record's internal | client | restricted marker
//   role            the role may perform the action
//   capability      a sensitive area needs a capability the actor holds
//
// Default deny: an unknown action, an unknown visibility, a resource with no
// workspace, or an actor whose scope was never loaded all refuse.
//
// Policy lives in the tables below and nowhere else. Route handlers name an
// action (and, for a record, a resource descriptor); they never compare
// roles or capabilities themselves.
//
// Scope, in one paragraph. Owner, Admin, and Project Manager have
// workspace-wide client and service scope (docs/PRODUCT_SPEC.md gives the
// Project Manager "broad delivery visibility and coordination, but not
// security administration or Finance by default"). A Team Member reaches
// only what they are assigned to: a client_assignments row grants that
// client and everything under it, a service_assignments row grants that
// one engagement and nothing else, not the client record and not sibling
// engagements. Department membership grants nothing. A Client reaches only
// the clients whose client_contacts row carries their user id in this
// workspace, sees only client-visible records, and holds no capabilities,
// whatever rows exist. A Client membership with no linked contact fails
// closed.
//
// Resource descriptors are plain objects: { type, id, workspaceId,
// clientId?, serviceEngagementId?, visibility?, restrictedToMembershipIds? }.
// A missing visibility is treated as internal, so a record that forgot to
// declare itself client-visible is never shown to a client.
//
// Nothing here is cached across requests. An actor is loaded from the
// database for one request and dropped with it, so suspension, removal, an
// assignment change, or a capability change takes effect on the next call.
import { and, eq } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, recordActivity } from './activity.mjs';

// ── vocabulary ────────────────────────────────────────────────────────────

export const ROLES = schema.WORKSPACE_ROLES;
export const INTERNAL_ROLES = ['owner', 'admin', 'project_manager', 'team_member'];
export const VISIBILITIES = schema.VISIBILITIES;

export const CAPABILITIES = ['members.manage', 'workspace.settings', 'templates.manage', 'finance.view', 'finance.edit'];

export const CAPABILITY_LABELS = {
  'members.manage': 'Manage members and invitations',
  'workspace.settings': 'Change workspace settings',
  'templates.manage': 'Manage templates',
  'finance.view': 'View finance',
  'finance.edit': 'Edit finance',
};

// ── policy ────────────────────────────────────────────────────────────────

// Capabilities a role holds without a member_capabilities row. Owner holds
// them all: the Owner is the workspace principal, cannot be locked out (the
// last active Owner cannot be suspended), and could grant themself anything
// anyway, so withholding one would only be theatre. Admin administers
// membership, settings, and templates, but Finance is separately
// configurable (docs/PRODUCT_SPEC.md), so it is an explicit grant. Project
// Manager and Team Member hold nothing by role. Client holds nothing and
// can be granted nothing (see actorCapabilities).
const ROLE_CAPABILITIES = {
  owner: new Set(CAPABILITIES),
  admin: new Set(['members.manage', 'workspace.settings', 'templates.manage']),
  project_manager: new Set(),
  team_member: new Set(),
  client: new Set(),
};

// Roles that may hold explicit capability grants at all.
const GRANTABLE_ROLES = new Set(INTERNAL_ROLES);

// How far a role reaches across clients and services before assignments.
const SCOPE_BY_ROLE = {
  owner: 'workspace',
  admin: 'workspace',
  project_manager: 'workspace',
  team_member: 'assigned',
  client: 'contact',
};

// Who sees a restricted record without being named on it. Nobody else
// does: a Project Manager or Team Member needs to be listed in the
// record's restrictedToMembershipIds, and a Client never sees restricted.
const RESTRICTED_BY_ROLE = new Set(['owner', 'admin']);

const ALL_ROLES = ROLES;
const ADMIN_ROLES = ['owner', 'admin'];
const DELIVERY_ROLES = ['owner', 'admin', 'project_manager'];

// Every action a route may name. `roles` lists who may perform it,
// `capability` names what they must hold, `resource: true` means the
// action is about one record and refuses to run without a descriptor.
export const ACTIONS = {
  // Workspace administration
  'members.manage': { roles: ALL_ROLES, capability: 'members.manage' },
  'invitations.manage': { roles: ALL_ROLES, capability: 'members.manage' },
  'capabilities.manage': { roles: ALL_ROLES, capability: 'members.manage' },
  'workspace.settings': { roles: ALL_ROLES, capability: 'workspace.settings' },
  'templates.manage': { roles: ALL_ROLES, capability: 'templates.manage' },
  'finance.view': { roles: ALL_ROLES, capability: 'finance.view' },
  'finance.edit': { roles: ALL_ROLES, capability: 'finance.edit' },

  // Delivery records. View is open to every role that can reach the record;
  // manage is for the people who coordinate delivery. `client.create` is the
  // one delivery action with no resource, because the record it makes does
  // not exist yet: it asks only whether this role may bring a client into
  // the workspace at all.
  'client.create': { roles: DELIVERY_ROLES },
  'client.view': { roles: ALL_ROLES, resource: true },
  'onboarding.view': { roles: ALL_ROLES, resource: true },
  'onboarding.submit': { roles: ['client'], resource: true },
  'onboarding.verify': { roles: DELIVERY_ROLES, resource: true },
  'onboarding.manage': { roles: DELIVERY_ROLES, resource: true },
  'client.activate': { roles: DELIVERY_ROLES, resource: true },
  'client.manage': { roles: DELIVERY_ROLES, resource: true },
  'service.view': { roles: ALL_ROLES, resource: true },
  'service.manage': { roles: DELIVERY_ROLES, resource: true },

  // A7. Three delivery-coordination actions, each about a record that
  // already exists, so each proves reach as well as role.
  //
  // `service.create` names the CLIENT the engagement is being added to,
  // because the engagement itself does not exist yet and asking only about
  // the role would let a Project Manager add a service to a client they
  // could not otherwise see. `client.assign` names the client;
  // `service.assign` names the engagement.
  //
  // All three are Owner, Admin, and Project Manager. They are not
  // membership administration: putting a colleague on a client decides who
  // does the work, and `members.manage` (who is in the workspace at all,
  // and with what role) stays where A4 put it. A Team Member may see the
  // team of a client they reach and change none of it; a Client never
  // reaches these at all, because every route behind them loads an
  // internal record.
  'service.create': { roles: DELIVERY_ROLES, resource: true },
  'client.assign': { roles: DELIVERY_ROLES, resource: true },
  'service.assign': { roles: DELIVERY_ROLES, resource: true },

  // The inherited prospecting application and its routes. Transitional:
  // available to workspace administrators only until A5 and later replace
  // those surfaces. See lib/workspace.mjs.
  'legacy.prospecting': { roles: ADMIN_ROLES },
};

export function isCapability(key) {
  return CAPABILITIES.includes(key);
}

export function isAction(name) {
  return Object.prototype.hasOwnProperty.call(ACTIONS, name);
}

// The capabilities a role carries by itself, as a fresh Set.
export function roleCapabilities(role) {
  return new Set(ROLE_CAPABILITIES[role] || []);
}

// ── actor ─────────────────────────────────────────────────────────────────

// Everything the engine knows about one active membership for one request.
// Built by loadActor (database-backed) or baseActor (role only, for the
// checks that need nothing else).
//
//   workspaceId, membershipId, userId, role, status
//   capabilities   Set of dotted keys, or null when not loaded
//   scope          { kind: 'workspace' }
//                | { kind: 'assigned', clientIds, serviceEngagementIds, serviceClientIds }
//                | { kind: 'contact', clientIds }
//                | null when not loaded

export function baseActor({ workspace, membership, user = null }) {
  if (!workspace || !membership) return null;
  return {
    workspaceId: workspace.id,
    membershipId: membership.id,
    userId: membership.userId || user?.id || null,
    role: membership.role,
    status: membership.status,
    capabilities: null,
    scope: null,
  };
}

// Role baseline plus explicit grants, for internal roles only. A Client's
// grants are ignored even if rows exist: capabilities open internal areas,
// and a Client never enters those.
function actorCapabilities(role, grantedKeys) {
  const set = roleCapabilities(role);
  if (!GRANTABLE_ROLES.has(role)) return new Set();
  for (const key of grantedKeys) if (isCapability(key)) set.add(key);
  return set;
}

async function loadCapabilityKeys(db, actor) {
  const rows = await db
    .select({ capability: schema.memberCapabilities.capability })
    .from(schema.memberCapabilities)
    .where(and(eq(schema.memberCapabilities.workspaceId, actor.workspaceId), eq(schema.memberCapabilities.membershipId, actor.membershipId)));
  return rows.map((r) => r.capability);
}

async function loadAssignedScope(db, actor) {
  const clientRows = await db
    .select({ clientId: schema.clientAssignments.clientId })
    .from(schema.clientAssignments)
    .where(and(eq(schema.clientAssignments.workspaceId, actor.workspaceId), eq(schema.clientAssignments.membershipId, actor.membershipId)));
  const serviceRows = await db
    .select({ serviceEngagementId: schema.serviceAssignments.serviceEngagementId, clientId: schema.serviceEngagements.clientId })
    .from(schema.serviceAssignments)
    .innerJoin(
      schema.serviceEngagements,
      and(
        eq(schema.serviceEngagements.id, schema.serviceAssignments.serviceEngagementId),
        eq(schema.serviceEngagements.workspaceId, schema.serviceAssignments.workspaceId),
      ),
    )
    .where(and(eq(schema.serviceAssignments.workspaceId, actor.workspaceId), eq(schema.serviceAssignments.membershipId, actor.membershipId)));
  return {
    kind: 'assigned',
    clientIds: new Set(clientRows.map((r) => r.clientId)),
    serviceEngagementIds: new Set(serviceRows.map((r) => r.serviceEngagementId)),
    serviceClientIds: new Map(serviceRows.map((r) => [r.serviceEngagementId, r.clientId])),
  };
}

// The durable client/user relationship: client_contacts.user_id in this
// workspace. Nothing else (email, invitation history, request input) links
// a Client to a client.
async function loadContactScope(db, actor) {
  if (!actor.userId) return { kind: 'contact', clientIds: new Set() };
  const rows = await db
    .select({ clientId: schema.clientContacts.clientId })
    .from(schema.clientContacts)
    .where(and(eq(schema.clientContacts.workspaceId, actor.workspaceId), eq(schema.clientContacts.userId, actor.userId)));
  return { kind: 'contact', clientIds: new Set(rows.map((r) => r.clientId)) };
}

// Load the actor for one request: role baseline, explicit capability rows,
// and the assignment or contact rows that give the role its reach. The
// membership must already have been resolved as ACTIVE in an ACTIVE
// workspace (lib/bloomops/access.mjs does that); an inactive one gets an
// actor that every evaluation refuses.
export async function loadActor(db, access) {
  const actor = baseActor(access);
  if (!actor) return null;
  if (actor.status !== 'active') {
    return { ...actor, capabilities: new Set(), scope: { kind: 'none' } };
  }
  const kind = SCOPE_BY_ROLE[actor.role];
  if (!kind) return { ...actor, capabilities: new Set(), scope: { kind: 'none' } };
  actor.capabilities = actorCapabilities(actor.role, kind === 'contact' ? [] : await loadCapabilityKeys(db, actor));
  if (kind === 'workspace') actor.scope = { kind: 'workspace' };
  else if (kind === 'assigned') actor.scope = await loadAssignedScope(db, actor);
  else actor.scope = await loadContactScope(db, actor);
  return actor;
}

function loaded(actor, field) {
  if (!actor || actor[field] == null) {
    throw new Error(`authorization: actor.${field} was not loaded; use loadActor before checking ${field}`);
  }
  return actor[field];
}

// ── the questions ─────────────────────────────────────────────────────────

export function hasCapability(actor, capability) {
  if (!actor || actor.status !== 'active' || !isCapability(capability)) return false;
  return loaded(actor, 'capabilities').has(capability);
}

export function canAccessClient(actor, clientId) {
  if (!actor || actor.status !== 'active' || !clientId) return false;
  const scope = loaded(actor, 'scope');
  if (scope.kind === 'workspace') return true;
  if (scope.kind === 'assigned' || scope.kind === 'contact') return scope.clientIds.has(clientId);
  return false;
}

// A service engagement is reachable through an assignment to it or to its
// client. A Client contact reaches every engagement of their own client.
export function canAccessService(actor, { serviceEngagementId, clientId = null } = {}) {
  if (!actor || actor.status !== 'active' || !serviceEngagementId) return false;
  const scope = loaded(actor, 'scope');
  if (scope.kind === 'workspace') return true;
  if (scope.kind === 'assigned') {
    if (scope.serviceEngagementIds.has(serviceEngagementId)) return true;
    return Boolean(clientId) && scope.clientIds.has(clientId);
  }
  if (scope.kind === 'contact') return Boolean(clientId) && scope.clientIds.has(clientId);
  return false;
}

// Does the actor's reach cover this record? A record that names a service
// is service-scoped; one that names only a client is client-scoped; one
// that names neither is workspace-level, which internal roles reach and a
// Client never does.
export function inScope(actor, resource) {
  if (!actor || !resource) return false;
  if (resource.serviceEngagementId) return canAccessService(actor, resource);
  if (resource.clientId) return canAccessClient(actor, resource.clientId);
  const scope = loaded(actor, 'scope');
  return scope.kind === 'workspace' || scope.kind === 'assigned';
}

// Does the record's visibility admit this actor? Scope is a separate
// question, checked first by evaluate; a client-visible record of another
// client is still out of reach.
export function canSeeVisibility(actor, resource) {
  if (!actor || actor.status !== 'active' || !resource) return false;
  const visibility = resource.visibility == null ? 'internal' : resource.visibility;
  if (!VISIBILITIES.includes(visibility)) return false;
  if (actor.role === 'client') return visibility === 'client';
  if (visibility !== 'restricted') return true;
  if (RESTRICTED_BY_ROLE.has(actor.role)) return true;
  const named = resource.restrictedToMembershipIds;
  return Array.isArray(named) && named.includes(actor.membershipId);
}

function deny(reason, { notFound = false } = {}) {
  return { allowed: false, reason, outcome: notFound ? 'not_found' : 'forbidden' };
}

// The decision. `reason` is for tests and logs, never for an HTTP body.
// `outcome` says how a route should answer a refusal: 'not_found' when
// admitting the record exists would leak (another workspace, out of
// scope, hidden by visibility, or simply absent), 'forbidden' when the
// actor can see the record or there is no record.
export function evaluate(actor, { action, resource = null } = {}) {
  if (!actor) return deny('no_actor');
  if (actor.status !== 'active') return deny('membership_inactive');
  if (!isAction(action)) return deny('unknown_action');
  const policy = ACTIONS[action];

  if (resource) {
    if (!resource.workspaceId || resource.workspaceId !== actor.workspaceId) return deny('foreign_workspace', { notFound: true });
    if (!inScope(actor, resource)) return deny('scope', { notFound: true });
    if (!canSeeVisibility(actor, resource)) return deny('visibility', { notFound: true });
  } else if (policy.resource) {
    return deny('resource_required');
  }

  if (!policy.roles.includes(actor.role)) return deny('role');
  if (policy.capability && !hasCapability(actor, policy.capability)) return deny('capability');
  return { allowed: true, reason: 'ok', outcome: 'ok' };
}

// The capabilities to show a person about themself, sorted.
export function listCapabilities(actor) {
  if (!actor || actor.status !== 'active' || !actor.capabilities) return [];
  return CAPABILITIES.filter((key) => actor.capabilities.has(key));
}

// ── resource descriptors for the current tables ───────────────────────────

// Both loaders take the actor's workspace and look only inside it, so an id
// from another workspace comes back as null, the same as a wrong id. The
// engine compares workspaceId again anyway.

export async function loadClientResource(db, workspaceId, clientId) {
  if (!workspaceId || !clientId) return null;
  const rows = await db
    .select({ id: schema.clients.id, workspaceId: schema.clients.workspaceId })
    .from(schema.clients)
    .where(and(eq(schema.clients.workspaceId, workspaceId), eq(schema.clients.id, String(clientId))))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // A client's own record is by nature visible to that client's contacts.
  // What they see of it is a projection decided by the portal, not here.
  return { type: 'client', id: row.id, workspaceId: row.workspaceId, clientId: row.id, visibility: 'client' };
}

// The same client record seen as an internal operational record (A6). The
// generic descriptor above is client-visible, because a portal contact may
// legitimately be shown a projection of their own client. The internal
// Clients area is a different thing: health, the internal owner, the
// contact directory, operational activity, and the controls that change
// any of it. Marking those surfaces `internal` is what stops a Client
// membership calling an internal route directly and being answered, and
// it does so through the one engine rather than a second rule in a
// handler. Every A6 internal page and route loads its client through this.
export async function loadInternalClientResource(db, workspaceId, clientId) {
  const resource = await loadClientResource(db, workspaceId, clientId);
  return resource ? { ...resource, visibility: 'internal' } : null;
}

// `clientId`, when given, is part of the lookup rather than a comparison
// afterwards: a nested route names both the client and the engagement, and
// an engagement that belongs to a different client of the same workspace
// must answer exactly as one that does not exist.
export async function loadServiceResource(db, workspaceId, serviceEngagementId, { clientId = null } = {}) {
  if (!workspaceId || !serviceEngagementId) return null;
  const where = [eq(schema.serviceEngagements.workspaceId, workspaceId), eq(schema.serviceEngagements.id, String(serviceEngagementId))];
  if (clientId) where.push(eq(schema.serviceEngagements.clientId, String(clientId)));
  const rows = await db
    .select({ id: schema.serviceEngagements.id, workspaceId: schema.serviceEngagements.workspaceId, clientId: schema.serviceEngagements.clientId })
    .from(schema.serviceEngagements)
    .where(and(...where))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { type: 'service_engagement', id: row.id, workspaceId: row.workspaceId, clientId: row.clientId, serviceEngagementId: row.id, visibility: 'client' };
}

// The same engagement seen as an internal operational record (A7), the
// service counterpart of loadInternalClientResource.
//
// The generic descriptor above is client-visible on purpose: a portal
// contact may legitimately be shown a projection of a service their own
// client bought. Internal service management is a different thing, and it
// is what A7 actually built: the package, the scope notes, the lifecycle
// controls, and who inside the agency is assigned to the work. Marking
// those surfaces `internal` is what stops a Client membership calling an
// internal service route directly and being answered, and it does so
// through the one engine rather than a second rule in a handler.
export async function loadInternalServiceResource(db, workspaceId, serviceEngagementId, options = {}) {
  const resource = await loadServiceResource(db, workspaceId, serviceEngagementId, options);
  return resource ? { ...resource, visibility: 'internal' } : null;
}

// ── capability grants ─────────────────────────────────────────────────────

async function findMembershipInWorkspace(db, workspaceId, membershipId) {
  const rows = await db
    .select()
    .from(schema.workspaceMemberships)
    .where(and(eq(schema.workspaceMemberships.workspaceId, workspaceId), eq(schema.workspaceMemberships.id, membershipId)))
    .limit(1);
  return rows[0] || null;
}

// Grant one capability to one membership of this workspace. Refused for an
// unknown key, a membership outside the workspace (indistinguishable from
// a wrong id), a removed membership, and any Client membership. Granting
// what is already held is a no-op. The grant is inert while the membership
// is not active and revives with it.
export async function grantCapability(db, { workspaceId, membershipId, capability, grantedByMembershipId = null, now = new Date() }) {
  if (!isCapability(capability)) return { ok: false, reason: 'unknown_capability' };
  const target = await findMembershipInWorkspace(db, workspaceId, String(membershipId || ''));
  if (!target) return { ok: false, reason: 'not_found' };
  if (target.status === 'removed') return { ok: false, reason: 'removed' };
  if (!GRANTABLE_ROLES.has(target.role)) return { ok: false, reason: 'role' };
  const existing = await db
    .select({ id: schema.memberCapabilities.id })
    .from(schema.memberCapabilities)
    .where(and(eq(schema.memberCapabilities.membershipId, target.id), eq(schema.memberCapabilities.capability, capability)))
    .limit(1);
  if (existing[0]) return { ok: true, unchanged: true };
  const iso = now.toISOString();
  await db.insert(schema.memberCapabilities).values({
    workspaceId,
    membershipId: target.id,
    capability,
    grantedByMembershipId: grantedByMembershipId || null,
    createdAt: iso,
  });
  await recordActivity(db, {
    workspaceId,
    eventType: ACTIVITY.CAPABILITY_GRANTED,
    subjectType: 'membership',
    subjectId: target.id,
    actorMembershipId: grantedByMembershipId || null,
    metadata: { capability },
    occurredAt: iso,
  });
  return { ok: true };
}

export async function revokeCapability(db, { workspaceId, membershipId, capability, revokedByMembershipId = null, now = new Date() }) {
  if (!isCapability(capability)) return { ok: false, reason: 'unknown_capability' };
  const target = await findMembershipInWorkspace(db, workspaceId, String(membershipId || ''));
  if (!target) return { ok: false, reason: 'not_found' };
  const rows = await db
    .delete(schema.memberCapabilities)
    .where(and(
      eq(schema.memberCapabilities.workspaceId, workspaceId),
      eq(schema.memberCapabilities.membershipId, target.id),
      eq(schema.memberCapabilities.capability, capability),
    ))
    .returning({ id: schema.memberCapabilities.id });
  if (!rows[0]) return { ok: true, unchanged: true };
  await recordActivity(db, {
    workspaceId,
    eventType: ACTIVITY.CAPABILITY_REVOKED,
    subjectType: 'membership',
    subjectId: target.id,
    actorMembershipId: revokedByMembershipId || null,
    metadata: { capability },
    occurredAt: now.toISOString(),
  });
  return { ok: true };
}
