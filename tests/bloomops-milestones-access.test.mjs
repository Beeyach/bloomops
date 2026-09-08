import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_milestones.mjs';
import { run } from './_bloomops-db.mjs';
import { portalMilestones } from '../lib/bloomops/milestones.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { evaluate, loadInternalClientResource, loadInternalServiceResource } from '../lib/bloomops/authorization.mjs';
import { loadMilestoneResource } from '../lib/bloomops/milestone-access.mjs';

for(const scope of ['none','department','owner','client','service','project'])test(`Milestones inherit only canonical ${scope} Project scope`,async()=>{
  const t=await setup(),{milestoneId:id}=await t.add();
  const sibling=(await t.create({serviceEngagementId:'social-service'})).projectId;
  const other=(await t.add({}, {projectId:sibling})).milestoneId;
  if(scope==='department')run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','systems','m-sam')");
  if(scope==='owner')await t.edit(t.projectId,{ownerMembershipId:'m-sam'});
  if(scope==='client')run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  if(scope==='service')run(t.raw,"INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','ghl-service','m-sam')");
  if(scope==='project')t.assign();
  const actor=await t.actor('sam'),readable=['client','service','project'].includes(scope);
  assert.equal(Boolean(await t.milestone(id,actor)),readable);
  assert.equal(Boolean(await t.milestone(other,actor,sibling)),scope==='client');
  assert.equal((await t.change(id,{name:'Forbidden'},{actor})).ok,false);
  assert.equal((await t.add({}, {actor})).ok,false);
  if(scope==='project'){
    const resource=await loadMilestoneResource(t.db,actor,t.projectId,id);assert.ok(evaluate(actor,{action:'milestone.view',resource}).allowed);
    assert.equal(evaluate(actor,{action:'milestone.manage',resource}).allowed,false);
    assert.equal(evaluate(actor,{action:'client.view',resource:await loadInternalClientResource(t.db,'a','james')}).allowed,false);
    assert.equal(evaluate(actor,{action:'service.view',resource:await loadInternalServiceResource(t.db,'a','ghl-service')}).allowed,false);
  }
});
for(const role of ['ellen','ary','pm','sam','james'])for(const assigned of [false,true])test(`restricted Milestone ${role} explicit Project assignment=${assigned}`,async()=>{
  const t=await setup(),{milestoneId:id}=await t.add({visibility:'restricted'});
  if(assigned&&role!=='james')t.assign(role);
  const actor=await t.actor(role),readable=['ellen','ary'].includes(role)||assigned&&['pm','sam'].includes(role);
  assert.equal(Boolean(await t.milestone(id,actor)),readable);
  assert.equal((await t.change(id,{name:'Changed'},{actor})).ok,readable&&role!=='sam');
  assert.equal((await portalMilestones(t.db,actor,t.projectId))?.items.length||0,0);
});
test('PM restriction creation and edits require the same explicit Project assignment',async()=>{
  const t=await setup(),actor=await t.actor('pm'),{milestoneId:id}=await t.add();
  assert.equal((await t.add({visibility:'restricted'},{actor})).ok,false);
  assert.equal((await t.change(id,{visibility:'restricted'},{actor})).ok,false);
  t.assign('pm');assert.ok((await t.add({visibility:'restricted'},{actor})).ok);assert.ok((await t.change(id,{visibility:'restricted'},{actor})).ok);
});
for(const parent of ['internal','restricted','client'])test(`${parent} Project caps Client Milestones and visible-only progress`,async()=>{
  const t=await setup();await t.edit(t.projectId,{visibility:parent});
  const visible=await t.add({visibility:'client',name:'INTERNAL_NAME',clientLabel:'Your launch'});await t.transition(visible.milestoneId,'skipped');
  const hidden=await t.add({name:'HIDDEN_NAME'});await t.transition(hidden.milestoneId,'waiting');await t.transition(hidden.milestoneId,'completed');await t.add({visibility:'restricted',name:'RESTRICTED_NAME'});
  const summary=await portalMilestones(t.db,await t.actor('james'),t.projectId);
  if(parent!=='client')assert.equal(summary,null);
  else {assert.deepEqual(Object.keys(summary).sort(),['items','progress']);assert.equal(summary.items.length,1);assert.deepEqual(Object.keys(summary.items[0]).sort(),['id','label','statusLabel','targetDate','completedAt'].sort());assert.equal(summary.items[0].label,'Your launch');assert.deepEqual(summary.progress,{total:1,finished:1,percentage:100});assert.doesNotMatch(JSON.stringify(summary),/INTERNAL_NAME|HIDDEN_NAME|RESTRICTED_NAME|revision|position|actor|creationRequest|service|department/);}
});
test('hidden-only Projects have no Client progress; unrelated Client and foreign workspace fail closed',async()=>{
  const t=await setup();await t.add();await t.add({visibility:'restricted'});
  assert.deepEqual(await portalMilestones(t.db,await t.actor('james'),t.projectId),{items:[],progress:null});
  for(const user of ['lawrence','foreign']){assert.equal(await portalMilestones(t.db,await t.actor(user),t.projectId),null);assert.deepEqual((await t.list(await t.actor(user))).items,[]);}
});
for(const change of ['contact','membership','workspace','parent','child'])test(`Client stale actor loses Milestone projection after ${change}`,async()=>{
  const t=await setup(),{milestoneId:id}=await t.add({visibility:'client'}),actor=await t.actor('james');assert.equal((await portalMilestones(t.db,actor,t.projectId)).items.length,1);
  const sql={contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",parent:`UPDATE projects SET visibility='internal' WHERE id='${t.projectId}'`,child:`UPDATE milestones SET visibility='internal' WHERE id='${id}'`};run(t.raw,sql[change]);
  const result=await portalMilestones(t.db,actor,t.projectId);if(change==='child')assert.deepEqual(result,{items:[],progress:null});else assert.equal(result,null);
});
for(const scope of ['client','service','project','membership','workspace'])test(`stale Team actor and old Milestone history respect ${scope} revocation`,async()=>{
  const t=await setup(),{milestoneId:id}=await t.add();t.assign();
  const actor=await t.actor('sam');assert.ok(await t.milestone(id,actor));
  if(scope==='client'||scope==='service'){
    run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");
    const table=scope==='client'?'client_assignments':'service_assignments',column=scope==='client'?'client_id':'service_engagement_id',parent=scope==='client'?'james':'ghl-service';
    run(t.raw,`INSERT INTO ${table}(workspace_id,${column},membership_id) VALUES('a',?,'m-sam')`,parent);
    assert.ok(await t.milestone(id,actor));run(t.raw,`DELETE FROM ${table} WHERE membership_id='m-sam'`);
  }else if(scope==='project')run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");
  else if(scope==='membership')run(t.raw,"UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'");else run(t.raw,"UPDATE workspaces SET status='suspended' WHERE id='a'");
  assert.equal(await t.milestone(id,actor),null);assert.deepEqual((await t.list(actor)).items,[]);assert.deepEqual(await projectActivity(t.db,actor,t.projectId),[]);
});
test('current child and parent restrictions remove historical names from Project and Client history',async()=>{
  const t=await setup(),{milestoneId:id}=await t.add({name:'Sensitive milestone'});
  run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");const actor=await t.actor('sam');
  assert.match(JSON.stringify(await projectActivity(t.db,actor,t.projectId)),/Sensitive milestone/);
  await t.change(id,{visibility:'restricted'});
  assert.doesNotMatch(JSON.stringify(await projectActivity(t.db,actor,t.projectId)),/Sensitive milestone/);
  assert.doesNotMatch(JSON.stringify(await clientActivity(t.db,'a','james',{actor})),/Sensitive milestone/);
  t.assign();assert.match(JSON.stringify(await projectActivity(t.db,actor,t.projectId)),/Sensitive milestone/);
  run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");await t.edit(t.projectId,{visibility:'restricted'});
  assert.deepEqual(await projectActivity(t.db,actor,t.projectId),[]);
  assert.deepEqual(await clientActivity(t.db,'a','james',{actor}),[]);
  assert.deepEqual(await projectActivity(t.db,await t.actor('james'),t.projectId),[]);
});
