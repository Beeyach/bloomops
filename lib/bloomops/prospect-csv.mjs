import {and,eq,or,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {importHash} from './prospect-import-values.mjs';
import {parseCsv} from './prospect-csv-values.mjs';
import {evaluate} from './authorization.mjs';
import {activityForMutation} from './activity.mjs';
const p=schema.prospects,b=schema.prospectCsvBatches,r=schema.prospectCsvRows,w=schema.workspaces;
const guard=a=>administratorCondition(a,{purpose:'prospecting'}),allowed=a=>a&&evaluate(a,{action:'prospecting.manage'}).allowed;
const bad=error=>({invalid:true,error});
const stamp=sql`(SELECT count(*)||':'||coalesce(sum(revision),0) FROM bloomops_prospects WHERE workspace_id=${sql.raw('workspaces.id')})`;
const host=v=>{try{return new URL(v).hostname.toLowerCase().replace(/^www\./,'');}catch{return '';}};
export async function previewCsv(db,actor,input){
 if(!allowed(actor))return null;
 if(!input||Object.keys(input).some(k=>!['workspaceId','text','fileName'].includes(k))||input.workspaceId!==actor.workspaceId||typeof input.fileName!=='string'||!input.fileName.trim()||input.fileName.length>180)return bad('Choose a named CSV file in this workspace.');
 let parsed;try{parsed=parseCsv(input.text);}catch(e){return bad(e.message);}
 const fileHash=await importHash(input.text),[authority]=await db.select({stamp}).from(w).where(and(eq(w.id,actor.workspaceId),guard(actor))).limit(1);if(!authority)return null;
 const [prior]=await db.select({id:b.id}).from(b).where(and(eq(b.workspaceId,actor.workspaceId),eq(b.fileHash,fileHash),guard(actor))).limit(1);
 const rows=[];
 for(const row of parsed.rows){const {fields}=row;let matches=[];
  if(!row.errors.length){const websiteHost=host(fields.website);matches=await db.select({id:p.id,businessName:p.businessName,personName:p.personName,website:p.website,publicEmail:p.publicEmail}).from(p).where(and(prospectCondition(actor),or(sql`lower(trim(${p.businessName}))=${fields.businessName.toLowerCase()}`,fields.publicEmail?eq(p.publicEmail,fields.publicEmail):undefined,websiteHost?sql`lower(${p.website}) LIKE ${'%'+websiteHost.replace(/[%_]/g,'')+'%'}`:undefined))).limit(21);matches=matches.filter(m=>m.businessName.trim().toLowerCase()===fields.businessName.toLowerCase()||fields.publicEmail&&m.publicEmail===fields.publicEmail||websiteHost&&host(m.website)===websiteHost);}
  const fileDuplicate=rows.some(x=>!x.errors.length&&(x.fields.businessName.toLowerCase()===fields.businessName?.toLowerCase()||fields.publicEmail&&x.fields.publicEmail===fields.publicEmail||host(fields.website)&&host(x.fields.website)===host(fields.website)));
  rows.push({...row,matches,status:row.errors.length?'invalid':matches.length||fileDuplicate?'duplicate':'ready',fileDuplicate});
 }
 const [fresh]=await db.select({stamp}).from(w).where(and(eq(w.id,actor.workspaceId),guard(actor))).limit(1);if(!fresh)return null;if(fresh.stamp!==authority.stamp)return {conflict:true,error:'Prospects changed during duplicate checks. Preview again.'};
 const previewHash=await importHash({fileHash,stamp:authority.stamp,rows});return {rows,mapping:parsed.mapping,fileHash,stamp:authority.stamp,previewHash,receiptId:prior?.id||null};
}
export async function csvReceipt(db,actor,id){
 if(!allowed(actor))return null;const [batch]=await db.select({id:b.id,fileName:b.fileName,createdAt:b.createdAt}).from(b).where(and(eq(b.id,id),eq(b.workspaceId,actor.workspaceId),guard(actor))).limit(1);if(!batch)return null;
 const rows=await db.select({ordinal:r.ordinal,prospectId:r.prospectId,status:r.status,fieldsJson:r.fieldsJson,reason:r.reason}).from(r).where(and(eq(r.workspaceId,actor.workspaceId),eq(r.batchId,id),guard(actor))).orderBy(r.ordinal).limit(50);return {...batch,rows:rows.map(({fieldsJson,...row})=>({...row,fields:JSON.parse(fieldsJson)}))};
}
export async function commitCsv(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!input||Object.keys(input).some(k=>!['workspaceId','requestId','document','previewHash','selected','separate'].includes(k))||input.workspaceId!==actor.workspaceId||typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId)||!Array.isArray(input.selected)||!input.selected.length||input.selected.length>50||new Set(input.selected).size!==input.selected.length||!Array.isArray(input.separate)||input.separate.some(i=>!input.selected.includes(i)))return bad('Preview and select valid rows first.');
 const hash=await importHash(input),prior=async()=>{const [v]=await db.select({id:b.id,hash:b.requestHash}).from(b).where(and(eq(b.workspaceId,actor.workspaceId),eq(b.requestId,input.requestId),guard(actor))).limit(1);return v?v.hash===hash?{receiptId:v.id,replayed:true}:{conflict:true,error:'This request already recorded a different import.'}:null;};
 const previous=await prior();if(previous)return previous;
 const preview=await previewCsv(db,actor,input.document);if(!preview||preview.invalid||preview.conflict)return preview;if(preview.receiptId)return {receiptId:preview.receiptId,replayed:true};
 if(preview.previewHash!==input.previewHash)return {conflict:true,error:'Duplicate checks changed. Preview this file again.'};
 if(input.selected.some(i=>!Number.isInteger(i)||!preview.rows.some(r=>r.index===i&&r.status!=='invalid'))||preview.rows.some(r=>input.selected.includes(r.index)&&r.status==='duplicate'&&!input.separate.includes(r.index)))return bad('Explicitly confirm a separate contact for every selected possible duplicate.');
 const id=crypto.randomUUID(),iso=now.toISOString(),condition=and(eq(w.id,actor.workspaceId),guard(actor),sql`${stamp}=${preview.stamp}`),own=and(eq(b.id,id),eq(b.workspaceId,actor.workspaceId),guard(actor));
 const writes=[insertSelected(db,b,{id,workspaceId:actor.workspaceId,requestId:input.requestId,requestHash:hash,fileHash:preview.fileHash,fileName:input.document.fileName.trim(),createdByMembershipId:actor.membershipId,createdAt:iso},w,condition)];
 for(const row of preview.rows){const added=input.selected.includes(row.index),pid=added?crypto.randomUUID():null;
  if(added){writes.push(insertSelected(db,p,{id:pid,workspaceId:actor.workspaceId,creationRequestId:crypto.randomUUID(),creationHash:await importHash(row.fields),createdByMembershipId:actor.membershipId,revision:1,fit:'unknown',...row.fields,createdAt:iso,updatedAt:iso},b,own));writes.push(activityForMutation(db,b,own,{workspaceId:actor.workspaceId,eventType:'PROSPECT_CREATED',subjectType:'prospect',subjectId:pid,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{source:'csv',batchId:id},occurredAt:iso}));}
  writes.push(insertSelected(db,r,{workspaceId:actor.workspaceId,batchId:id,ordinal:row.index,prospectId:pid,status:added?'added':row.status==='invalid'?'invalid':'skipped',fieldsJson:JSON.stringify(row.raw),reason:added?row.status==='duplicate'?'Reviewed as a separate contact':null:row.errors.join(' ')||'Not selected'},b,own));
 }
 try{await db.batch(writes);}catch(e){const replay=await prior();if(replay)return replay;if(/UNIQUE constraint/.test(String(e.cause||e)))return {conflict:true,error:'This file was imported concurrently. Preview again to open its receipt.'};throw e;}
 return await prior()||{conflict:true,error:'Prospects changed. Preview again before importing.'};
}
