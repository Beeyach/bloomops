import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_content-calendar.mjs';
import { run,all } from './_bloomops-db.mjs';
test('C3 is additive: association plus query/FK indexes, no schedule columns or historical table changes',async()=>{
 const read=p=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${p}`,import.meta.url))),before=read('0014_snapshot.json'),after=read('0015_snapshot.json');assert.equal(after.prevId,before.id);assert.equal(read('_journal.json').entries[15].tag,'0015_c3_calendar_platforms');assert.deepEqual(Object.keys(after.tables).filter(k=>!before.tables[k]),['content_platforms']);for(const[k,v]of Object.entries(before.tables))if(k!=='content_items')assert.deepEqual(after.tables[k],v);assert.deepEqual(after.tables.content_items.columns,before.tables.content_items.columns);assert.equal(Object.keys(after.tables.content_items.indexes).length,7);
 const migration=readFileSync(new URL('../drizzle/0015_c3_calendar_platforms.sql',import.meta.url),'utf8');assert.doesNotMatch(migration,/\b(?:DROP|ALTER)\s+TABLE/i);const t=await setup();assert.equal(all(t.raw,'PRAGMA table_info(content_platforms)').length,4);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('database denies duplicate, missing and cross-workspace associations and empty/oversize values',async()=>{
 const t=await setup(),id=(await t.add({platforms:['Channel']})).contentId;
 for(const[ws,content,key,label]of [['a',id,'channel','Again'],['b',id,'new','New'],['a','missing','new','New'],['a',id,'','New'],['a',id,'new',''],['a',id,'x'.repeat(121),'New'],['a',id,'new','x'.repeat(61)]])assert.throws(()=>run(t.raw,'INSERT INTO content_platforms VALUES(?,?,?,?)',ws,content,key,label));assert.equal((await t.item(id)).platforms.length,1);
});
