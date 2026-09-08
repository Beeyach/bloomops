import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { describeEvent } from './client-activity.mjs';
import { projectReadCondition } from './project-access.mjs';

export async function projectActivity(db, actor, projectId) {
  const a = schema.activityEvents, p = schema.projects, m = schema.workspaceMemberships;
  const rows = await db.select({ id: a.id, eventType: a.eventType, metadata: a.metadataJson,
    occurredAt: a.occurredAt, actor: schema.user.name }).from(a)
    .innerJoin(p, and(eq(p.workspaceId, a.workspaceId), eq(p.id, a.subjectId)))
    .leftJoin(m, and(eq(m.workspaceId, a.workspaceId), eq(m.id, a.actorMembershipId)))
    .leftJoin(schema.user, eq(schema.user.id, m.userId))
    .where(and(eq(a.subjectType, 'project'), eq(p.id, String(projectId)), projectReadCondition(actor)))
    .orderBy(desc(a.occurredAt), sql`activity_events.rowid DESC`).limit(60);
  return rows.map(({ eventType, metadata, ...row }) => {
    let parsed = {};
    try { parsed = JSON.parse(metadata || '{}') || {}; } catch {}
    return { ...row, ...describeEvent(eventType, parsed) };
  });
}
