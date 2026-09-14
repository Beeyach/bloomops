import {and,eq,desc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition} from './workspaces.mjs';
import {normalizeProspectFields} from './prospect-values.mjs';
import {conversionUnrestricted,conversionRecipientProtection} from './prospect-conversion-stops.mjs';
const r=schema.prospectReplyStates,d=schema.prospectDeliveries,a=schema.prospectOutreachApprovals,p=schema.prospects;

// Accepted snapshots are immutable recipient provenance. Mutable prospect/draft
// addresses must never move a hold or stop away from the original recipient.
export const recipientUnrestricted=(workspaceId,recipient,prospectId=null)=>and(conversionUnrestricted(workspaceId,recipient,prospectId),sql`NOT EXISTS(
 SELECT 1 FROM prospect_reply_states rr
 JOIN prospect_deliveries rd ON rd.workspace_id=rr.workspace_id AND rd.prospect_id=rr.prospect_id AND rd.id=rr.delivery_id
 JOIN prospect_outreach_approvals ra ON ra.workspace_id=rd.workspace_id AND ra.id=rd.approval_id
 WHERE rr.workspace_id=${workspaceId} AND rd.state='accepted'
 AND (rr.hold_state IN ('held','stopped') OR rr.check_status IN ('checking','unresolved'))
 AND json_extract(ra.snapshot_json,'$.draft.recipient')=${recipient})`);

export async function getRecipientProtection(db,actor,recipient,prospectId=null){
 if(!actor||!evaluate(actor,{action:'prospecting.manage'}).allowed)return null;
 const normalized=normalizeProspectFields({publicEmail:recipient});
 if(!normalized.ok||!normalized.fields.publicEmail)return null;
 const converted=await conversionRecipientProtection(db,actor,normalized.fields.publicEmail,prospectId);if(converted)return converted;
 const [row]=await db.select({prospectId:d.prospectId,businessName:p.businessName,holdState:r.holdState,checkStatus:r.checkStatus})
  .from(r).innerJoin(d,and(eq(d.workspaceId,r.workspaceId),eq(d.prospectId,r.prospectId),eq(d.id,r.deliveryId)))
  .innerJoin(a,and(eq(a.workspaceId,d.workspaceId),eq(a.id,d.approvalId)))
  .innerJoin(p,and(eq(p.workspaceId,d.workspaceId),eq(p.id,d.prospectId)))
  .where(and(eq(r.workspaceId,actor.workspaceId),eq(d.state,'accepted'),administratorCondition(actor,{purpose:'prospecting'}),
   sql`(${r.holdState} IN ('held','stopped') OR ${r.checkStatus} IN ('checking','unresolved'))`,
   sql`json_extract(${a.snapshotJson},'$.draft.recipient')=${normalized.fields.publicEmail}`))
  .orderBy(sql`CASE ${r.holdState} WHEN 'stopped' THEN 0 WHEN 'held' THEN 1 ELSE 2 END`,desc(r.updatedAt),r.prospectId).limit(1);
 return row?{prospectId:row.prospectId,businessName:row.businessName,recipient:normalized.fields.publicEmail,kind:row.holdState==='stopped'?'stopped':row.holdState==='held'?'held':'checking'}:null;
}
