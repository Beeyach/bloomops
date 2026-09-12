// One receipt-gated transaction. A caller-edited preview is never persisted.
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { projectReadCondition } from './project-access.mjs';
import { activityForMutation } from './activity.mjs';
import { projectEvent } from './projects.mjs';
import { canonicalJson, hashDefinitionJson } from './onboarding-definition.mjs';
import { exactBlueprintObject, SystemsBlueprintError } from './systems-blueprint-definition.mjs';
import { compileSystemsBlueprint } from './systems-blueprint-compiler.mjs';
import { blueprintFailure as failure, blueprintId, generationProject, generationPreconditions,
  generationSourceMatch, generationSourceQuery, loadGenerationSource, verifiedBlueprintDefinition } from './systems-blueprint-preparation.mjs';

const p=schema.projects,g=schema.systemsBlueprintGenerations,i=schema.systemsBlueprintGenerationItems;
const expectedKeys=['projectRevision','bindingId','bindingRevision','templateVersionId','definitionHash'];
const validRevision=value=>Number.isSafeInteger(value)&&value>=1;
function validInput(input) {
  return exactBlueprintObject(input,['requestId','selectedComponentKeys','expected'])
    && typeof input.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)
    && exactBlueprintObject(input.expected,expectedKeys)&&validRevision(input.expected.projectRevision)
    && validRevision(input.expected.bindingRevision)&&blueprintId(input.expected.bindingId)&&blueprintId(input.expected.templateVersionId)
    && typeof input.expected.definitionHash==='string'&&/^[0-9a-f]{64}$/.test(input.expected.definitionHash);
}

const mappingsFor=plan=>['milestone','action','deliverable'].flatMap(kind=>plan[`${kind}s`].map(row=>`${kind}:${row.logicalKey}`)).sort();

async function receiptResult(db,actor,projectId,requestId,selection,attemptId=null) {
  const access=await generationProject(db,actor,projectId);if(!access.ok)return access;
  const [receipt]=await db.select({receipt:g}).from(g)
    .innerJoin(p,and(eq(p.workspaceId,g.workspaceId),eq(p.id,g.projectId)))
    .where(and(eq(g.projectId,projectId),projectReadCondition(actor))).limit(1);
  if(!receipt)return null;
  const source=receipt.receipt;
  if(source.requestId!==requestId)return failure('conflict');
  let definition,plan;
  try {
    definition=await verifiedBlueprintDefinition(source.definitionJson,source.definitionHash);
    if(typeof source.planJson!=='string'||new TextEncoder().encode(source.planJson).byteLength>32768)return failure('integrity_failure');
    const stored=JSON.parse(source.planJson);
    plan=compileSystemsBlueprint({definition,selectedComponentKeys:stored.selectedComponentKeys});
    if(canonicalJson(plan)!==source.planJson||await hashDefinitionJson(source.planJson)!==source.planHash
      ||source.blueprintKey!==definition.blueprintKey||source.definitionSchemaVersion!==definition.schemaVersion
      ||source.compilerVersion!==definition.compilerVersion)return failure('integrity_failure');
  } catch(e) {if(e instanceof SystemsBlueprintError||e instanceof SyntaxError)return failure('integrity_failure');throw e;}
  try {
    const requested=compileSystemsBlueprint({definition,selectedComponentKeys:selection});
    if(canonicalJson(requested.selectedComponentKeys)!==canonicalJson(plan.selectedComponentKeys))return failure('conflict');
  } catch(e) {if(e instanceof SystemsBlueprintError)return failure(e.reason);throw e;}
  const items=await db.select({kind:i.kind,logicalKey:i.logicalKey,recordId:i.recordId}).from(i)
    .innerJoin(g,and(eq(g.workspaceId,i.workspaceId),eq(g.id,i.generationId)))
    .innerJoin(p,and(eq(p.workspaceId,g.workspaceId),eq(p.id,g.projectId)))
    .where(and(eq(i.generationId,source.id),projectReadCondition(actor))).limit(36);
  const a=schema.activityEvents;
  const events=await db.select({event:a}).from(a)
    .innerJoin(p,and(eq(p.workspaceId,a.workspaceId),eq(p.id,a.subjectId)))
    .where(and(eq(a.subjectType,'project'),eq(a.subjectId,projectId),eq(a.eventType,'PROJECT_BLUEPRINT_GENERATED'),projectReadCondition(actor))).limit(2);
  const current=await generationProject(db,actor,projectId);if(!current.ok)return current;
  if(canonicalJson(items.map(row=>`${row.kind}:${row.logicalKey}`).sort())!==canonicalJson(mappingsFor(plan))
    ||items.some(row=>!blueprintId(row.recordId))||new Set(items.map(row=>`${row.kind}:${row.recordId}`)).size!==items.length)return failure('integrity_failure');
  if(events.length!==1)return failure('integrity_failure');
  const event=events[0].event;let metadata;
  try {metadata=JSON.parse(event.metadataJson);}catch(e){if(e instanceof SyntaxError)return failure('integrity_failure');throw e;}
  if(!metadata||metadata.generationId!==source.id||metadata.milestones!==plan.milestones.length
    ||metadata.actions!==plan.actions.length||metadata.deliverables!==plan.deliverables.length
    ||!validRevision(metadata.projectRevisionBefore)||metadata.projectRevisionBefore>=Number.MAX_SAFE_INTEGER
    ||!validRevision(current.project.revision)||current.project.revision<metadata.projectRevisionBefore+1||event.actorMembershipId!==source.createdByMembershipId
    ||event.clientId!==source.clientId||event.serviceEngagementId!==source.serviceEngagementId
    ||event.occurredAt!==source.createdAt)return failure('integrity_failure');
  return {ok:true,projectId,generationId:source.id,replayed:source.id!==attemptId,
    counts:{milestones:plan.milestones.length,actions:plan.actions.length,deliverables:plan.deliverables.length,dependencies:plan.dependencies.length}};
}

// JSON is a bounded transient parameter transport, not stored operational state.
// One guarded INSERT per family avoids per-record query/parameter expansion.
function insertRows(db,table,rows,guard) {
  if(!rows.length)return null;
  const columns=Object.keys(getTableColumns(table));
  const data=rows.map(row=>Object.fromEntries(columns.map(key=>[key,row[key]??null])));
  const selection=Object.fromEntries(columns.map(key=>[key,sql`json_extract(blueprint_rows.value,${`$.${key}`})`.as(key)]));
  return db.insert(table).select(db.select(selection).from(sql`json_each(${JSON.stringify(data)}) AS blueprint_rows`).where(guard));
}

function materializedRows(context,plan,generationId,iso) {
  const ids=new Map(['milestones','actions','deliverables'].flatMap(kind=>plan[kind].map(row=>[row.logicalKey,crypto.randomUUID()])));
  const common=row=>({id:ids.get(row.logicalKey),workspaceId:context.workspaceId,projectId:context.projectId,
    creationRequestId:crypto.randomUUID(),revision:1,createdAt:iso,updatedAt:iso});
  const milestones=plan.milestones.map(row=>({...common(row),name:row.name,position:row.position,status:row.status,visibility:row.visibility}));
  const actions=plan.actions.map(row=>({...common(row),title:row.title,milestoneId:ids.get(row.milestoneKey),status:row.status,visibility:row.visibility,priority:row.priority}));
  const deliverables=plan.deliverables.map(row=>({...common(row),title:row.title,status:row.status,visibility:row.visibility}));
  const dependencies=plan.dependencies.map(row=>({id:crypto.randomUUID(),workspaceId:context.workspaceId,projectId:context.projectId,
    actionId:ids.get(row.actionKey),dependsOnActionId:ids.get(row.dependsOnActionKey),createdAt:iso}));
  const items=['milestone','action','deliverable'].flatMap(kind=>plan[`${kind}s`].map(row=>({id:crypto.randomUUID(),workspaceId:context.workspaceId,
    generationId,kind,logicalKey:row.logicalKey,recordId:ids.get(row.logicalKey),createdAt:iso})));
  return {milestones,actions,deliverables,dependencies,items};
}

export async function generateSystemsBlueprint(db,{actor,projectId,input,now=new Date()}={}) {
  const access=await generationProject(db,actor,projectId);if(!access.ok)return access;
  if(!validInput(input)||!(now instanceof Date)||!Number.isFinite(now.getTime()))return failure('invalid_input');
  const requestId=input.requestId.toLowerCase();
  const prior=await receiptResult(db,actor,projectId,requestId,input.selectedComponentKeys);if(prior)return prior;
  const source=await loadGenerationSource(db,actor,projectId);
  if(!source.ok)return await receiptResult(db,actor,projectId,requestId,input.selectedComponentKeys)||source;
  if(canonicalJson(generationPreconditions(source.context))!==canonicalJson(input.expected))return failure('conflict');
  let plan;
  try {plan=compileSystemsBlueprint({definition:source.definition,selectedComponentKeys:input.selectedComponentKeys});}
  catch(e) {if(e instanceof SystemsBlueprintError)return failure(e.reason);throw e;}
  const context=source.context,id=crypto.randomUUID(),iso=now.toISOString(),planJson=canonicalJson(plan);
  const values={id,workspaceId:context.workspaceId,projectId,clientId:context.clientId,serviceEngagementId:context.serviceEngagementId,
    serviceTypeId:context.serviceTypeId,bindingId:context.bindingId,bindingRevision:context.bindingRevision,templateId:context.templateId,
    templateVersionId:context.templateVersionId,templateVersionNumber:context.templateVersionNumber,requestId,
    blueprintKey:source.definition.blueprintKey,definitionSchemaVersion:source.definition.schemaVersion,compilerVersion:source.definition.compilerVersion,
    definitionJson:context.definitionJson,definitionHash:context.definitionHash,planJson,planHash:await hashDefinitionJson(planJson),
    createdByMembershipId:actor.membershipId,createdAt:iso};
  const selection=Object.fromEntries(Object.keys(getTableColumns(g)).map(key=>[key,sql`${values[key]}`.as(key)]));
  const winner=sql`EXISTS (SELECT 1 FROM systems_blueprint_generations winner WHERE winner.id=${id}
    AND winner.workspace_id=${context.workspaceId} AND winner.project_id=${projectId} AND winner.request_id=${requestId})`;
  const rows=materializedRows(context,plan,id,iso);
  const statements=[
    db.insert(g).select(generationSourceQuery(db,actor,projectId,selection,generationSourceMatch(context,requestId))),
    insertRows(db,schema.milestones,rows.milestones,winner),insertRows(db,schema.actions,rows.actions,winner),
    insertRows(db,schema.deliverables,rows.deliverables,winner),insertRows(db,schema.actionDependencies,rows.dependencies,winner),
    insertRows(db,i,rows.items,winner),
    activityForMutation(db,g,eq(g.id,id),projectEvent(actor,{id:projectId,name:context.projectName,clientId:context.clientId,
      serviceEngagementId:context.serviceEngagementId},'PROJECT_BLUEPRINT_GENERATED',{
      generationId:id,projectRevisionBefore:context.projectRevision,
      milestones:plan.milestones.length,actions:plan.actions.length,deliverables:plan.deliverables.length},now)),
    db.update(p).set({revision:sql`${p.revision}+1`,updatedAt:iso}).where(and(eq(p.workspaceId,context.workspaceId),eq(p.id,projectId),winner)),
  ].filter(Boolean);
  await db.batch(statements);
  return await receiptResult(db,actor,projectId,requestId,input.selectedComponentKeys,id)||failure('conflict');
}
