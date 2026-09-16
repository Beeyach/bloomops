import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {run,all} from './_bloomops-db.mjs';
import {saveClientReport as save,getClientReport as get,changeReportArchive as archive} from '../lib/bloomops/client-reports.mjs';
import {input} from './_client-report-fixture.mjs';
import {checkReportArchive,checkArchiveRace,archiveInput} from './_client-report-archive.mjs';
for(const template of ['ghl_campaign','social'])test(template+': archive preserves history, restore remains private and explicit republish works',async ctx=>{const t=await setup();ctx.after(()=>t.raw.close());await checkReportArchive(t.db,t.owner,await t.actor('james'),template);});
test('archive and concurrent save/publication preserve the winning saved state and access floor',async ctx=>{const t=await setup();ctx.after(()=>t.raw.close());await checkArchiveRace(t.db,t.owner);});
test('archive requires current management authority, exact scope and valid intent',async ctx=>{
 const t=await setup();ctx.after(()=>t.raw.close());const created=await save(t.db,t.owner,'james',null,input());
 for(const who of ['james','foreign','sam'])assert.equal((await archive(t.db,await t.actor(who),'james',created.id,archiveInput())).reason,'not_found');
 t.assign('client','sam','james');assert.equal((await archive(t.db,await t.actor('sam'),'james',created.id,archiveInput())).reason,'not_found');
 for(const patch of [{workspaceId:'b'},{userId:'foreign'},{publicationFloor:99}])assert.equal((await archive(t.db,t.owner,'james',created.id,archiveInput(patch))).reason,'not_found');
 for(const patch of [{requestId:'bad'},{expectedRevision:0},{archived:'true'}])assert.equal((await archive(t.db,t.owner,'james',created.id,archiveInput(patch))).reason,'invalid');
 assert.equal((await archive(t.db,t.owner,'lawrence',created.id,archiveInput())).reason,'not_found');
 assert.equal((await archive(t.db,{...t.owner,preview:true},'james',created.id,archiveInput())).reason,'not_found');
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal((await archive(t.db,t.owner,'james',created.id,archiveInput())).reason,'not_found');
});
test('no-op, zero-row and failed archive writes preserve all saved content',async ctx=>{
 const t=await setup();ctx.after(()=>t.raw.close());const created=await save(t.db,t.owner,'james',null,input()),before=await get(t.db,t.owner,'james',created.id);
 assert.equal((await archive(t.db,t.owner,'james',created.id,archiveInput({archived:false}))).unchanged,true);assert.deepEqual(await get(t.db,t.owner,'james',created.id),before);
 run(t.raw,"CREATE TRIGGER archive_ignore BEFORE UPDATE ON client_report_drafts BEGIN SELECT RAISE(IGNORE); END");assert.equal((await archive(t.db,t.owner,'james',created.id,archiveInput())).reason,'conflict');assert.deepEqual(await get(t.db,t.owner,'james',created.id),before);run(t.raw,'DROP TRIGGER archive_ignore');
 run(t.raw,"CREATE TRIGGER archive_failure BEFORE UPDATE ON client_report_drafts BEGIN SELECT RAISE(ABORT,'synthetic archive failure'); END");await assert.rejects(archive(t.db,t.owner,'james',created.id,archiveInput()),e=>/synthetic archive failure/.test(e.cause?.message||e.message));assert.deepEqual(await get(t.db,t.owner,'james',created.id),before);assert.equal(all(t.raw,'SELECT * FROM client_report_publications').length,0);
});
