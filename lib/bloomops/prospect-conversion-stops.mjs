import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition} from './workspaces.mjs';
// Receipt identity and its captured recipients are immutable. Editing a profile
// or changing a draft address cannot undo the sale's permanent stop.
export const conversionUnrestricted=(workspaceId,recipient,prospectId=null)=>sql`NOT EXISTS(
 SELECT 1 FROM prospect_conversions pc WHERE pc.workspace_id=${workspaceId}
 AND (pc.prospect_id=${prospectId} OR EXISTS(SELECT 1 FROM json_each(pc.recipient_emails_json) ce WHERE ce.value=${recipient})))`;
export async function conversionRecipientProtection(db,actor,recipient,prospectId=null){
 const r=schema.prospectConversions,p=schema.prospects;
 const [row]=await db.select({prospectId:r.prospectId,businessName:p.businessName}).from(r).innerJoin(p,and(eq(p.workspaceId,r.workspaceId),eq(p.id,r.prospectId))).where(and(eq(r.workspaceId,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}),sql`(${r.prospectId}=${prospectId} OR EXISTS(SELECT 1 FROM json_each(${r.recipientEmailsJson}) e WHERE e.value=${recipient}))`)).orderBy(r.createdAt,r.id).limit(1);
 return row?{...row,recipient,kind:'stopped'}:null;
}
