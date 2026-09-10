// Disposable C6 read acceptance on actual workerd, D1 and R2.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent, getContent } from '../lib/bloomops/content.mjs';
import { portalContent, getPortalContent, hasPortalContent } from '../lib/bloomops/portal-content.mjs';
import { requestContentApproval, respondContentApproval } from '../lib/bloomops/content-approvals.mjs';
import { uploadContentFile, downloadContentFile } from '../lib/bloomops/content-files.mjs';
export default { async fetch(request,env) {
  if(env.C6_DISPOSABLE!=='local-only'||new URL(request.url).hostname!=='localhost')return new Response(null,{status:403});
  const messages=[],check=(name,ok)=>{assert.ok(ok,name);messages.push(name);};
  try {
    const run=(q,...args)=>env.DB.prepare(q).bind(...args).run(),one=(q,...args)=>env.DB.prepare(q).bind(...args).first(),all=async(q,...args)=>(await env.DB.prepare(q).bind(...args).all()).results;
    for(const statement of C6_MIGRATIONS)await run(statement);
    const db=drizzle(env.DB,{schema});
    for(const ws of ['a','b'])await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',ws,ws,ws);
    for(const [id,role,ws] of [['owner','owner','a'],['pm','project_manager','a'],['team','team_member','a'],['client','client','a'],['other','client','a'],['foreign','client','b']]){
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
    const add=async(input={},extra={})=>{const r=await createContent(db,{actor:owner,clientId:'james',serviceEngagementId:'service',requestId:crypto.randomUUID(),input:{title:'Garden update',type:'reel',visibility:'client',script:'PRIVATE_SCRIPT',pillar:'PRIVATE_PILLAR',platforms:['Instagram','TikTok'],targetPublishDate:'2026-09-22',...input},...extra});assert.equal(r.ok,true);return r.contentId;};
    check('no Content means no navigation',!await hasPortalContent(db,client));
    const destinationId=await add(),now=new Date('2026-09-30T12:00:00.000Z');
    check('current work activates the destination',await hasPortalContent(db,client,{now}));
    for(const [label,publishedAt,eligible] of [['old','2026-08-31T11:59:59.999Z',false],['boundary','2026-08-31T12:00:00.000Z',true],['recent','2026-09-29T12:00:00.000Z',true],['future','2026-09-30T12:00:00.001Z',false]]){
      await run("UPDATE content_items SET stage='published',published_at=? WHERE id=?",publishedAt,destinationId);
      check(`${label} Published-only destination agrees with list discovery`,(await hasPortalContent(db,client,{now}))===eligible&&(await portalContent(db,client,{view:'published'},{now})).items.length===Number(eligible)&&(await portalContent(db,client,{}, {now})).items.length===0);
    }
    await run("UPDATE content_items SET visibility='internal',published_at='2026-09-29T12:00:00.000Z' WHERE id=?",destinationId);
    check('hidden recent Content and another Client cannot activate navigation',!await hasPortalContent(db,client,{now})&&!await hasPortalContent(db,await actor('other'),{now}));
    const id=await add({recordingRequired:true});await run("UPDATE content_items SET stage='waiting_for_recording',stage_context='PRIVATE_WAITING' WHERE id=?",id);
    const empty=await add();
    const bytes=new TextEncoder().encode('C6 original recording'),file=await uploadContentFile(db,{actor:client,portal:true,bucket:env.FILES,contentId:id,input:{requestId:crypto.randomUUID(),filename:'Recording.mp4',mimeType:'video/mp4',byteSize:bytes.length,purpose:'recording'},bytes});
    check('C4 Ready recording stored in actual R2',file.ok);
    const detail=await getPortalContent(db,client,id);
    check('general detail contains only safe summary and Ready File metadata',detail.hasFiles&&detail.files.items[0].id===file.fileId&&!/PRIVATE|revision|workspace|objectKey|owner|script|caption/.test(JSON.stringify(detail)));
    check('File indicator cannot be borrowed by another Content row',!(await getPortalContent(db,client,empty)).hasFiles);
    check('recording action is current',(await portalContent(db,client,{view:'action'})).items.map(i=>i.id).join()===id);
    check('canonical download returns bytes',Boolean(await downloadContentFile(db,{actor:client,bucket:env.FILES,fileId:file.fileId})));
    for(const who of ['owner','pm','team','other','foreign']){const a=await actor(who);check(`${who} cannot read linked Client Content`,!await hasPortalContent(db,a)&&await getPortalContent(db,a,id)===null);}
    for(let i=0;i<45;i++)await add({title:`PRIVATE_${i}`,visibility:i%2?'internal':'restricted',targetPublishDate:'2026-01-01'});
    for(let i=0;i<19;i++)await add({title:`Visible ${i}`});
    const first=await portalContent(db,client),second=await portalContent(db,client,{page:'2'});
    check('D1 filters hidden rows before bounded pagination',first.items.length===20&&first.hasMore&&second.items.length===1&&!second.hasMore&&!/PRIVATE/.test(JSON.stringify(first)));
    for(let i=0;i<240;i++){
      await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a',?,?)",`large-${i}`,`Large ${i}`,`large-${i}`);
      await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a',?,'Contact','client')",`large-${i}`);
    }
    const large=await actor('client');check('240 linked Clients fit D1 limits without IN-list expansion',await hasPortalContent(db,large)&&(await portalContent(db,large,{view:'action'})).items.length===1&&Boolean(await getPortalContent(db,large,id)));
    await run("UPDATE content_items SET stage='client_review',stage_context=NULL WHERE id=?",id);
    const requestRound=await requestContentApproval(db,{actor:owner,contentId:id,input:{requestId:crypto.randomUUID(),expectedRevision:(await getContent(db,owner,id)).revision}});
    check('C5 requested round drives the general action link',requestRound.ok&&(await getPortalContent(db,client,id)).approvalRoundId===requestRound.roundId);
    check('leaving recording stage hides every C4 File and old download',!(await getPortalContent(db,client,id)).hasFiles&&await downloadContentFile(db,{actor:client,bucket:env.FILES,fileId:file.fileId})===null);
    assert.equal((await respondContentApproval(db,{actor:client,roundId:requestRound.roundId,input:{decision:'approved'}})).ok,true);
    check('C5 response removes action without a C6 write',(await getPortalContent(db,client,id)).approvalRoundId===null);
    await run("UPDATE content_items SET stage='published',published_at='2026-09-09T00:00:00.000Z' WHERE id=?",id);
    check('recent publication reads canonical time',(await portalContent(db,client,{view:'published'},{now:new Date('2026-09-10T00:00:00.000Z')})).items[0].id===id);
    const revocations={membership:["UPDATE workspace_memberships SET status='suspended' WHERE id='m-client'","UPDATE workspace_memberships SET status='active' WHERE id='m-client'"],role:["UPDATE workspace_memberships SET role='team_member' WHERE id='m-client'","UPDATE workspace_memberships SET role='client' WHERE id='m-client'"],workspace:["UPDATE workspaces SET status='suspended' WHERE id='a'","UPDATE workspaces SET status='active' WHERE id='a'"],contact:["UPDATE client_contacts SET user_id=NULL WHERE client_id='james'","UPDATE client_contacts SET user_id='client' WHERE client_id='james'"],social:["UPDATE service_types SET department_id='systems' WHERE id='social'","UPDATE service_types SET department_id='social' WHERE id='social'"]};
    for(const [kind,[revoke,restore]] of Object.entries(revocations)){
      await run(revoke);check(`stale ${kind} authority disappears from nav/list/detail`,!await hasPortalContent(db,large)&&(await portalContent(db,large)).items.length===0&&await getPortalContent(db,large,id)===null);await run(restore);
    }
    const batch=db.batch.bind(db);db.batch=async statements=>{await run("UPDATE content_items SET visibility='internal'");return batch(statements);};
    check('detail batch fences authority revoked after route resolution',await getPortalContent(db,client,id)===null);db.batch=batch;
    check('foreign keys and integrity pass',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
    return Response.json({messages,checks:messages.length});
  }catch(error){return Response.json({messages,error:String(error.stack||error)},{status:500});}
}};
