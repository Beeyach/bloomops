import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {run,all} from './_bloomops-db.mjs';
import {exportProspectSource,previewProspectSource,sourceExportInput} from '../lib/bloomops/prospect-source-preview.mjs';

test('export accepts only an explicit bounded unique numeric selection, never client-supplied fields',()=>{
 for(const input of [null,[],{}, {source:'',ids:[1]},{source:'source',ids:[]},{source:'source',ids:[1,1]},{source:'source',ids:['1']},{source:'source',ids:[0]},{source:'source',ids:[-1]},{source:'source',ids:[1.5]},{source:'source',ids:[Number.MAX_SAFE_INTEGER+1]},{source:'source',ids:Array.from({length:51},(_,i)=>i+1)},{source:'source',ids:[1],fields:{businessName:'Forged'}}])assert.equal(sourceExportInput(input),null);
 assert.deepEqual(sourceExportInput({source:'source',ids:[3,1]}),{source:'source',ids:[1,3]});
});
test('selected export is a raw-field whitelist with stable provenance and performs zero writes',async c=>{
 const t=await sourceFixture(c),a=t.add({country:'Canada',source:'Directory',email:'maya@example.com'}),b=t.add({business_name:'Other Studio'});t.add({business_name:'Unselected Studio'});
 const changes=all(t.raw,'SELECT total_changes() n')[0].n,rows=all(t.raw,'SELECT * FROM prospects');
 const result=await exportProspectSource(t.db,t.actor,{source:'source',ids:[b,a]},new Date('2026-09-12T22:00:00Z'));
 assert.equal(result.format,'bloomops.raw-prospects');assert.equal(result.version,1);assert.equal(result.exportedAt,'2026-09-12T22:00:00.000Z');
 assert.deepEqual(result.counts,{selected:2,eligible:2,blocked:0,exported:2});
 assert.deepEqual(result.records.map(r=>r.provenance),[{sourceWorkspaceId:'source',sourceRecordId:a},{sourceWorkspaceId:'source',sourceRecordId:b}]);
 assert.deepEqual(result.records[0].fields,{businessName:'Raw Studio',personName:'Maya Example',website:'example.com',publicEmail:'maya@example.com',niche:null,country:'Canada',source:'Directory'});
 assert.deepEqual(Object.keys(result.records[0]),['provenance','fields']);assert.equal(JSON.stringify(result).includes('Unselected'),false);
 assert.deepEqual(all(t.raw,'SELECT * FROM prospects'),rows);assert.equal(all(t.raw,'SELECT total_changes() n')[0].n,changes);
});
test('rechecks actual work after preview and never partially exports a stale selection',async c=>{
 const t=await sourceFixture(c),a=t.add(),b=t.add();assert.equal((await previewProspectSource(t.db,t.actor,{source:'source'})).counts.ready,2);
 run(t.raw,"INSERT INTO send_events(workspace,prospect_id,sent_at,dedupe_key,subject) VALUES('source',?,'2026-09-12','after-preview','PRIVATE MESSAGE')",b);
 const result=await exportProspectSource(t.db,t.actor,{source:'source',ids:[a,b]});
 assert.equal(result.conflict,true);assert.deepEqual(result.counts,{selected:2,eligible:1,blocked:1,exported:0});assert.deepEqual(result.rejections,[{id:b,reasons:['contact']}]);
 assert.equal(result.records,undefined);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});
test('rejects ambiguity, prior drafts, deletion, invalid identity and duplicate email even with New stage',async c=>{
 const t=await sourceFixture(c),ids=[t.add({info:'Unclear notes'}),t.add({pending_draft:'PRIVATE DRAFT'}),t.add({deleted_at:'2026-09-12'}),t.add({email:'invalid'}),t.add({email:'duplicate@example.com'}),t.add({email:'DUPLICATE@example.com'})];
 const result=await exportProspectSource(t.db,t.actor,{source:'source',ids});assert.equal(result.conflict,true);assert.equal(result.counts.blocked,6);assert.equal(result.counts.exported,0);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
});
test('guessed record IDs cannot disclose another source or bypass source membership',async c=>{
 const t=await sourceFixture(c),a=t.add(),foreign=t.add({workspace:'foreign',business_name:'PRIVATE FOREIGN'});
 const result=await exportProspectSource(t.db,t.actor,{source:'source',ids:[a,foreign,9999]});
 assert.equal(result.conflict,true);assert.deepEqual(result.rejections,[{id:foreign,reasons:['unavailable']},{id:9999,reasons:['unavailable']}]);assert.equal(JSON.stringify(result).includes('PRIVATE'),false);
 assert.equal(await exportProspectSource(t.db,t.actor,{source:'foreign',ids:[foreign]}),null);
});
test('stale source/destination roles and memberships cannot authorize an export',async c=>{
 const t=await sourceFixture(c),id=t.add();
 for(const [change,restore] of [["UPDATE workspace_memberships SET status='suspended' WHERE id='src'","UPDATE workspace_memberships SET status='active' WHERE id='src'"],["UPDATE workspace_memberships SET role='team_member' WHERE id='src'","UPDATE workspace_memberships SET role='owner' WHERE id='src'"],["UPDATE workspace_memberships SET role='team_member' WHERE id='dest'","UPDATE workspace_memberships SET role='owner' WHERE id='dest'"],["UPDATE workspaces SET status='suspended' WHERE id='fresh'","UPDATE workspaces SET status='active' WHERE id='fresh'"]]){
  run(t.raw,change);assert.equal(await exportProspectSource(t.db,t.actor,{source:'source',ids:[id]}),null);run(t.raw,restore);
 }
 for(const role of ['client','team_member','project_manager'])assert.equal(await exportProspectSource(t.db,{...t.actor,role},{source:'source',ids:[id]}),null);
});
test('missing history schema returns unavailable rather than an export',async c=>{
 const t=await sourceFixture(c),id=t.add();run(t.raw,'DROP TABLE send_attempts');
 assert.deepEqual(await exportProspectSource(t.db,t.actor,{source:'source',ids:[id]}),{unavailable:true});
});
test('selection can span source pages but is capped at 50 records',async c=>{
 const t=await sourceFixture(c),ids=Array.from({length:55},(_,i)=>t.add({business_name:'Studio '+i}));
 const result=await exportProspectSource(t.db,t.actor,{source:'source',ids:ids.slice(5)});assert.equal(result.records.length,50);assert.deepEqual(result.records.map(r=>r.provenance.sourceRecordId),ids.slice(5));
});
test('revocation at the data statement prevents an export from a previously authorized selection',async c=>{
 const t=await sourceFixture(c),id=t.add(),prepare=t.d1.prepare;let revoked=false;
 t.d1.prepare=q=>{if(q.includes('FROM prospects p')&&!revoked){revoked=true;run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='src'");}return prepare(q);};
 assert.equal(await exportProspectSource(t.db,t.actor,{source:'source',ids:[id]}),null);assert.equal(revoked,true);
});

test('overlong raw fields cannot be silently truncated into an eligible export',async c=>{
 const t=await sourceFixture(c),ids=[t.add({name:'Maya'+ ' '.repeat(117)+'hidden tail'}),t.add({business_name:'Studio'+ ' '.repeat(175)+'hidden tail'}),t.add({country:'Canada'+' '.repeat(175)+'hidden tail'})];
 const result=await exportProspectSource(t.db,t.actor,{source:'source',ids});assert.equal(result.conflict,true);assert.equal(result.counts.blocked,3);assert.ok(result.rejections.every(r=>r.reasons.includes('fields')));assert.equal(result.records,undefined);
});
