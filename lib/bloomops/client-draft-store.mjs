import { CLIENT_DRAFT_PREFIX, DRAFT_CONTEXT_KEY } from './draft-context.mjs';
export const CLIENT_DRAFT_TTL = 7*24*60*60*1000;
export const CLIENT_DRAFT_BYTES = 256*1024;
export const CLIENT_DRAFT_COPIES = 10;
// Raw incomplete input stays raw. Server validation is deliberately separate.
export const CLIENT_DRAFT_FIELDS = ['name','contactName','contactEmail','website','timezone','startDate','ownerMembershipId'];
export const emptyClientFields = () => Object.fromEntries(CLIENT_DRAFT_FIELDS.map(key => [key, '']));
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const clientDraftScope = scope => CLIENT_DRAFT_PREFIX+JSON.stringify([scope.userId,scope.workspaceId])+':';
export function clientDraftValue(value,scope,now=Date.now()) {
  if (!object(value)||value.version!==1||!uuid(value.id)||!uuid(value.requestId)||value.userId!==scope.userId||value.workspaceId!==scope.workspaceId
    ||!Number.isSafeInteger(value.updatedAt)||value.updatedAt>now+60000||now-value.updatedAt>CLIENT_DRAFT_TTL) return null;
  const fields = raw => object(raw) && Object.keys(raw).length===CLIENT_DRAFT_FIELDS.length
    && CLIENT_DRAFT_FIELDS.every(key=>typeof raw[key]==='string'&&raw[key].length<=4096)
    ? Object.fromEntries(CLIENT_DRAFT_FIELDS.map(key=>[key,raw[key]])) : null;
  const input=fields(value.fields),pending=value.pending===null?null:fields(value.pending);
  if(!input||(value.pending!==null&&!pending))return null;
  return {version:1,id:value.id,...scope,requestId:value.requestId,updatedAt:value.updatedAt,fields:input,pending};
}
export const clientDraftDirty = value => !!value.pending || CLIENT_DRAFT_FIELDS.some(key=>value.fields[key]!=='');
export function createClientDraftStore(storage,scope,writerId,now=()=>Date.now()) {
  const prefix=clientDraftScope(scope),own=prefix+writerId,epoch=storage.getItem(DRAFT_CONTEXT_KEY);let disposed=false;
  const valid=()=>!disposed&&storage.getItem(DRAFT_CONTEXT_KEY)===epoch;
  function snapshot(key){const raw=storage.getItem(key);if(!raw||new TextEncoder().encode(raw).length>CLIENT_DRAFT_BYTES)return null;try{const value=clientDraftValue(JSON.parse(raw),scope,now());return value&&key===prefix+value.id?{value,raw}:null;}catch{return null;}}
  function remove(key,expected){if(!valid()||!key.startsWith(prefix)||expected!==undefined&&storage.getItem(key)!==expected)return false;storage.removeItem(key);return true;}
  function purge(){for(const key of Object.keys(storage).filter(k=>k.startsWith(prefix))){try{const raw=storage.getItem(key),value=JSON.parse(raw);if(Number.isSafeInteger(value.updatedAt)&&now()-value.updatedAt>CLIENT_DRAFT_TTL)remove(key,raw);}catch{}}}
  function list(){if(!valid())return [];purge();return Object.keys(storage).filter(key=>key.startsWith(prefix)).map(key=>({key,value:snapshot(key)?.value})).filter(x=>x.value).sort((a,b)=>b.value.updatedAt-a.value.updatedAt);}
  return {own,valid,list,snapshot:key=>valid()&&key.startsWith(prefix)?snapshot(key):null,remove,
    write(input){
      if(!valid())return false;
      if(!input){storage.removeItem(own);return true;}
      const value=clientDraftValue({...input,...scope,version:1,id:writerId,updatedAt:now()},scope,now());
      if(!value)throw Error('This recovery copy could not be kept. Keep this tab open until saved.');
      if(!clientDraftDirty(value)){storage.removeItem(own);return true;}
      purge();if(!storage.getItem(own)&&list().length>=CLIENT_DRAFT_COPIES)throw Error('Ten client recovery copies are already kept. Discard an old copy before keeping another.');
      const raw=JSON.stringify(value);if(new TextEncoder().encode(raw).length>CLIENT_DRAFT_BYTES)throw Error('This recovery copy is too large. Keep this tab open until saved.');
      storage.setItem(own,raw);return true;
    },
    clearScope(){if(valid())for(const key of Object.keys(storage))if(key.startsWith(prefix))storage.removeItem(key);},
    dispose(){disposed=true;},
  };
}
