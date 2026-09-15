import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {run,one,all} from './_bloomops-db.mjs';
import {postRecordDiscussion as post,editRecordDiscussion as edit} from '../lib/bloomops/record-discussions.mjs';
import {listNotifications as inbox,notificationSettings as settings,changeNotification as change} from '../lib/bloomops/notifications.mjs';
import {createAction,updateAction} from '../lib/bloomops/actions.mjs';
import {createClientPreview} from '../lib/bloomops/client-preview.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
const parent={type:'project',id:'website'};
const input=(patch={})=>({workspaceId:'a',requestId:crypto.randomUUID(),threadId:null,body:'An update',mentions:[],audience:'internal',...patch});
const command=(a,patch)=>({workspaceId:a.workspaceId,userId:a.userId,membershipId:a.membershipId,...patch});
async function fixture(ctx){const t=await setup();ctx.after(()=>t.raw.close());t.ary=await t.actor('ary');return t;}
test('mentions/replies overlap yields one event delivery, no self or retry duplicates',async ctx=>{
 const t=await fixture(ctx),root=input({mentions:['m-ary','m-ellen']});await Promise.all([post(t.db,t.owner,parent,root),post(t.db,t.owner,parent,root)]);
 assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,1);let view=await inbox(t.db,t.ary);assert.equal(view.unread,1);assert.equal(view.items[0].category,'mentions');assert.match(view.items[0].href,/threadId=/);
 const reply=input({threadId:root.requestId,mentions:['m-ellen']});await post(t.db,t.ary,parent,reply);const owner=await inbox(t.db,t.owner);assert.equal(owner.items.length,1);assert.equal(owner.items[0].category,'mentions');
 await post(t.db,t.owner,parent,input({threadId:root.requestId}));view=await inbox(t.db,t.ary);assert.equal(view.items.length,2);assert.ok(view.items.some(n=>n.category==='replies'));
});
test('category preferences and thread mute control future deliveries and are isolated',async ctx=>{
 const t=await fixture(ctx);assert.deepEqual(await settings(t.db,t.ary),{mentions:true,replies:true,assignments:true,muted:false});
 assert.equal((await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'mentions',enabled:false}))).ok,true);
 const root=input({mentions:['m-ary']});await post(t.db,t.owner,parent,root);assert.equal((await inbox(t.db,t.ary)).items.length,0);
 await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'mentions',enabled:true}));
 const mute={action:'mute',threadId:root.requestId,kind:'record',muted:true};assert.equal((await change(t.db,t.ary,command(t.ary,mute))).ok,true);await post(t.db,t.owner,parent,input({threadId:root.requestId,mentions:['m-ary']}));assert.equal((await inbox(t.db,t.ary)).unread,0);
 await change(t.db,t.ary,command(t.ary,{...mute,muted:false}));await post(t.db,t.owner,parent,input({threadId:root.requestId,mentions:['m-ary']}));assert.equal((await inbox(t.db,t.ary)).unread,1);
 assert.equal((await settings(t.db,t.owner)).mentions,true);assert.equal((await change(t.db,t.ary,command(t.owner,{action:'preferences',category:'mentions',enabled:false}))).reason,'not_found');
});
test('read/unread, filtered mark-all and captured cutoff preserve later arrivals and underlying work',async ctx=>{
 const t=await fixture(ctx),root=input({mentions:['m-ary']});await post(t.db,t.owner,parent,root);const before=all(t.raw,'SELECT * FROM record_discussion_comments');let view=await inbox(t.db,t.ary),id=view.items[0].id;
 await change(t.db,t.ary,command(t.ary,{action:'read',id,read:true}));assert.equal((await inbox(t.db,t.ary)).unread,0);
 await change(t.db,t.ary,command(t.ary,{action:'read',id,read:false}));assert.equal((await inbox(t.db,t.ary)).unread,1);
 await post(t.db,t.owner,parent,input({mentions:['m-ary']}));await change(t.db,t.ary,command(t.ary,{action:'markAll',category:'mentions',cutoff:view.cutoff}));assert.equal((await inbox(t.db,t.ary)).unread,1);
 assert.deepEqual(all(t.raw,'SELECT * FROM record_discussion_comments WHERE id=?',root.requestId),before);
 const opened=await change(t.db,t.ary,command(t.ary,{action:'open',id}));assert.equal(opened.ok,true);assert.equal(opened.href,view.items[0].href);
});
test('revoked membership, private parents, removed comments and preview cannot expose inbox data',async ctx=>{
 const t=await fixture(ctx),james=await t.actor('james');const root=input({audience:'client',mentions:['m-james']});await post(t.db,t.owner,parent,root);let view=await inbox(t.db,james);assert.equal(view.unread,1);const id=view.items[0].id;
 const preview=await createClientPreview(t.db,t.owner,'james','c-james');assert.equal(await inbox(t.db,preview.actor),null);assert.equal((await change(t.db,preview.actor,command(preview.actor,{action:'open',id}))).reason,'not_found');
 run(t.raw,"UPDATE projects SET visibility='internal' WHERE id='website'");assert.equal((await inbox(t.db,james)).unread,0);assert.equal((await change(t.db,james,command(james,{action:'open',id}))).reason,'not_found');
 run(t.raw,"UPDATE projects SET visibility='client' WHERE id='website'");await edit(t.db,t.owner,parent,{workspaceId:'a',requestId:crypto.randomUUID(),threadId:root.requestId,commentId:root.requestId,expectedRevision:1,remove:true});assert.equal((await inbox(t.db,james)).unread,0);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'");assert.equal(await inbox(t.db,james),null);assert.equal(await settings(t.db,james),null);
});
test('notification failure rolls back comment, mentions and activity together',async ctx=>{
 const t=await fixture(ctx);run(t.raw,"CREATE TRIGGER notification_failure BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'test failure'); END");await assert.rejects(post(t.db,t.owner,parent,input({mentions:['m-ary']})));
 for(const table of ['notifications','record_discussion_threads','record_discussion_comments','record_discussion_mentions','activity_events'])assert.equal(one(t.raw,`SELECT count(*) n FROM ${table}`).n,0);
});
test('manual task create/reassign notifies eligible assignees once and hides former assignment',async ctx=>{
 const t=await fixture(ctx);const requestId=crypto.randomUUID();const args={actor:t.owner,projectId:'website',requestId,input:{title:'Prepare the report',assigneeMembershipId:'m-sam'}};
 const created=await createAction(t.db,args);assert.equal(created.ok,true);await createAction(t.db,args);const sam=await t.actor('sam');let view=await inbox(t.db,sam);assert.equal(view.unread,1);assert.equal(view.items[0].category,'assignments');
 const task=one(t.raw,'SELECT * FROM actions WHERE title=?','Prepare the report');assert.equal((await updateAction(t.db,{actor:t.owner,actionId:task.id,input:{assigneeMembershipId:'m-ary'},expectedRevision:1})).ok,true);
 assert.equal((await inbox(t.db,sam)).unread,0);assert.equal((await inbox(t.db,t.ary)).unread,1);assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,2);
});
test('all four discussion types use current authority and portal-safe names',async ctx=>{
 const t=await fixture(ctx);t.action('own',{assignee_membership_id:'m-sam'});t.deliverable('guide',{visibility:'client',title:'PRIVATE guide'});const sam=await t.actor('sam'),james=await t.actor('james');
 await post(t.db,t.owner,{type:'action',id:'own'},input({mentions:['m-sam']}));assert.equal((await inbox(t.db,sam)).items.length,1);
 for(const p of [{type:'client',id:'james'},parent,{type:'deliverable',id:'guide'}])await post(t.db,t.owner,p,input({audience:'client',mentions:['m-james']}));
 let view=await inbox(t.db,james);assert.equal(view.items.length,3);assert.equal(view.items.find(n=>n.type==='deliverable').title,'Deliverable');assert.doesNotMatch(JSON.stringify(view),/PRIVATE/);
 run(t.raw,"DELETE FROM client_contacts WHERE user_id='james'");assert.equal((await inbox(t.db,james)).unread,0);
});
test('permission filtering happens before paging and every result remains bounded',async ctx=>{
 const t=await fixture(ctx);for(let i=0;i<24;i++)await post(t.db,t.owner,parent,input({mentions:['m-ary']}));
 const first=await inbox(t.db,t.ary);assert.equal(first.items.length,20);assert.equal(first.more,true);assert.equal(first.unread,24);const second=await inbox(t.db,t.ary,{page:2});assert.equal(second.items.length,4);assert.equal(second.more,false);
 assert.equal(await inbox(t.db,t.ary,{page:-1}),null);assert.equal(await inbox(t.db,t.ary,{category:'secret'}),null);assert.equal((await inbox(t.db,await t.actor('foreign'))).items.length,0);
});

test('Page replies inherit read authority, open exact thread, mute and revoke cleanly',async ctx=>{
 const t=await fixture(ctx);const {createWorkspacePage}=await import('../lib/bloomops/pages.mjs');const {getWorkspacePageTree}=await import('../lib/bloomops/page-hierarchy.mjs');const {updatePageSharing}=await import('../lib/bloomops/page-sharing.mjs');const {postPageComment}=await import('../lib/bloomops/page-comments.mjs');
 const tree=()=>getWorkspacePageTree(t.db,t.owner);const create=async parentId=>(await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID(),parentId,expectedTreeRevision:(await tree()).revision})).id;
 const root=await create(null),child=await create(root);const share=permission=>updatePageSharing(t.db,t.owner,root,{workspaceId:'a',expectedTreeRevision:0,kind:'grant',membershipId:'m-james',permission});
 const grant=await updatePageSharing(t.db,t.owner,root,{workspaceId:'a',expectedTreeRevision:(await tree()).revision,kind:'grant',membershipId:'m-james',permission:'comment'});assert.equal(grant.ok,true);
 const james=await t.actor('james'),first={workspaceId:'a',requestId:crypto.randomUUID(),threadId:null,expectedRevision:null,body:'Page question'};assert.equal((await postPageComment(t.db,james,child,first)).ok,true);
 const reply={...first,requestId:crypto.randomUUID(),threadId:first.requestId,expectedRevision:1,body:'Page answer'};await Promise.all([postPageComment(t.db,t.owner,child,reply),postPageComment(t.db,t.owner,child,reply)]);
 let view=await inbox(t.db,james);assert.equal(view.items.length,1);assert.equal(view.items[0].href,`/portal/pages/${child}?discussion=${first.requestId}`);
 assert.equal((await change(t.db,james,command(james,{action:'mute',kind:'page',threadId:first.requestId,muted:true}))).ok,true);
 await postPageComment(t.db,t.owner,child,{...reply,requestId:crypto.randomUUID(),expectedRevision:2});assert.equal((await inbox(t.db,james)).items.length,1);
 await updatePageSharing(t.db,t.owner,child,{workspaceId:'a',expectedTreeRevision:(await tree()).revision,kind:'grant',membershipId:'m-james',permission:'none'});assert.equal((await inbox(t.db,james)).unread,0);assert.equal(await settings(t.db,james,{kind:'page',threadId:first.requestId}),null);
});
test('preferences and recipient revocation are checked inside the originating transaction',async ctx=>{
 const t=await fixture(ctx),batch=t.db.batch.bind(t.db);let injected=false;t.db.batch=async statements=>{if(!injected){injected=true;run(t.raw,"INSERT INTO notification_preferences(workspace_id,membership_id,user_id,mentions) VALUES('a','m-ary','ary',0)");}return batch(statements);};
 assert.equal((await post(t.db,t.owner,parent,input({mentions:['m-ary']}))).ok,true);assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,0);
 t.db.batch=batch;await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'mentions',enabled:true}));
 t.db.batch=async statements=>{run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ary'");return batch(statements);};
 assert.equal((await post(t.db,t.owner,parent,input({mentions:['m-ary']}))).ok,false);assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,0);
});
test('old roles, foreign IDs and preference inputs cannot write another inbox',async ctx=>{
 const t=await fixture(ctx);await post(t.db,t.owner,parent,input({mentions:['m-ary']}));const id=(await inbox(t.db,t.ary)).items[0].id;
 assert.equal((await change(t.db,t.owner,command(t.owner,{action:'read',id,read:true}))).reason,'not_found');assert.equal((await inbox(t.db,t.ary)).unread,1);
 assert.equal((await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'mentions',enabled:'false'}))).reason,'invalid');
 run(t.raw,"UPDATE workspace_memberships SET role='team_member' WHERE id='m-ary'");assert.equal(await inbox(t.db,t.ary),null);assert.equal((await change(t.db,t.ary,command(t.ary,{action:'markAll',category:'all',cutoff:1000}))).reason,'not_found');
});
test('assignment failures roll back task change and activity, and concurrent reassignment delivers once',async ctx=>{
 const t=await fixture(ctx);t.action('task');run(t.raw,"CREATE TRIGGER notification_failure BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'test failure'); END");
 const args={actor:t.owner,actionId:'task',input:{assigneeMembershipId:'m-ary'},expectedRevision:1};await assert.rejects(updateAction(t.db,args));assert.equal(one(t.raw,"SELECT assignee_membership_id FROM actions WHERE id='task'").assignee_membership_id,null);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,0);
 run(t.raw,'DROP TRIGGER notification_failure');const results=await Promise.all([updateAction(t.db,args),updateAction(t.db,args)]);assert.ok(results.every(r=>r.ok));assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,1);
});
test('ignored zero-row assignment UPDATE creates neither an event nor a notification',async ctx=>{
 const t=await fixture(ctx);t.action('ignored',{assignee_membership_id:'m-sam'});
 run(t.raw,"CREATE TRIGGER ignore_assignment BEFORE UPDATE ON actions BEGIN SELECT RAISE(IGNORE); END");
 const result=await updateAction(t.db,{actor:t.owner,actionId:'ignored',input:{assigneeMembershipId:'m-ary'},expectedRevision:1});
 assert.equal(result.ok,false);assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,0);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,0);
});
test('schema prevents cross-workspace recipients/events and mismatched typed targets',async ctx=>{
 const t=await fixture(ctx);await post(t.db,t.owner,parent,input({mentions:['m-ary']}));const row=one(t.raw,'SELECT * FROM notifications');
 for(const patch of [{workspace_id:'b'},{membership_id:'m-foreign'},{record_comment_id:null},{action_id:'missing'},{page_id:'mixed'},{category:'assignments'}]){
  const {sequence,...copy}={...row,id:crypto.randomUUID(),...patch};assert.throws(()=>run(t.raw,`INSERT INTO notifications(${Object.keys(copy).join(',')}) VALUES(${Object.keys(copy).map(()=>'?').join(',')})`,...Object.values(copy)));
 }
});

test('disabled mentions fall back to enabled participant replies before precedence',async ctx=>{
 const t=await fixture(ctx),root=input();await post(t.db,t.ary,parent,root);
 await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'mentions',enabled:false}));
 await post(t.db,t.owner,parent,input({threadId:root.requestId,mentions:['m-ary']}));
 assert.deepEqual((await inbox(t.db,t.ary)).items.map(n=>n.category),['replies']);
 await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'replies',enabled:false}));
 await post(t.db,t.owner,parent,input({threadId:root.requestId,mentions:['m-ary']}));
 assert.equal((await inbox(t.db,t.ary)).items.length,1);
});
test('no-op assignment stays quiet; reassignment back is a distinct event; edits stay quiet',async ctx=>{
 const t=await fixture(ctx);t.action('task');
 const assign=(who,revision)=>updateAction(t.db,{actor:t.owner,actionId:'task',input:{assigneeMembershipId:who},expectedRevision:revision});
 assert.ok((await assign('m-ary',1)).ok);assert.ok((await assign('m-ary',2)).ok);
 assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,1);
 assert.ok((await assign('m-sam',2)).ok);assert.ok((await assign('m-ary',3)).ok);
 assert.equal(one(t.raw,'SELECT count(DISTINCT event_id) n FROM notifications').n,3);
 assert.equal((await inbox(t.db,t.ary)).items.length,2);
 const root=input({mentions:['m-ary']});await post(t.db,t.owner,parent,root);
 const count=one(t.raw,'SELECT count(*) n FROM notifications').n;
 await edit(t.db,t.owner,parent,{workspaceId:'a',requestId:crypto.randomUUID(),threadId:root.requestId,commentId:root.requestId,expectedRevision:1,body:'Changed text',mentions:['m-ary'],remove:false});
 assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,count);
});
test('stale zero-row assignment mutation emits neither activity nor notification',async ctx=>{
 const t=await fixture(ctx);t.action('task');const batch=t.db.batch.bind(t.db);let injected=false;
 t.db.batch=async statements=>{if(!injected){injected=true;run(t.raw,"UPDATE actions SET revision=revision+1,title='Concurrent change' WHERE id='task'");}return batch(statements);};
 const result=await updateAction(t.db,{actor:t.owner,actionId:'task',input:{assigneeMembershipId:'m-ary'},expectedRevision:1});
 assert.equal(result.ok,false);assert.equal(one(t.raw,'SELECT count(*) n FROM notifications').n,0);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,0);
});
test('cutoff cannot be recycled by deletion and source deletion retains no blocked FK',async ctx=>{
 const t=await fixture(ctx);t.action('task');await updateAction(t.db,{actor:t.owner,actionId:'task',input:{assigneeMembershipId:'m-ary'},expectedRevision:1});
 const old=await inbox(t.db,t.ary);run(t.raw,"DELETE FROM actions WHERE id='task'");assert.equal((await inbox(t.db,t.ary)).unread,0);
 await post(t.db,t.owner,parent,input({mentions:['m-ary']}));
 await change(t.db,t.ary,command(t.ary,{action:'markAll',category:'all',cutoff:old.cutoff}));assert.equal((await inbox(t.db,t.ary)).unread,1);
});
test('inaccessible recent candidates do not consume pages or inflate counts',async ctx=>{
 const t=await fixture(ctx);t.project('hidden');const james=await t.actor('james');
 for(let i=0;i<22;i++)await post(t.db,t.owner,parent,input({audience:'client',mentions:['m-james']}));
 for(let i=0;i<22;i++)await post(t.db,t.owner,{type:'project',id:'hidden'},input({audience:'client',mentions:['m-james']}));
 run(t.raw,"UPDATE projects SET visibility='internal' WHERE id='hidden'");
 const first=await inbox(t.db,james),second=await inbox(t.db,james,{page:2});assert.equal(first.unread,22);assert.equal(first.items.length,20);assert.equal(second.items.length,2);assert.ok(first.items.every(n=>n.targetId==='website'));
});
test('prior nonremoved participants receive replies; merely mentioned people are not subscribed',async ctx=>{
 const t=await fixture(ctx),pm=await t.actor('pm'),root=input({mentions:['m-pm']});await post(t.db,t.owner,parent,root);
 await post(t.db,t.ary,parent,input({threadId:root.requestId}));
 await post(t.db,pm,parent,input({threadId:root.requestId}));
 assert.equal((await inbox(t.db,t.owner)).items.length,2);assert.equal((await inbox(t.db,t.ary)).items.length,1);assert.equal((await inbox(t.db,pm)).items.length,1);
 await edit(t.db,t.owner,parent,{workspaceId:'a',requestId:crypto.randomUUID(),threadId:root.requestId,commentId:root.requestId,expectedRevision:1,remove:true});
 await post(t.db,pm,parent,input({threadId:root.requestId}));assert.equal((await inbox(t.db,t.owner)).items.length,2);
});
test('one user has independent history, preferences and read state in each workspace',async ctx=>{
 const t=await fixture(ctx);run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('m-ary-b','b','ary','admin','active')");
 const other=await loadActor(t.db,{workspace:{id:'b'},membership:{id:'m-ary-b',workspaceId:'b',userId:'ary',role:'admin',status:'active'}}),foreign=await t.actor('foreign');
 await post(t.db,t.owner,parent,input({mentions:['m-ary']}));
 await post(t.db,foreign,{type:'client',id:'foreign-client'},input({workspaceId:'b',mentions:['m-ary-b']}));
 const own=await inbox(t.db,t.ary),elsewhere=await inbox(t.db,other);assert.equal(own.unread,1);assert.equal(elsewhere.unread,1);
 await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'assignments',enabled:false}));assert.equal((await settings(t.db,other)).assignments,true);
 await change(t.db,t.ary,command(t.ary,{action:'markAll',category:'all',cutoff:elsewhere.cutoff}));assert.equal((await inbox(t.db,other)).unread,1);
 assert.equal((await change(t.db,t.ary,command(t.ary,{action:'read',id:elsewhere.items[0].id,read:true}))).reason,'not_found');
 t.action('preferences-task');await updateAction(t.db,{actor:t.owner,actionId:'preferences-task',input:{assigneeMembershipId:'m-ary'},expectedRevision:1});assert.equal((await inbox(t.db,t.ary)).items.length,1);
});
test('a reassigned membership cannot transfer another user inbox, preferences or mutes',async ctx=>{
 const t=await fixture(ctx),root=input({mentions:['m-ary']});await post(t.db,t.owner,parent,root);
 const old=(await inbox(t.db,t.ary)).items[0];await change(t.db,t.ary,command(t.ary,{action:'preferences',category:'mentions',enabled:false}));await change(t.db,t.ary,command(t.ary,{action:'mute',kind:'record',threadId:root.requestId,muted:true}));
 run(t.raw,"INSERT INTO user(id,name,email) VALUES('replacement','Replacement','replacement@example.com')");run(t.raw,"UPDATE workspace_memberships SET user_id='replacement' WHERE id='m-ary'");
 const replacement=await t.actor('replacement');assert.equal(await inbox(t.db,t.ary),null);assert.equal((await inbox(t.db,replacement)).items.length,0);assert.equal((await settings(t.db,replacement,{kind:'record',threadId:root.requestId})).muted,false);assert.equal((await settings(t.db,replacement)).mentions,true);
 assert.equal((await change(t.db,replacement,command(replacement,{action:'open',id:old.id}))).reason,'not_found');await post(t.db,t.owner,parent,input({threadId:root.requestId,mentions:['m-ary']}));assert.equal((await inbox(t.db,replacement)).items.length,1);
});
