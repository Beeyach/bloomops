import assert from 'node:assert/strict';
import {saveClientReport,newPeriodReportSetup,getClientReport} from '../lib/bloomops/client-reports.mjs';
import {reportTemplate,CLIENT_NARRATIVE_FIELDS} from '../lib/bloomops/client-report-values.mjs';
import {input,draft,observation} from './_client-report-fixture.mjs';
export async function checkNewPeriodReport(db,actor,templateId){
 const template=reportTemplate(templateId,1),metricKey=template.metrics[0].key;
 const original=input({templateId,draft:draft({title:'Old August report',channel:templateId==='social'?'instagram':'email',commentary:'Old private commentary',clientSummary:'Old result',workCompleted:'Old work',limitations:'Old limits',nextActions:'Old actions',metrics:{[metricKey]:observation(17,{sourceKind:'csv',importId:crypto.randomUUID()})}})});
 const old=await saveClientReport(db,actor,'james',null,original);assert.equal(old.ok,true);
 const before=await getClientReport(db,actor,'james',old.id),setup=await newPeriodReportSetup(db,actor,'james',old.id);
 assert.equal(setup.sourceId,old.id);assert.equal(setup.templateId,templateId);assert.equal(setup.templateVersion,1);assert.equal(setup.serviceEngagementId,before.serviceEngagementId);
 assert.equal(setup.title,template.label);assert.equal(setup.periodStart,'');assert.equal(setup.periodEnd,'');assert.equal(setup.timezone,before.timezone);assert.equal(setup.channel,before.channel);assert.equal(setup.accountLabel,before.accountLabel);assert.equal(setup.scopeLabel,before.scopeLabel);
 assert.deepEqual(setup.metrics,{});assert.equal(setup.commentary,'');for(const key of CLIENT_NARRATIVE_FIELDS)assert.equal(setup[key],'');
 const nextDraft=Object.fromEntries(['title','periodStart','periodEnd','timezone','channel','accountLabel','scopeLabel','metrics','commentary',...CLIENT_NARRATIVE_FIELDS].map(k=>[k,setup[k]]));
 const request=input({templateId,templateVersion:setup.templateVersion,serviceEngagementId:setup.serviceEngagementId,draft:nextDraft});
 assert.equal((await saveClientReport(db,actor,'james',null,request)).reason,'invalid','period must be explicitly entered');
 request.draft={...nextDraft,periodStart:'2026-09-01',periodEnd:'2026-09-30'};
 const next=await saveClientReport(db,actor,'james',null,request);assert.equal(next.ok,true);assert.notEqual(next.id,old.id);
 assert.equal((await saveClientReport(db,actor,'james',null,request)).id,next.id,'creation retry retains one new draft');
 const reopened=await getClientReport(db,actor,'james',next.id);assert.equal(reopened.revision,1);assert.equal(reopened.periodStart,'2026-09-01');assert.equal(reopened.templateVersion,1);
 for(const value of Object.values(reopened.metrics))assert.deepEqual(value,{state:'missing',value:null,sourceNote:'',collectedAt:null,sourceKind:'manual',importId:null});
 for(const key of ['commentary',...CLIENT_NARRATIVE_FIELDS])assert.equal(reopened[key],'');assert.deepEqual(await getClientReport(db,actor,'james',old.id),before);
 return {oldId:old.id,newId:next.id};
}
