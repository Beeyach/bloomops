import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { run } from './_bloomops-db.mjs';
import { portalContent, getPortalContent, hasPortalContent } from '../lib/bloomops/portal-content.mjs';
import { portalContentFilters } from '../lib/bloomops/portal-content-values.mjs';
import { requestContentApproval, respondContentApproval, withdrawContentApproval } from '../lib/bloomops/content-approvals.mjs';

const keys = ['id','title','type','clientName','statusLabel','targetPublishDate','publishedAt','platforms','recordingNeeded','approvalRoundId','hasFiles'].sort();
const reads = async t => { const actor = await t.actor('james'); return { actor, list: query => portalContent(t.db, actor, query), detail: id => getPortalContent(t.db, actor, id), nav: () => hasPortalContent(t.db, actor) }; };
const ask = async (t,id) => requestContentApproval(t.db,{actor:t.owner,contentId:id,input:{requestId:crypto.randomUUID(),expectedRevision:(await t.item(id)).revision}});

test('minimal live summary omits all copy, provenance and internal fields, including on detail', async () => {
  const t=await setup(),p=await reads(t);
  assert.equal((await t.edit(t.contentId,{hook:'PRIVATE_HOOK',script:'PRIVATE_SCRIPT',caption:'PRIVATE_CAPTION',cta:'PRIVATE_CTA',pillar:'PRIVATE_PILLAR'})).ok,true);
  const before=t.snapshot(),parents=t.parents(),list=await p.list(),item=await p.detail(t.contentId);
  assert.deepEqual(Object.keys(list).sort(),['ok','items','view','page','hasMore'].sort());
  assert.deepEqual(Object.keys(list.items[0]).sort(),keys);
  assert.deepEqual(Object.keys(item).sort(),[...keys,'files'].sort());
  assert.equal(item.statusLabel,'In progress');assert.equal(item.recordingNeeded,true);
  assert.doesNotMatch(JSON.stringify([list,item]),/PRIVATE|revision|workspace|clientId|service|owner|createdBy|context|objectKey|activity|script|caption|hook|cta|pillar/);
  assert.deepEqual(t.snapshot(),before);assert.deepEqual(t.parents(),parents);
});
test('canonical service-less and multi-service Content is readable; unrelated services alone do not create navigation', async () => {
  const t=await setup(),p=await reads(t);
  const standalone=(await t.add({visibility:'client',platforms:['Instagram','YouTube']})).contentId;
  assert.equal((await p.detail(standalone)).platforms.join(),'Instagram,YouTube');
  assert.equal(await p.nav(),true);assert.equal(await hasPortalContent(t.db,await t.actor('lawrence')),false);
  run(t.raw,"UPDATE service_engagements SET status='completed' WHERE id='social-service'");
  assert.ok(await p.detail(t.contentId),'terminal service status does not invent a read restriction');
  run(t.raw,"UPDATE content_items SET visibility='internal'");assert.equal(await p.nav(),false);
  assert.deepEqual((await p.list()).items,[]);
});
for (const [label, publishedAt, eligible] of [
  ['older than 30 days', '2026-08-31T11:59:59.999Z', false],
  ['exactly 30 days', '2026-08-31T12:00:00.000Z', true],
  ['recent', '2026-09-29T12:00:00.000Z', true],
  ['now', '2026-09-30T12:00:00.000Z', true],
  ['future', '2026-09-30T12:00:00.001Z', false],
]) test(`Published-only destination ${label} agrees with discoverable Content`, async () => {
  const t = await setup(), actor = await t.actor('james'), now = new Date('2026-09-30T12:00:00.000Z');
  run(t.raw, "UPDATE content_items SET stage='published',stage_context=NULL,published_at=? WHERE id=?", publishedAt, t.contentId);
  assert.equal(await hasPortalContent(t.db, actor, { now }), eligible);
  for (const view of ['current', 'action']) assert.deepEqual((await portalContent(t.db, actor, { view }, { now })).items, []);
  const published = await portalContent(t.db, actor, { view: 'published' }, { now });
  assert.deepEqual(published.items.map(item => item.id), eligible ? [t.contentId] : []);
  assert.equal(published.hasMore, false);
});
test('only hidden or foreign current/recent rows cannot activate the Content destination', async () => {
  const t = await setup(), actor = await t.actor('james'), now = new Date('2026-09-30T12:00:00.000Z');
  run(t.raw, "UPDATE content_items SET visibility='internal'");
  for (const visibility of ['internal', 'restricted', 'client']) {
    const parent = visibility === 'client' ? { clientId: 'lawrence' } : {};
    await t.add({ visibility }, parent);
    const id = (await t.add({ visibility }, parent)).contentId;
    run(t.raw, "UPDATE content_items SET stage='published',published_at='2026-09-29T00:00:00.000Z' WHERE id=?", id);
  }
  assert.equal(await hasPortalContent(t.db, actor, { now }), false);
  for (const view of ['current', 'action', 'published']) assert.deepEqual((await portalContent(t.db, actor, { view }, { now })).items, []);
});
for (const who of ['ellen','ary','pm','sam','other','foreign','lawrence']) test(`${who} cannot reuse Client Content reads outside a linked Client role`,async()=>{
  const t=await setup(),actor=await t.actor(who);
  t.assign('sam','social-service');run(t.raw,"UPDATE content_items SET owner_membership_id='m-sam'");
  assert.equal(await hasPortalContent(t.db,actor),false);assert.equal(await getPortalContent(t.db,actor,t.contentId),null);
  const result=await portalContent(t.db,actor);assert.ok(!result.ok||result.items.length===0);
});
const revoked={
  suspended:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",
  removed:"DELETE FROM workspace_memberships WHERE id='m-james'",
  role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",
  workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",
  contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",
  internal:"UPDATE content_items SET visibility='internal'",
  restricted:"UPDATE content_items SET visibility='restricted'",
  social:"UPDATE service_types SET department_id='systems' WHERE id='type-social'",
  department:"UPDATE departments SET slug='renamed' WHERE id='social'",
};
for(const [kind,statement] of Object.entries(revoked))test(`stale actor ${kind} revocation removes navigation, list, detail and File metadata`,async()=>{
  const t=await setup(),p=await reads(t);assert.ok(await p.detail(t.contentId));run(t.raw,statement);
  assert.equal(await p.nav(),false);assert.deepEqual((await p.list()).items,[]);assert.equal(await p.detail(t.contentId),null);
});
test('detail batch rechecks current authority after its caller already authorized the resource',async()=>{
  const t=await setup(),p=await reads(t);await t.upload({visibility:'client'});
  t.beforeBatch(()=>run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'"));
  assert.equal(await p.detail(t.contentId),null);
});
test('pagination filters hidden and foreign rows before limit, with no hidden overflow or counts',async()=>{
  const t=await setup(),p=await reads(t);run(t.raw,"UPDATE content_items SET visibility='internal'");
  for(let i=0;i<45;i++)await t.add({title:`PRIVATE ${i}`,visibility:i%2?'restricted':'internal',targetPublishDate:'2026-01-01'});
  for(let i=0;i<25;i++)await t.add({title:`FOREIGN ${i}`,visibility:'client'},{clientId:'lawrence'});
  const ids=[];for(let i=0;i<21;i++)ids.push((await t.add({title:`Shared ${i}`,visibility:'client',targetPublishDate:'2026-09-22'})).contentId);
  const first=await p.list(),second=await p.list({page:'2'});assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(second.items.length,1);assert.equal(second.hasMore,false);
  assert.deepEqual([...first.items,...second.items].map(i=>i.id),ids.sort());
  run(t.raw,'UPDATE content_items SET visibility=\'internal\' WHERE id=?',second.items[0].id);
  assert.equal((await p.list()).hasMore,false);assert.deepEqual((await p.list({page:'2'})).items,[]);
});
test('recent Published uses canonical timestamp with inclusive 30-day boundary and deterministic tie order',async()=>{
  const t=await setup(),p=await reads(t),now=new Date('2026-09-30T12:00:00.000Z');
  const expected=[];for(const [label,stamp,visible] of [['edge','2026-08-31T12:00:00.000Z',true],['old','2026-08-31T11:59:59.999Z',false],['today','2026-09-30T12:00:00.000Z',true],['future','2026-09-30T12:00:00.001Z',false]]){
    const id=(await t.add({title:label,visibility:'client'})).contentId;run(t.raw,"UPDATE content_items SET stage='published',published_at=? WHERE id=?",stamp,id);if(visible)expected.unshift(id);
  }
  const result=await portalContent(t.db,p.actor,{view:'published'},{now});assert.deepEqual(result.items.map(i=>i.id),expected);assert.ok(result.items.every(i=>i.statusLabel==='Published'));
  assert.equal((await p.list()).items.length,1);
});
test('recording and approval flags follow C4/C5, and completed or withdrawn requests never stay actionable',async()=>{
  const t=await setup(),p=await reads(t),id=(await t.add({visibility:'client',script:'REVIEW_ONLY'})).contentId;
  run(t.raw,"UPDATE content_items SET stage='client_review' WHERE id=?",id);
  assert.equal((await p.detail(id)).approvalRoundId,null);
  const first=await ask(t,id);assert.equal(first.ok,true);assert.equal((await p.detail(id)).approvalRoundId,first.roundId);
  assert.equal((await p.list({view:'action'})).items.length,2);
  assert.equal((await withdrawContentApproval(t.db,{actor:t.owner,roundId:first.roundId,input:{expectedRevision:(await t.item(id)).revision}})).ok,true);
  assert.equal((await p.detail(id)).approvalRoundId,null);
  const second=await ask(t,id);assert.equal((await respondContentApproval(t.db,{actor:p.actor,roundId:second.roundId,input:{decision:'approved'}})).ok,true);
  assert.equal((await p.detail(id)).approvalRoundId,null);assert.equal((await p.detail(id)).statusLabel,'Ready');
  run(t.raw,"UPDATE content_items SET stage='editing',stage_context=NULL WHERE id=?",t.contentId);
  assert.equal((await p.detail(t.contentId)).recordingNeeded,false);assert.deepEqual((await p.list({view:'action'})).items,[]);
});
test('File indicators correlate to this Content and only expose canonical Ready recording downloads',async()=>{
  const t=await setup(),p=await reads(t),empty=(await t.add({visibility:'client',recordingRequired:true})).contentId;
  run(t.raw,"UPDATE content_items SET stage='waiting_for_recording',stage_context='private' WHERE id=?",empty);
  const ready=await t.upload({visibility:'client',filename:'Shared.mp4'});assert.equal(ready.ok,true);
  for(const input of [{visibility:'internal'},{visibility:'restricted'},{visibility:'client',purpose:'asset'}])assert.equal((await t.upload(input)).ok,true);
  t.bucket.beforePut=async()=>{assert.doesNotMatch(JSON.stringify(await p.detail(t.contentId)),/PRIVATE_UPLOADING/);throw new Error('Simulated upload interruption');};
  assert.equal((await t.upload({visibility:'client',filename:'PRIVATE_UPLOADING.mp4'})).ok,false);t.bucket.beforePut=null;
  const archived=await t.upload({visibility:'client',filename:'PRIVATE_ARCHIVED.mp4'});assert.equal((await t.change(archived.fileId,'archive')).ok,true);
  const detail=await p.detail(t.contentId);assert.equal(detail.hasFiles,true);assert.equal(detail.files.items.length,1);assert.equal(detail.files.items[0].id,ready.fileId);
  assert.deepEqual(Object.keys(detail.files.items[0]).sort(),['id','filename','mimeType','byteSize','status','readyAt'].sort());
  assert.equal((await p.detail(empty)).hasFiles,false);assert.equal((await p.list()).items.find(i=>i.id===empty).hasFiles,false);
  assert.ok(await t.download(ready.fileId,p.actor));
  run(t.raw,"UPDATE content_items SET stage='editing',stage_context=NULL WHERE id=?",t.contentId);
  const after=await p.detail(t.contentId);assert.equal(after.hasFiles,false);assert.deepEqual(after.files.items,[]);assert.equal(await t.download(ready.fileId,p.actor),null);
});
test('exact query grammar rejects authority, malformed pages, prototypes, duplicates and unknown views',()=>{
  for(const query of [{workspaceId:'a'},{view:'toString'},{view:['current']},{view:''},{page:'0'},{page:'-1'},{page:'1.5'},{page:'1e2'},{page:'1000000'},{page:['1','2']},[],null])assert.equal(portalContentFilters(query).ok,false,JSON.stringify(query));
  assert.equal(portalContentFilters({view:'action',page:'2'}).page,2);
});
