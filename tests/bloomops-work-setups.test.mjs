import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {setupInput,setupDefinition} from './_work-setup-fixture.mjs';
import {saveWorkSetup,getWorkSetup,listWorkSetups,setWorkSetupActive} from '../lib/bloomops/work-setups.mjs';
const snapshot=t=>Object.fromEntries(['templates','template_versions','work_setup_states','work_setup_saves'].map(table=>[table,all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`)]));
test('real setup writer persists one immutable version across concurrent equivalent creation retries',async()=>{
 const t=await setup();try{const input=setupInput();const [a,b]=await Promise.all([saveWorkSetup(t.db,t.owner,input),saveWorkSetup(t.db,t.owner,{...input,definition:Object.fromEntries(Object.entries(input.definition).reverse())})]);assert.ok(a.ok&&b.ok);assert.equal(a.id,b.id);assert.equal(a.versionId,b.versionId);
 const stored=await getWorkSetup(t.db,t.owner,a.id);assert.equal(stored.version,1);assert.equal(stored.revision,1);assert.deepEqual(stored.definition,setupDefinition());assert.equal(stored.canEdit,true);
 for(const table of ['templates','template_versions','work_setup_states','work_setup_saves'])assert.equal(one(t.raw,`SELECT count(*) n FROM ${table}`).n,1);
 assert.equal((await saveWorkSetup(t.db,t.owner,{...input,definition:{...input.definition,name:'Changed intent'}})).reason,'conflict');
 const separate=await saveWorkSetup(t.db,t.owner,{...input,requestId:crypto.randomUUID()});assert.ok(separate.ok);assert.notEqual(separate.id,a.id);
 assert.throws(()=>run(t.raw,"UPDATE template_versions SET definition_json='{}' WHERE id=?",a.versionId));assert.throws(()=>run(t.raw,'DELETE FROM template_versions WHERE id=?',a.versionId));
 }finally{t.raw.close();}
});
test('concurrent revisions have one winner and preserve the old definition',async()=>{
 const t=await setup();try{const first=await saveWorkSetup(t.db,t.owner,setupInput()),old=one(t.raw,'SELECT * FROM template_versions WHERE id=?',first.versionId),input=setupInput({templateId:first.id,expectedRevision:1});
 const results=await Promise.all(['First correction','Second correction'].map(name=>saveWorkSetup(t.db,t.owner,{...input,requestId:crypto.randomUUID(),definition:{...input.definition,name}})));
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).reason,'conflict');const stored=await getWorkSetup(t.db,t.owner,first.id);assert.equal(stored.version,2);assert.equal(stored.revision,2);assert.equal(one(t.raw,'SELECT definition_json FROM template_versions WHERE id=?',first.versionId).definition_json,old.definition_json);assert.equal(one(t.raw,'SELECT status FROM template_versions WHERE id=?',first.versionId).status,'retired');assert.equal(one(t.raw,'SELECT count(*) n FROM template_versions').n,2);
 }finally{t.raw.close();}
});
test('retirement and restoration fence revisions and retain historical retry receipts',async()=>{
 const t=await setup();try{const saved=await saveWorkSetup(t.db,t.owner,setupInput());const before=all(t.raw,'SELECT * FROM template_versions');const input={workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),expectedRevision:1,active:false};
 const retired=await setWorkSetupActive(t.db,t.owner,saved.id,input);assert.ok(retired.ok);assert.equal((await getWorkSetup(t.db,t.owner,saved.id)).active,false);assert.equal((await listWorkSetups(t.db,t.owner)).items.length,0);assert.equal((await listWorkSetups(t.db,t.owner,{archived:true})).items[0].id,saved.id);
 assert.deepEqual(await setWorkSetupActive(t.db,t.owner,saved.id,input),retired);assert.equal((await setWorkSetupActive(t.db,t.owner,saved.id,{...input,active:true})).reason,'conflict');
 assert.ok((await setWorkSetupActive(t.db,t.owner,saved.id,{...input,requestId:crypto.randomUUID(),expectedRevision:2,active:true})).ok);assert.deepEqual(await setWorkSetupActive(t.db,t.owner,saved.id,input),retired);assert.equal((await getWorkSetup(t.db,t.owner,saved.id)).active,true,'replaying retirement must not retire a restored setup');assert.deepEqual(all(t.raw,'SELECT * FROM template_versions'),before);
 }finally{t.raw.close();}
});
test('current capability and workspace rules protect reads, writes and retries',async()=>{
 const t=await setup();try{const input=setupInput(),saved=await saveWorkSetup(t.db,t.owner,input);for(const who of ['james','foreign','sam']){const actor=await t.actor(who);assert.equal(await getWorkSetup(t.db,actor,saved.id),null);assert.equal((await saveWorkSetup(t.db,actor,{...input,userId:actor.userId})).ok,false);}
 const pm=await t.actor('pm');assert.equal((await getWorkSetup(t.db,pm,saved.id)).canEdit,false);assert.equal((await saveWorkSetup(t.db,pm,setupInput({userId:'pm'}))).ok,false);
 run(t.raw,"INSERT INTO member_capabilities(id,workspace_id,membership_id,capability) VALUES('grant','a','m-sam','templates.manage')");const granted=await t.actor('sam');assert.equal((await getWorkSetup(t.db,granted,saved.id)).canEdit,true);const owned=setupInput({userId:'sam'});assert.ok((await saveWorkSetup(t.db,granted,owned)).ok);run(t.raw,"DELETE FROM member_capabilities WHERE id='grant'");assert.equal((await saveWorkSetup(t.db,granted,owned)).ok,false);assert.equal(await getWorkSetup(t.db,granted,saved.id),null);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal(await getWorkSetup(t.db,t.owner,saved.id),null);assert.equal((await saveWorkSetup(t.db,t.owner,input)).ok,false);
 }finally{t.raw.close();}
});
test('zero-row revision and failed version writes leave the complete saved setup unchanged',async()=>{
 const t=await setup();try{const saved=await saveWorkSetup(t.db,t.owner,setupInput()),before=snapshot(t),input=setupInput({templateId:saved.id,expectedRevision:1});input.definition.name='Change';
 run(t.raw,'CREATE TRIGGER ignore_setup_revision BEFORE UPDATE ON work_setup_states BEGIN SELECT RAISE(IGNORE); END');assert.equal((await saveWorkSetup(t.db,t.owner,input)).reason,'conflict');assert.deepEqual(snapshot(t),before);run(t.raw,'DROP TRIGGER ignore_setup_revision');
 run(t.raw,"CREATE TRIGGER fail_setup_version BEFORE INSERT ON template_versions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");await assert.rejects(saveWorkSetup(t.db,t.owner,input));assert.deepEqual(snapshot(t),before);
 }finally{t.raw.close();}
});
test('zero-row creation claim is quiet; ignored downstream state insertion rolls back the new template',async()=>{
 const t=await setup();try{const before=snapshot(t);run(t.raw,"CREATE TRIGGER ignore_setup_template BEFORE INSERT ON templates BEGIN SELECT RAISE(IGNORE); END");assert.equal((await saveWorkSetup(t.db,t.owner,setupInput())).reason,'conflict');assert.deepEqual(snapshot(t),before);run(t.raw,'DROP TRIGGER ignore_setup_template');
 run(t.raw,'CREATE TRIGGER ignore_setup_state BEFORE INSERT ON work_setup_states BEGIN SELECT RAISE(IGNORE); END');await assert.rejects(saveWorkSetup(t.db,t.owner,setupInput()));assert.deepEqual(snapshot(t),before);
 }finally{t.raw.close();}
});
