import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { activePageMember, pageReadCondition } from './page-access.mjs';
import { previewContext } from './preview-policy.mjs';
import { discussionThreadCondition, validDiscussionParent } from './discussion-access.mjs';
import { normalizeProfilePng, PHOTO_MAX_BYTES } from './profile-png.mjs';

const u=schema.user,m=schema.workspaceMemberships,c=schema.pageComments,p=schema.workspacePages;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',value));
const revision=value=>hash(new TextEncoder().encode(JSON.stringify(value??null)));
const prefix=id=>`bloomops-profile-photos/${encodeURIComponent(id)}/`;
export function ownedPhotoKey(userId,value){
  if(typeof value!=='string'||!value.startsWith(prefix(userId)))return null;
  return /^[0-9a-f-]{36}\/[0-9a-f]{64}\.png$/.test(value.slice(prefix(userId).length))?value:null;
}
const missing=()=>({ok:false,reason:'not_found'});
const conflict=()=>({ok:false,reason:'conflict',error:'Your photo changed elsewhere. Reload the current photo before saving.'});
const selfCondition=actor=>and(eq(u.id,actor.userId),activePageMember(actor));
async function self(db,actor){
  if(!actor||previewContext(actor))return null;
  return (await db.select({id:u.id,image:u.image}).from(u).where(selfCondition(actor)).limit(1))[0]||null;
}
export async function getProfilePhoto(db,actor){
  const row=await self(db,actor);return row?{version:await revision(row.image),hasPhoto:Boolean(ownedPhotoKey(row.id,row.image))}:null;
}
export async function changeProfilePhoto(db,{bucket,actor,input,bytes=null}){
  const before=await self(db,actor);if(!before)return missing();
  if(!input||Object.keys(input).sort().join(',')!=='expectedVersion,requestId'||!uuid.test(input.requestId)||!/^[0-9a-f]{64}$/.test(input.expectedVersion))return {ok:false,reason:'invalid'};
  let image=`${prefix(actor.userId)}removed/${input.requestId}`,normalized=null;
  if(bytes!==null){
    try{normalized=await normalizeProfilePng(bytes);}catch{return {ok:false,reason:'invalid',error:'Choose a valid photo and crop it again.'};}
    image=`${prefix(actor.userId)}${input.requestId}/${await hash(normalized)}.png`;
  }
  // Exact retries are safe, including a lost response. A different current
  // pointer always requires the displayed version. Removal leaves a nonce,
  // preventing an old upload against an empty profile from reviving later.
  if(before.image!==image&&await revision(before.image)!==input.expectedVersion)return conflict();
  if(normalized){
    const object=await bucket.put(image,normalized,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'image/png'},sha256:await hash(normalized)});
    const saved=object||await bucket.head(image);
    if(!saved||saved.size!==normalized.length||saved.httpMetadata?.contentType!=='image/png'||hex(saved.checksums?.sha256||[])!==await hash(normalized))return {ok:false,reason:'storage',error:'Photo was not saved. Please retry.'};
  }
  const condition=and(selfCondition(actor),sql`${u.image} IS ${before.image}`);
  try{
    await db.update(u).set({image,updatedAt:new Date()}).where(condition);
  }catch{
    // Never delete a possibly committed object's bytes on an uncertain result.
  }
  const after=await self(db,actor);if(!after)return missing();
  if(after.image!==image)return conflict();
  return {ok:true,version:await revision(image),hasPhoto:normalized!==null};
}

// The caller chooses one fixed audience adapter; URLs never contain a raw
// image key or arbitrary user id. Page authors need an actual readable comment.
async function readable(db,actor,context){
  if(!actor)return null;
  if(context.kind==='self')return self(db,actor);
  if(context.kind==='record-comment'&&validDiscussionParent(context.parent)){
    const comment=schema.recordDiscussionComments,thread=schema.recordDiscussionThreads;
    return (await db.select({id:u.id,image:u.image}).from(comment).innerJoin(u,eq(u.id,comment.authorUserId))
      .innerJoin(thread,and(eq(thread.id,comment.threadId),eq(thread.workspaceId,comment.workspaceId)))
      .where(and(eq(comment.id,context.commentId),sql`${comment.removedAt} IS NULL`,discussionThreadCondition(actor,context.parent,thread))).limit(1))[0]||null;
  }
  if(context.kind==='comment')return (await db.select({id:u.id,image:u.image}).from(c)
    .innerJoin(u,eq(u.id,c.authorUserId)).innerJoin(p,and(eq(p.id,c.pageId),eq(p.workspaceId,c.workspaceId)))
    .where(and(eq(c.workspaceId,actor.workspaceId),eq(c.pageId,context.pageId),eq(c.id,context.commentId),activePageMember(actor),pageReadCondition(actor,p.id))).limit(1))[0]||null;
  if(context.kind==='member'&&!previewContext(actor)){
    // Same live role/capability gate as the existing Team directory. Clients
    // cannot acquire this through stale or improperly granted capabilities.
    const manager=sql`EXISTS(SELECT 1 FROM workspace_memberships viewer JOIN workspaces ws ON ws.id=viewer.workspace_id
      WHERE viewer.id=${actor.membershipId} AND viewer.user_id=${actor.userId} AND viewer.workspace_id=${actor.workspaceId}
      AND viewer.status='active' AND ws.status='active' AND (viewer.role IN ('owner','admin') OR
      (viewer.role IN ('project_manager','team_member') AND EXISTS(SELECT 1 FROM member_capabilities cap WHERE cap.membership_id=viewer.id AND cap.workspace_id=viewer.workspace_id AND cap.capability='members.manage'))))`;
    return (await db.select({id:u.id,image:u.image}).from(m).innerJoin(u,eq(u.id,m.userId))
      .where(and(eq(m.id,context.membershipId),eq(m.workspaceId,actor.workspaceId),manager)).limit(1))[0]||null;
  }
  return null;
}
export async function downloadProfilePhoto(db,{bucket,actor,context}){
  const before=await readable(db,actor,context),key=before&&ownedPhotoKey(before.id,before.image);if(!key)return null;
  const object=await bucket.get(key);
  const after=await readable(db,actor,context);
  const digest=key.slice(-68,-4);
  if(!after||after.id!==before.id||after.image!==key||object?.key!==key||!object?.body||object.size>PHOTO_MAX_BYTES||object.size<57||object.httpMetadata?.contentType!=='image/png'||hex(object.checksums?.sha256||[])!==digest){
    try{await object?.body?.cancel();}catch{}return null;
  }
  return {body:object.body,size:object.size};
}
export function profilePhotoResponse(photo){
  return photo?new Response(photo.body,{headers:{'content-type':'image/png','content-length':String(photo.size),'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'cross-origin-resource-policy':'same-origin'}}):null;
}
