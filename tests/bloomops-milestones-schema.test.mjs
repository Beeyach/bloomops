import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_milestones.mjs';
import { all, run } from './_bloomops-db.mjs';

test('B2 migration adds only Milestones and indexes, with matching journal/snapshot and same-workspace FK',async()=>{
  const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url)));
  assert.equal(journal.entries.at(-1).tag,'0009_b2_milestones');assert.equal(journal.entries.length,10);
  const sql=readFileSync(new URL('../drizzle/0009_b2_milestones.sql',import.meta.url),'utf8');assert.doesNotMatch(sql,/\b(?:ALTER|DROP)\s+TABLE/i);
  const snapshot=JSON.parse(readFileSync(new URL('../drizzle/meta/0009_snapshot.json',import.meta.url)));
  assert.ok(snapshot.tables.milestones);assert.equal(Object.keys(snapshot.tables.milestones.indexes).length,4);
  const t=await setup();assert.equal(all(t.raw,'PRAGMA table_info(milestones)').length,16);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
  for(const [ws,project]of [['b',t.projectId],['a','guessed']])assert.throws(()=>run(t.raw,"INSERT INTO milestones(workspace_id,project_id,creation_request_id,name,position) VALUES(?,?,?,'Bad',0)",ws,project,crypto.randomUUID()),/FOREIGN KEY/);
});
for(const [column,value]of [['status','ready'],['visibility','public'],['name',''],['name','x'.repeat(121)],['client_label',''],['revision',0],['revision',1.5],['position',-1],['position',0.5],['position',9007199254740992],['creation_request_id','bad'],['completed_at','forged'],['start_date','2026-02-30'],['target_date','invalid'],['start_date','2026-13-01']])test(`database rejects invalid Milestone ${column}=${String(value).slice(0,15)}`,async()=>{
  const t=await setup(),{milestoneId:id}=await t.add();assert.throws(()=>run(t.raw,`UPDATE milestones SET ${column}=? WHERE id=?`,value,id),/CHECK/);
});
test('position/request uniqueness, dates and completion coherence survive direct SQL',async()=>{
  const t=await setup(),a=await t.add(),b=await t.add();
  const m=await t.milestone(a.milestoneId);
  for(const queryof of ["position=0",`creation_request_id='${m.creationRequestId}'`])assert.throws(()=>run(t.raw,`UPDATE milestones SET ${queryof} WHERE id=?`,b.milestoneId),/UNIQUE/);
  for(const patch of ["status='completed'","start_date='2026-09-10',target_date='2026-09-09'","status='skipped',completed_at='2026-09-08T12:00:00Z'"])assert.throws(()=>run(t.raw,`UPDATE milestones SET ${patch} WHERE id=?`,a.milestoneId),/CHECK/);
  const event=t.history()[0];assert.throws(()=>run(t.raw,"UPDATE activity_events SET metadata_json='{}' WHERE id=?",event.id),/immutable/);assert.throws(()=>run(t.raw,'DELETE FROM activity_events WHERE id=?',event.id),/immutable/);
});
