import {test} from 'node:test';
import assert from 'node:assert/strict';
import {schema} from '../lib/bloomops/db.mjs';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {all,run} from './_bloomops-db.mjs';
import {getProspectMailboxReview} from '../lib/bloomops/prospect-mailbox-review.mjs';
import {recoverProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';
test('current-account view is read-only and does not expose identity, provider or token fields',async c=>{
 const t=await mailboxFixture(c);t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 const before=all(t.raw,'SELECT * FROM activity_events');const r=await getProspectMailboxReview(t.db,t.actor,t.env);
 assert.equal(r.accountEmail,'hello@example.test');assert.equal(r.canRecover,true);assert.equal(r.total,1);assert.equal(r.registered,1);assert.equal(r.expectedRevision,0);assert.equal(r.latest,null);assert.deepEqual(r.history,[]);assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),before);
 assert.ok(!JSON.stringify(r).match(/tokenBox|synthetic-access|providerMessageId|historyId|actorStamp|messageId|snapshotJson/));
});
test('disabled, connection, missing-identity and revoked roles are explicit',async c=>{
 const t=await mailboxFixture(c);assert.equal((await getProspectMailboxReview(t.db,t.actor,t.env)).reason,'disabled');
 for(const role of ['client','team_member','project_manager'])assert.equal(await getProspectMailboxReview(t.db,{...t.actor,role},t.env),null);
 assert.equal(await getProspectMailboxReview(t.db,{...t.actor,workspaceId:'foreign'},t.env),null);
 const missing=await mailboxFixture(c,{registered:false});assert.equal((await getProspectMailboxReview(missing.db,missing.actor,missing.env)).reason,'thread_checks');
 run(t.raw,"UPDATE prospect_google_connections SET check_status='temporary'");assert.equal((await getProspectMailboxReview(t.db,t.actor,t.env)).reason,'connection');
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");assert.equal(await getProspectMailboxReview(t.db,t.actor,t.env),null);
});
test('saved summaries include actual collection/catch-up and keep coverage unverified',async c=>{
 const t=await mailboxFixture(c);t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{fetcher:async url=>{if(url.includes('/profile?'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(url.includes('/messages?'))return Response.json({});return new Response(null,{status:404});}});
 const r=await getProspectMailboxReview(t.db,t.actor,t.env);assert.equal(r.latest.catchupStatus,'unresolved');assert.equal(r.latest.matchedCount,0);assert.equal(r.coverage,'unverified');assert.equal(r.history.length,1);assert.equal(r.reason,'cooldown');assert.equal(r.canRecover,false);assert.ok(!JSON.stringify(r).match(/startHistoryId|catchupHistoryId|providerMessageId/));
});
test('read model reports current busy claim and follows account disconnect',async c=>{
 const t=await mailboxFixture(c);t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{fetcher:async url=>{const r=await getProspectMailboxReview(t.db,t.actor,t.env);assert.equal(r.reason,'busy');assert.equal(r.canRecover,false);return new Response(null,{status:503});}});
 run(t.raw,'UPDATE prospect_google_connections SET active=0');const r=await getProspectMailboxReview(t.db,t.actor,t.env);assert.equal(r.reason,'connect');assert.equal(r.accountEmail,null);assert.equal(r.latest,null);assert.deepEqual(r.history,[]);
});

for(const [name,mutation] of [
 ['suspended membership',"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'"],
 ['demoted membership',"UPDATE workspace_memberships SET role='team_member' WHERE id='dest'"],
 ['replaced account',"UPDATE prospect_google_connections SET account_email='different@example.test',revision=revision+1"],
 ['changed sender',"UPDATE prospect_senders SET revision=revision+1"],
])test('mid-read '+name+' cannot return the previously read mailbox',async c=>{
 const t=await mailboxFixture(c);t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';let changed=false;
 const select=t.db.select.bind(t.db);
 t.db.select=(...args)=>{const builder=select(...args),from=builder.from.bind(builder);builder.from=table=>{const query=from(table);if(table===schema.prospectGoogleConnections){const limit=query.limit.bind(query);query.limit=async n=>{const rows=await limit(n);run(t.raw,mutation);changed=true;return rows;};}return query;};return builder;};
 assert.equal(await getProspectMailboxReview(t.db,t.actor,t.env),null);assert.equal(changed,true);
});
