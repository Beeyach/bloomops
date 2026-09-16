import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {all,run,one} from './_bloomops-db.mjs';
import {readClientEdit,saveClientEdit} from '../lib/bloomops/client-edit.mjs';
const input=async(t,patch={},actor=t.owner)=>({editorScope:{workspaceId:actor.workspaceId,userId:actor.userId},expected:await readClientEdit(t.db,actor,'james'),...patch});
test('an editor snapshot cannot overwrite a later saved Client or record misleading activity',async()=>{
 const t=await setup();try{
  const first=await input(t,{name:'First saved name'}),stale={...first,name:'Stale editor name'};
  assert.equal((await saveClientEdit(t.db,t.owner,'james',first)).ok,true);
  const events=all(t.raw,'SELECT * FROM activity_events');
  assert.equal((await saveClientEdit(t.db,t.owner,'james',stale)).reason,'conflict');
  assert.equal(one(t.raw,"SELECT name FROM bloomops_clients WHERE id='james'").name,'First saved name');
  assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),events);
 }finally{t.raw.close();}
});
test('concurrent original-snapshot saves have one winner; a current no-op records nothing',async()=>{
 const t=await setup();try{
  const original=await input(t);
  const results=await Promise.all(['One','Two'].map(name=>saveClientEdit(t.db,t.owner,'james',{...original,name})));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='conflict').length,1);
  const current=await readClientEdit(t.db,t.owner,'james'),events=all(t.raw,'SELECT * FROM activity_events');
  assert.equal((await saveClientEdit(t.db,t.owner,'james',await input(t,{name:current.name}))).unchanged,true);
  assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),events);
 }finally{t.raw.close();}
});
test('missing/malformed snapshot and wrong initiating scope cannot mutate a Client',async()=>{
 const t=await setup();try{
  const valid=await input(t,{name:'Not saved'});
  for(const expected of [null,{},[],{...valid.expected,extra:'x'}])assert.equal((await saveClientEdit(t.db,t.owner,'james',{...valid,expected})).reason,'invalid');
  for(const editorScope of [{workspaceId:'b',userId:'ellen'},{workspaceId:'a',userId:'ary'}])assert.equal((await saveClientEdit(t.db,t.owner,'james',{...valid,editorScope})).reason,'not_found');
  assert.equal(one(t.raw,"SELECT name FROM bloomops_clients WHERE id='james'").name,'james');
 }finally{t.raw.close();}
});
test('current role, workspace, portal, preview and revoked membership govern read and save',async()=>{
 const t=await setup();try{
  const valid=await input(t,{name:'Not saved'});
  for(const actor of [await t.actor('sam'),await t.actor('james'),await t.actor('foreign'),{...t.owner,preview:{}}]){
   assert.equal(await readClientEdit(t.db,actor,'james'),null);
   assert.equal((await saveClientEdit(t.db,actor,'james',{...valid,editorScope:{userId:actor.userId,workspaceId:actor.workspaceId}})).reason,'not_found');
  }
  run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");
  assert.equal(await readClientEdit(t.db,t.owner,'james'),null);assert.equal((await saveClientEdit(t.db,t.owner,'james',valid)).reason,'not_found');
 }finally{t.raw.close();}
});
