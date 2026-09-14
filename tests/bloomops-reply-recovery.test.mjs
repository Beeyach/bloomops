import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectProspectReplyRecovery} from '../lib/bloomops/prospect-reply-recovery.mjs';
import {context,message,time} from './_prospect-discovery-fixture.mjs';
function provider({many=false,failHistory=false}={}){
 const old=Array.from({length:many?40:1},(_,i)=>message('old-'+i)),fresh=Array.from({length:many?40:1},(_,i)=>message('fresh-'+i,{'In-Reply-To':'<unknown@example.test>'}));
 const messages=[...old,...fresh];
 return async url=>{const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:context.accountEmail,historyId:'9007199254740999'});if(u.pathname.endsWith('/messages'))return Response.json({messages:old.map(m=>({id:m.id,threadId:m.threadId}))});if(u.pathname.endsWith('/history')){assert.equal(u.searchParams.get('startHistoryId'),'9007199254740999');if(failHistory)return new Response(null,{status:404});return Response.json({history:[{id:'9007199254741000',messagesAdded:fresh.map(m=>({message:{id:m.id,threadId:m.threadId}}))}],historyId:'9007199254741001'});}return Response.json(messages.find(m=>u.pathname.endsWith('/'+m.id)));};
}
test('profile boundary precedes collection and catch-up; numeric history stays exact',async()=>{
 const fetcher=provider(),urls=[];let checks=0;const r=await collectProspectReplyRecovery('synthetic',context,{fetcher:async url=>{urls.push(url);return fetcher(url);},ready:async()=>{checks++;return true;}});
 assert.equal(checks,3);assert.equal(r.status,'collected');assert.equal(r.startHistoryId,'9007199254740999');assert.equal(r.catchupHistoryId,'9007199254741001');assert.equal(r.observations.length,1);assert.equal(r.unassigned.length,1);assert.ok(urls[0].includes('/profile?'));assert.ok(urls[1].includes('/messages?'));
});
test('two bounded windows merge at most80 distinct evidence records',async()=>{
 const r=await collectProspectReplyRecovery('synthetic',context,{fetcher:provider({many:true})});assert.equal(r.messages.length,80);assert.equal(r.observations.length,40);assert.equal(r.unassigned.length,40);
});
test('failed catch-up retains completed collection but never supplies a catch-up cursor',async()=>{
 const r=await collectProspectReplyRecovery('synthetic',context,{fetcher:provider({failHistory:true})});assert.equal(r.status,'collected');assert.equal(r.catchupStatus,'unresolved');assert.equal(r.catchupHistoryId,null);assert.equal(r.reason,'history_gap');assert.equal(r.messages.length,1);
});
test('invalid registry/time or token fails before provider access',async()=>{
 let calls=0;const fetcher=async()=>{calls++;};
 for(const ctx of [null,{...context,workspaceId:'foreign'},{...context,deliveries:[]},{...context,deliveries:[{...context.deliveries[0],receipt:{...context.deliveries[0].receipt,attemptedAt:new Date(Date.now()+60000).toISOString()}}]}])assert.equal((await collectProspectReplyRecovery('synthetic',ctx,{fetcher})).status,'unresolved');
 assert.equal((await collectProspectReplyRecovery('',context,{fetcher})).status,'unresolved');assert.equal(calls,0);
});
test('authority gate before each stage stops further provider calls',async()=>{
 for(const stopAt of [1,2,3]){let stage=0,calls=[];const fetcher=provider();const r=await collectProspectReplyRecovery('synthetic',context,{ready:async()=>++stage<stopAt,fetcher:async url=>{calls.push(url);return fetcher(url);}});assert.equal(r.reason,'review_changed');assert.deepEqual(r.observations,[]);assert.deepEqual(r.unassigned,[]);assert.equal(calls.length,[0,1,3][stopAt-1]);}
});
