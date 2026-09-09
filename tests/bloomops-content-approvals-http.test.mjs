import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-approvals.mjs';
import { APP_URL,run } from './_bloomops-db.mjs';
const paths={request:'content/[contentId]/approvals',withdraw:'approvals/[roundId]/withdraw',portal:'portal/approvals/[roundId]'};
async function http() {
  const t=await setup({auth:true}),cookies={};t.roundId=(await t.request()).roundId;
  t.beforeCommit=callback=>{const batch=t.d1.batch.bind(t.d1);let armed=true;t.d1.batch=async statements=>{if(armed){armed=false;callback();}return batch(statements);};};
  t.call=async(key,method='POST',{user=key==='portal'?'james':'ellen',body=key==='request'?{requestId:crypto.randomUUID(),expectedRevision:2}:key==='withdraw'?{expectedRevision:2}:{decision:'approved'},raw,params={},query='',origin=APP_URL}={})=>{
    if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
    const route=await import(`../app/api/bloomops/${paths[key]}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${paths[key]}${query}`,{method,headers:{...user?{cookie:cookies[user]}:{},origin,'content-type':'application/json'},...method==='GET'?{}:{body:raw??JSON.stringify(body)}}),{params:Promise.resolve({contentId:t.contentId,roundId:t.roundId,...params})});
  };return t;
}
for(const [key,method] of [['request','POST'],['withdraw','POST'],['portal','GET'],['portal','POST']])test(`${key} ${method} checks real session, Origin and scoped parent before exact input`,async()=>{
  const t=await http(),before=t.snapshot();
  for(const [options,status] of [[{user:null},401],[{user:'foreign',raw:'{',params:{contentId:'hidden',roundId:'hidden'}},404],[{query:'?unknown=1'},400],[{query:'?x=1&x=2'},400],...method==='POST'?[[{origin:'https://evil.example'},403]]:[]]){const response=await t.call(key,method,options);assert.equal(response.status,status);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await response.text(),/SQL|stack|PRIVATE/);}
  assert.deepEqual(t.snapshot(),before);
});
for(const key of ['request','withdraw','portal'])test(`${key} rejects malformed JSON and forged authority without writes`,async()=>{
  const t=await http(),before=t.snapshot();
  for(const raw of ['{','null','[]','false','1','"string"'])assert.equal((await t.call(key,'POST',{raw})).status,400);
  const valid=key==='request'?{requestId:crypto.randomUUID(),expectedRevision:2}:key==='withdraw'?{expectedRevision:2}:{decision:'approved'};
  for(const field of ['workspaceId','clientId','contentId','revisionId','snapshot','requestedBy','respondedBy','status','objectKey','fileIds'])assert.equal((await t.call(key,'POST',{body:{...valid,[field]:'forged'}})).status,400,field);
  assert.deepEqual(t.snapshot(),before);
});
test('actual request/response HTTP path has exact safe DTO, one feedback transition and response-loss acknowledgement',async()=>{
  const t=await http();assert.equal((await t.call('withdraw')).status,200);
  const created=await t.call('request','POST',{body:{requestId:crypto.randomUUID(),expectedRevision:3}});assert.equal(created.status,201);t.roundId=(await created.json()).roundId;
  const response=await t.call('portal','GET'),{item}=await response.json();assert.equal(response.status,200);assert.deepEqual(Object.keys(item).sort(),['id','number','requestedAt','snapshot']);assert.doesNotMatch(JSON.stringify(item),/PRIVATE|owner|workspace|revision|visibility|objectKey|activity/);
  const body={decision:'changes_requested',feedback:'Please simplify the opening.'};assert.equal((await t.call('portal','POST',{body})).status,200);const before=t.snapshot();
  assert.equal((await (await t.call('portal','POST',{body})).json()).unchanged,true);assert.deepEqual(t.snapshot(),before);assert.equal((await t.call('portal','GET')).status,404);
  assert.equal((await t.item(t.contentId)).stage,'revision_requested');assert.equal((await t.item(t.contentId)).stageContext,body.feedback);
});
for(const [kind,statement] of Object.entries({membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",visibility:"UPDATE content_items SET visibility='internal'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",service:"UPDATE service_types SET department_id='systems' WHERE id='type-social'"}))test(`issued Client session: ${kind} revocation at response commit never succeeds`,async()=>{
  const t=await http();assert.equal((await t.call('portal','GET')).status,200);t.beforeCommit(()=>run(t.raw,statement));const response=await t.call('portal');assert.ok([404,409].includes(response.status));assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await t.rounds()).items[0]?.status||'requested','requested');
});
for(const [kind,statement] of Object.entries({membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'",role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'",visibility:"UPDATE content_items SET visibility='restricted'",service:"UPDATE departments SET slug='not-social' WHERE id='social'"}))test(`issued coordinator session: ${kind} revocation fences request`,async()=>{
  const t=await http();await t.call('withdraw');assert.equal((await t.call('request','POST',{user:'pm',body:{}})).status,400);t.beforeCommit(()=>run(t.raw,statement));const response=await t.call('request','POST',{user:'pm',body:{requestId:crypto.randomUUID(),expectedRevision:3}});assert.ok([404,409].includes(response.status));
});
test('late D1 exception is a sanitized 500 with an entirely unmodified round, Content and history',async()=>{
  const t=await http(),before=t.snapshot();run(t.raw,"CREATE TRIGGER fail BEFORE UPDATE ON content_items BEGIN SELECT RAISE(ABORT,'PRIVATE SQL database stack'); END");const response=await t.call('portal');assert.equal(response.status,500);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await response.text(),/PRIVATE|SQL|database|stack/);assert.deepEqual(t.snapshot(),before);
});
