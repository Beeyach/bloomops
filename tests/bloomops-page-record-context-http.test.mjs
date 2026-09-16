import './_jsx.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {APP_URL,run} from './_bloomops-db.mjs';
import {createWorkspacePage} from '../lib/bloomops/pages.mjs';
test('context API requires genuine identity, scoped body, same origin and current Page authority',async()=>{
 const t=await setup({auth:true}),cookies={};try{
  const page=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()})).id;
  const route=await import('../app/api/bloomops/pages/[id]/context/route.js');
  const call=async(method,{user='ellen',id=page,query='',body={},origin=APP_URL}={})=>{if(user&&!cookies[user])cookies[user]=(await t.signIn(user+'@example.com')).cookie;globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};return route[method](new Request(APP_URL+'/api/bloomops/pages/'+id+'/context'+query,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({id})});};
  assert.equal((await call('GET',{user:null})).status,401);assert.equal((await call('PUT',{origin:'https://foreign.example'})).status,403);
  const payload={workspaceId:'a',userId:'ellen',expectedRevision:0,clientId:'james',projectId:null};assert.equal((await call('PUT',{body:payload})).status,200);
  const response=await call('GET');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.deepEqual(result.scope,{workspaceId:'a',userId:'ellen'});assert.equal(result.context.client.id,'james');
  for(const user of ['james','foreign','sam']){assert.equal((await call('GET',{user})).status,404);assert.equal((await call('PUT',{user,body:{...payload,userId:user}})).status,user==='foreign'?404:403);}
  assert.equal((await call('PUT',{body:{...payload,workspaceId:'b'}})).status,404);assert.equal((await call('PUT',{body:{...payload,userId:'ary'}})).status,404);
  assert.equal((await call('GET',{query:'?kind=client&kind=project'})).status,400);assert.equal((await call('GET',{query:'?search=secret'})).status,400);assert.equal((await call('GET',{query:'?kind=client'})).status,200);
  run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal((await call('GET')).status,403);assert.equal((await call('PUT',{body:payload})).status,403);
 }finally{t.raw.close();}
});
