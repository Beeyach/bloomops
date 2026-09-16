import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {run} from './_bloomops-db.mjs';
import {checkNewPeriodReport} from './_client-report-period-reuse.mjs';
import {newPeriodReportSetup,saveClientReport} from '../lib/bloomops/client-reports.mjs';
import {input} from './_client-report-fixture.mjs';
for(const template of ['ghl_campaign','social'])test(template+': new period reuses pinned setup without old results, provenance or narrative',async ctx=>{const t=await setup();ctx.after(()=>t.raw.close());await checkNewPeriodReport(t.db,t.owner,template);});
test('new-period setup requires current internal edit access and the exact Client/report pair',async ctx=>{
 const t=await setup();ctx.after(()=>t.raw.close());const created=await saveClientReport(t.db,t.owner,'james',null,input());
 for(const who of ['james','foreign','sam'])assert.equal(await newPeriodReportSetup(t.db,await t.actor(who),'james',created.id),null);
 t.assign('client','sam','james');assert.equal(await newPeriodReportSetup(t.db,await t.actor('sam'),'james',created.id),null,'read-only assignment cannot start editable copy');
 assert.equal(await newPeriodReportSetup(t.db,{...t.owner,preview:{}},'james',created.id),null);assert.equal(await newPeriodReportSetup(t.db,t.owner,'lawrence',created.id),null);assert.equal(await newPeriodReportSetup(t.db,t.owner,'james','absent'),null);
 assert.ok(await newPeriodReportSetup(t.db,await t.actor('pm'),'james',created.id));run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal(await newPeriodReportSetup(t.db,t.owner,'james',created.id),null);
});
