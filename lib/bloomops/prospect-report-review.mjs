import {and,eq,desc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition} from './workspaces.mjs';
import {exact} from './prospect-outreach-values.mjs';
import {discoveryEnabled} from './prospect-mailbox.mjs';
import {getProspectMailboxReview} from './prospect-mailbox-review.mjs';
import {stopProspectOutreachForReport} from './prospect-replies.mjs';
import {checkProspectDeliveryReport} from './prospect-report-checks.mjs';
const m=schema.prospectRecoveryMessages,z=schema.prospectDiscoveryRuns,q=schema.prospectReportChecks,p=schema.prospects,r=schema.prospectReplyStates;
async function reference(actor,email,row){
 const bytes=new TextEncoder().encode(JSON.stringify([actor.workspaceId,email,row.runId,row.providerMessageId]));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function load(db,actor,env){
 const base=await getProspectMailboxReview(db,actor,env);if(!base)return null;
 const email=base.accountEmail,auth=administratorCondition(actor,{purpose:'prospecting'});
 let rows=[],states=[],settled=0,mailboxSettled=false;
 if(email){
  rows=await db.select({runId:m.runId,providerMessageId:m.providerMessageId,receivedAt:m.receivedAt,kind:m.kind,
   checkId:q.id,deliveryId:q.deliveryId,replyRevision:r.revision,holdState:r.holdState,stopReason:r.stopReason,stopNote:r.stopNote,stoppedAt:r.stoppedAt,status:q.status,expiresAt:q.expiresAt,reason:q.reason,checkedAt:q.finishedAt,action:q.action,statusCode:q.statusCode,prospectId:p.id,businessName:p.businessName,website:p.website})
   .from(m).innerJoin(z,and(eq(z.workspaceId,m.workspaceId),eq(z.id,m.runId)))
   .leftJoin(q,and(eq(q.workspaceId,m.workspaceId),eq(q.accountEmail,email),eq(q.providerMessageId,m.providerMessageId),sql`NOT EXISTS(SELECT 1 FROM prospect_report_checks newer WHERE newer.workspace_id=${q.workspaceId} AND newer.account_email=${q.accountEmail} AND newer.provider_message_id=${q.providerMessageId} AND (newer.created_at>${q.createdAt} OR newer.created_at=${q.createdAt} AND newer.id>${q.id}))`))
   .leftJoin(r,and(eq(r.workspaceId,q.workspaceId),eq(r.prospectId,q.prospectId),eq(r.deliveryId,q.deliveryId)))
   .leftJoin(p,and(eq(p.workspaceId,m.workspaceId),sql`${p.id}=coalesce(${q.prospectId},${m.prospectId})`))
   .where(and(eq(m.workspaceId,actor.workspaceId),eq(z.accountEmail,email),sql`${z.status} IN ('checked','unresolved')`,sql`${m.kind} IN ('delivery_report','needs_review')`,auth,
    sql`NOT EXISTS(SELECT 1 FROM prospect_recovery_messages newer JOIN prospect_discovery_runs nr ON nr.workspace_id=newer.workspace_id AND nr.id=newer.run_id WHERE newer.workspace_id=${m.workspaceId} AND nr.account_email=${email} AND newer.provider_message_id=${m.providerMessageId} AND nr.status IN ('checked','unresolved') AND (nr.created_at>${z.createdAt} OR nr.created_at=${z.createdAt} AND nr.id>${z.id}))`))
   .orderBy(desc(m.receivedAt),desc(m.runId),desc(m.providerMessageId)).limit(51);
  const [mailbox]=await db.select({settled:sql`check_id IS NULL`}).from(schema.prospectDiscoveryStates).where(and(eq(schema.prospectDiscoveryStates.workspaceId,actor.workspaceId),eq(schema.prospectDiscoveryStates.accountEmail,email),auth)).limit(1);mailboxSettled=Boolean(mailbox?.settled);
  states=await db.select({status:q.status,expiresAt:q.expiresAt,finishedAt:q.finishedAt}).from(q).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,email),auth,sql`(${q.status}='checking' OR ${q.finishedAt}>${new Date(Date.now()-30000).toISOString()})`));
  const [count]=await db.select({n:sql`count(*)`}).from(schema.prospectDeliveries).innerJoin(schema.prospectReplyStates,sql`prospect_reply_states.workspace_id=prospect_deliveries.workspace_id AND prospect_reply_states.delivery_id=prospect_deliveries.id AND prospect_reply_states.prospect_id=prospect_deliveries.prospect_id`)
   .where(and(eq(schema.prospectDeliveries.workspaceId,actor.workspaceId),eq(schema.prospectDeliveries.accountEmail,email),eq(schema.prospectDeliveries.state,'accepted'),sql`prospect_reply_states.check_id IS NULL AND prospect_reply_states.hold_state IN ('held','stopped')`,auth));settled=Number(count.n);
 }
 const candidates=await Promise.all(rows.slice(0,50).map(async row=>({...row,selection:await reference(actor,email,row)})));
 // Complete the read with the existing authoritative membership/account check.
 const current=await getProspectMailboxReview(db,actor,env);
 if(!current||current.accountEmail!==email||current.connectionRevision!==base.connectionRevision||current.senderRevision!==base.senderRevision)return null;
 const busy=states.some(s=>s.status==='checking'&&Date.parse(s.expiresAt)>Date.now());
 const cooling=states.some(s=>s.status!=='superseded'&&Date.parse(s.finishedAt)>Date.now()-30000);
 const blocked=!email?'connect':current.reason==='connection'?'connection':current.total<1?'no_deliveries':current.total>100?'limit':current.registered!==current.total?'thread_checks':settled!==current.total?'thread_checks':!mailboxSettled?'mailbox':current.reason==='busy'?'busy':busy?'busy':cooling?'cooldown':null;
 const items=candidates.map(row=>{
  const enabled=email&&discoveryEnabled(env,actor,email)&&env.BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED==='true'&&env.BLOOMOPS_GOOGLE_REPORT_RUN_ID===row.runId&&env.BLOOMOPS_GOOGLE_REPORT_MESSAGE_ID===row.providerMessageId;
  const reason=row.status==='associated'?'complete':blocked||(!enabled?'disabled':null);
  return {selection:row.selection,receivedAt:row.receivedAt,status:row.status==='checking'&&Date.parse(row.expiresAt)<=Date.now()?'interrupted':row.status||'pending',checkedAt:row.checkedAt,
   action:row.action,statusCode:row.statusCode,replyRevision:row.replyRevision||0,canConfirm:row.status==='associated'&&row.action==='failed'&&row.statusCode?.startsWith('5.')&&Boolean(row.replyRevision)&&row.holdState!=='stopped',stop:row.holdState==='stopped'?{reason:row.stopReason,note:row.stopNote,at:row.stoppedAt}:null,canCheck:reason===null,reason,
   prospect:row.prospectId?{id:row.prospectId,businessName:row.businessName,website:row.website}:null};
 });
 return {candidates,data:{workspaceId:actor.workspaceId,accountEmail:email,expectedRevision:current.expectedRevision,connectionRevision:current.connectionRevision,senderRevision:current.senderRevision,items,more:rows.length>50,reason:blocked,held:true,authenticity:'unverified'}};
}
export async function getProspectReportReview(db,actor,env){return (await load(db,actor,env))?.data||null;}
export async function reviewProspectReport(db,actor,env,sessionId,input,options){
 if(!exact(input,['workspaceId','selection','expectedRevision','connectionRevision','senderRevision','reviewed'])||input.reviewed!==true||typeof input.selection!=='string'||! /^[a-f0-9]{64}$/.test(input.selection))return {conflict:true,error:'Reload the report review before continuing.'};
 input={...input};
 const view=await load(db,actor,env);if(!view)return null;
 const {data,candidates}=view;
 if(['workspaceId','expectedRevision','connectionRevision','senderRevision'].some(k=>input[k]!==data[k]))return {conflict:true,error:'This report review changed. Reload before continuing.'};
 const candidate=candidates.find(x=>x.selection===input.selection);if(!candidate)return {conflict:true,error:'This saved report is no longer in this review. Reload before continuing.'};
 return checkProspectDeliveryReport(db,actor,env,sessionId,{workspaceId:data.workspaceId,accountEmail:data.accountEmail,recoveryRunId:candidate.runId,providerMessageId:candidate.providerMessageId,expectedRevision:input.expectedRevision,connectionRevision:input.connectionRevision,senderRevision:input.senderRevision,reviewed:true},options);
}

// Human judgement records a stop; it never authenticates the report or reads mail.
export async function confirmProspectReport(db,actor,env,sessionId,input){
 if(!exact(input,['workspaceId','selection','expectedRevision','connectionRevision','senderRevision','reviewed','note'])||input.reviewed!==true||typeof input.selection!=='string'||! /^[a-f0-9]{64}$/.test(input.selection))return {conflict:true,error:'Reload the report review before continuing.'};
 input={...input};const view=await load(db,actor,env);if(!view)return null;
 const {data,candidates}=view,row=data.items.find(x=>x.selection===input.selection),candidate=candidates.find(x=>x.selection===input.selection);
 if(['workspaceId','connectionRevision','senderRevision'].some(k=>input[k]!==data[k])||!row?.canConfirm||input.expectedRevision!==row.replyRevision)return {conflict:true,error:'This stop review changed. Reload before continuing.'};
 return stopProspectOutreachForReport(db,actor,sessionId,{workspaceId:data.workspaceId,prospectId:row.prospect.id,deliveryId:candidate.deliveryId,expectedRevision:input.expectedRevision,reason:'hard_bounce',note:input.note,reviewed:true},{reportCheckId:candidate.checkId,connectionRevision:input.connectionRevision,senderRevision:input.senderRevision});
}
