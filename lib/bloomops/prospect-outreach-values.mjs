import {normalizeProspectFields} from './prospect-values.mjs';
export const OUTREACH_FIELDS={recipient:{label:'Recipient email',max:254,type:'email'},timeZone:{label:'Recipient timezone',max:100},subject:{label:'Subject',max:250},intro:{label:'Introduction',max:12000},followUp2:{label:'First follow-up',max:4000},followUp3:{label:'Second follow-up',max:4000}};
export const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const exact=(v,keys)=>plain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function normalizeSender(input){
 if(!exact(input,['provider','email','displayName'])||input.provider!=='google_workspace')return {invalid:true,error:'Choose Google Workspace and enter the sender identity.'};
 const email=normalizeProspectFields({publicEmail:input.email});
 if(!email.ok||!email.fields.publicEmail)return {invalid:true,error:'Enter a valid sender email address.'};
 if(input.displayName!==null&&typeof input.displayName!=='string')return {invalid:true,error:'Enter a sender name or leave it blank.'};
 const name=input.displayName?.trim()||null;if(name&&(name.length>120||/[\u0000-\u001f\u007f]/.test(name)))return {invalid:true,error:'Use a readable sender name of at most 120 characters.'};
 return {fields:{provider:'google_workspace',email:email.fields.publicEmail,displayName:name}};
}
export function normalizeOutreach(input){
 if(!exact(input,Object.keys(OUTREACH_FIELDS)))return {invalid:true,error:'Use the labelled outreach fields.'};
 const fields={};
 for(const [key,spec] of Object.entries(OUTREACH_FIELDS)){
  const raw=input[key];if(raw!==null&&typeof raw!=='string')return {invalid:true,error:spec.label+' must be text.'};const value=raw?.trim()||null;
  if(value&&(value.length>spec.max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)||(key==='subject'&&/[\r\n]/.test(value))))return {invalid:true,error:'Check the length and format of '+spec.label.toLowerCase()+'.'};
  fields[key]=value;
 }
 const normalized=normalizeProspectFields({publicEmail:fields.recipient,timeZone:fields.timeZone});if(!normalized.ok)return {invalid:true,error:Object.values(normalized.errors)[0]};
 fields.recipient=normalized.fields.publicEmail;fields.timeZone=normalized.fields.timeZone;return {fields};
}
export function outreachBlockers({profile,sender,draft,recipientChecked}){
 const reasons=[];
 if(!sender)reasons.push('Set up the sender identity.');
 if(!draft){reasons.push('Save an outreach draft.');return reasons;}
 if(Object.keys(OUTREACH_FIELDS).some(k=>!draft[k]))reasons.push('Complete the recipient, timezone and all three messages.');
 if(draft.profileRevision!==profile.revision)reasons.push('Review the latest profile and save the draft again.');
 if(profile.fit!=='strong')reasons.push('Confirm a Strong fit assessment in the profile.');
 if(!recipientChecked||!profile.publicEmail||draft.recipient!==profile.publicEmail)reasons.push('Check this recipient against its source in the profile.');
 if(!profile.observedFacts||!profile.evidenceDate||!profile.evidenceTarget||!profile.proposedWork)reasons.push('Record dated evidence and proposed work in the profile.');
 return reasons;
}
