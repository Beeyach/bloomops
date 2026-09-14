import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testAuth,run,one,all,APP_URL} from './_bloomops-db.mjs';
import {getAccess,getActor} from '../lib/bloomops/access.mjs';
import {createProspectingWorkspace,listMyWorkspaces} from '../lib/bloomops/workspaces.mjs';
import {legacyAppAllowed} from '../lib/workspace.mjs';
import {DEFAULT_DEPARTMENTS,DEFAULT_SERVICE_TYPES,ensureWorkspaceServiceCatalog} from '../lib/bloomops/service-catalog.mjs';
import {selectedWorkspace} from '../lib/bloomops/workspace-selection.mjs';

async function setup(context){
 const t=testAuth();context.after(()=>t.raw.close());
 for(const id of ['original','other'])run(t.raw,'INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)',id,id,id);
 for(const [id,role] of [['ary','admin'],['owner','owner'],['pm','project_manager'],['team','team_member'],['client','client']]){
  run(t.raw,'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,`${id}@example.com`);
  run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'original',?,?,'active')",'m-'+id,id,role);
 }
 t.cookie=(await t.signIn('ary@example.com')).cookie;
 t.access=selector=>getAccess(new Request(APP_URL+'/prospecting',{headers:{cookie:t.cookie+(selector===undefined?'':`; bloomops.workspace=${selector}`)}}),{env:t.env});
 t.actor=await getActor(await t.access());
 t.input={name:'Fresh studio',sourceWorkspaceId:'original',requestId:crypto.randomUUID()};return t;
}
test('explicit workspace selection never supplies membership or falls back after revocation',async context=>{
 const t=await setup(context);assert.equal((await t.access()).workspace.id,'original');
 assert.equal((await t.access('other')).workspace,null);
 run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('second','other','ary','owner','active')");
 let reads=0;const prepare=t.d1.prepare;t.d1.prepare=q=>{reads++;return prepare(q);};
 assert.equal((await t.access('other')).workspace.id,'other');assert.equal(reads,1,'selection stays in the accepted joined identity read');
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='second'");
 assert.equal((await t.access('other')).workspace,null);assert.equal((await t.access()).workspace.id,'original');
 for(const v of ['', '%6friginal','original; bloomops.workspace=other','../original'])assert.equal((await t.access(v)).workspace,null);
 assert.equal(selectedWorkspace(new Headers()),null);
});
test('fresh workspace creation is concurrent retry-safe and preserves source users/history/voices',async context=>{
 const t=await setup(context);
 run(t.raw,'CREATE TABLE prospects(id INTEGER PRIMARY KEY,workspace TEXT,audit TEXT)');run(t.raw,"INSERT INTO prospects VALUES(1,'original','original audit')");
 run(t.raw,'CREATE TABLE settings(workspace TEXT,key TEXT,value TEXT)');run(t.raw,"INSERT INTO settings VALUES('original','voices','keep-all-original-clips')");
 const original={w:all(t.raw,'SELECT * FROM workspaces'),users:all(t.raw,'SELECT * FROM user'),prospects:all(t.raw,'SELECT * FROM prospects'),voices:all(t.raw,'SELECT * FROM settings')};
 const [a,b]=await Promise.all([createProspectingWorkspace(t.db,{actor:t.actor,input:t.input}),createProspectingWorkspace(t.db,{actor:t.actor,input:t.input})]);
 assert.ok(a.ok&&b.ok);assert.equal(a.workspaceId,b.workspaceId);assert.equal(one(t.raw,'SELECT count(*) n FROM workspace_creations').n,1);
 assert.deepEqual(all(t.raw,'SELECT * FROM workspaces WHERE purpose=\'operations\''),original.w);
 for(const [table,key] of [['user','users'],['prospects','prospects'],['settings','voices']])assert.deepEqual(all(t.raw,`SELECT * FROM ${table}`),original[key]);
 assert.equal(one(t.raw,'SELECT count(*) n FROM prospects WHERE workspace=?',`p-${a.workspaceId}`).n,0);
 const fresh=await t.access(a.workspaceId);assert.equal(fresh.membership.role,'owner');assert.equal(fresh.workspace.purpose,'prospecting');
 assert.equal(legacyAppAllowed(fresh),false);assert.equal(legacyAppAllowed(await t.access()),true);
 assert.deepEqual((await listMyWorkspaces(t.db,'ary')).map(w=>w.id).sort(),['original',a.workspaceId].sort());
 assert.equal((await createProspectingWorkspace(t.db,{actor:t.actor,input:{...t.input,name:'Changed'}})).reason,'conflict');
 run(t.raw,"UPDATE workspace_memberships SET status='removed' WHERE workspace_id=?",a.workspaceId);
 assert.equal((await createProspectingWorkspace(t.db,{actor:t.actor,input:t.input})).ok,false);
 assert.equal(one(t.raw,'SELECT count(*) n FROM workspaces').n,3);
});
test('creation rechecks source role/status under the write lock and rolls back partial failure',async context=>{
 const t=await setup(context),batch=t.d1.batch;
 t.d1.batch=async statements=>{run(t.raw,"UPDATE workspace_memberships SET role='team_member' WHERE id='m-ary'");return batch(statements);};
 assert.equal((await createProspectingWorkspace(t.db,{actor:t.actor,input:t.input})).ok,false);assert.equal(one(t.raw,'SELECT count(*) n FROM workspaces').n,2);
 t.d1.batch=batch;run(t.raw,"UPDATE workspace_memberships SET role='admin' WHERE id='m-ary'");
 run(t.raw,"CREATE TRIGGER reject_fixture_activity BEFORE INSERT ON activity_events WHEN NEW.event_type='WORKSPACE_CREATED' BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
 await assert.rejects(()=>createProspectingWorkspace(t.db,{actor:t.actor,input:t.input}));assert.equal(one(t.raw,'SELECT count(*) n FROM workspaces').n,2);assert.equal(one(t.raw,'SELECT count(*) n FROM workspace_creations').n,0);
});
test('workspace purpose and creation provenance cannot be rewritten by replacement',async context=>{
 const t=await setup(context),result=await createProspectingWorkspace(t.db,{actor:t.actor,input:t.input});assert.ok(result.ok);
 for(const q of ["UPDATE workspaces SET purpose='prospecting' WHERE id='original'","INSERT OR REPLACE INTO workspaces(id,name,slug,purpose) VALUES('original','Changed','original','prospecting')","UPDATE workspace_creations SET initial_name='Changed'","DELETE FROM workspace_creations","INSERT OR REPLACE INTO workspace_creations SELECT * FROM workspace_creations"] )assert.throws(()=>run(t.raw,q));
 for(const role of ['project_manager','team_member','client'])assert.equal((await createProspectingWorkspace(t.db,{actor:{...t.actor,role},input:{...t.input,requestId:crypto.randomUUID()}})).ok,false);
 assert.equal((await createProspectingWorkspace(t.db,{actor:t.actor,input:{...t.input,sourceWorkspaceId:'other'}})).ok,false);
});

test('fresh catalogue matches canonical defaults, stays workspace-local and preserves retry customizations',async context=>{
 const t=await setup(context);await ensureWorkspaceServiceCatalog(t.db,'original');
 const original={departments:all(t.raw,"SELECT * FROM departments WHERE workspace_id='original'"),types:all(t.raw,"SELECT * FROM service_types WHERE workspace_id='original'")};
 const [a,b]=await Promise.all([createProspectingWorkspace(t.db,{actor:t.actor,input:t.input}),createProspectingWorkspace(t.db,{actor:t.actor,input:t.input})]);assert.ok(a.ok&&b.ok);assert.equal(a.workspaceId,b.workspaceId);
 assert.deepEqual(all(t.raw,'SELECT name,slug,position FROM departments WHERE workspace_id=? ORDER BY position',a.workspaceId).map(row=>({...row})),DEFAULT_DEPARTMENTS.map(({name,slug,position})=>({name,slug,position})));
 assert.deepEqual(all(t.raw,'SELECT s.name,s.slug,d.slug department FROM service_types s JOIN departments d ON d.id=s.department_id AND d.workspace_id=s.workspace_id WHERE s.workspace_id=? ORDER BY s.slug',a.workspaceId).map(row=>({...row})),[...DEFAULT_SERVICE_TYPES].sort((a,b)=>a.slug.localeCompare(b.slug)));
 assert.deepEqual(all(t.raw,"SELECT * FROM departments WHERE workspace_id='original'"),original.departments);assert.deepEqual(all(t.raw,"SELECT * FROM service_types WHERE workspace_id='original'"),original.types);
 run(t.raw,"UPDATE service_types SET name='Custom GHL',active=0 WHERE workspace_id=? AND slug='ghl'",a.workspaceId);const before=all(t.raw,'SELECT * FROM service_types WHERE workspace_id=?',a.workspaceId);
 assert.equal((await createProspectingWorkspace(t.db,{actor:t.actor,input:t.input})).unchanged,true);assert.deepEqual(all(t.raw,'SELECT * FROM service_types WHERE workspace_id=?',a.workspaceId),before);
 for(const table of ['bloomops_clients','service_engagements','onboarding_instances'])assert.equal(one(t.raw,`SELECT count(*) n FROM ${table} WHERE workspace_id=?`,a.workspaceId).n,0);
});
test('catalogue failure rolls back the entire fresh workspace; revoked source creates no catalogue',async context=>{
 const t=await setup(context);run(t.raw,"CREATE TRIGGER reject_fixture_catalog BEFORE INSERT ON service_types WHEN NEW.slug='kajabi' BEGIN SELECT RAISE(ABORT,'fixture catalogue failure'); END");
 await assert.rejects(()=>createProspectingWorkspace(t.db,{actor:t.actor,input:t.input}),/fixture catalogue failure/);
 assert.equal(one(t.raw,'SELECT count(*) n FROM workspaces').n,2);for(const table of ['departments','service_types','workspace_creations','activity_events'])assert.equal(one(t.raw,`SELECT count(*) n FROM ${table}`).n,0);
 run(t.raw,'DROP TRIGGER reject_fixture_catalog');const batch=t.d1.batch;t.d1.batch=async statements=>{run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ary'");return batch(statements);};
 assert.equal((await createProspectingWorkspace(t.db,{actor:t.actor,input:t.input})).ok,false);assert.equal(one(t.raw,'SELECT count(*) n FROM departments').n,0);assert.equal(one(t.raw,'SELECT count(*) n FROM service_types').n,0);
});
