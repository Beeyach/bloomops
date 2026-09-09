import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { contentReadCondition } from './content-access.mjs';
import { liveProjectActor } from './project-access.mjs';
const c=schema.contentItems,r=schema.contentApprovalRounds;
export const noRequestedApproval = () => sql`NOT EXISTS (SELECT 1 FROM content_approval_rounds ar WHERE ar.workspace_id=${c.workspaceId} AND ar.content_id=${c.id} AND ar.status='requested')`;
export function approvalClientCondition(actor) {
  if (!actor?.scope || actor.role!=='client') return sql`0`;
  return and(eq(c.workspaceId,actor.workspaceId),liveProjectActor(actor),eq(c.visibility,'client'),
    sql`EXISTS (SELECT 1 FROM bloomops_clients cc JOIN client_contacts contact ON contact.workspace_id=cc.workspace_id AND contact.client_id=cc.id
      WHERE cc.workspace_id=${c.workspaceId} AND cc.id=${c.clientId} AND contact.user_id=${actor.userId})`,
    sql`(${c.serviceEngagementId} IS NULL OR EXISTS (SELECT 1 FROM service_engagements se
      JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id
      JOIN departments dept ON dept.workspace_id=st.workspace_id AND dept.id=st.department_id
      WHERE se.workspace_id=${c.workspaceId} AND se.client_id=${c.clientId} AND se.id=${c.serviceEngagementId} AND dept.slug='social'))`);
}
export const approvalJoin = () => and(eq(r.workspaceId,c.workspaceId),eq(r.contentId,c.id));
export const requestedApprovalCondition = () => and(eq(r.status,'requested'),eq(c.stage,'client_review'),eq(c.clientApprovalRequired,true));
export async function loadApprovalResource(db,actor,roundId,{portal=false,retry=false}={}) {
  const [row]=await db.select({id:r.id,workspaceId:c.workspaceId,clientId:c.clientId,serviceEngagementId:c.serviceEngagementId,visibility:c.visibility})
    .from(r).innerJoin(c,approvalJoin()).where(and(eq(r.id,String(roundId)),portal?approvalClientCondition(actor):contentReadCondition(actor),
      portal ? retry ? sql`(${requestedApprovalCondition()} OR (${r.status} IN ('approved','changes_requested') AND ${r.respondedBy}=${actor?.membershipId||''}))` : requestedApprovalCondition() : undefined)).limit(1);
  return row ? {...row,type:'content_approval',visibility:portal?'client':row.visibility==='restricted'?'restricted':'internal',restrictedToMembershipIds:[actor.membershipId]} : null;
}
