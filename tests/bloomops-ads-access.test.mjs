import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_ads.mjs';
import { run } from './_bloomops-db.mjs';
const ids = result => result.projects.items.map(row => row.id).sort();

for (const who of ['ellen','ary','pm']) test(`${who} coordinates currently readable Ads work`, async context => {
  const t=await setup(); context.after(()=>t.raw.close()); t.tree('launch'); t.tree('retargeting');
  assert.deepEqual(ids(await t.ads(await t.actor(who))),['launch','retargeting']);
});

for(const [scope, expected] of [['none',[]],['department',[]],['owner',[]],['action',[]],['client',['launch']],['service',['launch']],['project',['launch']]]) {
  test(`Team ${scope} scope respects canonical Project grants in rows, children and facets`, async context => {
    const t=await setup(); context.after(()=>t.raw.close()); t.tree('launch'); t.tree('retargeting');
    if(scope==='department') run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','ads','m-sam')");
    if(scope==='owner') run(t.raw,"UPDATE projects SET owner_membership_id='m-sam'");
    if(scope==='action') t.action('own',{project_id:'launch',assignee_membership_id:'m-sam'});
    if(['client','service','project'].includes(scope)) t.assign(scope,'sam',{client:'james',service:'launch-service',project:'launch'}[scope]);
    const result=await t.ads(await t.actor('sam'));
    assert.deepEqual(ids(result),expected); assert.equal(result.deliverables.items.length,expected.length);
    assert.equal(result.options.clients.items.length,expected.length); assert.equal(result.options.services.items.length,expected.length);
    if(!expected.length) assert.equal(result.projects.hasMore,false);
    assert.doesNotMatch(JSON.stringify(result),/Retargeting delivery|retargeting-service/);
  });
}

for (const who of ['pm','sam']) for (const subject of ['projects','milestones','actions','deliverables','assets']) {
  test(`${who}: restricted ${subject} cannot influence Ads totals or ordering`, async context => {
    const t=await setup(); context.after(()=>t.raw.close()); t.assign('client',who); const actor=await t.actor(who);
    const before=await t.ads(actor);
    if(subject==='projects') t.project('secret',{service_engagement_id:'launch-service',visibility:'restricted',health:'at_risk'});
    if(subject==='milestones') t.milestone('secret',{project_id:'launch',visibility:'restricted',status:'completed'});
    if(subject==='actions') t.action('secret',{project_id:'launch',visibility:'restricted',due_date:'2026-09-01'});
    if(subject==='deliverables') t.deliverable('secret',{project_id:'launch',visibility:'restricted',status:'client_review'});
    if(subject==='assets') t.file('secret',{visibility:'restricted'},{project_id:'launch'});
    assert.deepEqual(await t.ads(actor),before);
    t.assign('project',who,subject==='projects'?'secret':'launch');
    assert.notDeepEqual(await t.ads(actor),before,'explicit Project assignment enables restricted records under shared rules');
    run(t.raw,'DELETE FROM project_assignments WHERE membership_id=?',`m-${who}`);
    assert.deepEqual(await t.ads(actor),before);
  });
}

for (const mutation of [
  "UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",
  "UPDATE workspaces SET status='suspended' WHERE id='a'",
  "DELETE FROM service_assignments WHERE membership_id='m-sam'",
  "UPDATE projects SET service_engagement_id='social-service' WHERE id='launch'",
  "UPDATE projects SET visibility='restricted' WHERE id='launch'",
]) test(`previously loaded actor immediately loses Ads projection: ${mutation}`, async context => {
  const t=await setup(); context.after(()=>t.raw.close()); t.tree('launch'); t.assign('service','sam','launch-service'); const actor=await t.actor('sam');
  assert.deepEqual(ids(await t.ads(actor)),['launch']); run(t.raw,mutation);
  const result=await t.ads(actor);
  assert.deepEqual(ids(result),[]); assert.deepEqual(result.deliverables,{items:[],hasMore:false});
  assert.deepEqual(result.options,{clients:{items:[],hasMore:false},services:{items:[],hasMore:false}});
  assert.deepEqual(await t.ads(actor,{serviceEngagementId:'launch-service'}),{ok:false});
});

test('foreign workspace never enters rows or facets; Client cannot use the internal read model', async context => {
  const t=await setup(); context.after(()=>t.raw.close());
  t.project('foreign',{workspace_id:'b',client_id:'foreign-client',service_engagement_id:'foreign-service',name:'FOREIGN_SECRET'});
  run(t.raw,"UPDATE departments SET slug='ads' WHERE id='foreign-dept'");
  assert.deepEqual(ids(await t.ads()),['launch','retargeting']);
  assert.deepEqual(ids(await t.ads(await t.actor('foreign'))),['foreign']);
  assert.deepEqual(await t.ads(await t.actor('james')),{ok:false});
});

test('Action-only scope stays on Work when its Project is restricted, even with a current Action assignment', async context => {
  const t=await setup(); context.after(()=>t.raw.close()); t.tree('launch');
  run(t.raw,"UPDATE projects SET visibility='restricted' WHERE id='launch'");
  run(t.raw,"UPDATE actions SET assignee_membership_id='m-sam' WHERE id='launch-action'");
  const actor=await t.actor('sam'); assert.deepEqual(ids(await t.ads(actor)),[]);
  assert.equal((await t.home(actor)).actions.overdue.items.length,1);
});

for (const scope of ['client','service','project']) test(`removed ${scope} assignment revokes already loaded Ads actor and selected filters`,async context=>{
  const t=await setup();context.after(()=>t.raw.close());
  const parent={client:'james',service:'launch-service',project:'launch'}[scope];
  t.assign(scope,'sam',parent);const actor=await t.actor('sam');
  assert.deepEqual(ids(await t.ads(actor)),['launch']);
  run(t.raw,`DELETE FROM ${scope}_assignments WHERE membership_id='m-sam'`);
  const result=await t.ads(actor);
  assert.deepEqual(ids(result),[]);
  assert.deepEqual(result.options,{clients:{items:[],hasMore:false},services:{items:[],hasMore:false}});
  assert.deepEqual(await t.ads(actor,{clientId:'james'}),{ok:false});
});
