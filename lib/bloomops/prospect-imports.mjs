import {and,desc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {previewProspectImport} from './prospect-import-preview.mjs';
import {canReadProspectSource,sourceImportGuards} from './prospect-source-preview.mjs';
import {importEnvelope,importProvenance,mapImportFields,importHash,plain,IMPORT_FILE_LIMIT} from './prospect-import-values.mjs';
const r=schema.prospectImportReceipts,t=schema.prospectImportRows,p=schema.prospects,w=schema.workspaces;
const scope=actor=>and(eq(r.workspaceId,actor.workspaceId),eq(r.sealed,1),administratorCondition(actor,{purpose:'prospecting'}));
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.manage'}).allowed;
const receiptColumns={id:r.id,sourceWorkspaceId:r.sourceWorkspaceId,selectedCount:r.selectedCount,importedCount:r.importedCount,duplicateCount:r.duplicateCount,rejectedCount:r.rejectedCount,createdAt:r.createdAt};
export async function listProspectImports(db,actor,page=1){
 if(!allowed(actor)||!Number.isInteger(page)||page<1||page>10000)return null;
 const rows=await db.select(receiptColumns).from(r).where(scope(actor)).orderBy(desc(r.createdAt),desc(r.id)).limit(21).offset((page-1)*20);
 return {rows:rows.slice(0,20),more:rows.length>20,page};
}
export async function getProspectImport(db,actor,id){
 if(!allowed(actor))return null;
 const [receipt]=await db.select(receiptColumns).from(r).where(and(scope(actor),eq(r.id,String(id)))).limit(1);if(!receipt)return null;
 const rows=await db.select({index:t.ordinal,status:t.status,prospectId:t.prospectId,sourceRecordId:t.sourceRecordId,businessName:t.businessName,sourceLabel:t.sourceLabel,reasonsJson:t.reasonsJson}).from(t).innerJoin(r,and(eq(r.id,t.receiptId),eq(r.workspaceId,t.workspaceId))).where(and(scope(actor),eq(r.id,receipt.id))).orderBy(t.ordinal).limit(50);
 if(rows.length!==receipt.selectedCount)return null;
 return {...receipt,rows:rows.map(({reasonsJson,...row})=>({...row,reasons:JSON.parse(reasonsJson)}))};
}
export async function commitProspectImport(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 if(!plain(input)||Object.keys(input).length!==5||input.workspaceId!==actor.workspaceId||typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId||'')||!importEnvelope(input.document)
  ||!Array.isArray(input.selected)||!input.selected.length||input.selected.length>50||input.selected.some(n=>!Number.isInteger(n)||n<1||n>input.document.records.length)||new Set(input.selected).size!==input.selected.length
  ||new TextEncoder().encode(JSON.stringify(input.document)).byteLength>IMPORT_FILE_LIMIT
  ||typeof input.previewHash!=='string'||!/^[0-9a-f]{64}$/.test(input.previewHash))return {invalid:true,error:'Preview the export again before importing.'};
 const sources=[...new Set(input.document.records.map(importProvenance).filter(Boolean).map(p=>p.sourceWorkspaceId))];
 if(sources.length!==1)return {invalid:true,error:'Use one source workspace.'};
 const source=sources[0];if(!await canReadProspectSource(db,actor,source))return null;
 const selected=[...input.selected].sort((a,b)=>a-b),hash=await importHash({document:input.document,selected,previewHash:input.previewHash});
 const prior=()=>db.select({id:r.id,hash:r.requestHash,by:r.createdByMembershipId}).from(r).where(and(scope(actor),eq(r.requestId,input.requestId))).limit(1);
 const response=row=>row.hash===hash&&row.by===actor.membershipId?{receiptId:row.id,unchanged:true}:{conflict:true,error:'This request was already used for another import. Preview the file again.'};
 const previous=(await prior())[0];if(previous)return response(previous);
 const preview=await previewProspectImport(db,actor,input.document,now);if(!preview||preview.invalid||preview.unavailable)return preview;
 const ready=preview.rows.filter(row=>row.status==='ready');
 if(preview.previewHash!==input.previewHash||JSON.stringify(ready.map(row=>row.index))!==JSON.stringify(selected))return {conflict:true,error:'Records changed since preview. Review the refreshed results before importing.',preview};
 const guards=await sourceImportGuards(db,actor,{source,ids:ready.map(row=>row.provenance.sourceRecordId)});if(!guards||guards.unavailable)return guards;
 for(const row of ready){const current=guards.find(g=>g.id===row.provenance.sourceRecordId),mapped=current&&mapImportFields({provenance:row.provenance,fields:current.fields});
  if(current?.status!=='ready'||!mapped?.ok||JSON.stringify(mapped.fields)!==JSON.stringify(row.fields)||mapped.sourceLabel!==row.sourceLabel)return {conflict:true,error:'Source records changed. Preview the export again.'};}
 const id=crypto.randomUUID(),iso=now.toISOString(),own=and(eq(r.id,id),eq(r.workspaceId,actor.workspaceId),eq(r.sealed,0));
 const statements=[insertSelected(db,r,{id,workspaceId:actor.workspaceId,sourceWorkspaceId:source,requestId:input.requestId,requestHash:hash,createdByMembershipId:actor.membershipId,
  selectedCount:preview.counts.selected,importedCount:ready.length,duplicateCount:preview.counts.duplicate,rejectedCount:preview.counts.rejected,sealed:0,createdAt:iso},w,
  and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}),sql`NOT EXISTS(SELECT 1 FROM prospect_import_receipts WHERE workspace_id=${actor.workspaceId} AND request_id=${input.requestId})`))];
 for(const row of preview.rows){
  const values={workspaceId:actor.workspaceId,receiptId:id,sourceWorkspaceId:source,ordinal:row.index,status:row.status==='ready'?'imported':row.status,prospectId:null,sourceRecordId:row.provenance?.sourceRecordId??null,businessName:row.businessName,sourceLabel:row.sourceLabel??null,fieldsJson:null,reasonsJson:JSON.stringify([...row.reasons,...row.errors])};
  if(row.status!=='ready'){statements.push(insertSelected(db,t,values,r,own));continue;}
  const profileId=crypto.randomUUID(),g=guards.find(g=>g.id===row.provenance.sourceRecordId),f=row.fields;
  const unique=sql`NOT EXISTS(SELECT 1 FROM prospect_import_rows WHERE workspace_id=${actor.workspaceId} AND source_workspace_id=${source} AND source_record_id=${row.provenance.sourceRecordId} AND status='imported')
   AND NOT EXISTS(SELECT 1 FROM bloomops_prospects WHERE workspace_id=${actor.workspaceId} AND (lower(trim(business_name))=lower(${f.businessName}) OR (${f.publicEmail??''}<>'' AND lower(trim(public_email))=lower(${f.publicEmail??''})) OR (${f.website??''}<>'' AND lower(trim(website))=lower(${f.website??''}))))`;
  const condition=and(own,administratorCondition(actor,{purpose:'prospecting'}),g.condition,unique),created=and(eq(p.id,profileId),eq(p.workspaceId,actor.workspaceId));
  statements.push(insertSelected(db,p,{id:profileId,workspaceId:actor.workspaceId,creationRequestId:crypto.randomUUID(),creationHash:await importHash(f),createdByMembershipId:actor.membershipId,revision:1,fit:'unknown',...f,createdAt:iso,updatedAt:iso},r,condition),
   insertSelected(db,t,{...values,prospectId:profileId,fieldsJson:JSON.stringify(f)},p,created),
   activityForMutation(db,p,created,{workspaceId:actor.workspaceId,eventType:'PROSPECT_CREATED',subjectType:'prospect',subjectId:profileId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,metadata:{source:'raw_import',receiptId:id},occurredAt:iso}));
 }
 statements.push(db.update(r).set({sealed:1}).where(own));
 try{await db.batch(statements);}catch{
  if(!await canReadProspectSource(db,actor,source))return null;
  const saved=(await prior())[0];if(saved)return response(saved);
  const fresh=await previewProspectImport(db,actor,input.document,now);if(!fresh||fresh.unavailable)return fresh;
  return fresh.previewHash!==preview.previewHash?{conflict:true,error:'Records changed during import. Nothing was imported. Review the refreshed results.',preview:fresh}:{unavailable:true,error:'The import could not be completed. Nothing was imported. Retry this request.'};
 }
 if(!await canReadProspectSource(db,actor,source))return null;
 const saved=(await prior())[0];return saved?{...response(saved),...(saved.id===id?{unchanged:false}:{})}:null;
}
