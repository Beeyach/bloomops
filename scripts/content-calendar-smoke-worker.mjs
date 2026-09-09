// Disposable C3 acceptance inside actual workerd/D1; never bundled into the app.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent, updateContent, getContent, listContent, contentOptions } from '../lib/bloomops/content.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { contentCalendar } from '../lib/bloomops/content-calendar.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { contentNextStages,contentNeedsContext } from '../lib/bloomops/content-pipeline-values.mjs';
export default {async fetch(request,env){
 if(env.C3_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
 const messages=[],check=(name,ok)=>{assert.ok(ok,name);messages.push(name);};
 try{
 const run=(q,...v)=>env.DB.prepare(q).bind(...v).run(),one=(q,...v)=>env.DB.prepare(q).bind(...v).first(),all=async(q,...v)=>(await env.DB.prepare(q).bind(...v).all()).results;
 for(const q of C3_MIGRATIONS)await run(q);const db=drizzle(env.DB,{schema});
 check('C3 has 24 canonical Content columns',(await all('PRAGMA table_info(content_items)')).length===24);
 for(const ws of['a','b'])await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
 for(const[id,role,ws]of[['ellen','owner','a'],['ary','admin','a'],['pm','project_manager','a'],['sam','team_member','a'],['james','client','a'],['foreign','owner','b']]){await run('INSERT INTO user(id,name,email) VALUES(?,?,?)',id,id,`${id}@example.com`);await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);}
 for(const[id,ws]of[['james','a'],['lawrence','a'],['foreign','b']])await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',id,ws,id,id);
 for(const d of['social','systems']){await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES(?,'a',?,?)",d,d,d);await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(?,'a',?,?,?)",d,d,`custom-${d}`,d);}
 for(const[id,cl,type]of[['social','james','social'],['ghl','james','systems'],['sibling','lawrence','social']])await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a',?,?)",id,cl,type);
 const actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
 const owner=await actor('ellen');let pm=await actor('pm'),team=await actor('sam');
 const add=(input={},extra={})=>createContent(db,{actor:owner,clientId:'james',requestId:crypto.randomUUID(),input:{title:'Idea',type:'reel',...input},...extra});
 const get=(id,who=owner)=>getContent(db,who,id),edit=async(id,input,extra={})=>updateContent(db,{actor:owner,contentId:id,input,expectedRevision:(await get(id))?.revision||1,...extra});
 const count=async type=>(await one("SELECT count(*) n FROM activity_events WHERE subject_type='content' AND event_type=?",type)).n;
 const snapshot=async()=>JSON.stringify(await Promise.all(['content_items','content_platforms','activity_events'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
 const parents=JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','onboarding_instances'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));

 const set=(id,platforms,extra={})=>setContentPlatforms(db,{actor:owner,contentId:id,input:{platforms,expectedRevision:1},...extra});
 const calendar=(who=owner,query={})=>contentCalendar(db,who,{start:'2026-09-01',end:'2026-09-30',...query});
 for(const n of [0,1,12]){const platforms=Array.from({length:n},(_,i)=>`Channel ${i}`),requestId=crypto.randomUUID(),input={platforms,targetPublishDate:'2026-09-08'},id=(await add(input,{requestId})).contentId;check(`create ${n} associations atomically`,(await get(id)).platforms.length===n);await set(id,['Later']);check(`create ${n} response-loss retry survives later set`,(await add(input,{requestId})).unchanged);}
 for(const labels of [['a','A'],[''],['\u202e'],['\ud800'],Array(13).fill('a')])check('invalid or duplicate platform set denied',(await add({platforms:labels})).reason==='invalid');
 const unicode=(await add({platforms:['\u{10000}','\ue000','İ'.repeat(60)]})).contentId;check('Unicode order and expanded case key round-trip without semantic changes',(await set(unicode,['\u{10000}','\ue000','İ'.repeat(60)])).unchanged&&(await listContent(db,owner,{platform:'İ'.repeat(60)})).items.length===1);
 for(const kind of ['identical','different','remove','edit','transition']){
  const id=(await add({platforms:['Initial']})).contentId,before=await count('CONTENT_PLATFORMS_CHANGED'),history=(await all("SELECT * FROM activity_events WHERE subject_id=?",id)).length;
  const first=()=>set(id,['One']),other=kind==='identical'?first:kind==='edit'?()=>edit(id,{caption:'Competing'},{expectedRevision:1}):kind==='transition'?()=>transitionContent(db,{actor:owner,contentId:id,input:{targetStage:'script',expectedRevision:1}}):()=>set(id,kind==='remove'?[]:['Two']);const results=await Promise.all([first(),other()]);
  check(`${kind} actual D1 race leaves one canonical revision and semantic event`,results.filter(r=>r.ok).length===(kind==='identical'?2:1)&&(await get(id)).revision===2&&(await all("SELECT * FROM activity_events WHERE subject_id=?",id)).length===history+1);
  if(results[0].ok){await edit(id,{caption:'Later'});const snap=await snapshot();check(`${kind} old consumed revision retry does not restore old set`,(await first()).unchanged&&await snapshot()===snap);}
 }
 for(const fault of ['activity','delete','insert','fact']){const id=(await add({platforms:['Initial']})).contentId,before=await snapshot();await run(`CREATE TRIGGER fail_c3 BEFORE ${{activity:'INSERT ON activity_events',delete:'DELETE ON content_platforms',insert:'INSERT ON content_platforms',fact:'UPDATE ON content_items'}[fault]} BEGIN SELECT RAISE(ABORT,'injected'); END`);let failed=false;try{await set(id,['New']);}catch{failed=true;}await run('DROP TRIGGER fail_c3');check(`${fault} failure rolls back actual D1 associations and history`,failed&&await snapshot()===before);}
 const restricted=(await add({visibility:'restricted',targetPublishDate:'2026-09-08'},{serviceEngagementId:'social'})).contentId,clientLevel=(await add()).contentId;
 for(const who of [team,pm,await actor('james'),await actor('foreign')])check(`${who.role} cannot mutate inaccessible platforms`,(await set(restricted,['Channel'],{actor:who,input:null})).reason==='not_found');
 await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social','m-sam')");team=await actor('sam');check('exact Service grants restricted platform edit',(await set(restricted,['Channel'],{actor:team})).ok);check('Service does not grant Client-level Content',(await set(clientLevel,['Channel'],{actor:team})).reason==='not_found');check('calendar honors exact Service assignment',(await calendar(team)).items.map(i=>i.id).join()===restricted);
 const batch=db.batch.bind(db);
 for(const [kind,query,undo]of [
 ['assignment',"DELETE FROM service_assignments WHERE membership_id='m-sam'","INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social','m-sam')"],
 ['membership',"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'","UPDATE workspace_memberships SET status='active' WHERE id='m-sam'"],
 ['role',"UPDATE workspace_memberships SET role='admin' WHERE id='m-sam'","UPDATE workspace_memberships SET role='team_member' WHERE id='m-sam'"],
 ['workspace',"UPDATE workspaces SET status='suspended' WHERE id='a'","UPDATE workspaces SET status='active' WHERE id='a'"],
 ['Social parent',"UPDATE service_types SET department_id='systems' WHERE id='social'","UPDATE service_types SET department_id='social' WHERE id='social'"]]){
 const id=(await add({},{serviceEngagementId:'social'})).contentId,before=await snapshot();let once=true;db.batch=async writes=>{if(once){once=false;await run(query);}return batch(writes);};check(`live ${kind} revocation fences platform commit`,!(await set(id,['Blocked'],{actor:team})).ok&&await snapshot()===before);db.batch=batch;check(`live ${kind} revocation removes calendar rows`,(await calendar(team)).items.length===0);await run(undo);
 }
 const hidden=(await add()).contentId;let once=true;db.batch=async writes=>{if(once){once=false;await run("UPDATE content_items SET visibility='restricted' WHERE id=?",hidden);}return batch(writes);};check('restriction during commit fences PM',!(await set(hidden,['Blocked'],{actor:pm})).ok&&(await get(hidden)).revision===1&&(await get(hidden)).platforms.length===0);db.batch=batch;
 const dated=(await add({targetPublishDate:'2026-09-01',platforms:['Published channel','Other'],internalReviewRequired:false,clientApprovalRequired:false})).contentId;
 for(const stage of ['script','editing','approved','scheduled','published'])assert.ok((await transitionContent(db,{actor:owner,contentId:dated,input:{targetStage:stage,expectedRevision:(await get(dated)).revision},now:new Date('2026-10-01T00:00:00Z')})).ok);
 const beforeRead=await snapshot(),published=await calendar(owner,{platform:'PUBLISHED CHANNEL'});check('Published display reads target date and actual C2 timestamp',published.items.length===1&&published.items[0].targetPublishDate==='2026-09-01'&&published.items[0].publishedAt==='2026-10-01T00:00:00.000Z');check('calendar/list reads write nothing',await snapshot()===beforeRead);
 for(const query of [{start:'2026-02-30'},{start:'2026-01-01',end:'2026-12-31'},{start:['2026-09-01']},{forged:'1'}])check('exact range rejects invalid input',(await calendar(owner,query)).reason==='invalid');
 check('Client internal calendar denied',(await calendar(await actor('james'))).reason==='forbidden');
 for(let i=0;i<240;i++){await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`many-${i}`,`Client ${i}`,`many-${i}`);await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);}
 check('240 assignments remain inside actual D1 statement limits',(await calendar(team)).items.length===1);
 for(let i=0;i<205;i++){const id=`dense-${String(i).padStart(3,'0')}`;await run("INSERT INTO content_items(id,workspace_id,client_id,creation_request_id,title,type,target_publish_date) VALUES(?,'a','james',?,'Dense','reel','2026-09-08')",id,crypto.randomUUID());for(const key of ['dense','other'])await run("INSERT INTO content_platforms VALUES('a',?,?,?)",id,key,key);}
 const first=await calendar(owner,{platform:'dense'}),second=await calendar(owner,{platform:'dense',page:'2'});check('205 same-day multichannel items have deterministic nonduplicating 200+1 pages',first.items.length===200&&first.hasMore&&second.items.length===5&&!second.hasMore&&new Set([...first.items,...second.items].map(i=>i.id)).size===205&&first.items[0].id==='dense-000'&&second.items[4].id==='dense-204');
 check('hidden dense records do not alter Team overflow',(await calendar(team,{platform:'dense'})).items.length===0&&!(await calendar(team,{platform:'dense'})).hasMore);
 check('all C3 operations preserve existing parent lifecycle facts',parents===JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','onboarding_instances'].map(table=>all(`SELECT * FROM ${table} ${table==='bloomops_clients'?"WHERE id NOT LIKE 'many-%'":''} ORDER BY rowid`)))));
 check('foreign keys clean',(await all('PRAGMA foreign_key_check')).length===0);
 return Response.json({checks:messages.length,messages});
 }catch(error){return Response.json({error:error.message,messages},{status:500});}
}};
