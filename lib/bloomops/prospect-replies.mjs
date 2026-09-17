import {and, eq, desc, inArray, sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition, insertSelected} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {readTogether} from './read-batch.mjs';
import {exact} from './prospect-outreach-values.mjs';
import {googleConfiguration, openGoogle, storedGoogleTokens, GOOGLE_SCOPES} from './prospect-google-provider.mjs';
import {inspectGoogleReplyThread} from './prospect-reply-observations.mjs';
const d=schema.prospectDeliveries, p=schema.prospects, a=schema.prospectOutreachApprovals;
const r=schema.prospectReplyStates, o=schema.prospectReplyObservations, m=schema.workspaceMemberships;
const g=schema.prospectGoogleConnections, s=schema.prospectSenders;
const h=schema.prospectDeliveryIdentities;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const auth=actor=>administratorCondition(actor,{purpose:'prospecting'});
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const conflict=()=>({conflict:true,error:'This review changed. Reload before continuing.'});
const unavailable=()=>({unavailable:true,error:'Thread checks are disabled or the original Google account needs a connection check.'});
const scope=(actor,id)=>and(eq(r.workspaceId,actor.workspaceId),eq(r.prospectId,id),auth(actor));
const session=(actor,id)=>sql`EXISTS(SELECT 1 FROM session WHERE id=${id} AND user_id=${actor.userId} AND expires_at>${Date.now()})`;
const version=(actor,id)=>sql`coalesce((SELECT revision FROM prospect_reply_states WHERE workspace_id=${actor.workspaceId} AND prospect_id=${id}),0)`;

export function replyCheckEnabled(env,receipt){
 if(!googleConfiguration(env)||env.BLOOMOPS_ENV!=='development'||env.BLOOMOPS_MAIL_TRANSPORT!=='r2-dev'||env.BLOOMOPS_GOOGLE_REPLY_CHECK_ENABLED!=='true'||env.BLOOMOPS_GOOGLE_REPLY_DELIVERY_ID!==receipt.id)return false;
 try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(env.BLOOMOPS_APP_URL).hostname);}catch{return false;}
}
async function context(db,actor,id){
 const [row]=await db.select({receipt:d,snapshotJson:a.snapshotJson,businessName:p.businessName,website:p.website})
  .from(d).innerJoin(p,and(eq(p.id,d.prospectId),eq(p.workspaceId,d.workspaceId)))
  .innerJoin(a,and(eq(a.id,d.approvalId),eq(a.workspaceId,d.workspaceId)))
  .where(and(eq(d.workspaceId,actor.workspaceId),eq(d.prospectId,id),eq(d.state,'accepted'),auth(actor))).limit(1);
 return row?{...row,snapshot:JSON.parse(row.snapshotJson)}:null;
}
async function actorStamp(db,actor,sessionId){
 if(!validId(sessionId))return null;
 const [member]=await db.select({updatedAt:m.updatedAt}).from(m).where(and(eq(m.id,actor.membershipId),eq(m.workspaceId,actor.workspaceId),auth(actor),session(actor,sessionId))).limit(1);
 return member?.updatedAt||null;
}
const liveActor=(actor,sessionId,stamp)=>and(auth(actor),session(actor,sessionId),sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${actor.membershipId} AND workspace_id=${actor.workspaceId} AND updated_at=${stamp})`);
async function access(db,actor,env,row){
 if(!replyCheckEnabled(env,row.receipt))return null;
 return replyAccountAccess(db,actor,env,row.receipt.accountEmail,row.snapshot.sender.email);
}
export async function replyAccountAccess(db,actor,env,accountEmail,expectedSender){
 const config=googleConfiguration(env);if(!config)return null;
 const [grant]=await db.select({grant:g,senderRevision:s.revision}).from(g).innerJoin(s,eq(s.workspaceId,g.workspaceId))
  .where(and(eq(g.workspaceId,actor.workspaceId),eq(g.active,1),eq(g.accountEmail,accountEmail),expectedSender?eq(g.senderEmail,expectedSender):undefined,eq(s.email,g.senderEmail),eq(g.checkStatus,'healthy'),sql`${g.checkId} IS NULL`,auth(actor),
   sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE id=${g.authorizedByMembershipId} AND workspace_id=${g.workspaceId} AND updated_at=${g.authorizerUpdatedAt} AND status='active' AND role IN ('owner','admin'))`)).limit(1);
 if(!grant||!GOOGLE_SCOPES.every(scope=>grant.grant.grantedScope?.split(/\s+/).includes(scope)))return null;
 const tokens=storedGoogleTokens(await openGoogle(config,actor.workspaceId+':tokens',grant.grant.tokenBox));
 return tokens&&Date.parse(tokens.expiresAt)>Date.now()+60000?{...grant,tokens}:null;
}
const liveGrant=(actor,access)=>sql`EXISTS(SELECT 1 FROM prospect_google_connections gc JOIN prospect_senders gs ON gs.workspace_id=gc.workspace_id JOIN workspace_memberships gm ON gm.workspace_id=gc.workspace_id AND gm.id=gc.authorized_by_membership_id
 WHERE gc.workspace_id=${actor.workspaceId} AND gc.revision=${access.grant.revision} AND gc.active=1 AND gc.account_email=${access.grant.accountEmail} AND gc.sender_email=${access.grant.senderEmail} AND gc.check_status='healthy' AND gc.check_id IS NULL
 AND gs.revision=${access.senderRevision} AND gs.email=gc.sender_email AND gm.updated_at=gc.authorizer_updated_at AND gm.status='active' AND gm.role IN ('owner','admin'))`;
export {actorStamp,liveActor,liveGrant};

export async function getProspectReplies(db,actor,env,id){
 if(!allowed(actor)||!validId(id))return null;
 const row=await context(db,actor,id);if(!row)return null;
 const [state]=await db.select().from(r).where(scope(actor,id)).limit(1);
 const observations=await db.select({id:o.id,kind:o.kind,match:o.match,receivedAt:o.receivedAt,createdAt:o.createdAt}).from(o)
  .where(and(eq(o.workspaceId,actor.workspaceId),eq(o.prospectId,id),auth(actor))).orderBy(desc(o.createdAt),desc(o.id)).limit(101);
 const [sender]=await db.select({revision:s.revision}).from(s).where(and(eq(s.workspaceId,actor.workspaceId),auth(actor))).limit(1);
 const [grant]=await db.select({revision:g.revision}).from(g).where(and(eq(g.workspaceId,actor.workspaceId),auth(actor))).limit(1);
 const available=await access(db,actor,env,row);
 // Recheck authority after the async token work; never return a stale authorized DTO.
 if(!await context(db,actor,id))return null;
 const busy=Boolean(state?.checkId&&Date.parse(state.checkExpiresAt)>Date.now());
 const cooling=Boolean(state?.checkedAt&&Date.parse(state.checkedAt)>Date.now()-30000);
 return {workspaceId:actor.workspaceId,prospectId:id,deliveryId:row.receipt.id,businessName:row.businessName,website:row.website,
  sender:row.snapshot.sender.email,recipient:row.snapshot.draft.recipient,subject:row.snapshot.draft.subject,
  revision:state?.revision||0,senderRevision:sender?.revision||0,connectionRevision:grant?.revision||0,
  state:state?{holdState:state.holdState,checkStatus:state.checkStatus,checkedAt:state.checkedAt,stopReason:state.stopReason,stopNote:state.stopNote,stoppedAt:state.stoppedAt}:null,
  busy,cooling,enabled:replyCheckEnabled(env,row.receipt),canCheck:Boolean(available&&!busy&&!cooling&&state?.holdState!=='stopped'),observations:observations.slice(0,100),moreObservations:observations.length>100};
}
export async function prospectReplyOverview(db,actor,page=1){
 if(!allowed(actor)||!Number.isInteger(page)||page<1||page>10000)return null;
 const condition=and(eq(d.workspaceId,actor.workspaceId),eq(d.state,'accepted'),inArray(r.holdState,['held','stopped']),auth(actor));
 const [rows,counts]=await readTogether(db,db=>Promise.all([
  db.select({id:p.id,businessName:p.businessName,website:p.website,holdState:r.holdState,checkStatus:r.checkStatus,stopReason:r.stopReason,stopNote:r.stopNote})
   .from(d).innerJoin(p,and(eq(p.workspaceId,d.workspaceId),eq(p.id,d.prospectId))).innerJoin(r,and(eq(r.workspaceId,d.workspaceId),eq(r.prospectId,d.prospectId),eq(r.deliveryId,d.id)))
   .where(condition).orderBy(desc(r.updatedAt),desc(d.acceptedAt),desc(d.id)).limit(21).offset((page-1)*20),
  db.select({holdState:r.holdState,checkStatus:r.checkStatus,stopReason:r.stopReason,count:sql`count(*)`})
   .from(d).innerJoin(r,and(eq(r.workspaceId,d.workspaceId),eq(r.prospectId,d.prospectId),eq(r.deliveryId,d.id)))
   .where(condition).groupBy(r.holdState,r.checkStatus,r.stopReason),
 ]));
 return {rows:rows.slice(0,20),groups:counts.map(row=>({...row,count:Number(row.count)})),page,more:rows.length>20,total:counts.reduce((sum,row)=>sum+Number(row.count),0)};
}
function validCommand(actor,input,extra){return exact(input,['workspaceId','prospectId','deliveryId','expectedRevision',...extra])&&input.workspaceId===actor.workspaceId&&validId(input.prospectId)&&validId(input.deliveryId)&&revision(input.expectedRevision);}
const activity=(db,table,condition,actor,id,eventType,metadata,iso)=>activityForMutation(db,table,condition,{workspaceId:actor.workspaceId,eventType,subjectType:'prospect',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata,occurredAt:iso});

export async function checkProspectReplies(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!allowed(actor))return null;
 if(!validCommand(actor,input,['senderRevision','connectionRevision','reviewed'])||!revision(input.senderRevision)||!revision(input.connectionRevision)||input.reviewed!==true)return conflict();
 const row=await context(db,actor,input.prospectId);if(!row)return null;if(row.receipt.id!==input.deliveryId)return conflict();
 const stamp=await actorStamp(db,actor,sessionId);if(!stamp)return conflict();
 const grant=await access(db,actor,env,row);if(!grant)return unavailable();
 if(grant.senderRevision!==input.senderRevision||grant.grant.revision!==input.connectionRevision)return conflict();
 const now=clock(),iso=now.toISOString(),checkId=crypto.randomUUID(),checkExpiresAt=new Date(now.getTime()+90000).toISOString();
 const current=()=>and(liveActor(actor,sessionId,stamp),liveGrant(actor,grant));
 const claim=and(eq(d.workspaceId,actor.workspaceId),eq(d.prospectId,input.prospectId),eq(d.id,input.deliveryId),eq(d.state,'accepted'),current(),sql`${version(actor,input.prospectId)}=${input.expectedRevision}`,
  sql`NOT EXISTS(SELECT 1 FROM prospect_reply_states WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId} AND (hold_state='stopped' OR check_expires_at>${iso} OR checked_at>${new Date(now.getTime()-30000).toISOString()}))`);
 const values={workspaceId:actor.workspaceId,prospectId:input.prospectId,deliveryId:input.deliveryId,revision:1,holdState:'clear',checkStatus:'checking',checkId,checkExpiresAt,createdAt:iso,updatedAt:iso};
 const claimed=and(scope(actor,input.prospectId),eq(r.checkId,checkId));
 const claims=await db.batch([insertSelected(db,r,values,d,claim).onConflictDoUpdate({target:[r.workspaceId,r.prospectId],set:{revision:sql`${r.revision}+1`,checkStatus:'checking',checkId,checkExpiresAt,updatedAt:iso}}).returning({revision:r.revision}),activity(db,r,claimed,actor,input.prospectId,'PROSPECT_REPLY_CHECK_STARTED',{deliveryId:input.deliveryId},iso)]);
 if(!claims[0].length)return conflict();
 const completeGuard=()=>and(claimed,current(),sql`${r.holdState}!='stopped'`,sql`${r.checkExpiresAt}>${clock().toISOString()}`);
 const [final]=await db.select({id:r.checkId}).from(r).where(completeGuard()).limit(1);
 if(!final||Date.parse(grant.tokens.expiresAt)<=Date.now()+30000)return conflict();
 const result=await inspectGoogleReplyThread(grant.tokens.accessToken,{receipt:row.receipt,snapshot:row.snapshot,accountEmail:grant.grant.accountEmail},{fetcher});
 const completed=clock().toISOString(),observations=result.status==='observed'?result.observations:[];
 // One bound JSON value keeps full-size threads below D1's parameter ceiling.
 const noCollision=observations.length?sql`NOT EXISTS(SELECT 1 FROM prospect_reply_observations WHERE workspace_id=${actor.workspaceId} AND account_email=${grant.grant.accountEmail} AND prospect_id!=${input.prospectId} AND provider_message_id IN (SELECT value FROM json_each(${JSON.stringify(observations.map(x=>x.providerMessageId))})))`:sql`1`;
 const statements=[];
 // Verify the association in the same atomic batch that records observations.
 // A concurrent registry conflict must finish held/unresolved, never silently
 // accept a different returned identity or partially attach its observations.
 let verified=sql`0`;
 if(result.status==='observed'){
  const identity=result.identity,id=crypto.randomUUID();
  const compatible=sql`NOT EXISTS(SELECT 1 FROM prospect_delivery_identities WHERE workspace_id=${actor.workspaceId} AND
   ((delivery_id=${input.deliveryId} AND (account_email!=${identity.accountEmail} OR provider_message_id!=${identity.providerMessageId} OR provider_thread_id!=${identity.providerThreadId} OR rfc_message_id!=${identity.rfcMessageId}))
    OR (delivery_id!=${input.deliveryId} AND account_email=${identity.accountEmail} AND (rfc_message_id=${identity.rfcMessageId} OR provider_message_id=${identity.providerMessageId}))))`;
  statements.push(insertSelected(db,h,{id,workspaceId:actor.workspaceId,prospectId:input.prospectId,deliveryId:input.deliveryId,...identity,verifiedByMembershipId:actor.membershipId,connectionRevision:grant.grant.revision,senderRevision:grant.senderRevision,createdAt:completed},r,and(completeGuard(),noCollision,compatible)).onConflictDoNothing());
  statements.push(activity(db,h,and(eq(h.id,id),eq(h.workspaceId,actor.workspaceId)),actor,input.prospectId,'PROSPECT_DELIVERY_IDENTITY_VERIFIED',{deliveryId:input.deliveryId},completed));
  verified=sql`EXISTS(SELECT 1 FROM prospect_delivery_identities WHERE workspace_id=${actor.workspaceId} AND delivery_id=${input.deliveryId} AND account_email=${identity.accountEmail} AND provider_message_id=${identity.providerMessageId} AND provider_thread_id=${identity.providerThreadId} AND rfc_message_id=${identity.rfcMessageId})`;
 }
 const accepted=and(verified,noCollision),guard=and(completeGuard(),accepted);
 for(const item of observations){
  const id=crypto.randomUUID();
  statements.push(insertSelected(db,o,{id,workspaceId:actor.workspaceId,prospectId:input.prospectId,deliveryId:input.deliveryId,accountEmail:grant.grant.accountEmail,providerMessageId:item.providerMessageId,receivedAt:item.receivedAt,kind:item.kind,match:item.match,observedByMembershipId:actor.membershipId,createdAt:completed},r,guard).onConflictDoNothing());
  statements.push(activity(db,o,and(eq(o.id,id),eq(o.workspaceId,actor.workspaceId)),actor,input.prospectId,'PROSPECT_REPLY_OBSERVED',{deliveryId:input.deliveryId,kind:item.kind},completed));
 }
 statements.push(activity(db,r,guard,actor,input.prospectId,'PROSPECT_REPLY_CHECKED',{deliveryId:input.deliveryId,status:'checked'},completed));
 statements.push(activity(db,r,and(completeGuard(),sql`NOT (${accepted})`),actor,input.prospectId,'PROSPECT_REPLY_CHECKED',{deliveryId:input.deliveryId,status:'unresolved'},completed));
 statements.push(db.update(r).set({revision:sql`${r.revision}+1`,holdState:result.hold?'held':sql`CASE WHEN ${accepted} THEN ${r.holdState} ELSE 'held' END`,checkStatus:sql`CASE WHEN ${accepted} THEN 'checked' ELSE 'unresolved' END`,checkId:null,checkExpiresAt:null,checkedAt:completed,updatedAt:completed}).where(completeGuard()).returning({revision:r.revision,checkStatus:r.checkStatus}));
 const results=await db.batch(statements);if(!results.at(-1).length)return conflict();
 return await context(db,actor,input.prospectId)?{checked:true,status:results.at(-1)[0].checkStatus==='checked'?'observed':'unresolved'}:null;
}

export async function stopProspectOutreach(db,actor,sessionId,input,now=new Date()){
 return stopOutreach(db,actor,sessionId,input,null,now);
}
// Only the server-resolved report flow supplies this separate provenance input.
// The public manual-stop entry point always rejects report-linking fields.
export async function stopProspectOutreachForReport(db,actor,sessionId,input,source,now=new Date()){
 if(!exact(source,['reportCheckId','connectionRevision','senderRevision'])||!validId(source.reportCheckId)||!revision(source.connectionRevision)||!revision(source.senderRevision))return conflict();
 return stopOutreach(db,actor,sessionId,input,{...source},now);
}
async function stopOutreach(db,actor,sessionId,input,source,now){
 if(!allowed(actor))return null;
 const report=Boolean(source);
 if(!validCommand(actor,input,['reason','note','reviewed'])||report&&input.reason!=='hard_bounce'||input.reviewed!==true||!['opt_out','declined','hard_bounce','manual'].includes(input.reason)||typeof input.note!=='string'||!input.note.trim()||input.note.trim().length>1000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.note))return {invalid:true,error:'Choose a stop reason and add the evidence you reviewed.'};
 input={...input};actor={...actor};
 const row=await context(db,actor,input.prospectId);if(!row)return null;if(row.receipt.id!==input.deliveryId)return conflict();
 const stamp=await actorStamp(db,actor,sessionId);if(!stamp)return conflict();
 // Report linkage is audit provenance; the existing reply stop remains the
 // operational authority. Recheck the exact immutable report and account in SQL.
 const reportGuard=report?sql`EXISTS(SELECT 1 FROM prospect_report_checks qc JOIN prospect_google_connections gc ON gc.workspace_id=qc.workspace_id JOIN prospect_senders gs ON gs.workspace_id=qc.workspace_id
  WHERE qc.workspace_id=${d.workspaceId} AND qc.id=${source.reportCheckId} AND qc.prospect_id=${d.prospectId} AND qc.delivery_id=${d.id} AND qc.account_email=${d.accountEmail}
  AND qc.status='associated' AND qc.action='failed' AND qc.status_code LIKE '5.%'
  AND gc.active=1 AND gc.account_email=qc.account_email AND gc.revision=${source.connectionRevision} AND gs.revision=${source.senderRevision})`:undefined;
 const iso=now.toISOString(),condition=and(eq(d.workspaceId,actor.workspaceId),eq(d.prospectId,input.prospectId),eq(d.id,input.deliveryId),eq(d.state,'accepted'),reportGuard,liveActor(actor,sessionId,stamp),sql`${version(actor,input.prospectId)}=${input.expectedRevision}`,
  sql`NOT EXISTS(SELECT 1 FROM prospect_reply_states WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId} AND hold_state='stopped')`);
 const values={workspaceId:actor.workspaceId,prospectId:input.prospectId,deliveryId:input.deliveryId,revision:1,holdState:'stopped',checkStatus:'never',stopReason:input.reason,stopNote:input.note.trim(),stoppedByMembershipId:actor.membershipId,stoppedAt:iso,createdAt:iso,updatedAt:iso};
 const results=await db.batch([activity(db,d,condition,actor,input.prospectId,'PROSPECT_OUTREACH_STOPPED',{deliveryId:input.deliveryId,reason:input.reason,source:report?'manual_report_review':'manual_review',...(report?{reportCheckId:source.reportCheckId}:{})},iso),
  insertSelected(db,r,values,d,condition).onConflictDoUpdate({target:[r.workspaceId,r.prospectId],set:{revision:sql`${r.revision}+1`,holdState:'stopped',stopReason:values.stopReason,stopNote:values.stopNote,stoppedByMembershipId:actor.membershipId,stoppedAt:iso,checkId:null,checkExpiresAt:null,checkStatus:sql`CASE WHEN ${r.checkStatus}='checking' THEN 'unresolved' ELSE ${r.checkStatus} END`,updatedAt:iso}}).returning({revision:r.revision})]);
 return results.at(-1).length?{stopped:true}:conflict();
}
