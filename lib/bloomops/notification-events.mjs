// Included in canonical write batches: no deferred delivery or private snapshots.
import {and,eq,sql} from 'drizzle-orm';
import {alias} from 'drizzle-orm/sqlite-core';
import {schema} from './db.mjs';
import {insertSelected} from './workspaces.mjs';
import {discussionTypedParentCondition} from './discussion-access.mjs';
import {pageReadCondition} from './page-access.mjs';
import {liveProjectActor} from './project-access.mjs';
const n=schema.notifications,r=alias(schema.workspaceMemberships,'notification_recipient');
export function candidateAccess(workspaceId,condition) {
  return sql`(${sql.join(['owner','admin','project_manager','team_member','client'].map(role=>{
    const actor={workspaceId,membershipId:r.id,userId:r.userId,role,status:'active',scope:{}};
    return and(eq(r.role,role),liveProjectActor(actor),condition(actor));
  }),sql` OR `)})`;
}
const enabled=(workspaceId,category)=>sql`coalesce((SELECT CASE ${category} WHEN 'mentions' THEN mentions WHEN 'replies' THEN replies ELSE assignments END FROM notification_preferences WHERE workspace_id=${workspaceId} AND membership_id=${r.id} AND user_id=${r.userId}),1)=1`;
const unmuted=(workspaceId,threadId,kind)=>sql`NOT EXISTS (SELECT 1 FROM notification_mutes WHERE workspace_id=${workspaceId} AND membership_id=${r.id} AND user_id=${r.userId} AND thread_id=${threadId} AND kind=${kind})`;
const receipt=(workspaceId,eventId)=>sql`EXISTS (SELECT 1 FROM activity_events WHERE workspace_id=${workspaceId} AND id=${eventId})`;
function delivery(db,actor,eventId,category,target,guard,now){
  return insertSelected(db,n,{id:sql`${eventId} || ':' || ${r.id}`,workspaceId:actor.workspaceId,eventId,membershipId:r.id,userId:r.userId,category,
    recordThreadId:null,recordCommentId:null,pageId:null,pageThreadId:null,pageCommentId:null,actionId:null,...target,readAt:null,createdAt:now},r,
    and(eq(r.workspaceId,actor.workspaceId),eq(r.status,'active'),sql`${r.userId}<>${actor.userId}`,receipt(actor.workspaceId,eventId),guard,enabled(actor.workspaceId,category),
      sql`NOT EXISTS (SELECT 1 FROM notifications WHERE event_id=${eventId} AND membership_id=${r.id})`));
}
export function recordNotificationInsert(db,actor,parent,{eventId,threadId,commentId,now}){
  const mentioned=sql`EXISTS (SELECT 1 FROM record_discussion_mentions WHERE workspace_id=${actor.workspaceId} AND comment_id=${commentId} AND membership_id=${r.id} AND user_id=${r.userId})`;
  const participated=sql`EXISTS (SELECT 1 FROM record_discussion_comments WHERE workspace_id=${actor.workspaceId} AND thread_id=${threadId} AND id<>${commentId} AND author_membership_id=${r.id} AND author_user_id=${r.userId} AND removed_at IS NULL)`;
  // Preferences apply to reasons before precedence: a muted mention category
  // must not suppress an independently enabled reply for a participant.
  const mentionReason=and(mentioned,enabled(actor.workspaceId,'mentions'));
  const replyReason=and(participated,enabled(actor.workspaceId,'replies'));
  const category=sql`CASE WHEN ${mentionReason} THEN 'mentions' ELSE 'replies' END`;
  return delivery(db,actor,eventId,category,{recordThreadId:threadId,recordCommentId:commentId},and(
    sql`(${mentionReason} OR ${replyReason})`,unmuted(actor.workspaceId,threadId,'record'),
    candidateAccess(actor.workspaceId,a=>and(discussionTypedParentCondition(a,parent.type,parent.id),a.role==='client'?sql`EXISTS (SELECT 1 FROM record_discussion_threads WHERE id=${threadId} AND audience='client')`:sql`1`)),
    sql`EXISTS (SELECT 1 FROM record_discussion_comments WHERE id=${commentId} AND thread_id=${threadId} AND workspace_id=${actor.workspaceId} AND removed_at IS NULL)`),now);
}
export function pageNotificationInsert(db,actor,{eventId,pageId,threadId,commentId,now}){
  return delivery(db,actor,eventId,'replies',{pageId,pageThreadId:threadId,pageCommentId:commentId},and(unmuted(actor.workspaceId,threadId,'page'),
    sql`EXISTS (SELECT 1 FROM bloomops_page_comments WHERE workspace_id=${actor.workspaceId} AND page_id=${pageId} AND thread_id=${threadId} AND id<>${commentId} AND author_membership_id=${r.id} AND author_user_id=${r.userId})`,
    sql`EXISTS (SELECT 1 FROM bloomops_page_comments WHERE id=${commentId} AND thread_id=${threadId} AND page_id=${pageId} AND workspace_id=${actor.workspaceId})`,
    candidateAccess(actor.workspaceId,a=>pageReadCondition(a,pageId))),now);
}
export function assignmentNotificationInsert(db,actor,{eventId,actionId,now}){
  return delivery(db,actor,eventId,'assignments',{actionId},and(
    sql`EXISTS (SELECT 1 FROM actions WHERE id=${actionId} AND workspace_id=${actor.workspaceId} AND assignee_membership_id=${r.id})`,
    candidateAccess(actor.workspaceId,a=>discussionTypedParentCondition(a,'action',actionId))),now);
}
