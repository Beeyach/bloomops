import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { describeEvent } from './client-activity.mjs';
import { projectReadCondition } from './project-access.mjs';
import { milestoneReadCondition } from './milestone-access.mjs';
import { actionReadCondition } from './action-access.mjs';

export async function projectActivity(db, actor, projectId) {
  const a = schema.activityEvents, p = schema.projects, m = schema.workspaceMemberships, child = schema.milestones, action = schema.actions;
  const rows = await db.select({ id: a.id, eventType: a.eventType, metadata: a.metadataJson,
    occurredAt: a.occurredAt, actor: schema.user.name }).from(a)
    .leftJoin(child, and(eq(child.workspaceId, a.workspaceId), eq(child.id, a.subjectId), eq(a.subjectType, 'milestone')))
    .leftJoin(action, and(eq(action.workspaceId, a.workspaceId), eq(action.id, a.subjectId), eq(a.subjectType, 'action')))
    .innerJoin(p, and(eq(p.workspaceId, a.workspaceId), sql`(${a.subjectType}='project' AND ${p.id}=${a.subjectId}) OR (${a.subjectType}='milestone' AND ${p.id}=${child.projectId}) OR (${a.subjectType}='action' AND ${p.id}=${action.projectId})`))
    .leftJoin(m, and(eq(m.workspaceId, a.workspaceId), eq(m.id, a.actorMembershipId)))
    .leftJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(p.id, String(projectId)), projectReadCondition(actor), sql`(${a.subjectType}='project' OR (${a.subjectType}='milestone' AND ${milestoneReadCondition(actor)}) OR (${a.subjectType}='action' AND ${actionReadCondition(actor)}))`))
    .orderBy(desc(a.occurredAt), sql`activity_events.rowid DESC`).limit(60);
  return rows.map(({ eventType, metadata, ...row }) => {
    let parsed = {};
    try { parsed = JSON.parse(metadata || '{}') || {}; } catch {}
    return { ...row, ...describeEvent(eventType, parsed) };
  });
}
