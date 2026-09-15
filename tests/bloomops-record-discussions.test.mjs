import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_work-projections.mjs';
import {run,one,all} from './_bloomops-db.mjs';
import {getRecordDiscussions as read,postRecordDiscussion as post,editRecordDiscussion as edit,resolveRecordDiscussion as resolve,listDiscussionPeople as people} from '../lib/bloomops/record-discussions.mjs';
import {createClientPreview} from '../lib/bloomops/client-preview.mjs';
const parent={type:'project',id:'website'};
const input=(patch={})=>({workspaceId:'a',requestId:crypto.randomUUID(),threadId:null,body:'A clear update.',mentions:[],audience:'internal',...patch});
async function fixture(ctx){const t=await setup();ctx.after(()=>t.raw.close());return t;}

test('thread creation, reply, own edit and removal preserve history and idempotency',async ctx=>{
 const t=await fixture(ctx),first=input(),created=await post(t.db,t.owner,parent,first);assert.equal(created.ok,true);
 assert.deepEqual(await post(t.db,t.owner,parent,first),created);
 const reply=input({threadId:created.threadId,body:'Second message'});assert.equal((await post(t.db,t.owner,parent,reply)).ok,true);
 let view=await read(t.db,t.owner,parent,{threadId:created.threadId});assert.equal(view.messages.length,2);assert.equal(view.thread.revision,2);
 const change={workspaceId:'a',requestId:crypto.randomUUID(),threadId:created.threadId,commentId:created.id,expectedRevision:1,body:'Updated message',mentions:[],remove:false};
 assert.equal((await edit(t.db,t.owner,parent,change)).ok,true);assert.equal((await edit(t.db,t.owner,parent,change)).ok,true);
 assert.equal((await edit(t.db,t.owner,parent,{...change,requestId:crypto.randomUUID()})).reason,'conflict');
 assert.equal((await edit(t.db,await t.actor('ary'),parent,{...change,requestId:crypto.randomUUID(),expectedRevision:2})).reason,'not_found');
 assert.equal((await edit(t.db,t.owner,parent,{...change,requestId:crypto.randomUUID(),expectedRevision:2,remove:true})).ok,true);
 view=await read(t.db,t.owner,parent,{threadId:created.threadId});assert.equal(view.messages.length,2);assert.equal(view.messages[0].body,null);assert.ok(view.messages[0].removedAt);assert.equal(view.messages[0].canEdit,0);
 assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,4);
});
test('concurrent appends both succeed; resolve uses current revision and blocks late replies',async ctx=>{
 const t=await fixture(ctx),root=await post(t.db,t.owner,parent,input());
 const results=await Promise.all([post(t.db,t.owner,parent,input({threadId:root.threadId,body:'First reply'})),post(t.db,t.owner,parent,input({threadId:root.threadId,body:'Second reply'}))]);assert.ok(results.every(r=>r.ok));
 const stale={workspaceId:'a',requestId:crypto.randomUUID(),threadId:root.threadId,expectedRevision:1,resolved:true};assert.equal((await resolve(t.db,t.owner,parent,stale)).reason,'conflict');
 const current={...stale,expectedRevision:3};assert.equal((await resolve(t.db,t.owner,parent,current)).ok,true);assert.equal((await resolve(t.db,t.owner,parent,current)).ok,true);
 assert.equal((await post(t.db,t.owner,parent,input({threadId:root.threadId}))).reason,'conflict');
 assert.equal((await resolve(t.db,t.owner,parent,{...current,requestId:crypto.randomUUID(),expectedRevision:4,resolved:false})).ok,true);
});
test('internal default, immutable audience, portal-only eligible parents and contact scope',async ctx=>{
 const t=await fixture(ctx),james=await t.actor('james'),lawrence=await t.actor('lawrence');
 const hidden=await post(t.db,t.owner,parent,input()),shared=await post(t.db,t.owner,parent,input({audience:'client'}));
 assert.equal((await read(t.db,james,parent)).threads.length,1);assert.equal(await read(t.db,james,parent,{threadId:hidden.threadId}),null);
 assert.equal(await read(t.db,lawrence,parent),null);
 assert.equal((await post(t.db,james,parent,input())).reason,'conflict');
 assert.equal((await post(t.db,james,parent,input({threadId:shared.threadId,audience:'client'}))).ok,true);
 assert.equal((await post(t.db,t.owner,parent,input({threadId:hidden.threadId,audience:'client'}))).reason,'conflict');
 run(t.raw,"UPDATE projects SET visibility='internal' WHERE id='website'");assert.equal(await read(t.db,james,parent),null);
 assert.equal((await post(t.db,t.owner,parent,input({audience:'client'}))).reason,'conflict');
});
test('four typed parents obey task-only, project-only and client-wide boundaries',async ctx=>{
 const t=await fixture(ctx);t.action('own',{assignee_membership_id:'m-sam',visibility:'restricted'});t.action('sibling');t.deliverable('output',{visibility:'client'});
 for(const p of [{type:'client',id:'james'},parent,{type:'action',id:'own'},{type:'deliverable',id:'output'}])assert.equal((await post(t.db,t.owner,p,input())).ok,true);
 const sam=await t.actor('sam');assert.ok(await read(t.db,sam,{type:'action',id:'own'}));
 for(const p of [parent,{type:'client',id:'james'},{type:'action',id:'sibling'},{type:'deliverable',id:'output'}])assert.equal(await read(t.db,sam,p),null);
 t.assign();assert.ok(await read(t.db,sam,parent));assert.equal(await read(t.db,sam,{type:'client',id:'james'}),null);
 t.assign('client');assert.ok(await read(t.db,sam,{type:'client',id:'james'}));
 assert.equal((await post(t.db,t.owner,{type:'action',id:'own'},input({audience:'client'}))).reason,'conflict');
});
test('selected mentions require current audience access; Client picker exposes only participants',async ctx=>{
 const t=await fixture(ctx),root=await post(t.db,t.owner,parent,input({audience:'client',mentions:['m-james']}));assert.equal(root.ok,true);
 let options=await people(t.db,t.owner,parent,{threadId:root.threadId});assert.ok(options.people.some(p=>p.id==='m-james'));assert.equal(options.people.some(p=>p.id==='m-sam'),false);assert.equal(options.people.some(p=>p.id==='m-lawrence'),false);
 const james=await t.actor('james');options=await people(t.db,james,parent,{threadId:root.threadId});assert.deepEqual(options.people.map(p=>p.id),['m-ellen']);
 assert.equal((await post(t.db,james,parent,input({threadId:root.threadId,audience:'client',mentions:['m-ary']}))).reason,'conflict');
 assert.equal((await post(t.db,james,parent,input({threadId:root.threadId,audience:'client',mentions:['m-ellen']}))).ok,true);
 assert.equal((await post(t.db,t.owner,parent,input({mentions:['m-james']}))).reason,'conflict');
 run(t.raw,"UPDATE user SET name='James Current' WHERE id='james'");let view=await read(t.db,t.owner,parent,{threadId:root.threadId});assert.equal(view.messages[0].mentions[0].name,'James Current');
 run(t.raw,"DELETE FROM client_contacts WHERE user_id='james'");view=await read(t.db,t.owner,parent,{threadId:root.threadId});assert.equal(view.messages[0].mentions.length,0);
});
test('stale membership, other workspace, and preview never authorize a write',async ctx=>{
 const t=await fixture(ctx),root=await post(t.db,t.owner,parent,input({audience:'client'}));
 const {actor}=await createClientPreview(t.db,t.owner,'james','c-james');assert.ok(await read(t.db,actor,parent));assert.equal((await post(t.db,actor,parent,input())).reason,'not_found');assert.equal((await resolve(t.db,actor,parent,{})).reason,'not_found');assert.equal((await edit(t.db,actor,parent,{})).reason,'not_found');
 assert.equal(await read(t.db,await t.actor('foreign'),parent),null);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");assert.equal(await read(t.db,t.owner,parent),null);assert.equal(await read(t.db,actor,parent),null);assert.equal((await post(t.db,t.owner,parent,input())).reason,'not_found');
});
test('comment, mention and history inserts roll back together on failure',async ctx=>{
 const t=await fixture(ctx);run(t.raw,"CREATE TRIGGER discussion_fail BEFORE INSERT ON record_discussion_mentions BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(post(t.db,t.owner,parent,input({mentions:['m-ary']})));
 for(const table of ['record_discussion_threads','record_discussion_comments','record_discussion_mentions','activity_events'])assert.equal(one(t.raw,`SELECT count(*) n FROM ${table}`).n,0);
});
test('simultaneous retries do not double-count edits, replies, mentions or history',async ctx=>{
 const t=await fixture(ctx),first=input({mentions:['m-ary']});const roots=await Promise.all([post(t.db,t.owner,parent,first),post(t.db,t.owner,parent,first)]);assert.ok(roots.every(r=>r.ok));
 const change={workspaceId:'a',requestId:crypto.randomUUID(),threadId:first.requestId,commentId:first.requestId,expectedRevision:1,body:'Changed once',mentions:['m-pm'],remove:false};
 const edits=await Promise.all([edit(t.db,t.owner,parent,change),edit(t.db,t.owner,parent,change)]);assert.ok(edits.every(r=>r.ok));
 assert.equal(one(t.raw,'SELECT revision FROM record_discussion_threads').revision,2);assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,2);assert.equal(one(t.raw,'SELECT count(*) n FROM record_discussion_mentions').n,1);
 assert.equal((await edit(t.db,t.owner,parent,{...change,mentions:['m-ary']})).reason,'conflict');
});
test('schema refuses absent or mixed parents, wrong project, foreign workspace and client-visible tasks',async ctx=>{
 const t=await fixture(ctx);t.action('task');t.project('second');t.deliverable('output');const base={id:crypto.randomUUID(),workspace_id:'a',parent_type:'action',parent_id:'task',project_id:'website',action_id:'task',author_membership_id:'m-ellen',author_user_id:'ellen',last_request_id:crypto.randomUUID()};
 const insert=patch=>{const row={...base,...patch};run(t.raw,`INSERT INTO record_discussion_threads(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`,...Object.values(row));};
 for(const patch of [{action_id:null},{project_id:null},{project_id:'second'},{workspace_id:'b'},{audience:'client'},{deliverable_id:'output'},{client_id:'james'},{parent_id:'other'}])assert.throws(()=>insert(patch));
 insert({});assert.equal(one(t.raw,'SELECT count(*) n FROM record_discussion_threads').n,1);
});
test('portal parent names follow canonical client labels, never deliverable internal titles',async ctx=>{
 const t=await fixture(ctx);t.deliverable('output',{visibility:'client',title:'PRIVATE handoff plan'});t.action('private-task');const james=await t.actor('james');assert.equal(await read(t.db,james,{type:'action',id:'private-task'}),null);assert.equal(await read(t.db,james,{type:'action',id:'missing'}),null);
 assert.equal((await read(t.db,james,{type:'deliverable',id:'output'})).parent.name,'Deliverable');
 run(t.raw,"UPDATE deliverables SET client_label='Your website guide' WHERE id='output'");assert.equal((await read(t.db,james,{type:'deliverable',id:'output'})).parent.name,'Your website guide');
});
test('roles and visibility changes are fresh for discussions and selected mentions',async ctx=>{
 const t=await fixture(ctx);t.assign();const sam=await t.actor('sam'),root=await post(t.db,t.owner,parent,input({mentions:['m-sam']}));assert.equal(root.ok,true);
 run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");assert.equal(await read(t.db,sam,parent),null);assert.equal((await post(t.db,t.owner,parent,input({mentions:['m-sam']}))).reason,'conflict');
 const pm=await t.actor('pm');run(t.raw,"UPDATE projects SET visibility='restricted' WHERE id='website'");assert.equal(await read(t.db,pm,parent),null);assert.ok(await read(t.db,t.owner,parent));
 run(t.raw,"UPDATE workspace_memberships SET role='team_member' WHERE id='m-ellen'");assert.equal(await read(t.db,t.owner,parent),null);
});
test('bounded thread/message pages and people queries do not grow with the member directory',async ctx=>{
 const t=await fixture(ctx),{bloomOpsDb}=await import('../lib/bloomops/db.mjs');let queries=[];
 const db=bloomOpsDb({...t.d1,prepare:query=>{queries.push(query);return t.d1.prepare(query);}});
 const root=await post(t.db,t.owner,parent,input());for(let i=0;i<35;i++)await post(t.db,t.owner,parent,input({threadId:root.threadId,body:'Reply '+i}));
 queries=[];let view=await read(db,t.owner,parent,{threadId:root.threadId});assert.equal(view.messages.length,30);assert.equal(view.more,true);assert.equal(queries.length,5);const bytes=JSON.stringify(view).length;
 for(let i=0;i<250;i++){run(t.raw,'INSERT INTO user(id,name,email) VALUES(?,?,?)','extra-'+i,'Extra member','extra-'+i+'@example.invalid');run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'a',?,'team_member','active')",'m-extra-'+i,'extra-'+i);}
 queries=[];view=await read(db,t.owner,parent,{threadId:root.threadId});assert.equal(queries.length,5);assert.equal(JSON.stringify(view).length,bytes);assert.equal((await read(t.db,t.owner,parent,{threadId:root.threadId,page:2})).messages.length,6);
 queries=[];await people(db,t.owner,parent);assert.equal(queries.length,2);
 assert.ok(queries.every(q=>(q.match(/\?/g)||[]).length<=100));
});
test('read rechecks authority after the message snapshot and mentions query',async ctx=>{
 const t=await fixture(ctx),root=await post(t.db,t.owner,parent,input()),{bloomOpsDb}=await import('../lib/bloomops/db.mjs');let count=0;
 const db=bloomOpsDb({...t.d1,prepare:query=>{if(++count===4)run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");return t.d1.prepare(query);}});
 assert.equal(await read(db,t.owner,parent,{threadId:root.threadId}),null);
});
test('recipient access is revalidated in the transaction after the preflight read',async ctx=>{
 const t=await fixture(ctx),{bloomOpsDb}=await import('../lib/bloomops/db.mjs');t.assign();
 const db=bloomOpsDb({...t.d1,batch:async statements=>{run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-sam'");return t.d1.batch(statements);}});
 assert.equal((await post(db,t.owner,parent,input({mentions:['m-sam']}))).reason,'conflict');assert.equal(one(t.raw,'SELECT count(*) n FROM activity_events').n,0);
});
test('a stale comment cannot overwrite a concurrent edit or claim a different retry payload',async ctx=>{
 const t=await fixture(ctx),root=await post(t.db,t.owner,parent,input()),base={workspaceId:'a',threadId:root.threadId,commentId:root.id,expectedRevision:1,mentions:[],remove:false};
 const results=await Promise.all([edit(t.db,t.owner,parent,{...base,requestId:crypto.randomUUID(),body:'First edit'}),edit(t.db,t.owner,parent,{...base,requestId:crypto.randomUUID(),body:'Second edit'})]);
 assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='conflict').length,1);assert.equal(one(t.raw,'SELECT revision FROM record_discussion_comments').revision,2);
});
