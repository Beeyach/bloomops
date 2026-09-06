// What a signed-in person may know about the state of the workspace, in
// counts, for the shell's Home and the initial states of Clients and
// Onboarding. Every number is read through the actor's scope, the same
// reach the A4 engine grants for records: workspace-wide for Owner, Admin,
// and Project Manager; assignments only for a Team Member; nothing for
// anybody else. Team figures need members.manage, because the directory
// is not for everyone and its size says something about it.
//
// Nothing here is a feature. A6 owns the Clients list and A8 the
// onboarding engine; this reads the canonical tables they will fill so the
// shell can show real state and an honest zero instead of sample data.
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { hasCapability } from './authorization.mjs';

const CLIENT_STATUS_LABELS = {
  draft: 'Draft',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  ended: 'Ended',
};

export function clientStatusLabel(status) {
  return CLIENT_STATUS_LABELS[status] || status;
}

function count(rows) {
  return Number(rows[0]?.n) || 0;
}

// The client ids an assigned actor reaches directly. A service assignment
// reaches the engagement, not the client record, so it is not here.
function assignedClientIds(actor) {
  return actor.scope?.kind === 'assigned' ? [...actor.scope.clientIds] : [];
}

async function countClients(db, actor) {
  const ws = actor.workspaceId;
  if (actor.scope?.kind === 'workspace') {
    return count(await db.select({ n: sql`count(*)` }).from(schema.clients).where(eq(schema.clients.workspaceId, ws)));
  }
  const ids = assignedClientIds(actor);
  if (ids.length === 0) return 0;
  return count(await db.select({ n: sql`count(*)` }).from(schema.clients).where(and(eq(schema.clients.workspaceId, ws), inArray(schema.clients.id, ids))));
}

async function countEngagements(db, actor) {
  const ws = actor.workspaceId;
  const t = schema.serviceEngagements;
  if (actor.scope?.kind === 'workspace') {
    return count(await db.select({ n: sql`count(*)` }).from(t).where(eq(t.workspaceId, ws)));
  }
  if (actor.scope?.kind !== 'assigned') return 0;
  const clientIds = [...actor.scope.clientIds];
  const engagementIds = [...actor.scope.serviceEngagementIds];
  if (clientIds.length === 0 && engagementIds.length === 0) return 0;
  const reach = [];
  if (clientIds.length) reach.push(inArray(t.clientId, clientIds));
  if (engagementIds.length) reach.push(inArray(t.id, engagementIds));
  return count(await db.select({ n: sql`count(*)` }).from(t).where(and(eq(t.workspaceId, ws), reach.length === 1 ? reach[0] : or(...reach))));
}

async function countOnboarding(db, actor) {
  const ws = actor.workspaceId;
  const t = schema.onboardingInstances;
  const open = sql`${t.status} <> 'complete'`;
  if (actor.scope?.kind === 'workspace') {
    return count(await db.select({ n: sql`count(*)` }).from(t).where(and(eq(t.workspaceId, ws), open)));
  }
  const ids = assignedClientIds(actor);
  if (ids.length === 0) return 0;
  return count(await db.select({ n: sql`count(*)` }).from(t).where(and(eq(t.workspaceId, ws), open, inArray(t.clientId, ids))));
}

async function teamCounts(db, actor) {
  if (!hasCapability(actor, 'members.manage')) return null;
  const ws = actor.workspaceId;
  const m = schema.workspaceMemberships;
  const i = schema.workspaceInvitations;
  const active = count(await db.select({ n: sql`count(*)` }).from(m).where(and(eq(m.workspaceId, ws), eq(m.status, 'active'))));
  const pending = count(
    await db
      .select({ n: sql`count(*)` })
      .from(i)
      .where(and(eq(i.workspaceId, ws), eq(i.status, 'pending'), sql`${i.expiresAt} > ${new Date().toISOString()}`)),
  );
  return { active, pendingInvitations: pending };
}

// { clients, engagements, onboardingOpen, team: { active, pendingInvitations } | null }
export async function workspaceOverview(db, actor) {
  if (!actor || actor.status !== 'active' || !actor.scope || actor.scope.kind === 'none' || actor.scope.kind === 'contact') {
    return { clients: 0, engagements: 0, onboardingOpen: 0, team: null };
  }
  const [clients, engagements, onboardingOpen, team] = await Promise.all([
    countClients(db, actor),
    countEngagements(db, actor),
    countOnboarding(db, actor),
    teamCounts(db, actor),
  ]);
  return { clients, engagements, onboardingOpen, team };
}

// The clients the actor may see, name and relationship status only, in
// name order. The Clients area of A5 shows this and nothing more; A6
// builds the real list.
export async function visibleClients(db, actor, { limit = 50 } = {}) {
  if (!actor || actor.status !== 'active' || !actor.scope) return [];
  const ws = actor.workspaceId;
  const t = schema.clients;
  let where;
  if (actor.scope.kind === 'workspace') where = eq(t.workspaceId, ws);
  else if (actor.scope.kind === 'assigned') {
    const ids = assignedClientIds(actor);
    if (ids.length === 0) return [];
    where = and(eq(t.workspaceId, ws), inArray(t.id, ids));
  } else return [];
  const rows = await db
    .select({ id: t.id, name: t.name, relationshipStatus: t.relationshipStatus })
    .from(t)
    .where(where)
    .orderBy(t.name)
    .limit(limit);
  return rows.map((r) => ({ ...r, statusLabel: clientStatusLabel(r.relationshipStatus) }));
}

// The client records a Client contact is linked to, for the portal. Only
// the durable client_contacts.user_id link counts (A4); an unlinked Client
// gets an empty list and the portal says so.
export async function portalClients(db, actor) {
  if (!actor || actor.status !== 'active' || actor.scope?.kind !== 'contact') return [];
  const ids = [...actor.scope.clientIds];
  if (ids.length === 0) return [];
  const t = schema.clients;
  const rows = await db
    .select({ id: t.id, name: t.name, relationshipStatus: t.relationshipStatus })
    .from(t)
    .where(and(eq(t.workspaceId, actor.workspaceId), inArray(t.id, ids)))
    .orderBy(t.name);
  return rows.map((r) => ({ ...r, statusLabel: clientStatusLabel(r.relationshipStatus) }));
}
