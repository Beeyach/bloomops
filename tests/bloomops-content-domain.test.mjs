import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content.mjs';
import { all,one,run } from './_bloomops-db.mjs';
import { CONTENT_TYPES,CONTENT_DETAIL_FIELDS,CONTENT_TEXT_LIMITS,CONTENT_FLAG_DEFAULTS } from '../lib/bloomops/content-values.mjs';
import { contentOptions,normalizeContent } from '../lib/bloomops/content.mjs';

test('structured Content has fixed parents, exact defaults and no parent lifecycle effects',async()=>{
 const t=await setup(),parents=t.parents();
 for(const type of CONTENT_TYPES){const r=await t.add({type},{serviceEngagementId:'social-service'});assert.ok(r.ok);const item=await t.item(r.contentId);assert.equal(item.stage,'idea');assert.equal(item.publishedAt,null);assert.equal(item.visibility,'internal');for(const [k,v]of Object.entries(CONTENT_FLAG_DEFAULTS))assert.equal(item[k],v);assert.equal(item.serviceName,'social');}
 assert.deepEqual(t.parents(),parents);assert.equal(t.history().length,8);
 const r=await t.add();assert.equal((await t.item(r.contentId)).serviceEngagementId,null);
});
for(const [key,max]of Object.entries(CONTENT_TEXT_LIMITS))test(`${key} normalizes and enforces its practical bound`,async()=>{
 const t=await setup();assert.ok((await t.add({[key]:'x'.repeat(max)})).ok);
 for(const value of ['x'.repeat(max+1),4,{},[],true,'bad\u0000text','bad\u202etext','\ud800']){const before=t.snapshot();assert.equal((await t.add({[key]:value})).reason,'invalid');assert.deepEqual(t.snapshot(),before);}
 const result=await t.add({[key]:' cafe\u0301 '});assert.equal((await t.item(result.contentId))[key],'café');
});
for(const key of Object.keys(CONTENT_FLAG_DEFAULTS))test(`${key} accepts actual booleans only`,async()=>{
 const t=await setup();for(const value of [0,1,'false',null,{},[]])assert.equal((await t.add({[key]:value})).reason,'invalid');for(const value of [true,false]){const r=await t.add({[key]:value});assert.equal((await t.item(r.contentId))[key],value);}
});
for(const key of ['stage','publishedAt','clientId','serviceEngagementId','workspaceId','revision','creationRequestId','platforms','projectId','fileId','approvalId','recording_required'])test(`caller cannot write ${key}`,async()=>{
 const t=await setup(),r=await t.add(),before=t.snapshot();assert.equal((await t.add({[key]:'forged'})).reason,'invalid');assert.equal((await t.edit(r.contentId,{title:'Partial',[key]:'forged'})).reason,'invalid');assert.deepEqual(t.snapshot(),before);
});
test('dates, required fields and multiline editorial text are exact',async()=>{
 const t=await setup();for(const input of [{title:''},{type:'static'},{type:'Reel'},{visibility:'public'},{visibility:null},{targetPublishDate:'2026-02-30'},{targetPublishDate:{}},{targetPublishDate:'2026-2-02'}])assert.equal((await t.add(input)).reason,'invalid');
 const r=await t.add({hook:'First\r\nsecond',script:'Line\twith tabs\nnext',targetPublishDate:'2028-02-29'});assert.equal((await t.item(r.contentId)).hook,'First\nsecond');
 for(const input of [null,[],false,'text'])assert.equal(normalizeContent(input).reason,'invalid');
});
test('owner must be current internal workspace member; retained historical owner grants nothing',async()=>{
 const t=await setup();for(const id of ['m-james','m-foreign','missing'])assert.equal((await t.add({ownerMembershipId:id})).reason,'invalid');
 const r=await t.add({ownerMembershipId:'m-other'});assert.equal(await t.item(r.contentId,await t.actor('other')),null);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-other'");assert.ok((await t.edit(r.contentId,{title:'Keep owner',ownerMembershipId:'m-other'})).ok);assert.equal((await t.add({ownerMembershipId:'m-other'})).reason,'invalid');
});
for(const service of ['ghl-service','kajabi-service','foreign-service','missing'])test(`invalid parent ${service} is absent without writes`,async()=>{
 const t=await setup(),before=t.snapshot();assert.equal((await t.add({},{serviceEngagementId:service})).reason,'not_found');assert.deepEqual(t.snapshot(),before);
});
test('normalized UUID retries converge after edits; incompatible service/details conflict',async()=>{
 const t=await setup(),requestId=crypto.randomUUID(),first=await t.add({title:' café '},{requestId});assert.ok(first.ok);
 await t.edit(first.contentId,{title:'Later'});
 const retry=await t.add({title:'cafe\u0301'},{requestId:requestId.toUpperCase()});assert.equal(retry.contentId,first.contentId);assert.ok(retry.unchanged);assert.equal((await t.item(first.contentId)).title,'Later');
 assert.equal((await t.add({title:'different'},{requestId})).reason,'conflict');assert.equal((await t.add({title:'café'},{requestId,serviceEngagementId:'social-service'})).reason,'conflict');assert.equal(t.history().length,2);
 for(const key of ['bad',null,'00000000-0000-1000-8000-000000000000'])assert.equal((await t.add({},{requestId:key})).reason,'invalid');
});
test('overlapping identical and incompatible creates have one fact/event',async()=>{
 const t=await setup();for(const same of [true,false]){const requestId=crypto.randomUUID(),before=t.history().length;const r=await Promise.all([t.add({title:'First'},{requestId}),t.add({title:same?'First':'Second'},{requestId})]);assert.equal(r.filter(x=>x.ok).length,same?2:1);assert.equal(t.history().length,before+1);if(same)assert.equal(r[0].contentId,r[1].contentId);else assert.equal(r.find(x=>!x.ok).reason,'conflict');}
});
test('edit/edit CAS has one winner, including identical stale values',async()=>{
 const t=await setup(),{contentId}=await t.add();const r=await Promise.all(['Left','Right'].map(title=>t.edit(contentId,{title},{expectedRevision:1})));assert.equal(r.filter(x=>x.ok).length,1);assert.equal(r.find(x=>!x.ok).reason,'conflict');const row=await t.item(contentId);assert.equal(row.revision,2);assert.equal(t.history().length,2);assert.equal((await t.edit(contentId,{title:row.title},{expectedRevision:1})).reason,'conflict');
});
for(const op of ['create','edit'])for(const late of ['activity','fact'])test(`${op} late ${late} failure rolls back fact and significant event`,async()=>{
 const t=await setup(),r=await t.add(),before=t.snapshot();
 run(t.raw,late==='activity'?"CREATE TRIGGER fail BEFORE INSERT ON activity_events WHEN NEW.subject_type='content' BEGIN SELECT RAISE(ABORT,'late failure'); END":`CREATE TRIGGER fail BEFORE ${op==='create'?'INSERT':'UPDATE'} ON content_items BEGIN SELECT RAISE(ABORT,'late failure'); END`);
 await assert.rejects(op==='create'?t.add():t.edit(r.contentId,{title:'New'}));assert.deepEqual(t.snapshot(),before);
});
test('read pages have truthful visible overflow, no lifetime cap and exact filters',async()=>{
 const t=await setup();for(let i=0;i<205;i++)run(t.raw,"INSERT INTO content_items(id,workspace_id,client_id,creation_request_id,title,type,created_at) VALUES(?,'a','james',?,?,'reel',?)",`c-${i}`,crypto.randomUUID(),`Idea ${i}`,`2026-01-01T00:00:${String(i%60).padStart(2,'0')}.000Z`);
 for(let i=0;i<8;i++)await t.add({visibility:'restricted'});
 const pm=await t.actor('pm'),first=await t.list(pm),second=await t.list(pm,{page:'2'});assert.equal(first.items.length,200);assert.equal(first.hasMore,true);assert.equal(second.items.length,5);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,205);
 for(const query of [{bad:'x'},{page:'0'},{page:'1x'},{type:'constructor'},{clientId:[]}])assert.equal((await t.list(pm,query)).reason,'invalid');
 assert.equal((await t.list(pm,{clientId:'foreign-client'})).items.length,0);assert.equal((await t.list(pm,{type:'video'})).items.length,0);assert.ok((await t.add()).ok);
 const before=t.snapshot();await t.list();await contentOptions(t.db,t.owner);assert.deepEqual(t.snapshot(),before);assert.equal(all(t.raw,'PRAGMA foreign_key_check').length,0);
});

test('platform choices use authorized stored labels, including custom names, without crossing workspace or assignment',async()=>{
 const t=await setup();
 const created=await t.add();assert.ok(created.ok);
 run(t.raw,'INSERT INTO content_platforms(workspace_id,content_id,platform_key,label) VALUES(?,?,?,?)','a',created.contentId,'community board','Community Board');
 const options=await contentOptions(t.db,t.owner);
 assert.ok(options.platforms.some(p=>p.key==='community board'&&p.label==='Community Board'));
 const denied=await contentOptions(t.db,await t.actor('other'));
 assert.deepEqual(denied.platforms,[]);
});
