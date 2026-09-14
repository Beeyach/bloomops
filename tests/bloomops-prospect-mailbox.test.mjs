import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {one,all,run} from './_bloomops-db.mjs';
import {checkProspectMailbox,getProspectDiscoveryState} from '../lib/bloomops/prospect-mailbox.mjs';
import {getRecipientProtection} from '../lib/bloomops/prospect-recipient-protection.mjs';
const later=(offset=31000)=>()=>new Date(Date.now()+offset);
const runs=t=>all(t.raw,'SELECT * FROM prospect_discovery_runs');
const targets=t=>all(t.raw,'SELECT * FROM prospect_discovery_targets');
const observations=t=>all(t.raw,'SELECT * FROM prospect_reply_observations');
const count=(t,type)=>one(t.raw,'SELECT count(*) n FROM activity_events WHERE event_type=?',type).n;
function duplicate(t){const clone=(table,patch)=>{const v={...one(t.raw,'SELECT * FROM '+table),...patch};run(t.raw,`INSERT INTO ${table}(${Object.keys(v).join(',')}) VALUES(${Object.keys(v).map(()=>'?').join(',')})`,...Object.values(v));};clone('bloomops_prospects',{id:'other-prospect',creation_request_id:crypto.randomUUID()});clone('prospect_outreach_drafts',{id:'other-draft',prospect_id:'other-prospect'});clone('prospect_outreach_approvals',{id:'other-approval',draft_id:'other-draft'});clone('prospect_deliveries',{id:'other-delivery',prospect_id:'other-prospect',approval_id:'other-approval',message_id:'<bloomsi-87654321-1234-1234-1234-123456789012@bloomsi.invalid>',provider_message_id:'other-sent'});}
test('GET is local, read-only, authority-scoped and never creates a baseline',async c=>{
 const t=await mailboxFixture(c);assert.equal(await t.mailget(),null);assert.deepEqual(runs(t),[]);assert.deepEqual(targets(t),[]);
 await t.mailcheck();const dto=await t.mailget();assert.equal(dto.held,true);assert.equal(dto.hasBaseline,true);assert.equal(dto.coverageStatus,'unverified');assert.ok(!JSON.stringify(dto).match(/synthetic|historyId|sourceHistory|identityId|accountEmail|checkId/));
 assert.equal(await getProspectDiscoveryState(t.db,{...t.actor,workspaceId:'foreign'},'hello@example.test'),null);
 for(const role of ['client','team_member','project_manager'])assert.equal(await getProspectDiscoveryState(t.db,{...t.actor,role},'hello@example.test'),null);
});
test('first startup snapshots identities and holds recipients, without claiming historical coverage',async c=>{
 const t=await mailboxFixture(c),before=one(t.raw,'SELECT * FROM prospect_deliveries');let calls=0;
 assert.equal((await t.mailcheck({fetcher:async(url,init)=>{calls++;assert.ok(url.includes('/profile?'));assert.equal(init.method,'GET');assert.equal((await getRecipientProtection(t.db,t.actor,t.fields.recipient)).kind,'held');return t.mailfetch(url);}})).status,'checked');
 assert.equal(calls,1);assert.equal(t.mailstate().baseline_history_id,'9');assert.equal(t.mailstate().history_id,'9');assert.equal(t.mailstate().coverage_status,'unverified');assert.equal(t.mailstate().last_reason,'history_only');assert.equal(t.row().hold_state,'held');assert.equal(runs(t)[0].source_history_id,null);assert.equal(runs(t)[0].status,'checked');assert.equal(targets(t)[0].identity_id,one(t.raw,'SELECT id FROM prospect_delivery_identities').id);assert.equal(targets(t)[0].reply_revision,t.row().revision);assert.deepEqual(observations(t),[]);assert.equal(count(t,'PROSPECT_DISCOVERY_HELD'),1);assert.deepEqual(one(t.raw,'SELECT * FROM prospect_deliveries'),before);
});
test('incremental observations, events and cursor commit together; replay and empty reads retain holds',async c=>{
 const t=await mailboxFixture(c);await t.mailcheck();assert.equal((await t.mailcheck({clock:later()})).status,'checked');assert.equal(t.mailstate().history_id,'11');assert.equal(observations(t).length,1);assert.equal(observations(t)[0].match,'reply_chain');assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),1);
 await t.mailcheck({clock:later(62000)});assert.equal(t.mailstate().history_id,'13');assert.equal(observations(t).length,1);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),1);assert.equal(count(t,'PROSPECT_DISCOVERY_HELD'),1);
 await t.mailcheck({clock:later(93000),fetcher:async()=>Response.json({historyId:'14'})});assert.equal(t.mailstate().history_id,'14');assert.equal(t.mailstate().baseline_history_id,'9');assert.equal(t.mailstate().coverage_status,'unverified');assert.equal(t.row().hold_state,'held');
});
test('incomplete identity registry creates a durable gap and hold without any provider request',async c=>{
 const t=await mailboxFixture(c,{registered:false});let calls=0;assert.equal((await t.mailcheck({fetcher:async()=>{calls++;}})).status,'unresolved');assert.equal(calls,0);assert.equal(t.mailstate().history_id,null);assert.equal(t.mailstate().coverage_status,'gap');assert.equal(t.mailstate().last_reason,'identity_required');assert.equal(targets(t)[0].identity_id,null);assert.equal(t.row().hold_state,'held');
});
test('expired history never resets its cursor; later empty success preserves the earlier gap',async c=>{
 const t=await mailboxFixture(c);await t.mailcheck();let urls=[];
 await t.mailcheck({clock:later(),fetcher:async url=>{urls.push(url);return new Response(null,{status:404});}});
 assert.equal(urls.length,1);assert.ok(urls[0].includes('/history?'));assert.equal(t.mailstate().history_id,'9');assert.equal(t.mailstate().last_reason,'history_gap');assert.equal(t.mailstate().coverage_status,'gap');
 await t.mailcheck({clock:later(62000),fetcher:async()=>Response.json({historyId:'10'})});assert.equal(t.mailstate().history_id,'10');assert.equal(t.mailstate().baseline_history_id,'9');assert.equal(t.mailstate().coverage_status,'gap');assert.equal(t.row().hold_state,'held');
});
test('unattributed metadata and transport failures finalize unresolved with the original cursor',async c=>{
 for(const mode of ['unattributed','network']){const t=await mailboxFixture(c);await t.mailcheck();await t.mailcheck({clock:later(),fetcher:async url=>{if(mode==='network')throw Error('PRIVATE');if(url.includes('/history?'))return t.mailfetch(url);const m={...t.message('mailbox-reply',{'In-Reply-To':'<unknown@example.test>'}),threadId:'separate-thread'};return Response.json(m);}});assert.equal(t.mailstate().history_id,'9');assert.equal(runs(t)[1].status,'unresolved');assert.deepEqual(observations(t),[]);assert.ok(!JSON.stringify(await t.mailget()).includes('PRIVATE'));}
});
test('scope, flags, review, revisions and sessions reject before transport or state creation',async c=>{
 const t=await mailboxFixture(c),input=await t.mailcommand();let calls=0;const options={fetcher:async()=>{calls++;}};
 for(const patch of [{workspaceId:'foreign'},{accountEmail:'other@example.test'},{accountEmail:'HELLO@example.test'},{reviewed:false},{expectedRevision:2},{connectionRevision:99},{senderRevision:99},{historyId:'1'}]){const result=await checkProspectMailbox(t.db,t.actor,t.env,t.session,{...input,...patch},options);assert.ok(result.conflict||result.unavailable);}
 for(const env of [{BLOOMOPS_GOOGLE_DISCOVERY_ENABLED:'false'},{BLOOMOPS_ENV:'staging'},{BLOOMOPS_APP_URL:'https://example.test'},{BLOOMOPS_GOOGLE_DISCOVERY_WORKSPACE_ID:'foreign'},{BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL:'foreign@example.test'}])assert.ok((await checkProspectMailbox(t.db,t.actor,{...t.env,...env},t.session,input,options)).unavailable);
 for(const role of ['client','team_member','project_manager'])assert.equal(await checkProspectMailbox(t.db,{...t.actor,role},t.env,t.session,input,options),null);
 assert.ok((await checkProspectMailbox(t.db,t.actor,t.env,'invalid-session',input,options)).conflict);assert.equal(calls,0);assert.equal(t.mailstate(),undefined);
});
test('revoked current membership/account/grant prevents baseline access',async c=>{
 for(const change of ["UPDATE workspace_memberships SET status='suspended' WHERE id='dest'","UPDATE prospect_google_connections SET active=0","UPDATE prospect_google_connections SET account_email='foreign@example.test'","UPDATE prospect_google_connections SET check_status='temporary'"]){const t=await mailboxFixture(c);run(t.raw,change);let calls=0;const res=await t.mailcheck({fetcher:async()=>{calls++;}});assert.ok(res.conflict||res.unavailable);assert.equal(calls,0);assert.deepEqual(runs(t),[]);}
});
test('concurrent claims and cooldown permit one provider request and one durable run',async c=>{
 const t=await mailboxFixture(c),input=await t.mailcommand();let calls=0;const opts={fetcher:async url=>{calls++;return t.mailfetch(url);}};
 const results=await Promise.all([1,2].map(()=>checkProspectMailbox(t.db,t.actor,t.env,t.session,input,opts)));assert.equal(results.filter(x=>x.checked).length,1);assert.equal(calls,1);assert.equal(runs(t).length,1);assert.ok((await t.mailcheck(opts)).conflict);assert.equal(calls,1);
});
test('active exact-thread check prevents mailbox claim and overlapping transport',async c=>{
 const t=await mailboxFixture(c);let calls=0;
 await t.check({clock:later(),fetcher:async()=>{assert.ok((await t.mailcheck({fetcher:async()=>{calls++;}})).conflict);return Response.json(t.thread([]));}});
 assert.equal(calls,0);assert.equal(t.mailstate(),undefined);
});
test('manual stop, authority/session/grant/sender changes during transport discard cursor and observations',async c=>{
 for(const mutation of [null,"UPDATE session SET expires_at=0","UPDATE workspace_memberships SET updated_at='changed' WHERE id='dest'","UPDATE prospect_google_connections SET revision=revision+1","UPDATE prospect_senders SET revision=revision+1"]){const t=await mailboxFixture(c);const result=await t.mailcheck({fetcher:async url=>{if(mutation)run(t.raw,mutation);else await t.stop();return t.mailfetch(url);}});assert.ok(result.conflict);assert.equal(t.mailstate().history_id,null);assert.equal(t.mailstate().check_status,'checking');assert.equal(runs(t)[0].status,'checking');assert.deepEqual(observations(t),[]);assert.equal(count(t,'PROSPECT_DISCOVERY_CHECKED'),0);if(!mutation)assert.equal(t.row().hold_state,'stopped');}
});
test('a newly accepted delivery before or during transport invalidates the full-set snapshot',async c=>{
 for(const before of [false,true]){const t=await mailboxFixture(c);let calls=0;if(before){const batch=t.db.batch.bind(t.db);let first=true;t.db.batch=async values=>{const res=await batch(values);if(first){first=false;duplicate(t);}return res;};}
 const result=await t.mailcheck({fetcher:async url=>{calls++;if(!before)duplicate(t);return t.mailfetch(url);}});assert.ok(result.conflict);assert.equal(calls,before?0:1);assert.equal(t.mailstate().history_id,null);assert.equal(targets(t).length,1);assert.equal(count(t,'PROSPECT_DISCOVERY_CHECKED'),0);}
});
test('expired mailbox lease is superseded and its late response cannot overwrite the newer baseline',async c=>{
 const t=await mailboxFixture(c);let now=Date.now();const old=await t.mailcheck({clock:()=>new Date(now),fetcher:async()=>{now+=91000;assert.ok((await t.mailcheck({clock:()=>new Date(now),fetcher:async()=>Response.json({emailAddress:'hello@example.test',historyId:'12'})})).checked);return Response.json({emailAddress:'hello@example.test',historyId:'11'});}});
 assert.ok(old.conflict);assert.equal(t.mailstate().history_id,'12');assert.equal(runs(t)[0].status,'superseded');assert.equal(runs(t)[1].status,'checked');assert.equal(count(t,'PROSPECT_DISCOVERY_CHECKED'),1);assert.equal(targets(t).length,2);
});
for(const type of ['PROSPECT_DISCOVERY_STARTED','PROSPECT_DISCOVERY_HELD'])test(type+' failure rolls back the claim and recipient hold',async c=>{
 const t=await mailboxFixture(c),before=t.row();run(t.raw,`CREATE TRIGGER reject_mail_claim BEFORE INSERT ON activity_events WHEN NEW.event_type='${type}' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END`);await assert.rejects(()=>t.mailcheck(),/rollback/);assert.equal(t.mailstate(),undefined);assert.deepEqual(runs(t),[]);assert.deepEqual(targets(t),[]);assert.deepEqual(t.row(),before);
});
for(const type of ['PROSPECT_DISCOVERY_CHECKED','PROSPECT_REPLY_OBSERVED'])test(type+' failure rolls back terminal evidence and cursor but retains the claim hold',async c=>{
 const t=await mailboxFixture(c);await t.mailcheck();run(t.raw,`CREATE TRIGGER reject_mail_finish BEFORE INSERT ON activity_events WHEN NEW.event_type='${type}' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END`);await assert.rejects(()=>t.mailcheck({clock:later()}),/rollback/);assert.equal(t.mailstate().history_id,'9');assert.equal(t.mailstate().check_status,'checking');assert.equal(t.row().hold_state,'held');assert.equal(runs(t)[1].status,'checking');assert.deepEqual(observations(t),[]);
});
test('state/run/target schema protects tenant provenance, coverage, cursor and terminal evidence',async c=>{
 const t=await mailboxFixture(c);
 assert.throws(()=>run(t.raw,"INSERT INTO prospect_discovery_states(workspace_id,account_email,revision,history_id,baseline_history_id,coverage_status,check_status) VALUES('fresh','spoof@example.test',1,'9','9','unverified','checked')"),/unverified coverage/);
 await t.mailcheck();const record=runs(t)[0];
 for(const change of ["UPDATE prospect_discovery_states SET revision=revision+1,history_id='8'","UPDATE prospect_discovery_states SET revision=revision+1,history_id='10'","UPDATE prospect_discovery_states SET revision=revision+1,baseline_history_id='10'","DELETE FROM prospect_discovery_states","UPDATE prospect_discovery_runs SET reason='changed'","DELETE FROM prospect_discovery_runs","UPDATE prospect_discovery_targets SET reply_revision=reply_revision+1","DELETE FROM prospect_discovery_targets"]){assert.throws(()=>run(t.raw,change),/permanent|immutable/);}
 const target=targets(t)[0];assert.throws(()=>run(t.raw,'INSERT INTO prospect_discovery_targets(workspace_id,run_id,prospect_id,delivery_id,identity_id,reply_revision) VALUES(?,?,?,?,?,?)','foreign',record.id,target.prospect_id,target.delivery_id,target.identity_id,target.reply_revision),/snapshot|FOREIGN KEY/);
 await t.mailcheck({clock:later(),fetcher:async()=>new Response(null,{status:404})});assert.throws(()=>run(t.raw,"UPDATE prospect_discovery_states SET revision=revision+1,coverage_status='unverified'"),/permanent/);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('baseline numeric IDs remain strings beyond Number precision and invalid provider identity cannot seed progress',async c=>{
 const t=await mailboxFixture(c);await t.mailcheck({fetcher:async()=>Response.json({emailAddress:'hello@example.test',historyId:'9007199254740999'})});assert.equal(t.mailstate().history_id,'9007199254740999');
 for(const profile of [{emailAddress:'foreign@example.test',historyId:'10'},{emailAddress:'hello@example.test',historyId:'invalid'}]){const f=await mailboxFixture(c);assert.equal((await f.mailcheck({fetcher:async()=>Response.json(profile)})).status,'unresolved');assert.equal(f.mailstate().history_id,null);assert.equal(f.row().hold_state,'held');}
});
test('pre-existing manual stops remain intact through baseline and empty completion',async c=>{
 const t=await mailboxFixture(c);await t.stop();const stopped=t.row();await t.mailcheck();await t.mailcheck({clock:later(),fetcher:async()=>Response.json({historyId:'10'})});
 const after=t.row();assert.equal(after.hold_state,'stopped');for(const key of Object.keys(stopped).filter(x=>x.startsWith('stop')))assert.equal(after[key],stopped[key]);assert.equal((await getRecipientProtection(t.db,t.actor,t.fields.recipient)).kind,'stopped');
});
test('authority lost after atomic claim prevents transport and leaves the recoverable held run',async c=>{
 const t=await mailboxFixture(c),batch=t.db.batch.bind(t.db);let calls=0;
 t.db.batch=async items=>{const out=await batch(items);run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");return out;};
 assert.ok((await t.mailcheck({fetcher:async()=>{calls++;}})).conflict);assert.equal(calls,0);assert.equal(t.mailstate().check_status,'checking');assert.equal(t.row().hold_state,'held');
});
test('observation collision finalizes a gap without partial evidence or cursor advancement',async c=>{
 const t=await mailboxFixture(c);duplicate(t);
 const original=one(t.raw,'SELECT * FROM prospect_delivery_identities'),other=one(t.raw,"SELECT * FROM prospect_deliveries WHERE id='other-delivery'");
 run(t.raw,'INSERT INTO prospect_delivery_identities(id,workspace_id,prospect_id,delivery_id,account_email,provider_message_id,provider_thread_id,rfc_message_id,verified_by_membership_id,connection_revision,sender_revision) VALUES(?,?,?,?,?,?,?,?,?,?,?)','other-identity',other.workspace_id,other.prospect_id,other.id,other.account_email,other.provider_message_id,other.provider_thread_id,other.message_id,original.verified_by_membership_id,1,1);
 await t.mailcheck();
 run(t.raw,"INSERT INTO prospect_reply_observations(id,workspace_id,prospect_id,delivery_id,account_email,provider_message_id,received_at,kind,match,observed_by_membership_id) VALUES('competing',?,?,?,?,?,?,'reply_unreviewed','reply_chain',?)",other.workspace_id,other.prospect_id,other.id,other.account_email,'mailbox-reply',new Date().toISOString(),original.verified_by_membership_id);
 assert.equal((await t.mailcheck({clock:later()})).status,'unresolved');assert.equal(t.mailstate().last_reason,'observation_conflict');assert.equal(t.mailstate().history_id,'9');assert.equal(t.mailstate().coverage_status,'gap');assert.equal(observations(t).length,1);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),0);
});
test('100 accepted targets and40 observations stay within D1 statement parameter limits;101 targets refuse',async c=>{
 const t=await mailboxFixture(c);
 const originals=Object.fromEntries(['bloomops_prospects','prospect_outreach_drafts','prospect_outreach_approvals','prospect_deliveries','prospect_delivery_identities'].map(table=>[table,one(t.raw,'SELECT * FROM '+table)]));
 const clone=(table,patch)=>{const value={...originals[table],...patch};run(t.raw,`INSERT INTO ${table}(${Object.keys(value).join(',')}) VALUES(${Object.keys(value).map(()=>'?').join(',')})`,...Object.values(value));};
 const add=i=>{
  const id=crypto.randomUUID(),prospectId='many-prospect-'+i,draftId='many-draft-'+i,approvalId='many-approval-'+i,rfc='<bloomsi-'+id+'@bloomsi.invalid>';
  clone('bloomops_prospects',{id:prospectId,creation_request_id:crypto.randomUUID()});clone('prospect_outreach_drafts',{id:draftId,prospect_id:prospectId});clone('prospect_outreach_approvals',{id:approvalId,draft_id:draftId});
  clone('prospect_deliveries',{id,prospect_id:prospectId,approval_id:approvalId,message_id:rfc,provider_message_id:'many-sent-'+i,provider_thread_id:'many-thread-'+i});
  clone('prospect_delivery_identities',{id:'many-identity-'+i,prospect_id:prospectId,delivery_id:id,rfc_message_id:rfc,provider_message_id:'many-sent-'+i,provider_thread_id:'many-thread-'+i});
 };
 for(let i=1;i<100;i++)add(i);
 const batch=t.db.batch.bind(t.db);let max=0;t.db.batch=items=>{for(const item of items){const n=item.toSQL().params.length;max=Math.max(max,n);assert.ok(n<=100,'parameter count '+n);}return batch(items);};
 assert.equal((await t.mailcheck()).status,'checked');assert.equal(targets(t).length,100);
 const messages=Array.from({length:40},(_,i)=>({...t.message('many-reply-'+i),threadId:'separate-thread'}));
 assert.equal((await t.mailcheck({clock:later(),fetcher:async url=>url.includes('/history?')?Response.json({history:[{id:'10',messagesAdded:messages.map(m=>({message:{id:m.id,threadId:m.threadId}}))}],historyId:'11'}):Response.json(messages.find(m=>url.includes('/messages/'+m.id+'?')))})).status,'checked');
 assert.equal(observations(t).length,40);assert.equal(targets(t).length,200);assert.ok(max>0);
 add(100);let calls=0;assert.ok((await t.mailcheck({clock:later(62000),fetcher:async()=>{calls++;}})).unavailable);assert.equal(calls,0);assert.equal(runs(t).length,2);
});
