#!/usr/bin/env node
// B4 on actual disposable workerd/D1, never a configured or remote database.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createProject, getProject, updateProject } from '../lib/bloomops/projects.mjs';
import { addProjectAssignment } from '../lib/bloomops/project-assignments.mjs';
import { createDeliverable, getDeliverable, listDeliverables, portalDeliverables, updateDeliverable, transitionDeliverable } from '../lib/bloomops/deliverables.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { createMilestone } from '../lib/bloomops/milestones.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
import { addActionDependency } from '../lib/bloomops/action-dependencies.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
const temp=mkdtempSync(join(tmpdir(),'bloomops-b4-d1-'));let proxy,checks=0;
const check=(name,ok)=>{assert.ok(ok,name);checks++;console.log(`ok   ${name}`);};
try {
  const configPath=join(temp,'wrangler.json');writeFileSync(configPath,JSON.stringify({name:'bloomops-b4-disposable',compatibility_date:'2025-05-01',d1_databases:[{binding:'DB',database_name:'b4-disposable-local',database_id:'b4-disposable-local'}]}));
  proxy=await getPlatformProxy({configPath,persist:false,remoteBindings:false,envFiles:[]});
  const d1=proxy.env.DB,db=drizzle(d1,{schema}),run=(q,...args)=>d1.prepare(q).bind(...args).run(),one=(q,...args)=>d1.prepare(q).bind(...args).first(),all=async(q,...args)=>(await d1.prepare(q).bind(...args).all()).results;
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
  for(const {tag}of journal.entries)for(const statement of readFileSync(new URL(`../drizzle/${tag}.sql`,import.meta.url),'utf8').split('--> statement-breakpoint'))if(statement.trim())await run(statement.trim());
  check('B4 migration prefix applies on actual D1',journal.entries.length===12&&journal.entries[11].tag==='0011_b4_deliverables');
  for(const ws of ['a','b'])await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
  for(const[id,role,ws]of[['ellen','owner','a'],['pm','project_manager','a'],['sam','team_member','a'],['james','client','a'],['lawrence','client','a'],['foreign','owner','b']]){
    await run('INSERT INTO user(id,name,email) VALUES(?,?,?)',id,id,`${id}@example.com`);await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);
  }
  for(const[id,ws]of[['james','a'],['lawrence','a'],['foreign-client','b']])await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',id,ws,id,id);
  await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','james')");
  const actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
  const owner=await actor('ellen'),projectId=(await createProject(db,{actor:owner,clientId:'james',input:{name:'Launch',visibility:'client'}})).projectId;
  const add=(input={},extra={})=>createDeliverable(db,{actor:owner,projectId,input:{title:'Website handoff',...input},requestId:crypto.randomUUID(),...extra});
  const get=id=>getDeliverable(db,owner,projectId,id),list=(who=owner)=>listDeliverables(db,who,projectId);
  const edit=async(id,input,extra={})=>updateDeliverable(db,{actor:owner,projectId,deliverableId:id,input,expectedRevision:(await get(id)).revision,...extra});
  const move=async(id,toStatus,extra={})=>transitionDeliverable(db,{actor:owner,projectId,deliverableId:id,toStatus,expectedRevision:(await get(id)).revision,...extra});
  const snapshot=async()=>JSON.stringify(await Promise.all(['deliverables','activity_events'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
  const events=async type=>(await one("SELECT count(*) n FROM activity_events WHERE subject_type='deliverable' AND event_type=?",type)).n;
  const milestoneId=(await createMilestone(db,{actor:owner,projectId,requestId:crypto.randomUUID(),input:{name:'Build'}})).milestoneId;
  const actionA=(await createAction(db,{actor:owner,projectId,requestId:crypto.randomUUID(),input:{title:'Prepare',milestoneId}})).actionId;
  const actionB=(await createAction(db,{actor:owner,projectId,requestId:crypto.randomUUID(),input:{title:'Build',assigneeMembershipId:'m-sam'}})).actionId;
  assert.ok((await addActionDependency(db,{actor:owner,actionId:actionB,dependsOnActionId:actionA,expectedRevision:1})).ok);
  const parents=async()=>JSON.stringify(await Promise.all(['projects','milestones','actions','action_dependencies','bloomops_clients','service_engagements','onboarding_instances'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
  const beforeParents=await parents(),requestId=crypto.randomUUID(),input={visibility:'client',clientLabel:'Your website',description:'INTERNAL_QA'};
  const created=await Promise.all([add(input,{requestId}),add(input,{requestId}),add(input,{requestId})]),id=created[0].deliverableId;
  check('concurrent identical creates own one fact and creation event',created.every(r=>r.ok)&&new Set(created.map(r=>r.deliverableId)).size===1&&await events('DELIVERABLE_CREATED')===1);
  check('new Deliverable starts Planned, revision one and no delivered timestamp',(await get(id)).status==='planned'&&(await get(id)).revision===1&&(await get(id)).deliveredAt===null);
  await edit(id,{title:'PRIVATE_RENAMED'});check('creation response-loss retry survives later edits',(await add(input,{requestId})).unchanged);
  check('reusing a request key for different initial details conflicts',(await add({title:'Different'},{requestId})).reason==='conflict');
  const b=(await add({title:'PRIVATE_BLANK_LABEL',visibility:'client'})).deliverableId,c=(await add({title:'SECRET_RESTRICTED',visibility:'restricted'})).deliverableId;
  check('same-title intentional creation remains independent',(await add()).deliverableId!==id);
  check('cross-workspace Project parent is refused by actual D1',await run("INSERT INTO deliverables(workspace_id,project_id,creation_request_id,title) VALUES('b',?,?,'Bad')",projectId,crypto.randomUUID()).then(()=>false,()=>true));
  check('D1 rejects impossible dates and incoherent delivery timestamp',await run("UPDATE deliverables SET target_date='2026-02-30' WHERE id=?",id).then(()=>false,()=>true)&&await run("UPDATE deliverables SET status='delivered' WHERE id=?",id).then(()=>false,()=>true));
  const pm=await actor('pm'),sam=await actor('sam'),client=await actor('james');
  check('Action-only assignment grants no Deliverable reads or coordination',(await list(sam)).items.length===0&&!(await edit(id,{title:'Denied'},{actor:sam})).ok);
  check('ordinary PM cannot read or create a restricted child',await getDeliverable(db,pm,projectId,c)===null&&!(await add({visibility:'restricted'},{actor:pm})).ok);
  await addProjectAssignment(db,{actor:owner,projectId,membershipId:'m-pm'});
  check('explicit Project assignment permits restricted PM coordination',(await edit(c,{targetDate:'2026-10-01'},{actor:pm})).ok);
  await run("DELETE FROM project_assignments WHERE membership_id='m-pm'");
  check('Planned cannot jump to Delivered',(await move(id,'delivered')).reason==='invalid_transition');
  await move(id,'in_progress');await move(id,'internal_review');
  check('Client never sees internal QA or title, including blank label',JSON.stringify(await portalDeliverables(db,client,projectId)).includes('In progress')&&!/PRIVATE|INTERNAL|SECRET/.test(JSON.stringify(await portalDeliverables(db,client,projectId)))&&(await portalDeliverables(db,client,projectId)).items.find(i=>i.id===b).label==='Deliverable');
  await move(id,'client_review');check('client review is plain read-only status',(await portalDeliverables(db,client,projectId)).items.find(i=>i.id===id).statusLabel==='Ready for review');
  await move(id,'in_progress');await move(id,'internal_review');await move(id,'approved');
  const revision=(await get(id)).revision,beforeEvents=await events('DELIVERABLE_STATUS_CHANGED');
  const delivered=await Promise.all([move(id,'delivered',{expectedRevision:revision,now:new Date('2026-09-08T12:00:00Z')}),move(id,'delivered',{expectedRevision:revision,now:new Date('2026-09-08T12:00:00.050Z')})]);
  check('competing identical delivery records one winning timestamp and semantic event',delivered.every(r=>r.ok)&&(await get(id)).revision===revision+1&&Boolean((await get(id)).deliveredAt)&&await events('DELIVERABLE_STATUS_CHANGED')===beforeEvents+1);
  const retryBefore=await snapshot();check('Delivered response-loss retry is a complete no-op',(await move(id,'delivered',{expectedRevision:revision})).unchanged&&retryBefore===await snapshot());
  await move(b,'cancelled');check('Delivered and Cancelled are terminal and Cancelled owns no timestamp',!(await move(id,'in_progress')).ok&&!(await move(b,'in_progress')).ok&&(await get(b)).deliveredAt===null);
  check('Deliverable operations preserve all nonempty B3 work and parent facts',beforeParents===await parents());
  const dto=await portalDeliverables(db,client,projectId);check('portal DTO is exactly five safe fields with no progress/count',Object.keys(dto).join(',')==='items'&&dto.items.length===2&&dto.items.every(i=>JSON.stringify(Object.keys(i).sort())===JSON.stringify(['deliveredAt','id','label','statusLabel','targetDate'])));
  check('foreign workspace and unrelated Client cannot guess Deliverables',await portalDeliverables(db,await actor('lawrence'),projectId)===null&&await getDeliverable(db,await actor('foreign'),projectId,id)===null);
  await addProjectAssignment(db,{actor:owner,projectId,membershipId:'m-sam'});
  check('Project-assigned Team reads all reachable children but cannot create/edit/transition',(await list(sam)).items.length===4&&!(await add({}, {actor:sam})).ok&&!(await edit(id,{title:'No'},{actor:sam})).ok&&!(await move(c,'in_progress',{actor:sam})).ok);
  await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  check('combined Project and Client histories stay within D1 bind limits for Team',JSON.stringify(await projectActivity(db,sam,projectId)).includes('PRIVATE_RENAMED')&&JSON.stringify(await clientActivity(db,'a','james',{actor:sam})).includes('PRIVATE_RENAMED'));
  await run("DELETE FROM project_assignments WHERE membership_id='m-sam'");await edit(id,{visibility:'restricted'});
  check('current restriction hides old Deliverable titles from both histories',!/PRIVATE_RENAMED/.test(JSON.stringify(await projectActivity(db,sam,projectId)))&&!/PRIVATE_RENAMED/.test(JSON.stringify(await clientActivity(db,'a','james',{actor:sam}))));
  await run("DELETE FROM client_assignments WHERE membership_id='m-sam'");check('stale revoked Team actor loses children and history',(await list(sam)).items.length===0&&(await projectActivity(db,sam,projectId)).length===0);
  for(const op of ['create','edit','status'])for(const failure of ['fact','activity']){
    const before=await snapshot();await run(failure==='activity'?"CREATE TRIGGER fail_b4 BEFORE INSERT ON activity_events WHEN NEW.subject_type='deliverable' BEGIN SELECT RAISE(ABORT,'late failure'); END":`CREATE TRIGGER fail_b4 BEFORE ${op==='create'?'INSERT':'UPDATE'} ON deliverables BEGIN SELECT RAISE(ABORT,'late failure'); END`);
    await assert.rejects(op==='create'?add():op==='edit'?edit(id,{title:'Failed'}):move(c,'in_progress'));check(`late ${failure} failure rolls back ${op} fact and event`,before===await snapshot());await run('DROP TRIGGER fail_b4');
  }
  for(const kind of ['membership','role','parent']){
    const batch=db.batch.bind(db);let armed=true;db.batch=async writes=>{if(armed){armed=false;await run(kind==='membership'?"UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'":kind==='role'?"UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'":`UPDATE projects SET visibility='restricted' WHERE id='${projectId}'`);}return batch(writes);};
    const before=await snapshot();check(`write-lock ${kind} change prevents mutation and activity`,!(await edit(b,{title:'Denied'},{actor:pm})).ok&&before===await snapshot());db.batch=batch;
    await run("UPDATE workspace_memberships SET status='active',role='project_manager' WHERE id='m-pm'");await run("UPDATE projects SET visibility='client' WHERE id=?",projectId);
  }
  check('hiding a child immediately changes the portal without hidden counts',(await portalDeliverables(db,client,projectId)).items.length===1);
  await run("UPDATE projects SET visibility='internal' WHERE id=?",projectId);check('Project visibility caps every Client child',await portalDeliverables(db,client,projectId)===null);await run("UPDATE projects SET visibility='client' WHERE id=?",projectId);
  await run("UPDATE client_contacts SET user_id=NULL WHERE user_id='james'");check('contact revocation removes stale Client projection',await portalDeliverables(db,client,projectId)===null);
  const large=(await createProject(db,{actor:owner,clientId:'james',input:{name:'Large'}})).projectId;
  for(let n=0;n<199;n++)await run("INSERT INTO deliverables(id,workspace_id,project_id,creation_request_id,title) VALUES(?,'a',?,?,?)",`large-${n}`,large,crypto.randomUUID(),`Large ${n}`);
  const last=await Promise.all([add({title:'Last A'},{projectId:large}),add({title:'Last B'},{projectId:large})]);
  check('200-record ceiling is atomic and list remains bounded on actual D1',last.filter(r=>r.ok).length===1&&(await listDeliverables(db,owner,large)).items.length===200);
  check('D1 FK and integrity checks pass',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
  console.log(`B4 disposable workerd/D1: ${checks} checks passed.`);
} finally {await proxy?.dispose();rmSync(temp,{recursive:true,force:true});}
