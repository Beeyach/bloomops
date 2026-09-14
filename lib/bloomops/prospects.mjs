import {and,asc,desc,eq,or,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {activityForMutation} from './activity.mjs';
import {readTogether} from './read-batch.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {PROSPECT_FIELDS,PROSPECT_FIT,normalizeProspectFields,safeProspectUrl} from './prospect-values.mjs';
const p=schema.prospects,f=schema.prospectFieldSources,w=schema.workspaces,a=schema.activityEvents,m=schema.workspaceMemberships,u=schema.user;
const missing=()=>({ok:false,reason:'not_found'}),invalid=errors=>({ok:false,reason:'invalid',errors});
const permitted=(actor,action='prospecting.view')=>actor&&evaluate(actor,{action}).allowed;
export const prospectCondition=actor=>and(eq(p.workspaceId,actor?.workspaceId||''),administratorCondition(actor,{purpose:'prospecting'}));
const profileColumns={id:p.id,workspaceId:p.workspaceId,revision:p.revision,...Object.fromEntries(Object.keys(PROSPECT_FIELDS).map(k=>[k,p[k]])),createdAt:p.createdAt,updatedAt:p.updatedAt};
export function prospectFilters(input={}){
 const q=typeof input.q==='string'?input.q.trim():'',fit=input.fit||'',page=Number(input.page||1);
 return q.length<=160&&(!fit||Object.hasOwn(PROSPECT_FIT,fit))&&Number.isInteger(page)&&page>=1&&page<=10000?{q,fit,page}:null;
}
export async function listProspects(db,actor,input={}){
 if(!permitted(actor))return null;
 const filters=prospectFilters(input);if(!filters)return {invalid:true,rows:[],more:false};
 const pattern=`%${filters.q.replace(/[!%_]/g,c=>'!'+c)}%`;
 const rows=await db.select({id:p.id,businessName:p.businessName,personName:p.personName,website:p.website,platform:p.platform,fit:p.fit,fitReason:p.fitReason})
  .from(p).where(and(prospectCondition(actor),filters.fit?eq(p.fit,filters.fit):undefined,filters.q?or(...[p.businessName,p.personName,p.website,p.publicEmail].map(c=>sql`${c} LIKE ${pattern} ESCAPE '!'`)):undefined))
  .orderBy(asc(p.businessName),asc(p.id)).limit(51).offset((filters.page-1)*50);
 return {...filters,rows:rows.slice(0,50),more:rows.length>50};
}
export async function getProspect(db,actor,id,{activityPage=1}={}){
 if(!permitted(actor)||!Number.isInteger(activityPage)||activityPage<1||activityPage>10000)return null;
 const condition=and(prospectCondition(actor),eq(p.id,String(id)));
 const [profile]=await db.select(profileColumns).from(p).where(condition).limit(1);if(!profile)return null;
 const [sources,history,imports]=await readTogether(db,db=>Promise.all([
  db.select({fieldKey:f.fieldKey,sourceKind:f.sourceKind,sourceUrl:f.sourceUrl,verification:f.verification,checkedAt:f.checkedAt,updatedAt:f.updatedAt,actorName:u.name})
   .from(f).innerJoin(p,and(eq(p.id,f.prospectId),eq(p.workspaceId,f.workspaceId))).innerJoin(m,and(eq(m.id,f.updatedByMembershipId),eq(m.workspaceId,f.workspaceId))).innerJoin(u,eq(u.id,m.userId)).where(condition).limit(Object.keys(PROSPECT_FIELDS).length),
  db.select({id:a.id,eventType:a.eventType,occurredAt:a.occurredAt,metadataJson:a.metadataJson,actorName:u.name})
   .from(a).innerJoin(p,and(eq(p.id,a.subjectId),eq(p.workspaceId,a.workspaceId))).leftJoin(m,and(eq(m.id,a.actorMembershipId),eq(m.workspaceId,a.workspaceId))).leftJoin(u,eq(u.id,m.userId))
   .where(and(condition,eq(a.subjectType,'prospect'))).orderBy(desc(a.occurredAt),desc(a.id)).limit(21).offset((activityPage-1)*20),
  db.select({receiptId:schema.prospectImportRows.receiptId,sourceWorkspaceId:schema.prospectImportRows.sourceWorkspaceId,sourceRecordId:schema.prospectImportRows.sourceRecordId,sourceLabel:schema.prospectImportRows.sourceLabel,importedAt:schema.prospectImportReceipts.createdAt})
   .from(schema.prospectImportRows).innerJoin(schema.prospectImportReceipts,and(eq(schema.prospectImportReceipts.id,schema.prospectImportRows.receiptId),eq(schema.prospectImportReceipts.workspaceId,schema.prospectImportRows.workspaceId)))
   .where(and(eq(schema.prospectImportRows.workspaceId,actor.workspaceId),eq(schema.prospectImportRows.prospectId,String(id)),eq(schema.prospectImportReceipts.sealed,1),administratorCondition(actor,{purpose:'prospecting'}))).limit(1),
 ]));
 return {profile,sources,importSource:imports[0]||null,activity:history.slice(0,20).map(({metadataJson,...event})=>{let metadata=null;try{metadata=JSON.parse(metadataJson);}catch{}return {...event,metadata:{fields:Array.isArray(metadata?.fields)?metadata.fields.filter(k=>Object.hasOwn(PROSPECT_FIELDS,k)):[]}};}),activityPage,moreActivity:history.length>20};
}
async function fingerprint(fields){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(Object.fromEntries(Object.keys(PROSPECT_FIELDS).map(k=>[k,fields[k]??(k==='fit'?'unknown':null)])))));return [...new Uint8Array(data)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function createProspect(db,{actor,input,now=new Date()}){
 if(!permitted(actor,'prospecting.manage'))return missing();
 if(!input||Object.keys(input).some(k=>!['workspaceId','requestId','fields'].includes(k))||input.workspaceId!==actor.workspaceId||!REQUEST_ID.test(input.requestId||''))return invalid({form:'Reload the workspace and try again.'});
 const normalized=normalizeProspectFields(input.fields,{creating:true});if(!normalized.ok)return invalid(normalized.errors);
 const fields={fit:'unknown',...normalized.fields},hash=await fingerprint(fields);
 const receipt=()=>db.select({id:p.id,hash:p.creationHash,by:p.createdByMembershipId}).from(p).where(and(prospectCondition(actor),eq(p.creationRequestId,input.requestId))).limit(1);
 const match=row=>row.hash===hash&&row.by===actor.membershipId?{ok:true,prospectId:row.id,unchanged:true}:{ok:false,reason:'conflict'};
 const prior=(await receipt())[0];if(prior)return match(prior);
 const id=crypto.randomUUID(),iso=now.toISOString(),condition=and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}),sql`NOT EXISTS(SELECT 1 FROM bloomops_prospects WHERE workspace_id=${actor.workspaceId} AND creation_request_id=${input.requestId})`);
 const created=and(eq(p.id,id),prospectCondition(actor));
 await db.batch([
  insertSelected(db,p,{id,workspaceId:actor.workspaceId,creationRequestId:input.requestId,creationHash:hash,createdByMembershipId:actor.membershipId,revision:1,...fields,createdAt:iso,updatedAt:iso},w,condition),
  ...Object.keys(normalized.fields).map(fieldKey=>insertSelected(db,f,{workspaceId:actor.workspaceId,prospectId:id,fieldKey,sourceKind:'manual',verification:'unverified',updatedByMembershipId:actor.membershipId,updatedAt:iso},p,created)),
  activityForMutation(db,p,created,{workspaceId:actor.workspaceId,eventType:'PROSPECT_CREATED',subjectType:'prospect',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{source:'manual'},occurredAt:iso}),
 ]);
 const saved=(await receipt())[0];if(!saved)return missing();const result=match(saved);return {...result,...(saved.id===id?{unchanged:false}:{})};
}
export async function updateProspect(db,{actor,id,input,now=new Date()}){
 if(!permitted(actor,'prospecting.manage'))return missing();
 if(!input||Object.keys(input).some(k=>!['workspaceId','expectedRevision','fields','sources'].includes(k))||input.workspaceId!==actor.workspaceId||!Number.isInteger(input.expectedRevision)||input.expectedRevision<1)return invalid({form:'Reload this profile before saving.'});
 const normalized=normalizeProspectFields(input.fields);if(!normalized.ok)return invalid(normalized.errors);
 const sources=input.sources||{};if(typeof sources!=='object'||Array.isArray(sources)||Object.keys(sources).some(k=>!Object.hasOwn(normalized.fields,k)))return invalid({form:'Source details must belong to an edited field.'});
 const condition=and(prospectCondition(actor),eq(p.id,String(id)),eq(p.revision,input.expectedRevision));
 const current=await getProspect(db,actor,id);if(!current)return missing();if(current.profile.revision!==input.expectedRevision)return {ok:false,reason:'conflict'};
 const iso=now.toISOString(),patch={},sourceChanges=[];
 for(const [key,value] of Object.entries(normalized.fields)){
  const old=current.sources.find(s=>s.fieldKey===key),valueChanged=current.profile[key]!==value,meta=sources[key];
  if(meta&&(typeof meta!=='object'||Array.isArray(meta)||Object.keys(meta).some(k=>!['url','checked'].includes(k))||(meta.checked!==undefined&&typeof meta.checked!=='boolean')||(meta.url!==undefined&&meta.url!==null&&typeof meta.url!=='string')))return invalid({[key]:'Enter valid source details.'});
  const sourceUrl=meta?.url?.trim()?safeProspectUrl(meta.url.trim()):meta&&Object.hasOwn(meta,'url')?null:old?.sourceUrl||null;
  if(meta?.url?.trim()&&(!sourceUrl||sourceUrl.length>2048))return invalid({[key]:'Enter a complete http or https source URL.'});
  if(meta?.checked&&(!value||(key==='fit'&&value==='unknown')))return invalid({[key]:'An unknown value cannot be marked checked.'});
  const verification=meta?.checked===true?'checked':valueChanged||sourceUrl!==(old?.sourceUrl||null)||meta?.checked===false?'unverified':old?.verification||'unverified';
  const checkedAt=verification==='checked'?(valueChanged||old?.verification!=='checked'||old?.sourceUrl!==sourceUrl?iso:old.checkedAt):null;
  if(valueChanged)patch[key]=value;
  if(valueChanged||meta&&(old?.sourceUrl!==sourceUrl||old?.verification!==verification||old?.checkedAt!==checkedAt))sourceChanges.push({fieldKey:key,sourceUrl,verification,checkedAt});
 }
 if(!Object.keys(patch).length&&!sourceChanges.length)return {ok:true,unchanged:true,revision:current.profile.revision};
 const changedFields=[...new Set([...Object.keys(patch),...sourceChanges.map(s=>s.fieldKey)])];
 const results=await db.batch([
  activityForMutation(db,p,condition,{workspaceId:actor.workspaceId,eventType:'PROSPECT_UPDATED',subjectType:'prospect',subjectId:String(id),actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{fields:changedFields},occurredAt:iso}),
  ...sourceChanges.map(source=>{const values={workspaceId:actor.workspaceId,prospectId:String(id),sourceKind:'manual',...source,updatedByMembershipId:actor.membershipId,updatedAt:iso};return insertSelected(db,f,values,p,condition).onConflictDoUpdate({target:[f.workspaceId,f.prospectId,f.fieldKey],set:{sourceKind:values.sourceKind,sourceUrl:values.sourceUrl,verification:values.verification,checkedAt:values.checkedAt,updatedByMembershipId:values.updatedByMembershipId,updatedAt:iso}});}),
  db.update(p).set({...patch,revision:sql`${p.revision}+1`,updatedAt:iso}).where(condition).returning({revision:p.revision}),
 ]);
 return results.at(-1)[0]?{ok:true,revision:results.at(-1)[0].revision}:{ok:false,reason:'conflict'};
}
