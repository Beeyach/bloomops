import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { liveProjectActor, projectReadCondition } from './project-access.mjs';
import { actionReadCondition } from './action-access.mjs';
import { deliverableReadCondition } from './deliverable-access.mjs';
import { previewClientCondition, previewContext } from './preview-policy.mjs';

export const DISCUSSION_TYPES = ['client', 'project', 'action', 'deliverable'];
export const discussionManager = actor => ['owner', 'admin', 'project_manager'].includes(actor?.role);
export const discussionWritable = actor => actor?.status === 'active' && !previewContext(actor);
export const validDiscussionParent = parent => parent && DISCUSSION_TYPES.includes(parent.type)
  && typeof parent.id === 'string' && /^[\w-]{1,128}$/.test(parent.id);

// The client-wide boundary is intentionally narrower than a project, service,
// or task assignment. Evaluate live rows, never a cached actor.scope ID list.
export function discussionClientCondition(actor) {
  const c = schema.clients;
  if (!actor?.scope) return sql`0`;
  const grant = discussionManager(actor) ? sql`1` : actor.role === 'team_member'
    ? sql`EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${c.workspaceId} AND ca.client_id=${c.id} AND ca.membership_id=${actor.membershipId})`
    : actor.role === 'client' ? sql`EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.workspace_id=${c.workspaceId} AND cc.client_id=${c.id} AND cc.user_id=${actor.userId})` : sql`0`;
  return and(eq(c.workspaceId, actor.workspaceId), liveProjectActor(actor), previewClientCondition(actor, c.id), grant);
}

export function discussionParentCondition(actor, parent) {
  if (!actor?.scope || !validDiscussionParent(parent)) return sql`0`;
  const portal = actor.role === 'client';
  switch (parent.type) {
    case 'client': return sql`EXISTS (SELECT 1 FROM bloomops_clients WHERE id=${parent.id} AND ${discussionClientCondition(actor)})`;
    case 'project': return sql`EXISTS (SELECT 1 FROM projects WHERE id=${parent.id} AND ${projectReadCondition(actor, {portal})})`;
    case 'action': return sql`EXISTS (SELECT 1 FROM actions JOIN projects ON projects.id=actions.project_id AND projects.workspace_id=actions.workspace_id WHERE actions.id=${parent.id} AND ${actionReadCondition(actor)})`;
    case 'deliverable': return sql`EXISTS (SELECT 1 FROM deliverables JOIN projects ON projects.id=deliverables.project_id AND projects.workspace_id=deliverables.workspace_id WHERE deliverables.id=${parent.id} AND ${deliverableReadCondition(actor, {portal})})`;
    default: return sql`0`;
  }
}

// An internal reader may start an explicitly client-visible thread only where
// the canonical parent could be presented in the portal. This does not reveal
// the existence of contacts and does not create a contact or grant.
export function discussionPortalEligible(parent) {
  switch (parent.type) {
    case 'client': return sql`1`;
    case 'project': return sql`EXISTS (SELECT 1 FROM projects WHERE id=${parent.id} AND visibility='client')`;
    case 'deliverable': return sql`EXISTS (SELECT 1 FROM deliverables d JOIN projects p ON p.id=d.project_id AND p.workspace_id=d.workspace_id WHERE d.id=${parent.id} AND d.visibility='client' AND p.visibility='client')`;
    default: return sql`0`;
  }
}

export function discussionThreadCondition(actor, parent, table = schema.recordDiscussionThreads) {
  return and(eq(table.workspaceId, actor?.workspaceId || ''), eq(table.parentType, parent.type), eq(table.parentId, parent.id),
    discussionParentCondition(actor, parent), actor?.role === 'client' ? eq(table.audience, 'client') : sql`1`);
}

export function discussionStartCondition(actor, parent, audience) {
  if (!discussionWritable(actor) || !['internal', 'client'].includes(audience)) return sql`0`;
  if (actor.role === 'client') return audience === 'client' ? discussionParentCondition(actor, parent) : sql`0`;
  if (audience === 'client' && !discussionManager(actor)) return sql`0`;
  return and(discussionParentCondition(actor, parent), audience === 'client' ? discussionPortalEligible(parent) : sql`1`);
}

export function discussionParentQuery(db, actor, parent) {
  const p = schema.projects, c = schema.clients, a = schema.actions, d = schema.deliverables;
  const common = {type: sql`${parent.type}`.as('type')};
  if (parent.type === 'client') return db.select({...common, id:c.id, name:c.name, clientId:sql`${c.id}`.as('clientId'), projectId:sql`NULL`.as('projectId')}).from(c).where(and(eq(c.id,parent.id),discussionParentCondition(actor,parent))).limit(1);
  if (parent.type === 'project') return db.select({...common,id:p.id,name:actor.role==='client'?sql`coalesce(${p.clientLabel},${p.name})`:p.name,clientId:p.clientId,projectId:sql`${p.id}`.as('projectId')}).from(p).where(and(eq(p.id,parent.id),discussionParentCondition(actor,parent))).limit(1);
  const child = parent.type === 'action' ? a : d;
  return db.select({...common,id:child.id,name:actor.role==='client'&&parent.type==='deliverable'?sql`coalesce(${d.clientLabel},'Deliverable')`:child.title,clientId:p.clientId,projectId:sql`${p.id}`.as('projectId')}).from(child)
    .innerJoin(p,and(eq(p.workspaceId,child.workspaceId),eq(p.id,child.projectId))).where(and(eq(child.id,parent.id),discussionParentCondition(actor,parent))).limit(1);
}
