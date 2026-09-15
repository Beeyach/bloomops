import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {draft,observation} from './_client-report-fixture.mjs';
import {checkReportCsv} from './_client-report-csv.mjs';
import {REPORT_CSV_FIELDS,reportCsv,reviewReportCsv,applyReportCsv} from '../lib/bloomops/client-report-csv.mjs';
const report=()=>({...draft(),templateId:'ghl_campaign',templateVersion:1});
test('CSV both templates persist source, reimport without duplicates and protect manual corrections',async ctx=>{const t=await setup();ctx.after(()=>t.raw.close());for(const template of ['social','ghl_campaign'])await checkReportCsv(t.db,t.owner,template);});
test('CSV roundtrip preserves zeros, missing values, formula-like text, quotes and multiline provenance',()=>{
 const r={...report(),accountLabel:'=unsafe spreadsheet formula',metrics:{sent:observation(0,{sourceNote:"'literal\n,\"quoted\""})}},csv=reportCsv(r),review=reviewReportCsv(csv,r);
 assert.equal(review.rows.find(r=>r.key==='sent').incoming.value,0);assert.equal(review.rows.find(r=>r.key==='delivered').incoming.value,null);
 assert.equal(review.rows.find(r=>r.key==='sent').incoming.sourceNote,r.metrics.sent.sourceNote);assert.match(csv,/"'=unsafe/);assert.ok(review.rows.every(r=>r.identical));
});
test('CSV exact mapping can reorder headers but rejects duplicates and unknown fields',()=>{
 const r=report(),row=['plain','ghl_campaign','1',r.periodStart,r.periodEnd,r.timezone,r.channel,r.accountLabel,r.scopeLabel,'sent','count','value','8','synthetic',''];
 const reversed=[REPORT_CSV_FIELDS.toReversed().join(','),row.toReversed().join(',')].join('\n');assert.equal(reviewReportCsv(reversed,r).rows[0].incoming.value,8);
 assert.throws(()=>reviewReportCsv(reversed.replace('metric_key','unknown'),r));assert.throws(()=>reviewReportCsv(reversed.replace('metric_key','unit'),r));
 for(const [index,value] of [[2,'2'],[3,'2026-07-01'],[5,'UTC'],[6,'sms'],[7,'another account'],[8,'other scope'],[9,'invented'],[10,'percent'],[12,''],[12,'Infinity'],[12,'-1'],[12,'1.2'],[12,'1000000001']]){const cells=[...row];cells[index]=value;assert.throws(()=>reviewReportCsv(REPORT_CSV_FIELDS.join(',')+'\n'+cells.join(','),r),`${index}:${value}`);}
 assert.throws(()=>reviewReportCsv(REPORT_CSV_FIELDS.join(',')+'\n'+row.join(',')+'\n'+row.join(','),r),/duplicate/);
 assert.throws(()=>reviewReportCsv('a'.repeat(65537),r));assert.throws(()=>reviewReportCsv('"unterminated',r));
});
test('CSV review does not mutate and only explicitly selected conflicts apply; combined totals are revalidated',()=>{
 const r={...report(),metrics:{sent:observation(10),delivered:observation(5)}},source={...r,metrics:{sent:observation(20),delivered:observation(15)}},before=structuredClone(r),review=reviewReportCsv(reportCsv(source),r),id=crypto.randomUUID();
 assert.deepEqual(r,before);assert.ok(review.rows.find(r=>r.key==='sent').conflict);
 assert.equal(applyReportCsv(review,r,[],id).sent.value,10);
 assert.throws(()=>applyReportCsv(review,r,['delivered'],id),/exceed/);
 assert.equal(applyReportCsv(review,r,['sent','delivered'],id).delivered.value,15);
 assert.throws(()=>applyReportCsv(review,{...r,metrics:{...r.metrics,sent:observation(12)}},['sent'],id),/changed/);
});
