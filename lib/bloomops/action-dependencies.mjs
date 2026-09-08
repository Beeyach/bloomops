import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { schema } from './db.mjs';
import { activityValues } from './activity.mjs';
import { newId } from './clients.mjs';
import { actionReadCondition, actionWriteCondition, readableAction } from './action-access.mjs';
import { actionConflict, actionEvent, actionInvalid, actionRevision, actionSuccess, authorizeAction } from './actions.mjs';

const a = schema.actions, d = schema.actionDependencies, e = schema.activityEvents, p = schema.projects;
const target = alias(a, 'target_action');
const receiptExists = id => sql`EXISTS (SELECT 1 FROM activity_events WHERE id=${id})`;
const pair = (source, targetId) => and(eq(d.workspaceId, source.workspaceId), eq(d.projectId, source.projectId), eq(d.actionId, source.id), eq(d.dependsOnActionId, targetId));
const targetReadable = (actor, source, targetId) => sql`EXISTS (SELECT 1 FROM actions target_action
  WHERE ${target.workspaceId}=${source.workspaceId} AND ${target.projectId}=${source.projectId} AND ${target.id}=${targetId} AND ${readableAction(actor, target)})`;

// UNION visits a node once even for long chains and diamonds. This predicate
// is evaluated by the conditional write while holding the D1 transaction's
// write lock. The migration trigger independently enforces the same invariant.
const createsCycle = (source, targetId) => sql`EXISTS (
  WITH RECURSIVE reachable(id) AS (
    SELECT ${targetId} UNION
    SELECT edge.depends_on_action_id FROM action_dependencies edge JOIN reachable ON edge.action_id=reachable.id
    WHERE edge.workspace_id=${source.workspaceId} AND edge.project_id=${source.projectId}
  ) SELECT 1 FROM reachable WHERE id=${source.id})`;

async function accessibleTarget(db, actor, source, targetId) {
  const access = await authorizeAction(db, actor, targetId);
  return access.ok && access.action.workspaceId === source.workspaceId && access.action.projectId === source.projectId;
}

export async function listActionDependencies(db, actor, actionId) {
  const access = await authorizeAction(db, actor, actionId);
  if (!access.ok) return access;
  const items = await db.select({ id: d.id, actionId: a.id, title: a.title, status: a.status }).from(d)
    .innerJoin(a, and(eq(a.workspaceId, d.workspaceId), eq(a.projectId, d.projectId), eq(a.id, d.dependsOnActionId)))
    .innerJoin(p, and(eq(p.workspaceId, a.workspaceId), eq(p.id, a.projectId)))
    .where(and(pair(access.action, a.id), actionReadCondition(actor),
      // A reassignment between the initial check and this query must not
      // expose even a previously accessible Action's prerequisite graph.
      sql`EXISTS (SELECT 1 FROM actions target_action WHERE ${target.id}=${String(actionId)} AND ${readableAction(actor, target)})`))
    .orderBy(asc(a.title), asc(d.id));
  return { ok: true, items: items.map(item => ({ ...item, satisfied: item.status === 'done' })) };
}

function receipt(db, actor, access, condition, id, type, now) {
  const values = { id, ...activityValues(actionEvent(actor, access.resource, access.action, type, {}, now)), createdAt: now.toISOString() };
  return db.insert(e).select(db.select(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sql`${value}`.as(key)]))).from(a).where(condition));
}

export async function addActionDependency(db, { actor, actionId, dependsOnActionId, expectedRevision, now = new Date() }) {
  const access = await authorizeAction(db, actor, actionId, 'action.dependencies');
  if (!access.ok) return access;
  if (!actionRevision(expectedRevision) || typeof dependsOnActionId !== 'string' || !dependsOnActionId || dependsOnActionId.length > 120) return actionInvalid({ dependency: 'Choose a prerequisite Action and refresh before saving.' });
  const source = access.action;
  if (!(await accessibleTarget(db, actor, source, dependsOnActionId))) return { ok: false, reason: 'not_found' };
  if (source.id === dependsOnActionId) return { ok: false, reason: 'cycle' };
  const existing = () => db.select({ id: d.id }).from(d).where(pair(source, dependsOnActionId)).limit(1);
  if ((await existing()).length) return actionSuccess(source.id, true);
  if (expectedRevision !== source.revision) return actionConflict();
  const receiptId = newId(), edgeId = newId(), iso = now.toISOString();
  const condition = and(eq(a.id, source.id), eq(a.revision, source.revision), actionWriteCondition(actor), targetReadable(actor, source, dependsOnActionId),
    sql`NOT ${createsCycle(source, dependsOnActionId)}`, sql`NOT EXISTS (SELECT 1 FROM action_dependencies WHERE ${pair(source, dependsOnActionId)})`);
  const results = await db.batch([
    receipt(db, actor, access, condition, receiptId, 'ACTION_DEPENDENCY_ADDED', now),
    db.insert(d).select(db.select({ id: sql`${edgeId}`.as('id'), workspaceId: a.workspaceId, projectId: a.projectId,
      actionId: a.id, dependsOnActionId: sql`${dependsOnActionId}`.as('dependsOnActionId'), createdAt: sql`${iso}`.as('createdAt') })
      .from(a).where(and(eq(a.id, source.id), receiptExists(receiptId)))),
    db.update(a).set({ revision: sql`${a.revision}+1`, updatedAt: iso }).where(and(eq(a.id, source.id), receiptExists(receiptId))).returning({ id: a.id }),
  ]);
  if (results[2].length) return actionSuccess(source.id);
  const fresh = await authorizeAction(db, actor, source.id, 'action.dependencies');
  if (!fresh.ok || !(await accessibleTarget(db, actor, source, dependsOnActionId))) return actionConflict();
  if ((await existing()).length) return actionSuccess(source.id, true);
  const [cycle] = await db.select({ cyclic: createsCycle(source, dependsOnActionId) }).from(a).where(eq(a.id, source.id)).limit(1);
  return cycle?.cyclic ? { ok: false, reason: 'cycle' } : actionConflict();
}

export async function removeActionDependency(db, { actor, actionId, dependencyId, expectedRevision, now = new Date() }) {
  const access = await authorizeAction(db, actor, actionId, 'action.dependencies');
  if (!access.ok) return access;
  if (!actionRevision(expectedRevision) || typeof dependencyId !== 'string' || !dependencyId || dependencyId.length > 120) return actionInvalid({ dependency: 'Refresh before removing a dependency.' });
  const source = access.action;
  const conditionForEdge = and(eq(d.id, dependencyId), eq(d.workspaceId, source.workspaceId), eq(d.projectId, source.projectId), eq(d.actionId, source.id));
  const existing = () => db.select({ targetId: d.dependsOnActionId }).from(d).where(conditionForEdge).limit(1);
  const [edge] = await existing();
  if (!edge) return actionSuccess(source.id, true);
  if (!(await accessibleTarget(db, actor, source, edge.targetId))) return { ok: false, reason: 'not_found' };
  if (expectedRevision !== source.revision) return actionConflict();
  const receiptId = newId();
  const condition = and(eq(a.id, source.id), eq(a.revision, source.revision), actionWriteCondition(actor), targetReadable(actor, source, edge.targetId),
    sql`EXISTS (SELECT 1 FROM action_dependencies WHERE ${conditionForEdge})`);
  const results = await db.batch([
    receipt(db, actor, access, condition, receiptId, 'ACTION_DEPENDENCY_REMOVED', now),
    db.delete(d).where(and(conditionForEdge, receiptExists(receiptId))),
    db.update(a).set({ revision: sql`${a.revision}+1`, updatedAt: now.toISOString() }).where(and(eq(a.id, source.id), receiptExists(receiptId))).returning({ id: a.id }),
  ]);
  if (results[2].length) return actionSuccess(source.id);
  const fresh = await authorizeAction(db, actor, source.id, 'action.dependencies');
  return fresh.ok && !(await existing()).length ? actionSuccess(source.id, true) : actionConflict();
}
