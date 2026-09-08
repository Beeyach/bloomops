import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content.mjs';
import { APP_URL, run } from './_bloomops-db.mjs';
async function http(){
 const t=await setup({auth:true});t.contentId=(await t.add()).contentId;const cookies={};
 t.call=async(key,method='GET',{user='ellen',body={},raw,params={},query='',origin=APP_URL}={})=>{
  if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
  globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
  const route=await import(`../app/api/bloomops/${'content/[contentId]/transition'}/route.js`);
  return route[method](new Request(`${APP_URL}/api/bloomops/${'content/[contentId]/transition'}${query}`,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...method==='GET'?{}:{body:raw??JSON.stringify(body)}}),{params:Promise.resolve({id:'james',serviceId:'social-service',contentId:t.contentId,...params})});
 };return t;
}

test('transition real-session identity/Origin/no-store precede malformed body/query validation',async()=>{
 const t=await http();for(const [user,status]of [[null,401],['james',404],['foreign',404],['other',404]]){const r=await t.call('transition','POST',{user,raw:'null',query:'?forged=1'});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.equal((await t.call('transition','POST',{origin:'https://evil.example'})).status,403);
});
test('transition exact query/body keys and malformed inputs return safe 400 atomically',async()=>{
 const t=await http(),before=t.snapshot();for(const raw of ['{','null','[]','true','1','"text"'])assert.equal((await t.call('transition','POST',{raw})).status,400);
 for(const key of ['stage','publishedAt','stageContext','workspaceId','actorMembershipId','requestId','revision']){const r=await t.call('transition','POST',{body:{targetStage:'script',expectedRevision:1,[key]:'forged'}});assert.equal(r.status,400);assert.doesNotMatch(await r.text(),/SQL|stack|constraint/);}
 for(const query of ['?stage=script','?expectedRevision=1','?stage=a&stage=b'])assert.equal((await t.call('transition','POST',{query})).status,400);assert.deepEqual(t.snapshot(),before);
});
test('transition real HTTP CAS/retry and ordinary-edit authority remain strict',async()=>{
 const t=await http(),body={targetStage:'script',expectedRevision:1};const first=await t.call('transition','POST',{body});assert.equal(first.status,200);assert.equal(first.headers.get('cache-control'),'no-store');const retry=await t.call('transition','POST',{body});assert.equal(retry.status,200);assert.equal((await retry.json()).unchanged,true);assert.equal((await t.call('transition','POST',{body:{...body,targetStage:'editing'}})).status,409);assert.equal(t.history().length,2);
});
for(const change of ['assignment','membership','role','workspace','visibility'])test(`issued session loses transition after ${change}`,async()=>{
 const t=await http();t.assign();const user=change==='visibility'?'pm':'sam';assert.equal((await t.call('transition','POST',{user,body:{targetStage:'script',expectedRevision:1}})).status,200);
 run(t.raw,{assignment:"DELETE FROM client_assignments WHERE membership_id='m-sam'",membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",role:"UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",visibility:"UPDATE content_items SET visibility='restricted'"}[change]);
 const before=t.snapshot(),r=await t.call('transition','POST',{user,body:{targetStage:'editing',expectedRevision:2}});assert.equal(r.status,['membership','workspace'].includes(change)?403:404);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(t.snapshot(),before);
});
for(const fault of ['activity','fact'])test(`transition ${fault} failure is sanitized 500 and rolls back`,async()=>{
 const t=await http(),before=t.snapshot();run(t.raw,`CREATE TRIGGER fail_c2 BEFORE ${fault==='activity'?'INSERT ON activity_events':'UPDATE ON content_items'} BEGIN SELECT RAISE(ABORT,'PRIVATE SQL constraint'); END`);const r=await t.call('transition','POST',{body:{targetStage:'script',expectedRevision:1}});assert.equal(r.status,500);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/PRIVATE|SQL|constraint|stack/);assert.deepEqual(t.snapshot(),before);
});
