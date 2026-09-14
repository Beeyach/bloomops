import {normalizeProspectFields,safeProspectUrl} from './prospect-values.mjs';
import {faviconHost} from '../favicon.mjs';
export const IMPORT_FILE_LIMIT=1048576;
export const IMPORT_COMMIT_LIMIT=IMPORT_FILE_LIMIT+4096;
export const IMPORT_FIELDS={businessName:'Business name',personName:'Person',website:'Website',publicEmail:'Public email',niche:'Niche',country:'Country',source:'Source label'};
export const IMPORT_MAPPING={businessName:'Business name',personName:'Person',website:'Website',publicEmail:'Public contact email',niche:'Niche',country:'Location',source:'Provenance only'};
export const IMPORT_STATUS={ready:'Ready',duplicate:'Possible duplicate',rejected:'Rejected'};
export const IMPORT_REASONS={invalid:'Use the seven raw identity fields from a Bloomsi export.',provenance:'A valid source workspace and record ID are required.',source_missing:'Source record is unavailable.',source_work:'The source record is no longer eligible. Review source history.',changed:'File fields differ from the current source. Download a fresh export.',file_duplicate:'Another record in this file has the same source ID, email, business name or website.',destination_email:'This workspace already has a record with this email.',destination_name:'This workspace already has a record with this business name.',source_imported:'This source record was already imported into this workspace.',destination_website:'This workspace already has a record with this website.'};
export const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
export function importEnvelope(value){
 if(!exact(value,['format','version','exportedAt','counts','records'])||value.format!=='bloomops.raw-prospects'||value.version!==1||typeof value.exportedAt!=='string'||value.exportedAt.length>40||!Number.isFinite(Date.parse(value.exportedAt)))return false;
 if(!exact(value.counts,['selected','eligible','blocked','exported'])||Object.values(value.counts).some(n=>!Number.isInteger(n)||n<0||n>50))return false;
 return Array.isArray(value.records)&&value.records.length>0&&value.records.length<=50;
}
export function importProvenance(row){
 const p=row?.provenance;
 return exact(p,['sourceWorkspaceId','sourceRecordId'])&&typeof p.sourceWorkspaceId==='string'&&p.sourceWorkspaceId.trim()&&p.sourceWorkspaceId.length<=128&&Number.isSafeInteger(p.sourceRecordId)&&p.sourceRecordId>0?p:null;
}
export function mapImportFields(row){
 if(!exact(row,['provenance','fields'])||!exact(row.fields,Object.keys(IMPORT_FIELDS)))return {ok:false,errors:[IMPORT_REASONS.invalid]};
 const raw=row.fields;
 if(Object.values(raw).some(v=>v!==null&&typeof v!=='string'))return {ok:false,errors:['Raw fields must be text or unknown.']};
 const domain=raw.website?.trim(),website=domain?(/^[a-z][a-z0-9+.-]*:/i.test(domain)?domain:'https://'+domain):null;
 const result=normalizeProspectFields({businessName:raw.businessName,personName:raw.personName,website,publicEmail:raw.publicEmail,niche:raw.niche,location:raw.country},{creating:true});
 const errors=result.ok?[]:Object.values(result.errors);
 if(domain&&(!safeProspectUrl(website)||!faviconHost(website)))errors.push('Enter a valid public website.');
 if(raw.source&&(raw.source.length>180||/[\u0000-\u001f\u007f]/.test(raw.source)))errors.push('Use a readable source label of at most 180 characters.');
 return errors.length?{ok:false,errors}:{ok:true,fields:result.fields,sourceLabel:raw.source?.trim()||null};
}
export const identityKey=value=>value?.trim().toLowerCase()||'';

export async function importHash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export const previewIdentity=result=>({source:result.sourceWorkspaceId,rows:result.rows});
