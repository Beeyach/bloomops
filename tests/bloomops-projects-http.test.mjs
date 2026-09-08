import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_projects.mjs';
import { APP_URL, run, all } from './_bloomops-db.mjs';
import { addProjectAssignment } from '../lib/bloomops/project-assignments.mjs';

async function http() {
  const t=await setup({auth:true}),{projectId}=await t.create({visibility:'client',serviceEngagementId:'ghl-service',ownerMembershipId:'m-ary'});
  t.projectId=projectId; const cookies={};
  t.call=async(path,method='GET',{user='ellen',body={},raw,params={},origin=APP_URL,query=''}={})=>{
    if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
    const route=await import(`../app/api/bloomops/${path}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${path}${query}`,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...method==='GET'?{}:{body:raw??JSON.stringify(body)}}),{params:Promise.resolve({id:projectId,...params})});
  };
  return t;
}

for(const [path,method,body] of [['projects','GET',{}],['projects/[id]','GET',{}],['projects/[id]','PATCH',{name:'Changed',expectedRevision:1}],['projects/[id]/transition','POST',{toStatus:'ready',expectedRevision:1}],['projects/[id]/assignments','POST',{membershipId:'m-sam'}],['projects/[id]/assignments/[assignmentId]','DELETE',{}],['clients/[id]/projects','POST',{name:'New'}]]) test(`${method} ${path} requires identity and refuses cross-site writes`,async()=>{
  const t=await http(); const params=path.startsWith('clients')?{id:'james'}:{assignmentId:'unknown'};
  const anon=await t.call(path,method,{user:null,body,params});assert.equal(anon.status,401);assert.equal(anon.headers.get('cache-control'),'no-store');
  if(method!=='GET')assert.equal((await t.call(path,method,{origin:'https://evil.example',body,params})).status,403);
});
for(const path of ['projects/[id]','projects/[id]/transition','projects/[id]/assignments','projects/[id]/assignments/[assignmentId]','clients/[id]/projects'])test(`${path} refuses malformed and non-object JSON without writes`,async()=>{
  const t=await http();const a=await addProjectAssignment(t.db,{actor:t.owner,projectId:t.projectId,membershipId:'m-sam'});
  const before=['projects','project_assignments','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table}`));
  for(const raw of ['{','null','[]','true','"text"']){
    const method=path==='projects/[id]'||path.endsWith('[assignmentId]')?'PATCH':'POST';
    const r=await t.call(path,method,{raw,params:path.startsWith('clients')?{id:'james'}:{assignmentId:a.assignmentId}});
    assert.equal(r.status,400);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/SQL|constraint|stack/);
  }
  assert.deepEqual(['projects','project_assignments','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table}`)),before);
});
test('HTTP Client projection is an exact allowlist and internal API reads and mutations are refused',async()=>{
  const t=await http(); const r=await t.call('portal/projects/[id]','GET',{user:'james'}); assert.equal(r.status,200);
  const {project}=await r.json();assert.deepEqual(Object.keys(project).sort(),['clientId','clientName','completedAt','id','label','statusLabel','targetDate'].sort());
  assert.equal((await t.call('projects/[id]','GET',{user:'james'})).status,404);
  for(const [path,method,body]of [['projects/[id]','PATCH',{name:'Bad',expectedRevision:1}],['projects/[id]/transition','POST',{toStatus:'ready',expectedRevision:1}],['projects/[id]/assignments','POST',{membershipId:'m-james'}]])assert.equal((await t.call(path,method,{user:'james',body})).status,404);
  assert.equal((await t.call('projects','GET',{user:'james'})).status,403);
  assert.equal((await t.call('portal/projects','GET',{user:'ellen'})).status,403);
});
test('foreign, hidden, guessed and other-client Project IDs have byte-identical 404 responses',async()=>{
  const t=await http(),hidden=await t.create(),foreign=await t.create({name:'Foreign'},{actor:await t.actor('foreign'),clientId:'foreign-client'});
  const answers=[];
  for(const [id,user]of[[t.projectId,'lawrence'],[hidden.projectId,'james'],[foreign.projectId,'james'],['missing','james']]){
    const r=await t.call('portal/projects/[id]','GET',{user,params:{id}});assert.equal(r.status,404);answers.push(await r.text());
  }
  assert.equal(new Set(answers).size,1);
  assert.equal((await t.call('projects/[id]','GET',{user:'foreign'})).status,404);
});
test('assigned Team Member can read Project but cannot coordinate it or its parent',async()=>{
  const t=await http();await addProjectAssignment(t.db,{actor:t.owner,projectId:t.projectId,membershipId:'m-sam'});
  assert.equal((await t.call('projects/[id]','GET',{user:'sam'})).status,200);
  assert.equal((await t.call('projects/[id]','PATCH',{user:'sam',body:{health:'at_risk',expectedRevision:1}})).status,403);
  assert.equal((await t.call('projects/[id]/assignments','POST',{user:'sam',body:{membershipId:'m-other'}})).status,403);
  assert.equal((await t.call('clients/[id]/projects','GET',{user:'sam',params:{id:'james'}})).status,404);
});
for(const change of ['suspended','removed','workspace','visibility'])test(`an issued Client session is refused after ${change}`,async()=>{
  const t=await http();assert.equal((await t.call('portal/projects/[id]','GET',{user:'james'})).status,200);
  if(change==='workspace')run(t.raw,"UPDATE workspaces SET status='suspended' WHERE id='a'");
  else if(change==='visibility')run(t.raw,"UPDATE projects SET visibility='internal' WHERE id=?",t.projectId);
  else run(t.raw,"UPDATE workspace_memberships SET status=? WHERE id='m-james'",change);
  assert.equal((await t.call('portal/projects/[id]','GET',{user:'james'})).status,change==='visibility'?404:403);
});
test('server-owned workspace, parent and actor resist body/query smuggling',async()=>{
  const t=await http();const r=await t.call('clients/[id]/projects','POST',{params:{id:'james'},body:{name:'Safe create',workspaceId:'b',clientId:'foreign-client',actorMembershipId:'m-foreign',status:'completed'}});
  assert.equal(r.status,201);const {projectId}=await r.json(),p=await t.get(projectId);assert.equal(p.workspaceId,'a');assert.equal(p.clientId,'james');assert.equal(p.status,'planned');
  assert.ok(t.events(projectId).every(e=>e.actor_membership_id==='m-ellen'));
  assert.equal((await t.call('projects','GET',{query:'?workspaceId=b&clientId=foreign-client'}).then(r=>r.json())).items.length,0);
});
test('status errors use safe 400/409 responses and response-loss retry is a no-op',async()=>{
  const t=await http(),body={toStatus:'ready',expectedRevision:1};
  assert.equal((await t.call('projects/[id]/transition','POST',{body:{toStatus:'completed',expectedRevision:1}})).status,409);
  assert.equal((await t.call('projects/[id]/transition','POST',{body})).status,200);
  const retry=await t.call('projects/[id]/transition','POST',{body});assert.equal(retry.status,200);assert.ok((await retry.json()).unchanged);
  assert.equal(t.events(t.projectId,'PROJECT_STATUS_CHANGED').length,1);
});
for(const operation of ['create','edit','transition','assign'])test(`HTTP late ${operation} constraint is sanitized and atomic`,async()=>{
  const t=await http();const before=['projects','project_assignments','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table}`));
  run(t.raw,"CREATE TRIGGER fail_b1_http BEFORE INSERT ON activity_events BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL constraint INTERNAL_ID'); END");
  const args={create:['clients/[id]/projects','POST',{params:{id:'james'},body:{name:'Failed'}}],edit:['projects/[id]','PATCH',{body:{name:'Failed',expectedRevision:1}}],transition:['projects/[id]/transition','POST',{body:{toStatus:'ready',expectedRevision:1}}],assign:['projects/[id]/assignments','POST',{body:{membershipId:'m-sam'}}]}[operation];
  const r=await t.call(...args);assert.equal(r.status,500);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(r.headers.get('content-type'),/json/);assert.doesNotMatch(await r.text(),/SQL|constraint|PRIVATE|INTERNAL|stack/);
  assert.deepEqual(['projects','project_assignments','activity_events'].map(table=>all(t.raw,`SELECT * FROM ${table}`)),before);
});
