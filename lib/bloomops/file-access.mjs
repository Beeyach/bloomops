import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { projectAssignmentCondition, projectReadCondition } from './project-access.mjs';

// Project scope is checked once. A Deliverable adds a visibility ceiling;
// neither a File nor an Action assignment creates a new parent grant.
export function fileVisibilityCondition(actor, column, { portal = false } = {}) {
  if (portal) return eq(column, 'client');
  return ['owner', 'admin'].includes(actor?.role) ? sql`1`
    : sql`(${column} IN ('internal','client') OR (${column}='restricted' AND ${projectAssignmentCondition(actor)}))`;
}

export function fileSubjectCondition(actor, { portal = false, deliverableId = null, visibility = 'internal' } = {}) {
  const p = schema.projects;
  return and(projectReadCondition(actor, { portal }),
    visibility === 'restricted' && !['owner', 'admin'].includes(actor?.role) ? projectAssignmentCondition(actor) : sql`1`,
    deliverableId === null ? sql`1` : sql`EXISTS (SELECT 1 FROM deliverables WHERE deliverables.workspace_id=${p.workspaceId}
      AND deliverables.project_id=${p.id} AND deliverables.id=${deliverableId}
      AND ${fileVisibilityCondition(actor, schema.deliverables.visibility, { portal })})`);
}

export function fileReadCondition(actor, { portal = false, ready = portal } = {}) {
  const f = schema.assets;
  return and(eq(f.workspaceId, actor?.workspaceId || ''), ready ? eq(f.status, 'ready') : undefined,
    sql`EXISTS (SELECT 1 FROM asset_links JOIN projects ON projects.id=asset_links.project_id AND projects.workspace_id=asset_links.workspace_id
      LEFT JOIN deliverables ON deliverables.id=asset_links.deliverable_id AND deliverables.project_id=projects.id AND deliverables.workspace_id=projects.workspace_id
      WHERE asset_links.asset_id=${f.id} AND asset_links.workspace_id=${f.workspaceId}
      AND ${projectReadCondition(actor, { portal })} AND ${fileVisibilityCondition(actor, f.visibility, { portal })}
      AND (asset_links.deliverable_id IS NULL OR (deliverables.id IS NOT NULL AND ${fileVisibilityCondition(actor, schema.deliverables.visibility, { portal })})))`);
}

export const fileWritable = (actor, visibility) => ['owner', 'admin', 'project_manager'].includes(actor?.role)
  ? and(fileReadCondition(actor), visibility === 'restricted' && !['owner', 'admin'].includes(actor.role)
    ? sql`EXISTS (SELECT 1 FROM asset_links JOIN project_assignments pa ON pa.project_id=asset_links.project_id AND pa.workspace_id=asset_links.workspace_id
      WHERE asset_links.asset_id=${schema.assets.id} AND pa.membership_id=${actor.membershipId})` : undefined) : sql`0`;

export async function loadFileResource(db, actor, fileId, { portal = false, ready = portal } = {}) {
  const f = schema.assets, l = schema.assetLinks, p = schema.projects, d = schema.deliverables;
  const [row] = await db.select({ id: f.id, workspaceId: f.workspaceId, projectId: p.id, clientId: p.clientId,
    serviceEngagementId: p.serviceEngagementId, visibility: f.visibility, parentVisibility: p.visibility, childVisibility: d.visibility })
    .from(f).innerJoin(l, eq(l.assetId, f.id)).innerJoin(p, eq(p.id, l.projectId)).leftJoin(d, eq(d.id, l.deliverableId))
    .where(and(eq(f.id, String(fileId)), fileReadCondition(actor, { portal, ready }))).limit(1);
  if (!row) return null;
  const restricted = [row.visibility, row.parentVisibility, row.childVisibility].includes('restricted');
  const members = restricted ? await db.select({ id: schema.projectAssignments.membershipId }).from(schema.projectAssignments)
    .where(and(eq(schema.projectAssignments.workspaceId, row.workspaceId), eq(schema.projectAssignments.projectId, row.projectId))) : [];
  const { parentVisibility, childVisibility, ...resource } = row;
  return { ...resource, type: 'file', visibility: restricted ? 'restricted' : portal ? 'client' : 'internal', restrictedToMembershipIds: members.map(m => m.id) };
}
