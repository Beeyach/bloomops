import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchGoogleReplyCandidates as match,inspectGoogleReplyChanges as inspect} from '../lib/bloomops/prospect-reply-discovery.mjs';
import {context,delivery,message,sent,history,time} from './_prospect-discovery-fixture.mjs';
const read=(messages,ctx=context)=>match(messages,ctx);
const set=(m,name,value)=>{m.payload.headers.find(h=>h.name===name).value=value;return m;};
const failed=(value,reason)=>{assert.equal(value.status,'unresolved');assert.equal(value.hold,true);assert.equal(value.nextHistoryId,null);assert.deepEqual(value.observations,[]);if(reason)assert.equal(value.reason,reason);};
const provider=(pages,values)=>{const calls=[];return {calls,fetcher:async(url,init)=>{calls.push({url,init});const u=new URL(url);return Response.json(u.pathname.endsWith('/history')?pages.shift():values[u.pathname.split('/').at(-1)]);}};};
test('a direct reply in a different Google thread links only to its registered returned identity',()=>{
 const before=structuredClone(context),result=read([message()]);assert.equal(result.status,'observed');assert.equal(result.hold,true);
 assert.deepEqual(result.observations,[{deliveryId:delivery().receipt.id,prospectId:'prospect-1',providerMessageId:'reply',providerThreadId:'separate-thread',receivedAt:new Date(time+1000).toISOString(),kind:'reply_unreviewed',match:'reply_chain',hold:true}]);assert.deepEqual(context,before);
});
test('transitive ancestry is independent of input order and can bridge our SENT alias',()=>{
 const a=message('a'),b=message('b',{'In-Reply-To':'<a@example.test>',From:'alias@example.test'},{labelIds:['SENT']}),c=message('c',{'In-Reply-To':'<b@example.test>'});
 assert.deepEqual(read([c,b,a]),read([a,b,c]));assert.deepEqual(read([c,b,a]).observations.map(x=>x.providerMessageId),['a','c']);
});
test('references-only replies and folded headers keep exact identity case',()=>{
 const m=message('reference',{References:'\r\n\t'+delivery().identity.rfcMessageId});m.payload.headers=m.payload.headers.filter(h=>h.name!=='In-Reply-To');assert.equal(read([m]).status,'observed');
 set(m,'References',delivery().identity.rfcMessageId.toUpperCase());failed(read([m]),'unattributed_message');
});
test('submitted RFC, provider thread, same sender/address/domain and subject are never fallback matches',()=>{
 for(const headers of [{'In-Reply-To':delivery().receipt.messageId},{'In-Reply-To':'<unknown@example.test>',From:'person1@example.test',Subject:'Re: the exact subject'}])failed(read([message('unlinked',headers,{threadId:'thread-1'})]),'unattributed_message');
});
test('multiple registered roots remain ambiguous, including a late transitive second path',()=>{
 const ctx={...context,deliveries:[delivery(),delivery(2)]};const second=message('second',{'In-Reply-To':delivery(2).identity.rfcMessageId});const mixed=message('mixed',{'In-Reply-To':delivery().identity.rfcMessageId,References:'<second@example.test>'});
 for(const values of [[mixed,second],[second,mixed]])failed(read(values,ctx),'ambiguous_ancestry');
});
test('unattributed mail or unsupported ancestry discards all proposed observations and cursor',()=>{
 for(const value of [message('no-parent',{'In-Reply-To':''}),message('missing',{'Message-ID':'bad'}),message('syntax',{'In-Reply-To':'(comment) '+delivery().identity.rfcMessageId}),message('old',{}, {internalDate:String(time-1)})])failed(read([message(),value]));
});
test('unrooted cycles are unresolved, while empty reads remain held snapshots',()=>{
 failed(read([message('a',{'In-Reply-To':'<b@example.test>'}),message('b',{'In-Reply-To':'<a@example.test>'})]),'unattributed_message');
 assert.deepEqual(read([]),{status:'observed',hold:true,observations:[]});assert.equal(Object.hasOwn(read([]),'canSend'),false);
});
test('drafts and SENT messages are excluded; draft ancestry never anchors a reply',()=>{
 const draft=message('draft',{}, {labelIds:['DRAFT']}),outgoing=message('outgoing',{'In-Reply-To':'<unknown@example.test>'},{labelIds:['SENT']});
 assert.deepEqual(read([draft,outgoing]).observations,[]);failed(read([draft,message('answer',{'In-Reply-To':'<draft@example.test>'})]),'unattributed_message');
});
for(const [header,kind] of [[{'Auto-Submitted':'auto-replied'},'automatic_response'],[{'Content-Type':'multipart/report; report-type=delivery-status'},'delivery_report'],[{From:'primary@example.test'},'needs_review'],[{From:'bad'},'needs_review']])test('linked '+kind+' stays held without a positive/hard-bounce decision',()=>{
 const result=read([message('kind',header)]);assert.equal(result.observations[0].kind,kind);assert.equal(result.observations[0].hold,true);assert.ok(!JSON.stringify(result).match(/hardBounce|positive|humanConfirmed/));
});
test('registered sent anchors seen again must preserve exact original provider, thread, address and SENT checks',()=>{
 assert.equal(read([sent(),message()]).status,'observed');
 for(const mutate of [m=>set(m,'Message-ID','<changed@example.test>'),m=>set(m,'From','foreign@example.test'),m=>set(m,'To','foreign@example.test'),m=>{m.threadId='foreign';},m=>{m.labelIds=[];},m=>{m.labelIds.push('DRAFT');}]){const m=sent();mutate(m);failed(read([m,message()]),'anchor_conflict');}
});
test('conflicting provider or RFC identity cannot establish another anchor',()=>{
 failed(read([message(),message()]),'ambiguous_identity');
 failed(read([message('a'),message('b',{'Message-ID':'<a@example.test>'})]),'ambiguous_identity');
 failed(read([message('foreign',{'Message-ID':delivery().identity.rfcMessageId})]),'ambiguous_identity');
});
test('candidate/registry bounds reject excess and incomplete or mixed authority before transport',async()=>{
 const invalid=[null,{...context,workspaceId:'other'},{...context,accountEmail:'other@example.test'},{...context,startHistoryId:'9&x=1'},{...context,deliveries:[]},{...context,deliveries:[delivery(),delivery()]},{...context,deliveries:Array.from({length:101},(_,i)=>delivery(i+1))}];
 for(const patch of [{workspaceId:'other'},{prospectId:'other'},{deliveryId:'other'},{accountEmail:'other@example.test'},{providerMessageId:'other'},{providerThreadId:'other'},{rfcMessageId:'bad'},{verifiedByMembershipId:null},{connectionRevision:0},{senderRevision:0},{createdAt:'invalid'}]){const d=delivery();Object.assign(d.identity,patch);invalid.push({...context,deliveries:[d]});}
 for(const patch of [{state:'uncertain'},{workspaceId:'other'},{attemptedAt:'invalid'}]){const d=delivery();Object.assign(d.receipt,patch);invalid.push({...context,deliveries:[d]});}
 let calls=0;for(const ctx of invalid)failed(await inspect('synthetic-token',ctx,{fetcher:async()=>{calls++;}}),'invalid_context');
 for(const token of ['',null,'x\r\nInjected: yes','x'.repeat(16385)])failed(await inspect(token,context,{fetcher:async()=>{calls++;}}),'invalid_context');assert.equal(calls,0);
 failed(read(Array.from({length:41},(_,i)=>message('r'+i))),'candidate_limit');
});
test('metadata validation strips extra body/snippet fields and exposes no unrelated headers or recipient addresses',()=>{
 const m=message();m.snippet='PRIVATE';m.payload.body={data:'PRIVATE'};m.payload.headers.push({name:'Subject',value:'PRIVATE'});
 const result=read([m]);assert.equal(result.status,'observed');assert.ok(!JSON.stringify(result).match(/PRIVATE|headers|payload|someone@|person1@|returned-1@/));
 for(const mutate of [m=>{m.labelIds=null;},m=>{m.internalDate='bad';},m=>m.payload.headers.push({name:'from',value:'other@example.test'}),m=>set(m,'From','A\r\nInjected: B')]){const m=message();mutate(m);failed(read([m]),'invalid_metadata');}
});
test('history traversal uses one bounded metadata-only path, no Inbox filter, bodies, query search or retries',async()=>{
 const m=message(),p=provider([history()],{reply:m});const result=await inspect('synthetic-token',context,p);assert.equal(result.status,'observed');assert.equal(result.nextHistoryId,'11');assert.equal(p.calls.length,2);
 const h=new URL(p.calls[0].url);assert.equal(h.origin+h.pathname,'https://gmail.googleapis.com/gmail/v1/users/me/history');assert.equal(h.searchParams.get('startHistoryId'),'9');assert.equal(h.searchParams.get('historyTypes'),'messageAdded');assert.equal(h.searchParams.get('maxResults'),'100');assert.equal(h.searchParams.get('fields'),'history(id,messagesAdded(message(id,threadId))),nextPageToken,historyId');assert.equal(h.searchParams.has('labelId'),false);assert.equal(h.searchParams.has('q'),false);
 const u=new URL(p.calls[1].url);assert.equal(u.searchParams.get('format'),'metadata');assert.equal(u.searchParams.get('fields'),'id,threadId,labelIds,internalDate,payload/headers');assert.equal(u.searchParams.getAll('metadataHeaders').length,9);
 for(const call of p.calls){assert.equal(call.init.method,'GET');assert.equal(call.init.body,undefined);assert.equal(call.init.redirect,'manual');assert.deepEqual(call.init.headers,{authorization:'Bearer synthetic-token'});assert.equal(call.init.signal,p.calls[0].init.signal);}
});
test('pagination deduplicates repeated additions and replay produces exactly the same proposal',async()=>{
 const m=message(),pages=[history([m],{nextPageToken:'page +/&?=2'}),{history:[{id:'11',messagesAdded:[{message:{id:m.id,threadId:m.threadId}}]}],historyId:'12'}];
 const p=provider(structuredClone(pages),{reply:m}),r=await inspect('synthetic-token',context,p);assert.equal(r.observations.length,1);assert.equal(r.nextHistoryId,'12');assert.equal(p.calls.length,3);assert.equal(new URL(p.calls[1].url).searchParams.get('pageToken'),'page +/&?=2');
 assert.deepEqual(await inspect('synthetic-token',context,provider(structuredClone(pages),{reply:m})),r);
});
test('numeric cursor order handles9→10 and values beyond Number safe integers',async()=>{
 for(const start of ['9','9007199254740999']){const end=String(BigInt(start)+1n),ctx={...context,startHistoryId:start};const p=provider([{history:[{id:end,messagesAdded:[{message:{id:'reply',threadId:'separate-thread'}}]}],historyId:end}],{reply:message()});assert.equal((await inspect('synthetic-token',ctx,p)).nextHistoryId,end);}
});
test('terminal empty response proposes only the bounded cursor and remains held',async()=>{
 const p=provider([{historyId:'10'}],{});assert.deepEqual(await inspect('synthetic-token',context,p),{status:'observed',hold:true,observations:[],nextHistoryId:'10'});assert.equal(p.calls.length,1);
});
for(const [label,page] of [
 ['regressed current cursor',{historyId:'8'}],['invalid history ID',{historyId:'x'}],['missing current cursor',{}],['null history',{historyId:'10',history:null}],
 ['missing additions',{historyId:'11',history:[{id:'10'}]}],['empty additions',{historyId:'11',history:[{id:'10',messagesAdded:[]}]}],
 ['history before start',history([message()],{history:[{id:'8',messagesAdded:[{message:{id:'reply',threadId:'separate-thread'}}]}]})],
 ['history beyond cursor',history([message()],{historyId:'9'})],['invalid page token',history([],{nextPageToken:'\nprivate'})],
 ['overlong page token',history([message()],{nextPageToken:'x'.repeat(2049)})],
])test(label+' never advances the cursor or requests message metadata',async()=>{
 const p=provider([page],{});failed(await inspect('synthetic-token',context,p));assert.equal(p.calls.length,1);
});
test('repeated pagination token, three-page limit and oversized candidate set never skip unseen mail',async()=>{
 for(const pages of [[{historyId:'20',nextPageToken:'loop'},{historyId:'20',nextPageToken:'loop'}],Array.from({length:3},(_,i)=>({historyId:'20',nextPageToken:'p'+i})),[history(Array.from({length:41},(_,i)=>message('r'+i)))]]){const p=provider(pages,{});failed(await inspect('synthetic-token',context,p));assert.ok(p.calls.every(c=>new URL(c.url).pathname.endsWith('/history')));}
});
test('history order, regressed later page and changed thread for duplicate addition are unresolved',async()=>{
 for(const second of [{historyId:'10'},history([message()],{historyId:'12'}),{historyId:'12',history:[{id:'11',messagesAdded:[{message:{id:'reply',threadId:'different'}}]}]}]){const p=provider([history([message()],{nextPageToken:'second'}),second],{});failed(await inspect('synthetic-token',context,p),'invalid_history');assert.equal(p.calls.length,2);}
});
test('expired history404 has no fallback profile/full-sync/reset; other errors and redirects have no retries',async()=>{
 for(const status of [204,206,301,302,303,307,308,400,401,403,404,429,503]){let calls=0;const r=await inspect('synthetic-token',context,{fetcher:async()=>{calls++;return new Response(null,{status,headers:{location:'https://untrusted.test'}});}});failed(r,status===404?'history_gap':'provider_unavailable');assert.equal(calls,1);}
});
test('missing, changed or malformed fetched messages keep the cursor at its original position',async()=>{
 for(const value of [null,{...message(),id:'foreign'},{...message(),threadId:'foreign'},{...message(),payload:{headers:[]}}]){const p=provider([history()],{reply:value});failed(await inspect('synthetic-token',context,p));assert.equal(p.calls.length,2);}
 for(const status of [404,403,503]){let calls=0;failed(await inspect('synthetic-token',context,{fetcher:async()=>++calls===1?Response.json(history()):new Response(null,{status})}),'message_unavailable');assert.equal(calls,2);}
});
test('malformed/oversized/invalid UTF8 history cancels and never leaks errors',async()=>{
 for(const body of ['{','null','x'.repeat(256*1024+1),new Uint8Array([255])])failed(await inspect('synthetic-token',context,{fetcher:async()=>new Response(body)}));
 let cancelled=false;failed(await inspect('synthetic-token',context,{fetcher:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(256*1024+1));},cancel(){cancelled=true;}}))}));assert.equal(cancelled,true);
 const r=await inspect('synthetic-token',context,{fetcher:async()=>{throw Error('PRIVATE synthetic-token');}});failed(r);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('metadata response and cumulative byte ceilings reject the entire proposal',async()=>{
 let calls=0;failed(await inspect('synthetic-token',context,{fetcher:async()=>++calls===1?Response.json(history()):new Response('x'.repeat(64*1024+1))}));
 const messages=Array.from({length:20},(_,i)=>message('r'+i));calls=0;
 failed(await inspect('synthetic-token',context,{fetcher:async url=>{calls++;return new URL(url).pathname.endsWith('/history')?Response.json(history(messages)):Response.json({...messages.find(m=>url.includes('/messages/'+m.id+'?')),ignored:'x'.repeat(60000)});}}));assert.ok(calls<21,'whole request stops at1MiB before fetching every candidate');
});
test('the40-message and100-identity boundaries are accepted without losing observations',async()=>{
 const ctx={...context,deliveries:Array.from({length:100},(_,i)=>delivery(i+1))};
 const messages=Array.from({length:40},(_,i)=>message('r'+i,{'In-Reply-To':delivery(100).identity.rfcMessageId}));const p=provider([history(messages)],Object.fromEntries(messages.map(m=>[m.id,m])));
 const result=await inspect('synthetic-token',ctx,p);assert.equal(result.status,'observed');assert.equal(result.observations.length,40);assert.ok(result.observations.every(x=>x.prospectId==='prospect-100'));assert.equal(p.calls.length,41);
});
test('more than100 duplicate additions in one history record deduplicate within the byte and unique-message bounds',async()=>{
 const m=message(),p=provider([history(Array.from({length:101},()=>m))],{reply:m});
 const result=await inspect('synthetic-token',context,p);assert.equal(result.status,'observed');assert.equal(result.nextHistoryId,'11');assert.equal(result.observations.length,1);assert.equal(p.calls.length,2);
});
