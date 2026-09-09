import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-calendar.mjs';
import { run } from './_bloomops-db.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
const move=(t,contentId,actor=t.owner,input={platforms:['Agency channel'],expectedRevision:1})=>setContentPlatforms(t.db,{actor,contentId,input});
for(const user of ['ellen','ary','pm','sam','other','james','foreign'])for(const visibility of ['internal','client','restricted'])test(`platform mutation ${user}/${visibility} preserves C1 default deny`,async()=>{
 const t=await setup(),id=(await t.add({visibility,targetPublishDate:'2026-09-08'})).contentId,before=t.snapshot(),allowed=['ellen','ary'].includes(user)||(user==='pm'&&visibility!=='restricted');assert.equal((await move(t,id,await t.actor(user))).ok,allowed);const calendar=await t.calendar(await t.actor(user));assert.equal(calendar.items?.some(i=>i.id===id)||false,allowed);if(!allowed)assert.deepEqual(t.snapshot(),before);
});
for(const user of ['sam','pm'])for(const scope of ['client','service'])for(const service of [null,'social-service'])test(`${user} restricted ${scope} assignment on ${service||'Client'} is exact`,async()=>{
 const t=await setup();t.assign(user,scope==='service'?'social-service':null);const actor=await t.actor(user),id=(await t.add({visibility:'restricted',targetPublishDate:'2026-09-08'},{serviceEngagementId:service})).contentId;assert.equal((await move(t,id,actor)).ok,scope==='client'||service!==null);assert.equal((await t.calendar(actor)).items.some(i=>i.id===id),scope==='client'||service!==null);
 const sibling=(await t.add({visibility:'restricted'},{clientId:'lawrence'})).contentId;assert.equal((await move(t,sibling,actor)).reason,'not_found');
});
for(const grant of ['owner','department','project','action'])test(`platform mutation rejects ${grant}-only responsibility`,async()=>{
 const t=await setup(),id=(await t.add({ownerMembershipId:'m-sam',targetPublishDate:'2026-09-08'})).contentId;
 if(grant==='department')run(t.raw,"INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','social','m-sam')");
 if(['project','action'].includes(grant)){const {projectId}=await t.create({serviceEngagementId:'social-service'});if(grant==='project')run(t.raw,"INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')",projectId);else await createAction(t.db,{actor:t.owner,projectId,requestId:crypto.randomUUID(),input:{title:'Assigned action',assigneeMembershipId:'m-sam'}});}
 const before=t.snapshot();assert.equal((await t.calendar(await t.actor('sam'))).items.length,0);assert.equal((await move(t,id,await t.actor('sam'))).reason,'not_found');assert.deepEqual(t.snapshot(),before);
});
const changes={assignment:"DELETE FROM service_assignments WHERE membership_id='m-sam'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",removed:"UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'",role:"UPDATE workspace_memberships SET role='admin' WHERE id='m-sam'",identity:"UPDATE workspace_memberships SET user_id='foreign' WHERE id='m-sam'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",social:"UPDATE service_types SET department_id='systems' WHERE id='type-social'",service:"UPDATE service_types SET department_id='systems' WHERE id='type-social'"};
for(const [kind,query]of Object.entries(changes))test(`live ${kind} change at commit fences platform mutation and retry with issued actor`,async()=>{
 const t=await setup();t.assign('sam','social-service');const actor=await t.actor('sam'),id=(await t.add({},{serviceEngagementId:'social-service'})).contentId,before=t.snapshot();t.beforeBatch(()=>run(t.raw,query));assert.equal((await move(t,id,actor)).ok,false);assert.deepEqual(t.snapshot(),before);assert.equal((await move(t,id,actor,{bogus:true})).reason,'not_found');
});
test('current restriction at commit fences broad PM without assignment',async()=>{
 const t=await setup(),id=(await t.add()).contentId,actor=await t.actor('pm');const events=t.history();t.beforeBatch(()=>run(t.raw,"UPDATE content_items SET visibility='restricted' WHERE id=?",id));assert.equal((await move(t,id,actor)).ok,false);assert.equal((await t.item(id)).stage,'idea');assert.equal((await t.item(id)).revision,1);assert.deepEqual(t.history(),events);
});
test('retry and internal history require current scope and visibility',async()=>{
 const t=await setup(),id=(await t.add({title:'PRIVATE_CHANNEL',targetPublishDate:'2026-09-08'})).contentId,pm=await t.actor('pm');await move(t,id,pm);assert.ok((await clientActivity(t.db,'a','james',{actor:pm})).some(e=>e.title==='Content platforms changed'));await t.edit(id,{visibility:'restricted'});const before=t.snapshot();assert.equal((await t.calendar(pm)).items.length,0);assert.equal((await move(t,id,pm)).reason,'not_found');assert.equal((await clientActivity(t.db,'a','james',{actor:pm})).filter(e=>e.title.startsWith('Content')).length,0);assert.equal((await clientActivity(t.db,'a','james',{actor:await t.actor('james')})).filter(e=>e.title.startsWith('Content')).length,0);assert.deepEqual(t.snapshot(),before);
});
test('240 assignments keep platform mutation and retry predicates inside D1 limits',async()=>{
 const t=await setup();t.assign();for(let i=0;i<240;i++){run(t.raw,"INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`many-${i}`,`Client ${i}`,`many-${i}`);run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);}
 const id=(await t.add({visibility:'restricted'})).contentId,actor=await t.actor('sam'),prepare=t.d1.prepare.bind(t.d1);let max=0,bytes=0;t.d1.prepare=q=>{bytes=Math.max(bytes,Buffer.byteLength(q));const stmt=prepare(q),bind=stmt.bind.bind(stmt);stmt.bind=(...v)=>{max=Math.max(max,v.length);return bind(...v);};return stmt;};assert.ok((await move(t,id,actor)).ok);assert.ok((await move(t,id,actor)).unchanged);assert.ok(max<=100,`bindings ${max}`);assert.ok(bytes<100000,`SQL bytes ${bytes}`);
});
