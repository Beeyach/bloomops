import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {exact} from './prospect-outreach-values.mjs';
import {previewProspectSchedule} from './prospect-schedule.mjs';
import {actorStamp,liveActor,liveGrant,replyAccountAccess,checkProspectReplies} from './prospect-replies.mjs';
import {followupMime,submitGoogleFollowup,findGoogleFollowup} from './prospect-delivery-provider.mjs';

const f=schema.prospectFollowupSequences,u=schema.prospectFollowupAttempts,d=schema.prospectDeliveries,a=schema.prospectOutreachApprovals;
const h=schema.prospectDeliveryIdentities,r=schema.prospectReplyStates,o=schema.prospectReplyObservations,m=schema.workspaceMemberships;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const auth=actor=>administratorCondition(actor,{purpose:'prospecting'});
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const conflict=()=>({conflict:true,error:'This sequence or its evidence changed. Reload before continuing.'});
const scope=(actor,prospectId)=>and(eq(f.workspaceId,actor.workspaceId),eq(f.prospectId,prospectId),auth(actor));
const currentApproval=(actor,approvalId)=>sql`EXISTS(SELECT 1 FROM prospect_outreach_approvals aa
 JOIN prospect_outreach_drafts aq ON aq.workspace_id=aa.workspace_id AND aq.id=aa.draft_id
 JOIN bloomops_prospects ap ON ap.workspace_id=aq.workspace_id AND ap.id=aq.prospect_id
 JOIN prospect_senders ass ON ass.workspace_id=aq.workspace_id
 JOIN workspace_memberships am ON am.workspace_id=aa.workspace_id AND am.id=aa.approved_by_membership_id
 WHERE aa.workspace_id=${actor.workspaceId} AND aa.id=${approvalId} AND aa.draft_revision=aq.revision AND aa.profile_revision=ap.revision AND aq.profile_revision=ap.revision AND aa.sender_revision=ass.revision
 AND am.status='active' AND am.role IN ('owner','admin') AND am.updated_at=aa.approver_updated_at)`;
export function followupExecutionEnabled(env,actor,accountEmail){
 if(env.BLOOMOPS_ENV!=='development'||env.BLOOMOPS_MAIL_TRANSPORT!=='r2-dev'||env.BLOOMOPS_GOOGLE_FOLLOWUP_ENABLED!=='true'||env.BLOOMOPS_GOOGLE_FOLLOWUP_WORKSPACE_ID!==actor.workspaceId||env.BLOOMOPS_GOOGLE_FOLLOWUP_ACCOUNT_EMAIL!==accountEmail)return false;
 try{return ['localhost','127.0.0.1','[::1]'].includes(new URL(env.BLOOMOPS_APP_URL).hostname);}catch{return false;}
}

async function sequenceContext(db,actor,prospectId){
 const [row]=await db.select({sequence:f,attempt:u,receipt:d,identity:h,snapshotJson:a.snapshotJson})
  .from(f).innerJoin(d,and(eq(d.workspaceId,f.workspaceId),eq(d.id,f.deliveryId),eq(d.prospectId,f.prospectId)))
  .innerJoin(h,and(eq(h.workspaceId,f.workspaceId),eq(h.id,f.identityId),eq(h.deliveryId,f.deliveryId)))
  .innerJoin(a,and(eq(a.workspaceId,f.workspaceId),eq(a.id,f.approvalId)))
  .leftJoin(u,and(eq(u.workspaceId,f.workspaceId),eq(u.sequenceId,f.id),eq(u.messageNumber,f.nextMessage)))
  .where(scope(actor,prospectId)).limit(1);
 return row?{...row,snapshot:JSON.parse(row.snapshotJson)}:null;
}
export async function getProspectFollowups(db,actor,env,prospectId){
 if(!allowed(actor)||!id(prospectId))return null;
 const row=await sequenceContext(db,actor,prospectId);
 if(row)return {workspaceId:actor.workspaceId,prospectId,sequence:row.sequence,attempt:row.attempt||null,enabled:followupExecutionEnabled(env,actor,row.sequence.accountEmail)};
 const [candidate]=await db.select({receipt:d,snapshotJson:a.snapshotJson,identityId:h.id,accountEmail:h.accountEmail,connectionRevision:h.connectionRevision,senderRevision:h.senderRevision,replyRevision:r.revision,checkStatus:r.checkStatus,checkedAt:r.checkedAt,holdState:r.holdState})
  .from(d).innerJoin(a,and(eq(a.workspaceId,d.workspaceId),eq(a.id,d.approvalId))).innerJoin(h,and(eq(h.workspaceId,d.workspaceId),eq(h.deliveryId,d.id))).innerJoin(r,and(eq(r.workspaceId,d.workspaceId),eq(r.prospectId,d.prospectId),eq(r.deliveryId,d.id)))
  .where(and(eq(d.workspaceId,actor.workspaceId),eq(d.prospectId,prospectId),eq(d.state,'accepted'),currentApproval(actor,d.approvalId),auth(actor))).limit(1);
 if(!candidate)return {workspaceId:actor.workspaceId,prospectId,sequence:null,canActivate:false,reason:'A verified introduction and conversation check are required.'};
 const snapshot=JSON.parse(candidate.snapshotJson),count=1+Number(Boolean(snapshot.draft.followUp2))+Number(Boolean(snapshot.draft.followUp3));
 const [coverage]=await db.select({id:schema.prospectHistoricalCoverages.id}).from(schema.prospectHistoricalCoverages).where(and(eq(schema.prospectHistoricalCoverages.workspaceId,actor.workspaceId),eq(schema.prospectHistoricalCoverages.accountEmail,candidate.accountEmail),sql`${schema.prospectHistoricalCoverages.intervalFrom}<=${candidate.receipt.acceptedAt}`,sql`${schema.prospectHistoricalCoverages.intervalThrough}>=${candidate.receipt.acceptedAt}`,auth(actor))).limit(1);
 const [blocked]=await db.select({id:o.id}).from(o).where(and(eq(o.workspaceId,actor.workspaceId),eq(o.prospectId,prospectId),sql`${o.kind} IN ('reply_unreviewed','needs_review')`,auth(actor))).limit(1);
 return {workspaceId:actor.workspaceId,prospectId,sequence:null,totalMessages:count,canActivate:Boolean(coverage&&!blocked&&candidate.holdState!=='stopped'&&candidate.checkStatus==='checked'&&candidate.checkedAt),reason:coverage?candidate.holdState==='stopped'?'A recorded stop prevents further outreach.':blocked?'A recorded reply needs a human decision.':candidate.checkStatus!=='checked'?'Complete the required conversation check first.':null:'Verified historical coverage for this account is required.'};
}

export async function activateProspectFollowups(db,actor,sessionId,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','prospectId','deliveryId','reviewed'])||input.workspaceId!==actor.workspaceId||![input.prospectId,input.deliveryId].every(id)||input.reviewed!==true)return conflict();
 const stamp=await actorStamp(db,actor,sessionId);if(!stamp)return conflict();
 const [row]=await db.select({receipt:d,snapshotJson:a.snapshotJson,identity:h,replyRevision:r.revision,checkStatus:r.checkStatus,checkedAt:r.checkedAt})
  .from(d).innerJoin(a,and(eq(a.workspaceId,d.workspaceId),eq(a.id,d.approvalId))).innerJoin(h,and(eq(h.workspaceId,d.workspaceId),eq(h.deliveryId,d.id))).innerJoin(r,and(eq(r.workspaceId,d.workspaceId),eq(r.prospectId,d.prospectId),eq(r.deliveryId,d.id)))
  .where(and(eq(d.workspaceId,actor.workspaceId),eq(d.prospectId,input.prospectId),eq(d.id,input.deliveryId),eq(d.state,'accepted'),auth(actor),currentApproval(actor,d.approvalId),sql`${r.checkStatus}='checked' AND ${r.checkId} IS NULL AND ${r.holdState}!='stopped'`,sql`NOT EXISTS(SELECT 1 FROM prospect_reply_observations WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId} AND kind IN ('reply_unreviewed','needs_review'))`,sql`NOT EXISTS(SELECT 1 FROM prospect_conversions WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId})`)).limit(1);
 if(!row)return conflict();
 const [member]=await db.select({updatedAt:m.updatedAt}).from(m).where(and(eq(m.id,actor.membershipId),eq(m.workspaceId,actor.workspaceId),auth(actor))).limit(1);if(!member||member.updatedAt!==stamp)return conflict();
 const [coverage]=await db.select({id:schema.prospectHistoricalCoverages.id}).from(schema.prospectHistoricalCoverages).where(and(eq(schema.prospectHistoricalCoverages.workspaceId,actor.workspaceId),eq(schema.prospectHistoricalCoverages.accountEmail,row.identity.accountEmail),sql`${schema.prospectHistoricalCoverages.intervalFrom}<=${row.receipt.acceptedAt}`,sql`${schema.prospectHistoricalCoverages.intervalThrough}>=${row.receipt.acceptedAt}`,auth(actor))).limit(1);if(!coverage)return {unavailable:true,error:'Verified historical coverage for this account is required.'};
 const snapshot=JSON.parse(row.snapshotJson),bodies=[snapshot.draft.intro,snapshot.draft.followUp2,snapshot.draft.followUp3].filter(Boolean),totalMessages=bodies.length;
 if(totalMessages<1||totalMessages>3||snapshot.draft.followUp3&&!snapshot.draft.followUp2)return conflict();
 const plan=previewProspectSchedule(snapshot.draft.timeZone,row.receipt.acceptedAt),sequenceId=crypto.randomUUID(),iso=now.toISOString(),state=totalMessages===1?'complete':'running';
 const condition=and(eq(d.workspaceId,actor.workspaceId),eq(d.id,input.deliveryId),eq(d.state,'accepted'),currentApproval(actor,d.approvalId),liveActor(actor,sessionId,stamp),sql`NOT EXISTS(SELECT 1 FROM prospect_followup_sequences WHERE workspace_id=${actor.workspaceId} AND delivery_id=${input.deliveryId})`,sql`EXISTS(SELECT 1 FROM prospect_historical_coverages WHERE workspace_id=${actor.workspaceId} AND account_email=${row.identity.accountEmail} AND interval_from<=${row.receipt.acceptedAt} AND interval_through>=${row.receipt.acceptedAt})`,sql`EXISTS(SELECT 1 FROM prospect_reply_states WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId} AND revision=${row.replyRevision} AND check_status='checked' AND check_id IS NULL AND hold_state!='stopped')`,sql`NOT EXISTS(SELECT 1 FROM prospect_reply_observations WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId} AND kind IN ('reply_unreviewed','needs_review'))`,sql`NOT EXISTS(SELECT 1 FROM prospect_conversions WHERE workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId})`);
 const values={id:sequenceId,workspaceId:actor.workspaceId,prospectId:input.prospectId,deliveryId:input.deliveryId,approvalId:row.receipt.approvalId,identityId:row.identity.id,state,totalMessages,nextMessage:totalMessages>1?2:null,secondScheduledAt:totalMessages>1?plan.messages[1].at:null,thirdScheduledAt:totalMessages>2?plan.messages[2].at:null,accountEmail:row.identity.accountEmail,connectionRevision:row.identity.connectionRevision,senderRevision:row.identity.senderRevision,replyRevision:row.replyRevision,activatedByMembershipId:actor.membershipId,activatorUpdatedAt:stamp,lastReason:totalMessages===1?'short_sequence_complete':null,createdAt:iso,updatedAt:iso};
 const saved=and(eq(f.workspaceId,actor.workspaceId),eq(f.id,sequenceId));
 const statements=[insertSelected(db,f,values,d,condition).returning({id:f.id})];
 for(const number of [2,3].filter(n=>n<=totalMessages)){const attemptId=crypto.randomUUID();statements.push(insertSelected(db,u,{id:attemptId,workspaceId:actor.workspaceId,sequenceId,prospectId:input.prospectId,messageNumber:number,messageId:'<bloomsi-'+attemptId+'@bloomsi.invalid>',scheduledAt:number===2?plan.messages[1].at:plan.messages[2].at,state:'scheduled',createdAt:iso,updatedAt:iso},f,saved));}
 statements.push(activityForMutation(db,f,saved,{workspaceId:actor.workspaceId,eventType:'PROSPECT_FOLLOWUP_ACTIVATED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sequenceId,totalMessages},occurredAt:iso}));
 const result=await db.batch(statements);if(result[0].length)return {activated:true,sequenceId};
 const existing=await sequenceContext(db,actor,input.prospectId);return existing?.sequence.deliveryId===input.deliveryId?{activated:true,unchanged:true,sequenceId:existing.sequence.id}:conflict();
}

async function setSequenceState(db,actor,row,state,reason,now){
 const iso=now.toISOString(),condition=and(eq(f.workspaceId,actor.workspaceId),eq(f.id,row.sequence.id),eq(f.state,row.sequence.state));
 await db.batch([activityForMutation(db,f,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_FOLLOWUP_'+state.toUpperCase(),subjectType:'prospect',subjectId:row.sequence.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sequenceId:row.sequence.id,reason},occurredAt:iso}),db.update(f).set({state,lastReason:reason,updatedAt:iso}).where(condition)]);
 return {processed:true,state,reason};
}

export async function runProspectFollowup(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!allowed(actor)||!exact(input,['workspaceId','prospectId','sequenceId'])||input.workspaceId!==actor.workspaceId||![input.prospectId,input.sequenceId].every(id))return conflict();
 let row=await sequenceContext(db,actor,input.prospectId);if(!row||row.sequence.id!==input.sequenceId)return conflict();
 if(!followupExecutionEnabled(env,actor,row.sequence.accountEmail))return {unavailable:true,error:'Follow-up execution is disabled.'};
 if(row.sequence.state==='running'&&row.attempt&&row.attempt.state==='submitting')return reconcileProspectFollowup(db,actor,env,sessionId,input,{fetcher,clock});
 if(row.sequence.state!=='running'||!row.attempt||row.attempt.state!=='scheduled')return conflict();
 if(Date.parse(row.attempt.scheduledAt)>clock().getTime())return {waiting:true,scheduledAt:row.attempt.scheduledAt};
 const [approved]=await db.select({id:f.id}).from(f).where(and(scope(actor,input.prospectId),eq(f.id,row.sequence.id),eq(f.state,'running'),currentApproval(actor,row.sequence.approvalId))).limit(1);
 if(!approved)return setSequenceState(db,actor,row,'held','approval_changed',clock());
 const checked=await checkProspectReplies(db,actor,env,sessionId,{workspaceId:actor.workspaceId,prospectId:row.sequence.prospectId,deliveryId:row.sequence.deliveryId,expectedRevision:row.sequence.replyRevision,senderRevision:row.sequence.senderRevision,connectionRevision:row.sequence.connectionRevision,reviewed:true},{fetcher,clock});
 if(checked?.conflict)return {waiting:true,reason:'check_already_claimed'};
 if(!checked?.checked)return setSequenceState(db,actor,row,'held',checked?.error||'required_check_failed',clock());
 row=await sequenceContext(db,actor,input.prospectId);const [reply]=await db.select().from(r).where(and(eq(r.workspaceId,actor.workspaceId),eq(r.prospectId,input.prospectId),auth(actor))).limit(1);
 if(!reply||reply.checkStatus!=='checked'||reply.checkId||!reply.checkedAt)return setSequenceState(db,actor,row,'held','required_check_incomplete',clock());
 const [observed]=await db.select({id:o.id}).from(o).where(and(eq(o.workspaceId,actor.workspaceId),eq(o.prospectId,input.prospectId),sql`${o.kind} IN ('reply_unreviewed','needs_review')`,auth(actor))).limit(1);
 if(reply.holdState==='stopped')return setSequenceState(db,actor,row,'stopped',reply.stopReason||'recorded_stop',clock());
 if(observed)return setSequenceState(db,actor,row,'held','reply_recorded',clock());
 const [converted]=await db.select({id:schema.prospectConversions.id}).from(schema.prospectConversions).where(and(eq(schema.prospectConversions.workspaceId,actor.workspaceId),eq(schema.prospectConversions.prospectId,input.prospectId),auth(actor))).limit(1);
 if(converted)return setSequenceState(db,actor,row,'stopped','converted',clock());
 const stamp=await actorStamp(db,actor,sessionId),access=stamp&&await replyAccountAccess(db,actor,env,row.sequence.accountEmail,row.snapshot.sender.email);if(!access||access.grant.revision!==row.sequence.connectionRevision||access.senderRevision!==row.sequence.senderRevision)return setSequenceState(db,actor,row,'held','connection_changed',clock());
 let mime;try{mime=followupMime(row.attempt,row.snapshot,row.identity);}catch{return setSequenceState(db,actor,row,'held','approval_changed',clock());}
 const iso=clock().toISOString(),guard=()=>and(currentApproval(actor,row.sequence.approvalId),liveActor(actor,sessionId,stamp),liveGrant(actor,access),sql`EXISTS(SELECT 1 FROM prospect_reply_states WHERE workspace_id=${actor.workspaceId} AND prospect_id=${row.sequence.prospectId} AND revision=${reply.revision} AND check_status='checked' AND check_id IS NULL AND hold_state!='stopped')`,sql`NOT EXISTS(SELECT 1 FROM prospect_reply_observations WHERE workspace_id=${actor.workspaceId} AND prospect_id=${row.sequence.prospectId} AND kind IN ('reply_unreviewed','needs_review'))`,sql`NOT EXISTS(SELECT 1 FROM prospect_conversions WHERE workspace_id=${actor.workspaceId} AND prospect_id=${row.sequence.prospectId})`),current=()=>and(eq(f.workspaceId,actor.workspaceId),eq(f.id,row.sequence.id),eq(f.state,'running'),guard());
 const sequenceRunning=sql`EXISTS(SELECT 1 FROM prospect_followup_sequences fs WHERE fs.workspace_id=${actor.workspaceId} AND fs.id=${row.sequence.id} AND fs.state='running')`,claim=and(eq(u.workspaceId,actor.workspaceId),eq(u.id,row.attempt.id),eq(u.state,'scheduled'),sequenceRunning,guard());
 const claims=await db.batch([db.update(f).set({replyRevision:reply.revision,updatedAt:iso}).where(current()),activityForMutation(db,u,claim,{workspaceId:actor.workspaceId,eventType:'PROSPECT_FOLLOWUP_ATTEMPTED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sequenceId:row.sequence.id,messageNumber:row.attempt.messageNumber},occurredAt:iso}),db.update(u).set({state:'submitting',attemptedAt:iso,accountEmail:access.grant.accountEmail,updatedAt:iso}).where(claim).returning({id:u.id})]);
 if(!claims.at(-1).length)return conflict();
 const [final]=await db.select({id:u.id}).from(u).where(and(eq(u.workspaceId,actor.workspaceId),eq(u.id,row.attempt.id),eq(u.state,'submitting'),sequenceRunning,guard())).limit(1);
 if(!final){await db.update(u).set({state:'cancelled',updatedAt:clock().toISOString()}).where(and(eq(u.workspaceId,actor.workspaceId),eq(u.id,row.attempt.id),eq(u.state,'submitting')));return setSequenceState(db,actor,row,'held','execution_guard_changed',clock());}
 const outcome=await submitGoogleFollowup(access.tokens.accessToken,mime,row.identity.providerThreadId,{fetcher}),done=clock().toISOString(),attemptCondition=and(eq(u.workspaceId,actor.workspaceId),eq(u.id,row.attempt.id),eq(u.state,'submitting'));
 await db.batch([activityForMutation(db,u,attemptCondition,{workspaceId:actor.workspaceId,eventType:outcome.accepted?'PROSPECT_FOLLOWUP_ACCEPTED':'PROSPECT_FOLLOWUP_UNCERTAIN',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sequenceId:row.sequence.id,messageNumber:row.attempt.messageNumber},occurredAt:done}),db.update(u).set(outcome.accepted?{state:'accepted',providerMessageId:outcome.messageId,providerThreadId:outcome.threadId,acceptedAt:done,updatedAt:done}:{state:'uncertain',updatedAt:done}).where(attemptCondition),db.update(f).set(outcome.accepted?(row.attempt.messageNumber<row.sequence.totalMessages?{nextMessage:row.attempt.messageNumber+1,replyRevision:reply.revision,updatedAt:done}:{state:'complete',nextMessage:null,lastReason:'sequence_complete',replyRevision:reply.revision,updatedAt:done}):{state:'failed',lastReason:'provider_outcome_uncertain',replyRevision:reply.revision,updatedAt:done}).where(and(eq(f.workspaceId,actor.workspaceId),eq(f.id,row.sequence.id),eq(f.state,'running')))]);
 return {processed:true,accepted:Boolean(outcome.accepted),state:outcome.accepted&&row.attempt.messageNumber===row.sequence.totalMessages?'complete':outcome.accepted?'running':'failed'};
}

export async function reconcileProspectFollowup(db,actor,env,sessionId,input,{fetcher=fetch,clock=()=>new Date()}={}){
 if(!allowed(actor)||!exact(input,['workspaceId','prospectId','sequenceId'])||input.workspaceId!==actor.workspaceId)return conflict();
 const row=await sequenceContext(db,actor,input.prospectId);if(!row||row.sequence.id!==input.sequenceId)return conflict();
 const [attempt]=await db.select().from(u).where(and(eq(u.workspaceId,actor.workspaceId),eq(u.sequenceId,input.sequenceId),sql`${u.state} IN ('submitting','uncertain')`,auth(actor))).limit(1);if(!attempt)return conflict();
 if(!followupExecutionEnabled(env,actor,row.sequence.accountEmail))return {unavailable:true,error:'Follow-up execution is disabled.'};
 const stamp=await actorStamp(db,actor,sessionId),access=stamp&&await replyAccountAccess(db,actor,env,row.sequence.accountEmail,row.snapshot.sender.email);if(!access||access.grant.accountEmail!==attempt.accountEmail)return {unavailable:true,error:'Check the original Google account before reconciling.'};
 const outcome=await findGoogleFollowup(access.tokens.accessToken,attempt,row.snapshot,row.identity,{fetcher}),iso=clock().toISOString(),condition=and(eq(u.workspaceId,actor.workspaceId),eq(u.id,attempt.id),sql`${u.state} IN ('submitting','uncertain')`);
 if(!outcome.accepted){if(attempt.state==='submitting')await db.batch([activityForMutation(db,u,and(eq(u.workspaceId,actor.workspaceId),eq(u.id,attempt.id),eq(u.state,'submitting')),{workspaceId:actor.workspaceId,eventType:'PROSPECT_FOLLOWUP_UNCERTAIN',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sequenceId:row.sequence.id,messageNumber:attempt.messageNumber,reconciled:true},occurredAt:iso}),db.update(u).set({state:'uncertain',updatedAt:iso}).where(and(eq(u.workspaceId,actor.workspaceId),eq(u.id,attempt.id),eq(u.state,'submitting'))),db.update(f).set({state:'failed',lastReason:'provider_outcome_uncertain',updatedAt:iso}).where(and(eq(f.workspaceId,actor.workspaceId),eq(f.id,row.sequence.id),eq(f.state,'running')))]);return {checked:true,accepted:false};}
 await db.batch([activityForMutation(db,u,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_FOLLOWUP_ACCEPTED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{sequenceId:row.sequence.id,messageNumber:attempt.messageNumber,reconciled:true},occurredAt:iso}),db.update(u).set({state:'accepted',providerMessageId:outcome.messageId,providerThreadId:outcome.threadId,acceptedAt:iso,updatedAt:iso}).where(condition),db.update(f).set(attempt.messageNumber<row.sequence.totalMessages?{state:'running',nextMessage:attempt.messageNumber+1,lastReason:null,updatedAt:iso}:{state:'complete',nextMessage:null,lastReason:'sequence_complete',updatedAt:iso}).where(and(eq(f.workspaceId,actor.workspaceId),eq(f.id,row.sequence.id),sql`${f.state} IN ('failed','running')`))]);
 return {checked:true,accepted:true};
}

// A bounded scheduler adapter. No cron is registered by this change. A future
// local trigger must explicitly configure one workspace, account and current
// session; absent configuration returns before reading D1 or contacting Google.
export async function runScheduledProspectFollowup(db,env,{fetcher=fetch,clock=()=>new Date()}={}){
 if(env.BLOOMOPS_GOOGLE_FOLLOWUP_SCHEDULER_ENABLED!=='true'||!id(env.BLOOMOPS_GOOGLE_FOLLOWUP_WORKSPACE_ID)||!id(env.BLOOMOPS_GOOGLE_FOLLOWUP_ACCOUNT_EMAIL)||!id(env.BLOOMOPS_GOOGLE_FOLLOWUP_SESSION_ID))return {disabled:true};
 const w=schema.workspaces;const now=clock().toISOString();
 const [row]=await db.select({sequenceId:f.id,prospectId:f.prospectId,workspaceId:f.workspaceId,membershipId:m.id,userId:m.userId,role:m.role,status:m.status})
  .from(f).innerJoin(m,and(eq(m.workspaceId,f.workspaceId),eq(m.id,f.activatedByMembershipId))).innerJoin(w,eq(w.id,f.workspaceId))
  .where(and(eq(f.workspaceId,env.BLOOMOPS_GOOGLE_FOLLOWUP_WORKSPACE_ID),eq(f.accountEmail,env.BLOOMOPS_GOOGLE_FOLLOWUP_ACCOUNT_EMAIL),eq(f.state,'running'),eq(m.updatedAt,f.activatorUpdatedAt),eq(m.status,'active'),sql`${m.role} IN ('owner','admin')`,eq(w.status,'active'),eq(w.purpose,'prospecting'),sql`CASE ${f.nextMessage} WHEN 2 THEN ${f.secondScheduledAt} WHEN 3 THEN ${f.thirdScheduledAt} END<=${now}`)).limit(1);
 if(!row)return {processed:false};
 const actor={workspaceId:row.workspaceId,membershipId:row.membershipId,userId:row.userId,role:row.role,status:row.status};
 return runProspectFollowup(db,actor,env,env.BLOOMOPS_GOOGLE_FOLLOWUP_SESSION_ID,{workspaceId:row.workspaceId,prospectId:row.prospectId,sequenceId:row.sequenceId},{fetcher,clock});
}
