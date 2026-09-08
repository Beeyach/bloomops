import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_content.mjs';
import { run, all } from './_bloomops-db.mjs';
test('C2 adds only current context and stage index; historical schema, triggers and rows survive',async()=>{
 const read=p=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${p}`,import.meta.url))),before=read('0013_snapshot.json'),after=read('0014_snapshot.json');assert.equal(after.prevId,before.id);assert.equal(read('_journal.json').entries[14].tag,'0014_c2_content_pipeline');assert.deepEqual(Object.keys(after.tables),Object.keys(before.tables));for(const[k,v]of Object.entries(before.tables))if(k!=='content_items')assert.deepEqual(after.tables[k],v);
 assert.deepEqual(Object.keys(after.tables.content_items.columns).filter(k=>!before.tables.content_items.columns[k]),['stage_context']);assert.equal(Object.keys(after.tables.content_items.indexes).length,Object.keys(before.tables.content_items.indexes).length+1);
 const migration=readFileSync(new URL('../drizzle/0014_c2_content_pipeline.sql',import.meta.url),'utf8');assert.doesNotMatch(migration,/\b(?:DROP|CREATE)\s+TABLE/i);assert.match(migration,/ALTER TABLE/);
 const t=await setup();assert.equal(all(t.raw,'PRAGMA table_info(content_items)').length,24);assert.equal(all(t.raw,"SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='content_items'").length,2);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('database limits current context to bounded waiting/revision text',async()=>{
 const t=await setup(),id=(await t.add()).contentId;for(const [stage,context]of [['idea','Context'],['revision_requested',''],['waiting_for_recording','x'.repeat(2001)]])assert.throws(()=>run(t.raw,'UPDATE content_items SET stage=?,stage_context=? WHERE id=?',stage,context,id));run(t.raw,"UPDATE content_items SET stage='revision_requested',stage_context=? WHERE id=?",'x'.repeat(2000),id);assert.equal((await t.item(id)).stageContext.length,2000);
});
