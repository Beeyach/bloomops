import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { setup } from './_projects.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import * as schema from '../lib/bloomops/schema.mjs';
import { provisionGhlBlueprint, getSystemsBlueprintBinding, saveSystemsBlueprintBinding } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { encodeSystemsBlueprintDefinition } from '../lib/bloomops/systems-blueprint-definition.mjs';
import { GHL_BUILD_BLUEPRINT_V1 } from '../lib/bloomops/systems-blueprint-defaults.mjs';

const now = new Date('2026-09-12T07:00:00.000Z');
const state = t => ['templates','template_versions','service_type_blueprint_bindings'].map(table => all(t.raw,`SELECT * FROM ${table} ORDER BY id`));
async function fixture(ctx) {
  const t = await setup();ctx.after(() => t.raw.close());
  t.provision = (actor=t.owner) => provisionGhlBlueprint(t.db,{ actor, now });
  t.read = (actor=t.owner,serviceTypeId='type-systems') => getSystemsBlueprintBinding(t.db,{actor,serviceTypeId});
  t.save = (patch={}) => saveSystemsBlueprintBinding(t.db,{actor:t.owner,serviceTypeId:'type-systems',templateId:t.templateId,enabled:true,expectedBinding:null,now,...patch});
  t.install = async () => {const r=await t.provision();assert.equal(r.ok,true);t.templateId=r.templateId;t.versionId=r.versionId;return r;};
  t.grant = who => run(t.raw,"INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES('a',?,'templates.manage')",`m-${who}`);
  t.beforeWrite = (pattern,fn) => {
    let fired=false;
    const d1={...t.d1,prepare(sql) {
      const wrap=s=>new Proxy(s,{get(target,key) {
        if(key==='bind')return (...args)=>wrap(s.bind(...args));
        if(['all','raw','run'].includes(key))return (...args)=>{if(!fired&&pattern.test(sql)){fired=true;fn();}return s[key](...args);};
        return target[key];
      }});
      return wrap(t.d1.prepare(sql));
    }};
    t.db=drizzle(d1,{schema});return ()=>assert.equal(fired,true,'interleaving was exercised');
  };
  return t;
}

test('default provisioning publishes the exact manifest; replay is immutable and unbound',async ctx=>{
  const t=await fixture(ctx),first=await t.install(),before=state(t),encoded=await encodeSystemsBlueprintDefinition(GHL_BUILD_BLUEPRINT_V1);
  const stored=one(t.raw,'SELECT * FROM template_versions WHERE id=?',first.versionId);
  assert.equal(stored.status,'published');assert.equal(stored.version_number,1);
  assert.equal(stored.definition_json,encoded.definitionJson);assert.equal(stored.definition_hash,encoded.definitionHash);
  assert.equal(stored.published_at,now.toISOString());assert.equal(stored.created_by_membership_id,'m-ellen');
  assert.deepEqual(await t.provision(),{...first,unchanged:true});assert.deepEqual(state(t),before);
  assert.deepEqual(await t.read(),{ok:true,binding:null});
  assert.equal(one(t.raw,'SELECT count(*) n FROM projects').n,0);
});

for(const who of ['ellen','ary','pm','sam','james','foreign']) test(`live templates.manage controls ${who}`,async ctx=>{
  const t=await fixture(ctx);await t.install();const actor=await t.actor(who),before=state(t);
  const allowed=['ellen','ary'].includes(who);
  const r=await t.save({actor});assert.equal(r.ok,allowed);
  if(!allowed)assert.deepEqual(state(t),before);
  if(['pm','sam'].includes(who)) {
    t.grant(who);assert.equal((await t.save({actor})).ok,true,'fresh grant works without trusting cached capabilities');
    const bound=state(t);run(t.raw,"DELETE FROM member_capabilities WHERE membership_id=?",actor.membershipId);
    assert.deepEqual(await t.read(actor),{ok:false,reason:'forbidden'});assert.equal((await t.provision(actor)).ok,false);assert.deepEqual(state(t),bound);
  }
});

test('a Client with a forged capability row/actor remains denied',async ctx=>{
  const t=await fixture(ctx);t.grant('james');const actor=await t.actor('james');actor.capabilities=new Set(['templates.manage']);
  assert.deepEqual(await t.provision(actor),{ok:false,reason:'forbidden'});assert.equal(state(t)[0].length,0);
});

for(const change of ["UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'",
  "UPDATE workspace_memberships SET role='team_member' WHERE id='m-ellen'",
  "UPDATE workspaces SET status='suspended' WHERE id='a'"]) test(`stale actor denied: ${change}`,async ctx=>{
  const t=await fixture(ctx);await t.install();run(t.raw,change);const before=state(t);
  assert.deepEqual(await t.read(),{ok:false,reason:'forbidden'});assert.deepEqual(await t.provision(),{ok:false,reason:'forbidden'});
  assert.deepEqual(await t.save(),{ok:false,reason:'forbidden'});assert.deepEqual(state(t),before);
});

for(const variant of ['empty','draft','retired','inactive','changed_hash','extra_version']) test(`default ${variant} history conflicts without repair`,async ctx=>{
  const t=await fixture(ctx);
  if(['empty','draft','changed_hash'].includes(variant)) {
    run(t.raw,"INSERT INTO templates(id,workspace_id,kind,name,slug) VALUES('reserved','a','systems','Existing','ghl-build')");
    if(variant!=='empty') {
      const e=await encodeSystemsBlueprintDefinition(GHL_BUILD_BLUEPRINT_V1);
      run(t.raw,"INSERT INTO template_versions(id,workspace_id,template_id,version_number,definition_json,definition_hash) VALUES('existing','a','reserved',1,?,?)",e.definitionJson,variant==='changed_hash'?'bad':e.definitionHash);
      if(variant==='changed_hash')run(t.raw,"UPDATE template_versions SET status='published',published_at=? WHERE id='existing'",now.toISOString());
    }
  } else {
    await t.install();
    if(variant==='retired')run(t.raw,"UPDATE template_versions SET status='retired' WHERE id=?",t.versionId);
    if(variant==='inactive')run(t.raw,'UPDATE templates SET active=0 WHERE id=?',t.templateId);
    if(variant==='extra_version')run(t.raw,"INSERT INTO template_versions(id,workspace_id,template_id,version_number,definition_json,definition_hash) VALUES('extra','a',?,2,'{}','bad')",t.templateId);
  }
  const before=state(t);assert.deepEqual(await t.provision(),{ok:false,reason:'conflict'});assert.deepEqual(state(t),before);
});

test('concurrent default provisioning converges without partial versions',async ctx=>{
  const t=await fixture(ctx);const results=await Promise.all([t.provision(),t.provision(),t.provision()]);
  assert.ok(results.every(r=>r.ok));assert.equal(new Set(results.map(r=>r.versionId)).size,1);
  assert.equal(results.filter(r=>!r.unchanged).length,1);assert.equal(state(t)[0].length,1);assert.equal(state(t)[1].length,1);
});

test('late publication failure rolls back template and version together',async ctx=>{
  const t=await fixture(ctx);t.raw.exec("CREATE TRIGGER setup_test_abort BEFORE UPDATE ON template_versions BEGIN SELECT RAISE(ABORT,'late setup failure'); END;");
  const before=state(t);await assert.rejects(()=>t.provision(),/late setup failure/);assert.deepEqual(state(t),before);
});

test('capability revocation before provisioning batch leaves no rows',async ctx=>{
  const t=await fixture(ctx);t.grant('pm');const actor=await t.actor('pm');const original=t.db.batch.bind(t.db);
  t.db.batch=async queries=>{run(t.raw,"DELETE FROM member_capabilities WHERE membership_id='m-pm'");return original(queries);};
  assert.deepEqual(await t.provision(actor),{ok:false,reason:'forbidden'});assert.equal(state(t)[0].length,0);assert.equal(state(t)[1].length,0);
});

test('explicit binding create, no-op and CAS update preserve attribution correctly',async ctx=>{
  const t=await fixture(ctx);await t.install();const made=await t.save();assert.equal(made.ok,true);assert.equal(made.binding.revision,1);
  const before=state(t),expectedBinding={id:made.binding.id,revision:1};
  const replay=await t.save({expectedBinding,now:new Date('2026-09-13T00:00:00Z')});assert.equal(replay.unchanged,true);assert.deepEqual(state(t),before);
  const changed=await t.save({expectedBinding,enabled:false,actor:await t.actor('ary')});assert.equal(changed.ok,true);assert.equal(changed.binding.revision,2);
  assert.equal(changed.binding.createdByMembershipId,'m-ellen');assert.equal(changed.binding.updatedByMembershipId,'m-ary');
  assert.deepEqual(await t.save({expectedBinding}),{ok:false,reason:'conflict'});
});

test('concurrent binding create and update each have one winner',async ctx=>{
  const t=await fixture(ctx);await t.install();const results=await Promise.all([t.save(),t.save()]);
  assert.equal(results.filter(r=>r.ok).length,1);const current=results.find(r=>r.ok).binding;
  const expectedBinding={id:current.id,revision:1};const updates=await Promise.all([t.save({expectedBinding,enabled:false}),t.save({expectedBinding,enabled:false})]);
  assert.equal(updates.filter(r=>r.ok).length,1);assert.equal((await t.read()).binding.revision,2);
});

for(const patch of [{expectedBinding:undefined},{expectedBinding:{}},{expectedBinding:{id:'x',revision:0}},
  {expectedBinding:{id:'x',revision:1,extra:true}},{enabled:1},{serviceTypeId:''},{templateId:'bad\0id'},
  {now:new Date('invalid')}]) test(`invalid setup input ${JSON.stringify(patch)}`,async ctx=>{
  const t=await fixture(ctx);await t.install();const before=state(t);assert.deepEqual(await t.save(patch),{ok:false,reason:'invalid'});assert.deepEqual(state(t),before);
});

for(const change of ["UPDATE service_types SET active=0 WHERE id='type-systems'",
  "UPDATE departments SET active=0 WHERE id='systems'","UPDATE departments SET slug='renamed' WHERE id='systems'"]) test(`relational eligibility is enforced: ${change}`,async ctx=>{
  const t=await fixture(ctx);await t.install();run(t.raw,change);assert.deepEqual(await t.save(),{ok:false,reason:'not_found'});
});

test('labels grant nothing; foreign and onboarding targets are inaccessible',async ctx=>{
  const t=await fixture(ctx);await t.install();
  run(t.raw,"UPDATE service_types SET name='GHL build' WHERE id='type-social'");
  for(const serviceTypeId of ['type-social','type-foreign-dept','missing'])assert.deepEqual(await t.save({serviceTypeId}),{ok:false,reason:'not_found'});
  for(const [templateId,workspace,kind] of [['foreign-template','b','systems'],['onboarding-template','a','onboarding']]) {
    run(t.raw,'INSERT INTO templates(id,workspace_id,kind,name,slug) VALUES(?,?,?,?,?)',templateId,workspace,kind,'GHL build','test');
    assert.deepEqual(await t.save({templateId}),{ok:false,reason:'not_found'});
  }
});

test('inactive/unpublished Systems targets remain valid configuration',async ctx=>{
  const t=await fixture(ctx);run(t.raw,"INSERT INTO templates(id,workspace_id,kind,name,slug,active) VALUES('target','a','systems','Draft','draft',0)");
  assert.equal((await t.save({templateId:'target',enabled:false})).ok,true);
});

test('deleted/recreated binding cannot satisfy old ID and revision',async ctx=>{
  const t=await fixture(ctx);await t.install();const first=await t.save();run(t.raw,'DELETE FROM service_type_blueprint_bindings WHERE id=?',first.binding.id);
  const second=await t.save();assert.notEqual(second.binding.id,first.binding.id);
  assert.deepEqual(await t.save({expectedBinding:{id:first.binding.id,revision:1},enabled:false}),{ok:false,reason:'conflict'});
});

for(const mode of ['create','update']) for(const revoke of ['capability','service','workspace']) test(`${mode} commit rechecks ${revoke}`,async ctx=>{
  const t=await fixture(ctx);await t.install();t.grant('pm');const actor=await t.actor('pm');
  const current=mode==='update'?(await t.save()).binding:null;
  const before=state(t);const done=t.beforeWrite(mode==='create'?/^insert into "service_type_blueprint_bindings"/i:/^update "service_type_blueprint_bindings"/i,()=>{
    run(t.raw,{capability:"DELETE FROM member_capabilities WHERE membership_id='m-pm'",service:"UPDATE service_types SET active=0 WHERE id='type-systems'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'"}[revoke]);
  });
  assert.deepEqual(await t.save({actor,enabled:false,expectedBinding:current?{id:current.id,revision:current.revision}:null}),{ok:false,reason:'conflict'});
  done();assert.deepEqual(state(t),before);
});

test('binding revision overflow fails closed',async ctx=>{
  const t=await fixture(ctx);await t.install();const current=(await t.save()).binding;
  const trigger=one(t.raw,"SELECT sql FROM sqlite_master WHERE name='service_type_blueprint_bindings_update_guard'").sql;
  t.raw.exec('DROP TRIGGER service_type_blueprint_bindings_update_guard');
  run(t.raw,'UPDATE service_type_blueprint_bindings SET revision=? WHERE id=?',Number.MAX_SAFE_INTEGER,current.id);t.raw.exec(trigger);
  const before=state(t);assert.deepEqual(await t.save({expectedBinding:{id:current.id,revision:Number.MAX_SAFE_INTEGER},enabled:false}),{ok:false,reason:'conflict'});assert.deepEqual(state(t),before);
});
