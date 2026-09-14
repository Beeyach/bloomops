import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition} from './workspaces.mjs';
import {reviewProspectSourceSelection,canReadProspectSource} from './prospect-source-preview.mjs';
import {importEnvelope,importProvenance,mapImportFields,identityKey,importHash,previewIdentity} from './prospect-import-values.mjs';
const destinationAllowed=async(db,actor)=>!!(await db.select({id:schema.workspaces.id}).from(schema.workspaces).where(and(eq(schema.workspaces.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}))).limit(1)).length;
export async function previewProspectImport(db,actor,input,now=new Date()){
 if(!actor||!evaluate(actor,{action:'prospecting.view'}).allowed||!await destinationAllowed(db,actor))return null;
 if(!importEnvelope(input))return {invalid:true,error:'Choose a version 1 Bloomsi raw export with 1–50 records.'};
 const rows=input.records.map((record,index)=>{
  const provenance=importProvenance(record),mapped=mapImportFields(record);
  return {index:index+1,businessName:typeof record?.fields?.businessName==='string'?record.fields.businessName.slice(0,180):null,provenance,mapped,reasons:!provenance?['provenance']:!mapped.ok?['invalid']:[],errors:mapped.errors||[]};
 });
 const sourceIds=[...new Set(rows.filter(row=>row.provenance).map(row=>row.provenance.sourceWorkspaceId))];
 if(sourceIds.length>1)return {invalid:true,error:'Use an export from one source workspace.'};
 const source=sourceIds[0],ids=[...new Set(rows.filter(row=>row.provenance).map(row=>row.provenance.sourceRecordId))];
 const current=source?await reviewProspectSourceSelection(db,actor,{source,ids}):null;
 if(source&&current===null)return null;if(current?.unavailable)return {unavailable:true};
 const priorImports=source?await db.select({id:schema.prospectImportRows.sourceRecordId}).from(schema.prospectImportRows).where(and(eq(schema.prospectImportRows.workspaceId,actor.workspaceId),eq(schema.prospectImportRows.sourceWorkspaceId,source),eq(schema.prospectImportRows.status,'imported'),sql`${schema.prospectImportRows.sourceRecordId} IN (${sql.join(ids.map(id=>sql`${id}`),sql`,`)})`,administratorCondition(actor,{purpose:'prospecting'}))).limit(50):[];
 const importedIds=new Set(priorImports.map(row=>row.id));
 const originals=new Map(current?.rows.map(row=>[row.id,row])||[]);
 for(const row of rows){
  if(row.reasons.length)continue;
  if(importedIds.has(row.provenance.sourceRecordId))row.reasons.push('source_imported');
  const original=originals.get(row.provenance.sourceRecordId);
  if(!original){row.reasons.push('source_missing');continue;}
  if(original.status!=='ready'){row.reasons.push('source_work');continue;}
  const originalFields=mapImportFields({provenance:row.provenance,fields:original.fields});
  if(!originalFields.ok||JSON.stringify(originalFields.fields)!==JSON.stringify(row.mapped.fields)||originalFields.sourceLabel!==row.mapped.sourceLabel)row.reasons.push('changed');
 }
 // All matches are possible duplicates, never an implicit merge/overwrite.
 const groups=new Map();
 for(const row of rows){
  const keys=row.provenance?['source:'+row.provenance.sourceRecordId]:[];
  if(row.mapped.ok){const f=row.mapped.fields;keys.push('name:'+identityKey(f.businessName),...(f.publicEmail?['email:'+identityKey(f.publicEmail)]:[]),...(f.website?['website:'+identityKey(f.website)]:[]));}
  for(const key of keys){if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 }
 const duplicates=new Set([...groups.values()].filter(group=>group.length>1).flat().map(row=>row.index));
 const candidates=rows.filter(row=>row.reasons.length===0);
 try{
  // VALUES avoids D1's compound-SELECT limit; eight rows also stay below
  // the parameter ceiling. Return
  // booleans only; never materialize another workspace's profile inventory.
  for(let i=0;i<candidates.length;i+=8){
   const chunk=candidates.slice(i,i+8),values=sql.join(chunk.map(row=>sql`(${row.index},${identityKey(row.mapped.fields.publicEmail)},${row.mapped.fields.businessName.trim()},${identityKey(row.mapped.fields.website)})`),sql`,`);
   const match=column=>sql`EXISTS(SELECT 1 FROM bloomops_prospects p WHERE p.workspace_id=${actor.workspaceId} AND length(c.${sql.identifier(column)})>0 AND lower(trim(p.${sql.identifier({email:'public_email',name:'business_name',website:'website'}[column])}))=lower(c.${sql.identifier(column)}))`;
   const matches=await db.all(sql`WITH c(ordinal,email,name,website) AS (VALUES ${values}) SELECT c.ordinal,${match('email')} AS email,${match('name')} AS name,${match('website')} AS website FROM c WHERE ${administratorCondition(actor,{purpose:'prospecting'})}`);
   const ordinals=new Set(matches.map(match=>match.ordinal));
   if(matches.length!==chunk.length||ordinals.size!==chunk.length||chunk.some(row=>!ordinals.has(row.index)))throw new Error('Incomplete duplicate evaluation');
   for(const match of matches){const row=chunk.find(row=>row.index===match.ordinal);for(const key of ['email','name','website'])if(match[key])row.reasons.push('destination_'+key);}
  }
 }catch{return await destinationAllowed(db,actor)&&(!source||await canReadProspectSource(db,actor,source))?{unavailable:true}:null;}
 if(!await destinationAllowed(db,actor)||source&&!await canReadProspectSource(db,actor,source))return null;
 const result=rows.map(row=>{
  if(duplicates.has(row.index))row.reasons.push('file_duplicate');
  const status=row.reasons.some(reason=>!reason.startsWith('destination_')&&reason!=='file_duplicate'&&reason!=='source_imported')?'rejected':row.reasons.length?'duplicate':'ready';
  return {index:row.index,businessName:row.businessName,provenance:row.provenance,status,reasons:row.reasons,errors:row.errors,...(row.mapped.ok?{fields:row.mapped.fields,sourceLabel:row.mapped.sourceLabel}:{})};
 });
 const counts={selected:result.length,ready:0,duplicate:0,rejected:0,imported:0};for(const row of result)counts[row.status]++;
 const preview={asOf:now.toISOString(),sourceWorkspaceId:source||null,rows:result,counts};
 return {...preview,previewHash:await importHash(previewIdentity(preview))};
}
