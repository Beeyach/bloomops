import {SHEET_EDITABLE,sheetQuery} from './prospect-sheet-values.mjs';
import {PROSPECT_FIELDS} from './prospect-values.mjs';
import {SHEET_DRAFT_PREFIX,DRAFT_CONTEXT_KEY} from './draft-context.mjs';
export const DRAFT_TTL=7*24*60*60*1000,DRAFT_BYTES=256*1024,DRAFT_FIELDS=200,DRAFT_COPIES=10;
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
const text=(key,value)=>value===null||typeof value==='string'&&value.length<=(PROSPECT_FIELDS[key]?.max||20);
export function draftScope(userId,workspaceId){return SHEET_DRAFT_PREFIX+JSON.stringify([userId,workspaceId])+':';}
export function sheetDraftValue(value,scope,now=Date.now()){
 if(!value||value.version!==1||value.userId!==scope.userId||value.workspaceId!==scope.workspaceId||!id(value.id)||!Number.isSafeInteger(value.updatedAt)||value.updatedAt>now+60000||now-value.updatedAt>DRAFT_TTL||!sheetQuery(value.query)||!Array.isArray(value.fields)||!value.fields.length||value.fields.length>DRAFT_FIELDS)return null;
 const seen=new Set(),fields=[];
 for(const f of value.fields){if(!f||!id(f.id)||!SHEET_EDITABLE.includes(f.key)||!text(f.key,f.before)||!text(f.key,f.value)||seen.has(f.id+':'+f.key))return null;seen.add(f.id+':'+f.key);fields.push({id:f.id,key:f.key,before:f.before,value:f.value});}
 return {version:1,id:value.id,userId:scope.userId,workspaceId:scope.workspaceId,updatedAt:value.updatedAt,query:sheetQuery(value.query),fields};
}
export function createSheetDraftStore(storage,scope,writerId,now=()=>Date.now()){
 const prefix=draftScope(scope.userId,scope.workspaceId),own=prefix+writerId,epoch=storage.getItem(DRAFT_CONTEXT_KEY);let disposed=false;
 const valid=()=>!disposed&&storage.getItem(DRAFT_CONTEXT_KEY)===epoch;
 function snapshot(key){const raw=storage.getItem(key);if(!raw||new TextEncoder().encode(raw).length>DRAFT_BYTES)return null;try{const value=sheetDraftValue(JSON.parse(raw),scope,now());return value&&key===prefix+value.id?{value,raw}:null;}catch{return null;}}
 function purgeExpired(){for(const key of Object.keys(storage).filter(k=>k.startsWith(prefix))){try{const raw=storage.getItem(key),old=JSON.parse(raw);if(Number.isSafeInteger(old.updatedAt)&&now()-old.updatedAt>DRAFT_TTL)remove(key,raw);}catch{}}}
 function list(){if(!valid())return [];purgeExpired();return Object.keys(storage).filter(k=>k.startsWith(prefix)).map(k=>({key:k,value:snapshot(k)?.value})).filter(x=>x.value).sort((a,b)=>b.value.updatedAt-a.value.updatedAt);}
 function remove(key,expected){if(!valid()||!key.startsWith(prefix)||expected!==undefined&&storage.getItem(key)!==expected)return false;storage.removeItem(key);return true;}
 return {valid,list,
  read(key){return valid()&&key.startsWith(prefix)?snapshot(key)?.value||null:null;},
  snapshot(key){return valid()&&key.startsWith(prefix)?snapshot(key):null;},
  write(input){
   if(!valid())return false;
   if(!input?.fields?.length){storage.removeItem(own);return true;}
   const value=sheetDraftValue({...input,...scope,version:1,id:writerId,updatedAt:now()},scope,now());if(!value)throw Error('This draft is too large to keep in this browser.');
   purgeExpired();
   if(!storage.getItem(own)&&list().length>=DRAFT_COPIES)throw Error('Ten recovery copies are already kept. Discard an old copy before keeping another.');
   const raw=JSON.stringify(value);if(new TextEncoder().encode(raw).length>DRAFT_BYTES)throw Error('This draft is too large to keep in this browser.');storage.setItem(own,raw);return true;
  },remove,
  clearScope(){for(const key of Object.keys(storage))if(key.startsWith(prefix))storage.removeItem(key);},
  dispose(){disposed=true;},own,
 };
}
export function pendingSheetDraft(query,edit,draft,changes,cells=[]){
 const fields=new Map();
 for(const c of [...(changes||[]),...cells])fields.set(c.row.id+':'+c.key,{id:c.row.id,key:c.key,before:c.row[c.key]??null,value:c.value});
 if(edit&&draft!==(edit.row[edit.key]??''))fields.set(edit.row.id+':'+edit.key,{id:edit.row.id,key:edit.key,before:edit.row[edit.key]??null,value:draft});
 return {query,fields:[...fields.values()]};
}
