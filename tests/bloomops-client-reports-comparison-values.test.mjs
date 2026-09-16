import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportingPeriod,comparableReportSnapshot,reportComparison} from '../lib/bloomops/client-report-comparison-values.mjs';
import {reportTemplate,reportInput} from '../lib/bloomops/client-report-values.mjs';
import {draft,observation} from './_client-report-fixture.mjs';
function fixture(templateId='ghl_campaign'){
 const template=reportTemplate(templateId,1),current={...reportInput(draft({channel:templateId==='social'?'instagram':'email',periodStart:'2026-09-01',periodEnd:'2026-09-30',metrics:{[template.metrics[0].key]:observation(0)}}),template).value,templateId,templateVersion:1};
 const snapshot={...current,periodStart:'2026-08-01',periodEnd:'2026-08-31',metrics:template.metrics.map(m=>({...m,...current.metrics[m.key],value:m.key===template.metrics[0].key?17:current.metrics[m.key].value}))};
 return {current,entry:{id:'prior-publication',sequence:2,snapshotHash:'identified-snapshot',snapshot}};
}
test('compatible periods accept complete unequal-length months and equal-duration custom ranges',()=>{
 assert.deepEqual(reportingPeriod('2024-02-01','2024-02-29'),{start:'2024-02-01',end:'2024-02-29',days:29,wholeMonth:true});assert.equal(reportingPeriod('2023-02-29','2023-03-01'),null);
 const {current,entry}=fixture();assert.equal(comparableReportSnapshot(current,entry.snapshot),true);
 current.periodStart='2026-09-02';current.periodEnd='2026-09-08';entry.snapshot.periodStart='2026-08-10';entry.snapshot.periodEnd='2026-08-16';assert.equal(comparableReportSnapshot(current,entry.snapshot),true);
 entry.snapshot.periodEnd='2026-08-17';assert.equal(comparableReportSnapshot(current,entry.snapshot),false);
 entry.snapshot.periodStart='2026-09-08';entry.snapshot.periodEnd='2026-09-14';assert.equal(comparableReportSnapshot(current,entry.snapshot),false);
});
for(const template of ['ghl_campaign','social'])test(template+': count differences preserve zero, negative change, missing data and identified source',()=>{
 const {current,entry}=fixture(template),value=reportComparison(current,entry);
 assert.equal(value.metrics[0].difference,-17);assert.equal(value.metrics[0].current.value,0);assert.equal(value.metrics[1].difference,null);assert.equal(value.metrics[1].current.state,'missing');assert.equal(value.publicationId,'prior-publication');assert.equal(value.version,2);assert.deepEqual(value.chartKeys,[value.metrics[0].key]);
 entry.snapshot.metrics[0].value=0;current.metrics[value.metrics[0].key].value=20;const fromZero=reportComparison(current,entry);assert.equal(fromZero.metrics[0].difference,20);assert.ok(!Object.hasOwn(fromZero.metrics[0],'growthPercentage'));
 entry.snapshot.metrics[0]={...entry.snapshot.metrics[0],state:'unavailable',value:null};assert.equal(reportComparison(current,entry).metrics[0].difference,null);assert.deepEqual(reportComparison(current,entry).chartKeys,[]);
});
test('comparison rejects changed context, template versions, definitions, units and malformed observations',()=>{
 const {current,entry}=fixture();for(const field of ['templateVersion','templateId','accountLabel','channel','scopeLabel','timezone'])assert.equal(comparableReportSnapshot(current,{...entry.snapshot,[field]:field==='templateVersion'?2:'different'}),false,field);
 for(const patch of [{definition:'another definition'},{unit:'people'},{state:'value',value:Infinity},{state:'missing',value:1}])assert.equal(comparableReportSnapshot(current,{...entry.snapshot,metrics:entry.snapshot.metrics.map((m,i)=>i?m:{...m,...patch})}),false);
});
