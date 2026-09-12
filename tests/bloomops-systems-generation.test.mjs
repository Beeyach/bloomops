import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, NOW } from './_systems-generation.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import { GHL_BUILD_BLUEPRINT_V1 } from '../lib/bloomops/systems-blueprint-defaults.mjs';
import { encodeSystemsBlueprintDefinition } from '../lib/bloomops/systems-blueprint-definition.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';

test('options/preview are read-only and reveal only selected internal proposed work',async ctx=>{
  const t=await fixture(ctx),before=t.state(),options=await t.options(),preview=await t.preview(['sms','email']);
  assert.equal(options.components.length,14);assert.equal(Object.hasOwn(options,'definitionJson'),false);
  assert.equal(preview.ok,true);assert.equal(preview.plan.milestones.length,1);assert.equal(preview.plan.actions.length,2);
  assert.deepEqual(preview.plan.selectedComponentKeys,['email','sms']);assert.deepEqual(t.state(),before);
});

test('all-component generation creates one exact receipt, graph, event and revision',async ctx=>{
  const t=await fixture(ctx);const keys=GHL_BUILD_BLUEPRINT_V1.components.map(c=>c.logicalKey);
  const r=await t.generate({selectedComponentKeys:keys});assert.equal(r.ok,true);assert.equal(r.replayed,false);
  assert.deepEqual(r.counts,{milestones:13,actions:14,deliverables:8,dependencies:20});
  assert.equal(one(t.raw,'SELECT revision FROM projects WHERE id=?',t.projectId).revision,2);
  assert.equal(one(t.raw,'SELECT status FROM projects WHERE id=?',t.projectId).status,'planned');
  const receipt=one(t.raw,'SELECT * FROM systems_blueprint_generations WHERE id=?',r.generationId);
  assert.equal(receipt.created_by_membership_id,'m-ellen');assert.equal(receipt.request_id,t.input.requestId);
  assert.equal(all(t.raw,'SELECT * FROM systems_blueprint_generation_items').length,35);
  for(const [table,status] of [['milestones','upcoming'],['actions','to_do'],['deliverables','planned']]) {
    const rows=all(t.raw,`SELECT * FROM ${table}`);assert.ok(rows.every(row=>row.visibility==='internal'&&row.status===status&&row.revision===1));
    assert.ok(rows.every(row=>row.created_at===NOW.toISOString()));
  }
  assert.ok(all(t.raw,'SELECT * FROM actions').every(row=>row.assignee_membership_id===null&&row.due_date===null&&row.priority==='normal'));
  const events=all(t.raw,"SELECT * FROM activity_events WHERE event_type='PROJECT_BLUEPRINT_GENERATED'");assert.equal(events.length,1);
  assert.equal(events[0].subject_id,t.projectId);assert.equal(JSON.parse(events[0].metadata_json).generationId,r.generationId);
  const mapping=new Map(all(t.raw,"SELECT record_id,logical_key FROM systems_blueprint_generation_items WHERE kind='action'").map(x=>[x.record_id,x.logical_key]));
  const actual=all(t.raw,'SELECT * FROM action_dependencies').map(e=>[mapping.get(e.action_id),mapping.get(e.depends_on_action_id)]).sort();
  const expected=(await import('../lib/bloomops/systems-blueprint-compiler.mjs')).compileSystemsBlueprint({definition:GHL_BUILD_BLUEPRINT_V1,selectedComponentKeys:keys}).dependencies.map(e=>[e.actionKey,e.dependsOnActionKey]).sort();
  assert.deepEqual(actual,expected);
});

test('minimal generation and normalized UUID/selection retry are identical and write nothing',async ctx=>{
  const t=await fixture(ctx),patch={requestId:t.input.requestId.toUpperCase(),selectedComponentKeys:['sms','email']};
  const first=await t.generate(patch);assert.equal(first.ok,true);const before=t.state();
  const replay=await t.generate({...patch,requestId:t.input.requestId,selectedComponentKeys:['email','sms']});
  assert.deepEqual(replay,{...first,replayed:true});assert.deepEqual(t.state(),before);
  assert.deepEqual(await t.generate({...patch,selectedComponentKeys:['email']}),{ok:false,reason:'conflict'});
  assert.deepEqual(await t.generate({...patch,requestId:crypto.randomUUID()}),{ok:false,reason:'conflict'});
  assert.deepEqual(t.state(),before);
});

for(const who of ['ary','pm','sam','james','foreign']) test(`generation role/scope: ${who}`,async ctx=>{
  const t=await fixture(ctx),actor=await t.actor(who),before=t.state();
  const r=await t.generate({}, {actor});assert.equal(r.ok,['ary','pm'].includes(who));
  if(!r.ok)assert.deepEqual(t.state(),before);
});

test('restricted Project requires exact PM assignment; templates capability grants no generation role',async ctx=>{
  const t=await fixture(ctx);run(t.raw,"UPDATE projects SET visibility='restricted' WHERE id=?",t.projectId);
  const pm=await t.actor('pm');assert.equal((await t.options(pm)).ok,false);
  run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-pm')",t.projectId);
  assert.equal((await t.options(pm)).ok,true);
  run(t.raw,"INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES('a','m-sam','templates.manage')");
  assert.deepEqual(await t.generate({}, {actor:await t.actor('sam')}),{ok:false,reason:'forbidden'});
  assert.equal((await t.generate({}, {actor:pm})).ok,true);
});

for(const change of ["UPDATE projects SET status='ready'", "UPDATE service_engagements SET status='completed'",
  "UPDATE service_types SET active=0", "UPDATE departments SET active=0", "UPDATE departments SET slug='other-systems' WHERE id='systems'",
  'UPDATE service_type_blueprint_bindings SET enabled=0,revision=revision+1', 'UPDATE templates SET active=0',
  "UPDATE template_versions SET status='retired'"]) test(`ineligible source refuses generation: ${change}`,async ctx=>{
  const t=await fixture(ctx);run(t.raw,change);const before=t.state();assert.equal((await t.preview()).ok,false);
  assert.equal((await t.generate()).ok,false);assert.deepEqual(t.state(),before);
});

for(const kind of ['milestones','actions','deliverables','files']) test(`pre-existing ${kind} makes Project nonempty`,async ctx=>{
  const t=await fixture(ctx);
  if(kind==='milestones')run(t.raw,"INSERT INTO milestones(id,workspace_id,project_id,creation_request_id,name,position) VALUES('manual','a',?,?,'Manual',1)",t.projectId,crypto.randomUUID());
  if(kind==='actions')run(t.raw,"INSERT INTO actions(id,workspace_id,project_id,creation_request_id,title) VALUES('manual','a',?,?,'Manual')",t.projectId,crypto.randomUUID());
  if(kind==='deliverables')run(t.raw,"INSERT INTO deliverables(id,workspace_id,project_id,creation_request_id,title) VALUES('manual','a',?,?,'Manual')",t.projectId,crypto.randomUUID());
  if(kind==='files') {
    run(t.raw,"INSERT INTO assets(id,workspace_id,creation_request_id,filename,mime_type,byte_size,sha256,uploader_membership_id,initial_visibility,visibility,object_key,status,lease_until) VALUES('file','a',?,'test.txt','text/plain',1,?,'m-ellen','internal','internal','test-key','uploading',?)",crypto.randomUUID(),'a'.repeat(64),NOW.toISOString());
    run(t.raw,"INSERT INTO asset_links(asset_id,workspace_id,project_id) VALUES('file','a',?)",t.projectId);
  }
  const before=t.state();assert.equal((await t.generate()).ok,false);assert.deepEqual(t.state(),before);
});

for(const field of ['projectRevision','bindingRevision','bindingId','templateVersionId','definitionHash']) test(`stale ${field} conflicts`,async ctx=>{
  const t=await fixture(ctx),before=t.state(),expected={...t.input.expected};
  expected[field]=field.endsWith('Revision')?expected[field]+1:field==='definitionHash'?'f'.repeat(64):'missing';
  assert.deepEqual(await t.generate({expected}),{ok:false,reason:'conflict'});assert.deepEqual(t.state(),before);
});

for(const patch of [{requestId:'bad'},{expected:undefined},{expected:{}},{selectedComponentKeys:[]},{selectedComponentKeys:['funnel','funnel']},
  {selectedComponentKeys:['unknown']},{plan:{}},{definition:GHL_BUILD_BLUEPRINT_V1}]) test(`invalid generation input ${JSON.stringify(Object.keys(patch))}`,async ctx=>{
  const t=await fixture(ctx),before=t.state();assert.equal((await t.generate(patch)).ok,false);assert.deepEqual(t.state(),before);
});

for(const race of ['same','request','selection']) test(`concurrent generation ${race} has one committed winner`,async ctx=>{
  const t=await fixture(ctx),other=race==='request'?{requestId:crypto.randomUUID()}:race==='selection'?{selectedComponentKeys:['forms']}:{};
  const results=await Promise.all([t.generate(),t.generate(other)]);
  assert.equal(results.filter(r=>r.ok&&!r.replayed).length,1);assert.equal(results.filter(r=>r.ok).length,race==='same'?2:1);
  assert.equal(all(t.raw,'SELECT * FROM systems_blueprint_generations').length,1);assert.equal(all(t.raw,'SELECT * FROM actions').length,1);
  assert.equal(all(t.raw,"SELECT * FROM activity_events WHERE event_type='PROJECT_BLUEPRINT_GENERATED'").length,1);
});

for(const change of ["UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'",
  "UPDATE workspace_memberships SET role='team_member' WHERE id='m-ellen'", "UPDATE workspaces SET status='suspended' WHERE id='a'",
  'UPDATE service_type_blueprint_bindings SET enabled=0,revision=revision+1',"UPDATE projects SET status='ready'",
  "UPDATE service_types SET active=0",'UPDATE templates SET active=0']) test(`commit rechecks changed authority/context: ${change}`,async ctx=>{
  const t=await fixture(ctx);t.beforeCommit(()=>run(t.raw,change));assert.equal((await t.generate()).ok,false);
  for(const table of ['systems_blueprint_generations','systems_blueprint_generation_items','actions','milestones','deliverables'])assert.equal(all(t.raw,`SELECT * FROM ${table}`).length,0);
  assert.equal(all(t.raw,"SELECT * FROM activity_events WHERE event_type='PROJECT_BLUEPRINT_GENERATED'").length,0);
});

test('new manual work before commit wins without stray generated work',async ctx=>{
  const t=await fixture(ctx);t.beforeCommit(()=>run(t.raw,"INSERT INTO actions(id,workspace_id,project_id,creation_request_id,title) VALUES('manual','a',?,?,'Manual')",t.projectId,crypto.randomUUID()));
  assert.deepEqual(await t.generate(),{ok:false,reason:'conflict'});assert.equal(all(t.raw,'SELECT * FROM actions').length,1);assert.equal(all(t.raw,'SELECT * FROM systems_blueprint_generations').length,0);
});

test('late dependency failure rolls back receipt, work and all mappings',async ctx=>{
  const t=await fixture(ctx),before=t.state();t.raw.exec("CREATE TRIGGER generation_test_abort BEFORE INSERT ON action_dependencies BEGIN SELECT RAISE(ABORT,'late generation failure'); END;");
  await assert.rejects(()=>t.generate({selectedComponentKeys:['discovery','funnel']}),/late generation failure/);assert.deepEqual(t.state(),before);
});

test('a resolved zero-write batch is not generation success',async ctx=>{
  const t=await fixture(ctx),before=t.state();t.db.batch=async()=>[];
  assert.deepEqual(await t.generate(),{ok:false,reason:'conflict'});assert.deepEqual(t.state(),before);
});

test('complete receipt/mappings without the Project revision update are not success',async ctx=>{
  const t=await fixture(ctx),batch=t.db.batch.bind(t.db);t.db.batch=queries=>batch(queries.slice(0,-1));
  assert.deepEqual(await t.generate(),{ok:false,reason:'integrity_failure'});
  const before=t.state();assert.deepEqual(await t.generate(),{ok:false,reason:'integrity_failure'});assert.deepEqual(t.state(),before);
});

test('late event insertion failure rolls back all generated facts',async ctx=>{
  const t=await fixture(ctx),before=t.state();t.raw.exec("CREATE TRIGGER generation_event_abort BEFORE INSERT ON activity_events WHEN NEW.event_type='PROJECT_BLUEPRINT_GENERATED' BEGIN SELECT RAISE(ABORT,'late event failure'); END;");
  await assert.rejects(()=>t.generate(),/late event failure/);assert.deepEqual(t.state(),before);
});

test('replay survives live deletion and later configuration/status changes without regeneration',async ctx=>{
  const t=await fixture(ctx),first=await t.generate();assert.equal(first.ok,true);
  run(t.raw,'DELETE FROM actions');run(t.raw,'DELETE FROM milestones');run(t.raw,'DELETE FROM deliverables');
  run(t.raw,"UPDATE projects SET status='in_progress',revision=revision+1");run(t.raw,'DELETE FROM service_type_blueprint_bindings');
  run(t.raw,"UPDATE template_versions SET status='retired'");const before=t.state();
  assert.deepEqual(await t.generate(),{...first,replayed:true});assert.deepEqual(t.state(),before);
});

test('partial immutable mappings are integrity failure, never repaired',async ctx=>{
  const t=await fixture(ctx);assert.equal((await t.generate()).ok,true);
  t.corrupt('systems_blueprint_generation_items_delete_guard',"DELETE FROM systems_blueprint_generation_items WHERE kind='action'");
  const before=t.state();assert.deepEqual(await t.generate(),{ok:false,reason:'integrity_failure'});assert.deepEqual(t.state(),before);
});

test('receipt hash corruption is integrity failure',async ctx=>{
  const t=await fixture(ctx);await t.generate();t.corrupt('systems_blueprint_generations_update_guard','UPDATE systems_blueprint_generations SET plan_hash=?','f'.repeat(64));
  const before=t.state();assert.deepEqual(await t.generate(),{ok:false,reason:'integrity_failure'});assert.deepEqual(t.state(),before);
});

test('replay rechecks current Project authority',async ctx=>{
  const t=await fixture(ctx);await t.generate();run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");
  const before=t.state();assert.equal((await t.generate()).ok,false);assert.deepEqual(t.state(),before);
});

test('generation activity uses internal history without exposing receipt metadata or Client access',async ctx=>{
  const t=await fixture(ctx),result=await t.generate();
  const history=await projectActivity(t.db,t.owner,t.projectId);
  assert.equal(history.filter(e=>e.title==='Systems work generated').length,1);
  assert.equal(JSON.stringify(history).includes(result.generationId),false);
  assert.deepEqual(await projectActivity(t.db,await t.actor('james'),t.projectId),[]);
});

test('a lost response after a committed batch is safely resolved by caller retry',async ctx=>{
  const t=await fixture(ctx),batch=t.db.batch.bind(t.db);
  t.db.batch=async statements=>{await batch(statements);throw new Error('response lost');};
  await assert.rejects(()=>t.generate(),/response lost/);t.db.batch=batch;const before=t.state();
  const result=await t.generate();assert.equal(result.ok,true);assert.equal(result.replayed,true);assert.deepEqual(t.state(),before);
});

test('a valid custom GHL definition reaches the 49-edge bound in the same transaction',async ctx=>{
  const t=await fixture(ctx),definition=structuredClone(GHL_BUILD_BLUEPRINT_V1),keys=definition.actions.map(a=>a.logicalKey);
  definition.dependencyGroups=[keys.slice(0,7),keys.slice(7)];const encoded=await encodeSystemsBlueprintDefinition(definition);
  run(t.raw,"UPDATE template_versions SET status='retired'");
  run(t.raw,"INSERT INTO template_versions(id,workspace_id,template_id,version_number,definition_json,definition_hash) VALUES('max-edges','a',?,2,?,?)",t.templateId,encoded.definitionJson,encoded.definitionHash);
  run(t.raw,"UPDATE template_versions SET status='published',published_at=? WHERE id='max-edges'",NOW.toISOString());
  t.input.expected=(await t.options()).expected;
  const result=await t.generate({selectedComponentKeys:definition.components.map(c=>c.logicalKey)});assert.equal(result.ok,true);assert.equal(result.counts.dependencies,49);
  assert.equal(all(t.raw,'SELECT * FROM action_dependencies').length,49);
});
