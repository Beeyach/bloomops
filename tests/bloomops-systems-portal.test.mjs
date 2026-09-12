import './_jsx.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {deliveryFixture} from './_systems-delivery.mjs';
import {run} from './_bloomops-db.mjs';
const {PortalProjects}=await import('../components/bloomops/Projects.jsx');

test('mixed generated GHL/Kajabi builds use exact Client DTOs and canonical shared sections',async ctx=>{
 const t=await deliveryFixture(ctx),before=t.snapshot(),receipts=t.receipts(),p=await t.portal();
 assert.deepEqual(p.projects.map(p=>p.id).sort(),['course','ghl']);
 const milestones={},deliverables={},files={};
 for(const [i,b] of t.builds.entries()) {
  const c=p.children[i];assert.equal(c.milestones.items.length,1);assert.equal(c.deliverables.items.length,1);assert.equal(c.files.items.length,1);
  assert.deepEqual(Object.keys(c.milestones.items[0]).sort(),['completedAt','id','label','statusLabel','targetDate']);
  assert.deepEqual(Object.keys(c.deliverables.items[0]).sort(),['deliveredAt','id','label','statusLabel','targetDate']);
  assert.deepEqual(Object.keys(c.files.items[0]).sort(),['attachmentLabel','byteSize','filename','id','mimeType','readyAt']);
  assert.equal(c.deliverables.items[0].statusLabel,'In progress');
  milestones[b.projectId]=c.milestones;deliverables[b.projectId]=c.deliverables;files[b.projectId]=c.files;
 }
 const html=renderToStaticMarkup(PortalProjects({projects:p.projects,milestones,deliverables,files}));
 assert.match(html,/Your ghl handoff/);assert.match(html,/Your course output/);assert.match(html,/Shared files/);
 assert.doesNotMatch(JSON.stringify(p)+html,/PRIVATE_REVIEW_NOTE|Perform internal QA|Coordinate approved launch|Prepare handoff|definitionHash|blueprintKey|objectKey|sha256|membershipId/);
 assert.deepEqual(t.snapshot(),before);assert.deepEqual(t.receipts(),receipts);
});

test('hidden generated work changes cannot alter portal rows, counts or HTML inputs',async ctx=>{
 const t=await deliveryFixture(ctx),before=await t.portal();
 run(t.raw,"UPDATE actions SET title='PRIVATE_QA',description='PRIVATE_ACCESS',status='review',revision=revision+1");
 run(t.raw,"UPDATE milestones SET name='PRIVATE_PHASE',status='in_progress',revision=revision+1 WHERE visibility='internal'");
 for(const b of t.builds){t.deliverable(`${b.projectId}-hidden`,{project_id:b.projectId,status:'client_review'});t.file(`${b.projectId}-secret`,{}, {project_id:b.projectId});}
 assert.deepEqual(await t.portal(),before);
});
for(const boundary of ['file','deliverable','project','contact','membership'])test(`mixed Client ${boundary} revocation removes current output and byte access`,async ctx=>{
 const t=await deliveryFixture(ctx);for(const b of t.builds)assert.ok(await t.download(b));const calls=t.bucket.calls.length;
 const queries={file:"UPDATE assets SET visibility='internal'",deliverable:"UPDATE deliverables SET visibility='internal'",project:"UPDATE projects SET visibility='internal'",contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'"};
 run(t.raw,queries[boundary]);const p=await t.portal();
 for(const c of p.children)assert.deepEqual(c.files.items,[]);
 if(['project','contact','membership'].includes(boundary))assert.deepEqual(p.projects,[]);
 if(boundary==='deliverable')for(const c of p.children)assert.deepEqual(c.deliverables.items,[]);
 for(const b of t.builds)assert.equal(await t.download(b),null);assert.equal(t.bucket.calls.length,calls);
});
for(const scope of ['project','service','client'])test(`mixed generated Home/Work/Systems follow issued Team ${scope} scope and its revocation`,async ctx=>{
 const t=await deliveryFixture(ctx),actor=await t.actor('sam');t.assign(scope,'sam',{project:'ghl',service:'ghl-service',client:'james'}[scope]);
 const expected=scope==='client'?['course','ghl']:['ghl'];
 const systems=await t.systems(actor);assert.deepEqual(systems.projects.items.map(p=>p.id).sort(),expected);
 assert.deepEqual((await t.home(actor)).projects.items.map(p=>p.id).sort(),expected);
 for(const b of t.builds)assert.equal(Boolean(await t.download(b,actor)),expected.includes(b.projectId));
 run(t.raw,`DELETE FROM ${scope}_assignments WHERE membership_id='m-sam'`);
 assert.deepEqual((await t.systems(actor)).projects.items,[]);assert.deepEqual((await t.summaries(actor)).items,[]);
 const home=await t.home(actor);for(const key of ['projects','deliverables','recent'])assert.deepEqual(home[key],{items:[],hasMore:false});
 for(const b of t.builds)assert.equal(await t.download(b,actor),null);
});
test('unrelated Client and foreign workspace never inherit either generated platform',async ctx=>{
 const t=await deliveryFixture(ctx);for(const id of ['lawrence','foreign']){const actor=await t.actor(id),p=await t.portal(actor);assert.deepEqual(p.projects,[]);for(const b of t.builds)assert.equal(await t.download(b,actor),null);}
});
