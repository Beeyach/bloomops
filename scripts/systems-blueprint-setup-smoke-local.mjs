// Actual setup functions over disposable native D1. No account or remote writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { seedStatements } from '../tests/_blueprint-generation-fixture.mjs';
import { provisionGhlBlueprint, getSystemsBlueprintBinding, saveSystemsBlueprintBinding } from '../lib/bloomops/systems-blueprint-setup.mjs';

const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
const migrations=journal.entries.flatMap(({tag})=>readFileSync(new URL(`../drizzle/${tag}.sql`,import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean));
const temp=mkdtempSync(join(tmpdir(),'bloomops-d2-2d-smoke-'));let mf,checks=0;
const now=new Date('2026-09-12T07:00:00.000Z');
try {
  mf=new Miniflare(convertV4MiniflareOptions({name:'bloomops-d2-2d-disposable',modules:true,script:'export default {fetch(){return new Response("Local setup");}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{OFF:'off',ON:'on'},resourcePersistencePath:temp}));
  for(const [name,recursive] of [['OFF',0],['ON',1]]) {
    const native=await mf.getD1Database(name);
    for(const sql of migrations)await native.prepare(sql).run();
    await native.prepare(`PRAGMA recursive_triggers=${recursive}`).run();
    for(const s of seedStatements)await native.prepare(s.sql).bind(...s.params).run();
    await native.prepare("INSERT INTO departments(id,workspace_id,name,slug) VALUES('systems','w','Systems','systems')").run();
    await native.prepare("UPDATE service_types SET department_id='systems' WHERE id='type'").run();
    await native.prepare("UPDATE workspace_memberships SET role='owner' WHERE id IN ('member','foreign-member')").run();
    await native.prepare("INSERT INTO user(id,name,email) VALUES('pm','Manager','pm@example.test')").run();
    await native.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('pm','w','pm','project_manager','active')").run();
    await native.prepare("INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES('w','pm','templates.manage')").run();
    let maxBindings=0;
    const counted={prepare(sql) {
      assert.ok(Buffer.byteLength(sql)<=100000);
      const wrap=s=>new Proxy(s,{get(target,key) {
        if(key==='bind')return (...params)=>{maxBindings=Math.max(maxBindings,params.length);assert.ok(params.length<=100);return wrap(s.bind(...params));};
        return typeof target[key]==='function'?target[key].bind(target):target[key];
      }});
      return wrap(native.prepare(sql));
    },batch:queries=>native.batch(queries)};
    const db=drizzle(counted,{schema});
    const actor={workspaceId:'w',membershipId:'member',userId:'user',role:'owner',status:'active'};
    const pm={...actor,membershipId:'pm',userId:'pm',role:'project_manager'};
    const provision=who=>provisionGhlBlueprint(db,{actor:who||actor,now});
    const race=await Promise.all([provision(),provision(),provision()]);
    assert.ok(race.every(r=>r.ok));assert.equal(new Set(race.map(r=>r.versionId)).size,1);assert.equal(race.filter(r=>!r.unchanged).length,1);checks++;
    const templateId=race[0].templateId;
    const save=patch=>saveSystemsBlueprintBinding(db,{actor,serviceTypeId:'type',templateId,enabled:true,expectedBinding:null,now,...patch});
    // The shared storage fixture has an existing binding; setup must refuse it.
    assert.deepEqual(await save(),{ok:false,reason:'conflict'});checks++;
    await native.prepare("DELETE FROM service_type_blueprint_bindings WHERE id='binding'").run();
    const creates=await Promise.all([save(),save()]);assert.equal(creates.filter(r=>r.ok).length,1);checks++;
    const current=creates.find(r=>r.ok).binding,expectedBinding={id:current.id,revision:1};
    const snapshot=()=>native.prepare('SELECT * FROM service_type_blueprint_bindings ORDER BY id').all().then(r=>r.results);
    const before=await snapshot();assert.equal((await save({expectedBinding})).unchanged,true);assert.deepEqual(await snapshot(),before);checks++;
    const updates=await Promise.all([save({expectedBinding,enabled:false}),save({expectedBinding,enabled:false})]);
    assert.equal(updates.filter(r=>r.ok).length,1);assert.equal((await getSystemsBlueprintBinding(db,{actor,serviceTypeId:'type'})).binding.revision,2);checks++;
    assert.deepEqual(await save({expectedBinding,enabled:false}),{ok:false,reason:'conflict'});checks++;
    assert.equal((await provision(pm)).ok,true);checks++;
    await native.prepare("DELETE FROM member_capabilities WHERE membership_id='pm'").run();
    assert.deepEqual(await provision(pm),{ok:false,reason:'forbidden'});checks++;
    assert.deepEqual(await provision({...actor,role:'client'}),{ok:false,reason:'forbidden'});checks++;
    const unchanged=await snapshot();
    await native.prepare("UPDATE service_types SET active=0 WHERE id='type'").run();
    assert.deepEqual(await save({expectedBinding:{id:current.id,revision:2}}),{ok:false,reason:'not_found'});assert.deepEqual(await snapshot(),unchanged);checks++;
    await native.prepare("UPDATE service_types SET active=1 WHERE id='type'").run();
    const originalBatch=db.batch.bind(db);
    db.batch=async queries=>{await native.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='member'").run();return originalBatch(queries);};
    assert.deepEqual(await provision(),{ok:false,reason:'forbidden'});checks++;
    db.batch=originalBatch;
    await native.prepare("CREATE TRIGGER setup_smoke_abort BEFORE UPDATE ON template_versions WHEN NEW.workspace_id='other' BEGIN SELECT RAISE(ABORT,'late setup failure'); END").run();
    const foreignUser=(await native.prepare("SELECT user_id FROM workspace_memberships WHERE id='foreign-member'").first()).user_id;
    const beforeTemplates=(await native.prepare('SELECT * FROM templates ORDER BY id').all()).results;
    await assert.rejects(()=>provision({workspaceId:'other',membershipId:'foreign-member',userId:foreignUser,role:'owner',status:'active'}),/late setup failure/);
    assert.deepEqual((await native.prepare('SELECT * FROM templates ORDER BY id').all()).results,beforeTemplates);checks++;
    assert.deepEqual((await native.prepare('PRAGMA foreign_key_check').all()).results,[]);checks++;
    console.log(`ok recursive_triggers=${recursive}: actual domain provisioning, CAS, authority and rollback; max ${maxBindings} bindings`);
  }
  console.log(`D2 2D native setup: ${checks} checks passed.`);
} finally {await mf?.dispose();rmSync(temp,{recursive:true,force:true});}
