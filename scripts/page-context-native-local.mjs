// Disposable native D1. No credentials, project configuration or remote writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_projects.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {createWorkspacePage,saveWorkspacePage} from '../lib/bloomops/pages.mjs';
import {getPageRecordContext,savePageRecordContext} from '../lib/bloomops/page-record-context.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'page-context-upgrade',FRESH:'page-context-fresh'}}));
const t=await setup(),checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
try{
 const binding=await mf.getD1Database('DB'),fresh=await mf.getD1Database('FRESH'),db=bloomOpsDb(binding),files=migrationFiles(),boundary=files.findIndex(f=>f.tag==='0053_heavy_gunslinger');assert.ok(boundary>=0);
 const migrate=async(b,list)=>{for(const f of list)for(const stmt of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await b.prepare(stmt).run();};
 const page=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()})).id;assert.ok((await saveWorkspacePage(t.db,t.owner,page,{workspaceId:'a',expectedRevision:1,title:'Existing guide',body:'<h2>Keep the existing writing.</h2>'})).ok);
 const project=(await t.create()).projectId;
 const tables=['workspaces','user','workspace_memberships','departments','service_types','bloomops_clients','client_contacts','service_engagements','projects','bloomops_pages','bloomops_page_trees','bloomops_page_locations','bloomops_page_settings','activity_events'];
 await migrate(binding,files.slice(0,boundary));for(const table of tables)for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 const rows=async(table)=>(await binding.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;const before=await Promise.all(tables.map(rows));assert.ok(before[tables.indexOf('bloomops_pages')][0].body.includes('existing writing'));
 await migrate(binding,files.slice(boundary));await migrate(fresh,files);assert.deepEqual(await Promise.all(tables.map(rows)),before);check('populated upgrade preserves every prior row, Page body and hierarchy',true);
 const schema=async b=>(await b.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()).results;assert.deepEqual(await schema(binding),await schema(fresh));check('fresh and populated schemas match',true);
 const input={workspaceId:'a',userId:'ellen',expectedRevision:0,clientId:'james',projectId:project};const result=await Promise.all([savePageRecordContext(db,t.owner,page,input),savePageRecordContext(db,t.owner,page,{...input})]);check('native concurrent equivalent saves return one saved context',result.every(r=>r.ok)&&(await rows('bloomops_page_contexts')).length===1&&(await rows('activity_events')).filter(r=>r.event_type==='PAGE_CONTEXT_CHANGED').length===1);
 const competing=await Promise.all([savePageRecordContext(db,t.owner,page,{...input,expectedRevision:1,projectId:null}),savePageRecordContext(db,t.owner,page,{...input,expectedRevision:1,clientId:'lawrence',projectId:null})]);check('native different simultaneous edits have one conflict',competing.filter(r=>r.ok).length===1&&competing.filter(r=>r.reason==='conflict').length===1);
 const current=await getPageRecordContext(db,t.owner,page);await savePageRecordContext(db,t.owner,page,{...input,expectedRevision:current.revision});
 for(const set of ["workspace_id='b'","client_id='lawrence'","client_id=NULL","project_id='missing'"]){await assert.rejects(binding.prepare('UPDATE bloomops_page_contexts SET '+set+' WHERE page_id=?').bind(page).run(),/FOREIGN KEY|CHECK/);check('native rejects invalid relationship '+set,true);}
 const currentRows=await rows('bloomops_page_contexts'),events=await rows('activity_events');await binding.prepare('CREATE TRIGGER ignore_context BEFORE UPDATE ON bloomops_page_contexts BEGIN SELECT RAISE(IGNORE); END').run();const ignored=await savePageRecordContext(db,t.owner,page,{...input,expectedRevision:currentRows[0].revision,projectId:null});check('native zero-row update reports conflict',ignored.reason==='conflict');assert.deepEqual(await rows('activity_events'),events);assert.deepEqual(await rows('bloomops_page_contexts'),currentRows);await binding.prepare('DROP TRIGGER ignore_context').run();check('native zero-row mutation creates no activity',true);
 await binding.prepare("CREATE TRIGGER fail_context_activity BEFORE INSERT ON activity_events WHEN NEW.event_type='PAGE_CONTEXT_CHANGED' BEGIN SELECT RAISE(ABORT,'injected activity error'); END").run();await assert.rejects(savePageRecordContext(db,t.owner,page,{...input,expectedRevision:currentRows[0].revision,projectId:null}),/injected activity error/);assert.deepEqual(await rows('bloomops_page_contexts'),currentRows);await binding.prepare('DROP TRIGGER fail_context_activity').run();check('native event failure rolls back context change',true);
 await assert.rejects(binding.prepare('DELETE FROM projects WHERE id=?').bind(project).run(),/FOREIGN KEY/);check('context retains existing deletion restrictions',true);
 const after=await rows('bloomops_pages');assert.deepEqual(after,before[tables.indexOf('bloomops_pages')]);check('context changes never rewrite Page content or body revision',true);
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();check('native current revocation denies read and write',await getPageRecordContext(db,t.owner,page)===null&&!(await savePageRecordContext(db,t.owner,page,input)).ok);
 check('native FK integrity remains clean',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);console.log(JSON.stringify({checks:checks.length,names:checks,exitCode:0}));
}finally{t.raw.close();await mf.dispose();}
