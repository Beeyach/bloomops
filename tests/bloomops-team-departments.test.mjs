import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_actions.mjs';
import {run} from './_bloomops-db.mjs';
import {normalizeDepartmentQuery,teamDepartmentWork} from '../lib/bloomops/team-departments.mjs';
const now=new Date('2026-09-16T12:00:00Z');
const view=(t,query={},actor=t.owner)=>teamDepartmentWork(t.db,actor,query,{now});
async function fixture(){const t=await setup();for(const slug of ['ads','operations'])run(t.raw,'INSERT INTO departments(id,workspace_id,name,slug) VALUES(?,?,?,?)',slug,'a',slug,slug);const made=await t.create({serviceEngagementId:'social-service'});assert.equal(made.ok,true);t.projectId=made.projectId;return t;}

test('departments follow the Service department and the schema rejects conflicting Project metadata',async()=>{
 const t=await fixture();const made=await t.create({serviceEngagementId:'ghl-service'});assert.equal(made.ok,true);t.projectId=made.projectId;assert.throws(()=>run(t.raw,"UPDATE projects SET department_id='social' WHERE id=?",t.projectId),/projects_department_source_chk/);
 const action=(await t.addAction()).actionId,before=t.actionSnapshot();
 assert.ok(!(await view(t,{department:'social'})).records.items.some(p=>p.id===t.projectId));
 assert.ok((await view(t,{department:'systems'})).records.items.some(p=>p.id===t.projectId));
 assert.deepEqual((await view(t,{department:'systems',tab:'actions'})).records.items.map(a=>a.id),[action]);
 assert.equal((await view(t,{department:'social',tab:'actions'})).records.items.length,0);
 assert.deepEqual(t.actionSnapshot(),before);
});
test('Operations without a Service remains canonical Work, including open/all and explicit empty states',async()=>{
 const t=await fixture();const made=await t.create({departmentId:'operations'});assert.equal(made.ok,true);t.projectId=made.projectId;
 const action=(await t.addAction()).actionId;await t.progress(action,'cancelled');
 assert.equal((await view(t,{department:'operations'})).records.items.length,1);
 assert.equal((await view(t,{department:'operations',tab:'actions'})).records.items.length,0);
 assert.deepEqual((await view(t,{department:'operations',tab:'actions',state:'all'})).records.items.map(a=>a.id),[action]);
 await t.move(t.projectId,'cancelled');
 assert.equal((await view(t,{department:'operations'})).records.items.length,0);
 assert.equal((await view(t,{department:'operations',state:'all'})).records.items.length,1);
 assert.equal((await view(t,{department:'ads'})).records.items.length,0);
});
test('department selection never grants Project or sibling access to an Action-only assignee, and revocation is current',async()=>{
 const t=await fixture();
 const id=(await t.addAction({assigneeMembershipId:'m-sam',visibility:'restricted'})).actionId;
 await t.addAction({title:'Hidden sibling',visibility:'restricted'});
 const sam=await t.actor('sam');assert.equal((await view(t,{},sam)).records.items.length,0);
 const rows=(await view(t,{tab:'actions'},sam)).records.items;assert.deepEqual(rows.map(r=>r.id),[id]);assert.equal(rows[0].projectHref,null);
 await t.editAction(id,{assigneeMembershipId:null});assert.equal((await view(t,{tab:'actions'},sam)).records.items.length,0);
});
test('portal, preview, revoked membership, replaced identity and foreign-workspace catalogues fail closed',async()=>{
 const t=await fixture();await t.addAction();
 assert.equal((await view(t,{},await t.actor('james'))).reason,'forbidden');
 assert.equal((await view(t,{}, {...t.owner,preview:{clientId:'james'}})).reason,'forbidden');
 assert.equal((await view(t,{}, {...t.owner,userId:'other'})).reason,'not_found');
 assert.equal((await view(t,{},await t.actor('foreign'))).reason,'not_found');
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");
 assert.equal((await view(t)).reason,'not_found');
});
test('pagination follows authorization and department filtering, without leaking inaccessible rows',async()=>{
 const t=await fixture();
 for(let i=0;i<55;i++)t.seedAction('hidden'+i,{visibility:'restricted'});
 for(let i=0;i<52;i++)t.seedAction('own'+i,{assignee_membership_id:'m-sam',visibility:'restricted'});
 const sam=await t.actor('sam'),one=await view(t,{tab:'actions'},sam),two=await view(t,{tab:'actions',page:'2'},sam);
 assert.equal(one.records.items.length,50);assert.equal(one.records.hasMore,true);assert.equal(two.records.items.length,2);assert.equal(two.records.hasMore,false);
 assert.ok([...one.records.items,...two.records.items].every(row=>row.id.startsWith('own')));
 assert.equal(new Set([...one.records.items,...two.records.items].map(r=>r.id)).size,52);
});
test('catalogue names and inactive history remain truthful, unsupported query values are rejected',async()=>{
 const t=await fixture();run(t.raw,"UPDATE departments SET name='Delivery Systems',active=0 WHERE id='systems'");
 const result=await view(t,{department:'systems'});assert.equal(result.department.name,'Delivery Systems');assert.equal(result.department.active,false);
 for(const input of [null,[],{department:'foreign-dept'},{department:'Social'},{page:'0'},{page:'10001'},{page:'2e1'},{page:[]},{tab:'members'},{state:'deleted'},{workspaceId:'b'}])assert.equal(normalizeDepartmentQuery(input),null);
 assert.deepEqual(normalizeDepartmentQuery({}),{department:'social',tab:'projects',page:1,state:'open'});
});
