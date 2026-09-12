// Shared trusted read/commit predicates. A preview is never authority to write.
import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { systemsBlueprintDefault } from './systems-blueprint-catalog.mjs';
import { ACTIONS } from './authorization.mjs';
import { projectReadCondition } from './project-access.mjs';
import { encodeSystemsBlueprintDefinition, SystemsBlueprintError } from './systems-blueprint-definition.mjs';
import { compileSystemsBlueprint } from './systems-blueprint-compiler.mjs';

const p=schema.projects, se=schema.serviceEngagements, st=schema.serviceTypes, d=schema.departments;
const b=schema.serviceTypeBlueprintBindings, t=schema.templates, v=schema.templateVersions;
export const blueprintFailure=reason=>({ok:false,reason});
export const blueprintId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x20\x7f]/.test(value);
export const generationRole=actor=>!!actor&&ACTIONS['project.manage'].roles.includes(actor.role);

export async function generationProject(db,actor,projectId) {
  if(!generationRole(actor))return blueprintFailure('forbidden');
  if(!blueprintId(projectId))return blueprintFailure('invalid_input');
  const [project]=await db.select().from(p).where(and(eq(p.id,projectId),projectReadCondition(actor))).limit(1);
  return project?{ok:true,project}:blueprintFailure('not_found');
}

export function emptyGenerationProject() {
  return and(...[schema.milestones,schema.actions,schema.deliverables,schema.assetLinks].map(table=>
    sql`NOT EXISTS (SELECT 1 FROM ${table} WHERE ${table.workspaceId}=${p.workspaceId} AND ${table.projectId}=${p.id})`),
  sql`NOT EXISTS (SELECT 1 FROM systems_blueprint_generations existing WHERE existing.project_id=${p.id})`);
}

// Used directly by the receipt INSERT as well as preparation. Live source and
// empty-Project predicates cannot drift between preview and the write lock.
export function generationSourceQuery(db,actor,projectId,selection,extra=sql`1`) {
  return db.select(selection).from(p)
    .innerJoin(se,and(eq(se.workspaceId,p.workspaceId),eq(se.id,p.serviceEngagementId),eq(se.clientId,p.clientId)))
    .innerJoin(st,and(eq(st.workspaceId,se.workspaceId),eq(st.id,se.serviceTypeId)))
    .innerJoin(d,and(eq(d.workspaceId,st.workspaceId),eq(d.id,st.departmentId)))
    .innerJoin(b,and(eq(b.workspaceId,st.workspaceId),eq(b.serviceTypeId,st.id)))
    .innerJoin(t,and(eq(t.workspaceId,b.workspaceId),eq(t.id,b.templateId)))
    .innerJoin(v,and(eq(v.workspaceId,t.workspaceId),eq(v.templateId,t.id)))
    .where(and(eq(p.id,projectId),projectReadCondition(actor),generationRole(actor)?sql`1`:sql`0`,
      eq(p.status,'planned'),sql`typeof(${p.revision})='integer' AND ${p.revision} BETWEEN 1 AND 9007199254740990`,
      sql`${se.status} NOT IN ('completed','cancelled')`,eq(st.active,true),eq(d.active,true),eq(d.slug,'systems'),
      eq(b.enabled,true),eq(t.kind,'systems'),eq(t.active,true),eq(v.status,'published'),emptyGenerationProject(),extra));
}

export function generationSourceMatch(context,requestId) {
  return and(eq(p.workspaceId,context.workspaceId),eq(p.clientId,context.clientId),eq(p.revision,context.projectRevision),
    eq(se.id,context.serviceEngagementId),eq(st.id,context.serviceTypeId),eq(b.id,context.bindingId),eq(b.revision,context.bindingRevision),
    eq(t.id,context.templateId),eq(v.id,context.templateVersionId),eq(v.versionNumber,context.templateVersionNumber),
    eq(v.definitionJson,context.definitionJson),eq(v.definitionHash,context.definitionHash),
    sql`NOT EXISTS (SELECT 1 FROM systems_blueprint_generations existing WHERE existing.workspace_id=${context.workspaceId} AND existing.request_id=${requestId})`);
}

export async function verifiedBlueprintDefinition(definitionJson,definitionHash) {
  if(typeof definitionJson!=='string'||new TextEncoder().encode(definitionJson).byteLength>32768)throw new SystemsBlueprintError('invalid_definition');
  let decoded;
  try {decoded=JSON.parse(definitionJson);} catch(e) {if(e instanceof SyntaxError)throw new SystemsBlueprintError('invalid_definition');throw e;}
  const encoded=await encodeSystemsBlueprintDefinition(decoded);
  if(!systemsBlueprintDefault(encoded.definition.blueprintKey)||encoded.definitionJson!==definitionJson||encoded.definitionHash!==definitionHash)throw new SystemsBlueprintError('invalid_definition');
  return encoded.definition;
}

export function generationPreconditions(c) {
  return {projectRevision:c.projectRevision,bindingId:c.bindingId,bindingRevision:c.bindingRevision,
    templateVersionId:c.templateVersionId,definitionHash:c.definitionHash};
}

export async function loadGenerationSource(db,actor,projectId) {
  const access=await generationProject(db,actor,projectId);if(!access.ok)return access;
  const [context]=await generationSourceQuery(db,actor,projectId,{
    workspaceId:p.workspaceId,projectId:p.id,projectName:p.name,projectRevision:p.revision,clientId:p.clientId,
    serviceEngagementId:se.id,serviceTypeId:st.id,bindingId:b.id,bindingRevision:b.revision,templateId:t.id,
    templateVersionId:v.id,templateVersionNumber:v.versionNumber,definitionJson:v.definitionJson,definitionHash:v.definitionHash,
  }).limit(1);
  if(!context)return blueprintFailure('not_eligible');
  try {
    const definition=await verifiedBlueprintDefinition(context.definitionJson,context.definitionHash);
    return {ok:true,context,definition};
  } catch(e) {if(e instanceof SystemsBlueprintError)return blueprintFailure(e.reason);throw e;}
}

export async function systemsBlueprintOptions(db,{actor,projectId}={}) {
  const source=await loadGenerationSource(db,actor,projectId);if(!source.ok)return source;
  const titles=new Map(source.definition.actions.map(action=>[action.logicalKey,action.title]));
  return {ok:true,blueprintKey:source.definition.blueprintKey,expected:generationPreconditions(source.context),components:source.definition.components.map(component=>({key:component.logicalKey,label:titles.get(component.actionKey)}))};
}

export async function prepareSystemsBlueprint(db,{actor,projectId,selectedComponentKeys}={}) {
  const source=await loadGenerationSource(db,actor,projectId);if(!source.ok)return source;
  try {
    const plan=compileSystemsBlueprint({definition:source.definition,selectedComponentKeys});
    return {ok:true,expected:generationPreconditions(source.context),plan};
  } catch(e) {if(e instanceof SystemsBlueprintError)return blueprintFailure(e.reason);throw e;}
}
