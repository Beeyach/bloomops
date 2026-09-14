// Guarded local discovery commands. No route/job enables broad mailbox access.
import {and,eq,asc,desc,sql,exists} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {exact} from './prospect-outreach-values.mjs';
import {address} from './prospect-reply-observations.mjs';
import {replyAccountAccess,actorStamp,liveActor,liveGrant} from './prospect-replies.mjs';
import {inspectGoogleReplyBaseline,inspectGoogleReplyChanges} from './prospect-reply-discovery.mjs';
import {collectProspectReplyRecovery} from './prospect-reply-recovery.mjs';
const c=schema.prospectRecoveryCollections,m=schema.prospectRecoveryMessages,k=schema.prospectMonitoringCheckpoints;
const s=schema.prospectDiscoveryStates,q=schema.prospectDiscoveryRuns,t=schema.prospectDiscoveryTargets;
const d=schema.prospectDeliveries,h=schema.prospectDeliveryIdentities,a=schema.prospectOutreachApprovals;
const r=schema.prospectReplyStates,o=schema.prospectReplyObservations,g=schema.prospectGoogleConnections;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const auth=actor=>administratorCondition(actor,{purpose:'prospecting'});
const canonical=value=>address(value)&&address(value)===value;
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const conflict=()=>({conflict:true,error:'This mailbox review changed. Reload before continuing.'});
const scope=(actor,email)=>and(eq(s.workspaceId,actor.workspaceId),eq(s.accountEmail,email),auth(actor));
const event=(db,table,condition,actor,type,metadata,iso,prospectId)=>activityForMutation(db,table,condition,{workspaceId:actor.workspaceId,eventType:type,subjectType:prospectId?'prospect':'workspace',subjectId:prospectId||actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata,occurredAt:iso});
export function discoveryEnabled(env,actor,email){
 if(env.BLOOMOPS_ENV!=='development'||env.BLOOMOPS_MAIL_TRANSPORT!=='r2-dev'||env.BLOOMOPS_GOOGLE_DISCOVERY_ENABLED!=='true'||env.BLOOMOPS_GOOGLE_DISCOVERY_WORKSPACE_ID!==actor.workspaceId||env.BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL!==email)return false;
 try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(env.BLOOMOPS_APP_URL).hostname);}catch{return false;}
}
export async function getProspectDiscoveryState(db,actor,accountEmail){
 if(!allowed(actor)||!canonical(accountEmail))return null;
 const [row]=await db.select({revision:s.revision,coverageStatus:s.coverageStatus,checkStatus:s.checkStatus,checkedAt:s.checkedAt,lastReason:s.lastReason,expiresAt:s.checkExpiresAt,hasBaseline:sql`${s.baselineHistoryId} IS NOT NULL`}).from(s).where(scope(actor,accountEmail)).limit(1);
 return row?{revision:row.revision,coverageStatus:row.coverageStatus,checkStatus:row.checkStatus,checkedAt:row.checkedAt,lastReason:row.lastReason,hasBaseline:Boolean(row.hasBaseline),held:true,busy:Boolean(row.expiresAt&&Date.parse(row.expiresAt)>Date.now())}:null;
}
const acceptedSet=(workspaceId,email)=>sql`(SELECT coalesce(json_group_array(json_array(id,identity_id)),'[]') FROM (SELECT md.id,mh.id identity_id FROM prospect_deliveries md LEFT JOIN prospect_delivery_identities mh ON mh.workspace_id=md.workspace_id AND mh.delivery_id=md.id WHERE md.workspace_id=${workspaceId} AND md.account_email=${email} AND md.state='accepted' ORDER BY md.id))`;

// A recent complete collection may establish future progress, never past coverage.
export function checkpointSourceGuard(actor,email,sourceId,connectionRevision,senderRevision,iso){
 return sql`EXISTS(SELECT 1 FROM prospect_discovery_runs src JOIN prospect_recovery_collections collection ON collection.workspace_id=src.workspace_id AND collection.run_id=src.id
 WHERE src.workspace_id=${actor.workspaceId} AND src.account_email=${email} AND src.id=${sourceId} AND src.kind='recovery' AND src.status='unresolved' AND src.reason='recovery_collected'
 AND src.connection_revision=${connectionRevision} AND src.sender_revision=${senderRevision}
 AND src.finished_at>=${new Date(Date.parse(iso)-300000).toISOString()} AND src.finished_at<=${iso}
 AND collection.catchup_status='complete' AND collection.catchup_history_id IS NOT NULL AND collection.unassigned_count=0
 AND NOT EXISTS(SELECT 1 FROM prospect_monitoring_checkpoints prior WHERE prior.workspace_id=src.workspace_id AND prior.source_run_id=src.id)
 AND NOT EXISTS(SELECT 1 FROM prospect_discovery_runs newer WHERE newer.workspace_id=src.workspace_id AND newer.account_email=src.account_email AND newer.kind='recovery' AND (newer.created_at>src.created_at OR newer.created_at=src.created_at AND newer.id>src.id))
 AND (SELECT count(*) FROM prospect_discovery_targets tt WHERE tt.workspace_id=src.workspace_id AND tt.run_id=src.id) BETWEEN 1 AND 100
 AND (SELECT count(*) FROM prospect_discovery_targets tt WHERE tt.workspace_id=src.workspace_id AND tt.run_id=src.id)=(SELECT count(*) FROM prospect_deliveries dd WHERE dd.workspace_id=src.workspace_id AND dd.account_email=src.account_email AND dd.state='accepted')
 AND NOT EXISTS(SELECT 1 FROM prospect_discovery_targets tt
 LEFT JOIN prospect_deliveries dd ON dd.workspace_id=tt.workspace_id AND dd.id=tt.delivery_id AND dd.prospect_id=tt.prospect_id AND dd.account_email=src.account_email AND dd.state='accepted'
 LEFT JOIN prospect_delivery_identities hh ON hh.workspace_id=dd.workspace_id AND hh.delivery_id=dd.id
 LEFT JOIN prospect_reply_states rr ON rr.workspace_id=tt.workspace_id AND rr.prospect_id=tt.prospect_id AND rr.delivery_id=tt.delivery_id
 WHERE tt.workspace_id=src.workspace_id AND tt.run_id=src.id AND (dd.id IS NULL OR hh.id IS NULL OR hh.id IS NOT tt.identity_id OR rr.revision IS NOT tt.reply_revision OR rr.check_id IS NOT NULL OR rr.hold_state NOT IN ('held','stopped')))
 AND NOT EXISTS(SELECT 1 FROM prospect_discovery_states state WHERE state.workspace_id=src.workspace_id AND state.account_email=src.account_email AND (state.check_id IS NOT NULL OR state.history_id IS NOT NULL AND (length(state.history_id)>length(collection.catchup_history_id) OR length(state.history_id)=length(collection.catchup_history_id) AND state.history_id>collection.catchup_history_id)))
 AND NOT EXISTS(SELECT 1 FROM prospect_report_checks report WHERE report.workspace_id=src.workspace_id AND report.account_email=src.account_email AND report.status='checking'))`;
}
export const checkpointProspectMailbox=(db,actor,env,sessionId,input,options)=>runMailbox(db,actor,env,sessionId,input,options,false,true);
export const checkProspectMailbox=(db,actor,env,sessionId,input,options)=>runMailbox(db,actor,env,sessionId,input,options,false);
export const recoverProspectMailbox=(db,actor,env,sessionId,input,options)=>runMailbox(db,actor,env,sessionId,input,options,true);
export async function getProspectRecovery(db,actor,accountEmail){
 if(!allowed(actor)||!canonical(accountEmail))return null;
 const [row]=await db.select({status:q.status,reason:q.reason,startedAt:q.createdAt,finishedAt:q.finishedAt,from:c.from,catchupStatus:c.catchupStatus,matchedCount:c.matchedCount,unassignedCount:c.unassignedCount}).from(q).leftJoin(c,and(eq(c.workspaceId,q.workspaceId),eq(c.runId,q.id))).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.accountEmail,accountEmail),eq(q.kind,'recovery'),auth(actor))).orderBy(desc(q.createdAt),desc(q.id)).limit(1);
 return row?{...row,coverage:'unverified',held:true}:null;
}
async function runMailbox(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={},recovery=false,checkpoint=false){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','accountEmail','expectedRevision','connectionRevision','senderRevision','reviewed',...(checkpoint?['sourceRunId']:[])])||input.workspaceId!==actor.workspaceId||!canonical(input.accountEmail)||!revision(input.expectedRevision)||!revision(input.connectionRevision)||!revision(input.senderRevision)||input.reviewed!==true||checkpoint&&(typeof input.sourceRunId!=='string'||!input.sourceRunId||input.sourceRunId.length>200))return conflict();
 input={...input};actor={...actor};
 if(!discoveryEnabled(env,actor,input.accountEmail)||recovery&&env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED!=='true'||checkpoint&&env.BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED!=='true')return {unavailable:true,error:'Mailbox discovery is not enabled for this local workspace and account.'};
 const stamp=await actorStamp(db,actor,sessionId);if(!stamp)return conflict();
 const grant=await replyAccountAccess(db,actor,env,input.accountEmail);if(!grant)return {unavailable:true,error:'Check the original Google connection before continuing.'};
 if(grant.grant.revision!==input.connectionRevision||grant.senderRevision!==input.senderRevision)return conflict();
 const rows=await db.select({receipt:d,identity:h,snapshotJson:a.snapshotJson}).from(d)
  .innerJoin(a,and(eq(a.workspaceId,d.workspaceId),eq(a.id,d.approvalId)))
  .leftJoin(h,and(eq(h.workspaceId,d.workspaceId),eq(h.deliveryId,d.id)))
  .where(and(eq(d.workspaceId,actor.workspaceId),eq(d.accountEmail,input.accountEmail),eq(d.state,'accepted'),auth(actor))).orderBy(asc(d.id)).limit(101);
 if(!rows.length||rows.length>100)return {unavailable:true,error:'Discovery requires between 1 and 100 accepted deliveries in this account.'};
 const [prior]=await db.select().from(s).where(scope(actor,input.accountEmail)).limit(1);
 const iso=clock().toISOString(),runId=crypto.randomUUID(),expiresAt=new Date(Date.parse(iso)+90000).toISOString();
 const snapshot=JSON.stringify(rows.map(x=>[x.receipt.id,x.identity?.id||null]));
 const sourceGuard=checkpoint?checkpointSourceGuard(actor,input.accountEmail,input.sourceRunId,grant.grant.revision,grant.senderRevision,iso):undefined;
 const [source]=checkpoint?await db.select({cursor:c.catchupHistoryId,finishedAt:q.finishedAt}).from(c).innerJoin(q,and(eq(q.workspaceId,c.workspaceId),eq(q.id,c.runId))).where(and(eq(c.workspaceId,actor.workspaceId),eq(c.runId,input.sourceRunId),auth(actor),sourceGuard)).limit(1):[];
 if(checkpoint&&!source)return conflict();
 const current=()=>and(liveActor(actor,sessionId,stamp),liveGrant(actor,grant));
 const sameSet=sql`${acceptedSet(actor.workspaceId,input.accountEmail)}=${snapshot}`;
 const claim=and(eq(g.workspaceId,actor.workspaceId),eq(g.accountEmail,input.accountEmail),current(),sameSet,sourceGuard,
  sql`coalesce((SELECT revision FROM prospect_discovery_states WHERE workspace_id=${actor.workspaceId} AND account_email=${input.accountEmail}),0)=${input.expectedRevision}`,
  sql`NOT EXISTS(SELECT 1 FROM prospect_discovery_states WHERE workspace_id=${actor.workspaceId} AND account_email=${input.accountEmail} AND (check_expires_at>${iso} OR (${checkpoint?0:1}=1 AND checked_at>${new Date(Date.parse(iso)-30000).toISOString()})))`,
  sql`NOT EXISTS(SELECT 1 FROM prospect_reply_states rr JOIN prospect_deliveries dd ON dd.workspace_id=rr.workspace_id AND dd.id=rr.delivery_id WHERE dd.workspace_id=${actor.workspaceId} AND dd.account_email=${input.accountEmail} AND rr.check_id IS NOT NULL)`);
 const claimed=and(eq(s.workspaceId,actor.workspaceId),eq(s.accountEmail,input.accountEmail),eq(s.checkId,runId));
 const isClaimed=sql`EXISTS(SELECT 1 FROM prospect_discovery_states WHERE workspace_id=${actor.workspaceId} AND account_email=${input.accountEmail} AND check_id=${runId})`;
 const runScope=and(eq(q.workspaceId,actor.workspaceId),eq(q.id,runId));
 const statements=[insertSelected(db,s,{workspaceId:actor.workspaceId,accountEmail:input.accountEmail,revision:1,coverageStatus:'unverified',checkStatus:'checking',checkId:runId,checkExpiresAt:expiresAt,createdAt:iso,updatedAt:iso},g,claim).onConflictDoUpdate({target:[s.workspaceId,s.accountEmail],set:{revision:sql`${s.revision}+1`,checkStatus:'checking',checkId:runId,checkExpiresAt:expiresAt,updatedAt:iso}}).returning({revision:s.revision})];
 if(prior?.checkId)statements.push(db.update(q).set({status:'superseded',reason:'lease_expired',finishedAt:iso}).where(and(eq(q.workspaceId,actor.workspaceId),eq(q.id,prior.checkId),eq(q.status,'checking'),isClaimed)));
 statements.push(insertSelected(db,q,{id:runId,workspaceId:actor.workspaceId,accountEmail:input.accountEmail,kind:checkpoint?'checkpoint':recovery?'recovery':'discovery',status:'checking',sourceHistoryId:prior?.historyId||null,actorMembershipId:actor.membershipId,actorStamp:stamp,connectionRevision:grant.grant.revision,senderRevision:grant.senderRevision,createdAt:iso},s,claimed));
 for(const row of rows){
  const receipt=row.receipt,selected=and(eq(d.workspaceId,actor.workspaceId),eq(d.id,receipt.id),isClaimed);
  statements.push(event(db,d,and(selected,sql`NOT EXISTS(SELECT 1 FROM prospect_reply_states WHERE workspace_id=${actor.workspaceId} AND prospect_id=${receipt.prospectId} AND hold_state IN ('held','stopped'))`),actor,'PROSPECT_DISCOVERY_HELD',{runId},iso,receipt.prospectId));
  statements.push(insertSelected(db,r,{workspaceId:actor.workspaceId,prospectId:receipt.prospectId,deliveryId:receipt.id,revision:1,holdState:'held',checkStatus:'never',createdAt:iso,updatedAt:iso},d,selected).onConflictDoUpdate({target:[r.workspaceId,r.prospectId],set:{revision:sql`${r.revision}+1`,holdState:sql`CASE WHEN ${r.holdState}='stopped' THEN 'stopped' ELSE 'held' END`,updatedAt:iso}}));
  statements.push(insertSelected(db,t,{workspaceId:actor.workspaceId,runId,prospectId:receipt.prospectId,deliveryId:receipt.id,identityId:row.identity?.id||null,replyRevision:r.revision},r,and(eq(r.workspaceId,actor.workspaceId),eq(r.prospectId,receipt.prospectId),isClaimed)));
 }
 if(checkpoint)statements.push(insertSelected(db,k,{workspaceId:actor.workspaceId,runId,sourceRunId:input.sourceRunId,createdAt:iso},s,claimed));
 statements.push(event(db,q,runScope,actor,'PROSPECT_DISCOVERY_STARTED',{runId,deliveries:rows.length,mode:checkpoint?'checkpoint':recovery?'recovery':prior?.historyId?'history':'baseline',priorCoverage:prior?.coverageStatus||'unverified'},iso));
 const claims=await db.batch(statements);if(!claims[0].length)return conflict();
 const unchangedReplies=sql`NOT EXISTS(SELECT 1 FROM prospect_discovery_targets tt LEFT JOIN prospect_reply_states rr ON rr.workspace_id=tt.workspace_id AND rr.prospect_id=tt.prospect_id AND rr.delivery_id=tt.delivery_id WHERE tt.workspace_id=${actor.workspaceId} AND tt.run_id=${runId} AND (rr.revision IS NULL OR rr.revision!=tt.reply_revision))`;
 const guard=()=>and(claimed,current(),sameSet,unchangedReplies,sql`${s.checkExpiresAt}>${clock().toISOString()}`,checkpoint?sql`${source.finishedAt}>=${new Date(clock().getTime()-300000).toISOString()}`:undefined);
 const [ready]=await db.select({id:s.checkId}).from(s).where(guard()).limit(1);
 if(!ready||Date.parse(grant.tokens.expiresAt)<=Date.now()+30000)return conflict();
 const recoveryContext={workspaceId:actor.workspaceId,accountEmail:input.accountEmail,deliveries:rows.map(x=>({identity:x.identity,receipt:x.receipt,snapshot:JSON.parse(x.snapshotJson)}))};
 const result=checkpoint?{status:'observed',nextHistoryId:source.cursor,observations:[]}:rows.some(x=>!x.identity)?{status:'unresolved',reason:'identity_required',observations:[]}:
  recovery?await collectProspectReplyRecovery(grant.tokens.accessToken,recoveryContext,{fetcher,ready:async()=>Boolean((await db.select({id:s.checkId}).from(s).where(guard()).limit(1))[0])}):prior?.historyId?await inspectGoogleReplyChanges(grant.tokens.accessToken,{workspaceId:actor.workspaceId,accountEmail:input.accountEmail,startHistoryId:prior.historyId,deliveries:rows.map(x=>({identity:x.identity,receipt:x.receipt,snapshot:JSON.parse(x.snapshotJson)}))},{fetcher}):await inspectGoogleReplyBaseline(grant.tokens.accessToken,input.accountEmail,{fetcher});
 const completed=clock().toISOString(),observations=['observed','collected'].includes(result.status)?result.observations:[];
 const noCollision=sql`NOT EXISTS(SELECT 1 FROM prospect_reply_observations oo JOIN json_each(${JSON.stringify((result.messages||observations).map(x=>[x.providerMessageId,x.deliveryId]))}) incoming ON oo.provider_message_id=json_extract(incoming.value,'$[0]') WHERE oo.workspace_id=${actor.workspaceId} AND oo.account_email=${input.accountEmail} AND oo.delivery_id IS NOT json_extract(incoming.value,'$[1]'))`;
 const finish=()=>and(guard(),noCollision),batch=[];
 for(const item of observations){
  const id=crypto.randomUUID();batch.push(insertSelected(db,o,{id,workspaceId:actor.workspaceId,prospectId:item.prospectId,deliveryId:item.deliveryId,accountEmail:input.accountEmail,providerMessageId:item.providerMessageId,receivedAt:item.receivedAt,kind:item.kind,match:item.match,observedByMembershipId:actor.membershipId,createdAt:completed},s,finish()).onConflictDoNothing());
  batch.push(event(db,o,and(eq(o.workspaceId,actor.workspaceId),eq(o.id,id)),actor,'PROSPECT_REPLY_OBSERVED',{deliveryId:item.deliveryId,kind:item.kind},completed,item.prospectId));
 }
 if(recovery&&result.status==='collected'){
  batch.push(insertSelected(db,c,{workspaceId:actor.workspaceId,runId,from:result.from,startHistoryId:result.startHistoryId,catchupHistoryId:result.catchupHistoryId,catchupStatus:result.catchupStatus,reason:result.reason,matchedCount:result.observations.length,unassignedCount:result.unassigned.length,createdAt:completed},s,finish()));
  for(const item of result.messages)batch.push(insertSelected(db,m,{workspaceId:actor.workspaceId,runId,...item},s,finish()));
  batch.push(event(db,c,and(eq(c.workspaceId,actor.workspaceId),eq(c.runId,runId)),actor,'PROSPECT_RECOVERY_COLLECTED',{runId,matched:result.observations.length,unassigned:result.unassigned.length,catchupStatus:result.catchupStatus,coverage:'unverified'},completed));
 }
 const completedGuard=exists(db.select({id:s.checkId}).from(s).where(guard()));
 const reason=checkpoint?'checkpoint_saved':result.status==='observed'?'history_only':result.reason;
 batch.push(db.update(q).set({status:result.status==='observed'?sql`CASE WHEN ${noCollision} THEN 'checked' ELSE 'unresolved' END`:'unresolved',resultHistoryId:result.status==='observed'?sql`CASE WHEN ${noCollision} THEN ${result.nextHistoryId} ELSE NULL END`:null,reason:sql`CASE WHEN ${noCollision} THEN ${reason} ELSE 'observation_conflict' END`,finishedAt:completed}).where(and(runScope,eq(q.status,'checking'),completedGuard)));
 const terminal=sql`EXISTS(SELECT 1 FROM prospect_discovery_runs WHERE workspace_id=${actor.workspaceId} AND id=${runId} AND status IN ('checked','unresolved'))`;
 // Activity exposes a safe status, never raw cursors or identity snapshots.
 for(const status of ['checked','unresolved'])batch.push(event(db,q,and(runScope,eq(q.status,status)),actor,'PROSPECT_DISCOVERY_CHECKED',{runId,status,priorCoverage:prior?.coverageStatus||'unverified'},completed));
 const passed=sql`EXISTS(SELECT 1 FROM prospect_discovery_runs WHERE workspace_id=${actor.workspaceId} AND id=${runId} AND status='checked')`;
 if(checkpoint)batch.push(event(db,q,and(runScope,eq(q.status,'checked')),actor,'PROSPECT_MONITORING_CHECKPOINT',{runId,sourceRunId:input.sourceRunId,historicalCoverage:'unverified',held:true},completed));
 const cursor=sql`(SELECT result_history_id FROM prospect_discovery_runs WHERE workspace_id=${actor.workspaceId} AND id=${runId})`;
 batch.push(db.update(s).set({revision:sql`${s.revision}+1`,checkStatus:sql`CASE WHEN ${passed} THEN 'checked' ELSE 'unresolved' END`,historyId:sql`CASE WHEN ${passed} THEN ${cursor} ELSE ${s.historyId} END`,baselineHistoryId:sql`CASE WHEN ${passed} THEN coalesce(${s.baselineHistoryId},${cursor}) ELSE ${s.baselineHistoryId} END`,coverageStatus:sql`CASE WHEN ${passed} THEN ${s.coverageStatus} ELSE 'gap' END`,lastReason:sql`(SELECT reason FROM prospect_discovery_runs WHERE workspace_id=${actor.workspaceId} AND id=${runId})`,checkId:null,checkExpiresAt:null,checkedAt:completed,updatedAt:completed}).where(and(claimed,terminal)).returning({status:s.checkStatus}));
 const results=await db.batch(batch);if(!results.at(-1).length)return conflict();
 return await getProspectDiscoveryState(db,actor,input.accountEmail)?{checked:true,status:results.at(-1)[0].status,held:true}:null;
}
