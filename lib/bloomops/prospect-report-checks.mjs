// Guarded local command, called by the E5 review API. No automatic classification.
import {and,eq,asc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {exact} from './prospect-outreach-values.mjs';
import {providerId,address} from './prospect-reply-observations.mjs';
import {actorStamp,liveActor,replyAccountAccess,liveGrant} from './prospect-replies.mjs';
import {discoveryEnabled} from './prospect-mailbox.mjs';
import {deliveryReportContext} from './prospect-delivery-report.mjs';
import {inspectGoogleDeliveryReport} from './prospect-delivery-report-provider.mjs';
const q=schema.prospectReportChecks,t=schema.prospectReportTargets,m=schema.prospectRecoveryMessages;
const d=schema.prospectDeliveries,h=schema.prospectDeliveryIdentities,a=schema.prospectOutreachApprovals;
const r=schema.prospectReplyStates,g=schema.prospectGoogleConnections,s=schema.prospectDiscoveryStates,z=schema.prospectDiscoveryRuns;
const auth=actor=>administratorCondition(actor,{purpose:'prospecting'});
const conflict=()=>({conflict:true,error:'This report review changed. Reload before continuing.'});
const revision=n=>Number.isSafeInteger(n)&&n>=1;
const acceptedSet=(ws,email)=>sql`(SELECT coalesce(json_group_array(json_array(id,identity_id)),'[]') FROM (SELECT dd.id,hh.id identity_id FROM prospect_deliveries dd LEFT JOIN prospect_delivery_identities hh ON hh.workspace_id=dd.workspace_id AND hh.delivery_id=dd.id WHERE dd.workspace_id=${ws} AND dd.account_email=${email} AND dd.state='accepted' ORDER BY dd.id))`;
export async function checkProspectDeliveryReport(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!actor||!evaluate(actor,{action:'prospecting.manage'}).allowed)return null;
 if(!exact(input,['workspaceId','accountEmail','recoveryRunId','providerMessageId','expectedRevision','connectionRevision','senderRevision','reviewed'])
  ||input.workspaceId!==actor.workspaceId||!address(input.accountEmail)||address(input.accountEmail)!==input.accountEmail
  ||!providerId(input.recoveryRunId)||!providerId(input.providerMessageId)||!revision(input.expectedRevision)
  ||!revision(input.connectionRevision)||!revision(input.senderRevision)||input.reviewed!==true)return conflict();
 // Exact local candidate enablement is additional to the existing account gate.
 if(!discoveryEnabled(env,actor,input.accountEmail)||env.BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED!=='true'
  ||env.BLOOMOPS_GOOGLE_REPORT_RUN_ID!==input.recoveryRunId||env.BLOOMOPS_GOOGLE_REPORT_MESSAGE_ID!==input.providerMessageId)
  return {unavailable:true,error:'Delivery-report checks are not enabled for this saved local message.'};
 // Keep input independent of an asynchronous caller editing its command.
 input={...input};actor={...actor};
 const stamp=await actorStamp(db,actor,sessionId);if(!stamp)return conflict();
 const grant=await replyAccountAccess(db,actor,env,input.accountEmail);if(!grant)return {unavailable:true,error:'Check the original Google connection before continuing.'};
 if(grant.grant.revision!==input.connectionRevision||grant.senderRevision!==input.senderRevision)return conflict();
 const [candidate]=await db.select({message:m}).from(m).innerJoin(z,and(eq(z.workspaceId,m.workspaceId),eq(z.id,m.runId)))
  .where(and(eq(m.workspaceId,actor.workspaceId),eq(m.runId,input.recoveryRunId),eq(m.providerMessageId,input.providerMessageId),eq(z.accountEmail,input.accountEmail),sql`${z.status} IN ('checked','unresolved')`,sql`${m.kind} IN ('delivery_report','needs_review')`,auth(actor))).limit(1);
 if(!candidate)return conflict();
 const rows=await db.select({receipt:d,identity:h,snapshotJson:a.snapshotJson}).from(d)
  .innerJoin(a,and(eq(a.workspaceId,d.workspaceId),eq(a.id,d.approvalId)))
  .leftJoin(h,and(eq(h.workspaceId,d.workspaceId),eq(h.deliveryId,d.id)))
  .where(and(eq(d.workspaceId,actor.workspaceId),eq(d.accountEmail,input.accountEmail),eq(d.state,'accepted'),auth(actor))).orderBy(asc(d.id)).limit(101);
 let context;
 try{context={workspaceId:actor.workspaceId,accountEmail:input.accountEmail,candidate:{...candidate.message,accountEmail:input.accountEmail},deliveries:rows.map(x=>({receipt:x.receipt,identity:x.identity,snapshot:JSON.parse(x.snapshotJson)}))};
  if(!deliveryReportContext(context))return conflict();
 }catch{return conflict();}
 const iso=clock().toISOString(),checkId=crypto.randomUUID(),expiresAt=new Date(Date.parse(iso)+90000).toISOString();
 const sameSet=sql`${acceptedSet(actor.workspaceId,input.accountEmail)}=${JSON.stringify(rows.map(x=>[x.receipt.id,x.identity.id]))}`;
 const current=()=>and(liveActor(actor,sessionId,stamp),liveGrant(actor,grant));
 const mailbox=sql`EXISTS(SELECT 1 FROM prospect_discovery_states WHERE workspace_id=${actor.workspaceId} AND account_email=${input.accountEmail} AND revision=${input.expectedRevision} AND check_id IS NULL)`;
 const repliesSettled=sql`NOT EXISTS(SELECT 1 FROM prospect_deliveries dd LEFT JOIN prospect_reply_states rr ON rr.workspace_id=dd.workspace_id AND rr.delivery_id=dd.id AND rr.prospect_id=dd.prospect_id WHERE dd.workspace_id=${actor.workspaceId} AND dd.account_email=${input.accountEmail} AND dd.state='accepted' AND (rr.revision IS NULL OR rr.hold_state NOT IN ('held','stopped') OR rr.check_id IS NOT NULL))`;
 const accountScope=and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,input.accountEmail));
 const base=()=>and(current(),sameSet,mailbox,repliesSettled);
 const free=sql`NOT EXISTS(SELECT 1 FROM prospect_report_checks WHERE workspace_id=${actor.workspaceId} AND account_email=${input.accountEmail} AND (status='checking' AND expires_at>${iso} OR status!='superseded' AND finished_at>${new Date(Date.parse(iso)-30000).toISOString()} OR status='associated' AND provider_message_id=${input.providerMessageId}))`;
 const own=and(eq(q.workspaceId,actor.workspaceId),eq(q.id,checkId),eq(q.status,'checking'));
 const claimed=sql`EXISTS(SELECT 1 FROM prospect_report_checks WHERE workspace_id=${actor.workspaceId} AND id=${checkId} AND status='checking')`;
 const event=(table,condition,type,metadata,time)=>activityForMutation(db,table,condition,{workspaceId:actor.workspaceId,eventType:type,subjectType:'workspace',subjectId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata,occurredAt:time});
 const statements=[db.update(q).set({status:'superseded',reason:'lease_expired',finishedAt:iso}).where(and(accountScope,eq(q.status,'checking'),sql`${q.expiresAt}<=${iso}`,base(),free)),
  insertSelected(db,q,{id:checkId,workspaceId:actor.workspaceId,accountEmail:input.accountEmail,recoveryRunId:input.recoveryRunId,providerMessageId:input.providerMessageId,status:'checking',actorMembershipId:actor.membershipId,actorStamp:stamp,connectionRevision:grant.grant.revision,senderRevision:grant.senderRevision,discoveryRevision:input.expectedRevision,createdAt:iso,expiresAt},g,and(eq(g.workspaceId,actor.workspaceId),base(),free)).returning({id:q.id})];
 for(const row of rows){
  const receipt=row.receipt;
  statements.push(db.update(r).set({revision:sql`${r.revision}+1`,updatedAt:iso}).where(and(eq(r.workspaceId,actor.workspaceId),eq(r.deliveryId,receipt.id),claimed)));
  statements.push(insertSelected(db,t,{workspaceId:actor.workspaceId,checkId,deliveryId:receipt.id,prospectId:receipt.prospectId,identityId:row.identity.id,replyRevision:r.revision},r,and(eq(r.workspaceId,actor.workspaceId),eq(r.deliveryId,receipt.id),claimed)));
 }
 statements.push(event(q,own,'PROSPECT_REPORT_STARTED',{checkId,targets:rows.length},iso));
 const claims=await db.batch(statements);if(!claims[1].length)return conflict();
 const sameReplies=sql`NOT EXISTS(SELECT 1 FROM prospect_report_targets tt LEFT JOIN prospect_reply_states rr ON rr.workspace_id=tt.workspace_id AND rr.prospect_id=tt.prospect_id AND rr.delivery_id=tt.delivery_id WHERE tt.workspace_id=${actor.workspaceId} AND tt.check_id=${checkId} AND (rr.revision IS NULL OR rr.revision!=tt.reply_revision))`;
 const guard=()=>and(own,base(),sameReplies,sql`${q.expiresAt}>${clock().toISOString()}`);
 if(!(await db.select({id:q.id}).from(q).where(guard()).limit(1))[0]||Date.parse(grant.tokens.expiresAt)<=Date.now()+30000)return conflict();
 const result=await inspectGoogleDeliveryReport(grant.tokens.accessToken,context,{fetcher});
 const completed=clock().toISOString(),p=result.proposal;
 const compatible=p&&(!candidate.message.deliveryId||candidate.message.deliveryId===p.deliveryId&&candidate.message.prospectId===p.prospectId);
 const noCollision=p?sql`NOT EXISTS(SELECT 1 FROM prospect_reply_observations WHERE workspace_id=${actor.workspaceId} AND account_email=${input.accountEmail} AND provider_message_id=${input.providerMessageId} AND (delivery_id!=${p.deliveryId} OR prospect_id!=${p.prospectId} OR received_at!=${p.receivedAt}))`:sql`1`;
 const associated=Boolean(result.status==='associated'&&compatible);
 const reason=result.status==='associated'&&!compatible?'observation_conflict':result.reason;
 const saved=associated?sql`CASE WHEN ${noCollision} THEN 'associated' ELSE 'unresolved' END`:'unresolved';
 const values={status:saved,reason:associated?sql`CASE WHEN ${noCollision} THEN 'associated' ELSE 'observation_conflict' END`:reason,finishedAt:completed};
 for(const [key,value] of Object.entries({deliveryId:p?.deliveryId,prospectId:p?.prospectId,action:p?.action,statusCode:p?.statusCode}))values[key]=associated?sql`CASE WHEN ${noCollision} THEN ${value} ELSE NULL END`:null;
 const terminal=and(eq(q.workspaceId,actor.workspaceId),eq(q.id,checkId),sql`${q.status} IN ('associated','unresolved')`);
 const results=await db.batch([db.update(q).set(values).where(guard()).returning({status:q.status}),
  event(q,terminal,'PROSPECT_REPORT_CHECKED',{checkId,authenticity:'unverified',held:true},completed)]);
 if(!results[0].length)return conflict();
 if(!(await db.select({id:q.id}).from(q).where(and(terminal,current())).limit(1))[0])return null;
 return {checked:true,status:results[0][0].status,held:true,authenticity:'unverified'};
}
