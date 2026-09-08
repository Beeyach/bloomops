import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_projects.mjs';
import { all, one, run } from './_bloomops-db.mjs';
import { getProject, listProjects, portalProjects, transitionProject, updateProject } from '../lib/bloomops/projects.mjs';
import { addProjectAssignment, updateProjectAssignment, removeProjectAssignment, listProjectAssignments } from '../lib/bloomops/project-assignments.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { evaluate } from '../lib/bloomops/authorization.mjs';
import { loadProjectResource } from '../lib/bloomops/project-access.mjs';

test('Project create owns only Project state, starts Planned and uses the Service department', async () => {
  const t = await setup(), before = all(t.raw, 'SELECT * FROM bloomops_clients'), services = all(t.raw, 'SELECT * FROM service_engagements');
  const r = await t.create({ serviceEngagementId: 'ghl-service', status: 'completed', ownerMembershipId: 'm-sam', health: 'at_risk' });
  assert.ok(r.ok); const p = await t.get(r.projectId);
  assert.equal(p.status, 'planned'); assert.equal(p.completedAt, null); assert.equal(p.health, 'at_risk');
  assert.equal(p.departmentId, null); assert.equal(p.departmentName, 'systems'); assert.equal(p.visibility, 'internal');
  assert.equal(await t.get(p.id, await t.actor('sam')), null, 'ownership grants no scope');
  assert.deepEqual(all(t.raw, 'SELECT * FROM bloomops_clients'), before); assert.deepEqual(all(t.raw, 'SELECT * FROM service_engagements'), services);
  assert.equal(t.events(p.id, 'PROJECT_CREATED').length, 1);
});

for (const [field, value] of [['name',''], ['name','x'.repeat(121)], ['name',{}], ['clientLabel','x'.repeat(121)], ['health','active'], ['visibility','public'], ['startDate','2026-02-30'], ['ownerMembershipId','m-james'], ['ownerMembershipId','m-foreign'], ['departmentId','foreign-dept'], ['serviceEngagementId','foreign-service'], ['serviceEngagementId','kajabi-service']]) test(`invalid ${field}=${String(value).slice(0,24)} cannot create any Project fact`, async () => {
  const t=await setup(); assert.equal((await t.create({[field]:value})).ok,false);
  assert.equal(one(t.raw,'SELECT count(*) n FROM projects').n,0); assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,0);
});
test('dates and Service department have a single coherent source', async () => {
  const t=await setup();
  assert.equal((await t.create({startDate:'2026-09-09',targetDate:'2026-09-08'})).ok,false);
  assert.equal((await t.create({serviceEngagementId:'social-service',departmentId:'systems'})).ok,false);
  const {projectId}=await t.create({departmentId:'systems'}); assert.equal((await t.get(projectId)).departmentName,'systems');
});
test('Projects may share a name: concurrent creates are distinct intentional work with one event each',async()=>{
  const t=await setup(), results=await Promise.all([t.create(),t.create()]);
  assert.ok(results.every(r=>r.ok)); assert.notEqual(results[0].projectId,results[1].projectId);
  for(const r of results) assert.equal(t.events(r.projectId,'PROJECT_CREATED').length,1);
});
test('normal lifecycle has reasoned waiting/blocking, independent health and monotonic completion',async()=>{
  const t=await setup(),{projectId:id}=await t.create({health:'needs_attention',serviceEngagementId:'ghl-service'});
  for(const [state,reason] of [['ready'],['in_progress'],['waiting','Waiting for Ellen'],['in_progress'],['blocked','Unexpected access outage'],['in_progress'],['review'],['in_progress'],['review'],['completed']]) assert.ok((await t.move(id,state,{reason})).ok,state);
  const completed=await t.get(id); assert.ok(completed.completedAt); assert.equal(completed.health,'needs_attention');
  assert.equal((await t.move(id,'in_progress')).ok,false);
  assert.ok((await t.move(id,'archived')).ok); assert.equal((await t.get(id)).completedAt,completed.completedAt);
  assert.equal((await t.move(id,'ready')).ok,false);
  assert.equal(one(t.raw,"SELECT status FROM service_engagements WHERE id='ghl-service'").status,'planned');
  assert.equal(one(t.raw,"SELECT relationship_status FROM bloomops_clients WHERE id='james'").relationship_status,'draft');
});
test('invalid transitions, absent/oversized reasons and arbitrary PATCH statuses do not write',async()=>{
  const t=await setup(),{projectId:id}=await t.create();
  for(const state of ['in_progress','completed','archived','invented']) assert.equal((await t.move(id,state)).ok,false);
  await t.move(id,'ready'); await t.move(id,'in_progress'); const before=t.events(id).length;
  for(const reason of [null,'','x'.repeat(1001),'bad\0text']) assert.equal((await t.move(id,'waiting',{reason})).ok,false);
  assert.equal((await t.edit(id,{status:'completed'})).ok,false); assert.equal(t.events(id).length,before);
  assert.ok((await t.move(id,'waiting',{reason:'Waiting for Ellen\nExpected tomorrow'})).ok);
  assert.equal((await t.get(id)).statusReason,'Waiting for Ellen\nExpected tomorrow');
});
test('cancellation is terminal except archive and has no completion timestamp',async()=>{
  const t=await setup(),{projectId:id}=await t.create(); await t.move(id,'cancelled');
  assert.equal((await t.move(id,'ready')).ok,false); await t.move(id,'archived'); assert.equal((await t.get(id)).completedAt,null);
});
test('same-snapshot identical detail/health/owner edits create each semantic event once',async()=>{
  const t=await setup(),{projectId:id}=await t.create();
  const opts={actor:t.owner,projectId:id,expectedRevision:1,input:{name:'Renamed',health:'at_risk',ownerMembershipId:'m-ary'}};
  const results=await Promise.all([updateProject(t.db,opts),updateProject(t.db,opts)]); assert.ok(results.every(r=>r.ok));
  for(const type of ['PROJECT_DETAILS_UPDATED','PROJECT_HEALTH_CHANGED','PROJECT_OWNER_CHANGED']) assert.equal(t.events(id,type).length,1);
  assert.equal((await t.get(id)).revision,2); assert.ok((await updateProject(t.db,opts)).unchanged);
  assert.equal((await t.edit(id,{name:'Stale'},{expectedRevision:1})).reason,'conflict');
});
test('duplicate transitions converge; competing same-snapshot transitions keep one coherent history',async()=>{
  const t=await setup(),{projectId:id}=await t.create();
  const opts={actor:t.owner,projectId:id,expectedRevision:1,toStatus:'ready'};
  assert.ok((await Promise.all([transitionProject(t.db,opts),transitionProject(t.db,opts)])).every(r=>r.ok));
  assert.ok((await transitionProject(t.db,opts)).unchanged); assert.equal(t.events(id,'PROJECT_STATUS_CHANGED').length,1);
  const [a,b]=await Promise.all([t.move(id,'in_progress',{expectedRevision:2}),t.move(id,'cancelled',{expectedRevision:2})]);
  assert.equal([a,b].filter(r=>r.ok).length,1); assert.equal(t.events(id,'PROJECT_STATUS_CHANGED').length,2);
});
for(const scope of ['none','department','owner','client','service','project']) test(`Team Member ${scope} scope admits only canonical Projects and no coordination powers`,async()=>{
  const t=await setup(),{projectId:id}=await t.create({serviceEngagementId:'social-service',ownerMembershipId:scope==='owner'?'m-sam':null});
  const {projectId:sibling}=await t.create({serviceEngagementId:'ghl-service'});
  if(scope==='department')run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','social','m-sam')");
  if(scope==='client')run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  if(scope==='service')run(t.raw,"INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social-service','m-sam')");
  if(scope==='project')await addProjectAssignment(t.db,{actor:t.owner,projectId:id,membershipId:'m-sam'});
  const actor=await t.actor('sam'), allowed=['client','service','project'].includes(scope);
  assert.equal(Boolean(await t.get(id,actor)),allowed); assert.equal(Boolean(await t.get(sibling,actor)),scope==='client');
  if(allowed){const resource=await loadProjectResource(t.db,actor,id); assert.ok(evaluate(actor,{action:'project.view',resource}).allowed); for(const action of ['project.manage','project.assign']) assert.equal(evaluate(actor,{action,resource}).allowed,false);}
  assert.equal((await t.edit(id,{name:'Forbidden'},{actor})).ok,false);
});
test('explicit Project scope never grants Client or sibling Service access',async()=>{
  const t=await setup(),{projectId}=await t.create({serviceEngagementId:'social-service'});
  await addProjectAssignment(t.db,{actor:t.owner,projectId,membershipId:'m-sam'}); const actor=await t.actor('sam');
  for(const resource of [{type:'client',id:'james',workspaceId:'a',clientId:'james'},{type:'service_engagement',id:'ghl-service',workspaceId:'a',clientId:'james',serviceEngagementId:'ghl-service'}]) assert.equal(evaluate(actor,{action:resource.type==='client'?'client.view':'service.view',resource}).allowed,false);
});
test('Client projection omits internals; visibility and contact revocation take effect even with a stale actor',async()=>{
  const t=await setup(),{projectId:id}=await t.create({visibility:'client',clientLabel:'Your website',health:'at_risk',ownerMembershipId:'m-ary',serviceEngagementId:'ghl-service'});
  await t.create({name:'Hidden'}); const actor=await t.actor('james'); const rows=await portalProjects(t.db,actor);
  assert.equal(rows.length,1); assert.deepEqual(Object.keys(rows[0]).sort(),['clientId','clientName','completedAt','id','label','statusLabel','targetDate'].sort());
  assert.equal(rows[0].label,'Your website'); assert.equal(await getProject(t.db,actor,id),null); assert.deepEqual(await projectActivity(t.db,actor,id),[]);
  assert.deepEqual(await portalProjects(t.db,await t.actor('lawrence'),{projectId:id}),[]);
  await t.edit(id,{visibility:'internal'}); assert.deepEqual(await portalProjects(t.db,actor),[]);
  await t.edit(id,{visibility:'client'}); run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE client_id='james'"); assert.deepEqual(await portalProjects(t.db,actor),[]);
});
test('restricted Project history follows visibility in Work and Client activity, including old visible events',async()=>{
  const t=await setup(),{projectId:id}=await t.create({name:'Private project'});
  run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  const actor=await t.actor('sam'); assert.equal((await projectActivity(t.db,actor,id)).length,1);
  await t.edit(id,{visibility:'restricted'}); assert.equal(await t.get(id,actor),null);
  assert.deepEqual(await clientActivity(t.db,'a','james',{actor}),[]); assert.deepEqual(await projectActivity(t.db,actor,id),[]);
  await addProjectAssignment(t.db,{actor:t.owner,projectId:id,membershipId:'m-pm'}); assert.ok(await t.get(id,await t.actor('pm')));
  assert.ok((await clientActivity(t.db,'a','james',{actor:t.owner})).every(e=>e.title.startsWith('Project')));
});
test('assignment add/update/remove races and retries retain one row/fact per change',async()=>{
  const t=await setup(),{projectId:id}=await t.create(),opts={actor:t.owner,projectId:id,membershipId:'m-sam'};
  const r=await Promise.all([addProjectAssignment(t.db,opts),addProjectAssignment(t.db,opts)]); assert.ok(r.every(x=>x.ok));
  assert.equal((await listProjectAssignments(t.db,t.owner,id)).length,1); assert.equal(t.events(id,'PROJECT_ASSIGNMENT_ADDED').length,1);
  const edit={actor:t.owner,projectId:id,assignmentId:r[0].assignmentId,assignmentRole:'lead'};
  assert.ok((await Promise.all([updateProjectAssignment(t.db,edit),updateProjectAssignment(t.db,edit)])).every(x=>x.ok));
  assert.equal(t.events(id,'PROJECT_ASSIGNMENT_UPDATED').length,1);
  assert.ok((await Promise.all([removeProjectAssignment(t.db,edit),removeProjectAssignment(t.db,edit)])).every(x=>x.ok));
  assert.equal(t.events(id,'PROJECT_ASSIGNMENT_REMOVED').length,1); assert.equal((await listProjectAssignments(t.db,t.owner,id)).length,0);
});
for(const state of ['suspended','removed','workspace','scope'])test(`previously loaded Team actor loses Project reads after ${state}`,async()=>{
  const t=await setup(),{projectId:id}=await t.create(); await addProjectAssignment(t.db,{actor:t.owner,projectId:id,membershipId:'m-sam'});
  const actor=await t.actor('sam'); if(state==='scope')run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");
  else if(state==='workspace')run(t.raw,"UPDATE workspaces SET status='suspended' WHERE id='a'");else run(t.raw,"UPDATE workspace_memberships SET status=? WHERE id='m-sam'",state);
  assert.equal(await t.get(id,actor),null); assert.equal((await listProjects(t.db,actor)).items.length,0); assert.deepEqual(await projectActivity(t.db,actor,id),[]);
});
for(const operation of ['create','edit','transition','assign','unassign'])test(`late ${operation} activity failure rolls back every Project fact`,async()=>{
  const t=await setup(),{projectId:id}=await t.create(); const added=await addProjectAssignment(t.db,{actor:t.owner,projectId:id,membershipId:'m-sam'});
  const before=['projects','project_assignments','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table}`));
  run(t.raw,"CREATE TRIGGER fail_project BEFORE INSERT ON activity_events BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL failure'); END");
  const mutations={create:()=>t.create(),edit:()=>t.edit(id,{name:'Lost'}),transition:()=>t.move(id,'ready'),assign:()=>addProjectAssignment(t.db,{actor:t.owner,projectId:id,membershipId:'m-other'}),unassign:()=>removeProjectAssignment(t.db,{actor:t.owner,projectId:id,assignmentId:added.assignmentId})};
  await assert.rejects(mutations[operation]); assert.deepEqual(['projects','project_assignments','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table}`)),before);
});
for(const change of ['owner','service','department','actor','workspace'])test(`create rechecks stale ${change} state under the write lock`,async()=>{
  const t=await setup(),batch=t.db.batch.bind(t.db);let armed=true;
  t.db.batch=async(writes)=>{if(armed){armed=false;const commands={owner:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",service:"UPDATE service_engagements SET status='cancelled' WHERE id='social-service'",department:"UPDATE departments SET active=0 WHERE id='social'",actor:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-ellen'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'"};run(t.raw,commands[change]);}return batch(writes);};
  assert.equal((await t.create({ownerMembershipId:'m-sam',...change==='department'?{departmentId:'social'}:{serviceEngagementId:'social-service'}})).ok,false);
  assert.equal(one(t.raw,'SELECT count(*) n FROM projects').n,0);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,0);
});
test('an inactive stored owner does not block unrelated edits',async()=>{
  const t=await setup(),{projectId:id}=await t.create({ownerMembershipId:'m-sam'});run(t.raw,"UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'");
  assert.ok((await t.edit(id,{name:'Still editable',ownerMembershipId:'m-sam'})).ok); assert.equal((await t.get(id)).ownerActive,false);
});

test('concurrent completion with distinct clocks preserves the winner timestamp and one event', async () => {
  const t = await setup(), { projectId } = await t.create();
  for (const status of ['ready', 'in_progress', 'review']) await t.move(projectId, status);
  const expectedRevision = (await t.get(projectId)).revision;
  const results = await Promise.all(['2026-09-08T12:00:00.000Z', '2026-09-08T12:00:00.050Z'].map(at =>
    transitionProject(t.db, { actor: t.owner, projectId, toStatus: 'completed', expectedRevision, now: new Date(at) })));
  assert.ok(results.every(result => result.ok));
  assert.equal(t.events(projectId, 'PROJECT_STATUS_CHANGED').length, 4);
  assert.ok(['2026-09-08T12:00:00.000Z', '2026-09-08T12:00:00.050Z'].includes((await t.get(projectId)).completedAt));
});
