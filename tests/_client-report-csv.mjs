import assert from 'node:assert/strict';
import {reportCsv,reviewReportCsv,applyReportCsv} from '../lib/bloomops/client-report-csv.mjs';
import {saveClientReport,getClientReport} from '../lib/bloomops/client-reports.mjs';
import {input,draft,observation} from './_client-report-fixture.mjs';
export async function checkReportCsv(db,actor,templateId){
 const key=templateId==='social'?'views':'sent',v=input({templateId,draft:draft({channel:templateId==='social'?'instagram':'email'})});
 const created=await saveClientReport(db,actor,'james',null,v);assert.ok(created.ok);
 const original=await getClientReport(db,actor,'james',created.id),source={...original,metrics:{...original.metrics,[key]:observation(21,{sourceNote:'=literal, "source"\nnot verified'})}};
 const review=reviewReportCsv(reportCsv(source),original),importId=crypto.randomUUID();
 const metrics=applyReportCsv(review,original,[key],importId);
 assert.equal(metrics[key].sourceKind,'csv');assert.equal(metrics[key].value,21);
 assert.ok((await saveClientReport(db,actor,'james',created.id,{...v,expectedRevision:1,draft:{...v.draft,metrics}})).ok);
 const saved=await getClientReport(db,actor,'james',created.id);assert.equal(saved.metrics[key].importId,importId);assert.equal(saved.metrics[key].sourceNote,source.metrics[key].sourceNote);
 const retry=reviewReportCsv(reportCsv(source),saved);assert.equal(retry.rows.find(r=>r.key===key).identical,true);
 assert.deepEqual(applyReportCsv(retry,saved,[key],crypto.randomUUID()),saved.metrics,'identical import preserves prior provenance and rows');
 const manual={...metrics,[key]:{...metrics[key],value:22,sourceKind:'manual'}};
 assert.ok((await saveClientReport(db,actor,'james',created.id,{...v,expectedRevision:2,draft:{...v.draft,metrics:manual}})).ok);
 const edited=await getClientReport(db,actor,'james',created.id);assert.equal(edited.metrics[key].importId,importId);
 assert.equal(reviewReportCsv(reportCsv(source),edited).rows.find(r=>r.key===key).conflict,true);
 assert.equal((await saveClientReport(db,actor,'james',created.id,{...v,expectedRevision:2,draft:{...v.draft,metrics}})).reason,'conflict');
 assert.equal((await getClientReport(db,actor,'james',created.id)).metrics[key].value,22);
}
