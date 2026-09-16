import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {one,all,run} from './_bloomops-db.mjs';
import {setupInput} from './_work-setup-fixture.mjs';
import {saveWorkSetup,setWorkSetupActive} from '../lib/bloomops/work-setups.mjs';
import {previewWorkSetup,generateWorkSetup} from '../lib/bloomops/work-setup-generation.mjs';
async function ready(t){const saved=await saveWorkSetup(t.db,t.owner,setupInput());const input={workspaceId:'a',userId:'ellen',templateId:saved.id,versionId:saved.versionId,expectedRevision:1,clientId:'james',serviceEngagementId:'social-service',eventName:'May auction',eventDate:'2026-05-15'};const preview=await previewWorkSetup(t.db,t.owner,input);assert.ok(preview.ok,JSON.stringify(preview));return {...input,requestId:crypto.randomUUID(),planHash:preview.planHash};}
const tables=['projects','milestones','actions','deliverables','action_dependencies','activity_events','work_setup_generations'];
const snapshot=t=>Object.fromEntries(tables.map(table=>[table,all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`)]));
test('preview creates nothing; actual generation creates canonical dated work and one durable retry receipt',async()=>{
 const t=await setup();try{const before=snapshot(t),input=await ready(t);assert.deepEqual(snapshot(t),before);
 const [a,b]=await Promise.all([generateWorkSetup(t.db,t.owner,input),generateWorkSetup(t.db,t.owner,Object.fromEntries(Object.entries(input).reverse()))]);assert.ok(a.ok&&b.ok,JSON.stringify([a,b]));assert.equal(a.projectId,b.projectId);
 const project=await t.get(a.projectId);assert.equal(project.name,'May auction');assert.equal(project.clientId,'james');assert.equal(project.serviceEngagementId,'social-service');assert.equal(project.status,'planned');assert.equal(project.startDate,'2026-05-01');assert.equal(project.targetDate,'2026-05-16');assert.equal(project.ownerMembershipId,null);assert.equal(project.visibility,'internal');
 const milestones=all(t.raw,'SELECT * FROM milestones'),actions=all(t.raw,'SELECT * FROM actions ORDER BY due_date'),deliverables=all(t.raw,'SELECT * FROM deliverables');
 assert.equal(milestones.length,1);assert.equal(milestones[0].target_date,'2026-05-14');assert.equal(actions.length,2);assert.equal(actions[0].due_date,'2026-05-01');assert.equal(actions[1].due_date,'2026-05-14');assert.equal(actions[0].milestone_id,milestones[0].id);assert.equal(actions[0].assignee_membership_id,null);assert.equal(actions[0].status,'to_do');assert.equal(actions[0].description,'Check the new event details.');assert.equal(deliverables.length,1);assert.equal(deliverables[0].target_date,'2026-05-15');assert.equal(deliverables[0].status,'planned');
 const edge=one(t.raw,'SELECT * FROM action_dependencies');assert.equal(edge.action_id,actions[1].id);assert.equal(edge.depends_on_action_id,actions[0].id);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,5);assert.equal(one(t.raw,'SELECT count(*) n FROM work_setup_generations').n,1);
 const after=snapshot(t);assert.deepEqual(await generateWorkSetup(t.db,t.owner,input),a);assert.deepEqual(snapshot(t),after);assert.equal((await generateWorkSetup(t.db,t.owner,{...input,eventName:'Other auction'})).reason,'conflict');assert.deepEqual(snapshot(t),after);
 assert.throws(()=>run(t.raw,"UPDATE work_setup_generations SET event_name='Changed'"));assert.throws(()=>run(t.raw,'DELETE FROM work_setup_generations'));
 }finally{t.raw.close();}
});
test('reusing another event and revising or retiring the setup cannot mutate earlier jobs',async()=>{
 const t=await setup();try{const input=await ready(t),first=await generateWorkSetup(t.db,t.owner,input),before=one(t.raw,'SELECT * FROM projects WHERE id=?',first.projectId);
 const {requestId,planHash,...selection}=input,next={...selection,eventName:'June auction',eventDate:'2026-06-15'},preview=await previewWorkSetup(t.db,t.owner,next),second=await generateWorkSetup(t.db,t.owner,{...next,planHash:preview.planHash,requestId:crypto.randomUUID()});assert.ok(second.ok);assert.notEqual(second.projectId,first.projectId);assert.equal((await t.get(second.projectId)).startDate,'2026-06-01');assert.deepEqual(one(t.raw,'SELECT * FROM projects WHERE id=?',first.projectId),before);
 const update=setupInput({templateId:input.templateId,expectedRevision:1});update.definition.actions[0].dueOffset=-10;assert.ok((await saveWorkSetup(t.db,t.owner,update)).ok);assert.equal((await generateWorkSetup(t.db,t.owner,{...input,requestId:crypto.randomUUID()})).reason,'conflict');assert.deepEqual(await generateWorkSetup(t.db,t.owner,input),first);
 assert.ok((await setWorkSetupActive(t.db,t.owner,input.templateId,{workspaceId:'a',userId:'ellen',expectedRevision:2,active:false,requestId:crypto.randomUUID()})).ok);assert.deepEqual(await generateWorkSetup(t.db,t.owner,input),first);assert.deepEqual(one(t.raw,'SELECT * FROM projects WHERE id=?',first.projectId),before);
 assert.equal((await generateWorkSetup(t.db,t.owner,{...input,requestId:crypto.randomUUID()})).reason,'conflict');
 }finally{t.raw.close();}
});
test('generation checks current Client/Service, role, workspace and template preview',async()=>{
 const t=await setup();try{const input=await ready(t),before=snapshot(t);
 for(const change of [{clientId:'foreign-client'},{serviceEngagementId:'kajabi-service'},{serviceEngagementId:'foreign-service'},{planHash:'0'.repeat(64)},{expectedRevision:2},{versionId:'missing'},{workspaceId:'b'}])assert.equal((await generateWorkSetup(t.db,t.owner,{...input,...change})).ok,false,JSON.stringify(change));
 for(const who of ['james','sam','foreign']){const actor=await t.actor(who);assert.equal((await generateWorkSetup(t.db,actor,{...input,userId:actor.userId})).ok,false);}
 run(t.raw,"INSERT INTO member_capabilities(id,workspace_id,membership_id,capability) VALUES('grant','a','m-sam','templates.manage')");assert.equal((await generateWorkSetup(t.db,await t.actor('sam'),{...input,userId:'sam'})).ok,false);
 run(t.raw,"UPDATE service_engagements SET status='completed' WHERE id='social-service'");assert.equal((await generateWorkSetup(t.db,t.owner,input)).ok,false);assert.deepEqual(snapshot(t),before);
 run(t.raw,"UPDATE service_engagements SET status='active' WHERE id='social-service'");const generated=await generateWorkSetup(t.db,t.owner,input);assert.ok(generated.ok);run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal((await generateWorkSetup(t.db,t.owner,input)).ok,false);
 }finally{t.raw.close();}
});
test('zero-row Project claims and failed or ignored children never leave partial jobs',async()=>{
 for(const injection of ["CREATE TRIGGER ignore_generation BEFORE INSERT ON projects BEGIN SELECT RAISE(IGNORE); END","CREATE TRIGGER ignore_generation BEFORE INSERT ON actions BEGIN SELECT RAISE(IGNORE); END","CREATE TRIGGER ignore_generation BEFORE INSERT ON action_dependencies BEGIN SELECT RAISE(IGNORE); END","CREATE TRIGGER ignore_generation BEFORE INSERT ON deliverables BEGIN SELECT RAISE(ABORT,'synthetic failure'); END"]){
  const t=await setup();try{const input=await ready(t),before=snapshot(t);run(t.raw,injection);if(injection.includes('ON projects'))assert.equal((await generateWorkSetup(t.db,t.owner,input)).reason,'conflict');else await assert.rejects(generateWorkSetup(t.db,t.owner,input));assert.deepEqual(snapshot(t),before);}finally{t.raw.close();}
 }
});
test('a second creation UUID creates separately while a retry never recreates edited work',async()=>{
 const t=await setup();try{const input=await ready(t),first=await generateWorkSetup(t.db,t.owner,input);run(t.raw,"UPDATE actions SET title='Edited actual job' WHERE project_id=?",first.projectId);const before=snapshot(t);assert.deepEqual(await generateWorkSetup(t.db,t.owner,input),first);assert.deepEqual(snapshot(t),before);const other=await generateWorkSetup(t.db,t.owner,{...input,requestId:crypto.randomUUID()});assert.ok(other.ok);assert.notEqual(other.projectId,first.projectId);assert.equal(one(t.raw,"SELECT count(*) n FROM actions WHERE project_id=? AND title='Edited actual job'",first.projectId).n,2);
 }finally{t.raw.close();}
});
