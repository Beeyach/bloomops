import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_deliverables.mjs';
import { all, run } from './_bloomops-db.mjs';

test('B4 migration adds only Deliverables with the same-workspace Project reference and matching snapshot',async()=>{
  const read=path=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${path}`,import.meta.url)));
  const journal=read('_journal.json'),before=read('0010_snapshot.json'),after=read('0011_snapshot.json');
  assert.equal(journal.entries.length,12);assert.equal(journal.entries[11].tag,'0011_b4_deliverables');assert.equal(after.prevId,before.id);
  assert.deepEqual(Object.keys(after.tables).filter(name=>!before.tables[name]),['deliverables']);for(const[name,table]of Object.entries(before.tables))assert.deepEqual(after.tables[name],table,name);
  assert.equal(Object.keys(after.tables.deliverables.indexes).length,2);
  const migration=readFileSync(new URL('../drizzle/0011_b4_deliverables.sql',import.meta.url),'utf8');assert.doesNotMatch(migration,/\b(?:ALTER|DROP)\s+TABLE/i);
  const t=await setup();assert.equal(all(t.raw,'PRAGMA table_info(deliverables)').length,14);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
  for(const[ws,project]of [['b',t.projectId],['a','guessed']])assert.throws(()=>run(t.raw,"INSERT INTO deliverables(workspace_id,project_id,creation_request_id,title) VALUES(?,?,?,'Bad')",ws,project,crypto.randomUUID()),/FOREIGN KEY/);
});
for(const[column,value]of [['title',''],['title','x'.repeat(121)],['client_label',''],['client_label','x'.repeat(121)],['description',''],['description','x'.repeat(5001)],['status','done'],['visibility','public'],['revision',0],['revision',1.5],['creation_request_id','bad'],['target_date','2026-02-30'],['target_date','invalid'],['target_date','2026-13-01'],['delivered_at','forged']])test(`database rejects invalid Deliverable ${column}=${String(value).slice(0,15)}`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add();assert.throws(()=>run(t.raw,`UPDATE deliverables SET ${column}=? WHERE id=?`,value,id),/CHECK/);
});
test('request uniqueness, delivered timestamp coherence and immutable history survive direct SQL',async()=>{
  const t=await setup(),a=await t.add(),b=await t.add();
  assert.throws(()=>run(t.raw,'UPDATE deliverables SET creation_request_id=(SELECT creation_request_id FROM deliverables WHERE id=?) WHERE id=?',a.deliverableId,b.deliverableId),/UNIQUE/);
  for(const patch of ["status='delivered'","status='cancelled',delivered_at='2026-09-08T12:00:00Z'"])assert.throws(()=>run(t.raw,`UPDATE deliverables SET ${patch} WHERE id=?`,a.deliverableId),/CHECK/);
  const event=t.history()[0];assert.throws(()=>run(t.raw,"UPDATE activity_events SET metadata_json='{}' WHERE id=?",event.id),/immutable/);assert.throws(()=>run(t.raw,'DELETE FROM activity_events WHERE id=?',event.id),/immutable/);
});
