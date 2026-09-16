import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_actions.mjs';
import {run} from './_bloomops-db.mjs';
import {normalizeWorkloadQuery,teamActionWorkload} from '../lib/bloomops/team-workload.mjs';
const now=new Date('2026-09-16T00:30:00Z');
const view=(t,actor=t.owner,input={},options={})=>teamActionWorkload(t.db,actor,input,{now,...options});

test('workload counts actual open assigned/unassigned states without counting closed work or false blocked overdue',async()=>{
 const t=await setup();run(t.raw,"UPDATE bloomops_clients SET timezone='Australia/Sydney' WHERE id='james'");
 const overdue=(await t.addAction({assigneeMembershipId:'m-sam',dueDate:'2026-09-15'})).actionId;
 const blocked=(await t.addAction({assigneeMembershipId:'m-sam',dueDate:'2026-09-15'})).actionId;
 const waiting=(await t.addAction({assigneeMembershipId:'m-sam',dueDate:'2026-09-16'})).actionId;
 const review=(await t.addAction({assigneeMembershipId:'m-sam'})).actionId;
 await t.progress(waiting,'waiting');await t.progress(review,'in_progress');await t.progress(review,'review');
 await t.depend(blocked,waiting);
 const done=(await t.addAction({assigneeMembershipId:'m-sam'})).actionId;
 await t.progress(done,'in_progress');await t.progress(done,'done');
 const cancelled=(await t.addAction({assigneeMembershipId:'m-sam'})).actionId;await t.progress(cancelled,'cancelled');
 const unassigned=(await t.addAction({title:'Unassigned current work'})).actionId;
 const before=t.actionSnapshot(),result=await view(t);
 assert.equal(result.ok,true);assert.equal(result.items.length,2);assert.equal(result.items[0].membershipId,null);
 assert.deepEqual(result.items[1],{membershipId:'m-sam',name:'sam',active:true,open:4,overdue:1,waiting:1,review:1,blocked:1,undated:1,nextDueDate:'2026-09-16'});
 const selected=await view(t,t.owner,{assignee:'m-sam'});
 assert.deepEqual(new Set(selected.actions.items.map(x=>x.id)),new Set([overdue,blocked,waiting,review]));
 const none=await view(t,t.owner,{assignee:'none'});assert.deepEqual(none.actions.items.map(x=>x.id),[unassigned]);
 assert.deepEqual(t.actionSnapshot(),before,'reading creates no facts/history');
 assert.deepEqual(Object.keys(result.query).sort(),['actionPage','assignee','page']);
});

test('Client-local dates, including DST and opposite calendar days, match canonical Action detail',async()=>{
 const t=await setup();const id=(await t.addAction({assigneeMembershipId:'m-sam',dueDate:'2026-09-15'})).actionId;
 for(const [timezone,clock,expected] of [['America/Los_Angeles','2026-09-16T00:30:00Z',0],['Australia/Sydney','2026-09-16T00:30:00Z',1],['America/New_York','2026-11-01T05:30:00Z',1],['America/New_York','2026-11-01T06:30:00Z',1]]){
  run(t.raw,'UPDATE bloomops_clients SET timezone=? WHERE id=?',timezone,'james');
  const clockDate=new Date(clock),result=await view(t,t.owner,{}, {now:clockDate});
  assert.equal(result.items[0].overdue,expected,timezone+' '+clock);
  assert.equal((await t.action(id,t.owner,{now:clockDate})).overdue,Boolean(expected));
 }
});

test('current exact Action access filters summaries and selected links without granting sibling, directory or parent access',async()=>{
 const t=await setup();const own=(await t.addAction({assigneeMembershipId:'m-sam',visibility:'restricted'})).actionId;
 await t.addAction({assigneeMembershipId:'m-other',visibility:'restricted'});await t.addAction();
 const sam=await t.actor('sam');let result=await view(t,sam,{assignee:'m-sam'});
 assert.equal(result.items.length,1);assert.equal(result.items[0].open,1);
 assert.equal(result.actions.items[0].id,own);assert.equal(result.actions.items[0].projectHref,null);
 assert.equal((await view(t,sam,{assignee:'m-other'})).reason,'not_found');
 assert.equal((await view(t,sam,{assignee:'none'})).reason,'not_found');
 await t.editAction(own,{assigneeMembershipId:'m-other'});
 assert.deepEqual((await view(t,sam)).items,[]);
 assert.equal((await view(t,sam,{assignee:'m-sam'})).reason,'not_found');
});

test('workspace, portal, preview, membership and role revocation remain closed',async()=>{
 const t=await setup();await t.addAction({assigneeMembershipId:'m-sam'});
 assert.deepEqual((await view(t,await t.actor('foreign'))).items,[]);
 assert.equal((await view(t,await t.actor('james'))).reason,'forbidden');
 assert.equal((await view(t,{...t.owner,preview:{clientId:'james'}})).reason,'forbidden');
 assert.deepEqual((await view(t,{...t.owner,userId:'other'})).items,[]);
 for(const update of ["status='suspended'","role='client'"]){
  const original=t.owner;run(t.raw,`UPDATE workspace_memberships SET ${update} WHERE id='m-ellen'`);
  assert.deepEqual((await view(t,original)).items,[]);
  run(t.raw,"UPDATE workspace_memberships SET status='active',role='owner',user_id='ellen' WHERE id='m-ellen'");
 }
});

test('historical inactive responsibility is retained without becoming an active assignee',async()=>{
 const t=await setup();await t.addAction({assigneeMembershipId:'m-sam'});
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'");
 const result=await view(t);assert.equal(result.items[0].membershipId,'m-sam');assert.equal(result.items[0].open,1);assert.equal(result.items[0].active,false);
 assert.equal((await view(t,t.owner,{assignee:'m-sam'})).actions.items.length,1);
});

test('group pagination and Action pagination remain bounded after visibility filtering',async()=>{
 const t=await setup();
 for(let i=0;i<28;i++){
  const id='worker'+String(i).padStart(2,'0');
  run(t.raw,'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)',id,id,id+'@example.test');
  run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,'a',?,'team_member','active')",'m-'+id,id);
  t.seedAction('row'+i,{assignee_membership_id:'m-'+id});
 }
 for(let i=0;i<52;i++)t.seedAction('own'+i,{assignee_membership_id:'m-sam',visibility:'restricted'});
 let first=await view(t),second=await view(t,t.owner,{page:'2'});
 assert.equal(first.items.length,25);assert.equal(first.hasMore,true);assert.equal(second.items.length,4);assert.equal(second.hasMore,false);
 assert.equal(new Set([...first.items,...second.items].map(x=>x.membershipId)).size,29);
 const sam=await t.actor('sam'),narrow=await view(t,sam,{assignee:'m-sam'});
 assert.equal(narrow.items.length,1);assert.equal(narrow.items[0].open,52);assert.equal(narrow.actions.items.length,50);assert.equal(narrow.actions.hasMore,true);
 const next=await view(t,sam,{assignee:'m-sam',actionPage:'2'});assert.equal(next.actions.items.length,2);assert.equal(next.actions.hasMore,false);
});

test('query validation rejects arrays, arbitrary filters, huge bounds and injected identifiers',()=>{
 for(const input of [null,[],{page:1},{page:'0'},{page:'10000'},{page:'1e2'},{actionPage:'-1'},{assignee:[]},{assignee:'x '.repeat(5)},{assignee:'x'.repeat(121)},{workspaceId:'other'}])assert.equal(normalizeWorkloadQuery(input).ok,false);
 assert.deepEqual(normalizeWorkloadQuery({page:'2',actionPage:'3',assignee:'m-sam'}),{ok:true,page:2,actionPage:3,assignee:'m-sam'});
});
