import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_deliverables.mjs';
import { run } from './_bloomops-db.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
import { portalDeliverables } from '../lib/bloomops/deliverables.mjs';
import { loadDeliverableResource } from '../lib/bloomops/deliverable-access.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { evaluate, loadInternalClientResource, loadInternalServiceResource } from '../lib/bloomops/authorization.mjs';

for(const scope of ['none','department','owner','action','client','service','project'])test(`Deliverables inherit only canonical ${scope} Project scope`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add();
  const sibling=(await t.create({serviceEngagementId:'social-service'})).projectId,other=(await t.add({}, {projectId:sibling})).deliverableId;
  if(scope==='department')run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','systems','m-sam')");
  if(scope==='owner')await t.edit(t.projectId,{ownerMembershipId:'m-sam'});
  if(scope==='action')assert.ok((await createAction(t.db,{actor:t.owner,projectId:t.projectId,requestId:crypto.randomUUID(),input:{title:'Assigned action',assigneeMembershipId:'m-sam'}})).ok);
  if(scope==='client')run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  if(scope==='service')run(t.raw,"INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','ghl-service','m-sam')");
  if(scope==='project')t.assign();
  const actor=await t.actor('sam'),readable=['client','service','project'].includes(scope);
  assert.equal(Boolean(await t.item(id,actor)),readable);assert.equal(Boolean(await t.item(other,actor,sibling)),scope==='client');
  assert.equal((await t.change(id,{title:'Forbidden'},{actor})).ok,false);assert.equal((await t.add({}, {actor})).ok,false);assert.equal((await t.transition(id,'in_progress',{actor})).ok,false);
  if(scope==='project'){
    const resource=await loadDeliverableResource(t.db,actor,t.projectId,id);assert.ok(evaluate(actor,{action:'deliverable.view',resource}).allowed);assert.equal(evaluate(actor,{action:'deliverable.manage',resource}).allowed,false);
    assert.equal(evaluate(actor,{action:'client.view',resource:await loadInternalClientResource(t.db,'a','james')}).allowed,false);
    assert.equal(evaluate(actor,{action:'service.view',resource:await loadInternalServiceResource(t.db,'a','ghl-service')}).allowed,false);
  }
});
for(const role of ['ellen','ary','pm','sam','james'])for(const assigned of [false,true])test(`restricted Deliverable ${role} explicit Project assignment=${assigned}`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add({visibility:'restricted'});if(assigned&&role!=='james')t.assign(role);
  const actor=await t.actor(role),readable=['ellen','ary'].includes(role)||assigned&&['pm','sam'].includes(role);
  assert.equal(Boolean(await t.item(id,actor)),readable);assert.equal((await t.change(id,{title:'Changed'},{actor})).ok,readable&&role!=='sam');
  assert.equal((await t.portal(actor))?.items.length||0,0);
});
test('PM creation and edits to Restricted require explicit Project assignment',async()=>{
  const t=await setup(),actor=await t.actor('pm'),{deliverableId:id}=await t.add();assert.equal((await t.add({visibility:'restricted'},{actor})).ok,false);assert.equal((await t.change(id,{visibility:'restricted'},{actor})).ok,false);
  t.assign('pm');assert.ok((await t.add({visibility:'restricted'},{actor})).ok);assert.ok((await t.change(id,{visibility:'restricted'},{actor})).ok);
});
for(const parent of ['internal','restricted','client'])test(`${parent} Project caps Client Deliverables`,async()=>{
  const t=await setup();await t.edit(t.projectId,{visibility:parent});
  const visible=await t.add({visibility:'client',title:'INTERNAL_TITLE',description:'PRIVATE_QA',clientLabel:'Your website'});await t.transition(visible.deliverableId,'in_progress');await t.transition(visible.deliverableId,'internal_review');
  await t.add({title:'HIDDEN_TITLE'});await t.add({visibility:'restricted',title:'RESTRICTED_TITLE'});
  const summary=await t.portal();if(parent!=='client')assert.equal(summary,null);else {
    assert.deepEqual(Object.keys(summary),['items']);assert.equal(summary.items.length,1);
    assert.deepEqual(Object.keys(summary.items[0]).sort(),['deliveredAt','id','label','statusLabel','targetDate']);assert.equal(summary.items[0].label,'Your website');assert.equal(summary.items[0].statusLabel,'In progress');
    assert.doesNotMatch(JSON.stringify(summary),/INTERNAL_TITLE|HIDDEN_TITLE|RESTRICTED_TITLE|PRIVATE_QA|revision|description|request|workspace|service|department|"progress"|Internal review/);
  }
});
test('blank client label has a neutral literal fallback and never discloses internal title',async()=>{
  const t=await setup();await t.add({visibility:'client',title:'SECRET_INTERNAL_NAME',description:'SECRET_DESCRIPTION',clientLabel:'   '});
  const dto=await t.portal();assert.equal(dto.items[0].label,'Deliverable');assert.doesNotMatch(JSON.stringify(dto),/SECRET/);
});
test('hidden-only Projects are empty; unrelated Client/workspace and guessed Project refuse reads',async()=>{
  const t=await setup();await t.add();await t.add({visibility:'restricted'});assert.deepEqual(await t.portal(),{items:[]});
  for(const user of ['lawrence','foreign']){const actor=await t.actor(user);assert.equal(await t.portal(actor),null);assert.deepEqual((await t.list(actor)).items,[]);}
  assert.equal(await portalDeliverables(t.db,await t.actor('james'),'guessed'),null);
});
for(const change of ['contact','membership','workspace','role','parent','child'])test(`stale Client actor loses Deliverables after ${change}`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add({visibility:'client'}),actor=await t.actor('james');assert.equal((await t.portal(actor)).items.length,1);
  const queries={contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",parent:`UPDATE projects SET visibility='internal' WHERE id='${t.projectId}'`,child:`UPDATE deliverables SET visibility='internal' WHERE id='${id}'`};run(t.raw,queries[change]);
  const result=await t.portal(actor);if(change==='child')assert.deepEqual(result,{items:[]});else assert.equal(result,null);
});
for(const scope of ['client','service','project','membership','workspace','role'])test(`stale Team actor and Deliverable history respect ${scope} revocation`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add();t.assign();const actor=await t.actor('sam');assert.ok(await t.item(id,actor));
  if(scope==='client'||scope==='service'){
    run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");const table=scope==='client'?'client_assignments':'service_assignments',column=scope==='client'?'client_id':'service_engagement_id',parent=scope==='client'?'james':'ghl-service';
    run(t.raw,`INSERT INTO ${table}(workspace_id,${column},membership_id) VALUES('a',?,'m-sam')`,parent);assert.ok(await t.item(id,actor));run(t.raw,`DELETE FROM ${table} WHERE membership_id='m-sam'`);
  }else if(scope==='project')run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");
  else if(scope==='membership')run(t.raw,"UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'");else if(scope==='role')run(t.raw,"UPDATE workspace_memberships SET role='client' WHERE id='m-sam'");else run(t.raw,"UPDATE workspaces SET status='suspended' WHERE id='a'");
  assert.equal(await t.item(id,actor),null);assert.deepEqual((await t.list(actor)).items,[]);assert.deepEqual(await projectActivity(t.db,actor,t.projectId),[]);
});
test('current child and parent restrictions remove historical titles from Project and Client history',async()=>{
  const t=await setup(),{deliverableId:id}=await t.add({title:'Sensitive deliverable'});
  run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");const actor=await t.actor('sam');
  assert.match(JSON.stringify(await projectActivity(t.db,actor,t.projectId)),/Sensitive deliverable/);assert.match(JSON.stringify(await clientActivity(t.db,'a','james',{actor})),/Sensitive deliverable/);
  await t.change(id,{visibility:'restricted'});assert.doesNotMatch(JSON.stringify(await projectActivity(t.db,actor,t.projectId)),/Sensitive deliverable/);assert.doesNotMatch(JSON.stringify(await clientActivity(t.db,'a','james',{actor})),/Sensitive deliverable/);
  t.assign();assert.match(JSON.stringify(await projectActivity(t.db,actor,t.projectId)),/Sensitive deliverable/);
  run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");await t.edit(t.projectId,{visibility:'restricted'});assert.deepEqual(await projectActivity(t.db,actor,t.projectId),[]);assert.deepEqual(await clientActivity(t.db,'a','james',{actor}),[]);
  assert.deepEqual(await projectActivity(t.db,await t.actor('james'),t.projectId),[]);
});
