// Explicitly recorded human facts. These events never send or clear protection.
import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {REQUEST_ID,insertSelected} from './workspaces.mjs';
import {evaluate} from './authorization.mjs';
import {activityValues} from './activity.mjs';
const types={contact:'PROSPECT_MANUAL_CONTACT',interest:'PROSPECT_INTEREST_RECORDED',resolved:'PROSPECT_REPLY_RESOLVED'};
export async function recordProspectContactFact(db,actor,id,input,now=new Date()){
 if(!actor||!evaluate(actor,{action:'prospecting.manage'}).allowed)return null;
 if(!input||Object.keys(input).some(k=>!['workspaceId','requestId','kind','occurredAt','note'].includes(k))||input.workspaceId!==actor.workspaceId||typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId)||!Object.hasOwn(types,input.kind)||typeof input.note!=='string'||!input.note.trim()||input.note.length>1000||typeof input.occurredAt!=='string'||!/^\d{4}-\d\d-\d\dT/.test(input.occurredAt)||!Number.isFinite(Date.parse(input.occurredAt))||Date.parse(input.occurredAt)>now.getTime())return {invalid:true,error:'Record an actual contact or conversation decision with a date and note.'};
 const p=schema.prospects,a=schema.activityEvents,iso=new Date(input.occurredAt).toISOString(),metadata=JSON.stringify({note:input.note.trim(),source:'manual'}),read=()=>db.select({id:a.id,eventType:a.eventType,occurredAt:a.occurredAt,metadata:a.metadataJson}).from(a).innerJoin(p,and(eq(p.workspaceId,a.workspaceId),eq(p.id,a.subjectId))).where(and(prospectCondition(actor),eq(p.id,id),eq(a.id,input.requestId))).limit(1);
 const match=row=>row.eventType===types[input.kind]&&row.occurredAt===iso&&row.metadata===metadata?{ok:true}: {conflict:true,error:'This request already recorded a different fact.'};
 const [prior]=await read();if(prior)return match(prior);
 const values={id:input.requestId,...activityValues({workspaceId:actor.workspaceId,eventType:types[input.kind],subjectType:'prospect',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:iso}),metadataJson:metadata,createdAt:now.toISOString()};
 try{await db.batch([insertSelected(db,a,values,p,and(prospectCondition(actor),eq(p.id,id),sql`NOT EXISTS(SELECT 1 FROM activity_events WHERE id=${input.requestId})`))]);}catch(e){const [winner]=await read();if(winner)return match(winner);throw e;}
 const [saved]=await read();return saved?match(saved):null;
}
