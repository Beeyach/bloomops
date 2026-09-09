import { and, eq, exists, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { contentReadCondition, loadContentResource } from './content-access.mjs';
import { getContent } from './content.mjs';
import { activityForMutation } from './activity.mjs';
import { normalizePlatforms, samePlatforms } from './content-platform-values.mjs';
import { noRequestedApproval } from './content-approval-access.mjs';
const c=schema.contentItems,p=schema.contentPlatforms,a=schema.activityEvents;
const conflict=()=>({ok:false,reason:'conflict'});
export async function setContentPlatforms(db,{actor,contentId,input,now=new Date()}) {
  const resource=await loadContentResource(db,actor,contentId);if(!resource)return {ok:false,reason:'not_found'};
  const decision=evaluate(actor,{action:'content.platforms',resource});if(!decision.allowed)return {ok:false,reason:decision.outcome};
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['platforms','expectedRevision'].includes(k))||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)return {ok:false,reason:'invalid',errors:{form:'Use the platform form and current Content revision.'}};
  const normalized=normalizePlatforms(input.platforms);if(!normalized.ok)return normalized;
  const {platforms}=normalized,{expectedRevision}=input,success=(unchanged=false)=>({ok:true,contentId,...unchanged?{unchanged:true}:{}});
  const retry=async()=>{
    const [row]=await db.select({metadata:a.metadataJson}).from(c).innerJoin(a,and(eq(a.workspaceId,c.workspaceId),eq(a.subjectType,'content'),eq(a.subjectId,c.id),eq(a.eventType,'CONTENT_PLATFORMS_CHANGED')))
      .where(and(contentReadCondition(actor),eq(c.id,String(contentId)),sql`json_extract(${a.metadataJson},'$.expectedRevision')=${expectedRevision}`)).limit(1);
    return row ? samePlatforms(JSON.parse(row.metadata).platforms,platforms)?success(true):conflict() : null;
  };
  const previous=await retry();if(previous)return previous;
  const current=await getContent(db,actor,contentId);if(!current)return {ok:false,reason:'not_found'};
  if(current.revision!==expectedRevision)return conflict();
  if(samePlatforms(current.platforms,platforms))return success(true);
  const condition=and(contentReadCondition(actor),noRequestedApproval(),eq(c.id,String(contentId)),eq(c.revision,expectedRevision));
  const eligible=exists(db.select({id:c.id}).from(c).where(condition));
  const results=await db.batch([
    activityForMutation(db,c,condition,{workspaceId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,clientId:current.clientId,serviceEngagementId:current.serviceEngagementId,subjectType:'content',subjectId:current.id,eventType:'CONTENT_PLATFORMS_CHANGED',metadata:{contentTitle:current.title,expectedRevision,platforms},occurredAt:now.toISOString()}),
    db.delete(p).where(and(eq(p.workspaceId,actor.workspaceId),eq(p.contentId,String(contentId)),eligible)),
    ...platforms.map(platform=>db.insert(p).select(db.select({workspaceId:sql`${actor.workspaceId}`.as('workspaceId'),contentId:sql`${String(contentId)}`.as('contentId'),platformKey:sql`${platform.key}`.as('platformKey'),label:sql`${platform.label}`.as('label')}).from(c).where(condition))),
    db.update(c).set({revision:sql`${c.revision}+1`,updatedAt:now.toISOString()}).where(condition).returning({id:c.id}),
  ]);
  return results.at(-1).length ? success() : (await retry())||conflict();
}
