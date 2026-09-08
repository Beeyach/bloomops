// Disposable C2 acceptance inside actual workerd/D1; never bundled into the app.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent, updateContent, getContent, listContent, contentOptions } from '../lib/bloomops/content.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { contentNextStages,contentNeedsContext } from '../lib/bloomops/content-pipeline-values.mjs';
export default {async fetch(request,env){
 if(env.C2_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
 const messages=[],check=(name,ok)=>{assert.ok(ok,name);messages.push(name);};
 try{
 const run=(q,...v)=>env.DB.prepare(q).bind(...v).run(),one=(q,...v)=>env.DB.prepare(q).bind(...v).first(),all=async(q,...v)=>(await env.DB.prepare(q).bind(...v).all()).results;
 for(const q of C2_MIGRATIONS)await run(q);const db=drizzle(env.DB,{schema});
 check('C2 has 24 canonical Content columns',(await all('PRAGMA table_info(content_items)')).length===24);
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
 const snapshot=async()=>JSON.stringify(await Promise.all(['content_items','activity_events'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
 const parents=JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','onboarding_instances'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));

 const move=async(id,targetStage,extra={})=>transitionContent(db,{actor:owner,contentId:id,input:{targetStage,expectedRevision:(await get(id))?.revision||1,...(contentNeedsContext(targetStage)?{context:'James to provide the opening recording'}:{})},...extra});
 for(let mask=0;mask<8;mask++){
  const flags={recordingRequired:!!(mask&1),internalReviewRequired:!!(mask&2),clientApprovalRequired:!!(mask&4)},id=(await add(flags)).contentId;
  const path=['idea','script',...(mask&1?['waiting_for_recording']:[]),'editing',...(mask&2?['internal_review']:[]),...(mask&4?['client_review']:[]),'approved','scheduled','published'];
  for(let i=1;i<path.length;i++){assert.equal(contentNextStages(await get(id))[0],path[i]);assert.ok((await move(id,path[i])).ok);}
  check(`flags ${mask} exact path, skips and one event/revision per stage`,(await get(id)).revision===path.length&&(await all("SELECT * FROM activity_events WHERE subject_id=? AND event_type='CONTENT_STAGE_CHANGED'",id)).length===path.length-1);
  const before=await snapshot(),input={targetStage:'published',expectedRevision:path.length-1};check(`flags ${mask} Published timestamp terminal and response-loss retry stable`,!!(await get(id)).publishedAt&&(await move(id,'idea')).reason==='invalid'&&(await move(id,'published',{input,now:new Date('2030-01-01')})).unchanged&&await snapshot()===before);
 }
 for(const stage of ['internal_review','client_review']){
  const id=(await add()).contentId;await run('UPDATE content_items SET stage=? WHERE id=?',stage,id);
  for(const context of ['', 'x'.repeat(2001)])check(`${stage} rejects invalid revision context`,(await move(id,'revision_requested',{input:{targetStage:'revision_requested',expectedRevision:1,context}})).reason==='invalid');
  assert.ok((await move(id,'revision_requested')).ok);check(`${stage} durable revision then only Editing`,!!(await get(id)).stageContext&&contentNextStages(await get(id)).join()==='editing'&&(await move(id,'editing')).ok&&(await get(id)).stageContext===null);
 }
 for(const [stage,flag]of [['waiting_for_recording','recordingRequired'],['internal_review','internalReviewRequired'],['client_review','clientApprovalRequired']]){
  const id=(await add({recordingRequired:true})).contentId;await run('UPDATE content_items SET stage=? WHERE id=?',stage,id);await edit(id,{[flag]:false});check(`disabling current ${stage} preserves it and allows next`,(await get(id)).stage===stage&&(await move(id,contentNextStages(await get(id))[0])).ok);
 }
 const id=(await add()).contentId;
 check('recording-disabled cannot enter Waiting',(await move(id,'waiting_for_recording')).reason==='invalid');
 for(const who of [await actor('james'),await actor('foreign'),team])check(`${who.role} inaccessible transition denies before malformed input`,(await move(id,'script',{actor:who,input:null})).reason==='not_found');
 const restricted=(await add({visibility:'restricted'},{serviceEngagementId:'social'})).contentId;
 check('restricted PM denies without exact assignment',(await move(restricted,'script',{actor:pm})).reason==='not_found');
 await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social','m-sam')");
 team=await actor('sam');
 check('exact Service Team transitions restricted',(await move(restricted,'script',{actor:team})).ok);
 check('Service assignment never grants Client-level',(await move(id,'script',{actor:team})).reason==='not_found');
 await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-pm')");
 pm=await actor('pm');
 check('explicit Client assignment grants PM restricted transition',(await move(restricted,'editing',{actor:pm})).ok);
 for(const kind of ['identical','different','edit']){
  const id=(await add()).contentId;await run("UPDATE content_items SET stage='internal_review' WHERE id=?",id);const input={targetStage:'client_review',expectedRevision:1},before=await count('CONTENT_STAGE_CHANGED'),edits=await count('CONTENT_DETAILS_UPDATED');
  const results=await Promise.all([move(id,'client_review',{input}),kind==='identical'?move(id,'client_review',{input}):kind==='edit'?edit(id,{caption:'Competing'},{expectedRevision:1}):move(id,'revision_requested',{input:{targetStage:'revision_requested',expectedRevision:1,context:'Fix intro'}})]);
  check(`${kind} race has one canonical fact/revision/event winner`,results.filter(r=>r.ok).length===(kind==='identical'?2:1)&&(await get(id)).revision===2&&await count('CONTENT_STAGE_CHANGED')-before+await count('CONTENT_DETAILS_UPDATED')-edits===1);
 }
 const retryId=(await add()).contentId,input={targetStage:'script',expectedRevision:1};await move(retryId,'script',{input});await edit(retryId,{caption:'Later'});const beforeRetry=await snapshot();
 check('historical retry after detail edit is unchanged',(await move(retryId,'script',{input})).unchanged&&await snapshot()===beforeRetry);
 check('incompatible reuse of consumed revision conflicts',(await move(retryId,'editing',{input:{...input,targetStage:'editing'}})).reason==='conflict');
 for(const fault of ['activity','fact']){
  const id=(await add()).contentId,before=await snapshot();await run(`CREATE TRIGGER fail_c2 BEFORE ${fault==='activity'?'INSERT ON activity_events':'UPDATE ON content_items'} BEGIN SELECT RAISE(ABORT,'injected'); END`);let failed=false;try{await move(id,'script');}catch{failed=true;}await run('DROP TRIGGER fail_c2');check(`${fault} failure rolls back stage and history`,failed&&await snapshot()===before);
 }
 const batch=db.batch.bind(db);
 for(const [kind,query,undo,who]of [
  ['assignment',"DELETE FROM service_assignments WHERE membership_id='m-sam'","INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social','m-sam')",team],
  ['membership',"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'","UPDATE workspace_memberships SET status='active' WHERE id='m-sam'",team],
  ['role',"UPDATE workspace_memberships SET role='admin' WHERE id='m-sam'","UPDATE workspace_memberships SET role='team_member' WHERE id='m-sam'",team],
  ['workspace',"UPDATE workspaces SET status='suspended' WHERE id='a'","UPDATE workspaces SET status='active' WHERE id='a'",team],
  ['Social parent',"UPDATE service_types SET department_id='systems' WHERE id='social'","UPDATE service_types SET department_id='social' WHERE id='social'",team]]){
  const id=(await add({},{serviceEngagementId:'social'})).contentId,before=await snapshot();let once=true;db.batch=async writes=>{if(once){once=false;await run(query);}return batch(writes);};check(`live ${kind} revocation fences committing transition`,!(await move(id,'script',{actor:who})).ok&&await snapshot()===before);db.batch=batch;await run(undo);
 }
 await run("DELETE FROM client_assignments WHERE membership_id='m-pm'");const visibilityId=(await add()).contentId,events=await count('CONTENT_STAGE_CHANGED');let once=true;db.batch=async writes=>{if(once){once=false;await run("UPDATE content_items SET visibility='restricted' WHERE id=?",visibilityId);}return batch(writes);};check('live restriction fences broad PM',!(await move(visibilityId,'script',{actor:pm})).ok&&(await get(visibilityId)).stage==='idea'&&await count('CONTENT_STAGE_CHANGED')===events);db.batch=batch;
 for(const field of ['stage','stageContext','publishedAt'])check(`ordinary edit rejects ${field}`,(await edit(id,{[field]:'forged'})).reason==='invalid');
 const afterParents=JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','onboarding_instances'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));check('all transitions preserve existing parent lifecycle facts',parents===afterParents);
 for(let i=0;i<240;i++){await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`many-${i}`,`Client ${i}`,`many-${i}`);await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);}
 check('240 assignments stay inside actual D1 transition and retry limits',(await move(restricted,'internal_review',{actor:team})).ok&&(await move(restricted,'internal_review',{actor:team,input:{targetStage:'internal_review',expectedRevision:3}})).unchanged);
 const filtered=await listContent(db,owner,{stage:'published'});check('stage filter selects canonical published facts',filtered.items.length===8&&filtered.items.every(i=>i.stage==='published'));
 check('foreign keys clean',(await all('PRAGMA foreign_key_check')).length===0);
 return Response.json({checks:messages.length,messages});
 }catch(error){return Response.json({error:error.message,messages},{status:500});}
}};
