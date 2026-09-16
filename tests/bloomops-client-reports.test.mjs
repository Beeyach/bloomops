import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {one,run,all} from './_bloomops-db.mjs';
import {saveClientReport as save,getClientReport as get,listClientReports as list,reportServices} from '../lib/bloomops/client-reports.mjs';
import {reportInput,reportTemplate,reportCalculations,reportDate} from '../lib/bloomops/client-report-values.mjs';
import {draft,input,observation} from './_client-report-fixture.mjs';
async function fixture(ctx){const t=await setup();ctx.after(()=>t.raw.close());return t;}
for(const templateId of ['ghl_campaign','social'])test(`${templateId}: persists, reopens, edits and pins version`,async ctx=>{
 const t=await fixture(ctx),v=input({templateId,draft:draft({channel:templateId==='social'?'instagram':'email'})});
 const result=await save(t.db,t.owner,'james',null,v);assert.equal(result.ok,true);let report=await get(t.db,t.owner,'james',result.id);assert.equal(report.templateVersion,1);assert.equal(Object.keys(report.metrics).length,reportTemplate(templateId,1).metrics.length);assert.equal(report.metrics[templateId==='social'?'views':'sent'].state,'missing');
 assert.equal((await save(t.db,t.owner,'james',result.id,{...v,expectedRevision:1,draft:draft({...v.draft,commentary:'Revised'})})).ok,true);report=await get(t.db,t.owner,'james',result.id);assert.equal(report.commentary,'Revised');assert.equal(report.revision,2);assert.equal(report.updaterUserId,'ellen');
 assert.equal((await save(t.db,t.owner,'james',result.id,{...v,templateVersion:2,expectedRevision:2})).ok,false);
});
test('saved context retains distinct Client, Service, package and comparison fields',async ctx=>{
 const t=await fixture(ctx);run(t.raw,"UPDATE service_engagements SET package_name='Synthetic package' WHERE id='ghl-service'");
 const created=await save(t.db,t.owner,'james',null,input());const r=await get(t.db,t.owner,'james',created.id);
 assert.deepEqual([r.clientName,r.serviceName,r.packageName],['james','systems','Synthetic package']);
 assert.equal(r.comparisonPublicationId,null);
});
test('creation concurrent retry once, altered request conflicts, later edits survive retry',async ctx=>{
 const t=await fixture(ctx),v=input();const results=await Promise.all([save(t.db,t.owner,'james',null,v),save(t.db,t.owner,'james',null,v)]);assert.ok(results.every(r=>r.ok));assert.equal(results[0].id,results[1].id);assert.equal(one(t.raw,'SELECT count(*) n FROM client_report_drafts').n,1);
 assert.equal((await save(t.db,t.owner,'james',null,{...v,draft:draft({title:'Changed'})})).reason,'conflict');
 await save(t.db,t.owner,'james',results[0].id,{...v,expectedRevision:1,draft:draft({title:'Edited'})});assert.equal((await save(t.db,t.owner,'james',null,v)).id,results[0].id);assert.equal((await get(t.db,t.owner,'james',results[0].id)).title,'Edited');
});
test('two writers: one winner, loser conflicts without overwriting observations',async ctx=>{
 const t=await fixture(ctx),v=input(),created=await save(t.db,t.owner,'james',null,v),ary=await t.actor('ary');
 const results=await Promise.all([save(t.db,t.owner,'james',created.id,{...v,expectedRevision:1,draft:draft({metrics:{sent:observation(3)}})}),save(t.db,ary,'james',created.id,{...v,userId:'ary',expectedRevision:1,draft:draft({metrics:{sent:observation(7)}})})]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='conflict').length,1);assert.equal((await get(t.db,t.owner,'james',created.id)).revision,2);
});
test('roles, client assignment versus service-only, wrong IDs and revoked access',async ctx=>{
 const t=await fixture(ctx),v=input(),created=await save(t.db,t.owner,'james',null,v);
 for(const who of ['james','lawrence','foreign','sam']){const a=await t.actor(who);assert.equal(await get(t.db,a,'james',created.id),null);assert.equal((await save(t.db,a,'james',created.id,{...v,userId:a.userId,workspaceId:a.workspaceId,expectedRevision:1})).ok,false);}
 t.assign('service','sam','ghl-service');assert.equal(await get(t.db,await t.actor('sam'),'james',created.id),null);
 t.assign('client','sam','james');const sam=await t.actor('sam');assert.equal((await get(t.db,sam,'james',created.id)).canEdit,false);assert.equal((await list(t.db,sam,'james')).items.length,1);
 run(t.raw,"DELETE FROM client_assignments WHERE membership_id='m-sam'");assert.equal(await get(t.db,sam,'james',created.id),null);
 const pm=await t.actor('pm');assert.equal((await get(t.db,pm,'james',created.id)).canEdit,true);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal(await get(t.db,t.owner,'james',created.id),null);assert.equal((await save(t.db,t.owner,'james',created.id,{...v,expectedRevision:1})).ok,false);
});
test('relationship mismatch, old user/workspace and preview actors reject',async ctx=>{
 const t=await fixture(ctx);
 for(const patch of [{serviceEngagementId:'kajabi-service'},{serviceEngagementId:'foreign-service'},{workspaceId:'b'},{userId:'ary'}])assert.equal((await save(t.db,t.owner,'james',null,input(patch))).ok,false);
 assert.equal((await save(t.db,{...t.owner,preview:{}},'james',null,input())).ok,false);
});
test('failure rolls back header and metrics; zero-row update cannot delete saved observations',async ctx=>{
 const t=await fixture(ctx),v=input({draft:draft({metrics:{sent:observation(10)}})}),created=await save(t.db,t.owner,'james',null,v);
 const before=all(t.raw,'SELECT * FROM client_report_metrics');
 run(t.raw,"CREATE TRIGGER n3a_failure BEFORE INSERT ON client_report_metrics BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 await assert.rejects(save(t.db,t.owner,'james',created.id,{...v,expectedRevision:1,draft:draft({metrics:{sent:observation(20)}})}));assert.deepEqual(all(t.raw,'SELECT * FROM client_report_metrics'),before);assert.equal((await get(t.db,t.owner,'james',created.id)).revision,1);
 run(t.raw,'DROP TRIGGER n3a_failure');run(t.raw,"CREATE TRIGGER n3a_ignore BEFORE UPDATE ON client_report_drafts BEGIN SELECT RAISE(IGNORE); END");assert.equal((await save(t.db,t.owner,'james',created.id,{...v,expectedRevision:1})).reason,'conflict');assert.deepEqual(all(t.raw,'SELECT * FROM client_report_metrics'),before);
});
test('revocation at commit fails closed',async ctx=>{
 const t=await fixture(ctx),v=input();const batch=t.db.batch.bind(t.db);t.db.batch=async statements=>{run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");return batch(statements);};assert.equal((await save(t.db,t.owner,'james',null,v)).ok,false);assert.equal(one(t.raw,'SELECT count(*) n FROM client_report_drafts').n,0);
});
test('bounded lists and service lookup; guessed client/report pair cannot read',async ctx=>{
 const t=await fixture(ctx);let id;for(let i=0;i<21;i++)id=(await save(t.db,t.owner,'james',null,input())).id;
 assert.equal((await list(t.db,t.owner,'james')).items.length,20);assert.equal((await list(t.db,t.owner,'james')).more,true);assert.equal((await list(t.db,t.owner,'james',{page:2})).items.length,1);
 assert.equal(await get(t.db,t.owner,'lawrence',id),null);assert.equal((await reportServices(t.db,t.owner,'james')).items.length,2);assert.equal(await list(t.db,t.owner,'james',{page:0}),null);
});
test('shipped migration enforces relationship, parent immutability and metric values',async ctx=>{
 const t=await fixture(ctx),r=await save(t.db,t.owner,'james',null,input());
 assert.throws(()=>run(t.raw,'UPDATE client_report_drafts SET service_engagement_id=? WHERE id=?','kajabi-service',r.id));
 assert.throws(()=>run(t.raw,'UPDATE client_report_metrics SET value=-1,state=? WHERE report_id=?','value',r.id));
 assert.throws(()=>run(t.raw,'UPDATE client_report_metrics SET workspace_id=? WHERE report_id=?','b',r.id));
 run(t.raw,'DELETE FROM client_report_drafts WHERE id=?',r.id);assert.equal(one(t.raw,'SELECT count(*) n FROM client_report_metrics').n,0);
});
test('period, timezone, catalogue and typed metric validation',()=>{
 const template=reportTemplate('ghl_campaign',1);assert.equal(reportDate('2024-02-29'),true);assert.equal(reportDate('2025-02-29'),false);
 for(const patch of [{periodEnd:'2026-07-31'},{periodStart:'invalid'},{timezone:'Not/AZone'},{channel:'instagram'},{metrics:{revenue:observation(10)}},{metrics:{sent:observation(1.2)}},{metrics:{sent:observation(-1)}},{metrics:{sent:observation(1e10)}},{metrics:{sent:observation(1),delivered:observation(2)}},{metrics:{sent:observation(0,{state:'missing'})}},{metrics:{sent:observation(1,{collectedAt:'2026-02-30T00:00:00.000Z'})}}])assert.ok(reportInput(draft(patch),template).error,JSON.stringify(patch));
 assert.ok(reportInput(draft({metrics:{sent:observation(0)}}),template).value);
});
for(const [sent,delivered,expected] of [[3,1,'33.33%'],[3,2,'66.67%'],[32,1,'3.13%'],[10,0,'0.00%'],[0,0,'Not available'],[null,0,'Not available']])test(`delivery calculation ${delivered}/${sent}: ${expected}`,()=>{const r={...draft({metrics:{sent:sent===null?{state:'missing'}:observation(sent),delivered:observation(delivered)}}),templateId:'ghl_campaign'};assert.equal(reportCalculations(r)[0].display,expected);assert.equal(reportCalculations({...r,accountLabel:''})[0].display,'Not available');});
test('social missing and zero stay distinct, signed follower change has no invented rate',()=>{const r={...draft({metrics:{followers_start:observation(100),followers_end:observation(95)}}),templateId:'social'};assert.equal(reportCalculations(r)[0].display,'-5');r.metrics.followers_start={state:'unavailable',value:null};assert.equal(reportCalculations(r)[0].display,'Not available');});

test('version 1 metric labels and definitions preserve the frozen manual catalogue',()=>{
 const expected=[
 [
  "ghl_campaign",
  "sent",
  "Sent messages",
  "messages submitted in this report's channel, account, campaign and period; not recipient count"
 ],
 [
  "ghl_campaign",
  "delivered",
  "Delivered messages",
  "the subset of those submitted messages recorded as delivered"
 ],
 [
  "ghl_campaign",
  "failed",
  "Failed messages",
  "messages recorded as failed; source note must explain whether bounces are included; never added to delivered to infer sent"
 ],
 [
  "ghl_campaign",
  "clicked",
  "Messages with clicks",
  "submitted messages with at least one recorded click, not total click events or unique people"
 ],
 [
  "ghl_campaign",
  "replied",
  "Messages with replies",
  "submitted messages with at least one recorded reply"
 ],
 [
  "ghl_campaign",
  "opt_outs",
  "Opt-outs",
  "source-recorded opt-out events in the scoped period; not inferred from replies"
 ],
 [
  "social",
  "published",
  "Published content",
  "source-recorded posts/content published for this account/channel/period"
 ],
 [
  "social",
  "views",
  "Views",
  "source-native view count; source note describes its definition; not reach"
 ],
 [
  "social",
  "reach",
  "Reach",
  "source-native reach for the whole account/scope/period, never a sum of overlapping post reach"
 ],
 [
  "social",
  "interactions",
  "Interactions",
  "source-native interaction count; definition recorded in source note; no inferred engagement rate"
 ],
 [
  "social",
  "link_clicks",
  "Link clicks",
  "source-native click events, not unique people"
 ],
 [
  "social",
  "followers_start",
  "Followers at period start",
  "account follower count at beginning of period"
 ],
 [
  "social",
  "followers_end",
  "Followers at period end",
  "same-account follower count at end of period"
 ]
];
 for(const [template,key,label,definition] of expected){const m=reportTemplate(template,1).metrics.find(m=>m.key===key);assert.equal(m.label,label);assert.equal(m.definition,definition);}
});
