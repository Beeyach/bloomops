#!/usr/bin/env node
// B2 on actual disposable workerd/D1, never a configured or remote database.
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
import { createMilestone, getMilestone, listMilestones, portalMilestones, updateMilestone, transitionMilestone, reorderMilestones } from '../lib/bloomops/milestones.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
const temp=mkdtempSync(join(tmpdir(),'bloomops-b2-d1-'));let proxy,checks=0;
const check=(name,ok)=>{assert.ok(ok,name);checks++;console.log(`ok   ${name}`);};
try {
  const configPath=join(temp,'wrangler.json');writeFileSync(configPath,JSON.stringify({name:'bloomops-b2-disposable',compatibility_date:'2025-05-01',d1_databases:[{binding:'DB',database_name:'b2-disposable-local',database_id:'b2-disposable-local'}]}));
  proxy=await getPlatformProxy({configPath,persist:false,remoteBindings:false,envFiles:[]});
  const d1=proxy.env.DB,db=drizzle(d1,{schema}),run=(q,...args)=>d1.prepare(q).bind(...args).run(),one=(q,...args)=>d1.prepare(q).bind(...args).first(),all=async(q,...args)=>(await d1.prepare(q).bind(...args).all()).results;
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
  for(const {tag}of journal.entries)for(const statement of readFileSync(new URL(`../drizzle/${tag}.sql`,import.meta.url),'utf8').split('--> statement-breakpoint'))if(statement.trim())await run(statement.trim());
  check('ten domain migrations apply on actual D1',journal.entries.length===10);
  for(const ws of ['a','b'])await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
  for(const[id,role,ws]of[['ellen','owner','a'],['pm','project_manager','a'],['sam','team_member','a'],['james','client','a'],['lawrence','client','a'],['foreign','owner','b']]){
    await run('INSERT INTO user(id,name,email) VALUES(?,?,?)',id,id,`${id}@example.com`);await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);
  }
  for(const[id,ws]of[['james','a'],['lawrence','a'],['foreign-client','b']])await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',id,ws,id,id);
  await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','james')");
  const actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
  const owner=await actor('ellen'),projectId=(await createProject(db,{actor:owner,clientId:'james',input:{name:'Launch',visibility:'client'}})).projectId;
  const add=(input={},extra={})=>createMilestone(db,{actor:owner,projectId,input:{name:'Brief',...input},requestId:crypto.randomUUID(),...extra});
  const get=id=>getMilestone(db,owner,projectId,id),list=(who=owner)=>listMilestones(db,who,projectId);
  const edit=async(id,input,extra={})=>updateMilestone(db,{actor:owner,projectId,milestoneId:id,input,expectedRevision:(await get(id)).revision,...extra});
  const move=async(id,toStatus,extra={})=>transitionMilestone(db,{actor:owner,projectId,milestoneId:id,toStatus,reason:'Waiting for client feedback',expectedRevision:(await get(id)).revision,...extra});
  const order=async(orderedIds,extra={})=>reorderMilestones(db,{actor:owner,projectId,orderedIds,expected:(await list(extra.actor)).items.map(({id,revision})=>({id,revision})),...extra});
  const snapshot=async()=>JSON.stringify(await Promise.all(['milestones','activity_events'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
  const events=async type=>(await one("SELECT count(*) n FROM activity_events WHERE subject_type='milestone' AND event_type=?",type)).n;
  const parents=JSON.stringify(await Promise.all(['projects','bloomops_clients'].map(table=>all(`SELECT * FROM ${table}`))));
  const requestId=crypto.randomUUID(),created=await Promise.all([add({visibility:'client',clientLabel:'Your brief'},{requestId}),add({visibility:'client',clientLabel:'Your brief'},{requestId})]);
  const id=created[0].milestoneId;
  check('concurrent identical creates own one row and one creation event',created.every(r=>r.ok)&&created[1].milestoneId===id&&await events('MILESTONE_CREATED')===1);
  await edit(id,{name:'Internal renamed'});
  check('response-loss creation retry retains the original request after later edits',(await add({visibility:'client',clientLabel:'Your brief'},{requestId})).unchanged);
  const b=(await add({name:'Build',visibility:'client'})).milestoneId,c=(await add({name:'Secret',visibility:'restricted'})).milestoneId;
  check('cross-workspace parent is rejected by D1 itself',await run("INSERT INTO milestones(workspace_id,project_id,creation_request_id,name,position) VALUES('b',?,?,'Bad',0)",projectId,crypto.randomUUID()).then(()=>false,()=>true));
  check('calendar-date CHECK rejects impossible date',await run("UPDATE milestones SET target_date='2026-02-30' WHERE id=?",id).then(()=>false,()=>true));
  check('ordinary PM cannot see a restricted child',(await list(await actor('pm'))).items.length===2);
  const hidden=JSON.stringify(await get(c));
  check('PM can reorder readable slots without changing the hidden row',(await order([b,id],{actor:await actor('pm')})).ok&&JSON.stringify(await get(c))===hidden);
  check('winning order retry has no duplicate event',(await order([b,id],{actor:await actor('pm')})).unchanged&&await events('MILESTONE_ORDER_CHANGED')===1);
  for(const ids of [[id,id,c],[id,c],[id,b,'missing']])check('malformed or foreign complete order is refused',!(await order(ids)).ok);
  await move(id,'waiting');check('Waiting is explicit and cannot complete from Upcoming',!(await move(b,'completed')).ok&&(await get(id)).status==='waiting');
  const revision=(await get(id)).revision;
  const completed=await Promise.all([move(id,'completed',{expectedRevision:revision,now:new Date('2026-09-08T12:00:00Z')}),move(id,'completed',{expectedRevision:revision,now:new Date('2026-09-08T12:00:00.050Z')})]);
  check('concurrent completion records one winning timestamp and event',completed.every(r=>r.ok)&&await events('MILESTONE_STATUS_CHANGED')===2&&(await get(id)).completedAt);
  await move(b,'skipped');check('Completed and Skipped are terminal',!(await move(id,'in_progress')).ok&&!(await move(b,'waiting')).ok&&(await get(b)).completedAt===null);
  check('progress is derived and parents remain unchanged',(await list()).progress.finished===2&&parents===JSON.stringify(await Promise.all(['projects','bloomops_clients'].map(table=>all(`SELECT * FROM ${table}`)))));
  const client=await actor('james'),dto=await portalMilestones(db,client,projectId);
  check('Client exact DTO excludes hidden rows from progress',JSON.stringify(Object.keys(dto.items[0]).sort())===JSON.stringify(['completedAt','id','label','statusLabel','targetDate'])&&dto.progress.total===2&&dto.progress.finished===2&&!JSON.stringify(dto).includes('Secret'));
  check('other Client and workspace cannot guess parent or child',await portalMilestones(db,await actor('lawrence'),projectId)===null&&await getMilestone(db,await actor('foreign'),projectId,id)===null);
  await addProjectAssignment(db,{actor:owner,projectId,membershipId:'m-sam'});const sam=await actor('sam');
  check('Project assignment permits child reads but no coordination',(await list(sam)).items.length===3&&!(await edit(id,{name:'Forbidden'},{actor:sam})).ok);
  await run("DELETE FROM project_assignments WHERE membership_id='m-sam'");check('revoked Project assignment removes stale reads and old history',(await list(sam)).items.length===0&&(await projectActivity(db,sam,projectId)).length===0);
  for(const[type,operation]of[['MILESTONE_CREATED',()=>add()],['MILESTONE_DETAILS_UPDATED',()=>edit(id,{name:'Failed'})],['MILESTONE_STATUS_CHANGED',()=>move(c,'waiting')],['MILESTONE_ORDER_CHANGED',()=>order([c,id,b])]]){
    const before=await snapshot();await run(`CREATE TRIGGER fail_late BEFORE INSERT ON activity_events WHEN NEW.event_type='${type}' BEGIN SELECT RAISE(ABORT,'injected local activity failure'); END`);
    await assert.rejects(operation());check(`${type} failure rolls back D1 fact and event`,before===await snapshot());await run('DROP TRIGGER fail_late');
  }
  await edit(id,{visibility:'internal'});check('hiding a child immediately changes Client rows and visible-only progress',(await portalMilestones(db,client,projectId)).progress.total===1);
  await run("UPDATE client_contacts SET user_id=NULL WHERE user_id='james'");check('revoked contact removes stale Client projection',await portalMilestones(db,client,projectId)===null);
  const batch=db.batch.bind(db);let armed=true;db.batch=async writes=>{if(armed){armed=false;await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");}return batch(writes);};
  const before=await snapshot();check('write-lock membership revocation prevents both mutation and history',!(await edit(id,{name:'Denied'})).ok&&before===await snapshot());db.batch=batch;
  await run("UPDATE workspace_memberships SET status='active' WHERE id='m-ellen'");
  const large=(await createProject(db,{actor:owner,clientId:'james',input:{name:'Large'}})).projectId;
  for(let n=0;n<200;n++)await run("INSERT INTO milestones(id,workspace_id,project_id,creation_request_id,name,position) VALUES(?,'a',?,?,?,?)",`large-${n}`,large,crypto.randomUUID(),`Large ${n}`,n);
  const largeItems=(await listMilestones(db,owner,large)).items;
  check('200-row order stays within actual D1 binding limits',(await reorderMilestones(db,{actor:owner,projectId:large,orderedIds:largeItems.map(i=>i.id).reverse(),expected:largeItems.map(({id,revision})=>({id,revision}))})).ok);
  check('D1 FK and integrity checks pass',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
  console.log(`B2 disposable workerd/D1: ${checks} checks passed.`);
} finally {await proxy?.dispose();rmSync(temp,{recursive:true,force:true});}
