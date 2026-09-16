// Current shipped migrations, disposable in-memory native D1 only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {migrationFiles} from '../tests/_bloomops-db.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {createProspect} from '../lib/bloomops/prospects.mjs';
import {saveServiceOffering} from '../lib/bloomops/service-offerings.mjs';
import {previewMultiHandoff} from '../lib/bloomops/prospect-multi-handoff.mjs';
import {convertProspect,getProspectConversion} from '../lib/bloomops/prospect-conversions.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("synthetic")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'feedback-upgrade-isolated',FRESH:'feedback-fresh-isolated'}}));
const checks=[],check=(label,ok)=>{assert.ok(ok,label);checks.push(label);console.log('PASS '+label);};
const files=migrationFiles();
async function migrate(binding,entries){for(const f of entries)for(const q of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(q=>q.trim()).filter(Boolean))await binding.prepare(q).run();}
try{
 const binding=await mf.getD1Database('DB'),fresh=await mf.getD1Database('FRESH');await migrate(fresh,files);check('fresh installation enforces valid shipped foreign keys',(await fresh.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 await migrate(binding,files.slice(0,-1));const run=(q,...v)=>binding.prepare(q).bind(...v).run(),first=(q,...v)=>binding.prepare(q).bind(...v).first();
 await run("INSERT INTO workspaces(id,name,slug,purpose) VALUES('w','Synthetic handoff','w','prospecting')");await run("INSERT INTO user(id,name,email) VALUES('owner','Synthetic Owner','owner@example.test')");await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('m','w','owner','owner','active')");await run("INSERT INTO service_types(id,workspace_id,name,slug) VALUES('legacy-type','w','Legacy service','legacy')");
 const legacyProspect=await createProspect(bloomOpsDb(binding),{actor:{workspaceId:'w',membershipId:'m',userId:'owner',role:'owner',status:'active',scope:{kind:'workspace'}},input:{workspaceId:'w',requestId:crypto.randomUUID(),fields:{businessName:'Synthetic legacy prospect'}}});assert.ok(legacyProspect.ok);await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('legacy-client','w','Synthetic legacy client','legacy-client')");await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id,scope_notes) VALUES('legacy-service','w','legacy-client','legacy-type','Legacy scope')");
 await run("INSERT INTO prospect_conversions(id,workspace_id,prospect_id,request_id,request_hash,profile_revision,review_hash,client_id,client_name,service_engagement_id,service_type_id,service_name,scope_notes,recipient_emails_json,converted_by_membership_id) VALUES('legacy-receipt','w',?,?,?,1,?,'legacy-client','Synthetic legacy client','legacy-service','legacy-type','Legacy service','Legacy scope','[]','m')",legacyProspect.prospectId,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64));
 const before=await first("SELECT * FROM prospect_conversions WHERE id='legacy-receipt'");await migrate(binding,files.slice(-1));check('populated upgrade preserves original immutable receipt',JSON.stringify(before)===JSON.stringify(await first("SELECT * FROM prospect_conversions WHERE id='legacy-receipt'")));
 let maxBindings=0;const db=bloomOpsDb({prepare:q=>{const stmt=binding.prepare(q);return new Proxy(stmt,{get(target,key){if(key==='bind')return(...args)=>{maxBindings=Math.max(maxBindings,args.length);assert.ok(args.length<=100);return target.bind(...args);};const v=target[key];return typeof v==='function'?v.bind(target):v;}});},batch:s=>binding.batch(s)});
 const actor={workspaceId:'w',membershipId:'m',userId:'owner',role:'owner',status:'active',scope:{kind:'workspace'}};
 check('legacy single-service receipt remains readable',(await getProspectConversion(db,actor,legacyProspect.prospectId)).receipt.serviceName==='Legacy service');
 const offers=[];for(const name of ['Synthetic course','Synthetic care']){const r=await saveServiceOffering(db,actor,{workspaceId:'w',userId:'owner',requestId:crypto.randomUUID(),name});assert.ok(r.ok);offers.push(r.offering);}
 const input={workspaceId:'w',mode:'new',clientId:null,services:[{serviceTypeId:'legacy-type',scopeNotes:'First agreed scope'},...offers.map(x=>({serviceTypeId:x.id,packageName:x.name,scopeNotes:'Agreed '+x.name}))]};
 async function make(){const r=await createProspect(db,{actor,input:{workspaceId:'w',requestId:crypto.randomUUID(),fields:{businessName:'Synthetic buyer '+crypto.randomUUID().slice(0,8),personName:'Synthetic Contact',publicEmail:'synthetic@example.test'}}});assert.ok(r.ok);return r.prospectId;}
 async function command(id){const r=await previewMultiHandoff(db,actor,id,input);assert.ok(r.ok);return {...input,requestId:crypto.randomUUID(),reviewHash:r.conversionReview.hash,confirmed:true};}
 const id=await make(),cmd=await command(id),results=await Promise.all([convertProspect(db,actor,id,cmd),convertProspect(db,actor,id,{...cmd,services:[...cmd.services].reverse()})]);
 check('concurrent reordered retries return the same complete conversion',results.every(r=>r.ok)&&results[0].receipt.id===results[1].receipt.id&&results[0].receipt.services.length===3);
 const clientId=results[0].receipt.clientId;check('concurrent retries create exactly one client contact and three engagements',(await first('SELECT count(*) n FROM client_contacts WHERE client_id=?',clientId)).n===1&&(await first('SELECT count(*) n FROM service_engagements WHERE client_id=?',clientId)).n===3);
 for(const table of ['bloomops_clients','client_contacts','service_engagements','prospect_conversions']){
  const id=await make(),cmd=await command(id),before=(await first('SELECT count(*) n FROM bloomops_clients')).n;
  await run('CREATE TRIGGER synthetic_skip BEFORE INSERT ON '+table+' BEGIN SELECT RAISE(IGNORE); END');try{const result=await convertProspect(db,actor,id,cmd);check('zero-row '+table+' rolls back without partial client',!result.ok&&(await first('SELECT count(*) n FROM bloomops_clients')).n===before&&(await first('SELECT count(*) n FROM prospect_conversions WHERE prospect_id=?',id)).n===0);}finally{await run('DROP TRIGGER synthetic_skip');}
 }
 const id2=await make(),cmd2=await command(id2),beforeCount=(await first('SELECT count(*) n FROM bloomops_clients')).n;await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m'");check('current revocation denies conversion and receipt read',!(await convertProspect(db,actor,id2,cmd2)).ok&&!(await getProspectConversion(db,actor,id)).ok&&(await first('SELECT count(*) n FROM bloomops_clients')).n===beforeCount);await run("UPDATE workspace_memberships SET status='active' WHERE id='m'");
 await assert.rejects(()=>run("UPDATE prospect_conversion_services SET scope_notes='Changed'"),/immutable/);await assert.rejects(()=>run('DELETE FROM prospect_conversion_services'),/permanent/);check('native receipt item immutability enforced',true);
 check('final foreign key integrity',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);check('native statements remain within existing bind budget',maxBindings<=100);
 console.log(JSON.stringify({checks:checks.length,maxBindings,localOnly:true}));
}finally{await mf.dispose();}
