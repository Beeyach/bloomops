import './_jsx.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {APP_URL,run} from './_bloomops-db.mjs';
import {createWorkspacePage,saveWorkspacePage} from '../lib/bloomops/pages.mjs';
test('template API uses genuine authentication, scope, origin, safe preview and current Page authority',async()=>{
 const t=await setup({auth:true}),cookies={};try{
 const pageId=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()})).id;await saveWorkspacePage(t.db,t.owner,pageId,{workspaceId:'a',expectedRevision:1,title:'Synthetic reusable guide',body:'<p>Safe writing</p><script>window.unsafe=true</script>'});
 const source=await import('../app/api/bloomops/pages/[id]/template/route.js'),preview=await import('../app/api/bloomops/page-templates/[versionId]/route.js'),create=await import('../app/api/bloomops/page-templates/create/route.js');
 const call=async(route,method,{user='ellen',body={},origin=APP_URL,params={id:pageId},query=''}={})=>{if(user&&!cookies[user])cookies[user]=(await t.signIn(user+'@example.com')).cookie;globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};return route[method](new Request(APP_URL+'/api/bloomops/page-templates'+query,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve(params)});};
 assert.equal((await call(source,'GET',{user:null})).status,401);assert.equal((await call(source,'POST',{origin:'https://foreign.invalid'})).status,403);
 const body={workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),expectedRevision:0,expectedPageRevision:2};const response=await call(source,'POST',{body});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const captured=await response.json();assert.deepEqual(captured.scope,{workspaceId:'a',userId:'ellen'});
 const params={versionId:captured.id};const shown=await call(preview,'GET',{params});assert.equal(shown.status,200);const safe=await shown.json();assert.ok(safe.template.body.includes('Safe writing'));assert.ok(!safe.template.body.includes('<script'));
 const input={workspaceId:'a',userId:'ellen',requestId:crypto.randomUUID(),versionId:captured.id};assert.equal((await call(create,'POST',{body:input})).status,201);
 for(const user of ['james','sam','foreign']){assert.equal((await call(source,'GET',{user})).status,user==='foreign'?404:403);assert.equal((await call(preview,'GET',{user,params})).status,user==='foreign'?404:403);assert.equal((await call(create,'POST',{user,body:{...input,userId:user}})).status,user==='foreign'?404:403);}
 assert.equal((await call(source,'POST',{body:{...body,userId:'ary'}})).status,404);assert.equal((await call(source,'GET',{query:'?unexpected=true'})).status,400);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal((await call(preview,'GET',{params})).status,403);assert.equal((await call(create,'POST',{body:input})).status,403);
 }finally{t.raw.close();}
});
