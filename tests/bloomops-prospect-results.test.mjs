import assert from 'node:assert/strict';
import test from 'node:test';
import {repliesFixture} from './_prospect-replies-fixture.mjs';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {run} from './_bloomops-db.mjs';
import {getProspectResults} from '../lib/bloomops/prospect-results.mjs';

const NOW=new Date('2099-09-17T12:00:00.000Z');

test('Results counts canonical receipts and events without inferring outcomes',async context=>{
 const t=await repliesFixture(context);await t.check({clock:()=>new Date('2026-09-17T10:00:00.000Z')});
 run(t.raw,"INSERT INTO activity_events(id,workspace_id,event_type,subject_type,subject_id,actor_membership_id,actor_user_id,occurred_at) VALUES('interest','fresh','PROSPECT_INTEREST_RECORDED','prospect',?,'dest','owner','2026-09-17T10:15:00.000Z')",t.id);
 run(t.raw,"INSERT INTO activity_events(id,workspace_id,event_type,subject_type,subject_id,actor_membership_id,actor_user_id,occurred_at) VALUES('interest-again','fresh','PROSPECT_INTEREST_RECORDED','prospect',?,'dest','owner','2026-09-17T10:16:00.000Z')",t.id);
 run(t.raw,"INSERT INTO service_types(id,workspace_id,name,slug) VALUES('service','fresh','Websites','websites')");
 run(t.raw,"INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('client','fresh','Garden client','garden-client')");
 run(t.raw,"INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id,scope_notes) VALUES('engagement','fresh','client','service','Synthetic scope')");
 run(t.raw,"INSERT INTO prospect_conversions(id,workspace_id,prospect_id,request_id,request_hash,profile_revision,review_hash,client_id,client_name,service_engagement_id,service_type_id,service_name,scope_notes,recipient_emails_json,converted_by_membership_id,created_at) VALUES('conversion','fresh',?,?,?,2,?,'client','Garden client','engagement','service','Websites','Synthetic scope','[]','dest','2026-09-17T10:30:00.000Z')",t.id,crypto.randomUUID(),'a'.repeat(64),'b'.repeat(64));
 run(t.raw,"INSERT INTO activity_events(id,workspace_id,event_type,subject_type,subject_id,actor_membership_id,actor_user_id,occurred_at) VALUES('conversion-event','fresh','PROSPECT_CONVERTED','prospect',?,'dest','owner','2026-09-17T10:30:00.000Z')",t.id);
 // These records must not inflate Results.
 run(t.raw,"INSERT INTO activity_events(id,workspace_id,event_type,subject_type,subject_id,actor_membership_id,actor_user_id,occurred_at) VALUES('draft-only','fresh','PROSPECT_DRAFT_APPROVED','prospect','not-contacted','dest','owner','2026-09-17T10:00:00.000Z')");
 run(t.raw,"INSERT INTO prospect_reply_observations(id,workspace_id,prospect_id,delivery_id,account_email,provider_message_id,received_at,kind,match,observed_by_membership_id) VALUES('human-again','fresh',?,?,'hello@example.test','human-message-2','2026-09-17T10:19:00.000Z','reply_unreviewed','reply_chain','dest')",t.id,t.input.deliveryId);
 run(t.raw,"INSERT INTO prospect_reply_observations(id,workspace_id,prospect_id,delivery_id,account_email,provider_message_id,received_at,kind,match,observed_by_membership_id) VALUES('auto','fresh',?,?,'hello@example.test','auto-message','2026-09-17T10:20:00.000Z','automatic_response','reply_chain','dest')",t.id,t.input.deliveryId);
 const result=await getProspectResults(t.db,t.actor,{now:NOW});
 assert.deepEqual({...result,asOf:undefined},{peopleContacted:1,emailsSent:1,peopleReplied:1,interested:1,clients:1,replyRate:100,asOf:undefined,reportingBasis:'All recorded prospect activity in this workspace',replyCohort:'All provider-confirmed introductions in this workspace'});
});

test('Results is empty honestly for an active Admin and denies wrong-purpose, foreign and revoked actors',async context=>{
 const t=await sourceFixture(context),empty=await getProspectResults(t.db,t.actor,{now:NOW});
 assert.deepEqual(empty,{peopleContacted:0,emailsSent:0,peopleReplied:0,interested:0,clients:0,replyRate:null,asOf:NOW.toISOString(),reportingBasis:'All recorded prospect activity in this workspace',replyCohort:'All provider-confirmed introductions in this workspace'});
 run(t.raw,"UPDATE workspace_memberships SET role='admin' WHERE id='dest'");
 assert.deepEqual(await getProspectResults(t.db,{...t.actor,role:'admin'},{now:NOW}),empty);
 assert.equal(await getProspectResults(t.db,{...t.actor,workspaceId:'source',membershipId:'src'},{now:NOW}),null);
 for(const actor of [null,{...t.actor,role:'team_member'},{...t.actor,workspaceId:'foreign',membershipId:'other',userId:'stranger'}])assert.equal(await getProspectResults(t.db,actor,{now:NOW}),null);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");
 assert.equal(await getProspectResults(t.db,t.actor,{now:NOW}),null);
});
