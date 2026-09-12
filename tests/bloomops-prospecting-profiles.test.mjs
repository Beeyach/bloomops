import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDb,run,one,all} from './_bloomops-db.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
import {resolveWorkspaceAccess} from '../lib/bloomops/membership.mjs';
import {createProspect,getProspect,listProspects,updateProspect} from '../lib/bloomops/prospects.mjs';
import {normalizeProspectFields} from '../lib/bloomops/prospect-values.mjs';
import {readStructuredBody} from '../lib/bloomops/structured-body.mjs';
async function setup(c){
 const t=testDb();c.after(()=>t.raw.close());
 for(const id of ['a','b']){
  run(t.raw,"INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,'prospecting')",id,id,id);
  run(t.raw,'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,id+'@example.com');
  run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')",'m-'+id,id,id);
 }
 t.actor=await loadActor(t.db,await resolveWorkspaceAccess(t.db,'a'));
 t.other=await loadActor(t.db,await resolveWorkspaceAccess(t.db,'b'));
 t.input={workspaceId:'a',requestId:crypto.randomUUID(),fields:{businessName:'Cedar House',personName:'Maya Reed',website:'https://example.com',platform:'Kajabi'}};
 t.create=async()=>{const r=await createProspect(t.db,{actor:t.actor,input:t.input});assert.ok(r.ok);return r.prospectId;};
 t.patch=(id,fields,extra={})=>updateProspect(t.db,{actor:t.actor,id,input:{workspaceId:'a',expectedRevision:1,fields,...extra}});return t;
}
test('manual profile, source checks, evidence and draft round trip without sent activity',async c=>{
 const t=await setup(c),id=await t.create();let r=await getProspect(t.db,t.actor,id);
 assert.equal(r.profile.fit,'unknown');assert.equal(r.profile.publicEmail,null);assert.equal(r.sources.length,4);assert.equal(r.activity.length,1);
 assert.ok((await t.patch(id,{publicEmail:'Hello@Example.com',fit:'strong',fitReason:'Relevant Kajabi work',observedFacts:'Public course page inspected',unknowns:'Backend email untested',proposedWork:'Offer page refinement',evidenceDate:'2026-09-12',evidenceTarget:'https://example.com/course',evidenceReport:'Public course reviewed',evidenceInteraction:'Opened public enrolment link',evidenceLimitations:'No checkout purchase',draftSubject:'A thought on your course',draftBody:'Hello Maya\nA manually written draft.'},{sources:{publicEmail:{url:'https://example.com/contact',checked:true}}})).ok);
 r=await getProspect(t.db,t.actor,id);assert.equal(r.profile.revision,2);assert.equal(r.profile.publicEmail,'hello@example.com');assert.equal(r.profile.evidenceDate,'2026-09-12');assert.match(r.profile.draftBody,/\n/);
 let source=r.sources.find(s=>s.fieldKey==='publicEmail');assert.equal(source.verification,'checked');assert.ok(source.checkedAt);assert.equal(source.actorName,'a');
 assert.ok((await t.patch(id,{publicEmail:'new@example.com'},{expectedRevision:2})).ok);
 r=await getProspect(t.db,t.actor,id);source=r.sources.find(s=>s.fieldKey==='publicEmail');assert.equal(source.verification,'unverified');assert.equal(source.checkedAt,null);
 assert.ok(r.activity.every(e=>['PROSPECT_CREATED','PROSPECT_UPDATED'].includes(e.eventType)));assert.ok(r.activity.every(e=>!JSON.stringify(e.metadata).includes('new@example.com')));
});
test('creation replay, concurrent updates and uncertain-response retries do not duplicate events',async c=>{
 const t=await setup(c);const [a,b]=await Promise.all([t.create(),t.create()]);assert.equal(a,b);
 assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,1);
 assert.equal((await createProspect(t.db,{actor:t.actor,input:{...t.input,fields:{businessName:'Changed'}}})).reason,'conflict');
 const result=await Promise.all([t.patch(a,{fit:'strong'}),t.patch(a,{fit:'hold'})]);assert.equal(result.filter(r=>r.ok).length,1);assert.equal(result.filter(r=>r.reason==='conflict').length,1);
 const r=await getProspect(t.db,t.actor,a);assert.equal(r.profile.revision,2);assert.equal(r.activity.length,2);
 assert.ok((await t.patch(a,{fit:r.profile.fit},{expectedRevision:2})).unchanged);assert.equal((await getProspect(t.db,t.actor,a)).activity.length,2);
});
test('source-only edits invalidate a check and explicit uncheck is durable',async c=>{
 const t=await setup(c),id=await t.create();
 assert.ok((await t.patch(id,{website:'https://example.com/'},{sources:{website:{url:'https://example.com/about',checked:true}}})).ok);
 assert.ok((await t.patch(id,{website:'https://example.com/'},{expectedRevision:2,sources:{website:{url:'https://example.com/new-source'}}})).ok);
 let r=await getProspect(t.db,t.actor,id);assert.equal(r.sources.find(s=>s.fieldKey==='website').verification,'unverified');
 assert.ok((await t.patch(id,{website:'https://example.com/'},{expectedRevision:3,sources:{website:{checked:true}}})).ok);
 assert.ok((await t.patch(id,{website:'https://example.com/'},{expectedRevision:4,sources:{website:{checked:false}}})).ok);
 r=await getProspect(t.db,t.actor,id);assert.equal(r.sources.find(s=>s.fieldKey==='website').checkedAt,null);
 assert.equal((await t.patch(id,{location:null},{expectedRevision:5,sources:{location:{checked:true}}})).reason,'invalid');
});
test('foreign scope, non-administrators, removed membership and wrong purpose deny reads and writes',async c=>{
 const t=await setup(c),id=await t.create();assert.equal(await getProspect(t.db,t.other,id),null);assert.equal((await listProspects(t.db,t.other)).rows.length,0);
 assert.equal((await updateProspect(t.db,{actor:t.other,id,input:{workspaceId:'b',expectedRevision:1,fields:{fit:'strong'}}})).ok,false);
 assert.equal((await t.patch(id,{workspaceId:'b'})).reason,'invalid');
 for(const role of ['project_manager','team_member','client']){const actor={...t.actor,role};assert.equal(await getProspect(t.db,actor,id),null);assert.equal((await createProspect(t.db,{actor,input:t.input})).ok,false);}
 run(t.raw,"UPDATE workspace_memberships SET status='removed' WHERE id='m-a'");assert.equal(await getProspect(t.db,t.actor,id),null);assert.equal((await t.patch(id,{fit:'skip'})).ok,false);assert.equal((await listProspects(t.db,t.actor)).rows.length,0);
 assert.equal(one(t.raw,'SELECT revision FROM bloomops_prospects').revision,1);
});
test('write-time revocation and failures cannot leave partial sources or activity',async c=>{
 const t=await setup(c),id=await t.create(),batch=t.d1.batch;
 t.d1.batch=async statements=>{run(t.raw,"UPDATE workspace_memberships SET role='team_member' WHERE id='m-a'");return batch(statements);};
 assert.equal((await t.patch(id,{fit:'strong'})).ok,false);assert.equal(one(t.raw,'SELECT revision FROM bloomops_prospects').revision,1);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,1);
 t.d1.batch=batch;run(t.raw,"UPDATE workspace_memberships SET role='owner' WHERE id='m-a'");
 run(t.raw,"CREATE TRIGGER fixture_reject_profile BEFORE UPDATE ON bloomops_prospects BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 await assert.rejects(()=>t.patch(id,{publicEmail:'hello@example.com'}));assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,1);assert.equal(one(t.raw,"SELECT count(*) n FROM prospect_field_sources WHERE field_key='publicEmail'").n,0);
});
test('list search treats wildcard characters literally and reads bounded pages',async c=>{
 const t=await setup(c);for(let i=0;i<52;i++)await createProspect(t.db,{actor:t.actor,input:{...t.input,requestId:crypto.randomUUID(),fields:{businessName:i===0?'100%_ Cedar':`Studio ${String(i).padStart(2,'0')}`}}});
 const first=await listProspects(t.db,t.actor);assert.equal(first.rows.length,50);assert.equal(first.more,true);assert.equal((await listProspects(t.db,t.actor,{page:2})).rows.length,2);
 assert.equal((await listProspects(t.db,t.actor,{q:'%_'})).rows.length,1);assert.equal((await listProspects(t.db,t.actor,{q:'missing'})).rows.length,0);
 for(const input of [{fit:'sent'},{page:-1},{page:10001},{q:'a'.repeat(161)}])assert.equal((await listProspects(t.db,t.actor,input)).invalid,true);
});
test('creation identity and cross-workspace source references are protected in SQL',async c=>{
 const t=await setup(c),id=await t.create();
 for(const q of ["UPDATE bloomops_prospects SET workspace_id='b',revision=2",'INSERT OR REPLACE INTO bloomops_prospects SELECT * FROM bloomops_prospects','DELETE FROM bloomops_prospects',"UPDATE prospect_field_sources SET workspace_id='b'", "UPDATE prospect_field_sources SET updated_by_membership_id='m-b'"])assert.throws(()=>run(t.raw,q));
 assert.equal(one(t.raw,'SELECT id FROM bloomops_prospects').id,id);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('normalization rejects active URLs, impossible dates and unstructured values',()=>{
 for(const fields of [{businessName:''},{website:'javascript:alert(1)'},{website:'https://user:secret@example.com'},{evidenceDate:'2026-02-30'},{publicEmail:'<script>'},{timeZone:'invented/timezone'},{fit:'contacted'},{unknownKey:'x'},{draftBody:'x'.repeat(12001)},{personName:42}])assert.equal(normalizeProspectFields(fields).ok,false,JSON.stringify(fields).slice(0,100));
});
test('bounded structured request reader rejects oversized, malformed and non-object payloads',async()=>{
 for(const body of ['[1]','null','{','"text"',JSON.stringify({x:'x'.repeat(65536)})])await assert.rejects(()=>readStructuredBody(new Request('https://example.com',{method:'POST',body})));
 assert.deepEqual(await readStructuredBody(new Request('https://example.com',{method:'POST',body:'{"fields":{"businessName":"Cedar"}}'})),{fields:{businessName:'Cedar'}});
});
