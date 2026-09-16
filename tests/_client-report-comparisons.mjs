import assert from 'node:assert/strict';
import {saveClientReport as save,getClientReport as get} from '../lib/bloomops/client-reports.mjs';
import {changeReportPublication as publish,getPublishedReport} from '../lib/bloomops/client-report-publications.mjs';
import {comparisonOptions} from '../lib/bloomops/client-report-comparisons.mjs';
import {input,draft,observation} from './_client-report-fixture.mjs';
import {releaseInput} from './_client-report-archive.mjs';
export async function checkReportComparisons(db,owner,client,templateId='ghl_campaign'){
 const key=templateId==='social'?'published':'sent',channel=templateId==='social'?'instagram':'email';
 const previous=input({templateId,draft:draft({channel,clientSummary:'Previous public summary',metrics:{[key]:observation(17,{sourceNote:'PRIVATE baseline evidence'})}})});
 const old=await save(db,owner,'james',null,previous);assert.ok(old.ok);const publication=await publish(db,owner,'james',old.id,releaseInput());assert.ok(publication.ok);
 const request=input({templateId,draft:draft({channel,periodStart:'2026-09-01',periodEnd:'2026-09-30',clientSummary:'Current public summary',comparisonPublicationId:publication.id,metrics:{[key]:observation(0)}})});
 const [current,retry]=await Promise.all([save(db,owner,'james',null,request),save(db,owner,'james',null,{...request,draft:{...request.draft}})]);assert.ok(current.ok&&retry.ok);assert.equal(retry.id,current.id);assert.equal((await save(db,owner,'james',null,{...request,draft:{...request.draft,comparisonPublicationId:null}})).reason,'conflict');
 const stored=await get(db,owner,'james',current.id);assert.equal(stored.comparisonPublicationId,publication.id);assert.equal(stored.comparison.metrics[0].difference,-17);assert.equal(stored.comparison.current.days,30);assert.equal(stored.comparison.previous.days,31);
 assert.ok((await comparisonOptions(db,owner,stored)).items.some(r=>r.id===publication.id));
 for(const patch of [{periodStart:'2026-08-01',periodEnd:'2026-08-31'},{scopeLabel:'Different scope'},{channel:templateId==='social'?'facebook':'sms'}])assert.equal((await save(db,owner,'james',current.id,{...request,expectedRevision:1,draft:{...request.draft,...patch}})).reason,'invalid');
 assert.equal((await get(db,owner,'james',current.id)).revision,1);
 const release=await publish(db,owner,'james',current.id,releaseInput());assert.ok(release.ok);const visible=await getPublishedReport(db,client,release.id,{portal:true});assert.equal(visible.snapshot.comparison.metrics[0].difference,-17);assert.doesNotMatch(JSON.stringify(visible),/PRIVATE|sourceNote|commentary/);
 await publish(db,owner,'james',old.id,releaseInput({kind:'withdraw',expectedSequence:1}));
 const unavailable=await get(db,owner,'james',current.id);assert.equal(unavailable.comparisonUnavailable,true);assert.equal(unavailable.comparison,null);
 assert.equal((await publish(db,owner,'james',current.id,releaseInput({expectedSequence:1}))).reason,'invalid','cannot newly publish a withdrawn source');
 assert.deepEqual(await getPublishedReport(db,client,release.id,{portal:true}),visible,'already published comparison is an immutable approved copy');
 assert.ok((await publish(db,owner,'james',current.id,releaseInput({kind:'withdraw',expectedSequence:1}))).ok,'withdrawal still works when baseline is unavailable');
 const clear={...request,expectedRevision:1,draft:{...request.draft,comparisonPublicationId:null}};assert.ok((await save(db,owner,'james',current.id,clear)).ok);assert.equal((await get(db,owner,'james',current.id)).comparison,null);
 return {id:current.id,source:old.id,publication:publication.id,request};
}
