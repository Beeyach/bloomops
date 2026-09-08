// Disposable C1 acceptance inside actual workerd/D1; never bundled into the app.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent, updateContent, getContent, listContent, contentOptions } from '../lib/bloomops/content.mjs';
import { CONTENT_TYPES } from '../lib/bloomops/content-values.mjs';
export default {async fetch(request,env){
 if(env.C1_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
 const messages=[],check=(name,ok)=>{assert.ok(ok,name);messages.push(name);};
 try{
 const run=(q,...v)=>env.DB.prepare(q).bind(...v).run(),one=(q,...v)=>env.DB.prepare(q).bind(...v).first(),all=async(q,...v)=>(await env.DB.prepare(q).bind(...v).all()).results;
 for(const q of C1_MIGRATIONS)await run(q);const db=drizzle(env.DB,{schema});
 check('fourteen migrations create canonical Content',(await all('PRAGMA table_info(content_items)')).length===23);
 for(const ws of['a','b'])await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
 for(const[id,role,ws]of[['ellen','owner','a'],['ary','admin','a'],['pm','project_manager','a'],['sam','team_member','a'],['james','client','a'],['foreign','owner','b']]){await run('INSERT INTO user(id,name,email) VALUES(?,?,?)',id,id,`${id}@example.com`);await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);}
 for(const[id,ws]of[['james','a'],['lawrence','a'],['foreign','b']])await run('INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',id,ws,id,id);
 for(const d of['social','systems']){await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES(?,'a',?,?)",d,d,d);await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(?,'a',?,?,?)",d,d,`custom-${d}`,d);}
 for(const[id,cl,type]of[['social','james','social'],['ghl','james','systems'],['sibling','lawrence','social']])await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(?,'a',?,?)",id,cl,type);
 const actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
 const owner=await actor('ellen'),pm=await actor('pm'),team=await actor('sam');
 const add=(input={},extra={})=>createContent(db,{actor:owner,clientId:'james',requestId:crypto.randomUUID(),input:{title:'Idea',type:'reel',...input},...extra});
 const get=(id,who=owner)=>getContent(db,who,id),edit=async(id,input,extra={})=>updateContent(db,{actor:owner,contentId:id,input,expectedRevision:(await get(id))?.revision||1,...extra});
 const count=async type=>(await one("SELECT count(*) n FROM activity_events WHERE subject_type='content' AND event_type=?",type)).n;
 const snapshot=async()=>JSON.stringify(await Promise.all(['content_items','activity_events'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
 const parents=JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','onboarding_instances'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
 for(const type of CONTENT_TYPES){const r=await add({type});check(`type ${type} creates Idea with no published timestamp`,r.ok&&(await get(r.contentId)).stage==='idea'&&(await get(r.contentId)).publishedAt===null);}
 const bound=await add({visibility:'restricted'},{serviceEngagementId:'social'});check('Social is resolved through canonical Department despite custom Service Type slug',bound.ok);
 for(const serviceEngagementId of['ghl','sibling','missing'])check(`${serviceEngagementId} binding denied`,(await add({},{serviceEngagementId})).reason==='not_found');
 check('Client role has no internal Content even when client eligible',!(await add({visibility:'client'},{actor:await actor('james')})).ok);
 check('foreign workspace cannot read guessed Content',await get(bound.contentId,await actor('foreign'))===null);
 check('PM broad scope does not grant restricted',await get(bound.contentId,pm)===null);
 check('Admin can read restricted',(await get(bound.contentId,await actor('ary')))?.id===bound.contentId);
 await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social','m-sam')");const assigned=await actor('sam');
 check('Team current exact Service reads restricted',!!await get(bound.contentId,assigned));
 check('Team creates and edits exact Social Content',(await add({},{actor:assigned,serviceEngagementId:'social'})).ok&&(await edit(bound.contentId,{caption:'Team work'},{actor:assigned})).ok);
 check('Service assignment does not widen to Client-level',(await add({},{actor:assigned})).reason==='not_found');
 await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-pm')");check('PM explicit Client assignment reaches restricted',!!await get(bound.contentId,pm));
 const key=crypto.randomUUID(),initial={title:'Retry',type:'reel'},beforeCount=await count('CONTENT_CREATED');
 const concurrent=await Promise.all([add(initial,{requestId:key}),add(initial,{requestId:key})]);check('concurrent identical creates converge one fact/event',concurrent.every(r=>r.ok)&&new Set(concurrent.map(r=>r.contentId)).size===1&&await count('CONTENT_CREATED')===beforeCount+1);
 const id=concurrent[0].contentId;await edit(id,{title:'Later'});check('immutable initial snapshot retries after edits without reverting',(await add(initial,{requestId:key})).contentId===id&&(await get(id)).title==='Later');
 check('incompatible key reuse conflicts',(await add({title:'Different'},{requestId:key})).reason==='conflict');
 check('same key cannot retarget Service',(await add(initial,{requestId:key,serviceEngagementId:'social'})).reason==='conflict');
 const rev=(await get(id)).revision,beforeEdits=await count('CONTENT_DETAILS_UPDATED'),race=await Promise.all(['A','B'].map(title=>edit(id,{title},{expectedRevision:rev})));
 check('edit/edit CAS has one fact and semantic event winner',race.filter(r=>r.ok).length===1&&race.filter(r=>r.reason==='conflict').length===1&&await count('CONTENT_DETAILS_UPDATED')===beforeEdits+1);
 for(const field of['stage','publishedAt','workspaceId','clientId','serviceEngagementId','platforms'])check(`caller cannot set ${field}`,(await edit(id,{[field]:'forged'})).reason==='invalid');
 for(const op of['create','edit'])for(const fault of['activity','fact']){
  const before=await snapshot();await run(`CREATE TRIGGER fail_c1 BEFORE ${fault==='activity'?'INSERT ON activity_events':op==='create'?'INSERT ON content_items':'UPDATE ON content_items'} BEGIN SELECT RAISE(ABORT,'injected'); END`);
  let failed=false;try{if(op==='create')await add();else await edit(id,{title:'Rollback'});}catch{failed=true;}await run('DROP TRIGGER fail_c1');check(`${op} ${fault} failure rolls back complete batch`,failed&&await snapshot()===before);
 }
 const before=await snapshot(),batch=db.batch.bind(db);let once=true;db.batch=async writes=>{if(once){once=false;await run("DELETE FROM service_assignments WHERE membership_id='m-sam'");}return batch(writes);};
 check('revoked scope fences stale actor inside committing batch',!(await edit(bound.contentId,{caption:'Revoked'},{actor:assigned})).ok&&await snapshot()===before);db.batch=batch;
 check('revoked actor cannot read or enumerate parent choices',await get(bound.contentId,assigned)===null&&(await contentOptions(db,assigned)).parents.length===0);
 await run("UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'");check('suspended actor cannot create',!(await add({},{actor:assigned,serviceEngagementId:'social'})).ok);
 await run("UPDATE workspace_memberships SET status='active' WHERE id='m-sam'");
 for(let i=0;i<240;i++){await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`many-${i}`,`Client ${i}`,`many-${i}`);await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-sam')",`many-${i}`);await run("INSERT INTO content_items(workspace_id,client_id,creation_request_id,title,type) VALUES('a',?,?,'Bounded','reel')",`many-${i}`,crypto.randomUUID());}
 const large=await actor('sam'),first=await listContent(db,large),second=await listContent(db,large,{page:'2'});check('240 assignments and facts stay within actual D1 limits with truthful pagination',first.items.length===200&&first.hasMore&&second.items.length===40&&!second.hasMore&&new Set([...first.items,...second.items].map(i=>i.id)).size===240);
 check('hidden rows cannot create false overflow',(await listContent(db,large,{clientId:'james'})).hasMore===false);
 check('foreign key check clean',(await all('PRAGMA foreign_key_check')).length===0);
 // Large fixture adds Clients intentionally; compare all pre-existing parent rows.
 const afterParents=JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','onboarding_instances'].map(table=>all(`SELECT * FROM ${table}${table==='bloomops_clients'?" WHERE id NOT LIKE 'many-%'":''} ORDER BY rowid`))));check('Content never mutates parent lifecycles',parents===afterParents);
 return Response.json({checks:messages.length,messages});
 }catch(error){return Response.json({error:error.message,messages},{status:500});}
}};
