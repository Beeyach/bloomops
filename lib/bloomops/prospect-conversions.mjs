import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {validateName,validateContactName,validateEmail,validateWebsite,validateTimezone,slugify} from './clients.mjs';
import {loadConversionSelection,conversionReview,normalizeConversionInput,conversionGuard,conversionProfile} from './prospect-conversion-preview.mjs';
import {loadMultiHandoff,normalizeMultiHandoff} from './prospect-multi-handoff.mjs';
import {hashDefinitionJson} from './onboarding-definition.mjs';
const p=schema.prospects,r=schema.prospectConversions,c=schema.clients,e=schema.serviceEngagements;
const missing=()=>({ok:false,reason:'not_found'});
const conflict=(message='This handoff changed. Review it again before converting.')=>({ok:false,reason:'conflict',errors:{form:message}});
const hash=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const json=value=>JSON.stringify(value);
function receipt(row){return row?{id:row.id,prospectId:row.prospectId,clientId:row.clientId,clientName:row.clientName,clientCreated:row.clientCreated,serviceEngagementId:row.serviceEngagementId,serviceTypeId:row.serviceTypeId,serviceName:row.serviceName,serviceCreated:row.serviceCreated,packageName:row.packageName,scopeNotes:row.scopeNotes,convertedAt:row.createdAt,outreachStopped:true,...(row.items?.length?{services:row.items}:{})}:null;}
async function rowFor(db,actor,id){const row=(await db.select().from(r).where(and(eq(r.workspaceId,actor?.workspaceId||''),eq(r.prospectId,id),conversionGuard(actor,id))).limit(1))[0]||null;if(row){const items=schema.prospectConversionServices;row.items=await db.select().from(items).where(and(eq(items.workspaceId,actor.workspaceId),eq(items.conversionId,row.id),conversionGuard(actor,id))).orderBy(items.serviceTypeId);if(!await conversionProfile(db,actor,id))return null;}return row;}
export async function getProspectConversion(db,actor,id){if(!await conversionProfile(db,actor,id))return missing();const row=await rowFor(db,actor,id);if(!row&&!await conversionProfile(db,actor,id))return missing();return {ok:true,receipt:receipt(row)};}
// These snapshots compare current canonical values inside the write transaction.
// One JSON parameter per record/group keeps the statement below D1's bind limit.
function selectedUnchanged(actor,id,selection,excludedServiceId){
 const {profile,type,client,primary,engagements,delivery,recipientEmails}=selection,ws=actor.workspaceId;
 return and(prospectCondition(actor),eq(p.id,id),eq(p.revision,profile.revision),
  sql`NOT EXISTS(SELECT 1 FROM prospect_conversions WHERE workspace_id=${ws} AND prospect_id=${id})`,
  sql`EXISTS(SELECT 1 FROM service_types WHERE workspace_id=${ws} AND id=${type.id} AND active=1 AND json_array(id,name,slug)=${json([type.id,type.name,type.slug])})`,
  client?sql`EXISTS(SELECT 1 FROM bloomops_clients WHERE workspace_id=${ws} AND id=${client.id} AND json_array(id,name,slug,company,website,relationship_status)=${json([client.id,client.name,client.slug,client.company,client.website,client.relationshipStatus])})`:undefined,
  client?sql`coalesce((SELECT json_array(id,name,email) FROM client_contacts WHERE workspace_id=${ws} AND client_id=${client.id} AND is_primary=1),'null')=${json(primary?[primary.id,primary.name,primary.email]:null)}`:undefined,
  client?sql`(SELECT json_group_array(json_array(id,service_type_id,slug,status,package_name,scope_notes)) FROM (SELECT se.id,se.service_type_id,st.slug,se.status,se.package_name,se.scope_notes FROM service_engagements se JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id WHERE se.workspace_id=${ws} AND se.client_id=${client.id} AND se.status IN ('planned','onboarding','active','paused') AND se.id NOT IN (SELECT value FROM json_each(${json(Array.isArray(excludedServiceId)?excludedServiceId:[excludedServiceId])})) ORDER BY se.id))=${json(engagements.map(v=>[v.id,v.serviceTypeId,v.serviceTypeSlug,v.status,v.packageName,v.scopeNotes]))}`:undefined,
  sql`coalesce((SELECT json_array(d.id,d.state,json_extract(a.snapshot_json,'$.draft.recipient')) FROM prospect_deliveries d JOIN prospect_outreach_approvals a ON a.workspace_id=d.workspace_id AND a.id=d.approval_id WHERE d.workspace_id=${ws} AND d.prospect_id=${id}),'null')=${json(delivery?[delivery.id,delivery.state,delivery.recipient]:null)}`,
  sql`NOT EXISTS(SELECT 1 FROM prospect_deliveries d JOIN prospect_outreach_approvals a ON a.workspace_id=d.workspace_id AND a.id=d.approval_id WHERE d.workspace_id=${ws} AND d.state IN ('submitting','uncertain') AND (d.prospect_id=${id} OR json_extract(a.snapshot_json,'$.draft.recipient') IN (SELECT value FROM json_each(${json(recipientEmails)}))))`);
}
export async function convertProspect(db,actor,id,command,now=new Date()){
 if(command?.services!==undefined)return convertMultiProspect(db,actor,id,command,now);
 if(!await conversionProfile(db,actor,id))return missing();actor={...actor};
 if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).some(k=>!['workspaceId','mode','clientId','serviceTypeId','packageName','scopeNotes','requestId','reviewHash','confirmed'].includes(k))||typeof command.requestId!=='string'||!REQUEST_ID.test(command.requestId)||!hash(command.reviewHash)||command.confirmed!==true)return {ok:false,reason:'invalid',errors:{form:'Review and confirm the client handoff first.'}};
 const {requestId,reviewHash,confirmed,...raw}=command,checked=normalizeConversionInput(raw,actor.workspaceId);if(!checked.ok)return checked;
 const input=checked.input,requestHash=await hashDefinitionJson(json({prospectId:id,input,reviewHash}));
 const prior=await rowFor(db,actor,id);if(prior)return prior.requestId===requestId&&prior.requestHash===requestHash?{ok:true,receipt:receipt(prior),replayed:true}:conflict('This prospect already has a recorded client conversion. Reload to view it.');
 const selection=await loadConversionSelection(db,actor,id,input);if(!selection.ok)return selection;
 const reviewed=await conversionReview(selection);if(reviewed.hash!==reviewHash)return conflict();if(reviewed.blockers.length)return {ok:false,reason:'invalid',errors:{form:reviewed.blockers.join(' ')}};
 const {profile,type,client,primary,engagements,recipientEmails}=selection;
 const existingService=engagements.find(v=>v.serviceTypeId===type.id),iso=now.toISOString();
 for(let attempt=0;attempt<3;attempt++){
  const conversionId=crypto.randomUUID(),clientId=client?.id||crypto.randomUUID(),contactId=crypto.randomUUID(),serviceId=existingService?.id||crypto.randomUUID();
  const unchanged=selectedUnchanged(actor,id,selection,existingService?'':serviceId);
  const fresh=and(unchanged,sql`NOT EXISTS(SELECT 1 FROM prospect_conversions WHERE workspace_id=${actor.workspaceId} AND request_id=${requestId})`);
  const statements=[];
  if(!client){
   const name=validateName(profile.businessName).value;
   statements.push(insertSelected(db,c,{id:clientId,workspaceId:actor.workspaceId,name,slug:slugify(name)+(attempt?'-'+crypto.randomUUID().slice(0,8):''),relationshipStatus:'draft',health:'on_track',website:validateWebsite(profile.website).value,timezone:validateTimezone(profile.timeZone==='UTC'?'Etc/UTC':profile.timeZone).value??null,createdAt:iso,updatedAt:iso},p,fresh));
   statements.push(insertSelected(db,schema.clientContacts,{id:contactId,workspaceId:actor.workspaceId,clientId,name:validateContactName(primary.name).value,email:validateEmail(primary.email,{required:true}).value,isPrimary:1,userId:null,createdAt:iso,updatedAt:iso},p,fresh));
  }
  if(!existingService)statements.push(insertSelected(db,e,{id:serviceId,workspaceId:actor.workspaceId,clientId,serviceTypeId:type.id,status:'planned',packageName:input.packageName,scopeNotes:input.scopeNotes,createdAt:iso,updatedAt:iso},p,fresh));
  const values={id:conversionId,workspaceId:actor.workspaceId,prospectId:id,requestId,requestHash,profileRevision:profile.revision,reviewHash,clientId,clientCreated:client?0:1,clientName:client?.name||validateName(profile.businessName).value,serviceEngagementId:serviceId,serviceTypeId:type.id,serviceCreated:existingService?0:1,serviceName:type.name,packageName:input.packageName,scopeNotes:input.scopeNotes,recipientEmailsJson:json(recipientEmails),convertedByMembershipId:actor.membershipId,createdAt:iso};
  statements.push(insertSelected(db,r,values,p,fresh));
  const savedCondition=and(eq(r.id,conversionId),eq(r.workspaceId,actor.workspaceId));
  const event=(eventType,subjectType,subjectId)=>activityForMutation(db,r,savedCondition,{workspaceId:actor.workspaceId,eventType,subjectType,subjectId,clientId,serviceEngagementId:serviceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{conversionId,prospectId:id},occurredAt:iso});
  if(!client)statements.push(event('CLIENT_CREATED','client',clientId));
  if(!existingService)statements.push(event('SERVICE_ENGAGEMENT_CREATED','service_engagement',serviceId));
  statements.push(event('PROSPECT_CONVERTED','prospect',id),event('PROSPECT_OUTREACH_STOPPED','prospect',id));
  try{await db.batch(statements);}catch(error){
   const message=[error?.message,error?.cause?.message].join(' ');
   if(!client&&/UNIQUE constraint failed.*bloomops_clients.*slug/i.test(message)&&attempt<2)continue;
   if(/constraint|conversion|unresolved/i.test(message)){const saved=await rowFor(db,actor,id);return saved?.requestId===requestId&&saved?.requestHash===requestHash?{ok:true,receipt:receipt(saved),replayed:true}:conflict();}
   throw error;
  }
  const saved=await rowFor(db,actor,id);if(!saved)return await conversionProfile(db,actor,id)?conflict('The handoff or delivery state changed. Review again before converting.'):missing();
  return saved.requestId===requestId&&saved.requestHash===requestHash?{ok:true,receipt:receipt(saved),replayed:saved.id!==conversionId}:conflict('This prospect already has a recorded client conversion. Reload to view it.');
 }
 return conflict();
}

async function convertMultiProspect(db,actor,id,command,now){
 if(!await conversionProfile(db,actor,id))return missing();actor={...actor};
 if(!command||Object.keys(command).some(k=>!['workspaceId','mode','clientId','services','requestId','reviewHash','confirmed'].includes(k))||typeof command.requestId!=='string'||!REQUEST_ID.test(command.requestId)||!hash(command.reviewHash)||command.confirmed!==true)return {ok:false,reason:'invalid',errors:{form:'Review and confirm the complete handoff.'}};
 const {requestId,reviewHash,confirmed,...raw}=command,checked=normalizeMultiHandoff(raw,actor.workspaceId);if(!checked.ok)return checked;
 const requestHash=await hashDefinitionJson(json({prospectId:id,input:checked.input,reviewHash}));
 const replay=saved=>saved?.requestId===requestId&&saved?.requestHash===requestHash?{ok:true,receipt:receipt(saved),replayed:true}:conflict();
 const prior=await rowFor(db,actor,id);if(prior)return replay(prior);
 const loaded=await loadMultiHandoff(db,actor,id,raw);if(!loaded.ok)return loaded;
 if(loaded.review.hash!==reviewHash)return conflict();if(loaded.review.blockers.length)return {ok:false,reason:'invalid',errors:{form:loaded.review.blockers.join(' ')}};
 const first=loaded.selections[0],{profile,client,primary,engagements,recipientEmails}=first,iso=now.toISOString();
 for(let attempt=0;attempt<3;attempt++){
  const conversionId=crypto.randomUUID(),clientId=client?.id||crypto.randomUUID(),contactId=crypto.randomUUID();
  const items=loaded.selections.map(s=>{const existing=engagements.find(e=>e.serviceTypeId===s.type.id);return {id:crypto.randomUUID(),workspaceId:actor.workspaceId,conversionId,clientId,serviceEngagementId:existing?.id||crypto.randomUUID(),serviceTypeId:s.type.id,serviceName:s.type.name,serviceCreated:existing?0:1,packageName:s.input.packageName,scopeNotes:s.input.scopeNotes};});
  const types=json(loaded.selections.map(s=>[s.type.id,s.type.name,s.type.slug]));
  const fresh=and(selectedUnchanged(actor,id,first,items.filter(x=>x.serviceCreated).map(x=>x.serviceEngagementId)),
   sql`(SELECT count(*) FROM json_each(${types}) j JOIN service_types st ON st.workspace_id=${actor.workspaceId} AND st.id=json_extract(j.value,'$[0]') AND st.active=1 AND json_array(st.id,st.name,st.slug)=j.value)=${items.length}`,
   sql`NOT EXISTS(SELECT 1 FROM prospect_conversions WHERE workspace_id=${actor.workspaceId} AND request_id=${requestId})`);
  const statements=[];
  if(!client){const name=validateName(profile.businessName).value;
   statements.push(insertSelected(db,c,{id:clientId,workspaceId:actor.workspaceId,name,slug:slugify(name)+(attempt?'-'+crypto.randomUUID().slice(0,8):''),relationshipStatus:'draft',health:'on_track',website:validateWebsite(profile.website).value,timezone:validateTimezone(profile.timeZone==='UTC'?'Etc/UTC':profile.timeZone).value??null,createdAt:iso,updatedAt:iso},p,fresh));
   statements.push(insertSelected(db,schema.clientContacts,{id:contactId,workspaceId:actor.workspaceId,clientId,name:validateContactName(primary.name).value,email:validateEmail(primary.email,{required:true}).value,isPrimary:1,userId:null,createdAt:iso,updatedAt:iso},p,fresh));
  }
  for(const item of items)if(item.serviceCreated)statements.push(insertSelected(db,e,{id:item.serviceEngagementId,workspaceId:actor.workspaceId,clientId,serviceTypeId:item.serviceTypeId,status:'planned',packageName:item.packageName,scopeNotes:item.scopeNotes,createdAt:iso,updatedAt:iso},p,fresh));
  const head=items[0];
  statements.push(insertSelected(db,r,{id:conversionId,workspaceId:actor.workspaceId,prospectId:id,requestId,requestHash,profileRevision:profile.revision,reviewHash,clientId,clientCreated:client?0:1,clientName:client?.name||validateName(profile.businessName).value,serviceEngagementId:head.serviceEngagementId,serviceTypeId:head.serviceTypeId,serviceCreated:head.serviceCreated,serviceName:head.serviceName,packageName:head.packageName,scopeNotes:head.scopeNotes,recipientEmailsJson:json(recipientEmails),convertedByMembershipId:actor.membershipId,createdAt:iso},p,and(fresh,client?undefined:sql`EXISTS(SELECT 1 FROM client_contacts WHERE workspace_id=${actor.workspaceId} AND client_id=${clientId} AND id=${contactId} AND is_primary=1)`)));
  // Deliberately not INSERT SELECT: a zero-row source or receipt write must
  // violate these required parent FKs and roll back the entire D1 batch.
  for(const item of items)statements.push(db.insert(schema.prospectConversionServices).values(item));
  const saved=and(eq(r.id,conversionId),eq(r.workspaceId,actor.workspaceId));
  const event=(eventType,subjectType,subjectId,serviceEngagementId=head.serviceEngagementId)=>activityForMutation(db,r,saved,{workspaceId:actor.workspaceId,eventType,subjectType,subjectId,clientId,serviceEngagementId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{conversionId,prospectId:id},occurredAt:iso});
  if(!client)statements.push(event('CLIENT_CREATED','client',clientId));
  for(const item of items)if(item.serviceCreated)statements.push(event('SERVICE_ENGAGEMENT_CREATED','service_engagement',item.serviceEngagementId,item.serviceEngagementId));
  statements.push(event('PROSPECT_CONVERTED','prospect',id),event('PROSPECT_OUTREACH_STOPPED','prospect',id));
  try{await db.batch(statements);}catch(error){const message=[error?.message,error?.cause?.message].join(' ');if(!client&&/UNIQUE constraint failed.*bloomops_clients.*slug/i.test(message)&&attempt<2)continue;if(/constraint|conversion/i.test(message))return replay(await rowFor(db,actor,id));throw error;}
  const result=await rowFor(db,actor,id);return result?{...replay(result),replayed:result.id!==conversionId}:conflict();
 }
 return conflict();
}
