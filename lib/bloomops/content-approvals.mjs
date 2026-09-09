import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { contentReadCondition, loadContentResource } from './content-access.mjs';
import { approvalClientCondition, approvalJoin, loadApprovalResource, noRequestedApproval, requestedApprovalCondition } from './content-approval-access.mjs';
import { APPROVAL_HISTORY_SIZE, normalizeApproval, REVIEW_FIELDS } from './content-approval-values.mjs';
import { getContent } from './content.mjs';
import { activityForMutation } from './activity.mjs';
const c=schema.contentItems,r=schema.contentApprovalRounds,v=schema.contentReviewRevisions;
const missing=()=>({ok:false,reason:'not_found'}), conflict=()=>({ok:false,reason:'conflict'});
const success=(roundId,unchanged=false)=>({ok:true,roundId,...unchanged?{unchanged:true}:{}});
const revisionJoin=()=>and(eq(v.workspaceId,r.workspaceId),eq(v.contentId,r.contentId),eq(v.id,r.revisionId));
const snapshotFields=()=>Object.fromEntries(REVIEW_FIELDS.map(k=>[k,v[k]]));
const snapshot=row=>({...Object.fromEntries(REVIEW_FIELDS.map(k=>[k,row[k]])),platforms:JSON.parse(row.platformsJson)});
// SQL captures current structured fields under the batch lock. There is no
// raw-row JSON, File reference, hidden storage key or caller-supplied snapshot.
const platformSnapshot=()=>sql`(SELECT json_group_array(label) FROM (SELECT cp.label FROM content_platforms cp
  WHERE cp.workspace_id=${c.workspaceId} AND cp.content_id=${c.id} ORDER BY cp.platform_key))`;
function insertFrom(db,table,values,source,condition) {
  const selected=Object.fromEntries(Object.keys(getTableColumns(table)).map(k=>[k,sql`${values[k]??null}`.as(k)]));
  return db.insert(table).select(db.select(selected).from(source).where(condition));
}
function event(actor,current,eventType,metadata,now) {
  return {workspaceId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,clientId:current.clientId,
    serviceEngagementId:current.serviceEngagementId,subjectType:'content',subjectId:current.id,eventType,
    metadata:{contentTitle:current.title,...metadata},occurredAt:now};
}
export async function requestContentApproval(db,{actor,contentId,input,now=new Date()}) {
  const resource=await loadContentResource(db,actor,contentId); if(!resource)return missing();
  const decision=evaluate(actor,{action:'content.approval.request',resource});if(!decision.allowed)return {ok:false,reason:decision.outcome};
  const normalized=normalizeApproval(input,'request');if(!normalized.ok)return normalized;
  const {expectedRevision,requestId}=normalized;
  const retry=async()=>{
    const [row]=await db.select({id:r.id,revision:r.requestRevision,by:r.requestedBy}).from(r).innerJoin(c,approvalJoin())
      .where(and(contentReadCondition(actor),eq(c.id,String(contentId)),eq(r.requestId,requestId))).limit(1);
    return row ? row.revision===expectedRevision && row.by===actor.membershipId ? success(row.id,true):conflict() : null;
  };
  const previous=await retry();if(previous)return previous;
  const current=await getContent(db,actor,contentId);if(!current)return missing();
  if(current.revision!==expectedRevision || current.stage!=='client_review' || !current.clientApprovalRequired || current.visibility!=='client')return conflict();
  const roundId=crypto.randomUUID(),revisionId=crypto.randomUUID(),iso=now.toISOString();
  const condition=and(contentReadCondition(actor),eq(c.id,String(contentId)),eq(c.revision,expectedRevision),eq(c.stage,'client_review'),
    eq(c.clientApprovalRequired,true),eq(c.visibility,'client'),noRequestedApproval());
  const receipt=and(eq(c.id,String(contentId)),eq(c.workspaceId,actor.workspaceId),sql`EXISTS (SELECT 1 FROM content_approval_rounds ar WHERE ar.id=${roundId} AND ar.content_id=${c.id} AND ar.workspace_id=${c.workspaceId})`);
  const results=await db.batch([
    insertFrom(db,v,{id:revisionId,workspaceId:actor.workspaceId,contentId:String(contentId),number:sql`(SELECT coalesce(max(rv.number),0)+1 FROM content_review_revisions rv WHERE rv.workspace_id=${c.workspaceId} AND rv.content_id=${c.id})`,
      ...Object.fromEntries(REVIEW_FIELDS.map(k=>[k,c[k]])),platformsJson:platformSnapshot(),createdAt:iso},c,condition),
    insertFrom(db,r,{id:roundId,workspaceId:actor.workspaceId,contentId:String(contentId),revisionId,number:v.number,requestId,requestRevision:expectedRevision,
      requestedBy:actor.membershipId,requestedAt:iso,status:'requested'},v,eq(v.id,revisionId)),
    activityForMutation(db,c,receipt,event(actor,current,'CONTENT_APPROVAL_REQUESTED',{roundId,revisionId},iso)),
    db.update(c).set({revision:sql`${c.revision}+1`,updatedAt:iso}).where(receipt).returning({id:c.id}),
  ]);
  return results.at(-1).length?success(roundId):(await retry())||conflict();
}

async function finishApproval(db,{actor,roundId,input,now=new Date()},withdraw) {
  const resource=await loadApprovalResource(db,actor,roundId,{portal:!withdraw,retry:true});if(!resource)return missing();
  const decision=evaluate(actor,{action:withdraw?'content.approval.withdraw':'approval.respond',resource});if(!decision.allowed)return {ok:false,reason:decision.outcome};
  const normalized=normalizeApproval(input,withdraw?'withdraw':'respond');if(!normalized.ok)return normalized;
  const status=withdraw?'withdrawn':normalized.decision,feedback=withdraw?null:normalized.feedback,reason=withdraw?normalized.reason:null;
  const read=()=>db.select({round:r,content:{id:c.id,title:c.title,clientId:c.clientId,serviceEngagementId:c.serviceEngagementId,revision:c.revision,stage:c.stage,required:c.clientApprovalRequired}})
    .from(r).innerJoin(c,approvalJoin()).where(and(eq(r.id,String(roundId)),withdraw?contentReadCondition(actor):approvalClientCondition(actor))).limit(1);
  const retry=row=>row?.round.status!=='requested' ? row && row.round.status===status && (withdraw
    ? row.round.withdrawnBy===actor.membershipId && row.round.withdrawalReason===reason && row.round.completionRevision===normalized.expectedRevision
    : row.round.respondedBy===actor.membershipId && row.round.feedback===feedback) ? success(roundId,true):conflict() : null;
  const [row]=await read();if(!row)return missing();
  const previous=retry(row);if(previous)return previous;
  const current=row.content,revision=current.revision;
  if(current.stage!=='client_review'||!current.required || (withdraw && revision!==normalized.expectedRevision))return conflict();
  const iso=now.toISOString(),completionId=crypto.randomUUID();
  // First transition the canonical round, then use this unique commit receipt
  // for the Content update and events. A zero-row loser writes nothing; any
  // later SQL failure rolls every statement back in D1's atomic batch.
  const live=and(withdraw?contentReadCondition(actor):approvalClientCondition(actor),eq(c.revision,revision),eq(c.stage,'client_review'),eq(c.clientApprovalRequired,true));
  const condition=and(eq(r.id,String(roundId)),eq(r.status,'requested'),sql`EXISTS (SELECT 1 FROM content_items WHERE ${approvalJoin()} AND ${live})`);
  const receipt=and(eq(c.workspaceId,actor.workspaceId),eq(c.id,current.id),eq(c.revision,revision),
    sql`EXISTS (SELECT 1 FROM content_approval_rounds ar WHERE ar.workspace_id=${c.workspaceId} AND ar.content_id=${c.id} AND ar.id=${String(roundId)} AND ar.completion_id=${completionId})`);
  const target=status==='approved'?'approved':'revision_requested';
  const results=await db.batch([
    db.update(r).set({status,completionId,completionRevision:revision,...withdraw?{withdrawnBy:actor.membershipId,withdrawnAt:iso,withdrawalReason:reason}:{respondedBy:actor.membershipId,respondedAt:iso,feedback}}).where(condition).returning({id:r.id}),
    activityForMutation(db,c,receipt,event(actor,current,withdraw?'CONTENT_APPROVAL_WITHDRAWN':status==='approved'?'CONTENT_APPROVAL_APPROVED':'CONTENT_APPROVAL_CHANGES_REQUESTED',{roundId,revisionId:row.round.revisionId},iso)),
    ...withdraw?[]:[activityForMutation(db,c,receipt,event(actor,current,'CONTENT_STAGE_CHANGED',{roundId,from:'client_review',to:target,context:feedback,expectedRevision:revision},iso))],
    db.update(c).set({revision:sql`${c.revision}+1`,updatedAt:iso,...withdraw?{}:{stage:target,stageContext:feedback}}).where(receipt).returning({id:c.id}),
  ]);
  if(results.at(-1).length)return success(roundId);
  const [latest]=await read();return latest?retry(latest)||conflict():missing();
}
export const withdrawContentApproval=(db,args)=>finishApproval(db,args,true);
export const respondContentApproval=(db,args)=>finishApproval(db,args,false);

export async function contentApprovalHistory(db,actor,contentId,{page=1}={}) {
  if(!Number.isSafeInteger(page)||page<1||page>1000000)return {items:[],hasMore:false,page:1};
  const rows=await db.select({id:r.id,number:r.number,status:r.status,revisionId:v.id,...snapshotFields(),platformsJson:v.platformsJson,
    requestedAt:r.requestedAt,respondedAt:r.respondedAt,withdrawnAt:r.withdrawnAt,feedback:r.feedback,withdrawalReason:r.withdrawalReason,
    requestedBy:r.requestedBy,respondedBy:r.respondedBy,withdrawnBy:r.withdrawnBy,
    ...Object.fromEntries([['requesterName',r.requestedBy],['responderName',r.respondedBy],['withdrawerName',r.withdrawnBy]].map(([key,member])=>[key,sql`(SELECT u.name FROM user u JOIN workspace_memberships m ON m.user_id=u.id WHERE m.workspace_id=${r.workspaceId} AND m.id=${member})`]))})
    .from(r).innerJoin(c,approvalJoin()).innerJoin(v,revisionJoin()).where(and(eq(c.id,String(contentId)),contentReadCondition(actor)))
    .orderBy(desc(r.number)).limit(APPROVAL_HISTORY_SIZE+1).offset((page-1)*APPROVAL_HISTORY_SIZE);
  return {items:rows.slice(0,APPROVAL_HISTORY_SIZE).map(row=>({id:row.id,number:row.number,status:row.status,revisionId:row.revisionId,
    requestedAt:row.requestedAt,respondedAt:row.respondedAt,withdrawnAt:row.withdrawnAt,feedback:row.feedback,withdrawalReason:row.withdrawalReason,
    requestedBy:row.requestedBy,respondedBy:row.respondedBy,withdrawnBy:row.withdrawnBy,requesterName:row.requesterName,responderName:row.responderName,withdrawerName:row.withdrawerName,snapshot:snapshot(row)})),hasMore:rows.length>APPROVAL_HISTORY_SIZE,page};
}
export async function openContentApproval(db,actor,contentId) {
  const [row]=await db.select({id:r.id,number:r.number}).from(r).innerJoin(c,approvalJoin())
    .where(and(eq(c.id,String(contentId)),contentReadCondition(actor),eq(r.status,'requested'))).limit(1);
  return row||null;
}
export async function getPortalApproval(db,actor,roundId) {
  const [row]=await db.select({id:r.id,number:r.number,requestedAt:r.requestedAt,...snapshotFields(),platformsJson:v.platformsJson})
    .from(r).innerJoin(c,approvalJoin()).innerJoin(v,revisionJoin()).where(and(eq(r.id,String(roundId)),approvalClientCondition(actor),requestedApprovalCondition())).limit(1);
  return row?{id:row.id,number:row.number,requestedAt:row.requestedAt,snapshot:snapshot(row)}:null;
}
export async function approvalRequests(db,actor) {
  const rows=await db.select({id:r.id,title:v.title}).from(r).innerJoin(c,approvalJoin()).innerJoin(v,revisionJoin())
    .where(and(approvalClientCondition(actor),requestedApprovalCondition())).orderBy(desc(r.requestedAt),desc(r.id)).limit(201);
  return {items:rows.slice(0,200),hasMore:rows.length>200};
}
