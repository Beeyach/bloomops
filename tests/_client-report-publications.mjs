import assert from 'node:assert/strict';
import {saveClientReport,getClientReport} from '../lib/bloomops/client-reports.mjs';
import {changeReportPublication as publish,getPublishedReport,reportPublicationReview,listPublishedReports} from '../lib/bloomops/client-report-publications.mjs';
import {input,draft,observation} from './_client-report-fixture.mjs';
export async function checkReportPublications(db,owner,client){
 const value=input({draft:draft({clientSummary:'Client-safe summary',workCompleted:'Synthetic work',nextActions:'Review next period',limitations:'Manual observations only',commentary:'PRIVATE INTERNAL COMMENTARY',metrics:{sent:observation(32,{sourceNote:'PRIVATE source https://private.invalid/secret'}),delivered:observation(1)}})});
 const created=await saveClientReport(db,owner,'james',null,value);assert.ok(created.ok);const id=created.id;
 assert.deepEqual((await listPublishedReports(db,client,{portal:true})).items,[]);
 const request={workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),expectedRevision:1,expectedSequence:0,kind:'publish',acknowledgeUnverified:true};
 const [a,b]=await Promise.all([publish(db,owner,'james',id,request),publish(db,owner,'james',id,{...request})]);assert.ok(a.ok&&b.ok);assert.equal(a.id,b.id);
 const original=await getPublishedReport(db,client,a.id,{portal:true});assert.ok(original);assert.equal(original.snapshot.calculations[0].display,'3.13%');assert.equal(original.snapshot.clientSummary,'Client-safe summary');assert.equal(original.snapshot.metrics.find(m=>m.key==='sent').value,32);
 assert.doesNotMatch(JSON.stringify(original),/PRIVATE|private\.invalid|sourceNote|commentary|importId|creatorUserId|actorUserId/);
 assert.equal((await listPublishedReports(db,owner,{reportId:id})).items.length,1);
 assert.equal((await publish(db,owner,'james',id,{...request,kind:'withdraw'})).reason,'conflict');
 const edit={...value,expectedRevision:1,draft:{...value.draft,clientSummary:'Revised client-safe summary',metrics:{sent:observation(32),delivered:observation(2)}}};assert.ok((await saveClientReport(db,owner,'james',id,edit)).ok);
 assert.deepEqual(await getPublishedReport(db,client,a.id,{portal:true}),original,'draft save does not mutate released snapshot');
 assert.equal((await publish(db,owner,'james',id,{...request,requestId:crypto.randomUUID()})).reason,'conflict');
 const revision={...request,requestId:crypto.randomUUID(),expectedRevision:2,expectedSequence:1};
 const [x,y]=await Promise.all([publish(db,owner,'james',id,revision),publish(db,owner,'james',id,{...revision,requestId:crypto.randomUUID()})]);assert.equal([x,y].filter(x=>x.ok).length,1);assert.equal([x,y].filter(x=>x.reason==='conflict').length,1);
 const second=[x,y].find(x=>x.ok);assert.equal((await getPublishedReport(db,client,second.id,{portal:true})).snapshot.calculations[0].display,'6.25%');
 assert.equal(await getPublishedReport(db,client,a.id,{portal:true}),null,'old client/PDF URL no longer current');assert.deepEqual(await getPublishedReport(db,owner,a.id),original,'internal history preserves exact earlier snapshot');
 assert.ok((await publish(db,owner,'james',id,{...request,requestId:crypto.randomUUID(),kind:'withdraw',expectedRevision:2,expectedSequence:2})).ok);
 assert.equal(await getPublishedReport(db,client,second.id,{portal:true}),null);assert.equal((await listPublishedReports(db,client,{portal:true})).items.length,0);
 assert.equal((await listPublishedReports(db,owner,{reportId:id})).items.length,3);
 assert.equal((await reportPublicationReview(db,owner,'james',id)).current.kind,'withdraw');
 return {id,firstId:a.id,secondId:second.id};
}
