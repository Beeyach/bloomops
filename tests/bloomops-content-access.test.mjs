import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content.mjs';
import { run } from './_bloomops-db.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { contentOptions } from '../lib/bloomops/content.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
for(const user of ['ellen','ary','pm','sam','other','james','foreign'])for(const visibility of ['internal','client','restricted'])test(`${user} Content ${visibility} scope defaults deny`,async()=>{
 const t=await setup(),{contentId}=await t.add({visibility}),actor=await t.actor(user),allowed=['ellen','ary'].includes(user)||(user==='pm'&&visibility!=='restricted');
 assert.equal(Boolean(await t.item(contentId,actor)),allowed);
 const edit=await t.edit(contentId,{title:'Changed'},{actor});assert.equal(edit.ok,allowed);
});
for(const service of [null,'social-service'])for(const assignment of ['client','service'])test(`Team ${assignment} assignment scopes ${service||'Client-level'} fulfillment`,async()=>{
 const t=await setup();t.assign('sam',assignment==='service'?'social-service':null);const actor=await t.actor('sam'),allowed=assignment==='client'||service!==null;
 for(const visibility of ['internal','client','restricted']){const {contentId}=await t.add({visibility},{serviceEngagementId:service});assert.equal(Boolean(await t.item(contentId,actor)),allowed);assert.equal((await t.add({visibility},{actor,serviceEngagementId:service})).ok,allowed);assert.equal((await t.edit(contentId,{caption:'Fulfilled'},{actor})).ok,allowed);}
 assert.equal((await t.add({},{actor,clientId:'lawrence'})).ok,false);assert.equal((await t.add({},{actor,serviceEngagementId:'ghl-service'})).ok,false);
 const options=await contentOptions(t.db,actor);assert.equal(options.parents.some(p=>p.serviceEngagementId==='ghl-service'),false);assert.equal(options.parents.some(p=>p.serviceEngagementId===null),assignment==='client');
});
for(const assignment of ['client','service'])test(`PM ${assignment} assignment is required for restricted Content`,async()=>{
 const t=await setup(),actor=await t.actor('pm'),{contentId}=await t.add({visibility:'restricted'},{serviceEngagementId:'social-service'});
 assert.equal(await t.item(contentId,actor),null);t.assign('pm',assignment==='service'?'social-service':null);assert.ok(await t.item(contentId,actor));assert.ok((await t.edit(contentId,{caption:'Restricted work'},{actor})).ok);
});
for(const grant of ['department','owner','project','action'])test(`${grant} alone never grants Content scope`,async()=>{
 const t=await setup(),{contentId}=await t.add({ownerMembershipId:'m-sam'});
 if(grant==='department')run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','social','m-sam')");
 if(['project','action'].includes(grant)){const {projectId}=await t.create({serviceEngagementId:'social-service'});if(grant==='project')run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')",projectId);else await createAction(t.db,{actor:t.owner,projectId,requestId:crypto.randomUUID(),input:{title:'Assigned',assigneeMembershipId:'m-sam'}});}
 const actor=await t.actor('sam');assert.equal(await t.item(contentId,actor),null);assert.equal((await t.list(actor)).items.length,0);assert.equal((await contentOptions(t.db,actor)).parents.length,0);assert.equal((await contentOptions(t.db,actor)).members.length,0);assert.equal((await t.add({},{actor})).reason,'not_found');
});
const revoke={client:"DELETE FROM client_assignments WHERE membership_id='m-sam'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",removed:"UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'",role:"UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'"};
for(const [kind,query]of Object.entries(revoke))for(const op of ['create','edit'])test(`live ${kind} revocation fences ${op} at commit`,async()=>{
 const t=await setup();t.assign();const actor=await t.actor('sam'),{contentId}=await t.add(),before=t.snapshot();t.beforeBatch(()=>run(t.raw,query));
 const r=op==='create'?await t.add({},{actor}):await t.edit(contentId,{title:'Revoked'},{actor});assert.equal(r.ok,false);assert.deepEqual(t.snapshot(),before);assert.equal(await t.item(contentId,actor),null);assert.equal((await t.list(actor)).items.length,0);
});
test('Service revocation and canonical department change remove stale reads and writes',async()=>{
 const t=await setup();t.assign('sam','social-service');const actor=await t.actor('sam'),{contentId}=await t.add({},{serviceEngagementId:'social-service'});
 run(t.raw,"DELETE FROM service_assignments WHERE membership_id='m-sam'");assert.equal(await t.item(contentId,actor),null);t.assign('sam','social-service');assert.ok(await t.item(contentId,actor));
 run(t.raw,"UPDATE service_types SET department_id='systems' WHERE id='type-social'");assert.equal(await t.item(contentId,t.owner),null);assert.equal((await t.edit(contentId,{title:'Wrong context'})).reason,'not_found');
});
test('current restriction removes old titles from Client history; no Client history grant',async()=>{
 const t=await setup(),pm=await t.actor('pm'),{contentId}=await t.add({title:'PRIVATE_CONTENT_TITLE'});assert.ok((await clientActivity(t.db,'a','james',{actor:pm})).some(e=>e.detail==='PRIVATE_CONTENT_TITLE'));
 await t.edit(contentId,{visibility:'restricted'});assert.equal((await clientActivity(t.db,'a','james',{actor:pm})).filter(e=>e.title.startsWith('Content')).length,0);
 t.assign('pm');assert.equal((await clientActivity(t.db,'a','james',{actor:pm})).filter(e=>e.title.startsWith('Content')).length,2);
 assert.equal((await clientActivity(t.db,'a','james',{actor:await t.actor('james')})).filter(e=>e.title.startsWith('Content')).length,0);
});
test('hundreds of assignments use relational predicates below D1 binding and statement limits',async()=>{
 const t=await setup();for(let i=0;i<240;i++){run(t.raw,"INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`many-${i}`,`Client ${i}`,`many-${i}`);run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);run(t.raw,"INSERT INTO content_items(workspace_id,client_id,creation_request_id,title,type) VALUES('a',?,?,'Bounded','reel')",`many-${i}`,crypto.randomUUID());}
 const actor=await t.actor('sam'),prepare=t.d1.prepare.bind(t.d1);let max=0,bytes=0;t.d1.prepare=sql=>{bytes=Math.max(bytes,Buffer.byteLength(sql));const stmt=prepare(sql),bind=stmt.bind.bind(stmt);stmt.bind=(...values)=>{max=Math.max(max,values.length);return bind(...values);};return stmt;};
 const first=await t.list(actor),next=await t.list(actor,{page:'2'});assert.equal(first.items.length,200);assert.equal(next.items.length,40);assert.ok(max<=100,`bindings ${max}`);assert.ok(bytes<100000);assert.equal((await t.list(actor,{clientId:'james'})).items.length,0);
});
