import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {getProspect,updateProspect} from '../lib/bloomops/prospects.mjs';
import {run,all,one} from './_bloomops-db.mjs';
import {exportProspectSource} from '../lib/bloomops/prospect-source-preview.mjs';
import {previewProspectImport} from '../lib/bloomops/prospect-import-preview.mjs';
import {commitProspectImport,getProspectImport,listProspectImports} from '../lib/bloomops/prospect-imports.mjs';
async function setup(c,count=2){const t=await sourceFixture(c);t.ids=Array.from({length:count},(_,i)=>t.add({business_name:'Import Garden '+i,domain:'import'+i+'.example.com',email:'import'+i+'@example.com',country:'Canada',source:'Public directory'}));t.file=await exportProspectSource(t.db,t.actor,{source:'source',ids:t.ids});return t;}
async function input(t){const p=await previewProspectImport(t.db,t.actor,t.file);return {workspaceId:'fresh',requestId:crypto.randomUUID(),document:t.file,previewHash:p.previewHash,selected:p.rows.filter(r=>r.status==='ready').map(r=>r.index)};}
const counts=t=>Object.fromEntries(['bloomops_prospects','prospect_import_receipts','prospect_import_rows','activity_events'].map(table=>[table,one(t.raw,`SELECT count(*) n FROM ${table}`).n]));
const empty=t=>assert.deepEqual(counts(t),{bloomops_prospects:0,prospect_import_receipts:0,prospect_import_rows:0,activity_events:0});
function beforeBatch(t,change){const batch=t.d1.batch.bind(t.d1);t.d1.batch=async statements=>{t.d1.batch=batch;change();return batch(statements);};}
const existing=t=>run(t.raw,"INSERT INTO bloomops_prospects(id,workspace_id,creation_request_id,creation_hash,created_by_membership_id,business_name,public_email) VALUES('existing','fresh','existing',?,'dest','Existing',?)",'a'.repeat(64),'import0@example.com');
test('atomic raw import creates sealed receipt, immutable source mappings and one event per profile',async c=>{
 const t=await setup(c),before=JSON.stringify(all(t.raw,'SELECT * FROM prospects')),body=await input(t),r=await commitProspectImport(t.db,t.actor,body);assert.ok(r.receiptId);assert.equal(r.unchanged,false);
 const receipt=await getProspectImport(t.db,t.actor,r.receiptId);assert.equal(receipt.selectedCount,2);assert.equal(receipt.importedCount,2);assert.ok(receipt.rows.every(r=>r.status==='imported'&&r.prospectId));
 assert.deepEqual(counts(t),{bloomops_prospects:2,prospect_import_receipts:1,prospect_import_rows:2,activity_events:2});
 for(const p of all(t.raw,'SELECT * FROM bloomops_prospects')){assert.equal(p.fit,'unknown');assert.equal(p.location,'Canada');assert.equal(p.draft_body,null);assert.equal(p.evidence_report,null);assert.equal(p.platform,null);assert.equal(p.time_zone,null);assert.equal(p.revision,1);}
 assert.equal(one(t.raw,'SELECT count(*) n FROM prospect_field_sources').n,0);assert.equal(JSON.stringify(all(t.raw,'SELECT * FROM prospects')),before);
});
test('same request retries reuse the receipt after source work and never repeat profiles/events',async c=>{
 const t=await setup(c),body=await input(t),a=await commitProspectImport(t.db,t.actor,body),before=counts(t);run(t.raw,'UPDATE prospects SET do_not_contact=1 WHERE id=?',t.ids[0]);
 assert.deepEqual(await commitProspectImport(t.db,t.actor,body),{receiptId:a.receiptId,unchanged:true});assert.deepEqual(counts(t),before);
});
test('reusing request ID with changed file or actor conflicts',async c=>{
 const t=await setup(c),body=await input(t);await commitProspectImport(t.db,t.actor,body);const other=structuredClone(body);other.document.exportedAt='2026-09-01';assert.equal((await commitProspectImport(t.db,t.actor,other)).conflict,true);
 run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('other-source','source','stranger','owner','active'),('other-dest','fresh','stranger','owner','active')");
 assert.equal((await commitProspectImport(t.db,{...t.actor,membershipId:'other-dest',userId:'stranger'},body)).conflict,true);assert.equal(counts(t).bloomops_prospects,2);
});
test('concurrent identical requests return one receipt and no duplicate history',async c=>{
 const t=await setup(c),body=await input(t);const rows=await Promise.all([commitProspectImport(t.db,t.actor,body),commitProspectImport(t.db,t.actor,body)]);assert.ok(rows[0].receiptId);assert.equal(rows[0].receiptId,rows[1].receiptId);assert.equal(counts(t).activity_events,2);assert.equal(counts(t).prospect_import_receipts,1);
});
test('concurrent different requests cannot recreate one source identity',async c=>{
 const t=await setup(c),body=await input(t);const rows=await Promise.all([commitProspectImport(t.db,t.actor,body),commitProspectImport(t.db,t.actor,{...body,requestId:crypto.randomUUID()})]);assert.equal(rows.filter(r=>r.receiptId).length,1);assert.equal(rows.filter(r=>r.conflict).length,1);assert.equal(counts(t).prospect_import_receipts,1);assert.equal(counts(t).bloomops_prospects,2);
});
test('durable source identity survives destination edits and fresh request IDs',async c=>{
 const t=await setup(c,1),body=await input(t);await commitProspectImport(t.db,t.actor,body);run(t.raw,"UPDATE bloomops_prospects SET business_name='Edited identity',public_email=NULL,website=NULL,revision=revision+1");
 const preview=await previewProspectImport(t.db,t.actor,t.file);assert.equal(preview.rows[0].status,'duplicate');assert.ok(preview.rows[0].reasons.includes('source_imported'));assert.equal((await commitProspectImport(t.db,t.actor,{...body,requestId:crypto.randomUUID()})).conflict,true);assert.equal(counts(t).bloomops_prospects,1);
});
test('receipt reconciles imported, duplicate and invalid file outcomes',async c=>{
 const t=await setup(c,3);existing(t);t.file.records[1].fields.publicEmail='invalid';const body=await input(t);assert.deepEqual(body.selected,[3]);const r=await commitProspectImport(t.db,t.actor,body);assert.ok(r.receiptId);
 const receipt=await getProspectImport(t.db,t.actor,r.receiptId);assert.equal(receipt.selectedCount,3);assert.equal(receipt.importedCount,1);assert.equal(receipt.duplicateCount,1);assert.equal(receipt.rejectedCount,1);assert.deepEqual(receipt.rows.map(r=>r.status),['duplicate','rejected','imported']);assert.equal(counts(t).bloomops_prospects,2);
});
test('a stale preview cannot silently import a newly changed selection',async c=>{
 const t=await setup(c),body=await input(t);existing(t);const r=await commitProspectImport(t.db,t.actor,body);assert.equal(r.conflict,true);assert.equal(r.preview.counts.duplicate,1);assert.equal(counts(t).prospect_import_receipts,0);assert.equal(counts(t).bloomops_prospects,1);
});
for(const [name,change] of [
 ['source stop',t=>run(t.raw,'UPDATE prospects SET do_not_contact=1 WHERE id=?',t.ids[0])],
 ['source fields',t=>run(t.raw,"UPDATE prospects SET business_name='Changed at write' WHERE id=?",t.ids[0])],
 ['source deletion',t=>run(t.raw,"UPDATE prospects SET deleted_at='2026-09-12' WHERE id=?",t.ids[0])],
 ['source history',t=>run(t.raw,"INSERT INTO send_events(workspace,prospect_id,sent_at,dedupe_key,subject) VALUES('source',?,'2026-09-12','synthetic','Fixture only')",t.ids[0])],
])test(`${name} between preflight and batch prevents the whole import`,async c=>{
 const t=await setup(c),body=await input(t);beforeBatch(t,()=>change(t));const r=await commitProspectImport(t.db,t.actor,body);assert.equal(r.conflict,true);empty(t);
});
for(const member of ['src','dest'])test(`revoked ${member} authority at write prevents all records`,async c=>{
 const t=await setup(c),body=await input(t);beforeBatch(t,()=>run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id=?",member));assert.equal(await commitProspectImport(t.db,t.actor,body),null);empty(t);
});
test('a destination duplicate added immediately before batch rolls back all selected rows',async c=>{
 const t=await setup(c),body=await input(t);beforeBatch(t,()=>existing(t));const r=await commitProspectImport(t.db,t.actor,body);assert.equal(r.conflict,true);assert.equal(counts(t).bloomops_prospects,1);assert.equal(counts(t).prospect_import_receipts,0);assert.equal(counts(t).activity_events,0);
});
test('late statement failure rolls back profiles, receipt, mappings and activity',async c=>{
 const t=await setup(c),body=await input(t);t.raw.exec("CREATE TRIGGER fail_second_import BEFORE INSERT ON prospect_import_rows WHEN NEW.ordinal=2 BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
 assert.equal((await commitProspectImport(t.db,t.actor,body)).unavailable,true);empty(t);t.raw.exec('DROP TRIGGER fail_second_import');assert.ok((await commitProspectImport(t.db,t.actor,body)).receiptId);
});
test('sealed receipts and source rows cannot be edited or deleted',async c=>{
 const t=await setup(c),body=await input(t);await commitProspectImport(t.db,t.actor,body);
 for(const table of ['prospect_import_receipts','prospect_import_rows']){assert.throws(()=>run(t.raw,`DELETE FROM ${table}`));assert.throws(()=>run(t.raw,`UPDATE ${table} SET workspace_id='foreign'`));}
 assert.throws(()=>run(t.raw,'UPDATE prospect_import_receipts SET sealed=0'));assert.equal(one(t.raw,'PRAGMA foreign_key_check'),undefined);
});
test('receipt/profile provenance is destination scoped and survives loss of source permission',async c=>{
 const t=await setup(c),body=await input(t),r=await commitProspectImport(t.db,t.actor,body);
 assert.equal(await getProspectImport(t.db,{...t.actor,workspaceId:'foreign'},r.receiptId),null);assert.equal((await listProspectImports(t.db,t.actor)).rows.length,1);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='src'");assert.ok(await getProspectImport(t.db,t.actor,r.receiptId));assert.equal(await commitProspectImport(t.db,t.actor,body),null);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");assert.equal(await getProspectImport(t.db,t.actor,r.receiptId),null);
});
test('50-record atomic batch fits D1 bind limits and creates exactly one receipt',async c=>{
 const t=await setup(c,50),body=await input(t),prepare=t.d1.prepare.bind(t.d1);let max=0;
 t.d1.prepare=q=>{const stmt=prepare(q),bind=stmt.bind;stmt.bind=(...args)=>{max=Math.max(max,args.length);assert.ok(args.length<=100,`D1 binds ${args.length}`);return bind(...args);};return stmt;};
 const r=await commitProspectImport(t.db,t.actor,body);assert.ok(r.receiptId,JSON.stringify(r));assert.equal(counts(t).bloomops_prospects,50);assert.equal(counts(t).activity_events,50);assert.ok(max>0);
});

test('import provenance stays immutable through canonical manual verification and source revocation',async c=>{
 const t=await setup(c,1),r=await commitProspectImport(t.db,t.actor,await input(t)),receipt=await getProspectImport(t.db,t.actor,r.receiptId),id=receipt.rows[0].prospectId;
 const initial=await getProspect(t.db,t.actor,id);assert.equal(initial.sources.length,0);assert.equal(initial.importSource.sourceRecordId,t.ids[0]);assert.equal(initial.importSource.receiptId,r.receiptId);
 assert.ok((await updateProspect(t.db,{actor:t.actor,id,input:{workspaceId:'fresh',expectedRevision:1,fields:{website:'https://checked.example.com/'},sources:{website:{url:'https://checked.example.com/about',checked:true}}}})).ok);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='src'");
 const edited=await getProspect(t.db,t.actor,id);assert.deepEqual(edited.importSource,initial.importSource);assert.equal(edited.sources[0].verification,'checked');assert.equal(edited.profile.website,'https://checked.example.com/');
 assert.equal(await getProspect(t.db,{...t.actor,workspaceId:'foreign'},id),null);assert.equal((await getProspectImport(t.db,t.actor,r.receiptId)).rows[0].sourceRecordId,t.ids[0]);
});
test('commit rejects malformed selections, wrong workspace and oversized documents before writes',async c=>{
 const t=await setup(c,2),body=await input(t);
 for(const patch of [{workspaceId:'foreign'},{requestId:'bad'},{requestId:[body.requestId]},{requestId:{}},{previewHash:'bad'},{selected:[]},{selected:[1,1]},{selected:[0]},{selected:[3]},{selected:['1']},{extra:true},{document:{...body.document,records:body.document.records.map((r,i)=>i?r:{...r,fields:{...r.fields,source:'x'.repeat(1048576)}})}}]){
  assert.equal((await commitProspectImport(t.db,t.actor,{...body,...patch})).invalid,true);empty(t);
 }
 assert.equal((await commitProspectImport(t.db,t.actor,{...body,selected:[1]})).conflict,true);empty(t);
});
