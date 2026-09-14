import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectGoogleDeliveryReport as inspect} from '../lib/bloomops/prospect-delivery-report-provider.mjs';
import {associateGoogleDeliveryReport} from '../lib/bloomops/prospect-delivery-report.mjs';
import {fixture} from './_prospect-delivery-report-fixture.mjs';
const fail=result=>{
 assert.equal(result.status,'unresolved');assert.equal(result.authenticity,'unverified');
 assert.equal(result.hold,true);assert.equal(result.proposal,null);
 assert.ok(!JSON.stringify(result).match(/PRIVATE|@|synthetic-token|raw|snippet/i));
};
test('one fixed exact-message GET returns only the existing safe held proposal',async()=>{
 const {context,message}=fixture(),before=structuredClone(context);let calls=0;
 const result=await inspect('synthetic-token',context,{fetcher:async(url,options)=>{
  calls++;const parsed=new URL(url);
  assert.equal(parsed.origin,'https://gmail.googleapis.com');assert.equal(parsed.pathname,'/gmail/v1/users/me/messages/dsn-1');
  assert.deepEqual([...parsed.searchParams],[['format','full'],['fields','id,threadId,labelIds,internalDate,payload']]);
  assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.equal(options.body,undefined);
  assert.deepEqual(options.headers,{authorization:'Bearer synthetic-token'});assert.ok(options.signal instanceof AbortSignal);
  return Response.json({...message,snippet:'PRIVATE_SNIPPET',raw:'PRIVATE_RAW'});
 }});
 assert.equal(calls,1);assert.deepEqual(result,associateGoogleDeliveryReport(message,context));assert.deepEqual(context,before);
 assert.ok(!JSON.stringify(result).match(/PRIVATE|@|synthetic-token/i));
});
test('invalid token or saved candidate/registry context never contacts the provider',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 for(const token of [undefined,null,'','with space','line\nbreak','x'.repeat(16385),'nonasciié',123])fail(await inspect(token,fixture().context,{fetcher}));
 for(const mutate of [c=>delete c.candidate,c=>c.candidate.workspaceId='foreign',c=>c.candidate.accountEmail='foreign@example.test',
  c=>c.candidate.providerMessageId='../escape',c=>c.candidate.providerThreadId='',c=>c.candidate.kind='reply_unreviewed',
  c=>c.candidate.receivedAt='invalid',c=>c.candidate.receivedAt='2026-09-13',c=>c.candidate.receivedAt=123,
  c=>c.candidate.providerMessageId=c.deliveries[0].identity.providerMessageId,c=>c.deliveries=[],
  c=>c.deliveries[0].identity.workspaceId='foreign',c=>c.deliveries[0].identity.accountEmail='foreign@example.test',
  c=>c.deliveries[0].receipt.state='failed',c=>c.deliveries.push(structuredClone(c.deliveries[0]))]){
  const {context}=fixture();mutate(context);fail(await inspect('synthetic-token',context,{fetcher}));
 }
 assert.equal(calls,0);
});
test('in-flight mutation cannot change saved candidate or immutable delivery association',async()=>{
 const {context,message}=fixture();
 const result=await inspect('synthetic-token',context,{fetcher:async()=>{
  context.candidate.providerMessageId='changed';context.candidate.receivedAt='changed';context.deliveries[0].snapshot.draft.recipient='changed@example.test';
  return Response.json(message);
 }});
 assert.equal(result.status,'associated');assert.equal(result.proposal.providerMessageId,'dsn-1');
});
for(const status of [204,206,301,302,303,307,308,401,403,404,429,500,503])test('HTTP '+status+' fails closed without retry or error-body disclosure',async()=>{
 let calls=0,cancelled=false;
 fail(await inspect('synthetic-token',fixture().context,{fetcher:async()=>{
  calls++;return new Response(status===204?null:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('PRIVATE_PROVIDER_ERROR'));},cancel(){cancelled=true;}}),{status,headers:{location:'https://foreign.example.test'}});
 }}));
 assert.equal(calls,1);if(status!==204)assert.equal(cancelled,true);
});
for(const [name,body] of [['malformed JSON','{'],['null JSON','null'],['incomplete message','{}'],['array JSON','[]'],['oversized JSON',' '.repeat(256*1024+1)],['invalid UTF8',new Uint8Array([0xff])]])test(name+' produces no evidence',async()=>{
 let calls=0;fail(await inspect('synthetic-token',fixture().context,{fetcher:async()=>{calls++;return new Response(body);}}));assert.equal(calls,1);
});
test('transport and partial stream failures discard content and do not retry',async()=>{
 for(const fetcher of [async()=>{throw Error('PRIVATE_TRANSPORT');},async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"PRIVATE":'));c.error(Error('PRIVATE_STREAM'));}}))]){
  let calls=0;fail(await inspect('synthetic-token',fixture().context,{fetcher:async(...args)=>{calls++;return fetcher(...args);}}));assert.equal(calls,1);
 }
});
test('response budget counts streamed UTF8 bytes including ignored provider properties',async()=>{
 const {context,message}=fixture(),json=JSON.stringify(message),limit=256*1024;
 const exact=json+' '.repeat(limit-new TextEncoder().encode(json).length);
 assert.equal((await inspect('synthetic-token',context,{fetcher:async()=>new Response(exact)})).status,'associated');
 let cancelled=false;
 const large=JSON.stringify({...message,ignored:'é'.repeat(128*1024)});assert.ok(large.length<limit);
 fail(await inspect('synthetic-token',context,{fetcher:async()=>new Response(new ReadableStream({start(c){
  const bytes=new TextEncoder().encode(large);for(let i=0;i<bytes.length;i+=1024)c.enqueue(bytes.slice(i,i+1024));
 },cancel(){cancelled=true;}}))}));assert.equal(cancelled,true);
});
test('wrong identity, missing MIME and external evidence stay unresolved with no attachment follow-up',async()=>{
 for(const mutate of [m=>m.id='different',m=>m.threadId='different',m=>m.internalDate='1',m=>delete m.payload,
  m=>delete m.payload.parts[1].body.data,m=>m.payload.parts[1].body.attachmentId='external-id',m=>m.payload.parts[2].body.attachmentId='external-id']){
  const {context,message}=fixture();mutate(message);let calls=0;
  fail(await inspect('synthetic-token',context,{fetcher:async()=>{calls++;return Response.json(message);}}));assert.equal(calls,1);
 }
});
