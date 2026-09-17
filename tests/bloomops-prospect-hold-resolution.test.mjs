import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repliesFixture} from './_prospect-replies-fixture.mjs';
import {one} from './_bloomops-db.mjs';
import {recordProspectContactFact} from '../lib/bloomops/prospect-contact-facts.mjs';
import {getProspectReplies,prospectReplyOverview} from '../lib/bloomops/prospect-replies.mjs';

test('a recorded human resolution leaves protection intact but removes the handled hold from active decisions',async c=>{
 const t=await repliesFixture(c);await t.check();const evidenceAt=new Date(t.row().updated_at),resolvedAt=new Date(evidenceAt.getTime()-60000),recordedAt=new Date(evidenceAt.getTime()+1000),command={workspaceId:t.actor.workspaceId,requestId:crypto.randomUUID(),kind:'resolved',occurredAt:resolvedAt.toISOString(),note:'Reviewed the saved reply and recorded the next manual step.'};
 assert.ok((await recordProspectContactFact(t.db,t.actor,t.id,command,recordedAt)).ok);assert.ok((await recordProspectContactFact(t.db,t.actor,t.id,command,recordedAt)).ok);
 const overview=await prospectReplyOverview(t.db,t.actor);assert.equal(overview.total,0);assert.equal(overview.handledTotal,1);assert.equal(overview.handledRows[0].resolutionNote,command.note);
 const review=await getProspectReplies(t.db,t.actor,t.env,t.id);assert.equal(review.resolution.current,true);assert.equal(review.resolution.note,command.note);assert.equal(t.row().hold_state,'held');assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE event_type='PROSPECT_REPLY_RESOLVED'").n,1);
 const denied=await prospectReplyOverview(t.db,{...t.actor,workspaceId:'foreign',membershipId:'other'});assert.deepEqual(denied.rows,[]);assert.deepEqual(denied.handledRows,[]);assert.equal(await getProspectReplies(t.db,{...t.actor,role:'client'},t.env,t.id),null);
});

test('newer saved evidence reopens a handled hold without duplicating or clearing evidence',async c=>{
 const t=await repliesFixture(c);await t.check();const evidenceAt=new Date(t.row().updated_at),resolvedAt=new Date(evidenceAt.getTime()-60000),recordedAt=new Date(evidenceAt.getTime()+1000);await recordProspectContactFact(t.db,t.actor,t.id,{workspaceId:t.actor.workspaceId,requestId:crypto.randomUUID(),kind:'resolved',occurredAt:resolvedAt.toISOString(),note:'Handled the first saved observation.'},recordedAt);
 await t.check({clock:()=>new Date(recordedAt.getTime()+32000),fetcher:async()=>Response.json(t.thread([]))});const overview=await prospectReplyOverview(t.db,t.actor);assert.equal(overview.total,1);assert.equal(overview.handledTotal,0);assert.equal(t.row().hold_state,'held');
});
