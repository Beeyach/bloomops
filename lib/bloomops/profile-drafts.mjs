import {PROSPECT_FIELDS} from './prospect-values.mjs';
import {DRAFT_CONTEXT_KEY,PROFILE_DRAFT_PREFIX} from './draft-context.mjs';
export const PROFILE_DRAFT_TTL=7*24*60*60*1000,PROFILE_DRAFT_BYTES=256*1024,PROFILE_DRAFT_COPIES=10;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const bounded=(v,max)=>v===null||typeof v==='string'&&v.length<=max;
export const profileDraftScope=scope=>PROFILE_DRAFT_PREFIX+JSON.stringify([scope.userId,scope.workspaceId,scope.prospectId])+':';
export function profileDraftValue(value,scope,now=Date.now()){
 if(!object(value)||value.version!==1||!id(value.id)||value.userId!==scope.userId||value.workspaceId!==scope.workspaceId||value.prospectId!==scope.prospectId||!['identity','assessment','evidence','draft'].includes(value.section)||!Number.isSafeInteger(value.revision)||value.revision<1||!Number.isSafeInteger(value.updatedAt)||value.updatedAt>now+60000||now-value.updatedAt>PROFILE_DRAFT_TTL)return null;
 const keys=Object.keys(PROSPECT_FIELDS).filter(k=>PROSPECT_FIELDS[k].section===value.section),fields={},before={},sources={},sourceBefore={};
 for(const name of ['fields','before','sources','sourceBefore'])if(!object(value[name])||Object.keys(value[name]).some(k=>!keys.includes(k)))return null;
 for(const key of keys){
  const max=PROSPECT_FIELDS[key].max||20;
  if(!Object.hasOwn(value.fields,key)||!Object.hasOwn(value.before,key)||!bounded(value.fields[key],max)||!bounded(value.before[key],max))return null;
  fields[key]=value.fields[key];before[key]=value.before[key];
  const source=value.sources[key];
  if(source!==undefined){if(!object(source)||Object.keys(source).some(k=>!['url','checked','touched'].includes(k))||!bounded(source.url??'',2048)||typeof source.checked!=='boolean'||typeof source.touched!=='boolean')return null;sources[key]={url:source.url??'',checked:source.checked,touched:source.touched};}
  const original=value.sourceBefore[key];
  if(original!==undefined){if(!object(original)||Object.keys(original).some(k=>!['url','verification','checkedAt','updatedAt'].includes(k))||!bounded(original.url,2048)||!['checked','unverified'].includes(original.verification)||!bounded(original.checkedAt,64)||!bounded(original.updatedAt,64))return null;sourceBefore[key]={url:original.url,verification:original.verification,checkedAt:original.checkedAt,updatedAt:original.updatedAt};}
 }
 return {version:1,id:value.id,...scope,section:value.section,revision:value.revision,updatedAt:value.updatedAt,fields,before,sources,sourceBefore};
}
export function chosenProfileSources(draft){return Object.fromEntries(Object.entries(draft.sources).filter(([key,s])=>s.touched||s.checked||s.url!==(draft.sourceBefore[key]?.url||'')).map(([key,s])=>[key,{url:s.url,checked:s.checked}]));}
export function profileDraftDirty(draft){return Object.keys(draft.fields).some(k=>(draft.fields[k]??'')!==(draft.before[k]??''))||Object.keys(chosenProfileSources(draft)).length>0;}
export function createProfileDraftStore(storage,scope,writerId,now=()=>Date.now()){
 const prefix=profileDraftScope(scope),own=prefix+writerId,epoch=storage.getItem(DRAFT_CONTEXT_KEY);let disposed=false;
 const valid=()=>!disposed&&storage.getItem(DRAFT_CONTEXT_KEY)===epoch;
 function snapshot(key){const raw=storage.getItem(key);if(!raw||new TextEncoder().encode(raw).length>PROFILE_DRAFT_BYTES)return null;try{const value=profileDraftValue(JSON.parse(raw),scope,now());return value&&key===prefix+value.id?{value,raw}:null;}catch{return null;}}
 function remove(key,expected){if(!valid()||!key.startsWith(prefix)||expected!==undefined&&storage.getItem(key)!==expected)return false;storage.removeItem(key);return true;}
 function purge(){for(const key of Object.keys(storage).filter(k=>k.startsWith(prefix))){try{const raw=storage.getItem(key),value=JSON.parse(raw);if(Number.isSafeInteger(value.updatedAt)&&now()-value.updatedAt>PROFILE_DRAFT_TTL)remove(key,raw);}catch{}}}
 function list(){if(!valid())return [];purge();return Object.keys(storage).filter(k=>k.startsWith(prefix)).map(key=>({key,value:snapshot(key)?.value})).filter(x=>x.value).sort((a,b)=>b.value.updatedAt-a.value.updatedAt);}
 return {own,valid,list,snapshot:key=>valid()&&key.startsWith(prefix)?snapshot(key):null,remove,
  write(input){
   if(!valid())return false;
   if(!input){storage.removeItem(own);return true;}
   const value=profileDraftValue({...input,...scope,version:1,id:writerId,updatedAt:now()},scope,now());if(!value)throw Error('This recovery copy could not be kept. Keep this tab open until saved.');
   if(!profileDraftDirty(value)){storage.removeItem(own);return true;}
   purge();if(!storage.getItem(own)&&list().length>=PROFILE_DRAFT_COPIES)throw Error('Ten recovery copies are already kept for this prospect. Discard an old copy before keeping another.');
   const raw=JSON.stringify(value);if(new TextEncoder().encode(raw).length>PROFILE_DRAFT_BYTES)throw Error('This recovery copy is too large for browser storage. Keep this tab open until saved.');storage.setItem(own,raw);return true;
  },
  clearScope(){if(valid())for(const key of Object.keys(storage))if(key.startsWith(prefix))storage.removeItem(key);},
  dispose(){disposed=true;},
 };
}
