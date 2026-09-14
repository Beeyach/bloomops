import {DRAFT_CONTEXT_KEY,PAGE_DRAFT_PREFIX,PAGE_LEGACY_LOGOUT_KEY} from './draft-context.mjs';
import {pageDraftKey} from './page-drafts.mjs';
export const PAGE_DRAFT_TTL=7*24*60*60*1000,PAGE_DRAFT_BYTES=8*1024*1024,PAGE_DRAFT_COPIES=10;
const bytes=v=>new TextEncoder().encode(v).length;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const document=v=>object(v)&&typeof v.title==='string'&&v.title.length<=200&&typeof v.body==='string'&&bytes(v.body)<=1800000;
const fields=v=>({title:v.title,body:v.body});
export function pageDraftData(value){
 if(!document(value)||!Number.isSafeInteger(value.revision)||value.revision<1||value.saved!==undefined&&!document(value.saved)||value.pending!=null&&(!document(value.pending)||value.pending.expectedRevision!==value.revision))return null;
 return {...fields(value),revision:value.revision,...(value.saved?{saved:fields(value.saved)}:{}),pending:value.pending?{...fields(value.pending),expectedRevision:value.revision}:null};
}
export const pageDraftScope=scope=>PAGE_DRAFT_PREFIX+JSON.stringify([scope.userId,scope.workspaceId,scope.pageId])+':';
// Other tabs' sessionStorage is not directly accessible at logout. A persistent
// logout marker retires their old-format copies when they next open an editor.
export function syncLegacyPageLogout(storage,legacy){
 const epoch=storage.getItem(PAGE_LEGACY_LOGOUT_KEY);
 if(epoch&&legacy.getItem(PAGE_LEGACY_LOGOUT_KEY)!==epoch){for(const key of Object.keys(legacy))if(key.startsWith('bloomsi:page-draft:'))legacy.removeItem(key);legacy.setItem(PAGE_LEGACY_LOGOUT_KEY,epoch);}
}
export function createPageDraftStore(storage,legacy,scope,writerId,now=()=>Date.now()){
 const prefix=pageDraftScope(scope),own=prefix+writerId,legacyKey=pageDraftKey(scope.userId,scope.workspaceId,scope.pageId),epoch=storage.getItem(DRAFT_CONTEXT_KEY);let disposed=false;
 syncLegacyPageLogout(storage,legacy);
 const legacyTimeKey=legacyKey+':observed';
 if(legacy.getItem(legacyKey)){const observed=Number(legacy.getItem(legacyTimeKey));if(!Number.isSafeInteger(observed)||observed<=0||observed>now()+60000)legacy.setItem(legacyTimeKey,String(now()));}
 const valid=()=>!disposed&&storage.getItem(DRAFT_CONTEXT_KEY)===epoch;
 function snapshot(key){
  if(!valid()||(key!==legacyKey&&!key.startsWith(prefix)))return null;
  const source=key===legacyKey?legacy:storage,raw=source.getItem(key);if(!raw||bytes(raw)>PAGE_DRAFT_BYTES)return null;
  try{
   const v=JSON.parse(raw),data=pageDraftData(v);if(!data)return null;
   if(key===legacyKey){const at=Number(legacy.getItem(legacyTimeKey));if(now()-at>PAGE_DRAFT_TTL){remove(key,raw);return null;}return {key,raw,value:data,legacy:true,at};}
   if(v.version!==1||typeof v.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(v.id)||key!==prefix+v.id||v.userId!==scope.userId||v.workspaceId!==scope.workspaceId||v.pageId!==scope.pageId||!Number.isSafeInteger(v.updatedAt)||v.updatedAt>now()+60000||now()-v.updatedAt>PAGE_DRAFT_TTL)return null;
   return {key,raw,value:data,at:v.updatedAt,legacy:false};
  }catch{return null;}
 }
 function remove(key,expected){if(!valid()||(key!==legacyKey&&!key.startsWith(prefix)))return false;const source=key===legacyKey?legacy:storage;if(expected!==undefined&&source.getItem(key)!==expected)return false;source.removeItem(key);if(key===legacyKey)legacy.removeItem(legacyTimeKey);return true;}
 function purge(){for(const key of Object.keys(storage).filter(k=>k.startsWith(prefix)))try{const raw=storage.getItem(key),v=JSON.parse(raw);if(Number.isSafeInteger(v.updatedAt)&&now()-v.updatedAt>PAGE_DRAFT_TTL)remove(key,raw);}catch{}}
 function list(){if(!valid())return [];purge();return [...Object.keys(storage).filter(k=>k.startsWith(prefix)),legacyKey].map(snapshot).filter(Boolean).sort((a,b)=>(b.at||0)-(a.at||0));}
 return {own,valid,list,snapshot,remove,
  write(input){if(!valid())return false;if(!input){storage.removeItem(own);return true;}const data=pageDraftData(input);if(!data)throw Error('This recovery copy could not be kept. Keep this tab open until saved.');purge();if(!storage.getItem(own)&&list().length>=PAGE_DRAFT_COPIES)throw Error('Ten recovery copies are already kept for this page. Discard an old copy before keeping another.');const raw=JSON.stringify({...data,...scope,version:1,id:writerId,updatedAt:now()});if(bytes(raw)>PAGE_DRAFT_BYTES)throw Error('This page recovery copy is too large. Keep this tab open until saved, or download your draft.');storage.setItem(own,raw);return true;},
  clearScope(){if(valid()){for(const key of Object.keys(storage))if(key.startsWith(prefix))storage.removeItem(key);legacy.removeItem(legacyKey);legacy.removeItem(legacyTimeKey);}},
  dispose(){disposed=true;},
 };
}
