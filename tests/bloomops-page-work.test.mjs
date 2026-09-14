import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './_actions.mjs';
import {run,all} from './_bloomops-db.mjs';
import {createWorkspacePage} from '../lib/bloomops/pages.mjs';
import {getPageWork} from '../lib/bloomops/page-work.mjs';
import {pageWorkConfiguration} from '../lib/bloomops/page-work-values.mjs';
import {normalizeActionFilters} from '../lib/bloomops/actions.mjs';
async function fixture(c){
 const t=await setup();c.after(()=>t.raw.close());
 const made=await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()});assert.ok(made.ok);t.pageId=made.id;
 t.work=(actor=t.owner,input={})=>getPageWork(t.db,actor,t.pageId,{workspaceId:actor.workspaceId,...input});
 t.grant=(who,permission='view')=>run(t.raw,"INSERT INTO bloomops_page_grants(workspace_id,page_id,membership_id,recipient_role,contact_id,permission) SELECT 'a',?,id,role,CASE WHEN role='client' THEN 'c-'||user_id ELSE NULL END,? FROM workspace_memberships WHERE id=?",t.pageId,permission,'m-'+who);
 return t;
}
test('linked views return bounded canonical fields and never mutate pages or Actions',async c=>{
 const t=await fixture(c);t.seedAction('first',{description:'Private operational detail',due_date:'2026-09-14',assignee_membership_id:'m-sam'});
 const before=t.actionSnapshot(),pages=all(t.raw,'SELECT * FROM bloomops_pages');const result=await t.work();assert.ok(result.ok);assert.deepEqual(result.items,[{id:'first',title:'first',status:'to_do',dueDate:'2026-09-14',assigneeName:'sam'}]);assert.deepEqual(t.actionSnapshot(),before);assert.deepEqual(all(t.raw,'SELECT * FROM bloomops_pages'),pages);
});
test('page grant and action assignment are independently required',async c=>{
 const t=await fixture(c);t.seedAction('assigned',{assignee_membership_id:'m-sam'});t.seedAction('private');const actor=await t.actor('sam');
 assert.equal((await t.work(actor)).reason,'not_found');t.grant('sam');assert.deepEqual((await t.work(actor)).items.map(x=>x.id),['assigned']);
 run(t.raw,"UPDATE actions SET assignee_membership_id=NULL,revision=revision+1 WHERE id='assigned'");assert.deepEqual((await t.work(actor)).items,[]);
});
test('client page editing grants never expose internal Actions',async c=>{const t=await fixture(c);t.seedAction('private');t.grant('james','edit');assert.equal((await t.work(await t.actor('james'))).reason,'not_found');});
test('foreign and missing pages return no records',async c=>{const t=await fixture(c);t.seedAction('private');assert.equal((await t.work(await t.actor('foreign'))).reason,'not_found');assert.equal((await getPageWork(t.db,t.owner,crypto.randomUUID(),{workspaceId:'a'})).reason,'not_found');});
for(const change of ["UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'","UPDATE workspaces SET status='archived' WHERE id='a'","UPDATE workspace_memberships SET role='client' WHERE id='m-ellen'"])test('current authority denies stale actor: '+change,async c=>{const t=await fixture(c);t.seedAction('private');run(t.raw,change);assert.equal((await t.work()).reason,'not_found');});
test('page revocation between page check and Actions query gates rows in SQL',async c=>{
 const t=await fixture(c);t.seedAction('assigned',{assignee_membership_id:'m-sam'});t.grant('sam');const actor=await t.actor('sam'),select=t.db.select.bind(t.db);let calls=0;
 t.db.select=(...args)=>{if(++calls===2)run(t.raw,"UPDATE bloomops_page_grants SET permission='none' WHERE page_id=?",t.pageId);return select(...args);};
 const result=await t.work(actor);assert.ok(result.ok);assert.deepEqual(result.items,[]);
});
test('page IDs are correlated to the requested page, never an unrelated shared page',async c=>{const t=await fixture(c);t.seedAction('assigned',{assignee_membership_id:'m-sam'});t.grant('sam');const other=await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID()});assert.equal((await getPageWork(t.db,await t.actor('sam'),other.id,{workspaceId:'a'})).reason,'not_found');});
test('server filters precede bounded pagination without losing later rows',async c=>{const t=await fixture(c);for(let i=0;i<57;i++)t.seedAction('row-'+String(i).padStart(2,'0'),{status:i<55?'to_do':'cancelled'});const a=await t.work(t.owner,{status:'to_do'}),b=await t.work(t.owner,{status:'to_do',page:'2'});assert.equal(a.items.length,50);assert.ok(a.hasMore);assert.equal(b.items.length,5);assert.equal(b.hasMore,false);assert.equal(new Set([...a.items,...b.items].map(x=>x.id)).size,55);assert.equal((await t.work(t.owner,{status:'cancelled'})).items.length,2);});
test('strict configuration and request fields cannot select endpoints or bypass Work scope',async c=>{const t=await fixture(c);for(const input of [{workspaceId:'b'},{page:'0'},{page:'1.5'},{page:'10000'},{status:'blocked'},{source:'prospects'},{scopeCondition:'1'},{endpoint:'/api/clients'}])assert.equal((await t.work(t.owner,input)).reason,'invalid');for(const view of ['table','board','calendar','gallery'])assert.equal(pageWorkConfiguration({source:'actions',view,groupBy:'status'}).view,view);for(const attrs of [{source:'prospects',view:'table'},{source:'actions',view:'other'},{source:'actions',view:'table',filter:'{"stages":[]}'},{source:'actions',view:'table',sort:'title:asc'}])assert.equal(pageWorkConfiguration(attrs),null);assert.equal(normalizeActionFilters({view:'all',scopeCondition:'1'}).ok,false);});
test('Action assignment revocation during page read also gates the final rows',async c=>{const t=await fixture(c);t.seedAction('assigned',{assignee_membership_id:'m-sam'});t.grant('sam');const actor=await t.actor('sam'),select=t.db.select.bind(t.db);let calls=0;t.db.select=(...args)=>{if(++calls===2)run(t.raw,"UPDATE actions SET assignee_membership_id=NULL,revision=revision+1 WHERE id='assigned'");return select(...args);};assert.deepEqual((await t.work(actor)).items,[]);});
test('inherited child access intersects Action permissions and follows revocation',async c=>{const t=await fixture(c);t.seedAction('assigned',{assignee_membership_id:'m-sam'});t.grant('sam');const revision=all(t.raw,"SELECT revision FROM bloomops_page_trees WHERE workspace_id='a'")[0].revision;const child=await createWorkspacePage(t.db,t.owner,{workspaceId:'a',requestId:crypto.randomUUID(),parentId:t.pageId,expectedTreeRevision:revision});assert.ok(child.ok);const actor=await t.actor('sam');assert.deepEqual((await getPageWork(t.db,actor,child.id,{workspaceId:'a'})).items.map(x=>x.id),['assigned']);run(t.raw,"UPDATE bloomops_page_grants SET permission='none' WHERE page_id=?",t.pageId);assert.equal((await getPageWork(t.db,actor,child.id,{workspaceId:'a'})).reason,'not_found');});
