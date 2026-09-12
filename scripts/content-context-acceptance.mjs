// Runs identically against Node SQLite and actual disposable workerd/D1.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent,getContent,updateContent } from '../lib/bloomops/content.mjs';
import { respondContentApproval } from '../lib/bloomops/content-approvals.mjs';
import { contentContextTables,seedLegacyContent,seedAdsParents,insertAds } from './content-context-fixture.mjs';

export async function contentContextAcceptance(binding,migrations,check) {
  const run=(q,...p)=>binding.prepare(q).bind(...p).run(),all=async(q,...p)=>(await binding.prepare(q).bind(...p).all()).results;
  const beforeMigrations=migrations.slice(0,-1),upgrade=migrations.at(-1);
  for (const statements of beforeMigrations) for (const q of statements) await run(q);
  await seedLegacyContent(run);
  const snapshot=async()=>Promise.all(contentContextTables.map(t=>all(`SELECT * FROM ${t} ORDER BY rowid`)));
  const before=await snapshot(),triggers=await all("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name"),indexes=await all("SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name");
  for (const q of upgrade) await run(q);
  const after=await snapshot();
  assert.deepEqual(after[0].map(({production_area,ads_project_id,...row})=>{assert.equal(production_area,'social');assert.equal(ads_project_id,null);return row;}),before[0].map(row=>({...row})));
  assert.deepEqual(after.slice(1),before.slice(1));check('populated legacy Content, platforms, Files, open/terminal approvals and events survive unchanged',true);
  const currentTriggers=await all("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name");
  for (const old of triggers) assert.ok(currentTriggers.some(t=>t.name===old.name&&(old.name==='content_items_social_service'||t.sql===old.sql)),old.name);
  const currentIndexes=await all("SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name");
  for (const old of indexes) assert.ok(currentIndexes.some(i=>i.name===old.name&&i.sql===old.sql),old.name);
  check('every previous trigger name and index survives; unrelated trigger definitions are unchanged',true);
  const refused=async(name,fn)=>{await assert.rejects(fn);check(name,true);};
  await refused('open review still freezes Content',()=>run("UPDATE content_items SET title='Changed' WHERE id='open'"));
  await refused('open review still freezes platforms',()=>run("DELETE FROM content_platforms WHERE content_id='open'"));
  await refused('immutable approval evidence survives',()=>run("DELETE FROM content_review_revisions WHERE content_id='terminal'"));
  // Same explicit every-column SELECT shape as E1, with only its original columns.
  const oldColumns=Object.keys(before[0][0]),oldValues={...before[0][0],id:'old-app-after-upgrade',creation_request_id:crypto.randomUUID()};
  await run(`INSERT INTO content_items(${oldColumns.join(',')}) SELECT ${oldColumns.map(()=>'?').join(',')} FROM bloomops_clients WHERE id='james'`,...oldColumns.map(k=>oldValues[k]));
  check('E1 explicit Social insert shape remains valid after migration',(await all("SELECT production_area,ads_project_id FROM content_items WHERE id='old-app-after-upgrade'"))[0].production_area==='social');
  const oldCollision={...oldValues,id:'old-app-duplicate',created_at:'2026-09-11T12:00:00Z'};
  await run(`INSERT INTO content_items(${oldColumns.join(',')}) SELECT ${oldColumns.map(()=>'?').join(',')} FROM bloomops_clients WHERE id='james' ON CONFLICT(workspace_id,client_id,creation_request_id) DO NOTHING`,...oldColumns.map(k=>oldCollision[k]));
  check('E1 Social concurrent request collision still does nothing',(await all("SELECT id FROM content_items WHERE creation_request_id=?",oldValues.creation_request_id)).map(r=>r.id).join()==='old-app-after-upgrade');
  const db=drizzle(binding,{schema}),actor=async id=>{const m=(await all('SELECT * FROM workspace_memberships WHERE user_id=?',id))[0];return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
  const owner=await actor('ellen'),client=await actor('james');
  const legacy=(await all("SELECT creation_request_id FROM content_items WHERE id='idea'"))[0];
  const legacyRetry=await createContent(db,{actor:owner,clientId:'james',requestId:legacy.creation_request_id,input:{title:'Legacy idea',type:'ad_creative',script:'Legacy script',recordingRequired:true,visibility:'client',targetPublishDate:'2026-09-22',platforms:['Instagram']}});
  check('pre-upgrade immutable Social creation receipt retries without rewriting history',legacyRetry.ok&&legacyRetry.unchanged&&legacyRetry.contentId==='idea'&&(await getContent(db,owner,'idea')).revision===2);
  check('open legacy Social approval resolves after upgrade',(await respondContentApproval(db,{actor:client,roundId:'round-open',input:{decision:'approved'}})).ok&&(await getContent(db,owner,'open')).stage==='approved');
  const requestId=crypto.randomUUID(),args={actor:owner,clientId:'james',requestId,input:{title:'New Social',type:'ad_creative'}};
  const created=await createContent(db,args),facts=JSON.stringify(await snapshot());
  check('new application creates Social and retries legacy-shaped receipts',created.ok&&(await createContent(db,args)).unchanged&&JSON.stringify(await snapshot())===facts);
  check('new application edits Social',(await updateContent(db,{actor:owner,contentId:created.contentId,input:{title:'Edited'},expectedRevision:1})).ok);
  await seedAdsParents(run);
  for (const [name,extra] of [
    ['unknown area',{production_area:'unknown'}],['null area',{production_area:null}],['Social with Project',{production_area:'social',service_engagement_id:null}],['Ads without Project',{ads_project_id:null}],
    ['missing Project',{ads_project_id:'missing'}],['foreign Project',{ads_project_id:'foreign-ads-project'}],['wrong Client',{ads_project_id:'ads-other-client'}],['wrong Service',{ads_project_id:'ads-other-project'}],['service-less Project',{ads_project_id:'ads-no-service',service_engagement_id:null}],['Social Project',{ads_project_id:'social-project',service_engagement_id:'social-service'}],['Social under Ads',{production_area:'social',ads_project_id:null}],
  ]) await refused(`reject ${name}`,()=>insertAds(run,extra));
  const id=await insertAds(run);check('exact Ads Project tuple is accepted',!!id);
  for (const [name,q] of [
    ['production area',"UPDATE content_items SET production_area='social',ads_project_id=NULL WHERE id=?"],['Ads Project',"UPDATE content_items SET ads_project_id='ads-other-project' WHERE id=?"],['old Client identity',"UPDATE content_items SET client_id='lawrence' WHERE id=?"],
  ]) await refused(`immutable ${name}`,()=>run(q,id));
  for (const [name,q] of [
    ['Project Client',"UPDATE projects SET client_id='lawrence' WHERE id='ads-project'"],['Project Service',"UPDATE projects SET service_engagement_id='ads-other-service' WHERE id='ads-project'"],['Project workspace',"UPDATE projects SET workspace_id='b' WHERE id='ads-project'"],['Project deletion',"DELETE FROM projects WHERE id='ads-project'"],['Project ID',"UPDATE projects SET id='moved' WHERE id='ads-project'"],
  ]) await refused(`reject referenced ${name} change`,()=>run(q));
  await refused('REPLACE cannot reclassify Content',()=>run("INSERT OR REPLACE INTO content_items(id,workspace_id,client_id,creation_request_id,title,type) VALUES(?,'a','james',?,'Replacement','reel')",id,crypto.randomUUID()));
  const requestKey=(await all('SELECT creation_request_id FROM content_items WHERE id=?',id))[0].creation_request_id;
  await refused('REPLACE cannot cross context via the Client request key',()=>run("INSERT OR REPLACE INTO content_items(workspace_id,client_id,creation_request_id,title,type) VALUES('a','james',?,'Replacement','reel')",requestKey));
  const identityBefore=(await all('SELECT * FROM content_items WHERE id=?',id))[0];
  for(const changed of [{creation_request_id:crypto.randomUUID()},{created_at:'2026-09-11T12:00:00Z'},{id:'replacement-with-same-request'}]) {
    const row={...identityBefore,...changed};
    await refused(`same-context Ads REPLACE preserves ${Object.keys(changed)[0]}`,()=>run(`INSERT OR REPLACE INTO content_items(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row)));
    assert.deepEqual((await all('SELECT * FROM content_items WHERE id=?',id))[0],identityBefore);
  }
  await refused('REPLACE cannot reparent referenced Ads Project',()=>run("INSERT OR REPLACE INTO projects(id,workspace_id,client_id,service_engagement_id,name) VALUES('ads-project','a','james','ads-other-service','Replacement')"));
  await run("UPDATE projects SET name='Updated campaign',status='in_progress' WHERE id='ads-project'");
  await run("UPDATE projects SET service_engagement_id='ads-other-service' WHERE id='ads-no-service'");
  check('ordinary Project edits and unrelated parent changes remain allowed',true);
  await run("UPDATE service_types SET department_id='social' WHERE id='type-ads'");
  check('department reassignment never converts Ads into Social',(await all('SELECT production_area FROM content_items WHERE id=?',id))[0].production_area==='ads'&&await getContent(db,owner,id)===null);
  const collision=await createContent(db,{...args,requestId:(await all('SELECT creation_request_id FROM content_items WHERE id=?',id))[0].creation_request_id});
  check('unreadable Ads request collision is a conflict without identifier',!collision.ok&&!collision.contentId&&!JSON.stringify(collision).includes(id));
  check('foreign keys and integrity remain valid',(await all('PRAGMA foreign_key_check')).length===0&&(await all('PRAGMA quick_check'))[0].quick_check==='ok');
}
