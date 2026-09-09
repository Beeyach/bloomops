// Test-only entry bundled by content-files-smoke-local, never the app Worker.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../lib/bloomops/schema.mjs';
import { loadActor } from '../lib/bloomops/authorization.mjs';
import { createContent, getContent } from '../lib/bloomops/content.mjs';
import { transitionContent } from '../lib/bloomops/content-pipeline.mjs';
import { uploadContentFile, retryContentFile, changeContentFile, listContentFiles, downloadContentFile, recordingRequests } from '../lib/bloomops/content-files.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { contentFileActivityRows } from '../lib/bloomops/content-file-activity.mjs';
import { FILE_LEASE_MS, FILE_MAX_BYTES } from '../lib/bloomops/file-values.mjs';
import { createAuth } from '../lib/bloomops/auth.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';

export default { async fetch(request, env) {
  if (env.C4_DISPOSABLE !== 'local-only' || new URL(request.url).hostname !== 'localhost') return new Response(null, { status: 403 });
  const messages = [], check = (name, ok) => { assert.ok(ok, name); messages.push(name); };
  try {
    const run = (q, ...args) => env.DB.prepare(q).bind(...args).run(), one = (q, ...args) => env.DB.prepare(q).bind(...args).first(), all = async (q, ...args) => (await env.DB.prepare(q).bind(...args).all()).results;
    for (const sql of C4_MIGRATIONS) await run(sql);
    const db = drizzle(env.DB, { schema }), bucket = env.FILES;
    for (const ws of ['a','b']) await run('INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', ws, ws, ws);
    for (const [id,role,ws] of [['owner','owner','a'],['pm','project_manager','a'],['team','team_member','a'],['client','client','a'],['foreign','owner','b']]) {
      await run('INSERT INTO user(id,name,email) VALUES(?,?,?)',id,id,`${id}@example.com`);
      await run("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,?,'active')",`m-${id}`,ws,id,role);
    }
    await run("INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('james','a','James','james')");
    await run("INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES('a','james','James','client')");
    await run("INSERT INTO departments(id,workspace_id,name,slug) VALUES('social','a','Social','social')");
    await run("INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES('social','a','Social','social','social')");
    await run("INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES('service','a','james','social')");
    const actor = async id => { const m = await one('SELECT * FROM workspace_memberships WHERE user_id=?',id); return loadActor(db,{workspace:{id:m.workspace_id},membership:{id:m.id,userId:id,role:m.role,status:m.status}}); };
    const owner = await actor('owner'), client = await actor('client'), team = await actor('team'), pm = await actor('pm');
    const contentId = (await createContent(db,{actor:owner,clientId:'james',serviceEngagementId:'service',requestId:crypto.randomUUID(),input:{title:'Your short update',type:'reel',visibility:'client',recordingRequired:true,platforms:['Instagram'],hook:'PRIVATE_HOOK',script:'PRIVATE_SCRIPT',caption:'PRIVATE_CAPTION'}})).contentId;
    for (const targetStage of ['script','waiting_for_recording']) { const item = await getContent(db,owner,contentId); assert.ok((await transitionContent(db,{actor:owner,contentId,input:{targetStage,expectedRevision:item.revision,...targetStage==='waiting_for_recording'?{context:'PRIVATE_WAITING'}:{}}})).ok); }
    const bytes = new TextEncoder().encode('Actual R2 recording bytes'), input = extra => ({requestId:crypto.randomUUID(),filename:'recording.mp4',mimeType:'video/mp4',byteSize:bytes.length,purpose:'recording',...extra});
    const upload = (value={},extra={}) => uploadContentFile(db,{actor:owner,bucket,contentId,input:input(value),bytes,...extra});
    const stored = id => one('SELECT * FROM assets WHERE id=?',id), download = (fileId,who=owner,extra={})=>downloadContentFile(db,{bucket,actor:who,fileId,...extra});
    const retry = (fileId,extra={})=>retryContentFile(db,{actor:owner,bucket,contentId,fileId,input:{filename:'recording.mp4',mimeType:'video/mp4',byteSize:bytes.length},bytes,...extra});
    const edit = async (fileId,operation,extra={})=>changeContentFile(db,{actor:owner,bucket,contentId,fileId,operation,expectedRevision:(await stored(fileId)).revision,...extra});
    const wrap = overrides=>({put:(...a)=>bucket.put(...a),head:(...a)=>bucket.head(...a),get:(...a)=>bucket.get(...a),delete:(...a)=>bucket.delete(...a),...overrides});
    const facts = async()=>JSON.stringify(await Promise.all(['content_items','content_platforms','bloomops_clients','service_engagements','projects','actions','onboarding_instances'].map(t=>all(`SELECT * FROM ${t} ORDER BY rowid`)))), before = await facts();
    const requestId=crypto.randomUUID(), result=await upload({requestId},{actor:client,portal:true}); check('eligible Client upload reaches Ready through canonical File storage',result.ok);
    const row=await stored(result.fileId), object=await bucket.head(row.object_key);
    check('actual R2 proves key, size, MIME, etag, SHA256',object.key===row.object_key&&object.size===bytes.length&&object.httpMetadata.contentType==='video/mp4'&&object.etag===row.etag&&Buffer.from(object.checksums.sha256).toString('hex')===row.sha256);
    check('Client bytes equal original recording',await new Response((await download(row.id,client)).body).text()==='Actual R2 recording bytes');
    check('identical response-loss retry converges once',(await upload({requestId},{actor:client,portal:true})).unchanged&&(await all("SELECT * FROM activity_events WHERE event_type='FILE_UPLOADED'")).length===1);
    for(const value of [{purpose:'asset'},{visibility:'client'},{objectKey:'forged'}])check('Client cannot choose purpose, visibility or storage authority',!(await upload(value,{actor:client,portal:true})).ok);
    const portal=await listContentFiles(db,client,contentId,{portal:true});check('safe portal allowlist contains six fields only',Object.keys(portal.items[0]).sort().join(',')==='byteSize,filename,id,mimeType,readyAt,status');
    check('request projection exposes only safe title and opaque ID',Object.keys((await recordingRequests(db,client))[0]).sort().join(',')==='id,title');
    check('foreign workspace and unassigned Team cannot upload',!(await upload({}, {actor:await actor('foreign')})).ok&&!(await upload({}, {actor:team})).ok);
    await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','service','m-team')"); const assigned=await actor('team');
    const restricted=await upload({visibility:'restricted'},{actor:assigned});check('exact Social assignment grants Team restricted file fulfillment',restricted.ok);
    check('ordinary PM cannot read restricted File',await download(restricted.fileId,pm)===null);
    check('combined Client and Content file history fits real D1 bind limits',(await clientActivity(db,'a','james',{actor:assigned})).length>0&&(await contentFileActivityRows(db,assigned,{contentId})).length>0);
    await run("DELETE FROM service_assignments WHERE membership_id='m-team'");check('issued Team actor loses current storage reach',await download(restricted.fileId,assigned)===null);
    const revocations={contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='client'",stage:"UPDATE content_items SET stage='editing',stage_context=NULL",visibility:"UPDATE content_items SET visibility='internal'",recording:"UPDATE content_items SET recording_required=0",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-client'",social:"UPDATE departments SET slug='renamed' WHERE id='social'"};
    for(const[kind,query]of Object.entries(revocations))for(const boundary of ['put','get','head']){
      const revoke=wrap({[boundary]:async(...args)=>{const r=await bucket[boundary](...args);await run(query);return r;}});
      const r=boundary==='get'?await download(row.id,client,{bucket:revoke}):await upload(boundary==='head'?{requestId}:{},{actor:client,portal:true,bucket:revoke});
      check(`live ${kind} revoked during actual R2 ${boundary} refuses success`,boundary==='get'?r===null:!r.ok);
      await run("UPDATE client_contacts SET user_id='client' WHERE client_id='james'");await run("UPDATE content_items SET stage='waiting_for_recording',stage_context='PRIVATE_WAITING',visibility='client',recording_required=1");await run("UPDATE workspace_memberships SET status='active' WHERE id='m-client'");await run("UPDATE departments SET slug='social' WHERE id='social'");
    }
    for(const failure of ['reserve','link','attempt','finalize','activity','put','cleanup']){
      const requestId=crypto.randomUUID(),table={reserve:'assets',link:'content_asset_links',attempt:'asset_upload_attempts',activity:'activity_events'}[failure];
      if(table)await run(`CREATE TRIGGER fail_c4 BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'failure'); END`);
      if(failure==='finalize')await run("CREATE TRIGGER fail_c4 BEFORE UPDATE ON assets WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'failure'); END");
      const broken=['put','cleanup'].includes(failure)?wrap({put:async(...a)=>{await bucket.put(...a);throw new Error('lost PUT');},...failure==='cleanup'?{delete:async()=>{throw new Error('cleanup');}}:{}}):bucket;
      const r=await upload({requestId},{bucket:broken}).catch(()=>({ok:false})),file=await one('SELECT * FROM assets WHERE creation_request_id=?',requestId);
      check(`${failure} failure leaves no false Ready`,!r.ok&&(['reserve','link','attempt'].includes(failure)?!file:file.status==='failed'&&await download(file.id)===null));
      if(table||failure==='finalize')await run('DROP TRIGGER fail_c4');
      if(file){const recovered=await retry(file.id);check(`${failure} recovery retains File and fences old object`,recovered.ok&&recovered.fileId===file.id&&(await stored(file.id)).object_key!==file.object_key&&await bucket.head(file.object_key)===null);}
    }
    const batch=db.batch.bind(db);let n=0;db.batch=async writes=>{const r=await batch(writes);if(++n===2)throw new Error('lost commit');return r;};const lost=await upload();db.batch=batch;
    check('uncertain D1 finalize retains Ready bytes',lost.ok&&lost.unchanged&&Boolean(await download(lost.fileId)));
    let signal,release;const started=new Promise(r=>signal=r),gate=new Promise(r=>release=r),now=new Date(),key=crypto.randomUUID();
    const old=upload({requestId:key},{now,bucket:wrap({put:async(...args)=>{signal();await gate;return bucket.put(...args);}})});await started;
    const winner=await upload({requestId:key},{now:new Date(now.getTime()+FILE_LEASE_MS+1)});release();await old;
    check('late old PUT cannot destroy winning actual R2 generation',winner.ok&&Boolean(await download(winner.fileId))&&(await all('SELECT * FROM asset_upload_attempts WHERE asset_id=?',winner.fileId)).length===2);
    const max=new Uint8Array(FILE_MAX_BYTES).fill(42);check('actual workerd accepts bounded 5 MiB recording',(await upload({byteSize:max.length},{bytes:max})).ok);
    const missing=await upload();await bucket.delete((await stored(missing.fileId)).object_key);check('missing Ready bytes fail safely without repair',await download(missing.fileId)===null&&(await stored(missing.fileId)).status==='ready');
    const archived=await upload();await edit(archived.fileId,'archive');check('archive fences downloads and retains previously Ready object',await download(archived.fileId)===null&&Boolean(await bucket.head((await stored(archived.fileId)).object_key)));
    check('recording operations never change Content, platforms, lifecycle or parent facts',before===await facts());
    // Real Better Auth-issued identity and the canonical membership loader,
    // and actual D1/R2 while revocation happens inside the awaited binding.
    const authEnv={...env,BLOOMOPS_ENV:'development',BLOOMOPS_APP_URL:'http://localhost:3000',BLOOMOPS_AUTH_SECRET:'c4-disposable-auth-secret-not-for-deployment-0123456789'};
    const sent=[],auth=createAuth({env:authEnv,db,mailer:{ready:true,transport:'memory',send:async message=>{sent.push(message);return{id:'local'};}}});
    const signed=await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/magic-link',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({email:'client@example.com',callbackURL:'/portal'})}));
    assert.equal(signed.status,200);const verified=await auth.handler(new Request(sent[0].text.match(/https?:\/\/\S+/)[0]));
    const cookie=verified.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>!c.endsWith('=')).join('; ');
    const requestForSession=()=>new Request('http://localhost:3000/api/bloomops/portal/recordings',{headers:{cookie}});
    for(const[kind,query]of Object.entries(revocations))for(const boundary of ['put','get']){
      const identity=await auth.api.getSession({headers:requestForSession().headers});assert.ok(identity);
      const access=await resolveWorkspaceAccess(db,identity.user.id);assert.ok(access?.membership);const issued=await loadActor(db,access);
      const revoke=wrap({[boundary]:async(...args)=>{const object=await bucket[boundary](...args);await run(query);return object;}});
      const result=boundary==='get'?await download(row.id,issued,{bucket:revoke}):await upload({}, {actor:issued,portal:true,bucket:revoke});
      check(`real issued Client session: ${kind} revoked during R2 ${boundary}`,boundary==='get'?result===null:!result.ok);
      await run("UPDATE client_contacts SET user_id='client' WHERE client_id='james'");await run("UPDATE content_items SET stage='waiting_for_recording',stage_context='PRIVATE_WAITING',visibility='client',recording_required=1");await run("UPDATE workspace_memberships SET status='active' WHERE id='m-client'");await run("UPDATE departments SET slug='social' WHERE id='social'");
    }
    await auth.handler(new Request('http://localhost:3000/api/auth/sign-in/magic-link',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({email:'team@example.com',callbackURL:'/'})}));
    const teamVerified=await auth.handler(new Request(sent.at(-1).text.match(/https?:\/\/\S+/)[0]));
    const teamCookie=teamVerified.headers.getSetCookie().map(c=>c.split(';')[0]).filter(c=>!c.endsWith('=')).join('; ');
    for(const boundary of ['put','get']){
      await run("INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','service','m-team')");
      const identity=await auth.api.getSession({headers:new Headers({cookie:teamCookie})});assert.ok(identity);
      const issued=await loadActor(db,await resolveWorkspaceAccess(db,identity.user.id));
      const revoke=wrap({[boundary]:async(...args)=>{const object=await bucket[boundary](...args);await run("DELETE FROM service_assignments WHERE membership_id='m-team'");return object;}});
      const result=boundary==='get'?await download(restricted.fileId,issued,{bucket:revoke}):await upload({}, {actor:issued,bucket:revoke});
      check(`real issued Team session loses assignment during R2 ${boundary}`,boundary==='get'?result===null:!result.ok);
    }
    check('actual D1 FK and integrity checks pass',(await all('PRAGMA foreign_key_check')).length===0&&(await one('PRAGMA quick_check')).quick_check==='ok');
    return Response.json({checks:messages.length,messages});
  }catch(error){return Response.json({messages,error:String(error.stack||error)},{status:500});}
} };
