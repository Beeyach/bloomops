import {CLIENT_EDIT_DRAFT_PREFIX,DRAFT_CONTEXT_KEY} from './draft-context.mjs';
import {CLIENT_DETAIL_FIELDS,validClientSnapshot} from './client-edit-values.mjs';
export const CLIENT_EDIT_TTL=7*24*60*60*1000;
const bytes=256*1024,uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const fields=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===CLIENT_DETAIL_FIELDS.length&&CLIENT_DETAIL_FIELDS.every(k=>typeof v[k]==='string'&&v[k].length<=4096);
export function createClientEditStore(storage,scope,writerId,clock=Date.now){
 const prefix=CLIENT_EDIT_DRAFT_PREFIX+JSON.stringify([scope.userId,scope.workspaceId])+':',clientPrefix=prefix+JSON.stringify(scope.clientId)+':',own=clientPrefix+writerId,epoch=storage.getItem(DRAFT_CONTEXT_KEY);let disposed=false;
 const valid=()=>!disposed&&storage.getItem(DRAFT_CONTEXT_KEY)===epoch;
 function parse(key){
  const raw=storage.getItem(key);if(!raw||new TextEncoder().encode(raw).length>bytes)return null;
  try{const v=JSON.parse(raw);if(v.version!==1||!uuid(v.writerId)||key!==clientPrefix+v.writerId||v.userId!==scope.userId||v.workspaceId!==scope.workspaceId||v.clientId!==scope.clientId||!Number.isSafeInteger(v.at)||v.at>clock()+60000||clock()-v.at>CLIENT_EDIT_TTL||!validClientSnapshot(v.expected)||!fields(v.fields)||!(v.pending===null||fields(v.pending)))return null;return {raw,value:{...scope,version:1,writerId:v.writerId,at:v.at,expected:v.expected,fields:v.fields,pending:v.pending}};}catch{return null;}
 }
 function remove(key,raw){if(!valid()||!key.startsWith(clientPrefix)||raw!==undefined&&storage.getItem(key)!==raw)return false;storage.removeItem(key);return true;}
 function purge(){for(const key of Object.keys(storage).filter(k=>k.startsWith(prefix))){try{const raw=storage.getItem(key),v=JSON.parse(raw);if(Number.isSafeInteger(v.at)&&clock()-v.at>CLIENT_EDIT_TTL&&storage.getItem(key)===raw)storage.removeItem(key);}catch{}}}
 function list(){if(!valid())return [];purge();return Object.keys(storage).filter(k=>k.startsWith(clientPrefix)).map(key=>({key,copy:parse(key)})).filter(v=>v.copy).map(v=>({key:v.key,...v.copy})).sort((a,b)=>b.value.at-a.value.at);}
 return {own,valid,list,snapshot:key=>valid()&&key.startsWith(clientPrefix)?parse(key):null,remove,
  write(state){
   if(!valid())return false;if(!state){storage.removeItem(own);return true;}
   if(!fields(state.fields)||!validClientSnapshot(state.expected)||!(state.pending===null||fields(state.pending)))throw Error('This recovery copy could not be kept. Keep this tab open.');
   purge();if(!storage.getItem(own)&&Object.keys(storage).filter(k=>k.startsWith(prefix)).length>=10)throw Error('Ten Client edit copies are already kept in this workspace. Discard an old copy first.');
   const raw=JSON.stringify({...scope,version:1,writerId,at:clock(),expected:state.expected,fields:state.fields,pending:state.pending});
   if(new TextEncoder().encode(raw).length>bytes)throw Error('This recovery copy is too large. Keep this tab open.');
   storage.setItem(own,raw);return true;
  },
  clearClient(){if(valid())for(const key of Object.keys(storage))if(key.startsWith(clientPrefix))storage.removeItem(key);},
  dispose(){disposed=true;},
 };
}
