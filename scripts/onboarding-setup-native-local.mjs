// Disposable native D1 only; no shared environment or database configuration.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_work-projections.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {onboardingSetup,installOnboardingDefaults,manageOnboardingSetup} from '../lib/bloomops/onboarding-setup.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'onboarding-setup-local'}}));
const t=await setup();
try{const binding=await mf.getD1Database('DB');for(const f of migrationFiles())for(const sql of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await binding.prepare(sql).run();
 for(const table of ['workspaces','user','workspace_memberships'])for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 const db=bloomOpsDb(binding),command={workspaceId:'a',userId:'ellen',categories:['common','ghl']};
 const result=await Promise.all([installOnboardingDefaults(db,t.owner,command),installOnboardingDefaults(db,t.owner,command)]);assert.ok(result.every(r=>r.complete));assert.equal((await binding.prepare('SELECT count(*) n FROM template_versions').first()).n,2);console.log('PASS concurrent installation creates one version per selected category');
 // Query timing/engine metadata is not persisted template state. Compare every
 // stored column, while retaining success checks on both native reads.
 const before=await binding.prepare('SELECT * FROM template_versions ORDER BY id').all();assert.equal(before.success,true);await installOnboardingDefaults(db,t.owner,command);const after=await binding.prepare('SELECT * FROM template_versions ORDER BY id').all();assert.equal(after.success,true);assert.deepEqual(after.results,before.results);console.log('PASS retries preserve published versions');

 const state=await onboardingSetup(db,t.owner);let item=state.items.find(i=>i.slug==='common');
 const action=(item,fields)=>manageOnboardingSetup(db,t.owner,{workspaceId:'a',userId:'ellen',slug:item.slug,reviewToken:item.reviewToken,...fields});
 const definition=structuredClone(item.versions[0].definition);definition.items[0].instructions='Reviewed native recovery instructions.';
 const competing=await Promise.all([action(item,{action:'save_version',definition}),action(item,{action:'save_version',definition})]);assert.equal(competing.filter(r=>r.ok).length,1);console.log('PASS concurrent template revision accepts one reviewed state');
 item=(await onboardingSetup(db,t.owner)).items.find(i=>i.slug==='common');const prior=item.versions[1];
 assert.equal(item.versions[0].status,'draft');const published=await action(item,{action:'publish',versionId:item.versions[0].id});assert.ok(published.ok);item=published.items.find(i=>i.slug==='common');assert.equal(item.versions[0].status,'published');assert.equal(item.versions[1].status,'retired');assert.deepEqual(item.versions[1].definition,prior.definition);console.log('PASS explicit publication preserves immutable prior content');
 await binding.prepare('UPDATE templates SET active=0 WHERE id=?').bind(item.templateId).run();item=(await onboardingSetup(db,t.owner)).items.find(i=>i.slug==='common');assert.equal(item.state,'inactive');assert.ok((await action(item,{action:'enable'})).ok);console.log('PASS inactive template requires explicit enable');
 const snapshot=await binding.prepare('SELECT * FROM template_versions ORDER BY id').all();item=(await onboardingSetup(db,t.owner)).items.find(i=>i.slug==='common');
 await binding.prepare("CREATE TRIGGER refuse_revision BEFORE INSERT ON template_versions WHEN NEW.template_id IN (SELECT id FROM templates WHERE slug='common') BEGIN SELECT RAISE(ABORT,'synthetic refusal'); END").run();await assert.rejects(action(item,{action:'save_version',definition}));assert.deepEqual((await binding.prepare('SELECT * FROM template_versions ORDER BY id').all()).results,snapshot.results);console.log('PASS failed repair does not mutate existing publications');
 await binding.prepare("CREATE TRIGGER setup_failure BEFORE INSERT ON template_versions WHEN NEW.template_id IN (SELECT id FROM templates WHERE slug='social') BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();await assert.rejects(installOnboardingDefaults(db,t.owner,{...command,categories:['social']}));assert.equal((await binding.prepare("SELECT count(*) n FROM templates WHERE slug='social'").first()).n,0);console.log('PASS failed version creation rolls back new template');
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();assert.equal((await onboardingSetup(db,t.owner)).ok,false);assert.equal((await installOnboardingDefaults(db,t.owner,command)).ok,false);console.log('PASS current revocation blocks reads and writes');
 assert.equal((await binding.prepare('PRAGMA foreign_key_check').all()).results.length,0);console.log('PASS foreign key integrity; nine native checks');
}finally{t.raw.close();await mf.dispose();}
