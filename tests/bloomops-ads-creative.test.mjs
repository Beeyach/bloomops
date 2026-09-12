import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { run, all, APP_URL } from './_bloomops-db.mjs';
import { seedAdsParents } from '../scripts/content-context-fixture.mjs';
import { createAdsContent, createContent, getContent, getInternalContent, updateContent } from '../lib/bloomops/content.mjs';
import { getAdsContent, listAdsCreative, adsCreativeOptions, adsCreativeFacets, adsCreativeHistory, adsCreativeFilters } from '../lib/bloomops/ads-creative.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { loadInternalContentResource } from '../lib/bloomops/content-internal-access.mjs';
import { evaluate } from '../lib/bloomops/authorization.mjs';
import { uploadContentFile, changeContentFile, downloadContentFile, listContentFiles } from '../lib/bloomops/content-files.mjs';
import { requestContentApproval } from '../lib/bloomops/content-approvals.mjs';
import { contentFileActivityRows } from '../lib/bloomops/content-file-activity.mjs';
import { getPortalContent } from '../lib/bloomops/portal-content.mjs';
async function fixture(auth=false) {
 const t=await setup({auth});t.sql=(q,...p)=>run(t.raw,q,...p);await seedAdsParents(t.sql);
 t.assignProject=(who='sam',id='ads-project')=>t.sql("INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,?)",id,`m-${who}`);
 t.create=(input={},extra={})=>createAdsContent(t.db,{actor:t.owner,projectId:'ads-project',requestId:crypto.randomUUID(),input:{title:'Launch video',...input},...extra});
 t.get=(id,actor=t.owner)=>getAdsContent(t.db,actor,id);
 t.edit=(id,input={},extra={})=>updateContent(t.db,{actor:t.owner,contentId:id,input,expectedRevision:1,...extra});
 t.step=(id,targetStage,extra={})=>transitionContent(t.db,{actor:t.owner,contentId:id,input:{targetStage,expectedRevision:1,...extra}});
 t.uploadAds=(id,input={},extra={})=>uploadContentFile(t.db,{actor:t.owner,contentId:id,bucket:t.bucket,bytes:t.bytes,input:t.input({purpose:'asset',visibility:'internal',...input}),...extra});
 return t;
}
test('Ads create derives immutable context, uses canonical records and keeps Social receipts unchanged',async()=>{
 const t=await fixture(),before=t.parents(),r=await t.create({platforms:['Instagram']});assert.equal(r.ok,true,JSON.stringify(r));
 const item=await t.get(r.contentId);assert.equal(item.adsProjectId,'ads-project');assert.equal(item.productionArea,'ads');assert.equal(item.type,'ad_creative');assert.equal(item.recordingRequired,false);assert.equal(item.stage,'idea');assert.equal(item.editable,true);
 assert.equal(await getContent(t.db,t.owner,r.contentId),null);assert.equal(await getAdsContent(t.db,t.owner,t.contentId),null);
 assert.deepEqual(t.parents(),before);assert.deepEqual(item.platforms,[{key:'instagram',label:'Instagram'}]);
 assert.equal(JSON.parse(t.history().at(-1).metadata_json).adsProjectId,'ads-project');
 for(const input of [{adsProjectId:'ads-other-project'},{productionArea:'social'},{recordingRequired:false},{visibility:'client'},{stage:'published'},{publishedAt:'2026-09-12'}])assert.equal((await t.create(input)).ok,false);
 const social=await t.add();assert.equal(social.ok,true);assert.equal('productionArea' in JSON.parse(t.history().at(-1).metadata_json),false);
});
for(const who of ['ellen','ary','pm','sam','other','james','foreign'])test(`Ads permission matrix ${who}`,async()=>{
 const t=await fixture();t.assignProject();const actor=await t.actor(who),r=await t.create();const allowed=['ellen','ary','pm','sam'].includes(who);
 assert.equal(!!await t.get(r.contentId,actor),allowed);assert.equal((await t.create({}, {actor})).ok,allowed);
 assert.equal((await t.edit(r.contentId,{caption:'Changed'},{actor})).ok,allowed);
 const row=await getInternalContent(t.db,actor,r.contentId);assert.equal(!!row,allowed);
 const descriptor=await loadInternalContentResource(t.db,actor,r.contentId);if(allowed)assert.equal(evaluate(actor,{action:'content.manage',resource:descriptor}).allowed,true);
 if(who==='sam'){assert.equal(await getContent(t.db,actor,t.contentId),null);assert.equal(evaluate(actor,{action:'content.view',resource:{type:'content',workspaceId:'a',clientId:'james',serviceEngagementId:'ads-service',projectId:'ads-project',visibility:'internal'}}).allowed,false);}
});
for(const parent of [false,true])test(`restricted Ads child requires Project assignment; restricted parent=${parent}`,async()=>{
 const t=await fixture();t.assign('sam');t.assign('pm');const r=await t.create({visibility:'restricted'});
 if(parent)t.sql("UPDATE projects SET visibility='restricted' WHERE id='ads-project'");
 for(const who of ['sam','pm']){const actor=await t.actor(who);assert.equal(await t.get(r.contentId,actor),null);assert.equal((await t.edit(r.contentId,{visibility:'internal'},{actor})).ok,false);t.assignProject(who);assert.ok(await t.get(r.contentId,actor));assert.equal((await t.create({visibility:'restricted'},{actor})).ok,true);}
});
for(const revoke of ["DELETE FROM project_assignments WHERE membership_id='m-sam'","UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'","UPDATE service_types SET department_id='social' WHERE id='type-ads'","UPDATE projects SET visibility='restricted' WHERE id='ads-project'"])test(`live revocation and atomic create guard: ${revoke}`,async()=>{
 const t=await fixture();if(revoke.includes('visibility'))t.assign('sam');else t.assignProject();const actor=await t.actor('sam'),r=await t.create({}, {actor});assert.equal(r.ok,true);
 const requestId=crypto.randomUUID();assert.equal((await t.create({}, {actor,requestId})).ok,true);
 t.sql(revoke);assert.equal(await t.get(r.contentId,actor),null);assert.equal((await t.create({}, {actor,requestId})).ok,false);assert.equal((await t.edit(r.contentId,{caption:'No'},{actor})).ok,false);
});
test('create/edit late revocation and failed event batch leave no partial writes',async()=>{
 const t=await fixture();t.assignProject();const actor=await t.actor('sam'),before=t.snapshot();t.beforeBatch(()=>t.sql("DELETE FROM project_assignments WHERE membership_id='m-sam'"));assert.equal((await t.create({}, {actor})).ok,false);assert.deepEqual(t.snapshot(),before);
 const x=await fixture();x.sql("CREATE TRIGGER reject_ads_event BEFORE INSERT ON activity_events WHEN NEW.subject_type='content' BEGIN SELECT RAISE(ABORT,'test event failure'); END");const snapshot=x.snapshot();await assert.rejects(x.create({platforms:['Instagram']}));assert.deepEqual(x.snapshot(),snapshot);
 const y=await fixture();y.assignProject();const a=await y.actor('sam'),r=await y.create();const beforeEdit=y.snapshot();y.beforeBatch(()=>y.sql("DELETE FROM project_assignments WHERE membership_id='m-sam'"));assert.equal((await y.edit(r.contentId,{caption:'Denied'},{actor:a})).ok,false);assert.deepEqual(y.snapshot(),beforeEdit);
});
test('creation receipts conflict across Projects and areas, including a late collision',async()=>{
 const t=await fixture(),requestId=crypto.randomUUID(),r=await t.create({}, {requestId});assert.equal((await t.create({}, {requestId})).unchanged,true);
 assert.equal((await t.create({}, {requestId,projectId:'ads-other-project'})).reason,'conflict');assert.equal((await t.create({title:'Other'}, {requestId})).reason,'conflict');
 assert.equal((await createContent(t.db,{actor:t.owner,clientId:'james',requestId,input:{title:'Launch video',type:'ad_creative'}})).reason,'conflict');
 const late=crypto.randomUUID();t.beforeBatch(()=>t.create({}, {requestId:late,projectId:'ads-other-project'}));assert.equal((await t.create({}, {requestId:late})).reason,'conflict');assert.ok(await t.get(r.contentId));
});
test('Ads production uses exact internal edges and never enters client review or publication',async()=>{
 const t=await fixture(),r=await t.create();let revision=1;
 for(const stage of ['script','editing','internal_review','revision_requested','editing']){
  const input={expectedRevision:revision,...stage==='revision_requested'?{context:'Tighten the opening'}:{}};
  assert.equal((await t.step(r.contentId,stage,input)).ok,true,stage);assert.equal((await t.step(r.contentId,stage,input)).unchanged,true);revision++;
 }
 for(const stage of ['waiting_for_recording','client_review','approved','scheduled','published'])assert.equal((await t.step(r.contentId,stage,{expectedRevision:revision,context:stage==='waiting_for_recording'?'Record':undefined})).ok,false);
 assert.equal((await t.edit(r.contentId,{clientApprovalRequired:false},{expectedRevision:revision})).ok,false);
 assert.equal((await t.get(r.contentId)).publishedAt,null);
 assert.equal((await requestContentApproval(t.db,{actor:t.owner,contentId:r.contentId,input:{}})).reason,'not_found');
 assert.equal(await getPortalContent(t.db,await t.actor('james'),r.contentId),null);
});
for(const corruption of ["recording_required=1","client_approval_required=0","internal_review_required=0","stage='approved'","stage='published',published_at='2026-09-12T00:00:00.000Z'"])test(`invalid stored workflow blocks edits, platforms, retries and uploads: ${corruption}`,async()=>{
 const t=await fixture(),r=await t.create();const platform={platforms:['Instagram'],expectedRevision:1};assert.equal((await setContentPlatforms(t.db,{actor:t.owner,contentId:r.contentId,input:platform})).ok,true);
 t.sql(`UPDATE content_items SET ${corruption} WHERE id=?`,r.contentId);assert.equal((await t.get(r.contentId)).editable,false);
 assert.equal((await t.edit(r.contentId,{caption:'No'},{expectedRevision:2})).ok,false);assert.equal((await setContentPlatforms(t.db,{actor:t.owner,contentId:r.contentId,input:platform})).ok,false);assert.equal((await t.uploadAds(r.contentId)).ok,false);
});
test('Ads working assets preserve bytes, restrict purpose/visibility and revoke generic downloads',async()=>{
 const t=await fixture();t.assign('sam');const actor=await t.actor('sam'),r=await t.create();
 for(const input of [{purpose:'recording'},{visibility:'client'}])assert.equal((await t.uploadAds(r.contentId,input)).ok,false);
 const uploaded=await t.uploadAds(r.contentId);assert.equal(uploaded.ok,true,JSON.stringify(uploaded));const id=uploaded.fileId;
 const downloaded=await downloadContentFile(t.db,{actor,bucket:t.bucket,fileId:id});assert.ok(downloaded);assert.deepEqual(new Uint8Array(await new Response(downloaded.body).arrayBuffer()),t.bytes);
 const file=all(t.raw,'SELECT * FROM assets WHERE id=?',id)[0];assert.equal((await changeContentFile(t.db,{actor:t.owner,contentId:r.contentId,fileId:id,operation:'visibility',visibility:'restricted',expectedRevision:file.revision})).ok,true);
 assert.equal(await downloadContentFile(t.db,{actor,bucket:t.bucket,fileId:id}),null);t.assignProject();assert.ok(await downloadContentFile(t.db,{actor,bucket:t.bucket,fileId:id}));
 t.sql("UPDATE service_types SET department_id='social' WHERE id='type-ads'");assert.equal(await downloadContentFile(t.db,{actor:t.owner,bucket:t.bucket,fileId:id}),null);assert.deepEqual((await listContentFiles(t.db,t.owner,r.contentId)).items,[]);
});
test('Ads query bounds, history and 240 Project-only assignments use live SQL scope',async()=>{
 const t=await fixture();for(let i=0;i<240;i++){t.sql("INSERT INTO projects(id,workspace_id,client_id,service_engagement_id,name) VALUES(?,'a','james','ads-service',?)",`extra-${i}`,`Extra ${i}`);t.assignProject('sam',`extra-${i}`);}t.assignProject();const actor=await t.actor('sam');
 for(let i=0;i<52;i++)assert.equal((await t.create({title:`Creative ${i}`},{actor})).ok,true);
 const list=await listAdsCreative(t.db,actor);assert.equal(list.items.length,50);assert.equal(list.hasMore,true);assert.equal((await listAdsCreative(t.db,actor,{page:'2'})).items.length,2);
 const options=await adsCreativeOptions(t.db,actor,{projectId:'extra-99'});assert.equal(options.parentsOverflow,true);assert.ok(options.parents.some(p=>p.projectId==='extra-99'));
 assert.equal((await adsCreativeOptions(t.db,actor,{q:'%'})).parents.length,0);assert.ok((await adsCreativeFacets(t.db,actor)).projectId.items.length);
 const id=list.items[0].id;for(let i=0;i<65;i++)t.sql("INSERT INTO activity_events(workspace_id,client_id,subject_type,subject_id,event_type,metadata_json) VALUES('a','james','content',?,'CONTENT_DETAILS_UPDATED','{}')",id);
 const history=await adsCreativeHistory(t.db,actor,id);assert.equal(history.items.length,60);assert.equal(history.hasMore,true);
 for(const bad of [{x:'1'},{page:'10001'},{page:'0'},{page:'1.5'},{stage:'published'},{projectId:['ads-project']},{projectId:'a b'}])assert.equal(adsCreativeFilters(bad).ok,false);
 t.sql("DELETE FROM project_assignments WHERE membership_id='m-sam'");assert.equal((await listAdsCreative(t.db,actor)).items.length,0);assert.equal((await adsCreativeHistory(t.db,actor,id)).items.length,0);
});
test('HTTP routes use stored context, reject unknown inputs and keep approvals/portal Social-only',async()=>{
 const t=await fixture(true);t.assignProject();const {cookie}=await t.signIn('sam@example.com');globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
 const call=async(path,method,body,params={})=>{const route=await import(`../app/api/bloomops/${path}/route.js`);return route[method](new Request(`${APP_URL}/api/bloomops/${path}`,{method,headers:{cookie,origin:APP_URL,'content-type':'application/json'},...method==='GET'?{}:{body:JSON.stringify(body)}}),{params:Promise.resolve(params)});};
 const made=await call('projects/[id]/creative','POST',{title:'HTTP creative',requestId:crypto.randomUUID()},{id:'ads-project'});assert.equal(made.status,201);const {contentId}=await made.json();
 assert.equal((await call('content/[contentId]','GET',null,{contentId})).status,200);
 assert.equal((await call('content/[contentId]','PATCH',{recordingRequired:false,expectedRevision:1},{contentId})).status,400);
 assert.equal((await call('content/[contentId]/approvals','POST',{}, {contentId})).status,404);
 assert.equal((await call('portal/content/[contentId]','GET',null,{contentId})).status,404);
 const uploaded=await t.uploadAds(contentId),fileId=uploaded.fileId;assert.equal(uploaded.ok,true);
 const retry=await import('../app/api/bloomops/files/[fileId]/retry/route.js');
 const request=()=>new Request(`${APP_URL}/api/bloomops/files/${fileId}/retry`,{method:'POST',headers:{cookie,origin:APP_URL,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify({filename:'recording.mp4',mimeType:'video/mp4',byteSize:t.bytes.length}))},body:t.bytes});
 const recovered=await retry.POST(request(),{params:Promise.resolve({fileId})});assert.equal(recovered.status,200);assert.equal((await recovered.json()).unchanged,true);
 t.sql("DELETE FROM project_assignments WHERE membership_id='m-sam'");assert.equal((await retry.POST(request(),{params:Promise.resolve({fileId})})).status,404);

});

test('Ads-specific entry points cannot fall back to Social or leak Project-only file history through Client aggregates',async()=>{
 const t=await fixture();assert.equal((await t.create({}, {projectId:null,clientId:'james'})).reason,'not_found');
 assert.deepEqual(await adsCreativeHistory(t.db,t.owner,t.contentId),{items:[],hasMore:false});
 t.assignProject();const actor=await t.actor('sam'),r=await t.create(),uploaded=await t.uploadAds(r.contentId);assert.equal(uploaded.ok,true);
 assert.ok((await contentFileActivityRows(t.db,actor,{contentId:r.contentId})).length);
 assert.equal((await contentFileActivityRows(t.db,actor,{clientId:'james'})).length,0);
 t.assign('sam');assert.ok((await contentFileActivityRows(t.db,actor,{clientId:'james'})).length);
});
test('platform facets deduplicate normalized keys across differently cased labels',async()=>{
 const t=await fixture();await t.create({platforms:['Instagram']});await t.create({platforms:['instagram']});
 const facets=await adsCreativeFacets(t.db,t.owner);assert.equal(facets.platform.items.length,1);assert.equal(facets.platform.items[0].id,'instagram');
});

test('mixed Content and File history orders identical timestamps by text event ID descending',async()=>{
 const t=await fixture(),r=await t.create(),file=await t.uploadAds(r.contentId);assert.equal(file.ok,true);
 const contentEvent='00000000-0000-4000-8000-000000000001',fileEvent='ffffffff-ffff-4fff-8fff-ffffffffffff';
 for(const [id,type,subject,event] of [[contentEvent,'content',r.contentId,'CONTENT_DETAILS_UPDATED'],[fileEvent,'file',file.fileId,'FILE_UPLOADED']])
  t.sql("INSERT INTO activity_events(id,workspace_id,client_id,subject_type,subject_id,event_type,metadata_json,occurred_at) VALUES(?,'a','james',?,?,?,'{}','2099-09-12T12:00:00.000Z')",id,type,subject,event);
 assert.deepEqual((await adsCreativeHistory(t.db,t.owner,r.contentId)).items.slice(0,2).map(row=>row.id),[fileEvent,contentEvent]);
});
