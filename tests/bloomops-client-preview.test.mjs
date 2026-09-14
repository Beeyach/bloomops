import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_work-projections.mjs';
import { setup as approvalSetup } from './_content-approvals.mjs';
import { run, one } from './_bloomops-db.mjs';
import { ACTIONS, evaluate } from '../lib/bloomops/authorization.mjs';
import { createClientPreview, clientPreviewContacts } from '../lib/bloomops/client-preview.mjs';
import { previewContext } from '../lib/bloomops/preview-policy.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
import { portalMilestoneSummaries } from '../lib/bloomops/milestones.mjs';
import { portalClients } from '../lib/bloomops/overview.mjs';
import { freshOnboardingActor } from '../lib/bloomops/onboarding-runtime.mjs';
import { getFile, downloadFile } from '../lib/bloomops/files.mjs';
import { getWorkspacePage, createWorkspacePage, saveWorkspacePage } from '../lib/bloomops/pages.mjs';
import { getWorkspacePageTree } from '../lib/bloomops/page-hierarchy.mjs';
import { updatePageSharing } from '../lib/bloomops/page-sharing.mjs';
import { postPageComment } from '../lib/bloomops/page-comments.mjs';
import { getPortalContent } from '../lib/bloomops/portal-content.mjs';
import { getPortalApproval, respondContentApproval } from '../lib/bloomops/content-approvals.mjs';

const preview = (t, viewer=t.owner, client='james', contact='c-james') => createClientPreview(t.db, viewer, client, contact);
for (const user of ['ellen','ary','pm']) test(`${user}: preview matches real portal and leaves identity unchanged`, async c => {
  const t=await setup(); c.after(()=>t.raw.close()); t.tree();
  const viewer=await t.actor(user), before=structuredClone(viewer), writes=one(t.raw,'SELECT total_changes() n').n;
  const {actor}=await preview(t,viewer);
  assert.deepEqual(await portalProjects(t.db,actor),await portalProjects(t.db,await t.actor('james')));
  assert.deepEqual(viewer,before); assert.equal(one(t.raw,'SELECT total_changes() n').n,writes);
  assert.equal(actor.role,'client'); assert.equal(previewContext(actor).viewer.userId,user);
});
for (const scope of ['client','service','project','none']) test(`${scope} assignment: only client-wide grants permit preview`,async c=>{
  const t=await setup();c.after(()=>t.raw.close());if(scope!=='none')t.assign(scope);
  assert.equal(Boolean(await preview(t,await t.actor('sam'))),scope==='client');
});
test('missing, foreign, unlinked and client callers fail closed',async c=>{
  const t=await setup();c.after(()=>t.raw.close());
  assert.equal(await preview(t,await t.actor('james')),null);
  assert.equal(await preview(t,await t.actor('foreign')),null);
  assert.equal(await preview(t,t.owner,'missing'),null);
  assert.equal(await preview(t,t.owner,'james','c-lawrence'),null);
  run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE id='c-james'");
  assert.deepEqual((await clientPreviewContacts(t.db,t.owner,'james')).contacts,[]);
  assert.equal(await preview(t),null);
});
test('one account linked to two clients cannot cross the selected client ceiling',async c=>{
  const t=await setup();c.after(()=>t.raw.close());
  run(t.raw,"UPDATE client_contacts SET user_id='james' WHERE id='c-lawrence'");
  t.project('other-client',{client_id:'lawrence'});t.project('private',{visibility:'internal'});
  t.project('restricted',{visibility:'restricted'});
  const {actor}=await preview(t);
  assert.equal((await portalProjects(t.db,await t.actor('james'))).length,2);
  assert.deepEqual((await portalProjects(t.db,actor)).map(x=>x.id),['website']);
  assert.deepEqual((await portalClients(t.db,actor)).map(x=>x.id),['james']);
  const refreshed=await freshOnboardingActor(t.db,{...actor});
  assert.ok(previewContext(refreshed));assert.deepEqual([...refreshed.scope.clientIds],['james']);
});
for(const change of [
  "UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'",
  "UPDATE workspace_memberships SET role='team_member' WHERE id='m-ellen'",
  "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",
  "UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",
  "UPDATE client_contacts SET user_id=NULL WHERE id='c-james'",
  "UPDATE workspaces SET status='archived' WHERE id='a'",
])test('stale preview loses reads immediately: '+change,async c=>{
  const t=await setup();c.after(()=>t.raw.close());t.file('shared',{visibility:'client'});
  const {actor}=await preview(t);assert.ok(await getFile(t.db,actor,'shared',{portal:true}));run(t.raw,change);
  assert.deepEqual(await portalProjects(t.db,actor),[]);assert.deepEqual(await portalClients(t.db,actor),[]);
  assert.equal(await getFile(t.db,actor,'shared',{portal:true}),null);
  assert.equal(await freshOnboardingActor(t.db,actor),null);assert.equal(await preview(t),null);
});
test('revoked client assignment denies a previously loaded preview',async c=>{
  const t=await setup();c.after(()=>t.raw.close());t.assign('client');const {actor}=await preview(t,await t.actor('sam'));
  run(t.raw,'DELETE FROM client_assignments');assert.deepEqual(await portalProjects(t.db,actor),[]);
});
test('download checks staff authority again after storage await',async c=>{
  const t=await setup();c.after(()=>t.raw.close());t.file('shared',{visibility:'client'});
  const {actor}=await preview(t);let cancelled=false;
  const bucket={get:async()=>{run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");return {body:{cancel:async()=>{cancelled=true;}}};}};
  assert.equal(await downloadFile(t.db,{bucket,actor,fileId:'shared'}),null);assert.equal(cancelled,true);
});
test('Page grants and inheritance match the contact; preview cannot edit or comment',async c=>{
  const t=await setup();c.after(()=>t.raw.close());
  const id=(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()})).id;
  const grant=async permission=>updatePageSharing(t.db,t.owner,id,{workspaceId:'a',expectedTreeRevision:(await getWorkspacePageTree(t.db,t.owner)).revision,kind:'grant',membershipId:'m-james',permission});
  await grant('edit');const {actor}=await preview(t);
  assert.equal((await getWorkspacePage(t.db,await t.actor('james'),id)).canEdit,1);
  const page=await getWorkspacePage(t.db,actor,id);assert.equal(page.canEdit,0);assert.equal(page.canComment,0);
  const before=one(t.raw,'SELECT total_changes() n').n;
  assert.equal((await saveWorkspacePage(t.db,{...actor},id,{workspaceId:'a',expectedRevision:1,title:'Forbidden',body:'Forbidden'})).ok,false);
  assert.equal((await postPageComment(t.db,{...actor},id,{workspaceId:'a',requestId:crypto.randomUUID(),threadId:null,expectedRevision:null,body:'Forbidden'})).ok,false);
  assert.equal(one(t.raw,'SELECT total_changes() n').n,before);
  await grant('none');assert.equal(await getWorkspacePage(t.db,actor,id),null);
});
test('content/approval reuse real client DTOs; responding cannot write',async c=>{
  const t=await approvalSetup();c.after(()=>t.raw.close());const request=await t.request();assert.ok(request.ok);
  const {actor}=await preview(t), real=await t.actor('james');
  assert.deepEqual(await getPortalContent(t.db,actor,t.contentId),await getPortalContent(t.db,real,t.contentId));
  assert.deepEqual(await getPortalApproval(t.db,actor,request.roundId),await getPortalApproval(t.db,real,request.roundId));
  const before=t.snapshot();assert.equal((await respondContentApproval(t.db,{actor,roundId:request.roundId,input:{decision:'approved',feedback:null}})).ok,false);
  assert.deepEqual(t.snapshot(),before);
  const resource={type:'client',id:'james',clientId:'james',workspaceId:'a',visibility:'client'};
  for(const action of Object.keys(ACTIONS).filter(x=>/manage|edit|submit|respond|upload|create|assign|activate|transition|withdraw|request|progress|depend|platform|verify/.test(x)))
    assert.equal(evaluate({...actor},{action,resource}).allowed,false,action);
});
test('Page preview limits a multi-client account without ignoring nearest deny',async c=>{
  const t=await setup();c.after(()=>t.raw.close());
  run(t.raw,"UPDATE client_contacts SET user_id='james' WHERE id='c-lawrence'");
  const create=async parentId=>(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID(),parentId,expectedTreeRevision:(await getWorkspacePageTree(t.db,t.owner)).revision})).id;
  const root=await create(null),child=await create(root),leaf=await create(child);
  const grant=async(id,permission)=>updatePageSharing(t.db,t.owner,id,{workspaceId:'a',expectedTreeRevision:(await getWorkspacePageTree(t.db,t.owner)).revision,kind:'grant',membershipId:'m-james',permission});
  await grant(root,'view');await grant(child,'none');
  const {actor}=await preview(t);
  assert.ok(await getWorkspacePage(t.db,actor,root));assert.equal(await getWorkspacePage(t.db,actor,leaf),null);
  await grant(leaf,'view');
  run(t.raw,"UPDATE bloomops_page_grants SET contact_id='c-lawrence' WHERE page_id=?",leaf);
  assert.ok(await getWorkspacePage(t.db,await t.actor('james'),leaf));assert.equal(await getWorkspacePage(t.db,actor,leaf),null);
  // Another contact row for the same user/business remains the same principal.
  run(t.raw,"INSERT INTO client_contacts(id,workspace_id,client_id,name,user_id) VALUES('same-business','a','james','Same person','james')");
  run(t.raw,"UPDATE bloomops_page_grants SET contact_id='same-business' WHERE page_id=?",root);
  assert.ok(await getWorkspacePage(t.db,actor,root));
});
test('paged preview work keeps canonical ordering, child scope and bounded parents',async c=>{
  const t=await setup();c.after(()=>t.raw.close());
  for(let n=0;n<25;n++){const id=`history-${String(n).padStart(2,'0')}`;t.project(id);t.milestone(`milestone-${n}`,{project_id:id,visibility:'client'});}
  const {actor}=await preview(t), all=await portalProjects(t.db,actor);
  const first=await portalProjects(t.db,actor,{limit:11,offset:0});
  const next=await portalProjects(t.db,actor,{limit:11,offset:10});
  assert.equal(first.length,11);assert.deepEqual(first,all.slice(0,11));assert.deepEqual(next,all.slice(10,21));
  const summaries=await portalMilestoneSummaries(t.db,actor,{projectIds:first.slice(0,10).map(p=>p.id)});
  assert.equal(Object.keys(summaries).length,10);assert.deepEqual(await portalMilestoneSummaries(t.db,actor,{projectIds:[]}),{});
});
test('preview access refresh uses one bounded query and no writes',async c=>{
  const t=await setup();c.after(()=>t.raw.close());
  for(let n=0;n<250;n++)run(t.raw,"INSERT INTO client_contacts(id,workspace_id,client_id,name,user_id) VALUES(?,'a','james',?,'james')",`extra-${n}`,`Contact ${n}`);
  const prepare=t.d1.prepare.bind(t.d1),queries=[];
  t.d1.prepare=statement=>{queries.push(statement);return prepare(statement);};
  const before=one(t.raw,'SELECT total_changes() n').n;
  assert.ok(await preview(t));assert.equal(queries.length,1);assert.match(queries[0],/limit \?/i);
  assert.equal(one(t.raw,'SELECT total_changes() n').n,before);
});
