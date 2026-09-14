import {faviconHost} from '../favicon.mjs';
import {normalizeProspectFields,safeProspectUrl} from './prospect-values.mjs';
export const ELIGIBILITY={ready:'No recorded work',worked:'Already worked',review:'Needs review'};
export const REASONS={
 deleted:'Source record is deleted.',contact:'Contact, reply, stop or client history is recorded.',work:'Audit, qualification, draft or other work is recorded.',
 duplicate:'Another source record uses this email, including deleted records.',unmatched:'A mailbox reply may match this email but is not resolved to this record.',
 unclear:'Notes, activity or tracking values need a person to review them.',stage:'The source stage or state does not establish an untouched record.',changed:'The record changed after creation without clear activity history.',fields:'Raw identity fields need correction before a later export.',
};
export function rawProspectFields(row){
 const domain=typeof row.domain==='string'?row.domain.trim():'';
 const website=domain?(/^[a-z][a-z0-9+.-]*:/i.test(domain)?domain:'https://'+domain):null;
 return {businessName:row.business_name||null,personName:row.name||null,website:website?safeProspectUrl(website):null,publicEmail:row.email||null,niche:row.niche||null};
}
export function classifyProspectEligibility(row){
 const reasons=[];
 if(row.deleted)reasons.push('deleted');if(row.contact)reasons.push('contact');if(row.work)reasons.push('work');
 if(row.duplicate)reasons.push('duplicate');if(row.unmatched)reasons.push('unmatched');if(row.unclear)reasons.push('unclear');
 if(String(row.stage??'').trim().toLowerCase()!=='new'||row.state)reasons.push('stage');
 if(row.changed)reasons.push('changed');
 const fields=rawProspectFields(row),valid=normalizeProspectFields(fields,{creating:true});
 if(row.raw_invalid||!valid.ok||(row.domain&&(!fields.website||!faviconHost(fields.website)))||(row.country&&String(row.country).length>180)||(row.source&&String(row.source).length>180))reasons.push('fields');
 return {status:reasons.some(r=>['deleted','contact','work'].includes(r))?'worked':reasons.length?'review':'ready',reasons};
}
