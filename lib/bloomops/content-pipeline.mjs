import { and, eq, isNull, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { internalContentWriteCondition as contentReadCondition, loadInternalContentResource } from './content-internal-access.mjs';
import { getInternalContent as getContent } from './content.mjs';
import { activityForMutation } from './activity.mjs';
import { contentNextStages, normalizeContentTransition } from './content-pipeline-values.mjs';
import { noRequestedApproval } from './content-approval-access.mjs';
const c=schema.contentItems, a=schema.activityEvents;
const conflict=()=>({ok:false,reason:'conflict'});
export async function transitionContent(db,{actor,contentId,input,now=new Date()}) {
  const resource=await loadInternalContentResource(db,actor,contentId,{write:true});
  if (!resource) return {ok:false,reason:'not_found'};
  const decision=evaluate(actor,{action:'content.transition',resource});
  if (!decision.allowed) return {ok:false,reason:decision.outcome};
  const normalized=normalizeContentTransition(input); if (!normalized.ok) return normalized;
  const {targetStage,context,expectedRevision}=normalized;
  const success=(unchanged=false)=>({ok:true,contentId,...(unchanged?{unchanged:true}:{})});
  // A revision is consumed exactly once. Immutable transition evidence proves
  // this specific operation, even after later edits or another production pass.
  // Current authorization still gates acknowledgement; activity is never the
  // mutable source of current stage/context and a retry never rewrites the row.
  const retry=async()=>{
    const [row]=await db.select({metadata:a.metadataJson}).from(c).innerJoin(a,and(eq(a.workspaceId,c.workspaceId),eq(a.subjectType,'content'),eq(a.subjectId,c.id),eq(a.eventType,'CONTENT_STAGE_CHANGED')))
      .where(and(contentReadCondition(actor),eq(c.id,String(contentId)),sql`json_extract(${a.metadataJson},'$.roundId') IS NULL`,sql`json_extract(${a.metadataJson},'$.expectedRevision')=${expectedRevision}`)).limit(1);
    if (!row) return null;
    const committed=JSON.parse(row.metadata);
    return committed.to===targetStage && committed.context===context ? success(true) : conflict();
  };
  const previous=await retry(); if (previous) return previous;
  const current=await getContent(db,actor,contentId); if (!current) return {ok:false,reason:'not_found'};
  if (current.revision!==expectedRevision) return conflict();
  if (!contentNextStages(current).includes(targetStage)) return {ok:false,reason:'invalid',errors:{form:'Choose an available next stage.'}};
  const condition=and(contentReadCondition(actor),noRequestedApproval(),eq(c.id,String(contentId)),eq(c.revision,expectedRevision),eq(c.stage,current.stage),isNull(c.publishedAt),
    ...['recordingRequired','internalReviewRequired','clientApprovalRequired'].map(k=>eq(c[k],current[k])));
  const iso=now.toISOString();
  const results=await db.batch([
    activityForMutation(db,c,condition,{workspaceId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,clientId:current.clientId,serviceEngagementId:current.serviceEngagementId,
      subjectType:'content',subjectId:current.id,eventType:'CONTENT_STAGE_CHANGED',metadata:{contentTitle:current.title,from:current.stage,to:targetStage,context,expectedRevision},occurredAt:iso}),
    db.update(c).set({stage:targetStage,stageContext:context,publishedAt:targetStage==='published'?iso:null,revision:sql`${c.revision}+1`,updatedAt:iso}).where(condition).returning({id:c.id}),
  ]);
  return results[1].length ? success() : (await retry()) || conflict();
}
