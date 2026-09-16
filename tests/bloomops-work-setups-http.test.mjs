import './_jsx.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_projects.mjs';
import {APP_URL,run,one} from './_bloomops-db.mjs';
import {setupInput} from './_work-setup-fixture.mjs';
async function fixture(){const t=await setup({auth:true}),cookies={};t.call=async(path='',method='GET',{user='ellen',body={},id,origin=APP_URL,raw}={})=>{
 if(user&&!cookies[user])cookies[user]=(await t.signIn(`${user}@example.com`)).cookie;
 globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
 const route=await import(`../app/api/bloomops/work-setups${path}/route.js`);
 return route[method](new Request(`${APP_URL}/api/bloomops/work-setups${path}`,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...method==='GET'?{}:{body:raw??JSON.stringify(body)}}),{params:Promise.resolve({id})});};return t;}
test('setup HTTP requires real identity, current scope and same-origin writes',async()=>{
 const t=await fixture();try{for(const [path,method] of [['','GET'],['','POST'],['/[id]','GET'],['/[id]','PATCH'],['/preview','POST'],['/generate','POST']]){const anonymous=await t.call(path,method,{user:null});assert.equal(anonymous.status,401);assert.equal(anonymous.headers.get('cache-control'),'no-store');if(method!=='GET')assert.equal((await t.call(path,method,{origin:'https://foreign.example'})).status,403);}
 const created=await (await t.call('','POST',{body:setupInput()})).json();assert.ok(created.ok);for(const user of ['james','sam','foreign']){const r=await t.call('/[id]','GET',{id:created.id,user});assert.equal(r.status,404);assert.equal((await t.call('','POST',{user,body:setupInput({userId:user})})).status,404);}
 assert.equal((await t.call('','POST',{body:setupInput({workspaceId:'b'})})).status,404);assert.equal((await t.call('','POST',{raw:'[]'})).status,400);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal((await t.call('/[id]','GET',{id:created.id})).status,403);
 }finally{t.raw.close();}
});
test('HTTP saved setup to preview to canonical Project persists once and does not trust browser authority',async()=>{
 const t=await fixture();try{const created=await (await t.call('','POST',{body:setupInput()})).json(),selection={workspaceId:'a',userId:'ellen',templateId:created.id,versionId:created.versionId,expectedRevision:1,clientId:'james',serviceEngagementId:'social-service',eventName:'Synthetic event',eventDate:'2026-12-31'};
 const previewResponse=await t.call('/preview','POST',{body:selection});assert.equal(previewResponse.status,200);const preview=await previewResponse.json();assert.deepEqual(preview.scope,{workspaceId:'a',userId:'ellen'});assert.equal(preview.plan.actions[0].dueDate,'2026-12-17');assert.equal(one(t.raw,'SELECT count(*) n FROM projects').n,0);
 const command={...selection,requestId:crypto.randomUUID(),planHash:preview.planHash};const generated=await (await t.call('/generate','POST',{body:command})).json();assert.ok(generated.ok);assert.equal((await (await t.call('/generate','POST',{body:command})).json()).projectId,generated.projectId);assert.equal(one(t.raw,'SELECT count(*) n FROM projects').n,1);
 assert.equal((await t.call('/generate','POST',{body:{...command,eventName:'Changed'}})).status,409);assert.equal((await t.call('/generate','POST',{body:{...command,actorMembershipId:'m-foreign'}})).status,400);
 assert.equal((await t.call('/preview','POST',{user:'james',body:{...selection,userId:'james'}})).status,404);
 }finally{t.raw.close();}
});
