import {normalizeProspectFields,safeProspectUrl} from './prospect-values.mjs';
import {chosenProfileSources} from './profile-drafts.mjs';
// Compare the intended canonical values before retrying a possibly committed
// request. A different revision never silently becomes a new write baseline.
export function profileRetryPlan(draft,current){
 const normalized=normalizeProspectFields(draft.fields);if(!normalized.ok)return {state:'invalid',errors:normalized.errors};
 const sources=chosenProfileSources(draft),fields=normalized.fields;
 for(const [key,source] of Object.entries(sources)){
  if(source.url?.trim()&&!safeProspectUrl(source.url.trim()))return {state:'invalid',errors:{[key]:'Enter a complete http or https source URL.'}};
  if(source.checked&&(!fields[key]||fields[key]==='unknown'&&key==='fit'))return {state:'invalid',errors:{[key]:'An unknown value cannot be marked checked.'}};
 }
 const valuesMatch=Object.entries(fields).every(([key,value])=>current.profile[key]===value);
 const sourcesMatch=Object.entries(fields).every(([key,value])=>{
  const meta=sources[key],original=draft.sourceBefore[key];
  if(!meta&&value===draft.before[key])return true;
  const currentSource=current.sources.find(s=>s.fieldKey===key),url=meta?meta.url?.trim()?safeProspectUrl(meta.url.trim()):null:original?.url||null;
  const verification=meta?.checked?'checked':'unverified';
  return (currentSource?.sourceUrl||null)===url&&(currentSource?.verification||'unverified')===verification;
 });
 if(valuesMatch&&sourcesMatch&&current.profile.revision>=draft.revision)return {state:'saved'};
 return current.profile.revision===draft.revision?{state:'ready',input:{expectedRevision:draft.revision,fields,sources}}:{state:'conflict'};
}
