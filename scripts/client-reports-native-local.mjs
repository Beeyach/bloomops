// Native disposable D1 only. No user config, credentials, shared bindings or data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_work-projections.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {input,draft,observation} from '../tests/_client-report-fixture.mjs';
import {saveClientReport as save,getClientReport as get} from '../lib/bloomops/client-reports.mjs';
import {checkEquivalentRetries,checkConcurrentRetries} from '../tests/_client-report-retry.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'n3a-upgrade',FRESH:'n3a-fresh'}}));
const t=await setup(),checks=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
try{
 const binding=await mf.getD1Database('DB'),fresh=await mf.getD1Database('FRESH');const files=migrationFiles();assert.equal(files.at(-1).tag,'0047_gigantic_famine');
 const migrate=async(db,files)=>{for(const file of files)for(const stmt of readFileSync(file.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(stmt).run();};
 await migrate(binding,files.slice(0,-1));
 const tables=['workspaces','user','workspace_memberships','departments','service_types','bloomops_clients','client_contacts','service_engagements','projects'];
 for(const table of tables)for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 const before=await Promise.all(tables.map(async table=>(await binding.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
 await migrate(binding,files.slice(-1));await migrate(fresh,files);
 const after=await Promise.all(tables.map(async table=>(await binding.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));check('populated base upgrade preserves every prior fixture row',JSON.stringify(before)===JSON.stringify(after));
 const schema=async db=>(await db.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()).results;check('fresh and populated upgrade schema match',JSON.stringify(await schema(binding))===JSON.stringify(await schema(fresh)));
 const db=bloomOpsDb(binding),v=input({draft:draft({metrics:{sent:observation(3),delivered:observation(2)}})});
 const results=await Promise.all([save(db,t.owner,'james',null,v),save(db,t.owner,'james',null,v)]);check('native concurrent create retries return one draft',results.every(r=>r.ok)&&results[0].id===results[1].id);const id=results[0].id;check('native persisted calculated preview', (await get(db,t.owner,'james',id)).calculations[0].display==='66.67%');
 const writes=await Promise.all([save(db,t.owner,'james',id,{...v,expectedRevision:1}),save(db,t.owner,'james',id,{...v,expectedRevision:1,draft:draft({title:'Concurrent edit'})})]);check('native concurrent edits have exactly one winner',writes.filter(r=>r.ok).length===1&&writes.filter(r=>r.reason==='conflict').length===1);
 const saved=await get(db,t.owner,'james',id);
 await binding.prepare("CREATE TRIGGER report_ignore BEFORE UPDATE ON client_report_drafts BEGIN SELECT RAISE(IGNORE); END").run();check('zero-row header update returns conflict',(await save(db,t.owner,'james',id,{...v,expectedRevision:saved.revision})).reason==='conflict');check('zero-row preserves complete draft',JSON.stringify(await get(db,t.owner,'james',id))===JSON.stringify(saved));await binding.prepare('DROP TRIGGER report_ignore').run();
 await binding.prepare("CREATE TRIGGER report_failure BEFORE INSERT ON client_report_metrics BEGIN SELECT RAISE(ABORT,'synthetic failure'); END").run();await assert.rejects(save(db,t.owner,'james',id,{...v,expectedRevision:saved.revision}));check('native failed child insert rolls back header and observations',JSON.stringify(await get(db,t.owner,'james',id))===JSON.stringify(saved));await binding.prepare('DROP TRIGGER report_failure').run();
 const raw=await binding.prepare('SELECT * FROM client_report_drafts WHERE id=?').bind(id).first();const copy=async patch=>{const row={...raw,id:crypto.randomUUID(),request_id:crypto.randomUUID(),...patch};return binding.prepare(`INSERT INTO client_report_drafts(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();};
 for(const [name,patch] of [['wrong Client Service tuple',{service_engagement_id:'kajabi-service'}],['foreign workspace',{workspace_id:'b'}],['foreign creator membership',{creator_membership_id:'m-foreign'}]]){await assert.rejects(copy(patch),/FOREIGN KEY/);check('native FK rejects '+name,true);}
 await assert.rejects(binding.prepare('UPDATE client_report_drafts SET template_id=? WHERE id=?').bind('social',id).run(),/immutable/);check('native template and parent identity immutable',true);
 await assert.rejects(binding.prepare("UPDATE client_report_metrics SET state='value',value=-1 WHERE report_id=?").bind(id).run(),/CHECK/);check('native negative counts rejected',true);
 for(const template of ['ghl_campaign','social']) {
  await checkEquivalentRetries(db,t.owner,template);check(template+' native reordered retries, changed-intent conflicts and separate UUIDs',true);
  await checkConcurrentRetries(db,t.owner,template);check(template+' native concurrent reordered retries persist exactly one draft',true);
 }
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();check('native revocation hides report from old actor',await get(db,t.owner,'james',id)===null);check('native revocation refuses save',!(await save(db,t.owner,'james',id,{...v,expectedRevision:saved.revision})).ok);
 check('native final FK integrity',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 console.log(JSON.stringify({checks:checks.length,names:checks,exitCode:0}));
}finally{t.raw.close();await mf.dispose();}
