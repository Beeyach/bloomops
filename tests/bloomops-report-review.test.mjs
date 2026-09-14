import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schema} from '../lib/bloomops/db.mjs';
import {reportCheckFixture} from './_prospect-report-check-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {getProspectReportReview,reviewProspectReport} from '../lib/bloomops/prospect-report-review.mjs';
const view=t=>getProspectReportReview(t.db,t.actor,t.env);
const command=data=>({workspaceId:data.workspaceId,selection:data.items[0]?.selection,expectedRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true});
test('read-only current-account DTO uses opaque selection and excludes correspondence/provenance',async c=>{
 const t=await reportCheckFixture(c),before=all(t.raw,'SELECT * FROM activity_events'),data=await view(t);
 assert.equal(data.items.length,1);assert.equal(data.items[0].canCheck,true);assert.match(data.items[0].selection,/^[a-f0-9]{64}$/);assert.equal(data.items[0].prospect,null);
 assert.equal(data.items[0].status,'pending');assert.equal(data.held,true);assert.equal(data.authenticity,'unverified');assert.equal((await view(t)).items[0].selection,data.items[0].selection);
 assert.ok(!JSON.stringify(data).match(/dsn-1|new-thread|runId|providerMessageId|synthetic|PRIVATE|rfcMessageId|tokenBox|snapshotJson|inbox@/));assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),before);
});
test('server resolves a reviewed selection and renders only safe association facts',async c=>{
 const t=await reportCheckFixture(c),data=await view(t);let calls=0;
 const result=await reviewProspectReport(t.db,t.actor,t.env,t.session,command(data),{fetcher:async()=>{calls++;return Response.json(t.reportMessage);}});
 assert.equal(result.status,'associated');assert.equal(calls,1);const next=await view(t),row=next.items[0];
 assert.equal(row.status,'associated');assert.equal(row.canCheck,false);assert.equal(row.reason,'complete');assert.equal(row.prospect.id,t.id);assert.equal(row.action,'failed');assert.equal(row.statusCode,'5.1.1');
});
test('disabled/unhealthy/empty and denied roles do not expose foreign reports',async c=>{
 const t=await reportCheckFixture(c);t.env.BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED='false';assert.equal((await view(t)).items[0].reason,'disabled');
 run(t.raw,"UPDATE prospect_google_connections SET check_status='temporary'");assert.equal((await view(t)).items[0].reason,'connection');
 for(const role of ['client','team_member','project_manager'])assert.equal(await getProspectReportReview(t.db,{...t.actor,role},t.env),null);
 assert.equal(await getProspectReportReview(t.db,{...t.actor,workspaceId:'foreign'},t.env),null);
 run(t.raw,'UPDATE prospect_google_connections SET active=0,revision=revision+1');const data=await view(t);assert.equal(data.accountEmail,null);assert.deepEqual(data.items,[]);assert.equal(data.reason,'connect');
});
test('strict revisions, selection, scope and acknowledgement never invoke the reader',async c=>{
 const t=await reportCheckFixture(c),input=command(await view(t));let calls=0;
 for(const patch of [{selection:'f'.repeat(64)},{selection:'dsn-1'},{workspaceId:'foreign'},{reviewed:false},{expectedRevision:999},{connectionRevision:999},{senderRevision:999},{accountEmail:'foreign@example.test'},{providerMessageId:'dsn-1'},{query:'anything'}]){
  assert.ok((await reviewProspectReport(t.db,t.actor,t.env,t.session,{...input,...patch},{fetcher:async()=>{calls++;return Response.json(t.reportMessage);}})).conflict);
 }assert.equal(calls,0);assert.equal(t.reportChecks().length,0);
});
test('busy/expired and unresolved outcomes retain truthful check availability',async c=>{
 const t=await reportCheckFixture(c);await t.reportCheck({fetcher:async()=>{const data=await view(t);assert.equal(data.items[0].reason,'busy');assert.equal(data.items[0].status,'checking');return new Response(null,{status:503});}});
 const unresolved=await view(t);assert.equal(unresolved.items[0].status,'unresolved');assert.equal(unresolved.items[0].reason,'cooldown');
});
for(const [name,mutation] of [
 ['member suspended',"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'"],
 ['account replaced',"UPDATE prospect_google_connections SET account_email='other@example.test',revision=revision+1"],
 ['sender changed','UPDATE prospect_senders SET revision=revision+1'],
])test('mid-read '+name+' discards the previous account results',async c=>{
 const t=await reportCheckFixture(c),select=t.db.select.bind(t.db);let changed=false;
 t.db.select=(...args)=>{const builder=select(...args),from=builder.from.bind(builder);builder.from=table=>{const query=from(table);if(table===schema.prospectRecoveryMessages){const limit=query.limit.bind(query);query.limit=async n=>{const rows=await limit(n);run(t.raw,mutation);changed=true;return rows;};}return query;};return builder;};
 assert.equal(await view(t),null);assert.equal(changed,true);
});
test('older collections cannot duplicate a message or make old selections authoritative',async c=>{
 const t=await reportCheckFixture(c),first=await view(t),old=t.env.BLOOMOPS_GOOGLE_REPORT_RUN_ID;
 // Restore a synthetic checking recovery snapshot to insert a newer collection
 // through the original recovery command; no real provider or record edits.
 const {recoverProspectMailbox}=await import('../lib/bloomops/prospect-mailbox.mjs');
 t.offset+=31000;await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{clock:t.clock,fetcher:async url=>{if(url.includes('/profile?'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(url.includes('/messages?'))return Response.json({messages:[{id:'dsn-1',threadId:'new-thread'}]});if(url.includes('/history?'))return Response.json({historyId:'101'});return Response.json({...t.reportMessage,payload:{headers:t.reportMessage.payload.headers}});}});
 const data=await view(t);assert.equal(data.items.length,1);assert.notEqual(data.items[0].selection,first.items[0].selection);assert.equal(data.items[0].reason,'disabled');assert.equal(t.env.BLOOMOPS_GOOGLE_REPORT_RUN_ID,old);
 assert.ok((await reviewProspectReport(t.db,t.actor,t.env,t.session,{...command(data),selection:first.items[0].selection})).conflict);
});

test('expired but unsettled mailbox lease still blocks report availability',async c=>{
 const t=await reportCheckFixture(c);run(t.raw,"UPDATE prospect_discovery_states SET check_id='expired',check_expires_at=?,check_status='checking',revision=revision+1",new Date(Date.now()-1000).toISOString());
 const data=await view(t);assert.equal(data.reason,'mailbox');assert.equal(data.items[0].canCheck,false);
});
test('distinct saved candidates are capped at50 with a truthful more flag',async c=>{
 const t=await reportCheckFixture(c),{recoverProspectMailbox}=await import('../lib/bloomops/prospect-mailbox.mjs');
 for(let batch=0;batch<2;batch++){
  t.offset+=31000;const messages=Array.from({length:30},(_,i)=>{const n=batch*30+i;return {...t.reportMessage,id:'many-'+n,threadId:'thread-'+n,internalDate:String(Number(t.reportMessage.internalDate)+n+1),payload:{headers:t.reportMessage.payload.headers.map(h=>h.name==='Message-ID'?{name:h.name,value:'<many-'+n+'@example.test>'}:h)}};});
  assert.ok((await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{clock:t.clock,fetcher:async url=>{
   const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(u.pathname.endsWith('/messages'))return Response.json({messages:messages.map(m=>({id:m.id,threadId:m.threadId}))});if(u.pathname.endsWith('/history'))return Response.json({historyId:'101'});return Response.json(messages.find(m=>u.pathname.endsWith('/'+m.id)));
  }})).checked);
 }
 const data=await view(t);assert.equal(data.items.length,50);assert.equal(data.more,true);assert.equal(new Set(data.items.map(x=>x.selection)).size,50);
});
