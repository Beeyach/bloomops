import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repliesFixture} from './_prospect-replies-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {getRecipientProtection} from '../lib/bloomops/prospect-recipient-protection.mjs';
import {getProspectDelivery,prepareProspectDelivery,sendProspectIntroduction} from '../lib/bloomops/prospect-delivery.mjs';
import {createProspect,updateProspect} from '../lib/bloomops/prospects.mjs';
import {saveProspectSender,saveProspectOutreach,approveProspectOutreach} from '../lib/bloomops/prospect-outreach.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
import {resolveWorkspaceAccess} from '../lib/bloomops/membership.mjs';
async function duplicate(t,recipient=t.fields.recipient,actor=t.actor){
 const workspaceId=actor.workspaceId;
 const {prospectId}=await createProspect(t.db,{actor,input:{workspaceId,requestId:crypto.randomUUID(),fields:{businessName:'Duplicate garden contact',publicEmail:recipient,timeZone:'UTC',fit:'strong',observedFacts:'Synthetic reviewed address.',evidenceDate:'2026-09-13',evidenceTarget:'https://example.test',proposedWork:'Synthetic test.'}}});
 await updateProspect(t.db,{actor,id:prospectId,input:{workspaceId,expectedRevision:1,fields:{publicEmail:recipient},sources:{publicEmail:{url:'https://example.test/contact',checked:true}}}});
 const senderRevision=one(t.raw,'SELECT revision FROM prospect_senders WHERE workspace_id=?',workspaceId).revision;
 const revisions={workspaceId,prospectId,expectedRevision:0,expectedProfileRevision:2,expectedSenderRevision:senderRevision};
 assert.ok((await saveProspectOutreach(t.db,actor,{...revisions,sourceResultId:null,fields:{...t.fields,recipient,timeZone:'UTC'}})).saved);
 assert.ok((await approveProspectOutreach(t.db,actor,{...revisions,expectedRevision:1,reviewed:true})).approved);
 const data=await getProspectDelivery(t.db,actor,t.env,prospectId);
 return {workspaceId,prospectId,approvalId:data.approvalId};
}
const prepare=(t,target)=>prepareProspectDelivery(t.db,t.actor,target);
async function prepared(t){const target=await duplicate(t),receipt=await prepare(t,target);assert.ok(receipt.prepared);return {...target,deliveryId:receipt.deliveryId};}
const send=(t,target,fetcher)=>sendProspectIntroduction(t.db,t.actor,{...t.env,BLOOMOPS_GOOGLE_TEST_DELIVERY_ID:target.deliveryId},t.session,{workspaceId:target.workspaceId,prospectId:target.prospectId,deliveryId:target.deliveryId,reviewed:true},{fetcher});
const targetRow=(t,target)=>one(t.raw,'SELECT * FROM prospect_deliveries WHERE id=?',target.deliveryId);
const accepted=()=>Response.json({id:'duplicate-sent',threadId:'duplicate-thread'});
const events=t=>all(t.raw,'SELECT * FROM activity_events');
test('a reply hold blocks duplicate receipt preparation without altering content approval',async c=>{
 const t=await repliesFixture(c),target=await duplicate(t);await t.check();const before=events(t);
 assert.ok((await prepare(t,target)).conflict);assert.deepEqual(events(t),before);
 const data=await getProspectDelivery(t.db,t.actor,t.env,target.prospectId);assert.equal(data.approvalId,target.approvalId);assert.equal(data.receipt,null);assert.equal(data.recipientProtection.kind,'held');assert.equal(data.recipientProtection.prospectId,t.id);
});
test('a stale prepared duplicate cannot send after another conversation becomes held',async c=>{
 const t=await repliesFixture(c),target=await prepared(t);await t.check();let calls=0;const before=events(t);
 assert.ok((await send(t,target,async()=>{calls++;return accepted();})).conflict);assert.equal(calls,0);assert.equal(targetRow(t,target).state,'prepared');assert.deepEqual(events(t),before);
 const data=await getProspectDelivery(t.db,t.actor,{...t.env,BLOOMOPS_GOOGLE_TEST_DELIVERY_ID:target.deliveryId},target.prospectId);assert.equal(data.canSend,false);assert.equal(data.recipientProtection.kind,'held');
});
test('all permanent stop reasons protect the recipient even after connection loss or sender changes',async c=>{
 for(const reason of ['opt_out','declined','hard_bounce','manual']){const t=await repliesFixture(c),target=await duplicate(t);await t.stop('Private reviewed evidence',reason);run(t.raw,'UPDATE prospect_google_connections SET active=0');run(t.raw,"UPDATE prospect_senders SET email='new@example.test',revision=revision+1");
  const data=await getRecipientProtection(t.db,t.actor,t.fields.recipient);assert.equal(data.kind,'stopped');assert.ok(!JSON.stringify(data).includes('Private reviewed evidence'));assert.ok((await prepare(t,target)).conflict);
 }
});
test('normalization is exact email matching without dot, plus, local-part or domain guesses',async c=>{
 const t=await repliesFixture(c);await t.check();assert.equal((await getRecipientProtection(t.db,t.actor,'  INBOX@EXAMPLE.TEST  ')).kind,'held');
 for(const email of ['in.box@example.test','inbox+tag@example.test','other@example.test','inbox@other.test']){assert.equal(await getRecipientProtection(t.db,t.actor,email),null);const target=await duplicate(t,email);assert.ok((await prepare(t,target)).prepared);}
});
test('source profile and draft edits cannot move protection away from the accepted recipient',async c=>{
 const t=await repliesFixture(c);await t.check();assert.ok((await updateProspect(t.db,{actor:t.actor,id:t.id,input:{workspaceId:'fresh',expectedRevision:2,fields:{publicEmail:'changed@example.test'}}})).ok);
 assert.ok((await saveProspectOutreach(t.db,t.actor,{workspaceId:'fresh',prospectId:t.id,expectedRevision:1,expectedProfileRevision:3,expectedSenderRevision:1,sourceResultId:null,fields:{...t.fields,recipient:'changed@example.test'}})).saved);
 assert.equal((await getRecipientProtection(t.db,t.actor,t.fields.recipient)).kind,'held');assert.equal(await getRecipientProtection(t.db,t.actor,'changed@example.test'),null);
 const target=await duplicate(t);assert.ok((await prepare(t,target)).conflict);
});
test('recipient protection stays in its workspace and denied actors cannot read its source',async c=>{
 const t=await repliesFixture(c);await t.check();
 run(t.raw,"INSERT INTO workspaces(id,name,slug,purpose) VALUES('another','Another','another','prospecting')");run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('another-owner','another',?,'owner','active')",t.actor.userId);
 const actor=await loadActor(t.db,await resolveWorkspaceAccess(t.db,t.actor.userId,{workspaceId:'another'}));
 await saveProspectSender(t.db,actor,{workspaceId:'another',expectedRevision:0,fields:{provider:'google_workspace',email:'hello@example.test',displayName:'Another'}});
 assert.equal(await getRecipientProtection(t.db,actor,t.fields.recipient),null);const target=await duplicate(t,t.fields.recipient,actor);assert.ok((await prepareProspectDelivery(t.db,actor,target)).prepared);
 for(const denied of [null,{...t.actor,role:'client'},{...t.actor,role:'team_member'},{...t.actor,role:'project_manager'},{...t.actor,workspaceId:'another',membershipId:'dest'}])assert.equal(await getRecipientProtection(t.db,denied,t.fields.recipient),null);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");assert.equal(await getRecipientProtection(t.db,t.actor,t.fields.recipient),null);
});
test('a hold arriving before the atomic send claim wins without a provider attempt',async c=>{
 const t=await repliesFixture(c),target=await prepared(t),batch=t.db.batch.bind(t.db);let first=true,calls=0;
 t.db.batch=async statements=>{if(first){first=false;await t.check();}return batch(statements);};
 assert.ok((await send(t,target,async()=>{calls++;return accepted();})).conflict);assert.equal(calls,0);assert.equal(targetRow(t,target).state,'prepared');
 assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type='PROSPECT_DELIVERY_ATTEMPTED'",target.prospectId).n,0);
});
test('a stop arriving after claim cancels the receipt before transport',async c=>{
 const t=await repliesFixture(c),target=await prepared(t),batch=t.db.batch.bind(t.db);let first=true,calls=0;
 t.db.batch=async statements=>{const result=await batch(statements);if(first){first=false;await t.stop();}return result;};
 assert.ok((await send(t,target,async()=>{calls++;return accepted();})).conflict);assert.equal(calls,0);assert.equal(targetRow(t,target).state,'cancelled');
});
test('a reply arriving after submission preserves the actual provider acceptance',async c=>{
 const t=await repliesFixture(c),target=await prepared(t);let calls=0;
 assert.ok((await send(t,target,async()=>{calls++;await t.check();return accepted();})).processed);assert.equal(calls,1);assert.equal(targetRow(t,target).state,'accepted');assert.equal((await getRecipientProtection(t.db,t.actor,t.fields.recipient)).kind,'held');
});
test('pending and expired unfinished checks block duplicate sending until recovery',async c=>{
 const t=await repliesFixture(c),target=await prepared(t);let calls=0;
 await t.check({fetcher:async()=>{assert.equal((await getRecipientProtection(t.db,t.actor,t.fields.recipient)).kind,'checking');assert.ok((await send(t,target,async()=>{calls++;return accepted();})).conflict);run(t.raw,'UPDATE prospect_google_connections SET revision=revision+1');return Response.json(t.thread());}});
 run(t.raw,"UPDATE prospect_reply_states SET revision=revision+1,check_expires_at='2000-01-01T00:00:00.000Z'");
 assert.equal((await getRecipientProtection(t.db,t.actor,t.fields.recipient)).kind,'checking');assert.ok((await send(t,target,async()=>{calls++;return accepted();})).conflict);assert.equal(calls,0);
});
test('a completed empty check with no prior hold does not block another reviewed receipt',async c=>{
 const t=await repliesFixture(c);await t.check({fetcher:async()=>Response.json(t.thread([]))});assert.equal(await getRecipientProtection(t.db,t.actor,t.fields.recipient),null);const target=await prepared(t);assert.ok((await send(t,target,async()=>accepted())).processed);
});
test('local protection reads do not create records or expose stop notes/provider credentials',async c=>{
 const t=await repliesFixture(c);await t.stop('Confidential reviewed instruction');const before=events(t),state=t.row();const result=await getRecipientProtection(t.db,t.actor,t.fields.recipient);assert.equal(result.kind,'stopped');assert.deepEqual(events(t),before);assert.deepEqual(t.row(),state);assert.deepEqual(Object.keys(result).sort(),['businessName','kind','prospectId','recipient']);
});
test('a hold arriving inside preparation prevents a new receipt and event',async c=>{
 const t=await repliesFixture(c),target=await duplicate(t,' INBOX@EXAMPLE.TEST '),batch=t.db.batch.bind(t.db);let first=true;
 t.db.batch=async statements=>{if(first){first=false;await t.check();}return batch(statements);};
 assert.ok((await prepare(t,target)).conflict);assert.equal(one(t.raw,'SELECT count(*) n FROM prospect_deliveries WHERE prospect_id=?',target.prospectId).n,0);
 assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE subject_id=? AND event_type='PROSPECT_DELIVERY_PREPARED'",target.prospectId).n,0);
});
