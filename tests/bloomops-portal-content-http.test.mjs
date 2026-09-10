import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { APP_URL, run } from './_bloomops-db.mjs';
async function http() {
  const t=await setup({auth:true}),cookies={};
  t.call=async(kind='list',{user='james',id=t.contentId,query=''}={})=>{
    if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
    const route=await import(`../app/api/bloomops/portal/content/${kind==='detail'?'[contentId]/':''}route.js`);
    return route.GET(new Request(`${APP_URL}/api/bloomops/portal/content${kind==='detail'?`/${id}`:''}${query}`,{headers:user?{cookie:cookies[user]}:{}}),{params:Promise.resolve({contentId:id})});
  };return t;
}
for(const kind of ['list','detail'])test(`${kind}: real sessions, roles, no-store and auth-before-input`,async()=>{
  const t=await http();
  for(const [options,status] of [[{user:null,query:'?unknown=x'},401],[{user:'ellen'},kind==='detail'?404:403],[{user:'sam'},kind==='detail'?404:403],[{query:'?unknown=x'},400],[{query:'?page=1&page=2'},400]]){
    const r=await t.call(kind,options);assert.equal(r.status,status);assert.match(r.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await r.text(),/PRIVATE|SQL|stack/);
  }
  const r=await t.call(kind);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);
});
test('direct hidden, cross-client and missing Content have indistinguishable 404s before query validation',async()=>{
  const t=await http(),hidden=(await t.add({title:'PRIVATE_TITLE',visibility:'restricted'})).contentId,other=(await t.add({visibility:'client'},{clientId:'lawrence'})).contentId;
  let expected;for(const id of [hidden,other,'does-not-exist']){
    const r=await t.call('detail',{id,query:'?unknown=1'});assert.equal(r.status,404);
    const body=await r.text();if(expected)assert.equal(body,expected);expected=body;
  }
});
for(const [kind,statement,status] of [
  ['contact',"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",404],
  ['visibility',"UPDATE content_items SET visibility='internal'",404],
  ['social',"UPDATE service_types SET department_id='systems' WHERE id='type-social'",404],
  ['membership',"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",403],
  ['workspace',"UPDATE workspaces SET status='suspended' WHERE id='a'",403],
  ['role',"UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",403],
])test(`issued session ${kind} revocation removes general Content access`,async()=>{
  const t=await http();assert.equal((await t.call('detail')).status,200);run(t.raw,statement);
  assert.equal((await t.call('detail')).status,kind==='role'?404:status);const list=await t.call();
  if(status===404){assert.equal(list.status,200);assert.deepEqual((await list.json()).items,[]);}else assert.equal(list.status,403);
});
test('late detail revocation and D1 errors produce safe no-store results without writes',async()=>{
  const t=await http();assert.equal((await t.call('detail')).status,200);
  const original=t.d1.batch.bind(t.d1);t.d1.batch=async statements=>{run(t.raw,"UPDATE content_items SET visibility='internal'");return original(statements);};
  assert.equal((await t.call('detail')).status,404);
  run(t.raw,"UPDATE content_items SET visibility='client'");t.d1.batch=async()=>{throw new Error('PRIVATE SQL stack');};
  const before=t.snapshot(),r=await t.call('detail');assert.equal(r.status,500);assert.match(r.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await r.text(),/PRIVATE|SQL|stack/);assert.deepEqual(t.snapshot(),before);
});
