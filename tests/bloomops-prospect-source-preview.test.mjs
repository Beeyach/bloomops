import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {run,all} from './_bloomops-db.mjs';
import {classifyProspectEligibility} from '../lib/bloomops/prospect-eligibility.mjs';
import {listProspectSources,previewProspectSource,sourcePreviewInput} from '../lib/bloomops/prospect-source-preview.mjs';
const clean={business_name:'Raw Studio',domain:'example.com',stage:'New'};
test('classifier is conservative and never treats a New label as evidence on its own',()=>{
 assert.equal(classifyProspectEligibility(clean).status,'ready');
 for(const flag of ['contact','work','deleted'])assert.equal(classifyProspectEligibility({...clean,[flag]:1}).status,'worked');
 for(const flag of ['duplicate','unmatched','unclear','state','changed'])assert.equal(classifyProspectEligibility({...clean,[flag]:1}).status,'review');
 for(const patch of [{stage:'Contacted'},{stage:null},{business_name:null},{email:'bad email'},{domain:'n/a'},{domain:'javascript:alert(1)'},{business_name:'x'.repeat(181)}])assert.equal(classifyProspectEligibility({...clean,...patch}).status,'review');
});
test('source chooser and preview require explicit same-user administration of both workspaces',async c=>{
 const t=await sourceFixture(c);t.add();t.add({workspace:'foreign',business_name:'Private source'});
 assert.deepEqual((await listProspectSources(t.db,t.actor)).rows,[{id:'source',name:'source'}]);
 assert.deepEqual(await previewProspectSource(t.db,t.actor),{selectionRequired:true});
 for(const source of ['foreign','fresh','missing'])assert.equal(await previewProspectSource(t.db,t.actor,{source}),null);
 for(const role of ['team_member','project_manager','client'])assert.equal(await previewProspectSource(t.db,{...t.actor,role},{source:'source'}),null);
 const result=await previewProspectSource(t.db,t.actor,{source:'source'});assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,'ready');
 assert.equal(result.counts.ready,1);assert.equal(JSON.stringify(result).includes('Private source'),false);
});
test('stale actors lose source reads on either membership or workspace revocation',async c=>{
 const t=await sourceFixture(c);t.add();
 for(const [q,restore] of [["UPDATE workspace_memberships SET status='suspended' WHERE id='src'","UPDATE workspace_memberships SET status='active' WHERE id='src'"],["UPDATE workspace_memberships SET role='team_member' WHERE id='src'","UPDATE workspace_memberships SET role='owner' WHERE id='src'"],["UPDATE workspace_memberships SET status='removed' WHERE id='dest'","UPDATE workspace_memberships SET status='active' WHERE id='dest'"],["UPDATE workspaces SET status='suspended' WHERE id='source'","UPDATE workspaces SET status='active' WHERE id='source'"]]){
  run(t.raw,q);assert.equal(await previewProspectSource(t.db,t.actor,{source:'source'}),null);run(t.raw,restore);
 }
});
test('New rows with ledger history, stop state or an uncertain send attempt are excluded without leaking payloads',async c=>{
 const t=await sourceFixture(c),sent=t.add(),attempt=t.add(),audit=t.add(),stopped=t.add({do_not_contact:1}),replied=t.add(),job=t.add();
 run(t.raw,"INSERT INTO send_events(workspace,prospect_id,sent_at,dedupe_key,subject) VALUES('source',?,'2026-09-12','sent-1','SECRET SEND')",sent);
 run(t.raw,"INSERT INTO send_attempts(workspace,prospect_id,attempt_key,state) VALUES('source',?,'attempt-1','in-flight')",attempt);
 run(t.raw,"INSERT INTO outreach_packages(workspace,prospect_id,evidence) VALUES('source',?,'SECRET AUDIT')",audit);
 run(t.raw,"INSERT INTO reply_events(workspace,prospect_id,message_id,occurred_at,snippet) VALUES('source',?,'reply-1','2026-09-12','SECRET REPLY')",replied);
 run(t.raw,"INSERT INTO jobs(workspace,prospect_id,kind,payload) VALUES('source',?,'prepare-outreach','SECRET JOB')",job);
 const before=all(t.raw,'SELECT * FROM prospects'),events=all(t.raw,'SELECT * FROM send_events');
 const result=await previewProspectSource(t.db,t.actor,{source:'source'});
 assert.equal(result.rows.length,6);assert.ok(result.rows.every(r=>r.status==='worked'));assert.equal(JSON.stringify(result).includes('SECRET'),false);
 assert.deepEqual(all(t.raw,'SELECT * FROM prospects'),before);assert.deepEqual(all(t.raw,'SELECT * FROM send_events'),events);
 assert.deepEqual(result.counts,{ready:0,worked:6,review:0});
});
test('notes, malformed counters, duplicate deleted identities and unmatched mail are set aside',async c=>{
 const t=await sourceFixture(c);t.add({info:'Raw notes mixed with prior outreach'});t.add({emails_sent:-1});t.add({emails_sent:'unknown'});
 t.add({email:'same@example.test'});t.add({email:' SAME@example.test ',deleted_at:'2026-09-12'});const pending=t.add({email:'reply@example.test'});t.add({updated_at:'2026-09-13 00:00:00'});
 run(t.raw,"INSERT INTO unmatched_replies(workspace,message_id,from_address) VALUES('source','u-1','REPLY@example.test')");
 const r=await previewProspectSource(t.db,t.actor,{source:'source'});assert.equal(r.counts.ready,0);assert.equal(r.counts.review,6);assert.equal(r.counts.worked,1);assert.ok(r.rows.find(r=>r.id===pending).reasons.includes('unmatched'));
});
test('missing evidence schema fails closed, not as a clean empty history',async c=>{
 const t=await sourceFixture(c);t.add();run(t.raw,'DROP TABLE send_attempts');
 assert.deepEqual(await previewProspectSource(t.db,t.actor,{source:'source'}),{unavailable:true});
});
test('keyset pages are bounded, reconcile counts, and reject unsafe cursor/input',async c=>{
 const t=await sourceFixture(c);for(let i=0;i<52;i++)t.add({business_name:'Studio '+i});
 const a=await previewProspectSource(t.db,t.actor,{source:'source'}),b=await previewProspectSource(t.db,t.actor,{source:'source',after:String(a.nextAfter)});
 assert.equal(a.rows.length,50);assert.equal(a.more,true);assert.equal(b.rows.length,2);assert.equal(b.more,false);assert.equal(new Set([...a.rows,...b.rows].map(r=>r.id)).size,52);assert.equal(a.counts.ready+b.counts.ready,52);
 for(const input of [{source:'x',after:'-1'},{source:'x',after:'1 OR 1=1'},{source:'x',after:'9007199254740992'},{source:'x',extra:'x'}])assert.equal(sourcePreviewInput(input),null);
});
test('revocation between source selection and data query cannot expose cached source records',async c=>{
 const t=await sourceFixture(c);t.add();const prepare=t.d1.prepare;let revoked=false;
 t.d1.prepare=q=>{if(q.includes('FROM prospects p')&&!revoked){revoked=true;run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='src'");}return prepare(q);};
 assert.equal(await previewProspectSource(t.db,t.actor,{source:'source'}),null);assert.equal(revoked,true);
});
