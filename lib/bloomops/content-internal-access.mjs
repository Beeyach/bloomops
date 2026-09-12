// Internal dispatch only. Social/approval/portal callers keep their explicit
// Social loaders. Every Ads grant is resolved from the current stored Project.
import { and, eq, or, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { projectReadCondition, projectAssignmentCondition } from './project-access.mjs';
import { departmentProjectCondition } from './department-work.mjs';
import { contentReadCondition } from './content-access.mjs';
import { noRequestedApproval } from './content-approval-access.mjs';

const c = schema.contentItems, p = schema.projects;
export { ADS_STAGES } from './content-pipeline-values.mjs';
export function adsProjectVisibilityCondition(actor, visibility = 'internal') {
  return and(sql`${visibility} IN ('internal','restricted')`, ['owner','admin'].includes(actor?.role)
    ? sql`1` : sql`(${visibility}='internal' OR ${projectAssignmentCondition(actor)})`);
}
export function adsParentCondition(actor, visibility = 'internal') {
  return and(projectReadCondition(actor), departmentProjectCondition('ads'), adsProjectVisibilityCondition(actor, visibility));
}
export function adsContentParentCondition(actor, visibility = c.visibility) {
  return sql`EXISTS (SELECT 1 FROM projects WHERE ${p.id}=${c.adsProjectId}
    AND ${p.workspaceId}=${c.workspaceId} AND ${p.clientId}=${c.clientId}
    AND ${p.serviceEngagementId}=${c.serviceEngagementId} AND ${adsParentCondition(actor, visibility)})`;
}
export const adsContentReadCondition = actor => and(eq(c.productionArea,'ads'), eq(c.workspaceId,actor?.workspaceId || ''), adsContentParentCondition(actor));
export const internalContentReadCondition = actor => or(contentReadCondition(actor), adsContentReadCondition(actor));
export const adsWorkflowCondition = () => and(sql`${c.stage} IN ('idea','script','editing','internal_review','revision_requested')`,
  eq(c.recordingRequired,false), eq(c.internalReviewRequired,true), eq(c.clientApprovalRequired,true), sql`${c.publishedAt} IS NULL`, noRequestedApproval());
export const internalContentWriteCondition = actor => or(contentReadCondition(actor), and(adsContentReadCondition(actor),adsWorkflowCondition()));

function resource(row, actor, type) {
  return row ? {...row,type,authorizedMembershipId:actor.membershipId,restrictedToMembershipIds:[actor.membershipId]} : null;
}
export async function loadAdsParentResource(db,actor,projectId) {
  const [row]=await db.select({id:p.id,projectId:p.id,workspaceId:p.workspaceId,clientId:p.clientId,serviceEngagementId:p.serviceEngagementId})
    .from(p).where(and(eq(p.id,String(projectId)),adsParentCondition(actor))).limit(1);
  return resource(row && {...row,visibility:'internal'},actor,'ads_content_parent');
}
export async function loadInternalContentResource(db,actor,contentId,{write=false}={}) {
  const [row]=await db.select({id:c.id,workspaceId:c.workspaceId,clientId:c.clientId,serviceEngagementId:c.serviceEngagementId,
    productionArea:c.productionArea,projectId:c.adsProjectId,visibility:c.visibility}).from(c)
    .where(and(eq(c.id,String(contentId)),write?internalContentWriteCondition(actor):internalContentReadCondition(actor))).limit(1);
  return resource(row && {...row,visibility:row.visibility==='restricted'?'restricted':'internal'},actor,row?.productionArea==='ads'?'ads_content':'content');
}
