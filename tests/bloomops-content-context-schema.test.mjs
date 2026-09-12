import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { migrationFiles,d1Binding } from './_bloomops-db.mjs';
import { contentContextAcceptance } from '../scripts/content-context-acceptance.mjs';
test('E2A snapshot changes only Content context and preserves the journal chain',()=>{
  const read=name=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${name}`,import.meta.url))),before=read('0021_snapshot.json'),after=read('0022_snapshot.json');
  assert.equal(after.prevId,before.id);assert.equal(read('_journal.json').entries[22].tag,'0022_e2a_content_context');
  for(const [name,table] of Object.entries(before.tables)) if(name!=='content_items')assert.deepEqual(after.tables[name],table,name);
  const b=before.tables.content_items,a=after.tables.content_items;
  for(const field of ['columns','indexes','foreignKeys','checkConstraints']) for(const [name,value] of Object.entries(b[field]))assert.deepEqual(a[field][name],value,name);
  assert.equal(Object.keys(a.columns).length,Object.keys(b.columns).length+2);assert.equal(Object.keys(a.foreignKeys).length,Object.keys(b.foreignKeys).length+1);
  const sql=readFileSync(new URL('../drizzle/0022_e2a_content_context.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/foreign_keys\s*=\s*OFF|DROP\s+TABLE|writable_schema|DELETE\s+FROM|__new_content_items/i);
});
test('E2A populated upgrade, old/new application compatibility and raw invariants',async()=>{
  const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
  try { await contentContextAcceptance(d1Binding(raw),migrationFiles().slice(0,23).map(({url})=>readFileSync(url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)),(name,ok)=>assert.ok(ok,name)); }
  finally {raw.close();}
});
