import {and,asc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {INTERNAL_ROLES,roleCapabilities} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {canonicalJson,hashDefinitionJson} from './onboarding-definition.mjs';
import {validateWorkSetup,WorkSetupError} from './work-setup-values.mjs';
const t=schema.templates,v=schema.templateVersions,h=schema.workSetupStates,r=schema.workSetupSaves,w=schema.workspaces;
const absent=()=>({ok:false,reason:'not_found'}),conflict=()=>({ok:false,reason:'conflict'});
export const setupId=id=>typeof id==='string'&&id.length>0&&id.length<=200&&!/[\x00-\x20\x7f]/.test(id);
const only=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
export function workSetupAuthority(actor,{edit=false}={}){
 if(!actor?.scope||actor.preview||!INTERNAL_ROLES.includes(actor.role))return sql`0`;
 const manage=roleCapabilities(actor.role).has('templates.manage')?sql`1`:sql`EXISTS(SELECT 1 FROM member_capabilities mc WHERE mc.workspace_id=${actor.workspaceId} AND mc.membership_id=${actor.membershipId} AND mc.capability='templates.manage')`;
 return and(liveProjectActor(actor),!edit&&['owner','admin','project_manager'].includes(actor.role)?sql`1`:manage);
}
const joined=(db,selection)=>db.select(selection).from(h).innerJoin(t,and(eq(t.workspaceId,h.workspaceId),eq(t.id,h.templateId))).innerJoin(v,and(eq(v.workspaceId,t.workspaceId),eq(v.templateId,t.id),eq(v.status,'published')));
const scope=(actor,edit=false)=>and(eq(h.workspaceId,actor?.workspaceId||''),eq(t.kind,'project'),workSetupAuthority(actor,{edit}));
export async function getWorkSetup(db,actor,id){
 if(!setupId(id))return null;
 const [row]=await joined(db,{template:t,version:v,revision:h.revision}).where(and(scope(actor),eq(t.id,id))).limit(1);if(!row)return null;
 const definition=validateWorkSetup(JSON.parse(row.version.definitionJson)),encoded=canonicalJson(definition);
 if(encoded!==row.version.definitionJson||await hashDefinitionJson(encoded)!==row.version.definitionHash)throw new WorkSetupError('This saved setup failed its integrity check.');
 const editable=await db.select({id:w.id}).from(w).where(and(eq(w.id,actor.workspaceId),workSetupAuthority(actor,{edit:true}))).limit(1);
 // The first joined read is one coherent immutable-version snapshot. A newer
 // revision does not revoke it; writes compare that revision in their SQL claim.
 // Recheck current access, so revocation still hides the loaded snapshot.
 if(!(await joined(db,{id:t.id}).where(and(scope(actor),eq(t.id,id))).limit(1)).length)return null;
 return {id,revision:row.revision,active:row.template.active,versionId:row.version.id,version:row.version.versionNumber,definitionHash:row.version.definitionHash,definition,canEdit:!!editable.length};
}
export async function listWorkSetups(db,actor,{page=1,archived=false}={}){
 if(!Number.isSafeInteger(page)||page<1||page>10000||typeof archived!=='boolean')return {ok:false,reason:'invalid'};
 if(!(await db.select({id:w.id}).from(w).where(and(eq(w.id,actor?.workspaceId||''),workSetupAuthority(actor))).limit(1)).length)return absent();
 const rows=await joined(db,{id:t.id,name:t.name,description:t.description,active:t.active,revision:h.revision,versionId:v.id,version:v.versionNumber}).where(and(scope(actor),eq(t.active,!archived))).orderBy(asc(t.name),asc(t.id)).limit(21).offset((page-1)*20);
 const editable=await db.select({id:w.id}).from(w).where(and(eq(w.id,actor.workspaceId),workSetupAuthority(actor,{edit:true}))).limit(1);
 return {ok:true,items:rows.slice(0,20),more:rows.length>20,page,canEdit:!!editable.length};
}
async function savedRequest(db,actor,requestId,intentHash){
 const [row]=await db.select({templateId:r.templateId,versionId:r.templateVersionId,revision:r.revision,hash:r.intentHash}).from(r).where(and(eq(r.workspaceId,actor.workspaceId),eq(r.actorUserId,actor.userId),eq(r.requestId,requestId),workSetupAuthority(actor,{edit:true}))).limit(1);
 return row?row.hash===intentHash?{ok:true,id:row.templateId,versionId:row.versionId,revision:row.revision}:conflict():null;
}
export async function saveWorkSetup(db,actor,input){
 if(!actor?.scope||!only(input,['workspaceId','userId','requestId','templateId','expectedRevision','definition'])||input.workspaceId!==actor.workspaceId||input.userId!==actor.userId)return absent();
 if(!(await db.select({id:w.id}).from(w).where(and(eq(w.id,actor.workspaceId),workSetupAuthority(actor,{edit:true}))).limit(1)).length)return absent();
 if(!REQUEST_ID.test(input.requestId||'')||input.templateId!==null&&!setupId(input.templateId)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER||input.templateId===null&&input.expectedRevision!==0)return {ok:false,reason:'invalid'};
 let definition;try{definition=validateWorkSetup(input.definition);}catch(e){if(e instanceof WorkSetupError)return {ok:false,reason:'invalid',error:e.message};throw e;}
 const json=canonicalJson(definition),definitionHash=await hashDefinitionJson(json),intentHash=await hashDefinitionJson(canonicalJson(['save',input.templateId,input.expectedRevision,definition]));
 const prior=await savedRequest(db,actor,input.requestId,intentHash);if(prior)return prior;
 const current=input.templateId?await getWorkSetup(db,actor,input.templateId):null;if(input.templateId&&!current)return absent();if(current&&!current.canEdit)return absent();if(current&&current.revision!==input.expectedRevision)return conflict();
 if(current&&current.definitionHash===definitionHash)return {ok:true,id:current.id,versionId:current.versionId,revision:current.revision,unchanged:true};
 const id=input.templateId||crypto.randomUUID(),versionId=crypto.randomUUID(),mutationId=crypto.randomUUID(),now=new Date().toISOString(),revision=input.expectedRevision+1;
 const fresh=and(eq(w.id,actor.workspaceId),workSetupAuthority(actor,{edit:true}),sql`NOT EXISTS(SELECT 1 FROM work_setup_saves WHERE workspace_id=${actor.workspaceId} AND actor_user_id=${actor.userId} AND request_id=${input.requestId})`);
 const own=and(eq(h.workspaceId,actor.workspaceId),eq(h.templateId,id),eq(h.mutationId,mutationId));
 const hasOwn=sql`EXISTS(SELECT 1 FROM work_setup_states WHERE ${own})`;
 const statements=current?[
  db.update(h).set({revision,mutationId,updatedAt:now}).where(and(eq(h.workspaceId,actor.workspaceId),eq(h.templateId,id),eq(h.revision,input.expectedRevision),workSetupAuthority(actor,{edit:true}),
   sql`EXISTS(SELECT 1 FROM template_versions WHERE workspace_id=${actor.workspaceId} AND template_id=${id} AND id=${current.versionId} AND status='published')`,sql`NOT EXISTS(SELECT 1 FROM work_setup_saves WHERE workspace_id=${actor.workspaceId} AND actor_user_id=${actor.userId} AND request_id=${input.requestId})`)),
  db.update(t).set({name:definition.name,description:definition.description,updatedAt:now}).where(and(eq(t.workspaceId,actor.workspaceId),eq(t.id,id),hasOwn)),
  db.update(v).set({status:'retired',updatedAt:now}).where(and(eq(v.workspaceId,actor.workspaceId),eq(v.templateId,id),eq(v.status,'published'),hasOwn)),
 ]:[
  insertSelected(db,t,{id,workspaceId:actor.workspaceId,kind:'project',name:definition.name,slug:'work-setup-'+id,description:definition.description,active:1,createdAt:now,updatedAt:now},w,fresh),
  insertSelected(db,h,{workspaceId:actor.workspaceId,templateId:id,revision,mutationId,createdAt:now,updatedAt:now},t,and(eq(t.workspaceId,actor.workspaceId),eq(t.id,id))),
 ];
 statements.push(insertSelected(db,v,{id:versionId,workspaceId:actor.workspaceId,templateId:id,versionNumber:(current?.version||0)+1,status:'published',definitionJson:json,definitionHash,notes:null,createdByMembershipId:actor.membershipId,publishedAt:now,createdAt:now,updatedAt:now},h,own));
 // A new template is the create claim. If a later header/version insert writes
 // zero rows, the receipt's FKs/guard fail and roll back that whole creation.
 statements.push(insertSelected(db,r,{workspaceId:actor.workspaceId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,requestId:input.requestId,intentHash,templateId:id,templateVersionId:versionId,operation:'save',revision,createdAt:now},current?h:t,current?own:and(eq(t.workspaceId,actor.workspaceId),eq(t.id,id))));
 await db.batch(statements);return await savedRequest(db,actor,input.requestId,intentHash)||conflict();
}
export async function setWorkSetupActive(db,actor,id,input){
 if(!actor?.scope||!setupId(id)||!only(input,['workspaceId','userId','requestId','expectedRevision','active'])||input.workspaceId!==actor.workspaceId||input.userId!==actor.userId)return absent();
 if(!REQUEST_ID.test(input.requestId||'')||typeof input.active!=='boolean'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||input.expectedRevision>=Number.MAX_SAFE_INTEGER)return {ok:false,reason:'invalid'};
 const operation=input.active?'restore':'retire',intentHash=await hashDefinitionJson(canonicalJson([operation,id,input.expectedRevision]));const prior=await savedRequest(db,actor,input.requestId,intentHash);if(prior)return prior;
 const current=await getWorkSetup(db,actor,id);if(!current?.canEdit)return absent();if(current.revision!==input.expectedRevision)return conflict();if(current.active===input.active)return {ok:true,id,versionId:current.versionId,revision:current.revision,unchanged:true};
 const mutationId=crypto.randomUUID(),revision=current.revision+1,now=new Date().toISOString(),own=and(eq(h.workspaceId,actor.workspaceId),eq(h.templateId,id),eq(h.mutationId,mutationId));
 await db.batch([
  db.update(h).set({revision,mutationId,updatedAt:now}).where(and(eq(h.workspaceId,actor.workspaceId),eq(h.templateId,id),eq(h.revision,current.revision),workSetupAuthority(actor,{edit:true}),sql`NOT EXISTS(SELECT 1 FROM work_setup_saves WHERE workspace_id=${actor.workspaceId} AND actor_user_id=${actor.userId} AND request_id=${input.requestId})`)),
  db.update(t).set({active:input.active,updatedAt:now}).where(and(eq(t.workspaceId,actor.workspaceId),eq(t.id,id),sql`EXISTS(SELECT 1 FROM work_setup_states WHERE ${own})`)),
  insertSelected(db,r,{workspaceId:actor.workspaceId,actorUserId:actor.userId,actorMembershipId:actor.membershipId,requestId:input.requestId,intentHash,templateId:id,templateVersionId:current.versionId,operation,revision,createdAt:now},h,own),
 ]);return await savedRequest(db,actor,input.requestId,intentHash)||conflict();
}
