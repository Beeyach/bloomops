import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { contentReadCondition, contentClientReadCondition } from './content-access.mjs';
const c=schema.contentItems,r=schema.contentApprovalRounds;
export const noRequestedApproval = () => sql`NOT EXISTS (SELECT 1 FROM content_approval_rounds ar WHERE ar.workspace_id=${c.workspaceId} AND ar.content_id=${c.id} AND ar.status='requested')`;
export const approvalClientCondition = contentClientReadCondition;
export const approvalJoin = () => and(eq(r.workspaceId,c.workspaceId),eq(r.contentId,c.id));
export const requestedApprovalCondition = () => and(eq(r.status,'requested'),eq(c.stage,'client_review'),eq(c.clientApprovalRequired,true));
export async function loadApprovalResource(db,actor,roundId,{portal=false,retry=false}={}) {
  const [row]=await db.select({id:r.id,workspaceId:c.workspaceId,clientId:c.clientId,serviceEngagementId:c.serviceEngagementId,visibility:c.visibility})
    .from(r).innerJoin(c,approvalJoin()).where(and(eq(r.id,String(roundId)),portal?approvalClientCondition(actor):contentReadCondition(actor),
      portal ? retry ? sql`(${requestedApprovalCondition()} OR (${r.status} IN ('approved','changes_requested') AND ${r.respondedBy}=${actor?.membershipId||''}))` : requestedApprovalCondition() : undefined)).limit(1);
  return row ? {...row,type:'content_approval',visibility:portal?'client':row.visibility==='restricted'?'restricted':'internal',restrictedToMembershipIds:[actor.membershipId]} : null;
}
