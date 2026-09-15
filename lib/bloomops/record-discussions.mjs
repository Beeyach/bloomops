import {recordNotificationInsert} from './notification-events.mjs';
import { and, eq, asc, desc, sql, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { schema } from './db.mjs';
import { insertSelected, REQUEST_ID } from './workspaces.mjs';
import { activityForMutation, activityValues } from './activity.mjs';
import { discussionManager, discussionWritable, validDiscussionParent, discussionParentCondition,
  discussionThreadCondition, discussionStartCondition, discussionParentQuery } from './discussion-access.mjs';

const t=schema.recordDiscussionThreads,c=schema.recordDiscussionComments,n=schema.recordDiscussionMentions,w=schema.workspaces,u=schema.user;
const recipient=alias(schema.workspaceMemberships,'discussion_recipient');
const person=alias(u,'discussion_person');
const uuid=id=>typeof id==='string'&&REQUEST_ID.test(id);
const missing=()=>({ok:false,reason:'not_found'});
const invalid=()=>({ok:false,reason:'invalid',error:'Check your message and selected people.'});
const conflict=()=>({ok:false,reason:'conflict',error:'This discussion changed. Refresh it and try again. Your writing is still here.'});
const active=actor=>actor?.status==='active'&&actor.scope;
const pageValid=page=>Number.isSafeInteger(page)&&page>=1&&page<=10000;
const own=(actor,table)=>and(eq(table.authorMembershipId,actor.membershipId),eq(table.authorUserId,actor.userId));
const canManage=(actor)=>discussionManager(actor)?sql`1`:own(actor,t);
const threadRead=(actor,parent,threadId)=>and(discussionThreadCondition(actor,parent),eq(t.id,threadId));
const threadExists=(actor,parent,threadId,extra=sql`1`)=>sql`EXISTS (SELECT 1 FROM record_discussion_threads WHERE ${threadRead(actor,parent,threadId)} AND ${extra})`;
const workspace=(actor,guard)=>and(eq(w.id,actor.workspaceId),guard);
const fingerprint=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const messageInput=input=>input&&typeof input.body==='string'&&!input.body.includes('\0')&&input.body.trim()&&new TextEncoder().encode(input.body.trim()).length<=8000
  &&Array.isArray(input.mentions)&&input.mentions.length<=8&&input.mentions.every(id=>typeof id==='string'&&/^[\w-]{1,128}$/.test(id))&&new Set(input.mentions).size===input.mentions.length;

// Five fixed role branches use SQL-column actor identities. Directory size does
// not create N+1 permission probes or an unbounded snapshot of permitted IDs.
function recipientCondition(actor,parent,audience,threadId,{participants=actor.role==='client'}={}) {
  const roles=audience==='internal'?['owner','admin','project_manager','team_member']:['owner','admin','project_manager','team_member','client'];
  const rolesAllowed=sql.join(roles.map(role=>{
    const candidate={workspaceId:recipient.workspaceId,membershipId:recipient.id,userId:recipient.userId,role,status:'active',scope:{}};
    return sql`(${recipient.role}=${role} AND ${discussionParentCondition(candidate,parent)})`;
  }),sql` OR `);
  return and(eq(recipient.workspaceId,actor.workspaceId),eq(recipient.status,'active'),sql`(${rolesAllowed})`,
    participants ? threadId ? sql`EXISTS (SELECT 1 FROM record_discussion_comments participant WHERE participant.workspace_id=${recipient.workspaceId} AND participant.thread_id=${threadId} AND participant.author_membership_id=${recipient.id} AND participant.author_user_id=${recipient.userId} AND participant.removed_at IS NULL)` : sql`0` : sql`1`);
}
function recipientsGuard(db,actor,parent,audience,threadId,ids) {
  if(!ids.length)return sql`1`;
  return sql`(${db.select({count:sql`count(*)`}).from(recipient).where(and(recipientCondition(actor,parent,audience,threadId),inArray(recipient.id,ids)))})=${ids.length}`;
}
function threadFields(actor){return {id:t.id,audience:t.audience,resolved:t.resolved,revision:t.revision,createdAt:t.createdAt,updatedAt:t.updatedAt,
  canResolve:(discussionWritable(actor)?canManage(actor):sql`0`).as('canResolve')};}

export async function getRecordDiscussions(db,actor,parent,{threadId=null,page=1,resolved=false}={}) {
  if(!active(actor)||!validDiscussionParent(parent)||threadId!==null&&!uuid(threadId)||!pageValid(page)||typeof resolved!=='boolean')return null;
  actor={...actor};parent={...parent};
  const access=discussionParentQuery(db,actor,parent);
  if(!threadId){
    const [parents,rows,clientStart]=await db.batch([access,
      db.select({...threadFields(actor),author:sql`(SELECT name FROM user WHERE id=${t.authorUserId})`,
        preview:sql`(SELECT CASE WHEN msg.removed_at IS NULL THEN substr(msg.body,1,200) ELSE 'Comment removed' END FROM record_discussion_comments msg WHERE msg.workspace_id=${t.workspaceId} AND msg.thread_id=${t.id} ORDER BY msg.created_at,msg.id LIMIT 1)`})
        .from(t).where(and(discussionThreadCondition(actor,parent),eq(t.resolved,resolved?1:0))).orderBy(desc(t.createdAt),desc(t.id)).limit(21).offset((page-1)*20),
      db.select({id:w.id}).from(w).where(workspace(actor,discussionStartCondition(actor,parent,'client')))]);
    return parents[0]?{parent:parents[0],canComment:discussionWritable(actor),canStartClient:!!clientStart.length,threads:rows.slice(0,20),more:rows.length>20,page,resolved}:null;
  }
  const messagesQuery=db.select({id:c.id,body:sql`CASE WHEN ${c.removedAt} IS NULL THEN ${c.body} ELSE NULL END`,revision:c.revision,
    createdAt:c.createdAt,editedAt:c.editedAt,removedAt:c.removedAt,author:u.name,
    canEdit:(discussionWritable(actor)?sql`(${own(actor,c)} AND ${c.removedAt} IS NULL)`:sql`0`).as('canEdit')}).from(c).innerJoin(u,eq(u.id,c.authorUserId))
    .where(and(eq(c.workspaceId,actor.workspaceId),eq(c.threadId,threadId),threadExists(actor,parent,threadId))).orderBy(desc(c.createdAt),desc(c.id)).limit(31).offset((page-1)*30);
  const [parents,threads,messages]=await db.batch([access,db.select(threadFields(actor)).from(t).where(threadRead(actor,parent,threadId)).limit(1),messagesQuery]);
  if(!parents[0]||!threads[0])return null;
  const visible=messages.slice(0,30).reverse(),ids=visible.filter(msg=>!msg.removedAt).map(msg=>msg.id);
  // Mentions are projected only while both viewer and recipient retain access.
  // No historic raw user ID/email is included in the client response.
  const mentions=ids.length?await db.select({commentId:n.commentId,id:n.membershipId,name:person.name}).from(n)
    .innerJoin(recipient,and(eq(recipient.id,n.membershipId),eq(recipient.workspaceId,n.workspaceId),eq(recipient.userId,n.userId)))
    .innerJoin(person,eq(person.id,recipient.userId)).where(and(eq(n.workspaceId,actor.workspaceId),eq(n.threadId,threadId),inArray(n.commentId,ids),
      threadExists(actor,parent,threadId),recipientCondition(actor,parent,threads[0].audience,threadId,{participants:false}))):[];
  // A read spanning an await must not return its earlier private body snapshot
  // if membership, parent visibility or preview authority has since changed.
  if(!(await db.select({id:t.id}).from(t).where(threadRead(actor,parent,threadId)).limit(1)).length)return null;
  return {parent:parents[0],thread:threads[0],messages:visible.map(msg=>({...msg,mentions:mentions.filter(item=>item.commentId===msg.id).map(({id,name})=>({id,name}))})),more:messages.length>30,page,canComment:discussionWritable(actor)};
}

export async function listDiscussionPeople(db,actor,parent,{threadId=null,audience='internal',search=''}={}) {
  if(!active(actor)||!discussionWritable(actor)||!validDiscussionParent(parent)||threadId!==null&&!uuid(threadId)||!['internal','client'].includes(audience)||typeof search!=='string'||search.length>80)return null;
  if(threadId){const [thread]=await db.select({audience:t.audience}).from(t).where(threadRead(actor,parent,threadId)).limit(1);if(!thread)return null;audience=thread.audience;}
  const guard=threadId?threadExists(actor,parent,threadId):discussionStartCondition(actor,parent,audience);
  const [access,rows]=await db.batch([db.select({id:w.id}).from(w).where(workspace(actor,guard)),db.select({id:recipient.id,name:person.name}).from(recipient)
    .innerJoin(person,eq(person.id,recipient.userId)).where(and(guard,recipientCondition(actor,parent,audience,threadId),sql`instr(lower(${person.name}),lower(${search.trim()}))>0`))
    .orderBy(asc(person.name),asc(recipient.id)).limit(21)]);
  return access.length?{people:rows.slice(0,20),more:rows.length>20}:null;
}

function activityReceipt(db,source,condition,details,receiptId){
  const now=new Date().toISOString();
  return insertSelected(db,schema.activityEvents,{id:receiptId,...activityValues(details),occurredAt:now,createdAt:now},source,condition);
}
const receiptWritten=(actor,id)=>sql`EXISTS (SELECT 1 FROM activity_events WHERE id=${id} AND workspace_id=${actor.workspaceId})`;

function event(actor,parent,eventType,threadId,commentId=null){return {workspaceId:actor.workspaceId,eventType,subjectType:parent.type,subjectId:parent.id,
  actorMembershipId:actor.membershipId,actorUserId:actor.userId,
  // No client/service roll-up: discussion history is available at its parent.
  // Body, mentions and internal thread previews never enter generic activity.
  metadata:{threadId,...commentId?{commentId}:{}}};}
async function existingPost(db,actor,parent,input,hash){
  const [row]=await db.select({id:c.id,threadId:c.threadId,hash:c.creationHash,member:c.authorMembershipId,user:c.authorUserId}).from(c)
    .where(and(eq(c.id,input.requestId),eq(c.workspaceId,actor.workspaceId),threadExists(actor,parent,c.threadId))).limit(1);
  return row?row.hash===hash&&row.threadId===(input.threadId||input.requestId)&&row.member===actor.membershipId&&row.user===actor.userId?{ok:true,id:row.id,threadId:row.threadId}:conflict():null;
}

export async function postRecordDiscussion(db,actor,parent,input){
  if(!active(actor)||!discussionWritable(actor))return missing();
  if(!validDiscussionParent(parent)||!input||input.workspaceId!==actor.workspaceId||!uuid(input.requestId)||input.threadId!==null&&!uuid(input.threadId)||!messageInput(input)||!['internal','client'].includes(input.audience))return invalid();
  actor={...actor};parent={...parent};input={...input,body:input.body.trim(),mentions:[...input.mentions].sort()};
  const threadId=input.threadId||input.requestId;
  const hash=await fingerprint([parent.type,parent.id,threadId,input.audience,input.body,input.mentions]);
  const prior=await existingPost(db,actor,parent,input,hash);if(prior)return prior;
  const [record]=await discussionParentQuery(db,actor,parent);if(!record)return missing();
  const audience=input.audience;
  const threadGuard=threadExists(actor,parent,threadId,and(eq(t.resolved,0),eq(t.audience,audience)));
  const guard=and(input.threadId?threadGuard:discussionStartCondition(actor,parent,audience),
    recipientsGuard(db,actor,parent,audience,input.threadId,input.mentions),
    sql`NOT EXISTS (SELECT 1 FROM record_discussion_comments WHERE id=${input.requestId})`,
    input.threadId?sql`1`:sql`NOT EXISTS (SELECT 1 FROM record_discussion_threads WHERE id=${threadId})`);
  const now=new Date().toISOString(),receiptId=crypto.randomUUID();
  const threadValues={id:threadId,workspaceId:actor.workspaceId,parentType:parent.type,parentId:parent.id,
    clientId:parent.type==='client'?parent.id:null,projectId:record.projectId,actionId:parent.type==='action'?parent.id:null,deliverableId:parent.type==='deliverable'?parent.id:null,
    audience,authorMembershipId:actor.membershipId,authorUserId:actor.userId,resolved:0,revision:1,lastRequestId:input.requestId,createdAt:now,updatedAt:now};
  const mutation=input.threadId?db.update(t).set({revision:sql`${t.revision}+1`,lastRequestId:input.requestId,updatedAt:now}).where(and(eq(t.id,threadId),guard))
    :insertSelected(db,t,threadValues,w,workspace(actor,guard));
  const written=and(receiptWritten(actor,receiptId),threadExists(actor,parent,threadId,and(eq(t.lastRequestId,input.requestId),eq(t.resolved,0))));
  const commentValues={id:input.requestId,workspaceId:actor.workspaceId,threadId,authorMembershipId:actor.membershipId,authorUserId:actor.userId,body:input.body,
    creationHash:hash,revision:1,lastRequestId:input.requestId,editedAt:null,removedAt:null,createdAt:now};
  await db.batch([activityReceipt(db,w,workspace(actor,guard),event(actor,parent,'RECORD_COMMENT_ADDED',threadId,input.requestId),receiptId),mutation,
    insertSelected(db,c,commentValues,w,workspace(actor,and(written,sql`NOT EXISTS (SELECT 1 FROM record_discussion_comments WHERE id=${input.requestId})`))),
    ...mentionInserts(db,actor,input.mentions,threadId,input.requestId,written),
    recordNotificationInsert(db,actor,parent,{eventId:receiptId,threadId,commentId:input.requestId,now})]);
  return await existingPost(db,actor,parent,input,hash)||((await discussionParentQuery(db,actor,parent)).length?conflict():missing());
}
function mentionInserts(db,actor,ids,threadId,commentId,guard){
  return ids.map(id=>insertSelected(db,n,{workspaceId:actor.workspaceId,threadId,commentId,membershipId:id,userId:recipient.userId},recipient,
    and(eq(recipient.id,id),eq(recipient.workspaceId,actor.workspaceId),guard,
      sql`EXISTS (SELECT 1 FROM record_discussion_comments WHERE id=${commentId} AND workspace_id=${actor.workspaceId} AND thread_id=${threadId})`,
      sql`NOT EXISTS (SELECT 1 FROM record_discussion_mentions WHERE comment_id=${commentId} AND membership_id=${id})`)));
}

export async function editRecordDiscussion(db,actor,parent,input){
  if(!active(actor)||!discussionWritable(actor))return missing();
  if(!validDiscussionParent(parent)||!input||input.workspaceId!==actor.workspaceId||!uuid(input.requestId)||!uuid(input.threadId)||!uuid(input.commentId)
    ||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.remove!=='boolean'||!input.remove&&!messageInput(input))return invalid();
  actor={...actor};parent={...parent};input={...input,body:input.remove?null:input.body.trim(),mentions:input.remove?[]:[...input.mentions].sort()};
  const read=and(eq(c.id,input.commentId),eq(c.workspaceId,actor.workspaceId),eq(c.threadId,input.threadId),own(actor,c),threadExists(actor,parent,input.threadId));
  const [old]=await db.select().from(c).where(read).limit(1);if(!old)return missing();
  if(old.lastRequestId===input.requestId)return editReplay(db,actor,parent,input,old);
  const [thread]=await db.select({audience:t.audience}).from(t).where(threadRead(actor,parent,input.threadId)).limit(1);if(!thread)return missing();
  const guard=and(read,eq(c.revision,input.expectedRevision),sql`${c.removedAt} IS NULL`,recipientsGuard(db,actor,parent,thread.audience,input.threadId,input.mentions));
  const now=new Date().toISOString(),receiptId=crypto.randomUUID();
  const updated=and(receiptWritten(actor,receiptId),sql`EXISTS (SELECT 1 FROM record_discussion_comments WHERE id=${input.commentId} AND workspace_id=${actor.workspaceId} AND last_request_id=${input.requestId} AND revision=${input.expectedRevision+1})`);
  const [,rows]=await db.batch([activityReceipt(db,c,guard,event(actor,parent,input.remove?'RECORD_COMMENT_REMOVED':'RECORD_COMMENT_EDITED',input.threadId,input.commentId),receiptId),
    db.update(c).set({...(input.remove?{removedAt:now}:{body:input.body,editedAt:now}),revision:sql`${c.revision}+1`,lastRequestId:input.requestId}).where(guard).returning({revision:c.revision}),
    db.delete(n).where(and(eq(n.workspaceId,actor.workspaceId),eq(n.commentId,input.commentId),updated)),
    ...mentionInserts(db,actor,input.mentions,input.threadId,input.commentId,updated),
    db.update(t).set({revision:sql`${t.revision}+1`,lastRequestId:input.requestId,updatedAt:now}).where(and(threadRead(actor,parent,input.threadId),updated))]);
  const [after]=await db.select().from(c).where(read).limit(1);if(!after)return missing();
  return rows[0]?{ok:true,id:input.commentId,threadId:input.threadId,revision:rows[0].revision}:editReplay(db,actor,parent,input,after);
}

async function editReplay(db,actor,parent,input,row){
  if(row.lastRequestId!==input.requestId||row.revision!==input.expectedRevision+1||(input.remove?!row.removedAt:row.removedAt||row.body!==input.body))return conflict();
  const selected=await db.select({id:n.membershipId}).from(n).where(and(eq(n.workspaceId,actor.workspaceId),eq(n.commentId,input.commentId))).orderBy(asc(n.membershipId));
  if(JSON.stringify(selected.map(r=>r.id))!==JSON.stringify(input.mentions))return conflict();
  if(!(await db.select({id:t.id}).from(t).where(threadRead(actor,parent,input.threadId)).limit(1)).length)return missing();
  return {ok:true,id:row.id,threadId:row.threadId,revision:row.revision};
}

export async function resolveRecordDiscussion(db,actor,parent,input){
  if(!active(actor)||!discussionWritable(actor))return missing();
  if(!validDiscussionParent(parent)||!input||input.workspaceId!==actor.workspaceId||!uuid(input.requestId)||!uuid(input.threadId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.resolved!=='boolean')return invalid();
  actor={...actor};parent={...parent};input={...input};
  const read=and(threadRead(actor,parent,input.threadId),canManage(actor));
  const [before]=await db.select({revision:t.revision,resolved:t.resolved,lastRequestId:t.lastRequestId}).from(t).where(read).limit(1);
  if(!before)return missing();
  if(before.lastRequestId===input.requestId)return before.revision===input.expectedRevision+1&&!!before.resolved===input.resolved?{ok:true,revision:before.revision}:conflict();
  const guard=and(read,eq(t.revision,input.expectedRevision),eq(t.resolved,input.resolved?0:1));
  const [,rows]=await db.batch([activityForMutation(db,t,guard,event(actor,parent,input.resolved?'RECORD_DISCUSSION_RESOLVED':'RECORD_DISCUSSION_REOPENED',input.threadId)),
    db.update(t).set({resolved:input.resolved?1:0,revision:sql`${t.revision}+1`,lastRequestId:input.requestId,updatedAt:new Date().toISOString()}).where(guard).returning({revision:t.revision})]);
  const [after]=await db.select({revision:t.revision,resolved:t.resolved,lastRequestId:t.lastRequestId}).from(t).where(read).limit(1);if(!after)return missing();
  return rows[0]?{ok:true,revision:rows[0].revision}:after.lastRequestId===input.requestId&&after.revision===input.expectedRevision+1&&!!after.resolved===input.resolved?{ok:true,revision:after.revision}:conflict();
}

export async function recordDiscussionAccess(db,actor,parent,threadId=null){
  if(!active(actor)||!validDiscussionParent(parent)||threadId!==null&&!uuid(threadId))return false;
  return Boolean((await db.select({id:w.id}).from(w).where(workspace(actor,threadId?threadExists(actor,parent,threadId):discussionParentCondition(actor,parent))).limit(1)).length);
}
