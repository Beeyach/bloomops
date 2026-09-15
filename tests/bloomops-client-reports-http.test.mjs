import './_jsx.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {APP_URL,run} from './_bloomops-db.mjs';
import {input} from './_client-report-fixture.mjs';
import {saveClientReport} from '../lib/bloomops/client-reports.mjs';
async function fixture(ctx){
 const t=await setup({auth:true});ctx.after(()=>t.raw.close());const created=await saveClientReport(t.db,t.owner,'james',null,input());assert.ok(created.ok);t.reportId=created.id;const cookies={};
 t.call=async(method='GET',{user='ellen',body=input(),id='james',reportId=t.reportId,list=false,origin=APP_URL,raw,query=''}={})=>{
 if(user&&!cookies[user])cookies[user]=(await t.signIn(user+'@example.com')).cookie;
 globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
 const route=await import(`../app/api/bloomops/clients/[id]/reports/${list?'':'[reportId]/'}route.js`);
 return route[method](new Request(APP_URL+'/api/bloomops/clients/'+id+'/reports'+(list?'':'/'+reportId)+query,{method,headers:{...(user?{cookie:cookies[user]}:{}),origin,'content-type':'application/json'},...(method==='GET'?{}:{body:raw??JSON.stringify(body)})}),{params:Promise.resolve({id,reportId})});};return t;
}
test('report HTTP: real client identities, foreign and unassigned actors cannot list, read or mutate guessed drafts',async ctx=>{
 const t=await fixture(ctx);
 for(const user of ['james','lawrence','foreign','sam'])for(const [method,list]of[['GET',false],['GET',true],['POST',true],['PUT',false]]){
 const r=await t.call(method,{user,list});assert.equal(r.status,404,user+' '+method+' '+list);assert.equal(r.headers.get('cache-control'),'no-store');assert.doesNotMatch(await r.text(),/Synthetic monthly report|Synthetic campaign/);}
});
test('report HTTP: identity, Origin, structured validation and error boundaries',async ctx=>{
 const t=await fixture(ctx);assert.equal((await t.call('GET',{user:null})).status,401);
 assert.equal((await t.call('PUT',{origin:'https://foreign.invalid'})).status,403);
 for(const raw of ['{','null','[]','false'])assert.equal((await t.call('POST',{list:true,raw})).status,400);
 assert.equal((await t.call('GET',{query:'?userId=ellen'})).status,400);
 const valid=await t.call();assert.equal(valid.status,200);assert.equal(valid.headers.get('cache-control'),'no-store');assert.equal((await valid.json()).report.id,t.reportId);
 run(t.raw,"CREATE TRIGGER reject_report BEFORE UPDATE ON client_report_drafts BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL'); END");
 const failed=await t.call('PUT',{body:input({expectedRevision:1})});assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/PRIVATE_SQL|constraint|stack/);
});
test('report HTTP: assigned Team is read-only; issued session loses access on actual revocation',async ctx=>{
 const t=await fixture(ctx);t.assign('client','sam','james');const r=await t.call('GET',{user:'sam'});assert.equal(r.status,200);assert.equal((await r.json()).report.canEdit,false);
 assert.equal((await t.call('PUT',{user:'sam',body:input({userId:'sam',expectedRevision:1})})).status,404);
 run(t.raw,"DELETE FROM client_assignments WHERE membership_id='m-sam'");assert.equal((await t.call('GET',{user:'sam'})).status,404);
 assert.equal((await t.call()).status,200);run(t.raw,"UPDATE workspace_memberships SET role='client' WHERE id='m-ellen'");assert.equal((await t.call()).status,404);
});
