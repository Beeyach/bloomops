import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testAuth, run, APP_URL } from './_bloomops-db.mjs';
import { getAccess, getActor, requireAuthorized } from '../lib/bloomops/access.mjs';
import { loadInternalClientResource, loadInternalServiceResource, evaluate, CAPABILITIES } from '../lib/bloomops/authorization.mjs';
import { authorizeProject, getProject, portalProjects } from '../lib/bloomops/projects.mjs';
import { portalMilestones } from '../lib/bloomops/milestones.mjs';
import { readTogether } from '../lib/bloomops/read-batch.mjs';

async function scenario(context) {
  const t = testAuth(); context.after(() => t.raw.close());
  for (const id of ['a', 'b']) run(t.raw, 'INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', id, id, id);
  for (const role of ['owner','admin','team_member','client']) {
    run(t.raw, 'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)', role, role, `${role}@example.com`);
    run(t.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'a',?,?,'active')", `m-${role}`, role, role);
  }
  for (const [id,ws] of [['client-a','a'],['client-b','a'],['foreign','b']]) run(t.raw, 'INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',id,ws,id,id);
  run(t.raw, "INSERT INTO service_types(id,workspace_id,name,slug) VALUES('type','a','Type','type')");
  run(t.raw, "INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES('service','a','client-b','type')");
  run(t.raw, "INSERT INTO projects(id,workspace_id,client_id,name,visibility) VALUES('project','a','client-b','Project','client')");
  run(t.raw, "INSERT INTO milestones(id,workspace_id,project_id,creation_request_id,name,position,visibility) VALUES('milestone','a','project',?,'Milestone',0,'client')", crypto.randomUUID());
  run(t.raw, "INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','client-b','Contact','client')");
  const cookies = new Map();
  t.request = async role => {
    if (!cookies.has(role)) cookies.set(role,(await t.signIn(`${role}@example.com`)).cookie);
    return new Request(APP_URL + '/systems',{headers:{cookie:cookies.get(role)}});
  };
  t.access = async role => getAccess(await t.request(role),{env:t.env});
  t.actor = async role => getActor(await t.access(role));
  return t;
}

test('session identity is one live joined D1 read; Owner capability loading adds no redundant round trip', async context => {
  const t = await scenario(context), request = await t.request('owner'), queries=[];
  const prepare=t.d1.prepare; t.d1.prepare=sql=>{queries.push(sql);return prepare(sql);};
  const access=await getAccess(request,{env:t.env}), actor=await getActor(access);
  assert.equal(queries.length,2,'one joined identity read and one live membership read');
  assert.deepEqual([...actor.capabilities],CAPABILITIES);
  assert.equal(access.user.id,'owner');
  queries.length=0;
  run(t.raw,"DELETE FROM session WHERE user_id='owner'");
  assert.equal(await getAccess(request,{env:t.env}),null,'the same signed cookie immediately loses a revoked session');
  assert.equal(queries.length,1);
});

test('an issued session follows current user and membership truth, including suspension and removal', async context => {
  const t=await scenario(context), request=await t.request('admin');
  assert.ok((await t.access('admin')).membership);
  run(t.raw,"UPDATE user SET name='Updated' WHERE id='admin'");
  assert.equal((await t.access('admin')).user.name,'Updated');
  for(const status of ['suspended','removed']) {
    run(t.raw,'UPDATE workspace_memberships SET status=? WHERE id=?',status,'m-admin');
    assert.equal((await getAccess(request,{env:t.env})).membership,null);
    const {response}=await requireAuthorized(request,{env:t.env,action:'members.manage'});
    assert.equal(response.status,403);
  }
});

test('parallel actor reads preserve independent Client, Service and Project revocation for an issued Team session', async context => {
  const t=await scenario(context);
  run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','client-a','m-team_member')");
  run(t.raw,"INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','service','m-team_member')");
  run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a','project','m-team_member')");
  const request=await t.request('team_member');
  const client=()=>requireAuthorized(request,{env:t.env,action:'client.view',resource:a=>loadInternalClientResource(a.db,a.workspace.id,'client-a')});
  const service=()=>requireAuthorized(request,{env:t.env,action:'service.view',resource:a=>loadInternalServiceResource(a.db,a.workspace.id,'service')});
  assert.ok((await client()).access); assert.ok((await service()).access); assert.ok(await getProject(t.db,await t.actor('team_member'),'project'));
  run(t.raw,"DELETE FROM client_assignments WHERE membership_id='m-team_member'");
  assert.equal((await client()).response.status,404); assert.ok((await service()).access);
  run(t.raw,"DELETE FROM service_assignments WHERE membership_id='m-team_member'");
  assert.equal((await service()).response.status,404); assert.ok(await getProject(t.db,await t.actor('team_member'),'project'));
  run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-team_member'");
  assert.equal(await getProject(t.db,await t.actor('team_member'),'project'),null);
  run(t.raw,"UPDATE projects SET owner_membership_id='m-team_member' WHERE id='project'");
  run(t.raw,"INSERT INTO departments(id,workspace_id,name,slug) VALUES('systems','a','Systems','systems')");
  run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','systems','m-team_member')");
  assert.equal(await getProject(t.db,await t.actor('team_member'),'project'),null,'ownership and department membership grant nothing');
  for(const id of ['foreign','missing']) {
    const result=await requireAuthorized(request,{env:t.env,action:'client.view',resource:a=>loadInternalClientResource(a.db,a.workspace.id,id)});
    assert.equal(result.response.status,404); assert.deepEqual(await result.response.json(),{error:'Not found.'});
  }
});

test('portal visibility and contact unlinking revoke the next request while the identity stays valid', async context => {
  const t=await scenario(context); await t.request('client');
  assert.equal((await portalProjects(t.db,await t.actor('client'))).length,1);
  assert.equal((await portalMilestones(t.db,await t.actor('client'),'project')).items.length,1);
  run(t.raw,"UPDATE milestones SET visibility='restricted' WHERE id='milestone'");
  assert.equal((await portalMilestones(t.db,await t.actor('client'),'project')).items.length,0);
  run(t.raw,"UPDATE projects SET visibility='internal' WHERE id='project'");
  assert.equal((await portalProjects(t.db,await t.actor('client'))).length,0);
  run(t.raw,"UPDATE projects SET visibility='client' WHERE id='project'");
  run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE user_id='client'");
  assert.equal((await portalProjects(t.db,await t.actor('client'))).length,0);
  assert.ok((await t.access('client')).session);
});

test('explicit capability revocation remains current for Admin and Team members', async context => {
  const t=await scenario(context);
  for(const role of ['admin','team_member']) {
    run(t.raw,'INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES(?,?,?)','a',`m-${role}`,'finance.view');
    assert.equal(evaluate(await t.actor(role),{action:'finance.view'}).allowed,true);
    run(t.raw,'DELETE FROM member_capabilities WHERE membership_id=?',`m-${role}`);
    assert.equal(evaluate(await t.actor(role),{action:'finance.view'}).allowed,false);
  }
});

test('native actor support is one invocation; consolidated restricted Project reads revoke with an issued session', async context => {
  const t = await scenario(context);
  run(t.raw, "UPDATE projects SET visibility='restricted' WHERE id='project'");
  run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a','project','m-team_member')");
  await t.request('team_member');
  const counts = [], batch = t.d1.batch;
  t.d1.batch = statements => { counts.push(statements.length); return batch(statements); };
  const actor = await t.actor('team_member');
  assert.deepEqual(counts, [4], 'capabilities plus three independent assignment reads use native D1 batch');
  const read = async () => {
    const access = await t.access('team_member'), current = await getActor(access);
    return readTogether(access.db, db => authorizeProject(db, current, 'project', 'project.view'));
  };
  assert.equal((await read()).ok, true);
  run(t.raw, "DELETE FROM project_assignments WHERE membership_id='m-team_member'");
  assert.deepEqual(await read(), { ok: false, reason: 'not_found' });
  assert.deepEqual(await readTogether(t.db, db => authorizeProject(db, actor, 'project', 'project.view')),
    { ok: false, reason: 'not_found' }, 'even the earlier actor cannot bypass current SQL scope');
  assert.ok((await t.access('team_member')).session);
});
