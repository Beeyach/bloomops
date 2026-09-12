import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_content-approvals.mjs';
import { all,run } from './_bloomops-db.mjs';

test('0017 is additive, preserves every C4 table definition, and adds only the two Content approval tables',async()=>{
  const read=name=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${name}`,import.meta.url),'utf8')),before=read('0016_snapshot.json'),after=read('0017_snapshot.json');
  assert.equal(after.prevId,before.id);assert.equal(read('_journal.json').entries[17].tag,'0017_c5_content_approvals');
  assert.deepEqual(Object.keys(after.tables).filter(k=>!before.tables[k]).sort(),['content_approval_rounds','content_review_revisions']);
  for(const [key,value] of Object.entries(before.tables))assert.deepEqual(after.tables[key],value,key);
  const migration=readFileSync(new URL('../drizzle/0017_c5_content_approvals.sql',import.meta.url),'utf8');assert.doesNotMatch(migration,/\bDROP\s+(TABLE|TRIGGER|INDEX)|\bALTER\s+TABLE/i);
  const t=await setup();assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);assert.equal(all(t.raw,'PRAGMA table_info(content_items)').length,26);
  assert.equal(all(t.raw,"SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'content_%approval%' OR name LIKE 'content_review_revisions_%')").length,11);
});
for(const table of ['content_review_revisions','content_approval_rounds'])test(`${table} history cannot be deleted or retargeted`,async()=>{
  const t=await setup();await t.request();const before=t.snapshot();
  for(const query of [`DELETE FROM ${table}`,`UPDATE ${table} SET content_id='other'`,`UPDATE ${table} SET workspace_id='b'`,`UPDATE ${table} SET number=5`])assert.throws(()=>run(t.raw,query));
  assert.deepEqual(t.snapshot(),before);
});
for(const terminal of ['approved','changes_requested','withdrawn'])test(`${terminal} round, provenance and feedback are immutable`,async()=>{
  const t=await setup(),{roundId}=await t.request();if(terminal==='withdrawn')await t.withdraw(roundId,{reason:'Rework'});else await t.respond(roundId,terminal,terminal==='changes_requested'?'Please revise':null);
  const before=t.snapshot();for(const change of ["status='requested'","feedback='Rewritten'","requested_at='2030-01-01'","responded_by='m-ary'","withdrawal_reason='Rewritten'","completion_revision=99"])assert.throws(()=>run(t.raw,`UPDATE content_approval_rounds SET ${change}`));assert.deepEqual(t.snapshot(),before);
});
test('one Requested round, same Content/workspace revision, and immutable snapshots are independently enforced',async()=>{
  const t=await setup(),{roundId}=await t.request(),row=all(t.raw,'SELECT * FROM content_approval_rounds')[0],before=t.snapshot();
  for(const change of ["title='Changed'","script='Changed'","platforms_json='[]'","target_publish_date='2030-01-01'"])assert.throws(()=>run(t.raw,`UPDATE content_review_revisions SET ${change}`));
  const insert=(contentId,workspaceId,revisionId,number=1)=>run(t.raw,"INSERT INTO content_approval_rounds(id,workspace_id,content_id,revision_id,number,request_id,request_revision,requested_by,requested_at) VALUES(?,?,?,?,?,?,1,'m-ellen','2026-09-09T00:00:00.000Z')",crypto.randomUUID(),workspaceId,contentId,revisionId,number,crypto.randomUUID());
  assert.throws(()=>insert(t.contentId,'a',row.revision_id));assert.throws(()=>insert('other','a',row.revision_id));assert.throws(()=>insert(t.contentId,'b',row.revision_id));assert.throws(()=>insert(t.contentId,'a',row.revision_id,2));
  assert.deepEqual(t.snapshot(),before);assert.equal((await t.rounds()).items[0].id,roundId);
});
for(const query of ["UPDATE content_items SET title='Bypass'","UPDATE content_items SET stage='approved'","UPDATE content_items SET client_approval_required=0","UPDATE content_items SET target_publish_date='2026-09-28'","DELETE FROM content_platforms","UPDATE content_platforms SET label='Bypass'","INSERT INTO content_platforms(workspace_id,content_id,platform_key,label) SELECT workspace_id,id,'extra','Extra' FROM content_items"])test(`database independently freezes requested review: ${query.slice(0,60)}`,async()=>{
  const t=await setup();await t.request();const before=t.snapshot();assert.throws(()=>run(t.raw,query));assert.deepEqual(t.snapshot(),before);
});
test('history pages have a stable 20-round bound, monotonic numbers and one newest actionable round',async()=>{
  const t=await setup();for(let n=1;n<=23;n++){const result=await t.request();assert.equal(result.ok,true);if(n<23)assert.equal((await t.withdraw(result.roundId)).ok,true);}
  const first=await t.rounds(),second=await t.rounds(t.owner,2);assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.deepEqual(first.items.map(r=>r.number),Array.from({length:20},(_,i)=>23-i));assert.deepEqual(second.items.map(r=>r.number),[3,2,1]);assert.equal(second.hasMore,false);
  assert.equal((await t.requests()).items.length,1);assert.equal(all(t.raw,'SELECT * FROM content_review_revisions').length,23);
});
