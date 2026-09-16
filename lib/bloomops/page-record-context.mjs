import {and,asc,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {ACTIONS,INTERNAL_ROLES} from './authorization.mjs';
import {pageReadCondition} from './page-access.mjs';
import {liveProjectActor,projectReadCondition} from './project-access.mjs';
import {previewClientCondition} from './preview-policy.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
const p=schema.workspacePages,x=schema.workspacePageContexts,c=schema.clients,j=schema.projects;
const missing=()=>({ok:false,reason:'not_found'});
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(v);
const internal=actor=>INTERNAL_ROLES.includes(actor?.role)&&!actor?.preview;
// Current SQL counterpart of A4 client.view: internal Client-wide assignment,
// or a genuine portal contact. A Project assignment does not open its Client.
function clientCondition(actor,clientId){
 if(!actor?.scope||!INTERNAL_ROLES.includes(actor.role)&&actor.role!=='client')return sql`0`;
 const scope=actor.role==='client'?sql`EXISTS(SELECT 1 FROM client_contacts cc WHERE cc.workspace_id=${actor.workspaceId} AND cc.client_id=${clientId} AND cc.user_id=${actor.userId})`:
 ACTIONS['client.manage'].roles.includes(actor.role)?sql`1`:sql`EXISTS(SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${actor.workspaceId} AND ca.client_id=${clientId} AND ca.membership_id=${actor.membershipId})`;
 return and(liveProjectActor(actor),previewClientCondition(actor,clientId),scope,sql`EXISTS(SELECT 1 FROM bloomops_clients pc WHERE pc.workspace_id=${actor.workspaceId} AND pc.id=${clientId})`);
}
const pageGuard=(actor,pageId,{edit=false}={})=>and(eq(p.workspaceId,actor?.workspaceId||''),eq(p.id,pageId),pageReadCondition(actor,p.id),edit?internal(actor)?administratorCondition(actor):sql`0`:sql`1`);
const pageExists=(actor,pageId,edit=false)=>sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE ${pageGuard(actor,pageId,{edit})})`;
const projectExists=(actor,projectId,clientId)=>sql`EXISTS(SELECT 1 FROM projects WHERE ${and(eq(j.id,projectId),eq(j.clientId,clientId),projectReadCondition(actor,{portal:actor?.role==='client'}))})`;
const rowFor=(db,actor,pageId,edit=false)=>db.select().from(x).where(and(eq(x.workspaceId,actor?.workspaceId||''),eq(x.pageId,pageId),pageExists(actor,pageId,edit))).limit(1);

export async function getPageRecordContext(db,actor,pageId){
 if(!REQUEST_ID.test(pageId||''))return null;
 const [page]=await db.select({id:p.id,canManage:internal(actor)?administratorCondition(actor).as('canManage'):sql`0`.as('canManage')}).from(p).where(pageGuard(actor,pageId)).limit(1);if(!page)return null;
 const [client,project,stored]=await db.batch([
  db.select({id:c.id,name:c.name}).from(x).innerJoin(c,and(eq(c.workspaceId,x.workspaceId),eq(c.id,x.clientId))).where(and(eq(x.workspaceId,actor.workspaceId),eq(x.pageId,pageId),pageExists(actor,pageId),clientCondition(actor,c.id))).limit(1),
  db.select({id:j.id,name:actor.role==='client'?sql`coalesce(${j.clientLabel},${j.name})`:j.name}).from(x).innerJoin(j,and(eq(j.workspaceId,x.workspaceId),eq(j.clientId,x.clientId),eq(j.id,x.projectId))).where(and(eq(x.workspaceId,actor.workspaceId),eq(x.pageId,pageId),pageExists(actor,pageId),projectReadCondition(actor,{portal:actor.role==='client'}))).limit(1),
  rowFor(db,actor,pageId,true),
 ]);
 // The final authority read also covers a permission change during the batch.
 const [fresh]=await db.select({id:p.id,canManage:internal(actor)?administratorCondition(actor).as('canManage'):sql`0`.as('canManage')}).from(p).where(pageGuard(actor,pageId)).limit(1);if(!fresh)return null;
 return {client:client[0]?{...client[0],href:actor.role==='client'?'/portal':`/clients/${client[0].id}`}:null,project:project[0]?{...project[0],href:actor.role==='client'?`/portal#project-${project[0].id}`:`/work/projects/${project[0].id}`}:null,canManage:!!fresh.canManage&&internal(actor),revision:fresh.canManage?(stored[0]?.revision||0):null};
}

export async function pageRecordOptions(db,actor,pageId,{kind='client',clientId=null,search='',page=1}={}){
 if(!REQUEST_ID.test(pageId||'')||!['client','project'].includes(kind)||typeof search!=='string'||search.length>100||!Number.isSafeInteger(page)||page<1||page>10000||kind==='project'&&!id(clientId))return null;
 if(!(await db.select({id:p.id}).from(p).where(pageGuard(actor,pageId,{edit:true})).limit(1)).length)return null;
 const table=kind==='client'?c:j;
 const rows=await db.select({id:table.id,name:table.name}).from(table).where(and(eq(table.workspaceId,actor.workspaceId),pageExists(actor,pageId,true),kind==='client'?clientCondition(actor,c.id):and(eq(j.clientId,clientId),projectReadCondition(actor)),sql`instr(lower(${table.name}),lower(${search.trim()}))>0`)).orderBy(asc(table.name),asc(table.id)).limit(21).offset((page-1)*20);
 return {items:rows.slice(0,20),more:rows.length>20,page};
}

export async function savePageRecordContext(db,actor,pageId,input){
 if(!internal(actor)||!REQUEST_ID.test(pageId||'')||!input||input.userId!==actor.userId||input.workspaceId!==actor.workspaceId)return missing();
 const keys=['userId','workspaceId','expectedRevision','clientId','projectId'];
 if(Object.keys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k))||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||input.expectedRevision>=Number.MAX_SAFE_INTEGER||input.clientId!==null&&!id(input.clientId)||input.projectId!==null&&!id(input.projectId)||input.projectId!==null&&input.clientId===null)return {ok:false,reason:'invalid',error:'Choose a Client and, optionally, its Project.'};
 const target=and(pageExists(actor,pageId,true),input.clientId===null?sql`1`:clientCondition(actor,input.clientId),input.projectId===null?sql`1`:projectExists(actor,input.projectId,input.clientId));
 const [authorized,rows]=await db.batch([db.select({id:p.id}).from(p).where(and(eq(p.id,pageId),target)).limit(1),rowFor(db,actor,pageId,true)]);
 if(!authorized.length)return missing();const [before]=rows;
 // Idempotent desired-state updates have no copied records or external effects.
 // An uncertain response can be confirmed without rewriting history/revisions.
 if((before?.clientId||null)===input.clientId&&(before?.projectId||null)===input.projectId)return {ok:true,revision:before?.revision||0,unchanged:true};
 if((before?.revision||0)!==input.expectedRevision)return {ok:false,reason:'conflict'};
 const mutationId=crypto.randomUUID(),revision=input.expectedRevision+1,now=new Date().toISOString();
 const current=sql`COALESCE((SELECT revision FROM bloomops_page_contexts WHERE page_id=${pageId} AND workspace_id=${actor.workspaceId}),0)=${input.expectedRevision}`;
 const values={pageId,workspaceId:actor.workspaceId,clientId:input.clientId,projectId:input.projectId,revision,mutationId,updatedAt:now};
 const [written]=await db.batch([
  insertSelected(db,x,values,p,and(eq(p.id,pageId),target,current)).onConflictDoUpdate({target:x.pageId,set:values,setWhere:and(eq(x.workspaceId,actor.workspaceId),eq(x.revision,input.expectedRevision),target)}).returning({revision:x.revision}),
  activityForMutation(db,x,and(eq(x.pageId,pageId),eq(x.workspaceId,actor.workspaceId),eq(x.mutationId,mutationId)),{workspaceId:actor.workspaceId,eventType:'PAGE_CONTEXT_CHANGED',subjectType:'page',subjectId:pageId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:now}),
 ]);
 if(written[0])return {ok:true,revision:written[0].revision};
 const after=await getPageRecordContext(db,actor,pageId);
 return after?.canManage&&(after.client?.id||null)===input.clientId&&(after.project?.id||null)===input.projectId?{ok:true,revision:after.revision,unchanged:true}:after?.canManage?{ok:false,reason:'conflict'}:missing();
}

export async function listRecordPages(db,actor,{kind,recordId,page=1}){
 if(!internal(actor)||!['client','project'].includes(kind)||!id(recordId)||!Number.isSafeInteger(page)||page<1||page>10000)return null;
 const table=kind==='client'?c:j,condition=kind==='client'?clientCondition(actor,c.id):projectReadCondition(actor);
 const [record]=await db.select({id:table.id,name:table.name}).from(table).where(and(eq(table.id,recordId),condition)).limit(1);if(!record)return null;
 const allowedRecord=sql`EXISTS(SELECT 1 FROM ${table} WHERE ${and(eq(table.id,recordId),condition)})`;
 const rows=await db.select({id:p.id,title:p.title}).from(x).innerJoin(p,and(eq(p.workspaceId,x.workspaceId),eq(p.id,x.pageId))).where(and(eq(x.workspaceId,actor.workspaceId),eq(kind==='client'?x.clientId:x.projectId,recordId),allowedRecord,pageReadCondition(actor,p.id))).orderBy(asc(p.title),asc(p.id)).limit(21).offset((page-1)*20);
 return {record,items:rows.slice(0,20),more:rows.length>20,page};
}
