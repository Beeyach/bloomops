import {and,desc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {prospectCondition,getProspect} from './prospects.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {PROSPECT_FIELDS,normalizeProspectFields,safeProspectUrl} from './prospect-values.mjs';
import {prospectSkill} from './prospect-skills.mjs';
import {skillResultErrors} from './skill-result-validation.mjs';
import {importHash} from './prospect-import-values.mjs';
export const SKILL_RESULT_LIMIT=512*1024;
const p=schema.prospects,r=schema.prospectSkillResults,f=schema.prospectFieldSources;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const scope=(actor,id)=>and(prospectCondition(actor),eq(p.id,id));
const unavailable=()=>({unavailable:true,error:'The result could not be saved. Retry the same request.'});
const conflict=()=>({conflict:true,error:'The profile or review changed. Preview the result again and review your choices.'});
export function parseSkillResult(document){
 if(!plain(document))return {invalid:true,error:'Choose a JSON skill result.'};
 const skill=prospectSkill(document.skill?.id);
 if(!skill||document.skill?.version!==skill.version)return {invalid:true,error:'Use a supported skill and version from the Skills Library.'};
 const errors=skillResultErrors(document,skill.resultSchema);
 if(errors.length)return {invalid:true,error:'Check the skill result.',errors:errors.slice(0,8)};
 if(new TextEncoder().encode(JSON.stringify(document)).byteLength>SKILL_RESULT_LIMIT)return {invalid:true,error:'Use a result smaller than 512 KiB.'};
 const fields={...document.fields};
 if(skill.id==='audit'){
  const observed=document.observations.filter(o=>o.outcome==='observed'),first=observed.find(o=>o.targetUrl&&o.observedAt);
  const inferred={...(observed.length?{observedFacts:observed.map(o=>o.description).join('\n\n'),evidenceInteraction:observed.map(o=>o.interaction).join('\n\n')}:{ }),
   ...(document.unknowns.length?{unknowns:document.unknowns.join('\n\n')}:{ }),...(document.offer.suggestion?{proposedWork:document.offer.suggestion}:{ }),
   ...(first?{evidenceDate:first.observedAt.slice(0,10),evidenceTarget:first.targetUrl}:{ })};
  for(const [key,value] of Object.entries(inferred))if(!Object.hasOwn(fields,key))fields[key]=value;
 }
 const normalized=normalizeProspectFields(fields);
 if(!normalized.ok)return {invalid:true,error:'Check the proposed profile fields.',errors:Object.values(normalized.errors)};
 const sources=document.fieldSources;
 if(new Set(sources.map(s=>s.fieldKey)).size!==sources.length)return {invalid:true,error:'Use one source per proposed field.'};
 for(const source of sources)if(!Object.hasOwn(normalized.fields,source.fieldKey))return {invalid:true,error:'Field sources must belong to proposed fields.'};
 for(const url of [...document.observations.map(o=>o.targetUrl),...sources.map(s=>s.sourceUrl),document.contactResearch.sourceUrl])if(url!==null&&!safeProspectUrl(url))return {invalid:true,error:'Use complete http or https source URLs without credentials.'};
 for(const o of document.observations){
  if(o.observedAt!==null&&!validObservationDate(o.observedAt))return {invalid:true,error:'Use a valid observation date or leave it unknown.'};
  if(o.outcome==='observed'&&(!o.targetUrl||!o.observedAt))return {invalid:true,error:'Every observed interaction needs its source URL and date. Otherwise mark it uncertain or not tested.'};
 }
 if(document.contactResearch.email!==null&&!normalizeProspectFields({publicEmail:document.contactResearch.email}).ok)return {invalid:true,error:'Use a public email address or leave it unknown.'};
 const identity=canonical({...document,fields:normalized.fields,
  observations:document.observations.map(o=>({...o,targetUrl:safeProspectUrl(o.targetUrl)})),
  fieldSources:sources.map(source=>({...source,sourceUrl:safeProspectUrl(source.sourceUrl)})),
  contactResearch:{...document.contactResearch,email:normalizeProspectFields({publicEmail:document.contactResearch.email}).fields.publicEmail,sourceUrl:safeProspectUrl(document.contactResearch.sourceUrl)}});
 // Retain original prose/artifact separately from the normalized deduplication identity.
 return {document:canonical(document),identity,fields:normalized.fields,skill};
}
function validObservationDate(value){const day=value.slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day&&(value===day||/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(value)&&Number.isFinite(Date.parse(value)));}
export async function previewSkillResult(db,actor,input){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','prospectId','document'])||input.workspaceId!==actor.workspaceId||typeof input.prospectId!=='string'||!input.prospectId||input.prospectId.length>200)return {invalid:true,error:'Open result review from the prospect profile.'};
 const parsed=parseSkillResult(input.document);if(parsed.invalid)return parsed;
 const origin=parsed.document.sourceContext;if(origin.workspaceId!==actor.workspaceId||origin.prospectId!==input.prospectId)return {invalid:true,error:'This result belongs to another prospect or workspace.'};
 const data=await getProspect(db,actor,input.prospectId);if(!data)return null;
 if(origin.revision>data.profile.revision)return {invalid:true,error:'The result refers to a future profile revision. Check its saved context.'};
 const changes=Object.entries(parsed.fields).sort(([a],[b])=>a.localeCompare(b)).filter(([key,value])=>value!==data.profile[key]).map(([key,value])=>({key,label:PROSPECT_FIELDS[key].label,section:PROSPECT_FIELDS[key].section,current:data.profile[key]??null,proposed:value}));
 const hash=await importHash({document:parsed.document,revision:data.profile.revision,changes});
 const [current]=await db.select({revision:p.revision}).from(p).where(scope(actor,input.prospectId)).limit(1);
 if(!current)return null;if(current.revision!==data.profile.revision)return conflict();
 return {previewHash:hash,revision:current.revision,sourceRevision:origin.revision,stale:origin.revision!==current.revision,changes,document:parsed.document,skill:{id:parsed.skill.id,title:parsed.skill.title,version:parsed.skill.version}};
}
const resultColumns={id:r.id,skillId:r.skillId,skillVersion:r.skillVersion,sourceRevision:r.sourceRevision,appliedRevision:r.appliedRevision,createdAt:r.createdAt};
export async function listSkillResults(db,actor,id,page=1){
 if(!allowed(actor)||!Number.isInteger(page)||page<1||page>10000)return null;
 const rows=await db.select(resultColumns).from(r).innerJoin(p,and(eq(p.id,r.prospectId),eq(p.workspaceId,r.workspaceId))).where(scope(actor,id)).orderBy(desc(r.createdAt),desc(r.id)).limit(21).offset((page-1)*20);
 const [profile]=await db.select({id:p.id,businessName:p.businessName,website:p.website}).from(p).where(scope(actor,id)).limit(1);if(!profile)return null;
 return {profile,rows:rows.slice(0,20),page,more:rows.length>20};
}
export async function getSkillResult(db,actor,id,resultId){
 if(!allowed(actor))return null;
 const [row]=await db.select({...resultColumns,fullReport:r.fullReport,documentJson:r.documentJson,acceptedFieldsJson:r.acceptedFieldsJson,businessName:p.businessName,website:p.website,prospectId:p.id}).from(r).innerJoin(p,and(eq(p.id,r.prospectId),eq(p.workspaceId,r.workspaceId))).where(and(scope(actor,id),eq(r.id,resultId))).limit(1);
 return row?{...row,document:JSON.parse(row.documentJson),acceptedFields:JSON.parse(row.acceptedFieldsJson),documentJson:undefined,acceptedFieldsJson:undefined}:null;
}
export async function applySkillResult(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!exact(input,['workspaceId','prospectId','document','requestId','previewHash','expectedRevision','choices'])||input.workspaceId!==actor.workspaceId||typeof input.prospectId!=='string'||!input.prospectId||input.prospectId.length>200||typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId)||typeof input.previewHash!=='string'||!/^[a-f0-9]{64}$/.test(input.previewHash)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||!plain(input.choices)||Object.keys(input.choices).some(k=>!Object.hasOwn(PROSPECT_FIELDS,k))||Object.values(input.choices).some(v=>!['keep','apply'].includes(v)))return {invalid:true,error:'Preview this result before saving.'};
 const parsed=parseSkillResult(input.document);if(parsed.invalid)return parsed;
 if(parsed.document.sourceContext.workspaceId!==actor.workspaceId||parsed.document.sourceContext.prospectId!==input.prospectId)return {invalid:true,error:'This result belongs to another prospect or workspace.'};
 const resultHash=await importHash(parsed.identity),requestHash=await importHash(canonical({resultHash,previewHash:input.previewHash,expectedRevision:input.expectedRevision,choices:input.choices,prospectId:input.prospectId}));
 const prior=async()=>{
  const rows=await db.select({id:r.id,requestId:r.requestId,requestHash:r.requestHash,resultHash:r.resultHash,actor:r.createdByMembershipId,prospectId:r.prospectId}).from(r).innerJoin(p,and(eq(p.id,r.prospectId),eq(p.workspaceId,r.workspaceId)))
   .where(and(prospectCondition(actor),sql`(${r.requestId}=${input.requestId} OR (${r.prospectId}=${input.prospectId} AND ${r.resultHash}=${resultHash}))`)).limit(2);
  const request=rows.find(row=>row.requestId===input.requestId);
  if(request)return request.requestHash===requestHash&&request.actor===actor.membershipId?{resultId:request.id,unchanged:true}:conflict();
  return rows[0]?{resultId:rows[0].id,unchanged:true}:null;
 };
 const previous=await prior();if(previous)return previous;
 const preview=await previewSkillResult(db,actor,{workspaceId:input.workspaceId,prospectId:input.prospectId,document:input.document});if(!preview||preview.invalid)return preview;if(preview.conflict)return await prior()||preview;
 if(preview.revision!==input.expectedRevision||preview.previewHash!==input.previewHash)return await prior()||conflict();
 if(Object.keys(input.choices).length!==preview.changes.length||preview.changes.some(c=>!Object.hasOwn(input.choices,c.key)))return {invalid:true,error:'Choose Keep current or Use result for every proposed field.'};
 const selected=preview.changes.filter(c=>input.choices[c.key]==='apply'),fields=Object.fromEntries(selected.map(c=>[c.key,c.proposed])),id=crypto.randomUUID(),iso=now.toISOString();
 const condition=and(scope(actor,input.prospectId),eq(p.revision,input.expectedRevision),sql`NOT EXISTS(SELECT 1 FROM prospect_skill_results WHERE workspace_id=${actor.workspaceId} AND (request_id=${input.requestId} OR (prospect_id=${input.prospectId} AND result_hash=${resultHash})))`);
 const own=and(scope(actor,input.prospectId),eq(p.revision,input.expectedRevision),sql`EXISTS(SELECT 1 FROM prospect_skill_results WHERE id=${id} AND workspace_id=${actor.workspaceId} AND prospect_id=${input.prospectId})`);
 const statements=[insertSelected(db,r,{id,workspaceId:actor.workspaceId,prospectId:input.prospectId,requestId:input.requestId,requestHash,resultHash,createdByMembershipId:actor.membershipId,skillId:parsed.skill.id,skillVersion:parsed.skill.version,sourceRevision:parsed.document.sourceContext.revision,appliedRevision:input.expectedRevision+1,fullReport:parsed.document.fullReport,documentJson:JSON.stringify(parsed.document),acceptedFieldsJson:JSON.stringify(fields),createdAt:iso},p,condition)];
 for(const {key} of selected){const sourceUrl=parsed.document.fieldSources.find(s=>s.fieldKey===key)?.sourceUrl||null;const values={workspaceId:actor.workspaceId,prospectId:input.prospectId,fieldKey:key,sourceKind:'manual',sourceUrl,verification:'unverified',checkedAt:null,updatedByMembershipId:actor.membershipId,updatedAt:iso};
  statements.push(insertSelected(db,f,values,p,own).onConflictDoUpdate({target:[f.workspaceId,f.prospectId,f.fieldKey],set:{sourceKind:'manual',sourceUrl,verification:'unverified',checkedAt:null,updatedByMembershipId:actor.membershipId,updatedAt:iso}}));}
 statements.push(activityForMutation(db,p,own,{workspaceId:actor.workspaceId,eventType:'PROSPECT_SKILL_RESULT_SAVED',subjectType:'prospect',subjectId:input.prospectId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{fields:selected.map(c=>c.key),resultId:id,skillId:parsed.skill.id,skillVersion:parsed.skill.version},occurredAt:iso}),db.update(p).set({...fields,revision:sql`${p.revision}+1`,updatedAt:iso}).where(own));
 try{await db.batch(statements);}catch{return await prior()||unavailable();}
 const saved=await prior();return saved?{...saved,...(saved.resultId===id?{unchanged:false}:{})}:conflict();
}
