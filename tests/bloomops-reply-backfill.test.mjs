import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectGoogleReplyBackfill} from '../lib/bloomops/prospect-reply-backfill.mjs';
import {collectGoogleReplyCandidates,matchGoogleReplyCandidates} from '../lib/bloomops/prospect-reply-discovery.mjs';
import {context,message,sent,delivery,time} from './_prospect-discovery-fixture.mjs';
const list=messages=>({messages:messages.map(m=>({id:m.id,threadId:m.threadId}))});
const invoke=(messages=[message()],options={})=>inspectGoogleReplyBackfill('synthetic-token',context,{fetcher:async url=>new URL(url).pathname.endsWith('/messages')?Response.json(list(messages)):Response.json(messages.find(m=>new URL(url).pathname.endsWith('/'+m.id))),...options});
const fail=(r,reason)=>{assert.equal(r.status,'unresolved');if(reason)assert.equal(r.reason,reason);assert.equal(r.hold,true);assert.equal(r.coverage,'unverified');assert.equal(r.nextHistoryId,null);assert.deepEqual(r.observations,[]);assert.deepEqual(r.unassigned,[]);};
test('backfill collects cross-thread replies but never claims coverage or proposes a cursor',async()=>{
 const r=await invoke();assert.equal(r.status,'collected');assert.equal(r.observations[0].deliveryId,context.deliveries[0].receipt.id);assert.equal(r.observations[0].providerThreadId,'separate-thread');assert.equal(r.enumerationComplete,true);assert.equal(r.historyCaughtUp,false);assert.equal(r.coverage,'unverified');assert.equal(r.hold,true);assert.equal(r.nextHistoryId,null);assert.equal(r.from,new Date(time-1000).toISOString());
});
test('unassigned evidence stays separate; history attribution remains strict',async()=>{
 const unknown=message('unknown',{'In-Reply-To':'<not-known@example.test>'});
 const r=await invoke([message(),unknown]);assert.equal(r.status,'collected');assert.equal(r.observations.length,1);assert.deepEqual(r.unassigned,[{providerMessageId:'unknown',providerThreadId:'separate-thread',receivedAt:new Date(time+1000).toISOString(),kind:'needs_review'}]);
 fail({...matchGoogleReplyCandidates([message(),unknown],context),coverage:'unverified',unassigned:[]},'unattributed_message');
});
test('mail with no references is unassigned without guessing from address or subject',async()=>{
 const m=message();m.payload.headers=m.payload.headers.filter(h=>h.name!=='In-Reply-To');m.payload.headers.push({name:'Subject',value:'Private business subject'});
 const r=await invoke([m]);assert.equal(r.unassigned.length,1);assert.equal(r.observations.length,0);assert.ok(!JSON.stringify(r).match(/someone@|Private business|Message-ID|In-Reply-To|synthetic-token/));
});
test('transitive reply ancestry works independently of listing order and through own sent mail',async()=>{
 const parent=message('parent',{}, {labelIds:['SENT']}),child=message('child',{'In-Reply-To':'<parent@example.test>'});
 const r=await invoke([child,parent,sent()]);assert.equal(r.observations.length,1);assert.equal(r.observations[0].providerMessageId,'child');assert.deepEqual(r.unassigned,[]);
});
test('ambiguity or malformed ancestry discards both assigned and unassigned proposals',async()=>{
 const ctx={...context,deliveries:[delivery(),delivery(2)]},both=message('both',{References:ctx.deliveries[1].identity.rfcMessageId});
 assert.equal(collectGoogleReplyCandidates([message('unknown',{'In-Reply-To':'<unknown@example.test>'}),both],ctx).reason,'ambiguous_ancestry');
 fail(await invoke([message(),message('bad',{'In-Reply-To':'broken'})]),'invalid_ancestry');
});
test('registered anchors are revalidated and duplicate RFC identities invalidate collection',async()=>{
 const wrong=sent();wrong.payload.headers.find(h=>h.name==='To').value='wrong@example.test';
 fail(await invoke([wrong]),'anchor_conflict');fail(await invoke([message(),message('duplicate',{'Message-ID':'<reply@example.test>'})]),'ambiguous_identity');
});
test('automatic and delivery-report matches stay unreviewed while drafts and SENT are excluded',async()=>{
 const r=await invoke([message('auto',{'Auto-Submitted':'auto-replied'}),message('dsn',{'Content-Type':'message/delivery-status'}),message('draft',{}, {labelIds:['DRAFT']}),sent()]);
 assert.deepEqual(r.observations.map(x=>x.kind),['automatic_response','delivery_report']);assert.deepEqual(r.unassigned,[]);
});
test('registry tenant/account/identity/time and token validation reject before transport',async()=>{
 let calls=0;const fetcher=async()=>{calls++;};
 for(const patch of [{workspaceId:'foreign'},{accountEmail:'foreign@example.test'},{deliveries:[]},{startHistoryId:'0'},{deliveries:Array(101).fill(delivery())}])fail(await inspectGoogleReplyBackfill('synthetic',{...context,...patch},{fetcher}),'invalid_context');
 for(const value of ['invalid','1970-01-01T00:00:00Z',new Date(Date.now()+60000).toISOString()]){const ctx=structuredClone(context);ctx.deliveries[0].receipt.attemptedAt=value;fail(await inspectGoogleReplyBackfill('synthetic',ctx,{fetcher}),'invalid_context');}
 for(const token of ['',null,'bad token','x'.repeat(16385)])fail(await inspectGoogleReplyBackfill(token,context,{fetcher}),'invalid_context');
 assert.equal(calls,0);
});
test('query uses earliest accepted epoch second with Spam and Trash and only approved fields',async()=>{
 const ctx={...context,deliveries:[delivery(),delivery(2)]};ctx.deliveries[1].receipt.attemptedAt=new Date(time-1234).toISOString();let calls=0;
 const r=await inspectGoogleReplyBackfill('synthetic',ctx,{fetcher:async(url,init)=>{calls++;const u=new URL(url);assert.equal(u.origin,'https://gmail.googleapis.com');assert.equal(u.pathname,'/gmail/v1/users/me/messages');assert.equal(u.searchParams.get('q'),'after:'+(Math.floor((time-1234)/1000)-1));assert.equal(u.searchParams.get('includeSpamTrash'),'true');assert.equal(u.searchParams.get('maxResults'),'40');assert.equal(u.searchParams.get('fields'),'messages(id,threadId),nextPageToken');assert.equal([...u.searchParams].length,4);assert.equal(init.method,'GET');assert.equal(init.redirect,'manual');assert.equal(init.body,undefined);return Response.json({});}});
 assert.equal(calls,1);assert.equal(r.status,'collected');assert.equal(r.coverage,'unverified');
});
test('stable pagination duplicates deduplicate without trusting size estimates',async()=>{
 let pages=0,gets=0;const m=message();
 const r=await invoke([m],{fetcher:async url=>{const u=new URL(url);if(u.pathname.endsWith('/messages')){pages++;if(pages===1)return Response.json({...list([m]),nextPageToken:'opaque +/=',resultSizeEstimate:0});assert.equal(u.searchParams.get('pageToken'),'opaque +/=');return Response.json(list(Array(101).fill(m)));}gets++;assert.equal(u.searchParams.get('format'),'metadata');assert.equal(u.searchParams.getAll('metadataHeaders').length,9);return Response.json(m);}});
 assert.equal(r.status,'collected');assert.equal(pages,2);assert.equal(gets,1);
});
for(const [name,pages,reason] of [
 ['cycle',[{nextPageToken:'a'},{nextPageToken:'a'}],'invalid_pagination'],
 ['blank token',[{nextPageToken:''}],'invalid_pagination'],
 ['unfinished',[{nextPageToken:'a'},{nextPageToken:'b'},{nextPageToken:'c'}],'incomplete_listing'],
 ['null list',[{messages:null}],'invalid_listing'],
 ['wrong shape',[[]],'invalid_listing'],
 ['conflicting ID',[{messages:[{id:'x',threadId:'a'},{id:'x',threadId:'b'}]}],'invalid_listing'],
 ['bad ID',[{messages:[{id:'../x',threadId:'a'}]}],'invalid_listing']
])test(name+' never offers partial evidence',async()=>{let calls=0;fail(await invoke([],{fetcher:async()=>Response.json(pages[calls++])}),reason);assert.equal(calls,pages.length);});
test('40 unique metadata reads are allowed and41 are rejected before metadata',async()=>{
 const messages=Array.from({length:40},(_,i)=>message('reply-'+i));assert.equal((await invoke(messages)).observations.length,40);
 let calls=0;fail(await invoke([],{fetcher:async()=>{calls++;return Response.json(list([...messages,message('overflow')]));}}),'candidate_limit');assert.equal(calls,1);
});
test('provider failures, partial responses and changed message identity reject without retries',async()=>{
 for(const status of [204,206,301,302,307,308,401,403,404,429,500]){
  let calls=0;fail(await invoke([],{fetcher:async()=>{calls++;return new Response(null,{status,headers:{location:'https://untrusted.example.test'}});}}),'provider_unavailable');assert.equal(calls,1);
 }
 fail(await invoke([],{fetcher:async()=>{throw Error('PRIVATE');}}),'provider_unavailable');
 let calls=0;fail(await invoke([],{fetcher:async()=>++calls===1?Response.json(list([message()])):Response.json(message('changed'))}),'message_identity_changed');
});
test('response and total byte budgets reject oversized collection',async()=>{
 fail(await invoke([],{fetcher:async()=>new Response('x'.repeat(65537))}),'provider_unavailable');
 const messages=Array.from({length:20},(_,i)=>message('reply-'+i));let calls=0;
 fail(await invoke(messages,{fetcher:async url=>{if(new URL(url).pathname.endsWith('/messages'))return Response.json(list(messages));calls++;const m=messages.find(m=>new URL(url).pathname.endsWith('/'+m.id));return Response.json({...m,padding:'x'.repeat(60000)});}}),'provider_unavailable');assert.ok(calls<20);
});
