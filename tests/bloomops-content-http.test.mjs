import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content.mjs';
import { APP_URL, run } from './_bloomops-db.mjs';
const paths={list:'content',item:'content/[contentId]',client:'clients/[id]/content',service:'clients/[id]/services/[serviceId]/content'};
async function http(){
 const t=await setup({auth:true});t.contentId=(await t.add()).contentId;const cookies={};
 t.call=async(key,method='GET',{user='ellen',body={},raw,params={},query='',origin=APP_URL}={})=>{
  if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
  globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
  const route=await import(`../app/api/bloomops/${paths[key]}/route.js`);
  return route[method](new Request(`${APP_URL}/api/bloomops/${paths[key]}${query}`,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...method==='GET'?{}:{body:raw??JSON.stringify(body)}}),{params:Promise.resolve({id:'james',serviceId:'social-service',contentId:t.contentId,...params})});
 };return t;
}
const endpoints=[['list','GET'],['item','GET'],['item','PATCH'],['client','POST'],['service','POST']];
for(const[key,method]of endpoints)test(`${key} ${method} real identity, no-store, Origin and auth-before-validation`,async()=>{
 const t=await http();for(const query of['','?unknown=yes']){const r=await t.call(key,method,{user:null,query,raw:'null'});assert.equal(r.status,401);assert.equal(r.headers.get('cache-control'),'no-store');}
 if(method!=='GET')assert.equal((await t.call(key,method,{origin:'https://evil.example'})).status,403);
 const client=await t.call(key,method,{user:'james',query:'?forged=true',raw:'null'});assert.equal(client.status,key==='list'?403:404);
});
for(const[key,method]of endpoints)test(`${key} ${method} exact query keys and duplicate values`,async()=>{
 const t=await http(),before=t.snapshot();for(const query of['?unknown=true','?workspaceId=b',...(key==='list'?['?type=reel&type=video','?page=1&page=2','?type=no','?page=0']:['?type=reel'])]){const r=await t.call(key,method,{query});assert.equal(r.status,400,query);assert.equal(r.headers.get('cache-control'),'no-store');}assert.deepEqual(t.snapshot(),before);
});
for(const key of['client','service','item'])test(`${key} exact JSON vocabulary rejects all malformed/non-object/forged inputs atomically`,async()=>{
 const t=await http(),before=t.snapshot(),method=key==='item'?'PATCH':'POST';
 for(const raw of['{','null','[]','42','false','"hello"'])assert.equal((await t.call(key,method,{raw})).status,400);
 for(const field of['workspaceId','clientId','serviceEngagementId','stage','publishedAt','revision','platforms','actorMembershipId','recording_required']){const r=await t.call(key,method,{body:{title:'Partial mutation',type:'reel',requestId:crypto.randomUUID(),[field]:'forged'}});assert.equal(r.status,400,field);assert.doesNotMatch(await r.text(),/SQL|stack|constraint/);}
 assert.deepEqual(t.snapshot(),before);
});
test('Team Service assignment authorizes exact service create/read/edit, never Client-level/sibling',async()=>{
 const t=await http();t.assign('sam','social-service');const body={title:'Assigned work',type:'reel',requestId:crypto.randomUUID()};
 const created=await t.call('service','POST',{user:'sam',body});assert.equal(created.status,201);const {contentId}=await created.json();
 assert.equal((await t.call('item','GET',{user:'sam',params:{contentId}})).status,200);
 assert.equal((await t.call('item','PATCH',{user:'sam',params:{contentId},body:{caption:'Team editorial',expectedRevision:1}})).status,200);
 assert.equal((await t.call('client','POST',{user:'sam',body})).status,404);
 for(const params of[{serviceId:'ghl-service'},{serviceId:'foreign-service'},{id:'lawrence'},{serviceId:'guessed'}])assert.equal((await t.call('service','POST',{user:'sam',params,raw:'null',query:'?forged=1'})).status,404);
});
for(const change of['assignment','membership','role','workspace'])test(`issued Team session loses Content immediately after ${change}`,async()=>{
 const t=await http();t.assign();assert.equal((await t.call('item','GET',{user:'sam'})).status,200);
 run(t.raw,{assignment:"DELETE FROM client_assignments WHERE membership_id='m-sam'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",role:"UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'"}[change]);
 const r=await t.call('item','PATCH',{user:'sam',body:{title:'Revoked',expectedRevision:1}});assert.equal(r.status,['membership','workspace'].includes(change)?403:404);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('hidden, foreign and guessed item IDs produce identical safe 404',async()=>{
 const t=await http(),hidden=(await t.add({visibility:'restricted'})).contentId,answers=[];
 for(const[user,contentId]of[['other',t.contentId],['pm',hidden],['foreign',t.contentId],['ellen','missing']]){const r=await t.call('item','GET',{user,params:{contentId},query:'?forged=1'});assert.equal(r.status,404);answers.push(await r.text());}assert.equal(new Set(answers).size,1);
});
for(const key of['client','item'])test(`${key} late failure returns sanitized 500 and rolls back`,async()=>{
 const t=await http(),before=t.snapshot();run(t.raw,"CREATE TRIGGER fail_c1 BEFORE INSERT ON activity_events WHEN NEW.subject_type='content' BEGIN SELECT RAISE(ABORT,'PRIVATE SQL constraint'); END");
 const r=await t.call(key,key==='item'?'PATCH':'POST',{body:key==='item'?{title:'Edited',expectedRevision:1}:{title:'Created',type:'reel',requestId:crypto.randomUUID()}});assert.equal(r.status,500);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/PRIVATE|SQL|constraint|stack/);assert.deepEqual(t.snapshot(),before);
});
test('HTTP retry survives edits; incompatible reuse and competing edits conflict',async()=>{
 const t=await http(),body={title:'Initial',type:'reel',requestId:crypto.randomUUID()};const first=await t.call('client','POST',{body});assert.equal(first.status,201);const {contentId}=await first.json();
 const results=await Promise.all(['One','Two'].map(title=>t.call('item','PATCH',{params:{contentId},body:{title,expectedRevision:1}})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const retry=await t.call('client','POST',{body});assert.equal(retry.status,201);assert.equal((await retry.json()).contentId,contentId);assert.equal((await t.call('client','POST',{body:{...body,title:'Incompatible'}})).status,409);
 const item=await t.call('item').then(r=>r.json());assert.equal(item.item.stage,'idea');assert.equal(item.item.publishedAt,null);assert.equal('creationRequestId' in item.item,false);assert.equal('workspaceId' in item.item,false);
});
