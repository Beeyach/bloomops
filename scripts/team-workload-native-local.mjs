// Real disposable native D1 query verification. No remote configuration or secrets.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_actions.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {teamActionWorkload} from '../lib/bloomops/team-workload.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'team-workload-local'}}));
const t=await setup(),checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding);
 for(const f of migrationFiles())for(const stmt of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await binding.prepare(stmt).run();
 for(let i=0;i<53;i++)t.seedAction('synthetic'+i,{assignee_membership_id:'m-sam',due_date:'2026-09-15',visibility:'restricted'});
 t.seedAction('unassigned');t.seedAction('closed',{status:'done',completed_at:'2026-09-15T12:00:00Z'});
 const tables=['workspaces','user','workspace_memberships','departments','service_types','bloomops_clients','client_contacts','service_engagements','projects','actions'];
 for(const table of tables)for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 const now=new Date('2026-09-16T12:00:00Z'),view=(actor,input={})=>teamActionWorkload(db,actor,input,{now});
 const before=(await binding.prepare('SELECT * FROM actions ORDER BY id').all()).results;
 const result=await view(t.owner,{assignee:'m-sam'});check('native grouped projection counts all53 rather than the first detail page',result.ok&&result.selected.open===53&&result.selected.overdue===53&&result.actions.items.length===50&&result.actions.hasMore);
 check('native second detail page remains correct',(await view(t.owner,{assignee:'m-sam',actionPage:'2'})).actions.items.length===3);
 check('native unassigned and closed handling',result.items[0].membershipId===null&&result.items[0].open===1);
 const sam=await t.actor('sam');check('native Action-only permission excludes unassigned/siblings',(await view(sam)).items.length===1&&(await view(sam,{assignee:'none'})).reason==='not_found');
 check('native foreign workspace and portal exclusion',(await view(await t.actor('foreign'))).items.length===0&&(await view(await t.actor('james'))).reason==='forbidden');
 await binding.prepare("UPDATE actions SET assignee_membership_id='m-other' WHERE assignee_membership_id='m-sam'").run();check('native removed assignment immediately removes counts',(await view(sam)).items.length===0);
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();check('native stale Owner cannot retain workload',(await view(t.owner)).items.length===0);
 check('native FK integrity remains clean',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 // Only deliberately changed fixture assignments/status differ; projections never write.
 const after=(await binding.prepare('SELECT * FROM actions ORDER BY id').all()).results;assert.deepEqual(after.map(r=>({...r,assignee_membership_id:null})),before.map(r=>({...r,assignee_membership_id:null})));check('read projections preserve actual Action rows',true);
 console.log(JSON.stringify({checks:checks.length,names:checks,exitCode:0}));
}finally{t.raw.close();await mf.dispose();}
