import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {migrationFiles,d1Binding} from './_bloomops-db.mjs';
import {memoryBucket} from './_files.mjs';
import {reviewMediaAcceptance} from '../scripts/review-media-acceptance.mjs';
test('E3A additive snapshot preserves existing tables and original review fields',()=>{
 const read=n=>JSON.parse(readFileSync(new URL(`../drizzle/meta/${n}`,import.meta.url))),before=read('0022_snapshot.json'),after=read('0023_snapshot.json');assert.equal(after.prevId,before.id);
 assert.equal(read('_journal.json').entries[23].tag,'0023_e3a_review_media');assert.equal(Object.keys(after.tables).length,Object.keys(before.tables).length+1);
 for(const [name,table] of Object.entries(before.tables)){
  if(!['content_review_revisions','content_asset_links'].includes(name))assert.deepEqual(after.tables[name],table,name);
  else for(const key of ['columns','indexes','foreignKeys','checkConstraints'])for(const [field,value]of Object.entries(table[key]))assert.deepEqual(after.tables[name][key][field],value,field);
 }
 const sql=readFileSync(new URL('../drizzle/0023_e3a_review_media.sql',import.meta.url),'utf8');assert.doesNotMatch(sql,/foreign_keys\s*=\s*OFF|DROP\s+TABLE|DELETE\s+FROM|writable_schema|__new_/i);
});
test('E3A populated upgrade, old/new Social compatibility, sealing and media retention',async()=>{
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');let checks=0;
 try{await reviewMediaAcceptance(d1Binding(raw),memoryBucket(),migrationFiles().map(({url})=>readFileSync(url,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)),(name,ok)=>{assert.ok(ok,name);checks++;});assert.ok(checks>=75);}
 finally{raw.close();}
});
