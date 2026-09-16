import assert from 'node:assert/strict';
import {saveClientReport as save,getClientReport as get,changeReportArchive as archive,listClientReports,newPeriodReportSetup} from '../lib/bloomops/client-reports.mjs';
import {changeReportPublication as publish,getPublishedReport,listPublishedReports} from '../lib/bloomops/client-report-publications.mjs';
import {input,draft} from './_client-report-fixture.mjs';
export const archiveInput=(patch={})=>({workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),expectedRevision:1,archived:true,...patch});
export const releaseInput=(patch={})=>({workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),expectedRevision:1,expectedSequence:0,kind:'publish',acknowledgeUnverified:true,...patch});
export async function checkReportArchive(db,owner,client,templateId='ghl_campaign'){
 const v=input({templateId,draft:draft({channel:templateId==='social'?'instagram':'email',clientSummary:'Archive QA safe summary'})}),created=await save(db,owner,'james',null,v);assert.ok(created.ok);const id=created.id;
 const published=await publish(db,owner,'james',id,releaseInput());assert.ok(published.ok);const snapshot=await getPublishedReport(db,client,published.id,{portal:true});assert.ok(snapshot);
 const request=archiveInput();const result=await Promise.all([archive(db,owner,'james',id,request),archive(db,owner,'james',id,{...request})]);assert.ok(result.every(r=>r.ok&&r.id===id&&r.revision===2));
 let stored=await get(db,owner,'james',id);assert.ok(stored.archivedAt);assert.equal(stored.publicationFloor,1);assert.equal(stored.canEdit,false);assert.equal(stored.canManageArchive,true);
 assert.ok(!(await listClientReports(db,owner,'james')).items.some(r=>r.id===id));assert.ok((await listClientReports(db,owner,'james',{archived:true})).items.some(r=>r.id===id));
 assert.equal(await getPublishedReport(db,client,published.id,{portal:true}),null);assert.ok(!(await listPublishedReports(db,client,{portal:true})).items.some(r=>r.id===published.id));assert.deepEqual(await getPublishedReport(db,owner,published.id),snapshot);
 assert.equal((await save(db,owner,'james',id,{...v,expectedRevision:2})).reason,'conflict');assert.equal((await publish(db,owner,'james',id,releaseInput({expectedRevision:2,expectedSequence:1}))).reason,'invalid');
 assert.ok(await newPeriodReportSetup(db,owner,'james',id),'archived setup may start a separate empty period');
 assert.equal((await archive(db,owner,'james',id,{...request,archived:false})).reason,'conflict','same UUID changed intent');
 assert.ok((await archive(db,owner,'james',id,archiveInput({expectedRevision:2,archived:false}))).ok);stored=await get(db,owner,'james',id);assert.equal(stored.archivedAt,null);assert.equal(stored.publicationFloor,1);assert.equal(stored.canEdit,true);
 assert.equal(await getPublishedReport(db,client,published.id,{portal:true}),null,'restore does not resurrect any client link/PDF');
 assert.equal((await archive(db,owner,'james',id,request)).reason,'conflict','old action cannot rearchive restored report');
 const corrected=await publish(db,owner,'james',id,releaseInput({expectedRevision:3,expectedSequence:1}));assert.ok(corrected.ok);assert.ok(await getPublishedReport(db,client,corrected.id,{portal:true}));assert.equal((await listPublishedReports(db,owner,{reportId:id})).items.length,2);
 return {id,publishedId:published.id,value:v};
}
export async function checkArchiveRace(db,owner){
 const value=input({draft:draft({clientSummary:'Race fixture'})}),created=await save(db,owner,'james',null,value),id=created.id;
 const writes=await Promise.all([archive(db,owner,'james',id,archiveInput()),save(db,owner,'james',id,{...value,expectedRevision:1,draft:draft({title:'Concurrent changed title',clientSummary:'Race fixture'})})]);
 assert.equal(writes.filter(r=>r.ok).length,1);assert.equal(writes.filter(r=>r.reason==='conflict').length,1);const current=await get(db,owner,'james',id);assert.equal(current.revision,2);assert.equal(!!current.archivedAt,writes[0].ok===true);
 const second=await save(db,owner,'james',null,input({draft:draft({clientSummary:'Publication race fixture'})}));
 const race=await Promise.all([archive(db,owner,'james',second.id,archiveInput()),publish(db,owner,'james',second.id,releaseInput())]);assert.ok(race[0].ok);
 const final=await get(db,owner,'james',second.id);assert.ok(final.archivedAt);const history=await listPublishedReports(db,owner,{reportId:second.id});assert.equal(final.publicationFloor,history.items.length,'archive includes any publication that won before it');
 return second.id;
}
