import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repliesFixture} from './_prospect-replies-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {getProspectDelivery} from '../lib/bloomops/prospect-delivery.mjs';
const identities=t=>all(t.raw,'SELECT * FROM prospect_delivery_identities');
const observed=t=>all(t.raw,'SELECT * FROM prospect_reply_observations');
const eventCount=(t,type='PROSPECT_DELIVERY_IDENTITY_VERIFIED')=>one(t.raw,'SELECT count(*) n FROM activity_events WHERE event_type=?',type).n;
const changedThread=(t,id='<returned@example.test>',empty=false)=>{
 const thread=t.thread(empty?[]:[t.message('reply',{'In-Reply-To':id})]);
 thread.messages[0].payload.headers.find(h=>h.name==='Message-ID').value=id;
 return thread;
};
const check=(t,id='<returned@example.test>',time=0,empty=false)=>t.check({clock:()=>new Date(Date.now()+time),fetcher:async()=>Response.json(changedThread(t,id,empty))});
function insert(t,table,value){run(t.raw,`INSERT INTO ${table}(${Object.keys(value).join(',')}) VALUES(${Object.keys(value).map(()=>'?').join(',')})`,...Object.values(value));}
function association(t,patch={}){
 const d=one(t.raw,'SELECT * FROM prospect_deliveries WHERE id=?',t.input.deliveryId);
 return {id:crypto.randomUUID(),workspace_id:d.workspace_id,prospect_id:d.prospect_id,delivery_id:d.id,account_email:d.account_email,provider_message_id:d.provider_message_id,provider_thread_id:d.provider_thread_id,rfc_message_id:'<returned@example.test>',verified_by_membership_id:'dest',connection_revision:1,sender_revision:1,...patch};
}
function duplicate(t,patch={}){
 const clone=(table,change)=>insert(t,table,{...one(t.raw,'SELECT * FROM '+table),...change});
 clone('bloomops_prospects',{id:'other-prospect',creation_request_id:crypto.randomUUID()});
 clone('prospect_outreach_drafts',{id:'other-draft',prospect_id:'other-prospect'});
 clone('prospect_outreach_approvals',{id:'other-approval',draft_id:'other-draft'});
 clone('prospect_deliveries',{id:'other-delivery',prospect_id:'other-prospect',approval_id:'other-approval',message_id:'<bloomsi-87654321-1234-1234-1234-123456789012@bloomsi.invalid>',...patch});
 return association(t,{delivery_id:'other-delivery',prospect_id:'other-prospect',...Object.fromEntries(Object.entries(patch).filter(([key])=>['account_email','provider_message_id','provider_thread_id'].includes(key)))});
}
for(const changed of [false,true])test(`verified ${changed?'returned':'unchanged'} RFC ID saves provenance and preserves the submitted receipt`,async c=>{
 const t=await repliesFixture(c),before=one(t.raw,'SELECT * FROM prospect_deliveries'),id=changed?'<returned@example.test>':before.message_id;
 assert.equal((await check(t,id)).status,'observed');
 const row=identities(t)[0];assert.equal(row.rfc_message_id,id);assert.equal(row.delivery_id,before.id);assert.equal(row.account_email,before.account_email);assert.equal(row.verified_by_membership_id,t.actor.membershipId);assert.equal(row.connection_revision,1);assert.equal(row.sender_revision,1);assert.ok(Date.parse(row.created_at));
 assert.equal(eventCount(t),1);assert.equal(observed(t)[0].match,'reply_chain');assert.deepEqual(one(t.raw,'SELECT * FROM prospect_deliveries'),before);
 const replyDto=JSON.stringify(await t.get()),deliveryDto=JSON.stringify(await getProspectDelivery(t.db,t.actor,t.env,t.id));
 for(const privateValue of [id,row.provider_message_id,'rfcMessageId','connection_revision','synthetic-access'])assert.ok(!replyDto.includes(privateValue));
 // Delivery already exposes its original receipt IDs; no returned RFC identity is added.
 if(changed)assert.ok(!deliveryDto.includes(id));assert.ok(!deliveryDto.includes('rfcMessageId'));
 const event=one(t.raw,"SELECT metadata_json FROM activity_events WHERE event_type='PROSPECT_DELIVERY_IDENTITY_VERIFIED'");assert.deepEqual(JSON.parse(event.metadata_json),{deliveryId:before.id});
});
test('replay after a connection revision preserves original provenance and emits no duplicate identity or observation',async c=>{
 const t=await repliesFixture(c);await check(t);const before=identities(t);
 run(t.raw,'UPDATE prospect_google_connections SET revision=revision+1');
 assert.equal((await check(t,undefined,31000)).status,'observed');assert.deepEqual(identities(t),before);assert.equal(eventCount(t),1);assert.equal(observed(t).length,1);assert.equal(eventCount(t,'PROSPECT_REPLY_OBSERVED'),1);
});
test('empty thread registers an identity without a send grant and cannot clear an existing hold',async c=>{
 const t=await repliesFixture(c),batch=t.db.batch.bind(t.db);
 t.db.batch=items=>{for(const item of items)assert.ok(item.toSQL().params.length<=100);return batch(items);};
 assert.equal((await check(t,undefined,0,true)).status,'observed');assert.equal(identities(t).length,1);assert.equal(t.row().hold_state,'clear');assert.deepEqual(observed(t),[]);assert.equal((await getProspectDelivery(t.db,t.actor,t.env,t.id)).canSend,false);
 await check(t,undefined,31000);await check(t,undefined,62000,true);assert.equal(t.row().hold_state,'held');assert.equal(eventCount(t),1);
});
test('changed identity after prior verification is unresolved and cannot replace provenance or create observations',async c=>{
 const t=await repliesFixture(c);await check(t,undefined,0,true);const before=identities(t);
 assert.equal((await check(t,'<conflict@example.test>',31000)).status,'unresolved');assert.deepEqual(identities(t),before);assert.deepEqual(observed(t),[]);assert.equal(t.row().hold_state,'held');assert.equal(t.row().check_status,'unresolved');assert.equal(t.row().check_id,null);assert.equal(eventCount(t),1);
 assert.equal(JSON.parse(one(t.raw,"SELECT metadata_json FROM activity_events WHERE event_type='PROSPECT_REPLY_CHECKED' ORDER BY occurred_at DESC LIMIT 1").metadata_json).status,'unresolved');
});
for(const collision of ['rfc','provider'])test(`another delivery's ${collision} identity cannot be reassigned even during completion`,async c=>{
 for(const timing of ['before','completion']){
  const t=await repliesFixture(c),value=duplicate(t,collision==='rfc'?{provider_message_id:'other-sent',provider_thread_id:'other-thread'}:{});
  if(collision==='provider')value.rfc_message_id='<other@example.test>';
  if(timing==='before')insert(t,'prospect_delivery_identities',value);
  else{const batch=t.db.batch.bind(t.db);let n=0;t.db.batch=items=>{if(++n===2)insert(t,'prospect_delivery_identities',value);return batch(items);};}
  assert.equal((await check(t)).status,'unresolved');assert.equal(identities(t).length,1);assert.equal(identities(t)[0].delivery_id,'other-delivery');assert.deepEqual(observed(t),[]);assert.equal(t.row().hold_state,'held');assert.equal(t.row().check_status,'unresolved');assert.equal(eventCount(t),0);
 }
});
test('same RFC/provider IDs in a different original account do not collide',async c=>{
 const t=await repliesFixture(c);insert(t,'prospect_delivery_identities',duplicate(t,{account_email:'other-account@example.test'}));
 assert.equal((await check(t)).status,'observed');assert.equal(identities(t).length,2);
});
test('same account and provider identities in another workspace stay independent',async c=>{
 const t=await repliesFixture(c);
 insert(t,'workspaces',{id:'separate',name:'Separate prospecting',slug:'separate',purpose:'prospecting'});
 insert(t,'workspace_memberships',{id:'separate-owner',workspace_id:'separate',user_id:'stranger',role:'owner',status:'active'});
 const clone=(table,patch)=>insert(t,table,{...one(t.raw,'SELECT * FROM '+table),workspace_id:'separate',...patch});
 clone('bloomops_prospects',{id:'foreign-prospect',creation_request_id:crypto.randomUUID(),created_by_membership_id:'separate-owner'});
 clone('prospect_outreach_drafts',{id:'foreign-draft',prospect_id:'foreign-prospect',updated_by_membership_id:'separate-owner'});
 clone('prospect_outreach_approvals',{id:'foreign-approval',draft_id:'foreign-draft',approved_by_membership_id:'separate-owner'});
 clone('prospect_deliveries',{id:'foreign-delivery',prospect_id:'foreign-prospect',approval_id:'foreign-approval',created_by_membership_id:'separate-owner',message_id:'<bloomsi-87654321-1234-1234-1234-123456789012@bloomsi.invalid>'});
 insert(t,'prospect_delivery_identities',association(t,{workspace_id:'separate',prospect_id:'foreign-prospect',delivery_id:'foreign-delivery',verified_by_membership_id:'separate-owner'}));
 assert.equal((await check(t)).status,'observed');assert.equal(identities(t).length,2);assert.equal(eventCount(t),1);
});
test('prepared and uncertain receipts cannot acquire verified provider provenance',async c=>{
 for(const state of ['prepared','uncertain']){const t=await repliesFixture(c),value=duplicate(t,{state});assert.throws(()=>insert(t,'prospect_delivery_identities',value),/accepted provider receipt/);assert.deepEqual(identities(t),[]);}
});
test('receipt/account/provider/thread, tenant, member and revision constraints reject invalid associations',async c=>{
 const t=await repliesFixture(c);
 for(const patch of [{workspace_id:'foreign'},{prospect_id:'foreign'},{delivery_id:'foreign'},{account_email:'foreign@example.test'},{provider_message_id:'foreign'},{provider_thread_id:'foreign'},{verified_by_membership_id:'other'},{connection_revision:0},{sender_revision:0},{rfc_message_id:'malformed'}]){
  assert.throws(()=>insert(t,'prospect_delivery_identities',association(t,patch)),/receipt|FOREIGN KEY|CHECK/);
 }
 assert.deepEqual(identities(t),[]);await check(t);
 assert.throws(()=>run(t.raw,"UPDATE prospect_delivery_identities SET rfc_message_id='<changed@example.test>'"),/immutable/);
 assert.throws(()=>run(t.raw,'DELETE FROM prospect_delivery_identities'),/permanent/);
 assert.throws(()=>insert(t,'prospect_delivery_identities',association(t)),/UNIQUE/);
});
test('unresolved or malformed provider response never registers an identity',async c=>{
 for(const mutate of [x=>{x.messages[0].labelIds=[];},x=>{x.messages[0].payload.headers=[];},x=>{x.messages[0].labelIds.push('DRAFT');},x=>{x.id='other-thread';}]){
  const t=await repliesFixture(c),value=changedThread(t);mutate(value);
  assert.equal((await t.check({fetcher:async()=>Response.json(value)})).status,'unresolved');assert.deepEqual(identities(t),[]);assert.equal(eventCount(t),0);assert.equal(t.row().hold_state,'held');
 }
});
test('stop, session and membership/grant/sender revocation discard identity and observations at completion',async c=>{
 for(const mutation of [null,"UPDATE session SET expires_at=0","UPDATE workspace_memberships SET status='suspended' WHERE id='dest'","UPDATE prospect_google_connections SET revision=revision+1","UPDATE prospect_senders SET revision=revision+1"]){
  const t=await repliesFixture(c);const result=await t.check({fetcher:async()=>{if(mutation)run(t.raw,mutation);else await t.stop();return Response.json(changedThread(t));}});
  assert.ok(result.conflict);assert.deepEqual(identities(t),[]);assert.deepEqual(observed(t),[]);assert.equal(eventCount(t),0);
 }
});
test('replaced lease accepts only the newer verified identity',async c=>{
 const t=await repliesFixture(c);let time=Date.now();
 assert.ok((await t.check({clock:()=>new Date(time),fetcher:async()=>{time+=91000;assert.equal((await t.check({clock:()=>new Date(time),fetcher:async()=>Response.json(changedThread(t,'<newer@example.test>',true))})).status,'observed');return Response.json(changedThread(t));}})).conflict);
 assert.equal(identities(t)[0].rfc_message_id,'<newer@example.test>');assert.equal(eventCount(t),1);assert.deepEqual(observed(t),[]);
});
for(const type of ['PROSPECT_DELIVERY_IDENTITY_VERIFIED','PROSPECT_REPLY_OBSERVED','PROSPECT_REPLY_CHECKED'])test(`${type} failure rolls back the entire completion`,async c=>{
 const t=await repliesFixture(c);run(t.raw,`CREATE TRIGGER reject_identity_completion BEFORE INSERT ON activity_events WHEN NEW.event_type='${type}' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END`);
 await assert.rejects(()=>check(t),/rollback/);assert.deepEqual(identities(t),[]);assert.deepEqual(observed(t),[]);assert.equal(eventCount(t),0);assert.equal(t.row().check_status,'checking');
});
