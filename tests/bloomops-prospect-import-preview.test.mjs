import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {run,all} from './_bloomops-db.mjs';
import {exportProspectSource} from '../lib/bloomops/prospect-source-preview.mjs';
import {previewProspectImport} from '../lib/bloomops/prospect-import-preview.mjs';
import {importEnvelope,IMPORT_FILE_LIMIT} from '../lib/bloomops/prospect-import-values.mjs';
import {readStructuredBody} from '../lib/bloomops/structured-body.mjs';
async function setup(c,count=3){const t=await sourceFixture(c);t.ids=Array.from({length:count},(_,i)=>t.add({business_name:'Garden '+i,domain:'garden'+i+'.example.com',email:'garden'+i+'@example.com',country:'Canada',source:'Directory'}));t.file=await exportProspectSource(t.db,t.actor,{source:'source',ids:t.ids});return t;}
const preview=t=>previewProspectImport(t.db,t.actor,t.file);
const existing=(t,patch={})=>run(t.raw,"INSERT INTO bloomops_prospects(id,workspace_id,creation_request_id,creation_hash,created_by_membership_id,business_name,public_email,website) VALUES(?,?,?,?,?,?,?,?)",patch.id||'existing',patch.workspace||'fresh',patch.id||'existing','a'.repeat(64),patch.member||'dest',patch.name||'Existing Studio',patch.email||null,patch.website||null);
test('real selected export maps to canonical fields without writing anything',async c=>{
 const t=await setup(c),changes=all(t.raw,'SELECT total_changes() n')[0].n;const result=await preview(t);
 assert.deepEqual(result.counts,{selected:3,ready:3,duplicate:0,rejected:0,imported:0});assert.deepEqual(result.rows[0].fields,{businessName:'Garden 0',personName:'Maya Example',website:'https://garden0.example.com/',publicEmail:'garden0@example.com',niche:null,location:'Canada'});
 assert.equal(result.rows[0].sourceLabel,'Directory');assert.deepEqual(result.rows[0].provenance,{sourceWorkspaceId:'source',sourceRecordId:t.ids[0]});assert.equal(all(t.raw,'SELECT total_changes() n')[0].n,changes);
});
test('counts are recomputed; harmless normalization is allowed but forged fields are rejected',async c=>{
 const t=await setup(c);t.file.counts={selected:0,eligible:0,blocked:0,exported:0};t.file.records[0].fields.publicEmail=' GARDEN0@EXAMPLE.COM ';t.file.records[1].fields.businessName='Forged Studio';
 const r=await preview(t);assert.equal(r.counts.selected,3);assert.equal(r.counts.ready,2);assert.equal(r.counts.rejected,1);assert.deepEqual(r.rows[1].reasons,['changed']);
});
test('invalid fields and provenance receive per-record rejections without echoing old reports',async c=>{
 const t=await setup(c);t.file.records[0].fields.email_sequence='PRIVATE REPORT';t.file.records[1].fields.publicEmail='bad';t.file.records[2].provenance.sourceRecordId='bad';
 const r=await preview(t);assert.equal(r.counts.rejected,3);assert.equal(r.counts.imported,0);assert.equal(JSON.stringify(r).includes('PRIVATE REPORT'),false);assert.ok(r.rows.every(row=>row.reasons.length));
});
test('rejects unsupported envelopes, mixed workspaces and record bounds',async c=>{
 const t=await setup(c);for(const value of [null,[],{}, {...t.file,version:2},{...t.file,records:[]},{...t.file,records:Array(51).fill(t.file.records[0])},{...t.file,extra:'x'}])assert.equal(importEnvelope(value),false);
 t.file.records[1].provenance.sourceWorkspaceId='foreign';assert.equal((await preview(t)).invalid,true);
});
test('file duplicates flag every matching row instead of silently taking the first',async c=>{
 const t=await setup(c);t.file.records.push(structuredClone(t.file.records[0]));const r=await preview(t);assert.equal(r.counts.duplicate,2);assert.equal(r.counts.ready,2);assert.ok(r.rows[0].reasons.includes('file_duplicate'));assert.ok(r.rows[3].reasons.includes('file_duplicate'));
});
test('destination email, name and website matches stay in the selected workspace',async c=>{
 const t=await setup(c);existing(t,{id:'email',email:' GARDEN0@EXAMPLE.COM '});existing(t,{id:'name',name:' garden 1 '});existing(t,{id:'site',website:'https://garden2.example.com/'});
 const r=await preview(t);assert.equal(r.counts.duplicate,3);assert.ok(r.rows[0].reasons.includes('destination_email'));assert.ok(r.rows[1].reasons.includes('destination_name'));assert.ok(r.rows[2].reasons.includes('destination_website'));
 assert.equal(JSON.stringify(r).includes('Existing Studio'),false);
});
test('an existing record in another workspace does not affect duplicate results',async c=>{
 const t=await setup(c);run(t.raw,"INSERT INTO workspaces(id,name,slug,purpose) VALUES('other-prospecting','Other','other-prospecting','prospecting')");run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('other-creator','other-prospecting','stranger','owner','active')");existing(t,{workspace:'other-prospecting',member:'other-creator',email:'garden0@example.com',name:'Garden 0'});assert.equal((await preview(t)).counts.ready,3);
});
test('new source work after export and changed or missing source fields cannot become ready',async c=>{
 const t=await setup(c);run(t.raw,"INSERT INTO send_events(workspace,prospect_id,sent_at,dedupe_key) VALUES('source',?,'2026-09-12','late')",t.ids[0]);run(t.raw,"UPDATE prospects SET business_name='Changed Studio' WHERE id=?",t.ids[1]);t.file.records[2].provenance.sourceRecordId=99999;
 const r=await preview(t);assert.equal(r.counts.rejected,3);assert.deepEqual(r.rows.map(row=>row.reasons[0]),['source_work','changed','source_missing']);
});
test('both workspace memberships and missing evidence fail closed',async c=>{
 const t=await setup(c);for(const id of ['src','dest']){run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id=?",id);assert.equal(await preview(t),null);run(t.raw,"UPDATE workspace_memberships SET status='active' WHERE id=?",id);}
 t.file.records.forEach(row=>row.provenance.sourceWorkspaceId='foreign');assert.equal(await preview(t),null);t.file.records.forEach(row=>row.provenance.sourceWorkspaceId='source');
 run(t.raw,'DROP TABLE send_attempts');assert.deepEqual(await preview(t),{unavailable:true});
});
test('source revocation during destination checks discards the entire preview',async c=>{
 const t=await setup(c),prepare=t.d1.prepare;let revoked=false;t.d1.prepare=q=>{if(q.includes('FROM bloomops_prospects p')&&!revoked){revoked=true;run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='src'");}return prepare(q);};
 assert.equal(await preview(t),null);assert.equal(revoked,true);
});
test('50 candidates stay bounded across duplicate batches and preserve counts',async c=>{
 const t=await setup(c,50),prepare=t.d1.prepare;let max=0;t.d1.prepare=q=>{max=Math.max(max,(q.match(/\?/g)||[]).length);return prepare(q);};const r=await preview(t);assert.equal(r.counts.ready,50);assert.ok(max<=100,`bindings ${max}`);
});
test('only the import-preview body gets a 1 MiB allowance; existing routes retain 64 KiB',async()=>{
 const make=bytes=>new Request('http://localhost',{method:'POST',body:JSON.stringify({text:'x'.repeat(bytes)})});
 await assert.rejects(()=>readStructuredBody(make(70000)));assert.equal((await readStructuredBody(make(70000),{maxBytes:IMPORT_FILE_LIMIT})).text.length,70000);await assert.rejects(()=>readStructuredBody(make(IMPORT_FILE_LIMIT),{maxBytes:IMPORT_FILE_LIMIT}));
});

test('exact non-ASCII business names remain detectable as destination duplicates',async c=>{
 const t=await setup(c,1);run(t.raw,"UPDATE prospects SET business_name='Élan Studio' WHERE id=?",t.ids[0]);t.file=await exportProspectSource(t.db,t.actor,{source:'source',ids:t.ids});existing(t,{name:'Élan Studio'});assert.equal((await preview(t)).counts.duplicate,1);
});

test('repeated source identities remain duplicates when another copy has invalid fields',async c=>{
 const t=await setup(c,1);t.file.records.push(structuredClone(t.file.records[0]));t.file.records[1].fields.publicEmail='bad';const r=await preview(t);assert.deepEqual(r.counts,{selected:2,ready:0,duplicate:1,rejected:1,imported:0});assert.ok(r.rows.every(row=>row.reasons.includes('file_duplicate')));
});
test('temporary authority loss during duplicate SQL cannot look like a completed no-match check',async c=>{
 const t=await setup(c,1);existing(t,{email:'garden0@example.com'});const prepare=t.d1.prepare;let suspended=false,restored=false;
 t.d1.prepare=q=>{if(q.includes('FROM bloomops_prospects p')&&!suspended){run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");suspended=true;}else if(suspended&&!restored){run(t.raw,"UPDATE workspace_memberships SET status='active' WHERE id='dest'");restored=true;}return prepare(q);};
 assert.deepEqual(await preview(t),{unavailable:true});assert.equal(suspended,true);assert.equal(restored,true);
});
