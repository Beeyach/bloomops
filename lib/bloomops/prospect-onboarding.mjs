import {requiredCategories} from './onboarding-compiler.mjs';
import {canonicalJson,hashDefinitionJson} from './onboarding-definition.mjs';
import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {administratorCondition} from './workspaces.mjs';
import {prepareOnboardingPlan} from './onboarding-generation.mjs';
import {activateClient} from './client-activation.mjs';
import {importHash} from './prospect-import-values.mjs';
import {SERVICE_OPEN_STATUSES} from './services.mjs';
import {evaluate} from './authorization.mjs';
const p=schema.prospects,c=schema.clients,r=schema.prospectConversions,s=schema.serviceEngagements,t=schema.serviceTypes,ct=schema.clientContacts;
export async function reviewProspectOnboarding(db,actor,id){
 if(!actor||!evaluate(actor,{action:'prospecting.manage'}).allowed)return null;
 const condition=and(prospectCondition(actor),eq(p.id,id));
 const read=()=>db.select({id:r.id,clientId:c.id,clientName:c.name,status:c.relationshipStatus,prospectName:p.businessName}).from(p).innerJoin(r,and(eq(r.workspaceId,p.workspaceId),eq(r.prospectId,p.id))).innerJoin(c,and(eq(c.workspaceId,r.workspaceId),eq(c.id,r.clientId))).where(condition).limit(1);
 const [row]=await read();if(!row)return null;
 const [activation]=await db.select({instanceId:schema.clientActivations.onboardingInstanceId}).from(schema.clientActivations).where(and(eq(schema.clientActivations.workspaceId,actor.workspaceId),eq(schema.clientActivations.clientId,row.clientId),administratorCondition(actor,{purpose:'prospecting'}))).limit(1);
 if(activation)return {...row,state:'ready',instanceId:activation.instanceId};
 if(row.status!=='draft')return {...row,state:['active','onboarding'].includes(row.status)?'existing':'blocked',error:['active','onboarding'].includes(row.status)?null:'This client lifecycle does not support initial onboarding.'};
 const services=await db.select({id:s.id,typeId:s.serviceTypeId,slug:t.slug,status:s.status}).from(s).innerJoin(t,and(eq(t.workspaceId,s.workspaceId),eq(t.id,s.serviceTypeId))).where(and(eq(s.workspaceId,actor.workspaceId),eq(s.clientId,row.clientId),sql`${s.status} IN (${sql.join(SERVICE_OPEN_STATUSES.map(v=>sql`${v}`),sql`,`)})`,administratorCondition(actor,{purpose:'prospecting'}))).orderBy(s.id).limit(51);
 const [contact]=await db.select({id:ct.id,name:ct.name,email:ct.email}).from(ct).where(and(eq(ct.workspaceId,actor.workspaceId),eq(ct.clientId,row.clientId),eq(ct.isPrimary,true),administratorCondition(actor,{purpose:'prospecting'}))).limit(1);
 if(!contact?.email||!services.length||services.length>50)return {...row,state:'blocked',error:'Add a primary email and between 1 and 50 open purchased services in Clients.'};
 const planned=await prepareOnboardingPlan(db,{workspaceId:actor.workspaceId,clientId:row.clientId,serviceEngagementIds:services.map(v=>v.id)});
 if(!(await read()).length)return null;
 if(!planned.ok)return {...row,state:'blocked',error:'Onboarding templates need attention in Settings. Publish the common template and a template for each purchased service, then retry.',reason:planned.reason};
 const reviewHash=await importHash({row,contact,services,plan:planned.plan});
 return {...row,state:'review',reviewHash,planHash:await hashDefinitionJson(canonicalJson(planned.plan)),serviceSnapshot:JSON.stringify(services),contactSnapshot:contact,contactName:contact.name,contactEmail:contact.email,stepCount:planned.plan.items.length,templates:planned.plan.sourceTemplateVersions,templateNames:requiredCategories(services.map(s=>({serviceTypeSlug:s.slug}))).map(s=>s==='common'?'Common onboarding':s.toUpperCase()+' onboarding'),serviceNames:services.map(v=>v.slug)};
}
export async function startProspectOnboarding(db,actor,id,input){
 if(!input||Object.keys(input).some(k=>!['workspaceId','confirmed','reviewHash'].includes(k))||input.workspaceId!==actor?.workspaceId||input.confirmed!==true||typeof input.reviewHash!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewHash))return {invalid:true,error:'Review and explicitly confirm onboarding setup.'};
 const review=await reviewProspectOnboarding(db,actor,id);if(!review)return null;if(['ready','existing'].includes(review.state))return review;
 if(review.state!=='review'||review.reviewHash!==input.reviewHash)return {conflict:true,error:review.error||'The client or templates changed. Review onboarding again.'};
 // Compose with canonical activation. No invitation/contact identity is created.
 const guard=sql`(SELECT json_group_array(json_object('id',id,'typeId',type_id,'slug',slug,'status',status)) FROM (SELECT se.id,se.service_type_id type_id,st.slug,se.status FROM service_engagements se JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id WHERE se.workspace_id=${actor.workspaceId} AND se.client_id=${review.clientId} AND se.status IN (${sql.join(SERVICE_OPEN_STATUSES.map(v=>sql`${v}`),sql`,`)}) ORDER BY se.id))=${review.serviceSnapshot} AND EXISTS(SELECT 1 FROM client_contacts ct WHERE ct.workspace_id=${actor.workspaceId} AND ct.client_id=${review.clientId} AND ct.id=${review.contactSnapshot.id} AND ct.name=${review.contactSnapshot.name} AND ct.email=${review.contactSnapshot.email} AND ct.is_primary=1) AND ${administratorCondition(actor,{purpose:'prospecting'})} AND EXISTS(SELECT 1 FROM prospect_conversions pc WHERE pc.workspace_id=${actor.workspaceId} AND pc.prospect_id=${id} AND pc.client_id=${review.clientId})`;
 const result=await activateClient(db,{actor,clientId:review.clientId,sendInvitation:false,activationGuard:guard,expectedPlanHash:review.planHash});
 if(!result.ok)return {conflict:true,error:'Onboarding was not completed. Check the client and templates, then retry.',reason:result.reason};
 return reviewProspectOnboarding(db,actor,id);
}
