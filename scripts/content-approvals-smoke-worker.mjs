// Disposable C5 acceptance in actual workerd/D1/R2; never an app entrypoint.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent,getContent,updateContent } from '../lib/bloomops/content.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { setContentPlatforms } from '../lib/bloomops/content-platforms.mjs';
import { contentCalendar } from '../lib/bloomops/content-calendar.mjs';
import { requestContentApproval,withdrawContentApproval,respondContentApproval,contentApprovalHistory,getPortalApproval,approvalRequests } from '../lib/bloomops/content-approvals.mjs';
import { uploadContentFile,downloadContentFile } from '../lib/bloomops/content-files.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { createAuth } from '../lib/bloomops/auth.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';

export default {async fetch(request,env){
  if(env.C5_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
  const messages=[],check=(name,ok)=>{assert.ok(ok,name);messages.push(name);};
  try {
    const run=(q,...args)=>env.DB.prepare(q).bind(...args).run(),one=(q,...args)=>env.DB.prepare(q).bind(...args).first(),all=async(q,...args)=>(await env.DB.prepare(q).bind(...args).all()).results;
    for(const statement of C5_MIGRATIONS)await run(statement);
    const db=drizzle(env.DB,{schema}),batch=db.batch.bind(db);
    for(const ws of ['a','b'])await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
    for(const [id,role,ws] of [['owner','owner','a'],['pm','project_manager','a'],['team','team_member','a'],['client','client','a'],['other','client','a'],['foreign','owner','b']]){
      await run('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,`${id}@example.com`);
      await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);
    }
    for(const id of ['james','other'])await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",id,id,id);
    await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','client'),('a','other','Other','other')");
    await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES('social','a','Social','social'),('systems','a','Systems','systems')");
    await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('social','a','Social','social','social')");
    await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES('service','a','james','social')");
    const actor=async id=>{const m=await one('SELECT * FROM workspace_memberships WHERE user_id=?',id);return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}});};
    const owner=await actor('owner'),client=await actor('client');
    const add=async(input={},extra={})=>{const result=await createContent(db,{actor:owner,clientId:'james',serviceEngagementId:'service',requestId:crypto.randomUUID(),input:{title:'Garden update',type:'reel',visibility:'client',script:'Version one',caption:'First caption',pillar:'C5_PRIVATE_PILLAR',platforms:['Instagram','TikTok'],targetPublishDate:'2026-09-22',...input},...extra});assert.equal(result.ok,true);return result.contentId;};
    const get=id=>getContent(db,owner,id),edit=async(id,input,extra={})=>updateContent(db,{actor:owner,contentId:id,input,expectedRevision:(await get(id))?.revision||1,...extra});
    const move=async(id,targetStage,extra={})=>transitionContent(db,{actor:owner,contentId:id,input:{targetStage,expectedRevision:(await get(id)).revision,...targetStage==='waiting_for_recording'?{context:'C5_PRIVATE_WAITING'}:{}},...extra});
    const platforms=async(id,labels,revision=null)=>setContentPlatforms(db,{actor:owner,contentId:id,input:{platforms:labels,expectedRevision:revision??(await get(id)).revision}});
    const ask=async(id,input={},who=owner)=>requestContentApproval(db,{actor:who,contentId:id,input:{requestId:crypto.randomUUID(),expectedRevision:(await get(id))?.revision||1,...input}});
    const respond=(roundId,decision='approved',feedback=null,who=client)=>respondContentApproval(db,{actor:who,roundId,input:{decision,feedback}});
    const withdraw=async(id,roundId,input={},who=owner)=>withdrawContentApproval(db,{actor:who,roundId,input:{expectedRevision:(await get(id))?.revision||1,...input}});
    const history=(id,who=owner,page=1)=>contentApprovalHistory(db,who,id,{page});
    const ready=async()=>{const id=await add();await run("UPDATE content_items SET stage='client_review' WHERE id=?",id);return id;};
    const snapshot=async()=>JSON.stringify(await Promise.all(['content_items','content_platforms','content_review_revisions','content_approval_rounds','activity_events'].map(table=>all(`SELECT * FROM ${table} ORDER BY rowid`))));
    const beforeBatch=fn=>{let armed=true;db.batch=async statements=>{if(armed){armed=false;await fn();}return batch(statements);};};
    const id=await add({recordingRequired:true}),parents=JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','actions','onboarding_instances'].map(table=>all(`SELECT * FROM ${table}`))));
    for(const stage of ['script','waiting_for_recording'])assert.equal((await move(id,stage)).ok,true);
    const bytes=new TextEncoder().encode('C5 original recording'),file=await uploadContentFile(db,{actor:client,portal:true,bucket:env.FILES,contentId:id,input:{requestId:crypto.randomUUID(),filename:'Recording.mp4',mimeType:'video/mp4',byteSize:bytes.length,purpose:'recording'},bytes});
    check('C4 actual R2 recording reaches Ready before review',file.ok);
    const stored=await one('SELECT * FROM assets WHERE id=?',file.fileId),fileFacts=JSON.stringify(await all('SELECT * FROM assets'));
    for(const stage of ['editing','internal_review','client_review'])assert.equal((await move(id,stage)).ok,true);
    check('C2 generic internal approval is blocked',(await move(id,'approved')).ok===false);
    const input={requestId:crypto.randomUUID(),expectedRevision:(await get(id)).revision},round1=await ask(id,input);check('first request captures immutable review and leaves canonical stage',round1.ok&&(await get(id)).stage==='client_review');
    const dto=await getPortalApproval(db,client,round1.roundId);
    check('Client DTO has only allowlisted structured snapshot',Object.keys(dto).sort().join()==='id,number,requestedAt,snapshot'&&Object.keys(dto.snapshot).sort().join()==='caption,cta,hook,platforms,script,targetPublishDate,title,type'&&!/PRIVATE|object_key|fileId|revision|owner/.test(JSON.stringify(dto)));
    check('snapshot records C3 platform labels and floating date',dto.snapshot.platforms.join()==='Instagram,TikTok'&&dto.snapshot.targetPublishDate==='2026-09-22');
    const requested=await snapshot();check('request response-loss retry is a complete no-op',(await ask(id,input)).unchanged&&await snapshot()===requested);
    for(const field of ['title','script','caption','targetPublishDate','clientApprovalRequired'])check(`Requested freezes ${field}`,!(await edit(id,{[field]:field==='clientApprovalRequired'?false:field==='targetPublishDate'?'2026-09-25':'Changed'})).ok);
    check('Requested freezes C3 associations and C2 internal revision transition',!(await platforms(id,['YouTube'])).ok&&!(await move(id,'revision_requested',{input:{targetStage:'revision_requested',context:'Bypass',expectedRevision:(await get(id)).revision}})).ok&&await snapshot()===requested);
    const feedback='Please shorten the opening.';check('Client changes request commits round, feedback and canonical stage',(await respond(round1.roundId,'changes_requested',feedback)).ok&&(await get(id)).stage==='revision_requested'&&(await get(id)).stageContext===feedback);
    const old=(await history(id)).items[0],finished=await snapshot();check('identical Client retry adds no stage or approval events',(await respond(round1.roundId,'changes_requested',feedback)).unchanged&&await snapshot()===finished);
    for(const stage of ['editing'])assert.equal((await move(id,stage)).ok,true);
    assert.equal((await edit(id,{script:'Version two',targetPublishDate:'2026-09-23'})).ok,true);assert.equal((await platforms(id,['LinkedIn'])).ok,true);
    for(const stage of ['internal_review','client_review'])assert.equal((await move(id,stage)).ok,true);
    const round2=await ask(id),rounds=(await history(id)).items;
    check('second round allocates a distinct durable revision and preserves round one',round2.ok&&rounds[0].number===2&&rounds[0].revisionId!==old.revisionId&&JSON.stringify(rounds[1])===JSON.stringify(old)&&rounds[0].snapshot.script==='Version two');
    check('Client approval advances only the matching second round',(await respond(round2.roundId)).ok&&(await get(id)).stage==='approved');
    check('old rounds never become portal history',await getPortalApproval(db,client,round1.roundId)===null&&await getPortalApproval(db,client,round2.roundId)===null);
    check('C4 File metadata and R2 bytes survive every approval',JSON.stringify(await all('SELECT * FROM assets'))===fileFacts&&await new Response((await downloadContentFile(db,{actor:owner,bucket:env.FILES,fileId:file.fileId})).body).text()==='C5 original recording'&&(await env.FILES.head(stored.object_key)).size===bytes.length);
    check('C3 calendar still projects canonical revised date/platform',(await contentCalendar(db,owner,{start:'2026-09-01',end:'2026-09-30',platform:'linkedin'})).items.some(item=>item.id===id&&item.targetPublishDate==='2026-09-23'));
    check('approval never mutates Client, Service, Project, Action or onboarding facts',parents===JSON.stringify(await Promise.all(['bloomops_clients','service_engagements','projects','actions','onboarding_instances'].map(table=>all(`SELECT * FROM ${table}`)))));
    for(const same of [true,false]){
      const contentId=await ready(),requestId=crypto.randomUUID(),results=await Promise.all([ask(contentId,{requestId,expectedRevision:1}),ask(contentId,{requestId:same?requestId:crypto.randomUUID(),expectedRevision:1})]);
      check(`${same?'identical':'different'} request race has one actual D1 round`,results.filter(r=>r.ok&&!r.unchanged).length===1&&(await history(contentId)).items.length===1);
    }
    for(const operation of ['edit','platforms','date'])for(const first of ['request','mutation']){
      const contentId=await ready(),mutation=()=>operation==='platforms'?platforms(contentId,['YouTube'],1):edit(contentId,operation==='date'?{targetPublishDate:'2026-09-29'}:{script:'Competing'},{expectedRevision:1});let competitor;
      beforeBatch(async()=>{competitor=await (first==='request'?ask(contentId,{expectedRevision:1}):mutation());});
      const result=await(first==='request'?mutation():ask(contentId,{expectedRevision:1}));db.batch=batch;
      check(`actual D1 request/${operation} race, ${first} first: one winner`,competitor.ok&&!result.ok&&(await history(contentId)).items.length===(first==='request'?1:0));
    }
    for(const kind of ['same','opposite','withdraw']){
      const contentId=await ready(),{roundId}=await ask(contentId),results=await Promise.all([respond(roundId),kind==='withdraw'?withdraw(contentId,roundId,{expectedRevision:2}):respond(roundId,kind==='same'?'approved':'changes_requested',kind==='same'?null:'Rework')]);
      check(`actual D1 response/${kind} race converges once`,results.filter(r=>r.ok&&!r.unchanged).length===1&&(await history(contentId)).items[0].status!=='requested');
    }
    for(const operation of ['request','approve','changes','withdraw'])for(const failure of [...operation==='request'?['revision']:[],'round','semantic',...['approve','changes'].includes(operation)?['stage-event']:[],'content']){
      const contentId=await ready(),roundId=operation==='request'?null:(await ask(contentId)).roundId;
      const target=failure==='revision'?'INSERT ON content_review_revisions':failure==='round'?`${operation==='request'?'INSERT':'UPDATE'} ON content_approval_rounds`:failure==='content'?'UPDATE ON content_items':`INSERT ON activity_events WHEN NEW.event_type ${failure==='semantic'?"LIKE 'CONTENT_APPROVAL_%'":"= 'CONTENT_STAGE_CHANGED'"}`;
      const before=await snapshot();await run(`CREATE TRIGGER fail_c5 BEFORE ${target} BEGIN SELECT RAISE(ABORT,'late local failure'); END`);let failed=false;
      try{await(operation==='request'?ask(contentId):operation==='withdraw'?withdraw(contentId,roundId):respond(roundId,operation==='changes'?'changes_requested':'approved',operation==='changes'?'Revise':null));}catch{failed=true;}
      await run('DROP TRIGGER fail_c5');check(`actual D1 ${operation} ${failure} rolls back all facts`,failed&&await snapshot()===before);
    }
    for(const operation of ['request','approve','changes','withdraw']){
      const contentId=await ready(),roundId=operation==='request'?null:(await ask(contentId)).roundId,key={requestId:crypto.randomUUID(),expectedRevision:1};let armed=true;
      db.batch=async statements=>{const result=await batch(statements);if(armed){armed=false;throw new Error('lost committed response');}return result;};
      const action=()=>operation==='request'?ask(contentId,key):operation==='withdraw'?withdraw(contentId,roundId,{expectedRevision:2}):respond(roundId,operation==='changes'?'changes_requested':'approved',operation==='changes'?'Please revise':null);
      await action().catch(()=>null);const before=await snapshot();check(`actual D1 ${operation} lost response retries without duplicates`,(await action()).unchanged&&await snapshot()===before);db.batch=batch;
    }
    const authEnv={...env,BLOOMOPS_ENV:'development',BLOOMOPS_APP_URL:'http://localhost:3000',BLOOMOPS_AUTH_SECRET:'c5-disposable-auth-secret-not-for-deployment-0123456789'},sent=[];
    const auth=createAuth({env:authEnv,db,mailer:{ready:true,transport:'memory',send:async message=>{sent.push(message);return{id:'local'};}}});
    const login=async email=>{const signed=await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/magic-link',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({email,callbackURL:'/portal'})}));assert.equal(signed.status,200);const verified=await auth.handler(new Request(sent.at(-1).text.match(/https?:\/\/\S+/)[0]));return verified.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>!c.endsWith('=')).join('; ');};
    const clientCookie=await login('client@example.com'),pmCookie=await login('pm@example.com');
    const issued=async cookie=>{const identity=await auth.api.getSession({headers:new Headers({cookie})});assert.ok(identity);return loadActor(db,await resolveWorkspaceAccess(db,identity.user.id));};
    const revocations={membership:["UPDATE workspace_memberships SET status='suspended' WHERE id='m-client'","UPDATE workspace_memberships SET status='active' WHERE id='m-client'"],role:["UPDATE workspace_memberships SET role='team_member' WHERE id='m-client'","UPDATE workspace_memberships SET role='client' WHERE id='m-client'"],contact:["UPDATE client_contacts SET user_id=NULL WHERE client_id='james'","UPDATE client_contacts SET user_id='client' WHERE client_id='james'"],workspace:["UPDATE workspaces SET status='suspended' WHERE id='a'","UPDATE workspaces SET status='active' WHERE id='a'"],service:["UPDATE service_types SET department_id='systems' WHERE id='social'","UPDATE service_types SET department_id='social' WHERE id='social'"]};
    for(const [kind,[revoke,restore]] of Object.entries(revocations)){
      const contentId=await ready(),{roundId}=await ask(contentId),who=await issued(clientCookie);beforeBatch(()=>run(revoke));
      const result=await respond(roundId,'approved',null,who);db.batch=batch;
      check(`real issued Client session ${kind} revoked at actual D1 response commit`,!result.ok&&await getPortalApproval(db,who,roundId)===null&&(await one('SELECT status FROM content_approval_rounds WHERE id=?',roundId)).status==='requested');await run(restore);
    }
    for(const kind of ['membership','role','visibility','service']){
      const contentId=await ready(),who=await issued(pmCookie),statements={membership:["UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'","UPDATE workspace_memberships SET status='active' WHERE id='m-pm'"],role:["UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'","UPDATE workspace_memberships SET role='project_manager' WHERE id='m-pm'"],visibility:[`UPDATE content_items SET visibility='restricted' WHERE id='${contentId}'`,`UPDATE content_items SET visibility='client' WHERE id='${contentId}'`],service:revocations.service};
      beforeBatch(()=>run(statements[kind][0]));const result=await ask(contentId,{},who);db.batch=batch;check(`real issued coordinator ${kind} revoked at actual D1 request commit`,!result.ok&&(await all('SELECT * FROM content_review_revisions WHERE content_id=?',contentId)).length===0);await run(statements[kind][1]);
    }
    const scoped=await ready(),{roundId}=await ask(scoped);await run("UPDATE content_items SET visibility='restricted' WHERE id=?",scoped);
    await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','service','m-pm')");const pm=await issued(pmCookie);beforeBatch(()=>run("DELETE FROM service_assignments WHERE membership_id='m-pm'"));
    check('issued restricted coordinator loses exact assignment before withdrawal',!(await withdraw(scoped,roundId,{},pm)).ok);db.batch=batch;
    const restrictedEventIds=(await all("SELECT id FROM activity_events WHERE subject_type='content' AND subject_id=?",scoped)).map(e=>e.id);
    check('restricted Content approval activity follows live visibility and assignment',!(await clientActivity(db,'a','james',{actor:pm})).some(e=>restrictedEventIds.includes(e.id))&&(await history(scoped,pm)).items.length===0);
    for(let i=0;i<240;i++){await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`large-${i}`,`Large ${i}`,`large-${i}`);await run("INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a',?,'m-team')",`large-${i}`);}
    const team=await actor('team');check('240 unrelated assignments do not grant Content history',(await history(id,team)).items.length===0);
    await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','service','m-team')");
    check('large scope history/activity queries fit actual D1 parameter limit',(await history(id,team)).items.length===2&&(await clientActivity(db,'a','james',{actor:team})).length>0);
    check('Client has only actionable Home requests',(await approvalRequests(db,client)).items.every(row=>Object.keys(row).sort().join()==='id,title'));
    check('actual D1 foreign keys and integrity pass',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
    return Response.json({checks:messages.length,messages});
  }catch(error){return Response.json({messages,error:String(error.stack||error)},{status:500});}
}};
