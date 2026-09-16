// N1H canonical writers on disposable native D1; no remote resources.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_projects.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {readClientEdit,saveClientEdit} from '../lib/bloomops/client-edit.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'client-edit-native'}}));
const t=await setup(),checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding);
 for(const f of migrationFiles())for(const stmt of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await binding.prepare(stmt).run();
 for(const table of ['workspaces','user','workspace_memberships','departments','service_types','bloomops_clients','client_contacts','service_engagements'])for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 check('shipped native schema has enforced foreign keys',(await binding.prepare('PRAGMA foreign_keys').first()).foreign_keys===1);
 const input=async(patch={})=>({editorScope:{userId:'ellen',workspaceId:'a'},expected:await readClientEdit(db,t.owner,'james'),...patch});
 const events=async()=>(await binding.prepare('SELECT * FROM activity_events ORDER BY rowid').all()).results;
 const original=await input(),race=await Promise.all(['Native winner A','Native winner B'].map(name=>saveClientEdit(db,t.owner,'james',{...original,name})));
 check('concurrent native editors have one winner and one conflict',race.filter(r=>r.ok).length===1&&race.filter(r=>r.reason==='conflict').length===1);
 const saved=await readClientEdit(db,t.owner,'james'),history=await events();check('one native winner records exactly one change',history.length===1);
 check('stale retry cannot overwrite or add history',(await saveClientEdit(db,t.owner,'james',{...original,name:saved.name})).reason==='conflict'&&JSON.stringify(await events())===JSON.stringify(history));
 check('current no-op is quiet',(await saveClientEdit(db,t.owner,'james',await input({name:saved.name}))).unchanged===true&&JSON.stringify(await events())===JSON.stringify(history));
 await binding.prepare("CREATE TRIGGER reject_client_edit BEFORE UPDATE ON bloomops_clients BEGIN SELECT RAISE(ABORT,'synthetic rollback'); END").run();
 let failed=false;try{await saveClientEdit(db,t.owner,'james',await input({name:'Must roll back'}));}catch{failed=true;}await binding.prepare('DROP TRIGGER reject_client_edit').run();
 check('native source failure rolls back its earlier activity insert',failed&&(await readClientEdit(db,t.owner,'james')).name===saved.name&&JSON.stringify(await events())===JSON.stringify(history));
 const originalBatch=db.batch.bind(db);db.batch=async statements=>{await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();return originalBatch(statements);};
 const revoked=await saveClientEdit(db,t.owner,'james',await input({name:'No longer authorized'}));
 check('revocation between read and actual batch yields zero rows and no activity',!revoked.ok&&JSON.stringify(await events())===JSON.stringify(history)&&(await binding.prepare("SELECT name FROM bloomops_clients WHERE id='james'").first()).name===saved.name);
 db.batch=originalBatch;check('revoked actor cannot recover private input',await readClientEdit(db,t.owner,'james')===null);
 check('native foreign-key integrity remains clean',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 console.log(JSON.stringify({checks:checks.length,exitCode:0,names:checks}));
}finally{t.raw.close();await mf.dispose();}
