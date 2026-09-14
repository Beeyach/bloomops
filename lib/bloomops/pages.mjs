import {pageReadCondition,pageEditCondition,pageCommentCondition} from './page-access.mjs';
import {renderPageDocument} from './page-document.mjs';
import {and,eq,desc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
const p=schema.workspacePages,w=schema.workspaces;
const allowed=actor=>Boolean(actor&&actor.status==='active');
const scope=actor=>and(eq(p.workspaceId,actor?.workspaceId||''),pageReadCondition(actor,p.id));
const invalid=()=>({ok:false,reason:'invalid',error:'Check the page title and content size.'});
const missing=()=>({ok:false,reason:'not_found'});
const exact=(input,keys)=>input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k));
const event=(actor,id,type,at)=>({workspaceId:actor.workspaceId,eventType:type,subjectType:'page',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:at});
export async function listWorkspacePages(db,actor,page=1){
 if(!allowed(actor))return null;
 if(!Number.isSafeInteger(page)||page<1||page>10000)page=1;
 const rows=await db.select({id:p.id,title:p.title,updatedAt:p.updatedAt,revision:p.revision}).from(p).where(scope(actor)).orderBy(desc(p.updatedAt),desc(p.id)).limit(51).offset((page-1)*50);
 if(!rows.length&&!['owner','admin'].includes(actor.role))return null;
 return {rows:rows.slice(0,50),more:rows.length>50,page};
}
export async function getWorkspacePage(db,actor,id){
 if(!allowed(actor)||typeof id!=='string'||!REQUEST_ID.test(id))return null;
 const row=(await db.select({id:p.id,workspaceId:p.workspaceId,title:p.title,body:p.body,revision:p.revision,updatedAt:p.updatedAt,canEdit:pageEditCondition(actor,p.id).as('canEdit'),canManage:administratorCondition(actor).as('canManage'),canComment:pageCommentCondition(actor,p.id).as('canComment'),icon:sql`COALESCE((SELECT icon FROM bloomops_page_settings WHERE page_id=${p.id}),'file')`}).from(p).where(and(scope(actor),eq(p.id,id))).limit(1))[0]||null;
 if(row)row.canReadWork=evaluate(actor,{action:'action.list'}).allowed;
 if(row&&!row.canEdit)row.body=renderPageDocument(row.body);return row;
}
export {createTreePage as createWorkspacePage} from './page-hierarchy.mjs';
export async function saveWorkspacePage(db,actor,id,input){
 if(!allowed(actor))return missing();
 if(typeof id!=='string'||!REQUEST_ID.test(id)||!exact(input,['workspaceId','expectedRevision','title','body'])||input.workspaceId!==actor.workspaceId||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>200||typeof input.body!=='string'||new TextEncoder().encode(input.body).length>1800000)return invalid();
 actor={...actor};input={...input,title:input.title.trim()};const iso=new Date().toISOString();
 const condition=and(scope(actor),pageEditCondition(actor,p.id),eq(p.id,id),eq(p.revision,input.expectedRevision));
 const results=await db.batch([
  activityForMutation(db,p,condition,event(actor,id,'PAGE_SAVED',iso)),
  db.update(p).set({title:input.title,body:input.body,revision:sql`${p.revision}+1`,updatedAt:iso}).where(condition).returning({revision:p.revision,updatedAt:p.updatedAt}),
 ]);
 if(results[1][0])return {ok:true,...results[1][0]};
 const current=await getWorkspacePage(db,actor,id);return current?.canEdit?{ok:false,reason:'conflict',error:'This page changed in another tab. Your draft is still here.'}:missing();
}

export async function hasSharedPages(db,actor){if(!allowed(actor))return false;return Boolean((await db.select({id:p.id}).from(p).where(scope(actor)).limit(1))[0]);}
