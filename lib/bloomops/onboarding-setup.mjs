// Explicit supported setup of existing canonical defaults; no client activation,
// invitations, overwrites of custom templates or progress changes.
import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {INTERNAL_ROLES,roleCapabilities} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {insertSelected} from './workspaces.mjs';
import {canonicalJson,hashDefinitionJson,encodeOnboardingDefinition} from './onboarding-definition.mjs';
import {createOnboardingVersion,publishOnboardingVersion} from './onboarding-templates.mjs';
import {DEFAULT_ONBOARDING_TEMPLATES} from './onboarding-defaults.mjs';
const t=schema.templates,v=schema.templateVersions,w=schema.workspaces;
const denied=()=>({ok:false,reason:'not_found'});
function condition(actor){
 if(!actor?.scope||actor.preview||!INTERNAL_ROLES.includes(actor.role))return sql`0`;
 const capability=roleCapabilities(actor.role).has('templates.manage')?sql`1`:sql`EXISTS (SELECT 1 FROM member_capabilities mc WHERE mc.workspace_id=${actor.workspaceId} AND mc.membership_id=${actor.membershipId} AND mc.capability='templates.manage')`;
 return and(liveProjectActor(actor),capability);
}
export async function onboardingSetup(db,actor){
 if(!(await db.select({id:w.id}).from(w).where(and(eq(w.id,actor?.workspaceId||''),condition(actor))).limit(1)).length)return denied();
 const rows=await db.select({template:t,version:v}).from(t).leftJoin(v,and(eq(v.workspaceId,t.workspaceId),eq(v.templateId,t.id))).where(and(eq(t.workspaceId,actor.workspaceId),eq(t.kind,'onboarding'),condition(actor)));
 return {ok:true,scope:{userId:actor.userId,workspaceId:actor.workspaceId},items:await Promise.all(DEFAULT_ONBOARDING_TEMPLATES.map(async d=>{
  const own=rows.filter(r=>r.template.slug===d.slug),versions=own.map(r=>r.version).filter(Boolean),published=versions.find(r=>r.status==='published');
  const template=own[0]?.template;const ordered=versions.sort((a,b)=>b.versionNumber-a.versionNumber);const reviewed=await reviewToken(template,ordered);
  return {templateId:template?.id||null,reviewToken:reviewed,versions:await Promise.all(ordered.map(async version=>{let definition=null,valid=false;try{definition=JSON.parse(version.definitionJson);const encoded=await encodeOnboardingDefinition(definition);valid=encoded.definition.category===d.slug&&encoded.definitionJson===version.definitionJson&&encoded.definitionHash===version.definitionHash;}catch{}return {id:version.id,number:version.versionNumber,status:version.status,definition,valid};})),slug:d.slug,name:d.name,definition:JSON.parse(d.definitionJson),state:template?.active===false?'inactive':published?'published':versions.length?'existing_draft':'missing',publishedVersion:published?.versionNumber??null};
 }))};
}
export async function installOnboardingDefaults(db,actor,input){
 if(!input||Object.keys(input).some(k=>!['workspaceId','userId','categories'].includes(k))||input.workspaceId!==actor?.workspaceId||input.userId!==actor?.userId)return denied();
 if(!Array.isArray(input.categories)||!input.categories.length||input.categories.length>5||new Set(input.categories).size!==input.categories.length||input.categories.some(c=>!DEFAULT_ONBOARDING_TEMPLATES.some(t=>t.slug===c)))return {ok:false,reason:'invalid'};
 const before=await onboardingSetup(db,actor);if(!before.ok)return before;
 const now=new Date().toISOString(),statements=[];
 for(const d of DEFAULT_ONBOARDING_TEMPLATES.filter(d=>input.categories.includes(d.slug))){
  const own=and(eq(t.workspaceId,actor.workspaceId),eq(t.kind,'onboarding'),eq(t.slug,d.slug),eq(t.active,true),condition(actor),sql`NOT EXISTS (SELECT 1 FROM template_versions ov WHERE ov.workspace_id=${t.workspaceId} AND ov.template_id=${t.id})`);
  statements.push(insertSelected(db,t,{id:crypto.randomUUID(),workspaceId:actor.workspaceId,kind:'onboarding',name:d.name,slug:d.slug,active:1,createdAt:now,updatedAt:now},w,and(eq(w.id,actor.workspaceId),condition(actor))).onConflictDoNothing());
  statements.push(db.insert(v).select(db.select({id:sql`${crypto.randomUUID()}`.as('id'),workspaceId:sql`${t.workspaceId}`.as('workspaceId'),templateId:sql`${t.id}`.as('templateId'),versionNumber:sql`1`.as('versionNumber'),status:sql`'published'`.as('status'),definitionJson:sql`${d.definitionJson}`.as('definitionJson'),definitionHash:sql`${d.definitionHash}`.as('definitionHash'),notes:sql`NULL`.as('notes'),createdByMembershipId:sql`${actor.membershipId}`.as('createdByMembershipId'),publishedAt:sql`${now}`.as('publishedAt'),createdAt:sql`${now}`.as('createdAt'),updatedAt:sql`${now}`.as('updatedAt')}).from(t).where(own)).onConflictDoNothing());
 }
 await db.batch(statements);
 const after=await onboardingSetup(db,actor);if(!after.ok)return after;
 return {...after,complete:input.categories.every(c=>after.items.find(i=>i.slug===c)?.state==='published')};
}

async function reviewToken(template,versions){return hashDefinitionJson(canonicalJson([template||null,versions]));}
// Explicit review actions preserve existing versions. Current access and the
// exact reviewed snapshot are checked again inside the write transaction.
export async function manageOnboardingSetup(db,actor,input){
 if(!input||Object.keys(input).some(k=>!['workspaceId','userId','slug','reviewToken','action','versionId','definition'].includes(k))||input.workspaceId!==actor?.workspaceId||input.userId!==actor?.userId)return denied();
 const before=await onboardingSetup(db,actor);if(!before.ok)return before;
 const item=before.items.find(i=>i.slug===input.slug);
 if(!item?.templateId||input.reviewToken!==item.reviewToken)return {ok:false,reason:'conflict'};
 const [template]=await db.select().from(t).where(and(eq(t.id,item.templateId),eq(t.workspaceId,actor.workspaceId),condition(actor)));
 const versions=await db.select().from(v).where(and(eq(v.templateId,item.templateId),eq(v.workspaceId,actor.workspaceId))).orderBy(sql`${v.versionNumber} DESC`);
 if(await reviewToken(template,versions)!==input.reviewToken)return {ok:false,reason:'conflict'};
 const guard=and(condition(actor),sql`EXISTS(SELECT 1 FROM templates rt WHERE rt.id=${template.id} AND rt.workspace_id=${actor.workspaceId} AND rt.active=${template.active?1:0} AND rt.updated_at=${template.updatedAt})`,
  sql`(SELECT count(*) FROM template_versions rv WHERE rv.template_id=${template.id} AND rv.workspace_id=${actor.workspaceId})=${versions.length}`,
  ...versions.map(row=>sql`EXISTS(SELECT 1 FROM template_versions rv WHERE rv.id=${row.id} AND rv.workspace_id=${actor.workspaceId} AND (rv.status=${row.status} OR (${input.action==='publish'&&row.status==='published'?1:0}=1 AND rv.status='retired')) AND rv.definition_hash=${row.definitionHash} AND (rv.updated_at=${row.updatedAt} OR (${input.action==='publish'&&row.status==='published'?1:0}=1 AND rv.status='retired')))`));
 let result;
 if(input.action==='enable'){
  if(template.active)return {ok:false,reason:'conflict'};
  const changed=await db.update(t).set({active:true,updatedAt:new Date().toISOString()}).where(and(eq(t.id,template.id),eq(t.workspaceId,actor.workspaceId),guard)).returning();result={ok:changed.length===1,reason:'conflict'};
 }else if(input.action==='publish'){
  if(!template.active||!item.versions.some(v=>v.id===input.versionId&&v.valid&&v.status==='draft'))return {ok:false,reason:'invalid'};
  result=await publishOnboardingVersion(db,{workspaceId:actor.workspaceId,versionId:input.versionId,accessCondition:guard});
 }else if(input.action==='save_version'){
  result=await createOnboardingVersion(db,{workspaceId:actor.workspaceId,templateId:template.id,definition:input.definition,createdByMembershipId:actor.membershipId,accessCondition:guard});
 }else return {ok:false,reason:'invalid'};
 if(!result.ok)return result;
 return onboardingSetup(db,actor);
}
