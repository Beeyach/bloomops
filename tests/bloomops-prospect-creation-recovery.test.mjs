import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './_prospect-conversion-fixture.mjs';import {all,run} from './_bloomops-db.mjs';
import {readProspectCreation} from '../lib/bloomops/prospect-creation-recovery.mjs';import {createProspect,updateProspect} from '../lib/bloomops/prospects.mjs';
import {PROSPECT_FIELDS} from '../lib/bloomops/prospect-values.mjs';import {createProfileDraftStore} from '../lib/bloomops/profile-drafts.mjs';
const input=t=>({userId:t.actor.userId,workspaceId:t.actor.workspaceId,requestId:crypto.randomUUID()});
test('new-form check is a bound read with no application writes before or after creation',async c=>{
 const t=await fixture(c),body=input(t),before=t.snapshot();const ready=await readProspectCreation(t.db,t.actor,body);assert.equal(ready.state,'ready');assert.equal(ready.prospect,null);assert.deepEqual(t.snapshot(),before);
 const made=await createProspect(t.db,{actor:t.actor,input:{...body,fields:{businessName:'New garden'}}});assert.ok(made.ok);const after=t.snapshot(),created=await readProspectCreation(t.db,t.actor,body);assert.equal(created.state,'created');assert.equal(created.prospect.id,made.prospectId);assert.deepEqual(t.snapshot(),after);
 await updateProspect(t.db,{actor:t.actor,id:made.prospectId,input:{userId:body.userId,workspaceId:'w',expectedRevision:1,fields:{businessName:'Renamed garden'}}});assert.equal((await readProspectCreation(t.db,t.actor,body)).prospect.businessName,'Renamed garden');
});
test('original creation identity prevents duplicate rows or history after a lost reply and changed input',async c=>{
 const t=await fixture(c),body={...input(t),fields:{businessName:'Replay garden',website:'https://garden.example/'}},created=await createProspect(t.db,{actor:t.actor,input:body});assert.ok(created.ok);const before=t.snapshot();
 const replay=await createProspect(t.db,{actor:t.actor,input:body});assert.equal(replay.prospectId,created.prospectId);assert.equal(replay.unchanged,true);
 const changed=await createProspect(t.db,{actor:t.actor,input:{...body,fields:{businessName:'Edited after lost reply'}}});assert.equal(changed.reason,'conflict');assert.deepEqual(t.snapshot(),before);
 const {fields,...readInput}=body;assert.equal((await readProspectCreation(t.db,t.actor,readInput)).prospect.id,created.prospectId);
});
test('recovery and creation refuse mismatched identity/workspace and revoked current authority',async c=>{
 const t=await fixture(c),body=input(t),before=t.snapshot();for(const patch of [{userId:'other'},{workspaceId:'foreign'}]){assert.equal((await readProspectCreation(t.db,t.actor,{...body,...patch})).status,403);assert.equal((await createProspect(t.db,{actor:t.actor,input:{...body,...patch,fields:{businessName:'Forbidden'}}})).ok,false);}assert.deepEqual(t.snapshot(),before);
 for(const patch of [{requestId:[]},{requestId:[body.requestId]},{requestId:'invalid'},{extra:true}])assert.equal((await readProspectCreation(t.db,t.actor,{...body,...patch})).status,400);
 run(t.raw,'UPDATE workspace_memberships SET status=? WHERE id=?','suspended',t.actor.membershipId);const revoked=t.snapshot();assert.equal((await readProspectCreation(t.db,t.actor,body)).status,403);assert.equal((await createProspect(t.db,{actor:t.actor,input:{...body,fields:{businessName:'Revoked'}}})).ok,false);assert.deepEqual(t.snapshot(),revoked);
});
test('a known receipt belonging to another administrator cannot be adopted',async c=>{
 const t=await fixture(c),body=input(t);run(t.raw,"INSERT INTO user(id,name,email) VALUES('other','Other owner','other@example.test')");run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('other-member','w','other','admin','active')");const other={...t.actor,userId:'other',membershipId:'other-member',role:'admin'};
 assert.ok((await createProspect(t.db,{actor:other,input:{...body,userId:'other',fields:{businessName:'Other user draft'}}})).ok);const before=t.snapshot();const result=await readProspectCreation(t.db,t.actor,body);assert.equal(result.status,409);assert.equal(result.prospect,undefined);assert.deepEqual(t.snapshot(),before);
});
function storage(){const values={};return new Proxy({getItem:k=>values[k]??null,setItem:(k,v)=>values[k]=String(v),removeItem:k=>delete values[k]},{ownKeys:()=>Object.keys(values),getOwnPropertyDescriptor:(_,k)=>Object.hasOwn(values,k)?{enumerable:true,configurable:true}:undefined});}
test('new-form copies preserve incomplete input and creation request identity across writer recovery',()=>{
 const s=storage(),scope={userId:'owner',workspaceId:'w',prospectId:'new'},a=createProfileDraftStore(s,scope,'writer-a'),b=createProfileDraftStore(s,scope,'writer-b');const fields=Object.fromEntries(Object.entries(PROSPECT_FIELDS).filter(([,v])=>v.section==='identity').map(([k])=>[k,null])),requestId=crypto.randomUUID(),value={section:'identity',revision:1,creationRequestId:requestId,before:fields,fields:{...fields,businessName:'Incomplete',website:'https://'},sources:{},sourceBefore:{}};a.write(value);b.write(a.snapshot(a.own).value);assert.equal(b.snapshot(b.own).value.creationRequestId,requestId);assert.equal(b.snapshot(b.own).value.fields.website,'https://');assert.equal(a.list().length,2);
 for(const creationRequestId of [null,'',true,[requestId],'not-an-id'])assert.throws(()=>a.write({...value,creationRequestId}),/could not be kept/);assert.throws(()=>a.write({...value,revision:2}),/could not be kept/);
 for(const patch of [{userId:'other'},{workspaceId:'foreign'},{prospectId:'existing'}])assert.deepEqual(createProfileDraftStore(s,{...scope,...patch},'writer').list(),[]);
 const expected=b.snapshot(a.own).raw;a.write({...value,fields:{...value.fields,businessName:'Other tab update'}});assert.equal(b.remove(a.own,expected),false);assert.equal(a.snapshot(a.own).value.fields.businessName,'Other tab update');
});
