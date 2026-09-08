import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_deliverables.mjs';
import { APP_URL, run } from './_bloomops-db.mjs';
const paths={list:'projects/[id]/deliverables',item:'projects/[id]/deliverables/[deliverableId]',status:'projects/[id]/deliverables/[deliverableId]/transition',portal:'portal/projects/[id]/deliverables',portalItem:'portal/projects/[id]/deliverables/[deliverableId]'};
async function http(){
  const t=await setup({auth:true});t.deliverableId=(await t.add({visibility:'client',title:'INTERNAL_NAME',clientLabel:'Your website'})).deliverableId;
  const cookies={};
  t.call=async(key,method='GET',{user='ellen',body={},raw,params={},origin=APP_URL}={})=>{
    if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
    const route=await import(`../app/api/bloomops/${paths[key]}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${paths[key]}`,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...method==='GET'?{}:{body:raw??JSON.stringify(body)}}),{params:Promise.resolve({id:t.projectId,deliverableId:t.deliverableId,...params})});
  };return t;
}
for(const[key,method]of[['list','GET'],['list','POST'],['item','GET'],['item','PATCH'],['status','POST'],['portal','GET'],['portalItem','GET']])test(`${key} ${method} requires real identity and protects response caching`,async()=>{
  const t=await http();const r=await t.call(key,method,{user:null});assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');
  if(method!=='GET')assert.equal((await t.call(key,method,{origin:'https://evil.example'})).status,403);
});
for(const[key,method]of[['list','POST'],['item','PATCH'],['status','POST']])test(`${key} rejects malformed/non-object and forbidden fields with safe 400 and no mutation`,async()=>{
  const t=await http(),before=t.snapshot();
  for(const raw of ['{','null','[]','false','123','"text"']){const r=await t.call(key,method,{raw});assert.equal(r.status,400);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/SQL|stack|constraint/);}
  for(const field of ['workspaceId','projectId','clientId','serviceEngagementId','actorMembershipId','status','deliveredAt','revision','assigneeMembershipId','milestoneId','descriptionJson']){
    const r=await t.call(key,method,{body:{[field]:'forged'}});assert.equal(r.status,400,field);
  }assert.deepEqual(t.snapshot(),before);
});
test('real Client HTTP DTO has exact allowlists and refuses internal reads and coordination',async()=>{
  const t=await http();const r=await t.call('portal','GET',{user:'james'});assert.equal(r.status,200);
  const dto=await r.json();assert.deepEqual(Object.keys(dto).sort(),['items']);assert.deepEqual(Object.keys(dto.items[0]).sort(),['deliveredAt','id','label','statusLabel','targetDate']);assert.equal(dto.items[0].label,'Your website');
  for(const[key,method]of[['list','GET'],['list','POST'],['item','GET'],['item','PATCH'],['status','POST']])assert.equal((await t.call(key,method,{user:'james'})).status,404);
  assert.equal((await t.call('portal','GET')).status,404);
});
test('cross-Client/workspace/Project, hidden and guessed IDs have identical 404 bodies',async()=>{
  const t=await http(),sibling=(await t.create({visibility:'client'})).projectId,hidden=(await t.add({visibility:'restricted'})).deliverableId;
  const foreignProject=(await t.create({visibility:'client'},{clientId:'foreign-client',actor:await t.actor('foreign')})).projectId;
  const answers=[];
  for(const[user,params]of [['lawrence',{}],['foreign',{}],['james',{id:sibling}],['james',{id:foreignProject}],['james',{deliverableId:hidden}],['james',{deliverableId:'missing'}],['james',{id:'missing'}]]){
    const r=await t.call('portalItem','GET',{user,params});assert.equal(r.status,404);answers.push(await r.text());
  }assert.equal(new Set(answers).size,1);
  assert.equal((await t.call('item','GET',{params:{id:sibling}})).status,404);
  assert.equal((await t.call('item','PATCH',{params:{id:sibling},body:{title:'Bad',expectedRevision:1}})).status,404);
});
test('Team Project scope reads children but cannot create/edit/transition',async()=>{
  const t=await http();t.assign();assert.equal((await t.call('item','GET',{user:'sam'})).status,200);
  for(const[key,method]of[['list','POST'],['item','PATCH'],['status','POST']])assert.equal((await t.call(key,method,{user:'sam'})).status,403);
  run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");assert.equal((await t.call('item','GET',{user:'sam'})).status,404);
});
for(const change of ['membership','workspace','contact','parent','child'])test(`issued Client session loses access after ${change}`,async()=>{
  const t=await http();assert.equal((await t.call('portalItem','GET',{user:'james'})).status,200);
  const queries={membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",parent:`UPDATE projects SET visibility='internal' WHERE id='${t.projectId}'`,child:`UPDATE deliverables SET visibility='restricted' WHERE id='${t.deliverableId}'`};run(t.raw,queries[change]);
  const r=await t.call('portalItem','GET',{user:'james'});assert.equal(r.status,['membership','workspace'].includes(change)?403:404);assert.equal(r.headers.get('cache-control'),'no-store');
});
for(const op of ['create','edit','status'])test(`HTTP ${op} failure is sanitized and atomically rolled back`,async()=>{
  const t=await http(),second=await t.add(),before=t.snapshot();
  run(t.raw,"CREATE TRIGGER fail_http BEFORE INSERT ON activity_events WHEN NEW.subject_type='deliverable' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL INTERNAL_ID constraint'); END");
  const args={create:['list','POST',{body:{title:'New',requestId:crypto.randomUUID()}}],edit:['item','PATCH',{body:{title:'New',expectedRevision:1}}],status:['status','POST',{body:{toStatus:'in_progress',expectedRevision:1}}]}[op];
  const r=await t.call(...args);assert.equal(r.status,500);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/PRIVATE|SQL|INTERNAL|constraint|stack/);assert.deepEqual(t.snapshot(),before);
});
test('HTTP create and status response-loss retries do not duplicate facts or events',async()=>{
  const t=await http(),body={title:'Retryable',requestId:crypto.randomUUID()};
  const first=await t.call('list','POST',{body}),second=await t.call('list','POST',{body});assert.equal(first.status,201);assert.equal(second.status,201);assert.equal((await first.json()).deliverableId,(await second.json()).deliverableId);
  const status={toStatus:'in_progress',expectedRevision:1};assert.equal((await t.call('status','POST',{body:status})).status,200);assert.ok(await t.call('status','POST',{body:status}).then(r=>r.json()).then(r=>r.unchanged));
  assert.equal(t.history('DELIVERABLE_CREATED').length,2);assert.equal(t.history('DELIVERABLE_STATUS_CHANGED').length,1);
  assert.equal((await t.call('status','POST',{body:{toStatus:'cancelled',expectedRevision:1}})).status,409);
});
