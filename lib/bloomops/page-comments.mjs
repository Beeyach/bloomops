import {pageNotificationInsert} from './notification-events.mjs';
import {and,eq,asc,desc,sql,exists} from 'drizzle-orm';
import {schema} from './db.mjs';
import {pageReadCondition,pageCommentCondition,pageEditCondition} from './page-access.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
const p=schema.workspacePages,t=schema.pageCommentThreads,c=schema.pageComments,m=schema.workspaceMemberships,u=schema.user;
const validId=id=>typeof id==='string'&&REQUEST_ID.test(id);
const active=a=>a?.status==='active';
const scope=(a,id)=>and(eq(p.workspaceId,a.workspaceId),eq(p.id,id),pageReadCondition(a,p.id));
const canRead=(a,id)=>sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE id=${id} AND workspace_id=${a.workspaceId} AND ${pageReadCondition(a,id)})`;
const canWrite=(a,id)=>sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE id=${id} AND workspace_id=${a.workspaceId} AND ${pageCommentCondition(a,id)})`;
const manage=(a,id)=>sql`(${pageEditCondition(a,id)} OR (${t.authorMembershipId}=${a.membershipId} AND ${t.authorUserId}=${a.userId}))`;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const missing=()=>({ok:false,reason:'not_found'}),invalid=()=>({ok:false,reason:'invalid',error:'Check the comment and try again.'}),conflict=()=>({ok:false,reason:'conflict',error:'This discussion changed. Refresh it before trying again. Your comment is still here.'});
const threadFields=a=>({id:t.id,resolved:t.resolved,revision:t.revision,createdAt:t.createdAt,canResolve:sql`(${pageCommentCondition(a,t.pageId)} AND ${manage(a,t.pageId)})`.as('canResolve')});
export async function getPageComments(db,actor,id,{threadId=null,page=1,resolved=false}={}){
 if(!active(actor)||!validId(id)||threadId!==null&&!validId(threadId)||!Number.isSafeInteger(page)||page<1||page>10000||typeof resolved!=='boolean')return null;
 actor={...actor};
 const authority=db.select({canComment:pageCommentCondition(actor,p.id).as('canComment')}).from(p).where(scope(actor,id));
 const condition=and(eq(t.workspaceId,actor.workspaceId),eq(t.pageId,id),canRead(actor,id));
 if(threadId){
  const [access,thread,messages]=await db.batch([authority,db.select(threadFields(actor)).from(t).where(and(condition,eq(t.id,threadId))),db.select({id:c.id,body:c.body,createdAt:c.createdAt,author:u.name}).from(c).innerJoin(m,and(eq(m.id,c.authorMembershipId),eq(m.workspaceId,c.workspaceId))).innerJoin(u,eq(u.id,c.authorUserId)).where(and(eq(c.workspaceId,actor.workspaceId),eq(c.pageId,id),eq(c.threadId,threadId),canRead(actor,id))).orderBy(asc(c.createdAt),asc(c.id)).limit(51).offset((page-1)*50)]);
  return access[0]&&thread[0]?{...access[0],thread:thread[0],messages:messages.slice(0,50),more:messages.length>50,page}:null;
 }
 const [access,rows]=await db.batch([authority,db.select({...threadFields(actor),preview:sql`(SELECT msg.body FROM bloomops_page_comments msg WHERE msg.thread_id=bloomops_page_comment_threads.id AND msg.workspace_id=bloomops_page_comment_threads.workspace_id AND msg.page_id=bloomops_page_comment_threads.page_id ORDER BY msg.created_at,msg.id LIMIT 1)`,author:sql`(SELECT name FROM user WHERE id=bloomops_page_comment_threads.author_user_id)`,count:sql`(SELECT count(*) FROM bloomops_page_comments msg WHERE msg.thread_id=bloomops_page_comment_threads.id AND msg.workspace_id=bloomops_page_comment_threads.workspace_id AND msg.page_id=bloomops_page_comment_threads.page_id)`}).from(t).where(and(condition,eq(t.resolved,resolved?1:0))).orderBy(desc(t.createdAt),desc(t.id)).limit(31).offset((page-1)*30)]);
 return access[0]?{...access[0],threads:rows.slice(0,30),more:rows.length>30,page}:null;
}
async function existing(db,actor,id,input){
 const row=(await db.select({id:c.id,body:c.body,threadId:c.threadId,author:c.authorMembershipId,authorUserId:c.authorUserId}).from(c).innerJoin(t,eq(t.id,c.threadId)).where(and(eq(c.id,input.requestId),eq(c.workspaceId,actor.workspaceId),eq(c.pageId,id),canWrite(actor,id))))[0];
 if(!row)return null;
 // A root request uses its request ID as the thread ID; retries do not reopen it.
 return row.body===input.body&&row.author===actor.membershipId&&row.authorUserId===actor.userId&&row.threadId===(input.threadId||input.requestId)?{ok:true,threadId:row.threadId,id:row.id}:conflict();
}
export async function postPageComment(db,actor,id,input){
 if(!active(actor))return missing();
 if(!validId(id)||!exact(input,['workspaceId','requestId','threadId','expectedRevision','body'])||input.workspaceId!==actor.workspaceId||!validId(input.requestId)||input.threadId!==null&&!validId(input.threadId)||typeof input.body!=='string'||input.body.includes('\0')||!input.body.trim()||new TextEncoder().encode(input.body).length>8000||input.threadId===null&&input.expectedRevision!==null||input.threadId!==null&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1))return invalid();
 actor={...actor};input={...input,body:input.body.trim()};const duplicate=await existing(db,actor,id,input);if(duplicate)return duplicate;
 const eventId=crypto.randomUUID(),threadId=input.threadId||input.requestId,now=new Date().toISOString(),threadGuard=and(eq(t.id,threadId),eq(t.workspaceId,actor.workspaceId),eq(t.pageId,id),eq(t.resolved,0),eq(t.revision,input.expectedRevision||1));
 const guard=and(canWrite(actor,id),sql`NOT EXISTS(SELECT 1 FROM bloomops_page_comments WHERE id=${input.requestId})`,input.threadId?exists(db.select({id:t.id}).from(t).where(threadGuard)):sql`NOT EXISTS(SELECT 1 FROM bloomops_page_comment_threads WHERE id=${threadId})`);
 const mutation=input.threadId?db.update(t).set({revision:sql`${t.revision}+1`,lastRequestId:input.requestId,updatedAt:now}).where(and(threadGuard,guard)):insertSelected(db,t,{id:threadId,workspaceId:actor.workspaceId,pageId:id,authorMembershipId:actor.membershipId,authorUserId:actor.userId,resolved:0,revision:1,lastRequestId:input.requestId,createdAt:now,updatedAt:now},p,and(eq(p.id,id),guard));
 const written=and(canWrite(actor,id),sql`NOT EXISTS(SELECT 1 FROM bloomops_page_comments WHERE id=${input.requestId})`,sql`EXISTS(SELECT 1 FROM bloomops_page_comment_threads WHERE id=${threadId} AND page_id=${id} AND workspace_id=${actor.workspaceId} AND last_request_id=${input.requestId} AND revision=${input.threadId?input.expectedRevision+1:1})`);
 await db.batch([
  activityForMutation(db,p,and(eq(p.id,id),guard),{workspaceId:actor.workspaceId,eventType:'PAGE_COMMENT_ADDED',subjectType:'page',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:now},eventId),mutation,
  insertSelected(db,c,{id:input.requestId,workspaceId:actor.workspaceId,pageId:id,threadId,authorMembershipId:actor.membershipId,authorUserId:actor.userId,body:input.body,createdAt:now},p,and(eq(p.id,id),written)),
  pageNotificationInsert(db,actor,{eventId,pageId:id,threadId,commentId:input.requestId,now}),
 ]);
 const result=await existing(db,actor,id,input);if(result)return result;
 return (await db.select({id:p.id}).from(p).where(and(eq(p.id,id),canWrite(actor,id)))).length?conflict():missing();
}
export async function resolvePageComment(db,actor,id,input){
 if(!active(actor))return missing();
 if(!validId(id)||!exact(input,['workspaceId','threadId','expectedRevision','resolved'])||input.workspaceId!==actor.workspaceId||!validId(input.threadId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.resolved!=='boolean')return invalid();
 actor={...actor};input={...input};const condition=and(eq(t.id,input.threadId),eq(t.workspaceId,actor.workspaceId),eq(t.pageId,id),eq(t.revision,input.expectedRevision),canWrite(actor,id),manage(actor,id));
 const [,rows]=await db.batch([activityForMutation(db,t,condition,{workspaceId:actor.workspaceId,eventType:input.resolved?'PAGE_DISCUSSION_RESOLVED':'PAGE_DISCUSSION_REOPENED',subjectType:'page',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:new Date().toISOString()}),db.update(t).set({resolved:input.resolved?1:0,revision:sql`${t.revision}+1`,updatedAt:new Date().toISOString()}).where(condition).returning({revision:t.revision})]);
 if(rows[0])return {ok:true,...rows[0]};
 return (await db.select({id:t.id}).from(t).where(and(eq(t.id,input.threadId),eq(t.workspaceId,actor.workspaceId),eq(t.pageId,id),canWrite(actor,id),manage(actor,id)))).length?conflict():missing();
}
