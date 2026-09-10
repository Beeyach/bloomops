import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_systems.mjs';
import { run } from './_bloomops-db.mjs';
const ids = result => result.projects.items.map(row => row.id).sort();

for (const who of ['ellen','ary','pm']) test(`${who} coordinates currently readable Systems work`, async context => {
  const t=await setup(); context.after(()=>t.raw.close()); t.tree('ghl'); t.tree('kajabi');
  assert.deepEqual(ids(await t.systems(await t.actor(who))),['ghl','kajabi']);
});

for(const [scope, expected] of [['none',[]],['department',[]],['owner',[]],['action',[]],['client',['ghl']],['service',['ghl']],['project',['ghl']]]) {
  test(`Team ${scope} scope respects canonical Project grants in rows, children and facets`, async context => {
    const t=await setup(); context.after(()=>t.raw.close()); t.tree('ghl'); t.tree('kajabi');
    if(scope==='department') run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','systems','m-sam')");
    if(scope==='owner') run(t.raw,"UPDATE projects SET owner_membership_id='m-sam'");
    if(scope==='action') t.action('own',{project_id:'ghl',assignee_membership_id:'m-sam'});
    if(['client','service','project'].includes(scope)) t.assign(scope,'sam',{client:'james',service:'ghl-service',project:'ghl'}[scope]);
    const result=await t.systems(await t.actor('sam'));
    assert.deepEqual(ids(result),expected); assert.equal(result.deliverables.items.length,expected.length);
    assert.equal(result.options.clients.items.length,expected.length); assert.equal(result.options.services.items.length,expected.length);
    if(!expected.length) assert.equal(result.projects.hasMore,false);
    assert.doesNotMatch(JSON.stringify(result),/Course delivery|kajabi-service/);
  });
}

for (const who of ['pm','sam']) for (const subject of ['projects','milestones','actions','deliverables','assets']) {
  test(`${who}: restricted ${subject} cannot influence Systems totals or ordering`, async context => {
    const t=await setup(); context.after(()=>t.raw.close()); t.assign('client',who); const actor=await t.actor(who);
    const before=await t.systems(actor);
    if(subject==='projects') t.project('secret',{service_engagement_id:'ghl-service',visibility:'restricted',health:'at_risk'});
    if(subject==='milestones') t.milestone('secret',{project_id:'ghl',visibility:'restricted',status:'completed'});
    if(subject==='actions') t.action('secret',{project_id:'ghl',visibility:'restricted',due_date:'2026-09-01'});
    if(subject==='deliverables') t.deliverable('secret',{project_id:'ghl',visibility:'restricted',status:'client_review'});
    if(subject==='assets') t.file('secret',{visibility:'restricted'},{project_id:'ghl'});
    assert.deepEqual(await t.systems(actor),before);
    t.assign('project',who,subject==='projects'?'secret':'ghl');
    assert.notDeepEqual(await t.systems(actor),before,'explicit Project assignment enables restricted records under shared rules');
    run(t.raw,'DELETE FROM project_assignments WHERE membership_id=?',`m-${who}`);
    assert.deepEqual(await t.systems(actor),before);
  });
}

for (const mutation of [
  "UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",
  "UPDATE workspaces SET status='suspended' WHERE id='a'",
  "DELETE FROM service_assignments WHERE membership_id='m-sam'",
  "UPDATE projects SET service_engagement_id='social-service' WHERE id='ghl'",
  "UPDATE projects SET visibility='restricted' WHERE id='ghl'",
]) test(`previously loaded actor immediately loses Systems projection: ${mutation}`, async context => {
  const t=await setup(); context.after(()=>t.raw.close()); t.tree('ghl'); t.assign('service','sam','ghl-service'); const actor=await t.actor('sam');
  assert.deepEqual(ids(await t.systems(actor)),['ghl']); run(t.raw,mutation);
  const result=await t.systems(actor);
  assert.deepEqual(ids(result),[]); assert.deepEqual(result.deliverables,{items:[],hasMore:false});
  assert.deepEqual(result.options,{clients:{items:[],hasMore:false},services:{items:[],hasMore:false}});
  assert.deepEqual(await t.systems(actor,{serviceEngagementId:'ghl-service'}),{ok:false});
});

test('foreign workspace never enters rows or facets; Client cannot use the internal read model', async context => {
  const t=await setup(); context.after(()=>t.raw.close());
  t.project('foreign',{workspace_id:'b',client_id:'foreign-client',service_engagement_id:'foreign-service',name:'FOREIGN_SECRET'});
  run(t.raw,"UPDATE departments SET slug='systems' WHERE id='foreign-dept'");
  assert.deepEqual(ids(await t.systems()),['ghl','kajabi']);
  assert.deepEqual(ids(await t.systems(await t.actor('foreign'))),['foreign']);
  assert.deepEqual(await t.systems(await t.actor('james')),{ok:false});
});

test('Action-only scope stays on Work when its Project is restricted, even with a current Action assignment', async context => {
  const t=await setup(); context.after(()=>t.raw.close()); t.tree('ghl');
  run(t.raw,"UPDATE projects SET visibility='restricted' WHERE id='ghl'");
  run(t.raw,"UPDATE actions SET assignee_membership_id='m-sam' WHERE id='ghl-action'");
  const actor=await t.actor('sam'); assert.deepEqual(ids(await t.systems(actor)),[]);
  assert.equal((await t.home(actor)).actions.overdue.items.length,1);
});
