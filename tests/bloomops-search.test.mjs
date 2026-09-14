import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchFixture} from './_search-fixture.mjs';
import {run,one} from './_bloomops-db.mjs';
import {searchRecords} from '../lib/bloomops/search.mjs';
import {createWorkspacePage,saveWorkspacePage} from '../lib/bloomops/pages.mjs';
import {getWorkspacePageTree} from '../lib/bloomops/page-hierarchy.mjs';
import {updatePageSharing} from '../lib/bloomops/page-sharing.mjs';
import {createProject} from '../lib/bloomops/projects.mjs';
import {createAction} from '../lib/bloomops/actions.mjs';
import {createProspect} from '../lib/bloomops/prospects.mjs';
import {uploadFile} from '../lib/bloomops/files.mjs';
import {createContent} from '../lib/bloomops/content.mjs';
import {uploadContentFile} from '../lib/bloomops/content-files.mjs';
const ids=r=>r.groups.flatMap(g=>g.rows.map(row=>row.id));
test('all five canonical types, minimal DTOs and zero writes',async c=>{
 const t=await searchFixture(c),before=t.snapshot(),r=await searchRecords(t.db,t.owner,t.input(t.owner));assert.equal(r.status,200);
 for(const id of [t.prospectId,'client',t.actionId,t.pageId,t.fileId])assert.ok(ids(r).includes(id),String(id));
 assert.ok(!ids(r).includes('foreign-client'));assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.deepEqual(t.snapshot(),before);
 for(const g of r.groups)for(const row of g.rows)assert.deepEqual(Object.keys(row),['id','title','detail','website','href']);
 assert.match(r.groups.find(g=>g.type==='files').rows[0].href,/\/download$/);
});
test('PM and Team respect exact client, Action, Page and File authority',async c=>{
 const t=await searchFixture(c),pm=await t.actor('pm'),team=await t.actor('team');
 let r=await searchRecords(t.db,pm,t.input(pm));assert.ok(ids(r).includes('client'));assert.ok(ids(r).includes(t.actionId));assert.ok(!ids(r).includes(t.pageId));assert.ok(!ids(r).includes(t.prospectId));
 assert.deepEqual(ids(await searchRecords(t.db,team,t.input(team))),[]);
 run(t.raw,"INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','client','m-team')");
 r=await searchRecords(t.db,team,t.input(team));assert.ok(ids(r).includes('client'));assert.ok(ids(r).includes(t.actionId));assert.ok(ids(r).includes(t.fileId));
 run(t.raw,"DELETE FROM client_assignments WHERE membership_id='m-team'");assert.deepEqual(ids(await searchRecords(t.db,team,t.input(team))),[],'cached actor does not retain revoked assignment');
 run(t.raw,"UPDATE actions SET visibility='restricted',assignee_membership_id='m-team' WHERE id=?",t.actionId);
 r=await searchRecords(t.db,team,t.input(team));assert.deepEqual(ids(r),[t.actionId]);assert.ok(!JSON.stringify(r).includes('PRIVATE_PROJECT'));
});
test('client portal sees only shared Page titles and ready downloadable files',async c=>{
 const t=await searchFixture(c),actor=await t.actor('client');
 let r=await searchRecords(t.db,actor,t.input(actor));assert.deepEqual(r.groups.map(g=>g.type),['pages','files']);assert.deepEqual(ids(r),[t.fileId]);
 await updatePageSharing(t.db,t.owner,t.pageId,{workspaceId:'a',expectedTreeRevision:(await getWorkspacePageTree(t.db,t.owner)).revision,kind:'grant',membershipId:'m-client',permission:'view'});
 r=await searchRecords(t.db,actor,t.input(actor));assert.ok(ids(r).includes(t.pageId));assert.ok(r.groups[0].rows[0].href.startsWith('/portal/pages/'));
 run(t.raw,"UPDATE assets SET visibility='internal' WHERE id=?",t.fileId);assert.deepEqual(ids(await searchRecords(t.db,actor,t.input(actor))),[t.pageId]);
 run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE id='c-client'");assert.deepEqual(ids(await searchRecords(t.db,actor,t.input(actor))),[]);
 assert.equal((await searchRecords(t.db,actor,t.input(actor,{type:'clients'}))).status,400);
});
test('inherited Page grants, explicit deny and private bodies do not leak through matches',async c=>{
 const t=await searchFixture(c),actor=await t.actor('team');
 const tree=()=>getWorkspacePageTree(t.db,t.owner);
 const child=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',parentId:t.pageId,expectedTreeRevision:(await tree()).revision,requestId:crypto.randomUUID()})).id;
 await saveWorkspacePage(t.db,t.owner,child,{workspaceId:'a',expectedRevision:1,title:'Garden child',body:'PRIVATE_BODY'});
 await updatePageSharing(t.db,t.owner,t.pageId,{workspaceId:'a',expectedTreeRevision:(await tree()).revision,kind:'grant',membershipId:'m-team',permission:'view'});
 assert.equal(ids(await searchRecords(t.db,actor,t.input(actor))).length,2);
 await updatePageSharing(t.db,t.owner,child,{workspaceId:'a',expectedTreeRevision:(await tree()).revision,kind:'grant',membershipId:'m-team',permission:'none'});
 assert.deepEqual(ids(await searchRecords(t.db,actor,t.input(actor))),[t.pageId]);
 assert.deepEqual(ids(await searchRecords(t.db,t.owner,t.input(t.owner,{q:'PRIVATE_BODY'}))),[]);
});
for(const change of ["UPDATE workspace_memberships SET status='suspended' WHERE id='m-owner'","UPDATE workspace_memberships SET role='team_member' WHERE id='m-owner'","UPDATE workspaces SET status='suspended' WHERE id='a'"])
test('live batch rejects stale actor: '+change,async c=>{const t=await searchFixture(c),batch=t.d1.batch;t.d1.batch=async statements=>{run(t.raw,change);return batch(statements);};assert.equal((await searchRecords(t.db,t.owner,t.input(t.owner))).status,403);});
test('identity/workspace binding, invalid inputs and literal wildcard searches',async c=>{
 const t=await searchFixture(c);for(const patch of [{userId:'foreign'},{workspaceId:'b'}])assert.equal((await searchRecords(t.db,t.owner,t.input(t.owner,patch))).status,403);
 for(const patch of [{q:''},{q:'a'},{q:'x'.repeat(121)},{q:'bad\nquery'},{type:'invented'},{page:0},{page:101},{page:2},{extra:'bad'}])assert.equal((await searchRecords(t.db,t.owner,t.input(t.owner,patch))).status,400);
 for(const q of ['%_','!!',"';DROP TABLE user;--"]){assert.deepEqual(ids(await searchRecords(t.db,t.owner,t.input(t.owner,{q}))),[]);}
 assert.ok(one(t.raw,'SELECT count(*) n FROM user').n>0);
});
test('bounded results, stable pagination and repeated titles',async c=>{
 const t=await searchFixture(c);for(let n=0;n<45;n++)run(t.raw,"INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,'a','Garden duplicate',?)",'duplicate-'+String(n).padStart(3,'0'),'duplicate-'+n);
 const overview=await searchRecords(t.db,t.owner,t.input(t.owner));assert.equal(overview.groups.find(g=>g.type==='clients').rows.length,5);assert.equal(overview.groups.find(g=>g.type==='clients').more,true);
 const first=await searchRecords(t.db,t.owner,t.input(t.owner,{type:'clients'})),second=await searchRecords(t.db,t.owner,t.input(t.owner,{type:'clients',page:2}));assert.equal(ids(first).length,20);assert.equal(ids(second).length,20);assert.ok(!ids(first).some(id=>ids(second).includes(id)));assert.deepEqual(await searchRecords(t.db,t.owner,t.input(t.owner,{type:'clients'})),first);
});
test('foreign records of every type stay outside results and more flags',async c=>{
 const t=await searchFixture(c),actor=await t.actor('foreign'),before=await searchRecords(t.db,t.owner,t.input(t.owner));
 const project=await createProject(t.db,{actor,clientId:'foreign-client',input:{name:'Garden foreign project'}});assert.ok(project.ok);
 assert.ok((await createAction(t.db,{actor,projectId:project.projectId,requestId:crypto.randomUUID(),input:{title:'Garden foreign task'}})).ok);
 assert.ok((await createProspect(t.db,{actor,input:{workspaceId:'b',requestId:crypto.randomUUID(),fields:{businessName:'Garden foreign prospect'}}})).ok);
 const page=await createWorkspacePage(t.db,actor,{workspaceId:'b',requestId:crypto.randomUUID()});assert.ok(page.ok);assert.ok((await saveWorkspacePage(t.db,actor,page.id,{workspaceId:'b',expectedRevision:1,title:'Garden foreign page',body:'secret'})).ok);
 const bytes=new TextEncoder().encode('foreign');assert.ok((await uploadFile(t.db,{actor,bucket:t.bucket,projectId:project.projectId,bytes,input:{requestId:crypto.randomUUID(),filename:'Garden foreign.txt',mimeType:'text/plain',byteSize:bytes.length}})).ok);
 assert.deepEqual(await searchRecords(t.db,t.owner,t.input(t.owner)),before);
});
test('File parent visibility and readiness are live, including non-video Content assets',async c=>{
 const t=await searchFixture(c),client=await t.actor('client'),pm=await t.actor('pm');
 run(t.raw,"UPDATE projects SET visibility='restricted' WHERE id=?",t.projectId);
 for(const actor of [client,pm])assert.deepEqual(ids(await searchRecords(t.db,actor,t.input(actor,{type:'files'}))),[]);
 assert.deepEqual(ids(await searchRecords(t.db,t.owner,t.input(t.owner,{type:'files'}))),[t.fileId]);
 run(t.raw,"UPDATE assets SET status='archived',archived_at='2026-09-14T00:00:00Z' WHERE id=?",t.fileId);assert.deepEqual(ids(await searchRecords(t.db,t.owner,t.input(t.owner,{type:'files'}))),[]);
 const item=await createContent(t.db,{actor:t.owner,clientId:'client',requestId:crypto.randomUUID(),input:{title:'PRIVATE_EDITORIAL',type:'static_post',visibility:'client'}});assert.ok(item.ok);
 const bytes=new TextEncoder().encode('Private editorial source');const file=await uploadContentFile(t.db,{actor:t.owner,bucket:t.bucket,contentId:item.contentId,bytes,input:{requestId:crypto.randomUUID(),filename:'Garden static brief.txt',mimeType:'text/plain',byteSize:bytes.length,purpose:'asset',visibility:'client'}});assert.ok(file.ok);
 assert.deepEqual(ids(await searchRecords(t.db,t.owner,t.input(t.owner,{type:'files'}))),[file.fileId]);assert.deepEqual(ids(await searchRecords(t.db,client,t.input(client,{type:'files'}))),[]);
});
test('single bounded read batch for each role and no work for malformed input',async c=>{
 const t=await searchFixture(c);let count=0;const batch=t.d1.batch;t.d1.batch=s=>{count++;assert.ok(s.length<=6);return batch(s);};
 const sizes=[],prepare=t.d1.prepare;t.d1.prepare=q=>{assert.match(q,/^(select|with)\b/i);const s=prepare(q),bind=s.bind;s.bind=(...values)=>{sizes.push(values.length);return bind(...values);};return s;};
 for(const who of ['owner','admin','pm','team','client']){const actor=await t.actor(who),before=count;assert.equal((await searchRecords(t.db,actor,t.input(actor))).status,200);assert.equal(count,before+1);}
 assert.ok(Math.max(...sizes)<100);const before=count;assert.equal((await searchRecords(t.db,t.owner,t.input(t.owner,{q:'x'}))).status,400);assert.equal(count,before);
});
