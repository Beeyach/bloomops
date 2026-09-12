import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { APP_URL,run,all } from './_bloomops-db.mjs';
import { seedAdsParents,insertAds,seedReview,seedContentAsset,contentContextBytes } from '../scripts/content-context-fixture.mjs';
import { listContent,getContent,contentOptions } from '../lib/bloomops/content.mjs';
import { contentCalendar } from '../lib/bloomops/content-calendar.mjs';
import { portalContent,hasPortalContent,getPortalContent } from '../lib/bloomops/portal-content.mjs';
import { recordingRequests } from '../lib/bloomops/content-files.mjs';
import { approvalRequests,contentApprovalHistory } from '../lib/bloomops/content-approvals.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { contentFileActivityRows } from '../lib/bloomops/content-file-activity.mjs';

const roles=['ellen','ary','pm','sam','james','foreign'];
async function fixture(auth=false) {
  const t=await setup({auth});t.sql=(q,...p)=>run(t.raw,q,...p);
  t.assign('sam');t.assign('pm');
  t.actors=Object.fromEntries(await Promise.all(roles.map(async id=>[id,await t.actor(id)])));
  await seedAdsParents(t.sql);
  t.ads=await insertAds(t.sql,{id:'private-ads-recording',stage:'waiting_for_recording'});
  // Capture through E3A's valid structural path, then revoke ordinary Content
  // visibility. All existing guessed-ID/forged-client-visibility denials remain.
  t.review=await insertAds(t.sql,{id:'private-ads-review',stage:'internal_review',recording_required:0,visibility:'internal',revision:2});
  await seedReview(t.sql,t.review,()=>t.sql("UPDATE content_items SET stage='client_review' WHERE id=?",t.review));
  t.sql("UPDATE content_items SET visibility='client' WHERE id=?",t.review);
  t.restricted=await insertAds(t.sql,{id:'private-ads-restricted',visibility:'restricted'});
  // The separate review has an empty, frozen platform snapshot.
  run(t.raw,"INSERT INTO content_platforms(workspace_id,content_id,platform_key,label) VALUES('a',?,'private-ads-platform','PRIVATE_ADS_PLATFORM')",t.ads);
  for(const [id,vis] of [['private-ads-file','client'],['private-ads-restricted-file','restricted']]) {
    await seedContentAsset(t.sql,t.ads,id,vis);await t.bucket.put(`local/${id}`,contentContextBytes,{sha256:Buffer.from(await crypto.subtle.digest('SHA-256',contentContextBytes)).toString('hex')});
    assert.equal((await t.bucket.head(`local/${id}`)).size,all(t.raw,'SELECT byte_size FROM assets WHERE id=?',id)[0].byte_size);
    run(t.raw,"INSERT INTO activity_events(workspace_id,actor_membership_id,actor_user_id,client_id,service_engagement_id,subject_type,subject_id,event_type,metadata_json) VALUES('a','m-ellen','ellen','james','ads-service','file',?,'CONTENT_FILE_READY',?)",id,JSON.stringify({filename:'PRIVATE_ADS_FILE'}));
  }
  run(t.raw,"INSERT INTO activity_events(workspace_id,actor_membership_id,actor_user_id,client_id,service_engagement_id,subject_type,subject_id,event_type,metadata_json) VALUES('a','m-ellen','ellen','james','ads-service','content',?,'CONTENT_CREATED',?)",t.ads,JSON.stringify({contentTitle:'PRIVATE_ADS_CONTENT'}));
  return t;
}
const snapshot=t=>['content_items','content_platforms','assets','content_asset_links','content_review_revisions','content_approval_rounds','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table} ORDER BY rowid`));
async function assertProjections(t,actor) {
  const output=[await listContent(t.db,actor),await contentCalendar(t.db,actor,{start:'2026-09-01',end:'2026-09-30'}),await recordingRequests(t.db,actor),await approvalRequests(t.db,actor),await portalContent(t.db,actor),await contentApprovalHistory(t.db,actor,t.review),await clientActivity(t.db,actor.workspaceId,'james',{actor}),await contentFileActivityRows(t.db,actor)];
  assert.doesNotMatch(JSON.stringify(output),/PRIVATE_AD|private-ads/);
  for(const id of [t.ads,t.review,t.restricted]) {assert.equal(await getContent(t.db,actor,id),null);assert.equal(await getPortalContent(t.db,actor,id),null);}
  for(const id of ['private-ads-file','private-ads-restricted-file'])assert.equal(await t.download(id,actor),null);
  if(actor.role!=='client') {
    const filtered=await listContent(t.db,actor,{platform:'private-ads-platform'});assert.deepEqual(filtered.items||[],[]);assert.equal(filtered.hasMore||false,false);
    assert.deepEqual((await listContent(t.db,actor,{serviceEngagementId:'ads-service'})).items||[],[]);
  }
}
for(const reclassified of [false,true])test(`all roles hide Ads Content, media, history and aggregates; department reclassified=${reclassified}`,async()=>{
  const t=await fixture();
  if(reclassified)t.sql("UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  const before=snapshot(t);for(const actor of Object.values(t.actors))await assertProjections(t,actor);assert.deepEqual(snapshot(t),before);
});
for(const kind of ['membership','contact','assignment','restricted'])test(`old loaded actors retain Social revocation and Ads exclusion: ${kind}`,async()=>{
  const t=await fixture();t.sql("UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  const who=kind==='contact'?'james':kind==='restricted'?'pm':'sam',actor=t.actors[who];
  t.sql({membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",assignment:"DELETE FROM client_assignments WHERE membership_id='m-sam'",restricted:"DELETE FROM client_assignments WHERE membership_id='m-pm'"}[kind]);
  if(kind==='restricted')t.sql("UPDATE content_items SET visibility='restricted' WHERE production_area='social'");
  await assertProjections(t,actor);
  assert.equal(kind==='contact'?await getPortalContent(t.db,actor,t.contentId):await getContent(t.db,actor,t.contentId),null);
});
test('Ads fixtures cannot activate Content portal navigation or overflow Social lists',async()=>{
  const t=await fixture();t.sql("UPDATE content_items SET visibility='internal' WHERE production_area='social'");
  t.sql("UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  assert.equal(await hasPortalContent(t.db,t.actors.james),false);
  t.sql("UPDATE service_types SET department_id='ads' WHERE id='type-ads'");
  for(let i=0;i<205;i++)await insertAds(t.sql);
  t.sql("UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  const list=await listContent(t.db,t.owner);assert.equal(list.items.length,1);assert.equal(list.hasMore,false);
  const options=await contentOptions(t.db,t.owner);assert.doesNotMatch(JSON.stringify(options),/PRIVATE_AD|private-ads/);
});
const routes=[
 ['content/[contentId]','GET'],['content/[contentId]','PATCH'],['content/[contentId]/transition','POST'],['content/[contentId]/platforms','PUT'],
 ['content/[contentId]/files','GET'],['content/[contentId]/files','POST'],['content/[contentId]/files/[fileId]','PATCH'],['content/[contentId]/files/[fileId]/retry','POST'],['files/[fileId]/download','GET'],
 ['content/[contentId]/approvals','POST'],['approvals/[roundId]/withdraw','POST'],
 ['portal/content/[contentId]','GET'],['portal/recordings/[contentId]/files','GET'],['portal/recordings/[contentId]/files','POST'],['portal/recordings/[contentId]/files/[fileId]/retry','POST'],['portal/approvals/[roundId]','GET'],['portal/approvals/[roundId]','POST'],
];
for(const reclassified of [false,true])test(`issued HTTP sessions deny guessed Ads IDs and byte downloads for every role; reclassified=${reclassified}`,async()=>{
  const t=await fixture(true);if(reclassified)t.sql("UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  const before=snapshot(t);
  for(const user of roles) {
    const {cookie}=await t.signIn(`${user}@example.com`);
    globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
    for(const [path,method] of routes) {
      const route=await import(`../app/api/bloomops/${path}/route.js`);
      assert.equal(typeof route[method],'function',`${path} ${method}`);
      const response=await route[method](new Request(`${APP_URL}/api/bloomops/${path}`,{method,headers:{cookie,origin:APP_URL,'content-type':'application/json'},...method==='GET'?{}:{body:'{}'}}),{params:Promise.resolve({contentId:t.ads,fileId:'private-ads-file',roundId:`round-${t.review}`})});
      assert.equal(response.status,404,`${user} ${method} ${path}`);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await response.text(),/PRIVATE_AD|private-ads|SQL|stack/);
    }
    for(const path of ['content','content/calendar?start=2026-09-01&end=2026-09-30','portal/content']) {
      const route=await import(`../app/api/bloomops/${path.split('?')[0]}/route.js`);
      const response=await route.GET(new Request(`${APP_URL}/api/bloomops/${path}`,{headers:{cookie}}));
      assert.ok([200,403].includes(response.status));assert.doesNotMatch(await response.text(),/PRIVATE_AD|private-ads/);
    }
  }
  assert.deepEqual(snapshot(t),before);
});
test('Social HTTP creation rejects new routing fields and preserves response allowlists',async()=>{
  const t=await fixture(true),{cookie}=await t.signIn('ellen@example.com');globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
  const route=await import('../app/api/bloomops/clients/[id]/content/route.js');
  const create=body=>route.POST(new Request(`${APP_URL}/api/bloomops/clients/james/content`,{method:'POST',headers:{cookie,origin:APP_URL,'content-type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),title:'Social',type:'ad_creative',...body})}),{params:Promise.resolve({id:'james'})});
  for(const body of [{productionArea:'ads'},{adsProjectId:'ads-project'},{production_area:'social'},{ads_project_id:null}])assert.equal((await create(body)).status,400);
  const response=await create({});assert.equal(response.status,201);const {contentId}=await response.json();const dto=await getContent(t.db,t.owner,contentId);assert.equal(dto.type,'ad_creative');assert.ok(!('productionArea' in dto)&&!('adsProjectId' in dto));
});
test('Ads request collision arriving after the Social retry read is a safe atomic conflict',async()=>{
  const t=await fixture(),requestId=crypto.randomUUID();
  const history=all(t.raw,'SELECT * FROM activity_events'),before=all(t.raw,'SELECT id FROM content_items');
  t.beforeBatch(()=>insertAds(t.sql,{id:'late-private-ads',creation_request_id:requestId}));
  const result=await t.add({title:'Social concurrent request'},{requestId});
  assert.deepEqual(result,{ok:false,reason:'conflict'});
  assert.equal(all(t.raw,'SELECT id FROM content_items').length,before.length+1);
  assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),history);
});
