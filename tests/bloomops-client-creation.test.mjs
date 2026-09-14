import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, run, one, all } from './_bloomops-db.mjs';
import { createClient } from '../lib/bloomops/clients.mjs';
import { readClientCreationRecovery } from '../lib/bloomops/client-creation.mjs';

function fixture(t) {
  const s = testDb(); t.after(() => s.raw.close());
  for (const id of ['w', 'other']) run(s.raw, 'INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', id, id, id);
  s.actors = {};
  for (const [id, role] of [['owner','owner'],['admin','admin'],['pm','project_manager'],['team','team_member'],['client','client']]) {
    run(s.raw, 'INSERT INTO user(id,name,email) VALUES(?,?,?)', id, id, id+'@example.test');
    run(s.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'w',?,?,'active')", id, id, role);
    s.actors[id] = { workspaceId:'w', userId:id, membershipId:id, role, status:'active', scope:{kind:'workspace'} };
  }
  run(s.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('other-owner','other','owner','owner','active')");
  s.input = { requestId:crypto.randomUUID(), userId:'owner', workspaceId:'w', name:'Garden', contactName:'Rae', contactEmail:'RAE@example.test', website:'garden.example', ownerMembershipId:'pm' };
  s.create = (input=s.input, who='owner', workspaceId='w') => createClient(s.db, {workspaceId, actorUserId:who, actorMembershipId:workspaceId==='other'?'other-owner':who, input});
  s.read = (input=s.input, who='owner') => readClientCreationRecovery(s.db,s.actors[who],{userId:input.userId,workspaceId:input.workspaceId,requestId:input.requestId});
  s.data = () => ['bloomops_clients','client_contacts','activity_events','client_creation_receipts','workspace_invitations','onboarding_instances'].map(table => all(s.raw,'SELECT * FROM '+table));
  return s;
}

test('one creation receipt preserves the canonical Draft/contact/activity transaction and no invitation',async t=>{
  const s=fixture(t), result=await s.create(); assert.ok(result.ok); assert.equal(result.unchanged,false);
  const c=one(s.raw,'SELECT * FROM bloomops_clients');assert.equal(c.relationship_status,'draft');assert.equal(c.health,'on_track');assert.equal(c.owner_membership_id,'pm');
  const contact=one(s.raw,'SELECT * FROM client_contacts');assert.equal(contact.user_id,null);assert.equal(contact.is_primary,1);assert.equal(contact.email,'rae@example.test');
  assert.deepEqual(s.data().map(rows=>rows.length),[1,1,1,1,0,0]);
  const before=s.data(); const replay=await s.create({...s.input,name:' Garden ',contactEmail:'rae@example.test',website:'https://garden.example/'});
  assert.equal(replay.clientId,result.clientId); assert.equal(replay.unchanged,true);assert.deepEqual(s.data(),before);
  assert.deepEqual((await s.read()).client,{id:result.clientId,name:'Garden'});assert.deepEqual(s.data(),before);
});
test('concurrent exact submissions share one receipt and one client',async t=>{
 const s=fixture(t),[a,b]=await Promise.all([s.create(),s.create()]);assert.ok(a.ok);assert.ok(b.ok);assert.equal(a.clientId,b.clientId);assert.deepEqual(s.data().map(r=>r.length),[1,1,1,1,0,0]);
});
test('changed input or another user cannot reuse a receipt to create or overwrite a client',async t=>{
 const s=fixture(t);await s.create();const before=s.data();assert.equal((await s.create({...s.input,name:'Later text'})).reason,'conflict');
 assert.equal((await s.create({...s.input,userId:'admin'},'admin')).reason,'conflict');assert.equal((await s.read({...s.input,userId:'admin'},'admin')).client,null);assert.deepEqual(s.data(),before);
});
test('lost committed reply is discoverable after later canonical edits without another client or activity',async t=>{
 const s=fixture(t);await s.create();run(s.raw,"UPDATE bloomops_clients SET name='Later canonical name',slug='later',relationship_status='active' WHERE workspace_id='w'");
 run(s.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='pm'");const before=s.data();const result=await s.create();assert.ok(result.ok);assert.equal(result.slug,'later');assert.equal((await s.read()).client.name,'Later canonical name');assert.deepEqual(s.data(),before);
});
for(const who of ['owner','admin','pm'])test('current '+who+' may create and recover',async t=>{const s=fixture(t),input={...s.input,userId:who};assert.ok((await s.create(input,who)).ok);assert.equal((await s.read(input,who)).status,200);});
for(const who of ['team','client'])test(who+' cannot create or recover with direct domain access',async t=>{const s=fixture(t),input={...s.input,userId:who},before=s.data();assert.equal((await s.create(input,who)).reason,'not_found');assert.equal((await s.read(input,who)).status,404);assert.deepEqual(s.data(),before);});
for(const mutation of ["UPDATE workspace_memberships SET status='suspended' WHERE id='owner'", "UPDATE workspace_memberships SET role='team_member' WHERE id='owner'", "UPDATE workspaces SET status='archived' WHERE id='w'", "UPDATE workspace_memberships SET status='suspended' WHERE id='pm'", "UPDATE workspace_memberships SET role='team_member' WHERE id='pm'"])test('creation rechecks live transaction eligibility: '+mutation,async t=>{
 const s=fixture(t),batch=s.db.batch.bind(s.db);s.db.batch=async statements=>{run(s.raw,mutation);return batch(statements);};const before=s.data();assert.equal((await s.create()).reason,mutation.includes("id='pm'")?'conflict':'not_found');assert.deepEqual(s.data(),before);
});
test('revocation blocks receipt reads and replays despite a previously loaded actor',async t=>{const s=fixture(t);await s.create();run(s.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='owner'");const before=s.data();assert.equal((await s.read()).status,404);assert.equal((await s.create()).reason,'not_found');assert.deepEqual(s.data(),before);});
test('receipt failure rolls back client, contact and activity',async t=>{const s=fixture(t);run(s.raw,"CREATE TRIGGER reject_receipt BEFORE INSERT ON client_creation_receipts BEGIN SELECT RAISE(ABORT,'fixture'); END");const before=s.data();await assert.rejects(s.create());assert.deepEqual(s.data(),before);});
test('receipt is immutable and cannot refer to a foreign workspace client',async t=>{const s=fixture(t);await s.create();assert.throws(()=>run(s.raw,"UPDATE client_creation_receipts SET fingerprint=?",'f'.repeat(64)),/immutable/);assert.throws(()=>run(s.raw,'DELETE FROM client_creation_receipts'),/immutable/);const id=one(s.raw,'SELECT id FROM bloomops_clients').id;assert.throws(()=>run(s.raw,"INSERT INTO client_creation_receipts(workspace_id,request_id,user_id,client_id,fingerprint) VALUES('other',?,'owner',?,?)",crypto.randomUUID(),id,'f'.repeat(64)),/FOREIGN KEY/);});
test('bound input rejects missing/foreign identity, workspace and invalid request IDs',async t=>{const s=fixture(t),before=s.data();for(const patch of [{userId:'admin'},{userId:null},{workspaceId:'other'}])assert.equal((await s.create({...s.input,...patch})).reason,'not_found');for(const requestId of ['',null,{},'not-an-id'])assert.equal((await s.create({...s.input,requestId})).reason,'invalid');assert.equal((await s.read({...s.input,userId:'admin'})).status,403);assert.equal((await s.read({...s.input,workspaceId:'other'})).status,403);assert.equal((await readClientCreationRecovery(s.db,s.actors.owner,{userId:'owner',workspaceId:'w',requestId:s.input.requestId,extra:true})).status,400);assert.deepEqual(s.data(),before);});
test('same request in an explicitly selected different workspace creates only its own record',async t=>{const s=fixture(t);const a=await s.create(),b=await s.create({...s.input,workspaceId:'other',ownerMembershipId:''},'owner','other');assert.ok(b.ok);assert.notEqual(a.clientId,b.clientId);assert.equal(one(s.raw,'SELECT workspace_id FROM bloomops_clients WHERE id=?',b.clientId).workspace_id,'other');});
test('legacy unbound creation keeps its API while rechecking live actor authority',async t=>{const s=fixture(t),{requestId,userId,workspaceId,...legacy}=s.input;assert.ok((await s.create(legacy)).ok);assert.equal(s.data()[3].length,0);run(s.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='owner'");const before=s.data();assert.equal((await s.create(legacy)).reason,'not_found');assert.deepEqual(s.data(),before);});
