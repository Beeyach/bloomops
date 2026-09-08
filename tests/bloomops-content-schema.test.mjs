import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_content.mjs';
import { all,run } from './_bloomops-db.mjs';
import { CONTENT_STAGES, CONTENT_TYPES } from '../lib/bloomops/content-values.mjs';
test('C1 additive migration preserves all prior tables, composite ownership and snapshot chain',async()=>{
 const read=p=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${p}`,import.meta.url))),before=read('0012_snapshot.json'),after=read('0013_snapshot.json');
 assert.equal(read('_journal.json').entries[13].tag,'0013_c1_content');assert.equal(after.prevId,before.id);assert.deepEqual(Object.keys(after.tables).filter(k=>!before.tables[k]),['content_items']);for(const[k,v]of Object.entries(before.tables))assert.deepEqual(after.tables[k],v,k);
 assert.equal(Object.keys(after.tables.content_items.indexes).length,4);assert.equal(Object.keys(after.tables.content_items.foreignKeys).length,4);
 assert.doesNotMatch(readFileSync(new URL('../drizzle/0013_c1_content.sql',import.meta.url),'utf8'),/\b(?:ALTER|DROP)\s+TABLE/i);
 const t=await setup();assert.equal(all(t.raw,'PRAGMA table_info(content_items)').length,23);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
 for(const[ws,client,service]of[['b','james',null],['a','missing',null],['a','lawrence','social-service'],['a','james','ghl-service'],['a','james','foreign-service']])assert.throws(()=>run(t.raw,"INSERT INTO content_items(workspace_id,client_id,service_engagement_id,creation_request_id,title,type) VALUES(?,?,?,?,'Bad','reel')",ws,client,service,crypto.randomUUID()));
});
for(const[column,value]of[['title',''],['title','x'.repeat(201)],['pillar','x'.repeat(121)],['hook','x'.repeat(2001)],['script','x'.repeat(20001)],['caption','x'.repeat(10001)],['cta','x'.repeat(1001)],['type','post'],['stage','done'],['visibility','public'],['revision',0],['revision',1.5],['recording_required',2],['internal_review_required',-1],['client_approval_required','yes'],['target_publish_date','2026-02-30'],['target_publish_date','invalid'],['published_at','forged']])test(`SQL rejects invalid Content ${column}`,async()=>{
 const t=await setup(),{contentId}=await t.add();assert.throws(()=>run(t.raw,`UPDATE content_items SET ${column}=? WHERE id=?`,value,contentId),/CHECK/);
});
test('storage has complete exact type/stage vocabulary with coherent published timestamp',async()=>{
 const t=await setup(),{contentId}=await t.add();for(const type of CONTENT_TYPES)run(t.raw,'UPDATE content_items SET type=? WHERE id=?',type,contentId);
 for(const stage of CONTENT_STAGES)run(t.raw,'UPDATE content_items SET stage=?,published_at=? WHERE id=?',stage,stage==='published'?'2026-09-08T12:00:00Z':null,contentId);
 assert.throws(()=>run(t.raw,"UPDATE content_items SET published_at=NULL WHERE id=?",contentId),/CHECK/);
});
for(const field of['workspace_id','client_id','service_engagement_id','creation_request_id','id','created_at'])test(`SQL refuses immutable Content ${field}`,async()=>{
 const t=await setup(),{contentId}=await t.add();assert.throws(()=>run(t.raw,`UPDATE content_items SET ${field}='other' WHERE id=?`,contentId),/immutable/);
});
test('initial retry snapshot and semantic history remain immutable',async()=>{
 const t=await setup();await t.add();const event=t.history()[0];assert.throws(()=>run(t.raw,"UPDATE activity_events SET metadata_json='{}' WHERE id=?",event.id),/immutable/);assert.throws(()=>run(t.raw,'DELETE FROM activity_events WHERE id=?',event.id),/immutable/);
});
