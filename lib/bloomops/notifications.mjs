import {and,eq,sql,desc} from 'drizzle-orm';
import {schema} from './db.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {liveProjectActor} from './project-access.mjs';
import {discussionTypedParentCondition,DISCUSSION_TYPES} from './discussion-access.mjs';
import {pageReadCondition} from './page-access.mjs';
import {previewContext} from './preview-policy.mjs';
const n=schema.notifications,e=schema.activityEvents,t=schema.recordDiscussionThreads,c=schema.recordDiscussionComments;
const prefs=schema.notificationPreferences,mutes=schema.notificationMutes,w=schema.workspaces;
export const NOTIFICATION_CATEGORIES=['mentions','replies','assignments'];
const active=a=>a?.status==='active'&&a.scope&&!previewContext(a);
const missing=()=>({ok:false,reason:'not_found'}),invalid=()=>({ok:false,reason:'invalid',error:'Check the notification settings and try again.'});
const own=a=>and(eq(w.id,a.workspaceId),liveProjectActor(a));
const bound=(a,v)=>v?.workspaceId===a.workspaceId&&v?.userId===a.userId&&v?.membershipId===a.membershipId;
const categoryValid=k=>k==='all'||NOTIFICATION_CATEGORIES.includes(k);
const recordRead=a=>sql`EXISTS (SELECT 1 FROM record_discussion_threads JOIN record_discussion_comments ON ${c.threadId}=${t.id} AND ${c.workspaceId}=${t.workspaceId}
  WHERE ${t.id}=${n.recordThreadId} AND ${t.workspaceId}=${a.workspaceId} AND ${c.id}=${n.recordCommentId} AND ${c.removedAt} IS NULL
  AND ${a.role==='client'?eq(t.audience,'client'):sql`1`} AND (${sql.join(DISCUSSION_TYPES.map(type=>and(eq(t.parentType,type),discussionTypedParentCondition(a,type,t.parentId))),sql` OR `)}))`;
const pageRead=a=>sql`EXISTS (SELECT 1 FROM bloomops_page_comments pc JOIN bloomops_pages pg ON pg.id=pc.page_id AND pg.workspace_id=pc.workspace_id
 WHERE pc.id=${n.pageCommentId} AND pc.thread_id=${n.pageThreadId} AND pc.page_id=${n.pageId} AND pc.workspace_id=${a.workspaceId} AND ${pageReadCondition(a,n.pageId)})`;
const taskRead=a=>and(discussionTypedParentCondition(a,'action',n.actionId),sql`EXISTS (SELECT 1 FROM actions WHERE id=${n.actionId} AND workspace_id=${a.workspaceId} AND assignee_membership_id=${a.membershipId})`);
export function notificationReadCondition(a){
 if(!active(a))return sql`0`;
 return and(eq(n.workspaceId,a.workspaceId),eq(n.membershipId,a.membershipId),eq(n.userId,a.userId),liveProjectActor(a),
  sql`((${n.recordThreadId} IS NOT NULL AND ${recordRead(a)}) OR (${n.pageThreadId} IS NOT NULL AND ${pageRead(a)}) OR (${n.actionId} IS NOT NULL AND ${taskRead(a)}))`);
}
function selection(a){return {
 id:n.id,category:n.category,readAt:n.readAt,createdAt:n.createdAt,
 author:sql`coalesce((SELECT name FROM user WHERE id=${e.actorUserId}),'A teammate')`.as('author'),
 type:sql`CASE WHEN ${n.actionId} IS NOT NULL THEN 'action' WHEN ${n.pageId} IS NOT NULL THEN 'page' ELSE (SELECT parent_type FROM record_discussion_threads WHERE id=${n.recordThreadId}) END`.as('type'),
 targetId:sql`coalesce(${n.actionId},${n.pageId},(SELECT parent_id FROM record_discussion_threads WHERE id=${n.recordThreadId}))`.as('targetId'),
 threadId:sql`coalesce(${n.recordThreadId},${n.pageThreadId})`.as('threadId'),
 title:sql`CASE WHEN ${n.actionId} IS NOT NULL THEN (SELECT title FROM actions WHERE id=${n.actionId}) WHEN ${n.pageId} IS NOT NULL THEN (SELECT title FROM bloomops_pages WHERE id=${n.pageId}) ELSE
 (SELECT CASE rt.parent_type WHEN 'client' THEN (SELECT name FROM bloomops_clients WHERE id=rt.parent_id)
 WHEN 'project' THEN (SELECT ${a.role==='client'?sql`coalesce(client_label,name)`:sql`name`} FROM projects WHERE id=rt.parent_id)
 WHEN 'action' THEN (SELECT title FROM actions WHERE id=rt.parent_id)
 WHEN 'deliverable' THEN (SELECT ${a.role==='client'?sql`coalesce(client_label,'Deliverable')`:sql`title`} FROM deliverables WHERE id=rt.parent_id) END FROM record_discussion_threads rt WHERE rt.id=${n.recordThreadId}) END`.as('title'),
};}
function destination(a,row){const prefix=a.role==='client'?'/portal':'';
 return row.category==='assignments'?`/work/actions/${row.targetId}`:row.type==='page'?`${prefix}/pages/${row.targetId}?discussion=${row.threadId}`:`${prefix}/discussions/${row.type}/${row.targetId}?threadId=${row.threadId}`;
}
const joined=(db,a)=>db.select(selection(a)).from(n).innerJoin(e,and(eq(e.id,n.eventId),eq(e.workspaceId,n.workspaceId)));
export async function listNotifications(db,actor,{page=1,category='all',unread=false}={}){
 if(!active(actor)||!Number.isSafeInteger(page)||page<1||page>10000||!categoryValid(category)||typeof unread!=='boolean')return null;
 actor={...actor};const guard=notificationReadCondition(actor),filtered=and(guard,category==='all'?sql`1`:eq(n.category,category));
 const [access,rows,counts]=await db.batch([db.select({id:w.id}).from(w).where(own(actor)),
  joined(db,actor).where(and(filtered,unread?sql`${n.readAt} IS NULL`:sql`1`)).orderBy(desc(n.createdAt),desc(n.id)).limit(21).offset((page-1)*20),
  db.select({unread:sql`coalesce(sum(CASE WHEN ${n.readAt} IS NULL THEN 1 ELSE 0 END),0)`.as('unread'),cutoff:sql`coalesce(max(${n.sequence}),0)`.as('cutoff')}).from(n).where(filtered)]);
 return access.length?{items:rows.slice(0,20).map(row=>({...row,href:destination(actor,row)})),more:rows.length>20,page,category,unread,...counts[0]}:null;
}
function threadCondition(actor,kind,id){
 if(kind==='record')return sql`EXISTS (SELECT 1 FROM record_discussion_threads WHERE id=${id} AND workspace_id=${actor.workspaceId} AND ${actor.role==='client'?eq(t.audience,'client'):sql`1`}
 AND (${sql.join(DISCUSSION_TYPES.map(type=>and(eq(t.parentType,type),discussionTypedParentCondition(actor,type,t.parentId))),sql` OR `)}))`;
 if(kind==='page')return sql`EXISTS (SELECT 1 FROM bloomops_page_comment_threads pt JOIN bloomops_pages pg ON pg.id=pt.page_id AND pg.workspace_id=pt.workspace_id WHERE pt.id=${id} AND pt.workspace_id=${actor.workspaceId} AND ${pageReadCondition(actor,sql`pt.page_id`)})`;
 return sql`0`;
}
export async function notificationSettings(db,actor,{threadId=null,kind=null}={}){
 if(!active(actor)||threadId!==null&&(!REQUEST_ID.test(threadId)||!['record','page'].includes(kind)))return null;
 actor={...actor};const guard=and(own(actor),threadId?threadCondition(actor,kind,threadId):sql`1`);
 const [rows]=await db.select({mentions:sql`coalesce((SELECT mentions FROM notification_preferences WHERE workspace_id=${actor.workspaceId} AND membership_id=${actor.membershipId} AND user_id=${actor.userId}),1)`.as('mentions'),
 replies:sql`coalesce((SELECT replies FROM notification_preferences WHERE workspace_id=${actor.workspaceId} AND membership_id=${actor.membershipId} AND user_id=${actor.userId}),1)`.as('replies'),
 assignments:sql`coalesce((SELECT assignments FROM notification_preferences WHERE workspace_id=${actor.workspaceId} AND membership_id=${actor.membershipId} AND user_id=${actor.userId}),1)`.as('assignments'),
 muted:threadId?sql`EXISTS (SELECT 1 FROM notification_mutes WHERE workspace_id=${actor.workspaceId} AND membership_id=${actor.membershipId} AND user_id=${actor.userId} AND thread_id=${threadId} AND kind=${kind})`.as('muted'):sql`0`.as('muted')}).from(w).where(guard);
 return rows?Object.fromEntries(Object.entries(rows).map(([key,value])=>[key,!!value])):null;
}
export async function changeNotification(db,actor,input){
 if(!active(actor)||!bound(actor,input))return missing();actor={...actor};input={...input};
 if(input.action==='preferences'){
  if(!NOTIFICATION_CATEGORIES.includes(input.category)||typeof input.enabled!=='boolean')return invalid();
  const values={workspaceId:actor.workspaceId,membershipId:actor.membershipId,userId:actor.userId,mentions:1,replies:1,assignments:1,[input.category]:input.enabled?1:0};
  await insertSelected(db,prefs,values,w,own(actor)).onConflictDoUpdate({target:[prefs.workspaceId,prefs.membershipId,prefs.userId],set:{[input.category]:input.enabled?1:0},setWhere:liveProjectActor(actor)});
  return await notificationSettings(db,actor)?{ok:true}:missing();
 }
 if(input.action==='mute'){
  if(!REQUEST_ID.test(input.threadId||'')||!['record','page'].includes(input.kind)||typeof input.muted!=='boolean')return invalid();
  const guard=and(liveProjectActor(actor),threadCondition(actor,input.kind,input.threadId));
  await (input.muted?insertSelected(db,mutes,{workspaceId:actor.workspaceId,membershipId:actor.membershipId,userId:actor.userId,threadId:input.threadId,kind:input.kind,recordThreadId:input.kind==='record'?input.threadId:null,pageThreadId:input.kind==='page'?input.threadId:null},w,and(eq(w.id,actor.workspaceId),guard)).onConflictDoNothing():db.delete(mutes).where(and(eq(mutes.workspaceId,actor.workspaceId),eq(mutes.membershipId,actor.membershipId),eq(mutes.userId,actor.userId),eq(mutes.threadId,input.threadId),eq(mutes.kind,input.kind),guard)));
  return await notificationSettings(db,actor,input)?{ok:true}:missing();
 }
 const guard=notificationReadCondition(actor),now=new Date().toISOString();
 if(input.action==='markAll'){
  if(!categoryValid(input.category)||!Number.isSafeInteger(input.cutoff)||input.cutoff<0)return invalid();
  const [access]=await db.batch([db.select({id:w.id}).from(w).where(own(actor)),db.update(n).set({readAt:now}).where(and(guard,sql`${n.readAt} IS NULL`,sql`${n.sequence}<=${input.cutoff}`,input.category==='all'?sql`1`:eq(n.category,input.category)))]);
  return access.length?{ok:true}:missing();
 }
 if(!['read','open'].includes(input.action)||typeof input.id!=='string'||input.id.length>180||input.action==='read'&&typeof input.read!=='boolean')return invalid();
 const condition=and(guard,eq(n.id,input.id));
 const [,rows]=await db.batch([db.update(n).set({readAt:input.action==='open'||input.read?sql`coalesce(${n.readAt},${now})`:null}).where(condition),joined(db,actor).where(condition).limit(1)]);
 return rows[0]?{ok:true,...input.action==='open'?{href:destination(actor,rows[0])}:{}}:missing();
}
