import {and,asc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {hashDefinitionJson} from './onboarding-definition.mjs';
import {createTreePage} from './page-hierarchy.mjs';
const p=schema.workspacePages,h=schema.pageTemplates,v=schema.pageTemplateVersions,r=schema.pageTemplateCreations,w=schema.workspaces;
const absent=()=>({ok:false,reason:'not_found'}),conflict=()=>({ok:false,reason:'conflict',error:'The saved Page or template changed. Reopen its saved version before retrying.'});
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const integer=x=>Number.isSafeInteger(x)&&x>=0&&x<Number.MAX_SAFE_INTEGER;
const authority=actor=>actor?.scope&&!actor.preview&&['owner','admin'].includes(actor.role)?administratorCondition(actor):sql`0`;
const workspace=(actor)=>and(eq(w.id,actor?.workspaceId||''),authority(actor));
const latest=sql`${v.version}=(SELECT max(pv.version) FROM bloomops_page_template_versions pv WHERE pv.workspace_id=${v.workspaceId} AND pv.page_id=${v.pageId})`;
const permitted=(db,actor)=>db.select({id:w.id}).from(w).where(workspace(actor)).limit(1);
const scopeInput=(actor,input)=>input?.workspaceId===actor?.workspaceId&&input?.userId===actor?.userId;
// A guard deliberately fails the D1 batch when a claimed mutation is incomplete.
// json() parses constants only; it does not execute user text or mutate records.
const complete=(db,actor,claimed,finished)=>db.select({complete:sql`json(CASE WHEN ${claimed} AND NOT (${finished}) THEN 'incomplete Page template mutation' ELSE '{}' END)`}).from(w).where(eq(w.id,actor.workspaceId));
export async function pageTemplateSource(db,actor,pageId){
 if(!REQUEST_ID.test(pageId||''))return null;
 const [row]=await db.select({pageId:p.id,title:p.title,sourceRevision:p.revision,revision:sql`coalesce(${h.revision},0)`,active:h.active,versionId:v.id,version:v.version,capturedSourceRevision:v.sourceRevision}).from(p).leftJoin(h,and(eq(h.workspaceId,p.workspaceId),eq(h.pageId,p.id))).leftJoin(v,and(eq(v.workspaceId,h.workspaceId),eq(v.pageId,h.pageId),latest)).where(and(eq(p.workspaceId,actor?.workspaceId||''),eq(p.id,pageId),authority(actor))).limit(1);
 return row||null;
}
export async function listPageTemplates(db,actor,{page=1,retired=false}={}){
 if(!integer(page)||page<1||page>10000||typeof retired!=='boolean')return {ok:false,reason:'invalid'};
 if(!(await permitted(db,actor)).length)return absent();
 const rows=await db.select({pageId:h.pageId,title:v.title,versionId:v.id,version:v.version,revision:h.revision,active:h.active}).from(h).innerJoin(v,and(eq(v.workspaceId,h.workspaceId),eq(v.pageId,h.pageId),latest)).where(and(eq(h.workspaceId,actor.workspaceId),eq(h.active,retired?0:1),authority(actor))).orderBy(asc(v.title),asc(h.pageId)).limit(21).offset((page-1)*20);
 return {ok:true,items:rows.slice(0,20),page,more:rows.length>20};
}
export async function getPageTemplate(db,actor,versionId){
 if(!REQUEST_ID.test(versionId||''))return null;
 const [row]=await db.select({id:v.id,pageId:v.pageId,workspaceId:v.workspaceId,title:v.title,body:v.body,version:v.version,sourceRevision:v.sourceRevision,active:h.active,revision:h.revision,current:latest.as('current')}).from(v).innerJoin(h,and(eq(h.workspaceId,v.workspaceId),eq(h.pageId,v.pageId))).where(and(eq(v.workspaceId,actor?.workspaceId||''),eq(v.id,versionId),authority(actor))).limit(1);return row||null;
}
async function capturedRequest(db,actor,requestId,intentHash){
 const [row]=await db.select({id:v.id,pageId:v.pageId,hash:v.intentHash,version:v.version}).from(v).where(and(eq(v.workspaceId,actor.workspaceId),eq(v.actorUserId,actor.userId),eq(v.requestId,requestId),authority(actor))).limit(1);
 return row?row.hash===intentHash?{ok:true,id:row.id,pageId:row.pageId,version:row.version}:conflict():null;
}
export async function capturePageTemplate(db,actor,pageId,input){
 if(!scopeInput(actor,input)||!(await permitted(db,actor)).length)return absent();
 if(!REQUEST_ID.test(pageId||'')||!exact(input,['workspaceId','userId','requestId','expectedRevision','expectedPageRevision'])||!REQUEST_ID.test(input.requestId||'')||!integer(input.expectedRevision)||!integer(input.expectedPageRevision)||input.expectedPageRevision<1)return {ok:false,reason:'invalid'};
 const intentHash=await hashDefinitionJson(JSON.stringify([pageId,input.expectedRevision,input.expectedPageRevision]));
 const prior=await capturedRequest(db,actor,input.requestId,intentHash);if(prior)return prior;
 const source=await pageTemplateSource(db,actor,pageId);if(!source)return absent();if(source.revision!==input.expectedRevision||source.sourceRevision!==input.expectedPageRevision)return conflict();
 if(source.capturedSourceRevision===source.sourceRevision)return {ok:true,id:source.versionId,pageId,version:source.version,unchanged:true};
 const [content]=await db.select({title:p.title,body:p.body}).from(p).where(and(eq(p.workspaceId,actor.workspaceId),eq(p.id,pageId),eq(p.revision,input.expectedPageRevision),authority(actor))).limit(1);if(!content)return conflict();
 const id=crypto.randomUUID(),mutationId=crypto.randomUUID(),now=new Date().toISOString(),version=(source.version||0)+1;
 const target=and(authority(actor),sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE workspace_id=${actor.workspaceId} AND id=${pageId} AND revision=${input.expectedPageRevision})`,sql`NOT EXISTS(SELECT 1 FROM bloomops_page_template_versions WHERE workspace_id=${actor.workspaceId} AND actor_user_id=${actor.userId} AND request_id=${input.requestId})`);
 const own=and(eq(h.workspaceId,actor.workspaceId),eq(h.pageId,pageId),eq(h.mutationId,mutationId));
 const claimed=sql`EXISTS(SELECT 1 FROM bloomops_page_templates WHERE ${own})`;
 const values={id,workspaceId:actor.workspaceId,pageId,version,sourceRevision:input.expectedPageRevision,...content,actorUserId:actor.userId,actorMembershipId:actor.membershipId,requestId:input.requestId,intentHash,createdAt:now};
 try{await db.batch([
  source.revision?db.update(h).set({revision:source.revision+1,mutationId,updatedAt:now}).where(and(eq(h.workspaceId,actor.workspaceId),eq(h.pageId,pageId),eq(h.revision,source.revision),target)):
   insertSelected(db,h,{pageId,workspaceId:actor.workspaceId,revision:1,active:1,mutationId,updatedAt:now},w,and(eq(w.id,actor.workspaceId),target,sql`NOT EXISTS(SELECT 1 FROM bloomops_page_templates WHERE workspace_id=${actor.workspaceId} AND page_id=${pageId})`)),
  insertSelected(db,v,values,h,own),
  complete(db,actor,claimed,sql`EXISTS(SELECT 1 FROM bloomops_page_template_versions WHERE id=${id} AND workspace_id=${actor.workspaceId})`),
 ]);}catch(e){const replay=await capturedRequest(db,actor,input.requestId,intentHash);if(replay)return replay;throw e;}
 return await capturedRequest(db,actor,input.requestId,intentHash)||conflict();
}
export async function setPageTemplateActive(db,actor,pageId,input){
 if(!scopeInput(actor,input)||!(await permitted(db,actor)).length)return absent();
 if(!exact(input,['workspaceId','userId','expectedRevision','active'])||!integer(input.expectedRevision)||typeof input.active!=='boolean')return {ok:false,reason:'invalid'};
 const source=await pageTemplateSource(db,actor,pageId);if(!source?.versionId)return absent();
 if(!!source.active===input.active)return {ok:true,revision:source.revision,unchanged:true};if(source.revision!==input.expectedRevision)return conflict();
 const [saved]=await db.update(h).set({active:input.active?1:0,revision:source.revision+1,mutationId:crypto.randomUUID(),updatedAt:new Date().toISOString()}).where(and(eq(h.workspaceId,actor.workspaceId),eq(h.pageId,pageId),eq(h.revision,source.revision),authority(actor))).returning({revision:h.revision});
 return saved?{ok:true,...saved}:conflict();
}
async function creationRequest(db,actor,requestId,intentHash){
 const [row]=await db.select({id:r.pageId,hash:r.intentHash}).from(r).where(and(eq(r.workspaceId,actor.workspaceId),eq(r.actorUserId,actor.userId),eq(r.requestId,requestId),authority(actor))).limit(1);
 return row?row.hash===intentHash?{ok:true,id:row.id}:conflict():null;
}
export async function createPageFromTemplate(db,actor,input){
 if(!scopeInput(actor,input)||!(await permitted(db,actor)).length)return absent();
 if(!exact(input,['workspaceId','userId','requestId','versionId'])||!REQUEST_ID.test(input.requestId||'')||!REQUEST_ID.test(input.versionId||''))return {ok:false,reason:'invalid'};
 const intentHash=await hashDefinitionJson(JSON.stringify([input.versionId]));const prior=await creationRequest(db,actor,input.requestId,intentHash);if(prior)return prior;
 const source=await getPageTemplate(db,actor,input.versionId);if(!source)return absent();if(!source.active||!source.current)return conflict();
 // Namespace the canonical Page writer's workspace-wide UUID by user/operation.
 const key=await hashDefinitionJson(JSON.stringify(['page-template',actor.userId,input.requestId]));const pageRequestId=`${key.slice(0,8)}-${key.slice(8,12)}-4${key.slice(13,16)}-a${key.slice(17,20)}-${key.slice(20,32)}`;
 const condition=sql`EXISTS(SELECT 1 FROM bloomops_page_template_versions pv JOIN bloomops_page_templates ph ON ph.workspace_id=pv.workspace_id AND ph.page_id=pv.page_id WHERE pv.workspace_id=${actor.workspaceId} AND pv.id=${source.id} AND ph.active=1 AND pv.version=(SELECT max(vv.version) FROM bloomops_page_template_versions vv WHERE vv.workspace_id=pv.workspace_id AND vv.page_id=pv.page_id))`;
 const result=await createTreePage(db,actor,{workspaceId:actor.workspaceId,requestId:pageRequestId},{snapshot:{title:source.title,body:source.body,condition,statements:id=>[
  insertSelected(db,r,{pageId:id,workspaceId:actor.workspaceId,versionId:source.id,actorUserId:actor.userId,actorMembershipId:actor.membershipId,requestId:input.requestId,intentHash,createdAt:new Date().toISOString()},p,and(eq(p.workspaceId,actor.workspaceId),eq(p.id,id),authority(actor))),
  complete(db,actor,sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE workspace_id=${actor.workspaceId} AND id=${id})`,sql`EXISTS(SELECT 1 FROM bloomops_page_template_creations WHERE workspace_id=${actor.workspaceId} AND page_id=${id})`),
 ]}});
 if(!result.ok)return result;return await creationRequest(db,actor,input.requestId,intentHash)||conflict();
}
