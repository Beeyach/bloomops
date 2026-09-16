import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClientEditStore,CLIENT_EDIT_TTL} from '../lib/bloomops/client-edit-store.mjs';
import {clientEditSnapshot,clientDetailInput} from '../lib/bloomops/client-edit-values.mjs';
import {DRAFT_CONTEXT_KEY,CLIENT_EDIT_DRAFT_PREFIX,changeDraftContext} from '../lib/bloomops/draft-context.mjs';
const scope={userId:'u',workspaceId:'w',clientId:'c'},now=Date.parse('2026-09-16T00:00:00Z');
function storage(){const values={};return new Proxy({getItem:k=>values[k]??null,setItem:(k,v)=>{values[k]=String(v);},removeItem:k=>{delete values[k];}},{ownKeys:()=>Object.keys(values),getOwnPropertyDescriptor:(_,k)=>Object.hasOwn(values,k)?{enumerable:true,configurable:true}:undefined});}
const draft=()=>{const expected=clientEditSnapshot({name:'Original',health:'on_track'});return {expected,fields:{...clientDetailInput(expected),name:'Unfinished',website:'https://'},pending:null};};
const store=(s,context=scope,clock=now)=>createClientEditStore(s,context,crypto.randomUUID(),()=>clock);
test('raw incomplete input, original snapshot and attempted edit survive independent writers',()=>{
 const s=storage(),a=store(s),b=store(s),v=draft();v.pending={...v.fields,name:'Attempted'};a.write(v);b.write({...draft(),fields:{...v.fields,name:'Other'}});
 assert.equal(a.list().length,2);assert.deepEqual(a.snapshot(a.own).value.pending,v.pending);assert.equal(a.snapshot(a.own).value.expected.name,'Original');
 for(const patch of [{userId:'other'},{workspaceId:'other'},{clientId:'other'}]){const f=store(s,{...scope,...patch});assert.deepEqual(f.list(),[]);assert.equal(f.snapshot(a.own),null);assert.equal(f.remove(a.own),false);}
});
test('expiry, ten-copy workspace bound and compare-remove preserve other drafts',()=>{
 const s=storage(),a=store(s),b=store(s,{...scope,clientId:'second'});a.write(draft());b.write(draft());
 const snapshot=a.snapshot(a.own);a.write({...draft(),fields:{...draft().fields,name:'Newer'}});assert.equal(a.remove(a.own,snapshot.raw),false);
 for(let i=0;i<8;i++)store(s,{...scope,clientId:'record-'+i}).write(draft());assert.throws(()=>store(s).write(draft()),/Ten Client edit copies/);
 const later=store(s,scope,now+CLIENT_EDIT_TTL+1);assert.deepEqual(later.list(),[]);assert.equal(s.getItem(b.own),null);
});
test('quota and malformed copies never discard a valid source or mutate input',()=>{
 const s=storage(),a=store(s),v=draft();a.write(v);const raw=s.getItem(a.own),b=store(s);s.setItem=()=>{throw Error('quota');};assert.throws(()=>b.write(v),/quota/);assert.equal(s.getItem(a.own),raw);assert.equal(v.fields.name,'Unfinished');
 assert.throws(()=>a.write({...v,expected:{}}),/could not be kept/);
});
test('epoch changes, disposal and logout cannot resurrect or expose retired copies',()=>{
 const s=storage(),a=store(s);a.write(draft());s.setItem(DRAFT_CONTEXT_KEY,'new');assert.equal(a.write(draft()),false);assert.equal(a.remove(a.own),false);assert.deepEqual(a.list(),[]);
 const b=store(s);b.dispose();assert.equal(b.write(draft()),false);
 const old={window:globalThis.window,localStorage:globalThis.localStorage,sessionStorage:globalThis.sessionStorage,BroadcastChannel:globalThis.BroadcastChannel,CustomEvent:globalThis.CustomEvent};
 try{globalThis.window={dispatchEvent(){}};globalThis.localStorage=s;globalThis.sessionStorage=storage();globalThis.BroadcastChannel=class{postMessage(){}close(){}};globalThis.CustomEvent=class{};changeDraftContext({logout:true});assert.equal(Object.keys(s).filter(k=>k.startsWith(CLIENT_EDIT_DRAFT_PREFIX)).length,0);}finally{Object.assign(globalThis,old);}
});
