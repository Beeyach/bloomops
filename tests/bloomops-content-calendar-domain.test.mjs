import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-calendar.mjs';
import { run } from './_bloomops-db.mjs';
import { normalizePlatforms } from '../lib/bloomops/content-platform-values.mjs';
import { contentCalendarFilters } from '../lib/bloomops/content-calendar.mjs';
import { contentMonth, contentDateLabel } from '../lib/bloomops/content-calendar-values.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
for(const values of [null,1,'Channel',{},[null],[''],[' '],['a','A'],['a b',' a  b '],['é','e\u0301'],['x'.repeat(61)],['😀'.repeat(31)],['\u202e'],['\u200b'],['\ud800'],['a\nb'],Array.from({length:13},(_,i)=>String(i))])test(`platform validation rejects ${JSON.stringify(values)}`,()=>assert.equal(normalizePlatforms(values).ok,false));
test('normalization preserves display spelling, normalizes keys and matches database Unicode order',async()=>{
 const t=await setup(),labels=['\u{10000}','\ue000','  Agency\u00a0  channel ','e\u0301','İ'.repeat(60)],id=(await t.add({platforms:labels})).contentId;
 assert.deepEqual((await t.item(id)).platforms,normalizePlatforms(labels).platforms);assert.equal((await t.platforms(id,labels)).unchanged,true);assert.equal(t.history().length,1);
 assert.equal((await t.list(t.owner,{platform:'İ'.repeat(60)})).items.length,1);
});
for(const count of [0,1,12])test(`create ${count} platforms and retry after later edits preserve original request evidence`,async()=>{
 const t=await setup(),labels=Array.from({length:count},(_,i)=>`Channel ${i}`),requestId=crypto.randomUUID(),input={platforms:labels,targetPublishDate:'2026-09-08'},first=await t.add(input,{requestId}),id=first.contentId;assert.ok(first.ok);assert.equal((await t.item(id)).platforms.length,count);
 await t.platforms(id,['Later']);await t.edit(id,{caption:'Later edit'});const before=t.snapshot();assert.equal((await t.add(input,{requestId})).unchanged,true);assert.equal((await t.add({...input,platforms:['Other']},{requestId})).reason,'conflict');assert.deepEqual(t.snapshot(),before);
});
test('same set and missing removal are silent no-ops; labels can change while keys stay unique',async()=>{
 const t=await setup(),id=(await t.add()).contentId,parents=t.parents();assert.equal((await t.platforms(id,[])).unchanged,true);assert.ok((await t.platforms(id,['Channel'])).ok);
 assert.equal((await t.platforms(id,['Channel'],{input:{platforms:['Channel'],expectedRevision:2}})).unchanged,true);
 assert.ok((await t.platforms(id,[],{input:{platforms:['CHANNEL'],expectedRevision:2}})).ok);assert.equal((await t.item(id)).platforms.length,1);
 assert.ok((await t.platforms(id,[],{input:{platforms:[],expectedRevision:3}})).ok);assert.equal((await t.item(id)).platforms.length,0);assert.deepEqual(t.parents(),parents);assert.equal((await t.item(id)).stage,'idea');assert.equal((await t.item(id)).targetPublishDate,null);
});
for(const kind of ['identical','different','remove','edit','transition'])test(`concurrent ${kind} consumes one canonical revision`,async()=>{
 const t=await setup(),id=(await t.add({platforms:['Initial'],targetPublishDate:'2026-09-08'})).contentId;
 const first=()=>t.platforms(id,['One']);const other=kind==='identical'?first:kind==='edit'?()=>t.edit(id,{caption:'Concurrent'},{expectedRevision:1}):kind==='transition'?()=>transitionContent(t.db,{actor:t.owner,contentId:id,input:{targetStage:'script',expectedRevision:1}}):()=>t.platforms(id,kind==='remove'?[]:['Two']);
 const results=await Promise.all([first(),other()]);assert.equal(results.filter(r=>r.ok).length,kind==='identical'?2:1);assert.equal((await t.item(id)).revision,2);assert.equal(t.history().length,2);assert.equal((await t.item(id)).targetPublishDate,'2026-09-08');
 const before=t.snapshot();if(results[0].ok){assert.equal((await first()).unchanged,true);assert.deepEqual(t.snapshot(),before);}
});
test('old consumed revision retry survives later platform, detail and stage changes without restoring old set',async()=>{
 const t=await setup(),id=(await t.add()).contentId;await t.platforms(id,['First']);await t.platforms(id,[],{input:{platforms:['Second'],expectedRevision:2}});await t.edit(id,{caption:'Edited'});await transitionContent(t.db,{actor:t.owner,contentId:id,input:{targetStage:'script',expectedRevision:4}});const before=t.snapshot();assert.equal((await t.platforms(id,['First'])).unchanged,true);assert.equal((await t.platforms(id,['Other'])).reason,'conflict');assert.deepEqual(t.snapshot(),before);
});
for(const fault of ['activity','delete','insert','fact'])test(`platform ${fault} failure rolls back set, revision and immutable history`,async()=>{
 const t=await setup(),id=(await t.add({platforms:['Initial']})).contentId,before=t.snapshot();run(t.raw,`CREATE TRIGGER fail_c3 BEFORE ${{activity:'INSERT ON activity_events',delete:'DELETE ON content_platforms',insert:'INSERT ON content_platforms',fact:'UPDATE ON content_items'}[fault]} BEGIN SELECT RAISE(ABORT,'injected'); END`);await assert.rejects(t.platforms(id,['New']));assert.deepEqual(t.snapshot(),before);
});
for(const fault of ['activity','insert'])test(`creation ${fault} failure rolls back initial platforms and Content`,async()=>{
 const t=await setup(),before=t.snapshot();run(t.raw,`CREATE TRIGGER fail_c3 BEFORE INSERT ON ${fault==='activity'?'activity_events':'content_platforms'} BEGIN SELECT RAISE(ABORT,'injected'); END`);await assert.rejects(t.add({platforms:['New']}));assert.deepEqual(t.snapshot(),before);
});
for(const query of [null,[],{}, {start:'2026-02-29',end:'2026-03-01'},{start:'2026-9-01',end:'2026-09-30'},{start:'2026-09-30',end:'2026-09-01'},{start:'2026-01-01',end:'2026-02-12'},{start:'0099-01-01',end:'0099-01-02'},{start:['2026-01-01'],end:'2026-01-02'},{start:'2026-09-01',end:'2026-09-30',month:'2026-09'}])test(`calendar rejects exact invalid range ${JSON.stringify(query)}`,()=>assert.equal(contentCalendarFilters(query).ok,false));
test('range endpoints, 42 inclusive days, leap/year edges and floating date labels',()=>{
 for(const [start,end]of [['2026-01-01','2026-02-11'],['2024-02-29','2024-02-29'],['0100-01-01','0100-01-01'],['9999-12-31','9999-12-31'],['2025-12-31','2026-01-01']])assert.ok(contentCalendarFilters({start,end}).ok);
 assert.equal(contentMonth('2024-02').end,'2024-02-29');assert.equal(contentMonth('2100-02').end,'2100-02-28');assert.equal(contentMonth('0100-01').previous,null);assert.equal(contentMonth('9999-12').next,null);for(const month of ['2026-2','2026-13','0099-12',[],null])assert.equal(contentMonth(month),null);assert.match(contentDateLabel('2026-09-01'),/Sep 1, 2026/);
});
test('calendar is a projection of target date even when Published instant differs; filters and reads leave all facts unchanged',async()=>{
 const t=await setup(),a=(await t.add({platforms:['Channel','Second'],targetPublishDate:'2026-09-01'})).contentId,b=(await t.add({targetPublishDate:'2026-09-30'},{clientId:'lawrence',serviceEngagementId:null})).contentId;
 for(const date of [null,'2026-08-31','2026-10-01'])await t.add({targetPublishDate:date});run(t.raw,"UPDATE content_items SET stage='published',published_at='2026-10-01T23:00:00.000Z' WHERE id=?",a);const before=t.snapshot();
 assert.deepEqual((await t.calendar()).items.map(i=>i.id),[a,b]);const result=await t.calendar(t.owner,{platform:' CHANNEL ',stage:'published',clientId:'james'});assert.equal(result.items.length,1);assert.equal(result.items[0].publishedAt,'2026-10-01T23:00:00.000Z');assert.equal(result.items[0].platforms.length,2);assert.equal((await t.list(t.owner,{platform:'channel'})).items.length,1);assert.deepEqual(t.snapshot(),before);
});
test('205 same-day multi-platform rows paginate deterministically; hidden rows never affect overflow or emptiness',async()=>{
 const t=await setup();t.assign();for(let i=0;i<205;i++){const id=`dense-${String(i).padStart(3,'0')}`;run(t.raw,"INSERT INTO content_items(id,workspace_id,client_id,creation_request_id,title,type,target_publish_date) VALUES(?,'a','james',?,'Dense','reel','2026-09-08')",id,crypto.randomUUID());for(const key of ['one','two'])run(t.raw,"INSERT INTO content_platforms VALUES('a',?,?,?)",id,key,key);}
 for(let i=0;i<210;i++)run(t.raw,"INSERT INTO content_items(workspace_id,client_id,creation_request_id,title,type,target_publish_date) VALUES('a','lawrence',?,'Hidden','reel','2026-09-08')",crypto.randomUUID());
 const sam=await t.actor('sam'),a=await t.calendar(sam,{platform:'one'}),b=await t.calendar(sam,{page:'2',platform:'one'});assert.equal(a.items.length,200);assert.equal(b.items.length,5);assert.ok(a.hasMore);assert.equal(b.hasMore,false);assert.deepEqual([...a.items,...b.items].map(i=>i.id),Array.from({length:205},(_,i)=>`dense-${String(i).padStart(3,'0')}`));run(t.raw,"DELETE FROM client_assignments WHERE membership_id='m-sam'");const empty=await t.calendar(sam);assert.deepEqual(empty.items,[]);assert.equal(empty.hasMore,false);
});
test('240 assignments and 12 platforms use one bounded calendar SELECT without N+1, writes or R2',async()=>{
 const t=await setup();t.assign();for(let i=0;i<240;i++){run(t.raw,"INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`many-${i}`,`Client ${i}`,`many-${i}`);run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);}await t.add({platforms:Array.from({length:12},(_,i)=>`Channel ${i}`),targetPublishDate:'2026-09-08'});const actor=await t.actor('sam'),before=t.snapshot(),prepare=t.d1.prepare.bind(t.d1);let count=0,max=0,bytes=0;t.d1.prepare=q=>{count++;assert.match(q,/^select /i);bytes=Math.max(bytes,Buffer.byteLength(q));const stmt=prepare(q),bind=stmt.bind.bind(stmt);stmt.bind=(...v)=>{max=Math.max(max,v.length);return bind(...v);};return stmt;};assert.equal((await t.calendar(actor,{platform:'Channel 1'})).items.length,1);assert.equal(count,1);assert.ok(max<=100);assert.ok(bytes<100000);assert.deepEqual(t.snapshot(),before);
});
