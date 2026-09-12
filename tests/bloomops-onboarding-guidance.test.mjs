import "./_jsx.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { setup } from './_onboarding.mjs';
import { all, one, run, migrationFiles } from './_bloomops-db.mjs';
import { configureOnboardingItem } from '../lib/bloomops/onboarding-guidance.mjs';
import { mutateOnboardingItem } from '../lib/bloomops/onboarding-runtime.mjs';
import { onboardingView } from '../lib/bloomops/onboarding-views.mjs';
import { safeOnboardingUrl, validateOnboardingGuidance } from '../lib/bloomops/onboarding-guidance-values.mjs';
const input = (revision = 1, overrides = {}) => ({ revision, instructions: 'Use this private upload request to share your logo files.', actionType: 'upload', actionUrl: 'https://files.example.com/request/demo', ...overrides });
const configure = (t, value = input(), actor = t.admin, itemId = t.item('brand_assets').id, clientId = 'lawrence') => configureOnboardingItem(t.db, { actor, itemId, clientId, input: value });
const reset = (t, key = 'brand_assets') => run(t.raw, "UPDATE onboarding_items SET action_type='unconfigured',action_url=NULL,guidance_instructions=NULL,guidance_revision=0 WHERE id=?",t.item(key).id);

test('unconfigured existing steps wait for agency setup and cannot be submitted via API engine', async () => {
 const t = await setup(); reset(t);
 const dto = (await t.view()).items.find(i=>i.id===t.item('brand_assets').id);
 assert.equal(dto.guidanceReady,false); assert.equal(dto.canAct,false); assert.equal(dto.actionUrl,null);
 assert.equal((await t.mutate('brand_assets')).reason,'guidance_changed');
 assert.equal(t.item('brand_assets').status,'pending');
});
test('agency configures an existing instance without changing source text, templates or progress', async () => {
 const t=await setup(); const before=t.item('brand_assets');
 const templates=all(t.raw,'SELECT * FROM template_versions ORDER BY id');
 assert.equal((await configure(t)).ok,true);
 const after=t.item('brand_assets');
 for (const field of ['instructions','title','status','logical_key','required','verification_required','onboarding_instance_id']) assert.equal(after[field],before[field]);
 assert.deepEqual(all(t.raw,'SELECT * FROM template_versions ORDER BY id'),templates);
 const dto=(await t.view()).items.find(i=>i.id===after.id);
 assert.equal(dto.actionType,'upload');assert.equal(dto.actionUrl,input().actionUrl);assert.equal(dto.canAct,true);assert.equal(dto.guidanceRevision,2);
 const events=all(t.raw,"SELECT metadata_json FROM activity_events WHERE event_type='ONBOARDING_GUIDANCE_UPDATED'");
 assert.doesNotMatch(JSON.stringify(events),/https:|private upload/);
});
test('setup has stable no-op and stale revision protection',async()=>{
 const t=await setup();assert.equal((await configure(t)).ok,true);
 const count=one(t.raw,'SELECT count(*) n FROM activity_events').n;
 assert.deepEqual(await configure(t,input(2)),{ok:true,unchanged:true});
 assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,count);
 assert.equal((await configure(t,input(1,{instructions:'Stale'}))).reason,'conflict');
});
test('a stale Client cannot confirm instructions changed since their page loaded',async()=>{
 const t=await setup();assert.equal((await configure(t)).ok,true);
 assert.equal((await t.mutate('brand_assets','submit',t.client,{guidanceRevision:1})).reason,'guidance_changed');
 assert.equal(t.item('brand_assets').status,'pending');
 assert.equal((await t.mutate('brand_assets')).ok,true);
 assert.equal(t.item('brand_assets').status,'completed');
 assert.equal((await t.mutate('brand_assets')).unchanged,true);
});
test('opening/configuring a link is not evidence or completion; submitted guidance freezes',async()=>{
 const t=await setup();const item=t.item('kajabi_access');
 assert.equal((await configure(t,input(),t.admin,item.id)).ok,true);
 assert.equal(t.item('kajabi_access').status,'pending');
 assert.equal((await t.mutate('kajabi_access')).ok,true);
 assert.equal(t.item('kajabi_access').status,'in_progress');
 assert.equal((await configure(t,input(2),t.admin,item.id)).reason,'conflict');
 assert.equal((await t.mutate('kajabi_access','verify',t.admin)).ok,true);
 assert.equal(t.item('kajabi_access').status,'completed');
});
test('completed pre-upgrade items preserve their history without requiring setup',async()=>{
 const t=await setup();await t.mutate('agreement');const before=t.item('agreement');reset(t,'agreement');
 const dto=(await t.view()).items.find(i=>i.id===before.id);
 assert.equal(dto.state,'complete');assert.equal(dto.canAct,false);
 assert.equal(t.item('agreement').completed_at,before.completed_at);
 assert.equal((await configure(t,input(0),t.admin,before.id)).reason,'conflict');
});
for (const role of ['client','team_member']) test(`${role} cannot configure onboarding destinations`,async()=>{
 const t=await setup();const actor=role==='client'?t.client:await t.person('team','team_member');
 assert.equal((await configure(t,input(),actor)).ok,false);
});
test('foreign, wrong Client and hidden items do not leak or acquire configuration',async()=>{
 const t=await setup();
 assert.equal((await configure(t,input(),t.admin,t.item('brand_assets').id,'james')).reason,'not_found');
 assert.equal((await configure(t,input(),await t.actor('other@example.com'))).reason,'not_found');
 const id=t.extra('hidden_guidance');
 assert.equal((await configure(t,input(),t.admin,id)).ok,false);
 assert.equal((await t.view()).items.some(i=>i.id===id),false);
});
test('current suspension and contact unlink reject stale actors',async()=>{
 const t=await setup();run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id=?",t.admin.membershipId);
 assert.equal((await configure(t)).reason,'forbidden');
 run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE client_id='lawrence'");
 assert.equal((await t.mutate('brand_assets')).ok,false);
 assert.equal(await onboardingView(t.db,t.client,'lawrence',{portal:true}),null);
});
test('configuration rechecks authority inside the write batch and rolls back activity',async()=>{
 const t=await setup();const before=t.item('brand_assets');const count=one(t.raw,'SELECT count(*) n FROM activity_events').n;
 const batch=t.db.batch.bind(t.db);t.db.batch=async statements=>{
   run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id=?",t.admin.membershipId);
   return batch(statements);
 };
 assert.equal((await configure(t)).reason,'conflict');assert.deepEqual(t.item('brand_assets'),before);
 assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,count);
});
test('concurrent setup has one winner; late SQL failure rolls back all guidance',async()=>{
 const t=await setup();const result=await Promise.all([configure(t,input(1,{instructions:'Choice A'})),configure(t,input(1,{instructions:'Choice B'}))]);
 assert.equal(result.filter(r=>r.ok).length,1);assert.equal(t.item('brand_assets').guidance_revision,2);
 const before=t.item('brand_assets');
 run(t.raw,"CREATE TRIGGER fail_guidance BEFORE INSERT ON activity_events WHEN NEW.event_type='ONBOARDING_GUIDANCE_UPDATED' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 await assert.rejects(configure(t,input(2,{instructions:'Will roll back'})));
 assert.deepEqual(t.item('brand_assets'),before);
});
test('guidance changed after Client authorization cannot commit the stale confirmation',async()=>{
 const t=await setup();const batch=t.db.batch.bind(t.db);let once=true;
 t.db.batch=async statements=>{if(once){once=false;run(t.raw,"UPDATE onboarding_items SET guidance_revision=2,guidance_instructions='New instructions' WHERE id=?",t.item('brand_assets').id);}return batch(statements);};
 assert.equal((await t.mutate('brand_assets')).reason,'guidance_changed');assert.equal(t.item('brand_assets').status,'pending');
});
for(const url of ['javascript:alert(1)','data:text/html,hi','http://files.example.com','https://user:secret@files.example.com','https://localhost/a','https://127.0.0.1/a','https://[::1]/','https://files.example.com:444/a','https://files.example.com/\nsecret','https://files.example.com\\@evil.com','//files.example.com','https://internal','https://host.local/a']) test(`reject unsafe destination ${JSON.stringify(url)}`,()=>assert.equal(safeOnboardingUrl(url),null));
test('guidance validates exact fields, length, revision and explicit confirmation-only mode',()=>{
 assert.equal(validateOnboardingGuidance(input(0)).guidanceRevision,1);
 for(const value of [input(-1),input(2147483647),input(0,{instructions:''}),input(0,{instructions:'x'.repeat(2001)}),input(0,{workspaceId:'foreign'}),input(0,{actionType:'unconfigured'}),input(0,{actionType:'confirmation'})]) assert.equal(validateOnboardingGuidance(value),null);
 assert.equal(validateOnboardingGuidance(input(0,{actionType:'confirmation',actionUrl:null})).actionUrl,null);
});
test('additive migration preserves old rows and child references with FKs enabled',()=>{
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');const files=migrationFiles();
 for(const {url} of files.slice(0,-1))db.exec(readFileSync(url,'utf8'));
 db.exec("INSERT INTO workspaces(id,name,slug) VALUES('w','W','w'); INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('c','w','C','c'); INSERT INTO onboarding_instances(id,workspace_id,client_id) VALUES('n','w','c'); INSERT INTO onboarding_items(id,workspace_id,onboarding_instance_id,logical_key,title,status) VALUES('i','w','n','agreement','Agreement','completed');");
 db.exec("INSERT INTO user(id,name,email,email_verified) VALUES('u','U','u@example.test',1); INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('m','w','u','client','active'); INSERT INTO onboarding_item_submissions(onboarding_item_id,workspace_id,submitted_by_membership_id,submitted_at) VALUES('i','w','m','2026-09-12T00:00:00Z');");
 const child=db.prepare('SELECT * FROM onboarding_item_submissions').get();
 const before=db.prepare('SELECT * FROM onboarding_items').get();db.exec(readFileSync(files.at(-1).url,'utf8'));const after=db.prepare('SELECT * FROM onboarding_items').get();
 assert.deepEqual(db.prepare('SELECT * FROM onboarding_item_submissions').get(),child);
 for(const key of Object.keys(before))assert.equal(after[key],before[key]);assert.equal(after.action_type,'unconfigured');assert.equal(after.guidance_revision,0);
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.throws(()=>db.exec("UPDATE onboarding_items SET action_type='made-up'"));assert.throws(()=>db.exec('UPDATE onboarding_items SET guidance_revision=-1'));
 db.close();
});
test('real HTTP setup and Client confirmation preserve safe bodies and current revisions',async()=>{
 const t=await setup({auth:true});const { POST:manage }=await import('../app/api/bloomops/clients/[id]/onboarding/items/[itemId]/[operation]/route.js');
 const {POST:submit}=await import('../app/api/bloomops/portal/onboarding/[id]/items/[itemId]/submit/route.js');
 const admin=(await t.signIn('ary@example.com')).cookie,client=(await t.signIn('lawrence@example.com')).cookie;
 const call=(handler,cookie,body,operation='configure')=>{
  globalThis[Symbol.for('__cloudflare-context__')]={env:t.env,cf:{},ctx:{}};
  return handler(new Request('http://localhost:3000/api/bloomops/onboarding',{method:'POST',headers:{cookie,origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:'lawrence',itemId:t.item('brand_assets').id,operation})});
 };
 for(const body of [null,[],{},input(1,{actionUrl:'javascript:alert(1)'})])assert.equal((await call(manage,admin,body)).status,400);
 assert.equal((await call(manage,client,input())).status,404);
 const saved=await call(manage,admin,input());assert.equal(saved.status,200);assert.equal(saved.headers.get('cache-control'),'no-store');
 assert.equal((await call(submit,client,{guidanceRevision:1})).status,409);
 assert.equal((await call(submit,client,{guidanceRevision:2})).status,200);
 assert.equal((await call(submit,client,{guidanceRevision:2})).status,200);
 assert.equal((await call(manage,admin,input(2))).status,409);
});
