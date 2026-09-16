// Native disposable D1 only. No project config, credentials or shared resources.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {setup} from '../tests/_projects.mjs';
import {all,migrationFiles} from '../tests/_bloomops-db.mjs';
import {setupInput,setupDefinition} from '../tests/_work-setup-fixture.mjs';
import {createAction} from '../lib/bloomops/actions.mjs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {saveWorkSetup,getWorkSetup,setWorkSetupActive} from '../lib/bloomops/work-setups.mjs';
import {previewWorkSetup,generateWorkSetup} from '../lib/bloomops/work-setup-generation.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2025-05-01',cf:false,d1Databases:{DB:'work-setups-populated-upgrade',FRESH:'work-setups-fresh'}}));
const t=await setup(),checks=[];function check(name,value){assert.ok(value,name);checks.push(name);console.log('PASS '+name);}
try{
 const binding=await mf.getD1Database('DB'),fresh=await mf.getD1Database('FRESH'),db=bloomOpsDb(binding),files=migrationFiles(),boundary=files.findIndex(f=>f.tag==='0052_colorful_norrin_radd');assert.ok(boundary>=0);
 const migrate=async(b,list)=>{for(const f of list)for(const statement of readFileSync(f.url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await b.prepare(statement).run();};
 const rows=async(table,b=binding)=>(await b.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
 const beforeProject=await t.create({name:'Existing Client project',serviceEngagementId:'social-service'});assert.ok(beforeProject.ok);
 assert.ok((await createAction(t.db,{actor:t.owner,projectId:beforeProject.projectId,requestId:crypto.randomUUID(),input:{title:'Existing private task',description:'Must remain untouched',assigneeMembershipId:'m-sam'}})).ok);
 await migrate(binding,files.slice(0,boundary));
 const oldTables=['workspaces','user','workspace_memberships','departments','service_types','bloomops_clients','client_contacts','service_engagements','projects','actions','activity_events'];
 for(const table of oldTables)for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();
 const before=await Promise.all(oldTables.map(table=>rows(table)));assert.ok(before[oldTables.indexOf('actions')].some(r=>r.assignee_membership_id==='m-sam'));
 await migrate(binding,files.slice(boundary));await migrate(fresh,files);
 assert.deepEqual(await Promise.all(oldTables.map(table=>rows(table))),before);check('populated previous-main upgrade preserves every existing fixture row and assignment',true);
 const schema=async b=>(await b.prepare("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()).results;assert.deepEqual(await schema(binding),await schema(fresh));check('fresh and populated-upgrade schemas match',true);
 const initial=setupInput(),saves=await Promise.all([saveWorkSetup(db,t.owner,initial),saveWorkSetup(db,t.owner,{...initial,definition:Object.fromEntries(Object.entries(initial.definition).reverse())})]);assert.ok(saves.every(s=>s.ok));assert.equal(saves[0].id,saves[1].id);const saved=saves[0];check('native concurrent reordered creation produces one setup and version',(await rows('work_setup_saves')).length===1&&(await rows('template_versions')).length===1);
 const selection={workspaceId:'a',userId:'ellen',templateId:saved.id,versionId:saved.versionId,expectedRevision:1,clientId:'james',serviceEngagementId:'social-service',eventName:'Synthetic May event',eventDate:'2026-05-15'};
 const preview=await previewWorkSetup(db,t.owner,selection);assert.ok(preview.ok);check('native preview validates saved setup and independent calendar dates without creating work',preview.plan.actions[0].dueDate==='2026-05-01'&&(await rows('projects')).length===1);
 const input={...selection,requestId:crypto.randomUUID(),planHash:preview.planHash};const generated=await Promise.all([generateWorkSetup(db,t.owner,input),generateWorkSetup(db,t.owner,Object.fromEntries(Object.entries(input).reverse()))]);assert.ok(generated.every(r=>r.ok),JSON.stringify(generated));assert.equal(generated[0].projectId,generated[1].projectId);check('native concurrent generation creates one complete Project', (await rows('work_setup_generations')).length===1&&(await rows('projects')).length===2);
 const generationTables=['projects','milestones','actions','deliverables','action_dependencies','activity_events','work_setup_generations'];const snapshot=async()=>Promise.all(generationTables.map(table=>rows(table)));
 const generatedBefore=await snapshot();assert.deepEqual(await generateWorkSetup(db,t.owner,input),generated[0]);assert.equal((await generateWorkSetup(db,t.owner,{...input,eventDate:'2026-05-16'})).reason,'conflict');assert.deepEqual(await snapshot(),generatedBefore);check('native replay and changed-intent conflict never duplicate or overwrite work',true);
 const receipt=(await rows('work_setup_generations'))[0];assert.equal(JSON.parse(receipt.plan_json).actions[0].dueDate,'2026-05-01');check('immutable provenance records the actual generation plan',true);
 const distinct=await generateWorkSetup(db,t.owner,{...input,requestId:crypto.randomUUID()});check('different creation UUID remains a separate job',distinct.ok&&distinct.projectId!==generated[0].projectId);
 for(const table of ['projects','actions','action_dependencies','deliverables']){
  const beforeFailure=await snapshot();await binding.prepare(`CREATE TRIGGER synthetic_ignore BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`).run();
  if(table==='projects')assert.equal((await generateWorkSetup(db,t.owner,{...input,requestId:crypto.randomUUID()})).reason,'conflict');else await assert.rejects(generateWorkSetup(db,t.owner,{...input,requestId:crypto.randomUUID()}));
  assert.deepEqual(await snapshot(),beforeFailure);await binding.prepare('DROP TRIGGER synthetic_ignore').run();check('native zero-row '+table+' leaves no partial generation',true);
 }
 const priorVersion=(await rows('template_versions'))[0],changes=await Promise.all(['First change','Second change'].map(name=>saveWorkSetup(db,t.owner,setupInput({templateId:saved.id,expectedRevision:1,definition:{...setupDefinition(),name}}))));check('native version conflict has exactly one winner',changes.filter(r=>r.ok).length===1&&changes.filter(r=>r.reason==='conflict').length===1);
 assert.equal((await rows('template_versions')).find(r=>r.id===priorVersion.id).definition_json,priorVersion.definition_json);check('new setup version leaves old definition and prior Project unchanged',(await rows('projects')).find(r=>r.id===generated[0].projectId).start_date==='2026-05-01');
 assert.equal((await generateWorkSetup(db,t.owner,{...input,requestId:crypto.randomUUID()})).reason,'conflict');check('stale preview cannot create work after a setup revision',true);
 const current=await getWorkSetup(db,t.owner,saved.id);await binding.prepare('CREATE TRIGGER synthetic_ignore BEFORE UPDATE ON work_setup_states BEGIN SELECT RAISE(IGNORE); END').run();assert.equal((await saveWorkSetup(db,t.owner,setupInput({templateId:saved.id,expectedRevision:current.revision}))).reason,'conflict');await binding.prepare('DROP TRIGGER synthetic_ignore').run();check('native zero-row revision preserves saved setup',(await getWorkSetup(db,t.owner,saved.id)).revision===current.revision);
 assert.ok((await setWorkSetupActive(db,t.owner,saved.id,{workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),expectedRevision:current.revision,active:false})).ok);assert.deepEqual(await generateWorkSetup(db,t.owner,input),generated[0]);check('retirement retains the original successful generation retry',true);
 await assert.rejects(binding.prepare("UPDATE template_versions SET definition_json='{}' WHERE id=?").bind(saved.versionId).run());await assert.rejects(binding.prepare('DELETE FROM work_setup_generations').run());check('native saved versions and generation receipts resist mutation/deletion',true);
 await binding.prepare("INSERT INTO user(id,name,email,email_verified) VALUES('new-identity','Synthetic','replacement@example.test',1)").run();await assert.rejects(binding.prepare("UPDATE workspace_memberships SET user_id='new-identity' WHERE id='m-ellen'").run(),/FOREIGN KEY/);check('membership identity cannot be reassigned over immutable actor provenance',true);
 // Exercise the supported maximum, including native D1 batch/parameter limits.
 const large=setupDefinition();large.milestones=Array.from({length:20},(_,i)=>({key:'milestone_'+i,name:'Milestone '+i,startOffset:null,targetOffset:i}));large.actions=Array.from({length:60},(_,i)=>({key:'action_'+i,title:'Action '+i,instructions:'Internal instructions',milestoneKey:'milestone_'+(i%20),dueOffset:i,dependsOn:Array.from({length:Math.min(i,3)},(_,j)=>'action_'+j)}));large.actions[59].dependsOn.push('action_3','action_4','action_5','action_6','action_7','action_8');large.deliverables=Array.from({length:20},(_,i)=>({key:'output_'+i,title:'Output '+i,instructions:'',targetOffset:i}));
 const largeSaved=await saveWorkSetup(db,t.owner,setupInput({definition:large}));assert.ok(largeSaved.ok);const largeSelection={...selection,templateId:largeSaved.id,versionId:largeSaved.versionId},largePreview=await previewWorkSetup(db,t.owner,largeSelection);assert.ok(largePreview.ok);assert.equal(largePreview.plan.dependencies.length,180);const largeResult=await generateWorkSetup(db,t.owner,{...largeSelection,requestId:crypto.randomUUID(),planHash:largePreview.planHash});assert.ok(largeResult.ok);check('maximum supported 20 Milestones, 60 Actions, 20 Deliverables and 180 edges commit together',true);
 await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'").run();check('native revoked actor cannot read or retry',await getWorkSetup(db,t.owner,saved.id)===null&&!(await generateWorkSetup(db,t.owner,input)).ok);
 check('native FK integrity after all operations',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 console.log(JSON.stringify({checks:checks.length,names:checks,exitCode:0}));
}finally{t.raw.close();await mf.dispose();}
