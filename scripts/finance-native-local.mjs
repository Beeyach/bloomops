// F3 real native D1, disposable only. Populated pre-F3 upgrade and fresh schema.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_projects.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {saveFinanceRecord,getFinanceRecord,listFinanceRecords,setFinanceAccess,financeParents} from '../lib/bloomops/finance.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'finance-native-upgrade',FRESH:'finance-native-fresh'}}));
const t=await setup(),checks=[],check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('PASS '+name);};
const statements=f=>readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
try{
 const binding=await mf.getD1Database('DB'),fresh=await mf.getD1Database('FRESH'),db=bloomOpsDb(binding),files=migrationFiles(),added=files.findIndex(f=>f.tag.startsWith('0055_'));assert.equal(added,files.length-1);
 for(const f of files)for(const stmt of statements(f))await fresh.prepare(stmt).run();check('fresh installation reaches Finance with enforced FK schema',(await fresh.prepare('PRAGMA foreign_keys').first()).foreign_keys===1);
 for(const f of files.slice(0,added))for(const stmt of statements(f))await binding.prepare(stmt).run();
 const tables=['workspaces','user','workspace_memberships','departments','service_types','bloomops_clients','client_contacts','service_engagements'];
 const before={};for(const table of tables){before[table]=all(t.raw,`SELECT * FROM ${table}`).map(row=>({...row}));for(const row of before[table])await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();}
 check('upgrade fixtures actually populated before migration',(await binding.prepare('SELECT count(*) n FROM service_engagements').first()).n===4);
 for(const stmt of statements(files[added]))await binding.prepare(stmt).run();
 for(const table of tables)assert.deepEqual((await binding.prepare(`SELECT * FROM ${table}`).all()).results,before[table]);check('populated upgrade preserves every existing fixture row',true);
 const input={workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),clientId:'james',serviceEngagementId:'ghl-service',kind:'invoice',record:{title:'Native synthetic',amount:'0.10',currency:'USD',status:'sent',dueDate:'2026-01-01',paidDate:null,renewalDate:null,provider:'',reference:'',notes:'Only synthetic',archived:false}};
 const [a,b]=await Promise.all([saveFinanceRecord(db,t.owner,null,input),saveFinanceRecord(db,t.owner,null,{...input,record:Object.fromEntries(Object.entries(input.record).reverse())})]);check('genuinely concurrent native creates share one identity',a.ok&&b.ok&&a.id===b.id&&(await binding.prepare('SELECT count(*) n FROM finance_records').first()).n===1);
 check('changed intent conflicts without altering saved data',(await saveFinanceRecord(db,t.owner,null,{...input,record:{...input.record,amount:'0.20'}})).reason==='conflict'&&(await getFinanceRecord(db,t.owner,a.id)).amount==='0.10');
 const update={...input,expectedRevision:1,record:{...input.record,amount:'1.25'}};
 const edits=await Promise.all([saveFinanceRecord(db,t.owner,a.id,update),saveFinanceRecord(db,t.owner,a.id,{...update,record:{...input.record,amount:'2.75'}})]);check('concurrent native edit preserves one winner',edits.filter(x=>x.ok).length===1&&edits.filter(x=>x.reason==='conflict').length===1);
 const saved=await getFinanceRecord(db,t.owner,a.id);check('native list and detail mappings agree',JSON.stringify((await listFinanceRecords(db,t.owner)).items[0])===JSON.stringify(saved));
 const rejected=async sql=>{let denied=false;try{await binding.prepare(sql).run();}catch{denied=true;}assert.ok(denied,sql);};
 for(const sql of ["UPDATE finance_records SET service_engagement_id='kajabi-service'","UPDATE finance_records SET workspace_id='b'","UPDATE finance_records SET updater_membership_id='m-foreign'","UPDATE finance_records SET amount_minor=-1","UPDATE finance_records SET amount_minor=0.1","UPDATE finance_records SET status='completed'","DELETE FROM service_engagements WHERE id='ghl-service'","DELETE FROM bloomops_clients WHERE id='james'"]){await rejected(sql);check('native constraint '+sql,true);}
 check('constraint failures preserve the saved record',(await getFinanceRecord(db,t.owner,a.id)).revision===2);
 const set=mode=>setFinanceAccess(db,t.owner,'m-sam',{workspaceId:'a',userId:'ellen',targetUserId:'sam',mode});
 assert.equal((await set('edit')).ok,true);await binding.prepare("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','ghl-service','m-sam')").run();const sam=await t.actor('sam');
 check('supported grants plus canonical Service scope enable Finance',(await financeParents(db,sam)).items[0].serviceEngagementId==='ghl-service'&&(await getFinanceRecord(db,sam,a.id)).id===a.id);
 await set('none');check('native capability revocation hides data and rejects writes',await getFinanceRecord(db,sam,a.id)===null&&(await saveFinanceRecord(db,sam,null,{...input,userId:'sam',requestId:crypto.randomUUID()})).ok===false);
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();check('zero-row stale actor creation cannot succeed',(await saveFinanceRecord(db,t.owner,null,{...input,requestId:crypto.randomUUID()})).ok===false&&(await binding.prepare('SELECT count(*) n FROM finance_records').first()).n===1);
 check('final FK integrity is clean',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 console.log(JSON.stringify({checks:checks.length,exitCode:0,names:checks}));
}finally{t.raw.close();await mf.dispose();}
