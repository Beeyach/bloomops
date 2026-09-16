import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {ACTIONS} from './authorization.mjs';
import {prepareProjectCreation,projectEvent} from './projects.mjs';
import {projectReadCondition} from './project-access.mjs';
import {activityForMutation} from './activity.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {canonicalJson,hashDefinitionJson} from './onboarding-definition.mjs';
import {getWorkSetup,setupId,workSetupAuthority} from './work-setups.mjs';
import {compileWorkSetup,workSetupDate,WorkSetupError} from './work-setup-values.mjs';
const p=schema.projects,g=schema.workSetupGenerations;
const missing=()=>({ok:false,reason:'not_found'}),conflict=()=>({ok:false,reason:'conflict'});
const fields=['workspaceId','userId','templateId','versionId','expectedRevision','clientId','serviceEngagementId','eventName','eventDate'];
function normalize(actor,input,create){
 if(!actor?.scope||actor.preview||!ACTIONS['project.create'].roles.includes(actor.role)||!input||typeof input!=='object'||Array.isArray(input)||input.workspaceId!==actor.workspaceId||input.userId!==actor.userId)return missing();
 if(Object.keys(input).some(k=>![...fields,...create?['requestId','planHash']:[]].includes(k))||
  !['templateId','versionId','clientId'].every(k=>setupId(input[k]))||input.serviceEngagementId!==null&&!setupId(input.serviceEngagementId)||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||!workSetupDate(input.eventDate)||
  typeof input.eventName!=='string'||!input.eventName.trim()||input.eventName.trim().length>120||/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(input.eventName)||!input.eventName.isWellFormed()||
  create&&(!REQUEST_ID.test(input.requestId||'')||typeof input.planHash!=='string'||!/^[a-f0-9]{64}$/.test(input.planHash)))return {ok:false,reason:'invalid',error:'Check the setup, Client, event name and date. Refresh the preview before generating.'};
 return {ok:true,input:{...input,eventName:input.eventName.trim()}};
}
async function proposal(db,actor,input){
 const setup=await getWorkSetup(db,actor,input.templateId);if(!setup)return missing();
 if(!setup.active||setup.versionId!==input.versionId||setup.revision!==input.expectedRevision)return conflict();
 let plan;try{plan=compileWorkSetup({definition:setup.definition,eventName:input.eventName,eventDate:input.eventDate});}catch(e){if(e instanceof WorkSetupError)return {ok:false,reason:'invalid',error:e.message};throw e;}
 const prepared=await prepareProjectCreation(db,{actor,clientId:input.clientId,input:{...plan.project,serviceEngagementId:input.serviceEngagementId}});if(!prepared.ok)return prepared;
 const planHash=await hashDefinitionJson(canonicalJson([input.clientId,input.serviceEngagementId,input.templateId,input.versionId,input.expectedRevision,plan]));
 return {ok:true,setup,plan,planHash,prepared};
}
export async function previewWorkSetup(db,actor,raw){
 const checked=normalize(actor,raw,false);if(!checked.ok)return checked;
 const result=await proposal(db,actor,checked.input);if(!result.ok)return result;
 // Do not return the unpublished Project identity allocated during preparation.
 return {ok:true,plan:result.plan,planHash:result.planHash,versionId:result.setup.versionId,revision:result.setup.revision};
}
async function previous(db,actor,input,intentHash){
 const [row]=await db.select({projectId:g.projectId,hash:g.intentHash}).from(g).innerJoin(p,and(eq(p.workspaceId,g.workspaceId),eq(p.id,g.projectId)))
 .where(and(eq(g.workspaceId,actor.workspaceId),eq(g.actorUserId,actor.userId),eq(g.requestId,input.requestId),projectReadCondition(actor),workSetupAuthority(actor))).limit(1);
 return row?row.hash===intentHash?{ok:true,projectId:row.projectId}:conflict():null;
}
export async function generateWorkSetup(db,actor,raw){
 const checked=normalize(actor,raw,true);if(!checked.ok)return checked;const input=checked.input;
 const intentHash=await hashDefinitionJson(canonicalJson([input.templateId,input.versionId,input.expectedRevision,input.clientId,input.serviceEngagementId,input.eventName,input.eventDate,input.planHash]));
 const prior=await previous(db,actor,input,intentHash);if(prior)return prior;
 const result=await proposal(db,actor,input);if(!result.ok)return result;if(result.planHash!==input.planHash)return conflict();
 const {plan,prepared}=result,{values,condition}=prepared,projectId=values.id,now=new Date(values.createdAt),iso=values.createdAt;
 const claim=and(condition,workSetupAuthority(actor),sql`EXISTS(SELECT 1 FROM work_setup_states s JOIN templates t ON t.workspace_id=s.workspace_id AND t.id=s.template_id JOIN template_versions v ON v.workspace_id=t.workspace_id AND v.template_id=t.id
 WHERE s.workspace_id=${actor.workspaceId} AND s.template_id=${input.templateId} AND s.revision=${input.expectedRevision} AND t.kind='project' AND t.active=1 AND v.id=${input.versionId} AND v.status='published' AND v.definition_hash=${result.setup.definitionHash})`,
 sql`NOT EXISTS(SELECT 1 FROM work_setup_generations WHERE workspace_id=${actor.workspaceId} AND actor_user_id=${actor.userId} AND request_id=${input.requestId})`);
 const own=and(eq(p.workspaceId,actor.workspaceId),eq(p.id,projectId));
 const writes=[insertSelected(db,p,values,schema.clients,claim),activityForMutation(db,p,own,projectEvent(actor,values,'PROJECT_CREATED',{setupVersionId:input.versionId},now))];
 const common=()=>({id:crypto.randomUUID(),workspaceId:actor.workspaceId,projectId,creationRequestId:crypto.randomUUID(),revision:1,createdAt:iso,updatedAt:iso});
 const milestoneIds=new Map(),actionIds=new Map();
 function child(table,row,subjectType,eventType,labelKey,label,details){
  writes.push(insertSelected(db,table,row,p,own),activityForMutation(db,table,and(eq(table.workspaceId,actor.workspaceId),eq(table.id,row.id)),{
   workspaceId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,clientId:values.clientId,serviceEngagementId:values.serviceEngagementId,
   subjectType,subjectId:row.id,eventType,metadata:{[labelKey]:label,details,setupVersionId:input.versionId},occurredAt:iso}));
 }
 for(const {key,...details} of plan.milestones){const row={...common(),...details,clientLabel:null,completedAt:null,waitingReason:null};milestoneIds.set(key,row.id);child(schema.milestones,row,'milestone','MILESTONE_CREATED','milestoneName',row.name,{...details,clientLabel:null});}
 for(const {key,milestoneKey,...details} of plan.actions){const row={...common(),...details,milestoneId:milestoneKey?milestoneIds.get(milestoneKey):null,assigneeMembershipId:null,completedAt:null,waitingType:null,waitingReason:null};actionIds.set(key,row.id);child(schema.actions,row,'action','ACTION_CREATED','actionTitle',row.title,{...details,milestoneId:row.milestoneId,assigneeMembershipId:null});}
 for(const {key,...details} of plan.deliverables){const row={...common(),...details,clientLabel:null,deliveredAt:null};child(schema.deliverables,row,'deliverable','DELIVERABLE_CREATED','deliverableTitle',row.title,{...details,clientLabel:null});}
 for(const edge of plan.dependencies)writes.push(insertSelected(db,schema.actionDependencies,{id:crypto.randomUUID(),workspaceId:actor.workspaceId,projectId,actionId:actionIds.get(edge.actionKey),dependsOnActionId:actionIds.get(edge.dependsOnKey),createdAt:iso},p,own));
 // The receipt validates complete child counts and parent keys. Any failed or
 // ignored child insertion aborts the whole batch; no half-generated job.
 writes.push(insertSelected(db,g,{id:crypto.randomUUID(),workspaceId:actor.workspaceId,projectId,templateId:input.templateId,templateVersionId:input.versionId,
  actorUserId:actor.userId,actorMembershipId:actor.membershipId,requestId:input.requestId,intentHash,eventName:plan.eventName,eventDate:plan.eventDate,
  planHash:result.planHash,planJson:canonicalJson(plan),createdAt:iso,milestoneCount:plan.milestones.length,actionCount:plan.actions.length,deliverableCount:plan.deliverables.length,dependencyCount:plan.dependencies.length},p,own));
 await db.batch(writes);return await previous(db,actor,input,intentHash)||conflict();
}
