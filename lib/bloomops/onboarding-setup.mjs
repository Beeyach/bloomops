// Explicit supported setup of existing canonical defaults; no client activation,
// invitations, overwrites of custom templates or progress changes.
import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {INTERNAL_ROLES,roleCapabilities} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {insertSelected} from './workspaces.mjs';
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
 return {ok:true,scope:{userId:actor.userId,workspaceId:actor.workspaceId},items:DEFAULT_ONBOARDING_TEMPLATES.map(d=>{
  const own=rows.filter(r=>r.template.slug===d.slug),versions=own.map(r=>r.version).filter(Boolean),published=versions.find(r=>r.status==='published');
  return {slug:d.slug,name:d.name,definition:JSON.parse(d.definitionJson),state:own[0]?.template.active===false?'inactive':published?'published':versions.length?'existing_draft':'missing',publishedVersion:published?.versionNumber??null};
 })};
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
