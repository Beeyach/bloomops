import {and, asc, eq, inArray, sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {evaluate} from './authorization.mjs';
import {validateEmail, validateName, validateContactName, validateWebsite, validateTimezone, clientStatusLabel} from './clients.mjs';
import {validatePackageName, validateScopeNotes, SERVICE_OPEN_STATUSES} from './services.mjs';
import {requiredCategories, compileOnboardingPlan} from './onboarding-compiler.mjs';
import {currentPublishedVersion} from './onboarding-templates.mjs';
import {hashDefinitionJson, OnboardingError, SERVICE_TEMPLATE_MAP} from './onboarding-definition.mjs';

const p=schema.prospects,c=schema.clients,t=schema.serviceTypes,s=schema.serviceEngagements,contact=schema.clientContacts;
const missing=()=>({ok:false,reason:'not_found'});
const invalid=errors=>({ok:false,reason:'invalid',errors});
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(x);
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const guard=(actor,id)=>sql`EXISTS(SELECT 1 FROM ${p} WHERE ${and(prospectCondition(actor),eq(p.id,id))})`;
const clientFields={id:c.id,name:c.name,slug:c.slug,company:c.company,website:c.website,relationshipStatus:c.relationshipStatus};
async function prospect(db,actor,id){
 if(!allowed(actor)||!identifier(id))return null;
 return (await db.select({id:p.id,workspaceId:p.workspaceId,revision:p.revision,businessName:p.businessName,personName:p.personName,publicEmail:p.publicEmail,website:p.website,timeZone:p.timeZone}).from(p).where(and(prospectCondition(actor),eq(p.id,id))).limit(1))[0]||null;
}
function queryValues(input){
 if(!object(input)||Object.keys(input).some(k=>!['clientQuery','serviceQuery','clientPage','servicePage'].includes(k)))return null;
 const out={};for(const key of ['clientQuery','serviceQuery']){const v=input[key]??'';if(typeof v!=='string'||v.length>120||/[\x00-\x1f\x7f]/.test(v))return null;out[key]=v.trim();}
 for(const key of ['clientPage','servicePage']){const v=String(input[key]??'1');if(!/^[1-9][0-9]{0,3}$/.test(v))return null;out[key]=Number(v);}return out;
}
const like=value=>'%'+value.replace(/[!%_]/g,x=>'!'+x)+'%';
export async function getConversionOptions(db,actor,id,input={}){
 if(!allowed(actor))return missing();actor={...actor};const q=queryValues(input);if(!q)return invalid({form:'Check the search and page.'});
 const profile=await prospect(db,actor,id);if(!profile)return missing();
 const [clients,types]=await Promise.all([
  db.select(clientFields).from(c).where(and(eq(c.workspaceId,actor.workspaceId),guard(actor,id),q.clientQuery?sql`(${c.name} LIKE ${like(q.clientQuery)} ESCAPE '!' OR ${c.company} LIKE ${like(q.clientQuery)} ESCAPE '!')`:undefined)).orderBy(asc(c.name),asc(c.id)).limit(21).offset((q.clientPage-1)*20),
  db.select({id:t.id,name:t.name,slug:t.slug,updatedAt:t.updatedAt}).from(t).where(and(eq(t.workspaceId,actor.workspaceId),eq(t.active,true),guard(actor,id),q.serviceQuery?sql`${t.name} LIKE ${like(q.serviceQuery)} ESCAPE '!'`:undefined)).orderBy(asc(t.name),asc(t.id)).limit(21).offset((q.servicePage-1)*20),
 ]);
 if(!await prospect(db,actor,id))return missing();
 return {ok:true,profile,...q,clients:clients.slice(0,20).map(row=>({...row,statusLabel:clientStatusLabel(row.relationshipStatus)})),moreClients:clients.length>20,services:types.slice(0,20),moreServices:types.length>20};
}
function normalize(input,workspaceId){
 if(!object(input)||Object.keys(input).some(k=>!['workspaceId','mode','clientId','serviceTypeId','packageName','scopeNotes'].includes(k))||input.workspaceId!==workspaceId)return invalid({form:'Reload the workspace and try again.'});
 const errors={};if(!['new','existing'].includes(input.mode))errors.mode='Choose a new or existing client.';
 if(input.mode==='existing'&&!identifier(input.clientId)||input.mode==='new'&&input.clientId)errors.clientId='Choose an existing client only when linking one.';
 if(!identifier(input.serviceTypeId))errors.serviceTypeId='Choose the service that was purchased.';
 for(const key of ['packageName','scopeNotes'])if(typeof(input[key]??'')!=='string'||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input[key]||''))errors[key]='Enter plain text.';
 if(Object.keys(errors).length)return invalid(errors);
 const name=validatePackageName(input.packageName),scope=validateScopeNotes(input.scopeNotes);
 if(!name.ok)errors.packageName=name.message;if(!scope.ok||!scope.value)errors.scopeNotes=scope.message||'Describe the agreed scope.';
 return Object.keys(errors).length?invalid(errors):{ok:true,input:{workspaceId,mode:input.mode,clientId:input.mode==='existing'?input.clientId:null,serviceTypeId:input.serviceTypeId,packageName:name.value,scopeNotes:scope.value}};
}
export async function loadConversionSelection(db,actor,id,input){
 if(!allowed(actor))return missing();actor={...actor};const checked=normalize(input,actor.workspaceId);if(!checked.ok)return checked;input=checked.input;
 const profile=await prospect(db,actor,id);if(!profile)return missing();
 const access=guard(actor,id),workspaceId=actor.workspaceId;
 let client=null,primary=null,engagements=[];
 const [type]=await db.select({id:t.id,name:t.name,slug:t.slug}).from(t).where(and(eq(t.id,input.serviceTypeId),eq(t.workspaceId,workspaceId),eq(t.active,true),access)).limit(1);if(!type)return missing();
 if(input.mode==='existing'){
  [client]=await db.select(clientFields).from(c).where(and(eq(c.id,input.clientId),eq(c.workspaceId,workspaceId),access)).limit(1);if(!client)return missing();
  [primary]=await db.select({id:contact.id,name:contact.name,email:contact.email}).from(contact).where(and(eq(contact.clientId,client.id),eq(contact.workspaceId,workspaceId),eq(contact.isPrimary,true),access)).limit(1);
  engagements=await db.select({id:s.id,serviceTypeId:s.serviceTypeId,serviceTypeSlug:t.slug,status:s.status,packageName:s.packageName,scopeNotes:s.scopeNotes}).from(s).innerJoin(t,and(eq(t.id,s.serviceTypeId),eq(t.workspaceId,s.workspaceId))).where(and(eq(s.workspaceId,workspaceId),eq(s.clientId,client.id),inArray(s.status,SERVICE_OPEN_STATUSES),access)).orderBy(asc(s.id)).limit(51);
 }else primary={name:profile.personName,email:profile.publicEmail};
 const d=schema.prospectDeliveries,a=schema.prospectOutreachApprovals;
 const [delivery]=await db.select({id:d.id,state:d.state,recipient:sql`json_extract(${a.snapshotJson},'$.draft.recipient')`}).from(d).innerJoin(a,and(eq(a.workspaceId,d.workspaceId),eq(a.id,d.approvalId))).where(and(eq(d.workspaceId,workspaceId),eq(d.prospectId,id),access)).limit(1);
 const recipientEmails=[...new Set([profile.publicEmail,primary?.email,delivery?.recipient].map(email=>validateEmail(email).value).filter(Boolean))].sort();
 return {ok:true,input,profile,type,client,primary:primary||null,engagements,delivery:delivery||null,recipientEmails};
}
export async function conversionReview(selection){
 const {input,profile,client,primary,type,engagements,delivery,recipientEmails}=selection,blockers=[];
 if(!client){
  if(!validateName(profile.businessName).ok)blockers.push('Shorten the prospect business name before creating the client.');
  if(!validateContactName(primary?.name).ok)blockers.push('Add a valid contact name to the prospect profile.');
  if(!validateEmail(primary?.email,{required:true}).ok)blockers.push('Add a valid contact email to the prospect profile.');
  if(!validateWebsite(profile.website).ok)blockers.push('Correct the prospect website before creating the client.');
 }else if(['completed','ended'].includes(client.relationshipStatus))blockers.push('This client is closed. Choose a current client or create a new one.');
 if(engagements.length>50||(engagements.length===50&&!engagements.some(row=>row.serviceTypeId===type.id)))blockers.push('Review the existing services before adding another.');
 if(delivery&&['submitting','uncertain'].includes(delivery.state))blockers.push('A delivery is still unresolved. Resolve it before recording the sale.');
 const hash=await hashDefinitionJson(JSON.stringify({input,profile,client,primary,type,engagements,delivery,recipientEmails}));
 return {hash,profileRevision:profile.revision,blockers};
}
export {normalize as normalizeConversionInput,guard as conversionGuard,prospect as conversionProfile};
export async function previewProspectConversion(db,actor,id,input,additionalTypes=[]){
 const selection=await loadConversionSelection(db,actor,id,input);if(!selection.ok)return selection;
 actor={...actor};({input}=selection);const {profile,type,client,primary,engagements}=selection,workspaceId=actor.workspaceId,access=guard(actor,id);
 const issues=[];
 if(input.mode==='new'&&profile.timeZone&&!validateTimezone(profile.timeZone==='UTC'?'Etc/UTC':profile.timeZone).ok)issues.push({code:'timezone_review',message:'This prospect timezone is not a supported Client timezone. The Client timezone will stay unknown until reviewed.'});
 if(!validateContactName(primary?.name).ok)issues.push({code:'contact_name',message:'Confirm the primary contact name.'});
 if(!validateEmail(primary?.email,{required:true}).ok)issues.push({code:'contact_email',message:'Confirm a valid primary contact email.'});
 if(input.mode==='new'&&!validateName(profile.businessName).ok)issues.push({code:'client_name',message:'Shorten the client name before creating the client.'});
 if(client&&client.relationshipStatus!=='draft')issues.push({code:'client_lifecycle',message:'This client has already left Draft. Review its existing onboarding instead of starting initial activation again.'});
 if(engagements.length>50)issues.push({code:'service_limit',message:'Review the existing services before adding another.'});
 if(client){const i=schema.onboardingInstances;const [open]=await db.select({id:i.id}).from(i).where(and(eq(i.workspaceId,workspaceId),eq(i.clientId,client.id),sql`${i.status}<>'complete'`,access)).limit(1);if(open)issues.push({code:'onboarding_exists',message:'An onboarding instance is already open. Review it before generating another.'});}
 const existingService=engagements.find(row=>row.serviceTypeId===type.id);
 let onboarding={status:'not_checked',steps:null,categories:[]};
 if(engagements.length<=50&&(!client||client.relationshipStatus==='draft')){
  // Preview-only identifiers never cross the response boundary or reach writes.
  const clientId=client?.id||'preview-client',services=engagements.map(row=>({...row,workspaceId,clientId}));
  if(!existingService)services.push({id:'preview-service',workspaceId,clientId,serviceTypeSlug:type.slug});
  for(const additional of additionalTypes)if(!services.some(row=>row.serviceTypeSlug===additional.slug))services.push({id:'preview-service-'+additional.id,workspaceId,clientId,serviceTypeSlug:additional.slug});
  if(services.length>50)issues.push({code:'service_limit',message:'Review the existing services before adding another.'});
  else{
   const categories=requiredCategories(services),snapshots=[];
   try{
    for(const category of categories){const source=await currentPublishedVersion(db,workspaceId,category,access);if(!source){issues.push({code:'template_missing',message:'Publish the '+category+' onboarding template.'});continue;}if(await hashDefinitionJson(source.definitionJson)!==source.definitionHash)throw new OnboardingError('invalid_definition');snapshots.push(source);}
    if(snapshots.length===categories.length){const plan=compileOnboardingPlan({workspaceId,clientId,services,snapshots});onboarding={status:'compiled',steps:plan.items.length,categories};}
    else onboarding={status:'missing_template',steps:null,categories};
   }catch(error){if(!(error instanceof OnboardingError))throw error;onboarding={status:'unavailable',steps:null,categories};issues.push({code:'template_invalid',message:'Review the published onboarding templates before continuing.'});}
  }
 }
 // Nothing is returned after membership/workspace/prospect access is revoked,
 // including during asynchronous hash verification. This is not a write token.
 const review=await conversionReview(selection);
 const current=await prospect(db,actor,id);if(!current)return missing();if(current.revision!==profile.revision)return {ok:false,reason:'conflict',errors:{form:'The prospect changed. Review the latest profile first.'}};
 return {ok:true,previewOnly:true,conversionReview:review,client:client?{...client,statusLabel:clientStatusLabel(client.relationshipStatus)}:{id:null,name:profile.businessName,company:null,website:profile.website,timezone:validateTimezone(profile.timeZone==='UTC'?'Etc/UTC':profile.timeZone).value??null,relationshipStatus:'draft'},contact:primary?{name:primary.name||null,email:primary.email||null}:null,
  service:{id:type.id,name:type.name,slug:type.slug,existing:Boolean(existingService),serviceSpecific:Object.hasOwn(SERVICE_TEMPLATE_MAP,type.slug),packageName:input.packageName,scopeNotes:input.scopeNotes},onboarding,issues};
}
