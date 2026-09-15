// Disposable native D1 only; no shared environment or database configuration.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_work-projections.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {onboardingSetup,installOnboardingDefaults} from '../lib/bloomops/onboarding-setup.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'onboarding-setup-local'}}));
const t=await setup();
try{const binding=await mf.getD1Database('DB');for(const f of migrationFiles())for(const sql of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await binding.prepare(sql).run();
 for(const table of ['workspaces','user','workspace_memberships'])for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 const db=bloomOpsDb(binding),command={workspaceId:'a',userId:'ellen',categories:['common','ghl']};
 const result=await Promise.all([installOnboardingDefaults(db,t.owner,command),installOnboardingDefaults(db,t.owner,command)]);assert.ok(result.every(r=>r.complete));assert.equal((await binding.prepare('SELECT count(*) n FROM template_versions').first()).n,2);console.log('PASS concurrent installation creates one version per selected category');
 const before=await binding.prepare('SELECT * FROM template_versions ORDER BY id').all();await installOnboardingDefaults(db,t.owner,command);assert.deepEqual(await binding.prepare('SELECT * FROM template_versions ORDER BY id').all(),before);console.log('PASS retries preserve published versions');
 await binding.prepare("CREATE TRIGGER setup_failure BEFORE INSERT ON template_versions WHEN NEW.template_id IN (SELECT id FROM templates WHERE slug='social') BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();await assert.rejects(installOnboardingDefaults(db,t.owner,{...command,categories:['social']}));assert.equal((await binding.prepare("SELECT count(*) n FROM templates WHERE slug='social'").first()).n,0);console.log('PASS failed version creation rolls back new template');
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();assert.equal((await onboardingSetup(db,t.owner)).ok,false);assert.equal((await installOnboardingDefaults(db,t.owner,command)).ok,false);console.log('PASS current revocation blocks reads and writes');
 assert.equal((await binding.prepare('PRAGMA foreign_key_check').all()).results.length,0);console.log('PASS foreign key integrity; five native checks');
}finally{t.raw.close();await mf.dispose();}
