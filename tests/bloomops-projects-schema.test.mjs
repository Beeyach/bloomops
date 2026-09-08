import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_projects.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { addProjectAssignment } from '../lib/bloomops/project-assignments.mjs';
import { listProjects } from '../lib/bloomops/projects.mjs';

for(const [workspace,client,service,owner,department]of [['b','james',null,null,null],['a','james','foreign-service',null,null],['a','james','kajabi-service',null,null],['a','james',null,'m-foreign',null],['a','james',null,null,'foreign-dept']])test(`Project relational parent attack ${[workspace,client,service,owner,department].join('/')} fails in SQLite`,async()=>{
  const t=await setup();assert.throws(()=>run(t.raw,'INSERT INTO projects(workspace_id,client_id,service_engagement_id,owner_membership_id,department_id,name) VALUES(?,?,?,?,?,?)',workspace,client,service,owner,department,'Bad'),/FOREIGN KEY/);
  assert.equal(one(t.raw,'SELECT count(*) n FROM projects').n,0);
});
test('assignment workspace/member/Project FKs and uniqueness are database enforced',async()=>{
  const t=await setup(),{projectId}=await t.create();
  for(const [ws,member]of [['b','m-foreign'],['a','m-foreign']])assert.throws(()=>run(t.raw,'INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES(?,?,?)',ws,projectId,member),/FOREIGN KEY/);
  run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')",projectId);
  assert.throws(()=>run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')",projectId),/UNIQUE/);
  assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
for(const [column,value]of [['status','live'],['health','completed'],['visibility','public'],['name',''],['client_label',''],['revision',0],['completed_at','2026-09-08T00:00:00Z'],['status_reason','Orphan reason']])test(`Project ${column} invariant survives direct SQL`,async()=>{
  const t=await setup(),{projectId}=await t.create();assert.throws(()=>run(t.raw,`UPDATE projects SET ${column}=? WHERE id=?`,value,projectId),/CHECK/);
});
test('database refuses incoherent department, dates, waiting and completion facts',async()=>{
  const t=await setup(),{projectId}=await t.create({serviceEngagementId:'social-service'});
  for(const patch of ["department_id='systems'","start_date='2026-09-10',target_date='2026-09-09'","status='waiting'","status='blocked'","status='completed'"])assert.throws(()=>run(t.raw,`UPDATE projects SET ${patch} WHERE id=?`,projectId),/CHECK/);
});
test('Project activity stays append-only',async()=>{
  const t=await setup(),{projectId}=await t.create();const id=t.events(projectId)[0].id;
  assert.throws(()=>run(t.raw,"UPDATE activity_events SET metadata_json='{}' WHERE id=?",id),/immutable/);
  assert.throws(()=>run(t.raw,'DELETE FROM activity_events WHERE id=?',id),/immutable/);
});
test('large mixed Client, Service and explicit Project scopes use relational filters, not bound ID lists',async()=>{
  const t=await setup();
  for(let i=0;i<230;i++){
    run(t.raw,"INSERT INTO projects(id,workspace_id,client_id,name) VALUES(?,'a','james',?)",`project-${i}`,`Project ${i}`);
    run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')",`project-${i}`);
  }
  const {projectId:hidden}=await t.create({name:'Not assigned'});const actor=await t.actor('sam');const result=await listProjects(t.db,actor);
  assert.equal(result.items.length,200);assert.ok(result.hasMore);assert.ok(result.items.every(p=>p.id!==hidden));
});
for(const change of ['actor','owner','assignee','restricted_scope'])test(`late ${change} changes block edits/assignments with no phantom history`,async()=>{
  const t=await setup(),{projectId:id}=await t.create();await addProjectAssignment(t.db,{actor:t.owner,projectId:id,membershipId:'m-pm'});
  if(change==='restricted_scope')await t.edit(id,{visibility:'restricted'});
  const actor=change==='restricted_scope'?await t.actor('pm'):t.owner, before=t.events(id).length, batch=t.db.batch.bind(t.db);let armed=true;
  t.db.batch=async(writes)=>{if(armed){armed=false;const queries={actor:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'",owner:"UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",assignee:"UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'",restricted_scope:"DELETE FROM project_assignments WHERE membership_id='m-pm'"};run(t.raw,queries[change]);}return batch(writes);};
  const result=change==='assignee'?await addProjectAssignment(t.db,{actor,projectId:id,membershipId:'m-sam'}):await t.edit(id,{name:'Must not commit',...change==='owner'?{ownerMembershipId:'m-sam'}:{}},{actor});
  assert.equal(result.ok,false);assert.equal(t.events(id).length,before);assert.notEqual(one(t.raw,'SELECT name FROM projects WHERE id=?',id).name,'Must not commit');
});
