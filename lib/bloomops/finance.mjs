import {and,eq,asc,desc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {INTERNAL_ROLES,roleCapabilities} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {financeInput,financeAmount,FINANCE_STATUSES} from './finance-values.mjs';
const r=schema.financeRecords,c=schema.clients,s=schema.serviceEngagements,w=schema.workspaces,m=schema.workspaceMemberships,cap=schema.memberCapabilities;
const missing=()=>({ok:false,reason:'not_found'});
const conflict=()=>({ok:false,reason:'conflict',error:'This record changed. Your input is preserved. Open the saved record separately before applying your changes again.'});
const id=v=>typeof v==='string'&&v.length>0&&v.length<=100;
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
export function financeCapability(actor,key='finance.view'){
 if(!actor?.scope||actor.preview||!INTERNAL_ROLES.includes(actor.role))return sql`0`;
 if(key==='capabilities.manage')key='members.manage';
 const grant=roleCapabilities(actor.role).has(key)?sql`1`:sql`EXISTS (SELECT 1 FROM member_capabilities fc WHERE fc.workspace_id=${actor.workspaceId} AND fc.membership_id=${actor.membershipId} AND fc.capability=${key})`;
 return and(liveProjectActor(actor),grant);
}
export async function financePermission(db,actor,key='finance.view'){
 return Boolean((await db.select({id:w.id}).from(w).where(and(eq(w.id,actor?.workspaceId||''),financeCapability(actor,key))).limit(1))[0]);
}
export function financeScope(actor,clientId,serviceId){
 if(!actor?.scope||actor.preview||!INTERNAL_ROLES.includes(actor.role))return sql`0`;
 return actor.role!=='team_member'?sql`1`:sql`(EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${actor.workspaceId} AND ca.client_id=${clientId} AND ca.membership_id=${actor.membershipId}) OR (${serviceId} IS NOT NULL AND EXISTS (SELECT 1 FROM service_assignments sa WHERE sa.workspace_id=${actor.workspaceId} AND sa.service_engagement_id=${serviceId} AND sa.membership_id=${actor.membershipId})))`;
}
const access=(actor,{edit=false}={})=>and(eq(r.workspaceId,actor?.workspaceId||''),financeCapability(actor),edit?financeCapability(actor,'finance.edit'):sql`1`,financeScope(actor,r.clientId,r.serviceEngagementId));
const selection={record:r,clientName:sql`${c.name}`.as("clientName"),serviceName:sql`${schema.serviceTypes.name}`.as("serviceName"),packageName:s.packageName};
function query(db){return db.select(selection).from(r).innerJoin(c,and(eq(c.id,r.clientId),eq(c.workspaceId,r.workspaceId)))
 .leftJoin(s,and(eq(s.id,r.serviceEngagementId),eq(s.workspaceId,r.workspaceId),eq(s.clientId,r.clientId)))
 .leftJoin(schema.serviceTypes,and(eq(schema.serviceTypes.id,s.serviceTypeId),eq(schema.serviceTypes.workspaceId,s.workspaceId)));}
function dto(row){const {creationHash,requestId,creatorUserId,...record}=row.record;return {...record,amount:financeAmount(record.amountMinor,record.currencyDigits),archived:!!record.archived,clientName:row.clientName,serviceName:row.serviceName,packageName:row.packageName};}
export async function getFinanceRecord(db,actor,recordId){
 if(!id(recordId))return null;
 const [row]=await query(db).where(and(access(actor),eq(r.id,recordId))).limit(1);return row?dto(row):null;
}
export async function listFinanceRecords(db,actor,input={}){
 if(!keys(input,['page','kind','status','clientId','serviceEngagementId','archived','overdue']))return {ok:false,reason:'invalid'};
 const page=Number(input.page||1),kind=input.kind||'',status=input.status||'',archived=input.archived||'',overdue=input.overdue||'';
 if(!Number.isSafeInteger(page)||page<1||page>10000||kind&&!['invoice','payment'].includes(kind)||status&&!Object.values(FINANCE_STATUSES).flat().includes(status)||!['','true'].includes(archived)||!['','true'].includes(overdue)||input.clientId&&!id(input.clientId)||input.serviceEngagementId&&!id(input.serviceEngagementId))return {ok:false,reason:'invalid'};
 if(!await financePermission(db,actor))return missing();
 const today=new Date().toISOString().slice(0,10);
 const condition=and(access(actor),eq(r.archived,archived?1:0),kind?eq(r.kind,kind):sql`1`,status?eq(r.status,status):sql`1`,input.clientId?eq(r.clientId,input.clientId):sql`1`,input.serviceEngagementId?eq(r.serviceEngagementId,input.serviceEngagementId):sql`1`,overdue?sql`${r.kind}='invoice' AND ${r.status} IN ('sent','overdue') AND ${r.dueDate}<${today}`:sql`1`);
 const [rows,totals]=await db.batch([
  query(db).where(condition).orderBy(desc(r.createdAt),asc(r.id)).limit(26).offset((page-1)*25),
  db.select({currency:r.currency,digits:r.currencyDigits,kind:r.kind,status:r.status,count:sql`count(*)`,minor:sql`cast(sum(${r.amountMinor}) as text)`}).from(r).where(condition).groupBy(r.currency,r.currencyDigits,r.kind,r.status).orderBy(asc(r.currency),asc(r.kind),asc(r.status)),
 ]);
 return {ok:true,items:rows.slice(0,25).map(dto),more:rows.length>25,page,today,totals:totals.map(({minor,...t})=>({...t,amount:financeAmount(minor,t.digits)})),canEdit:await financePermission(db,actor,'finance.edit')};
}
// Flatten supported parent choices, not every Client or sibling Service.
export async function financeParents(db,actor,{search='',page=1}={}){
 if(typeof search!=='string'||search.length>100||!Number.isSafeInteger(page)||page<1||page>10000||!await financePermission(db,actor))return null;
 const guard=and(eq(c.workspaceId,actor.workspaceId),financeCapability(actor),sql`instr(lower(${c.name} || ' ' || coalesce(${schema.serviceTypes.name},'')),lower(${search}))>0`);
 const [clients,services]=await db.batch([
  db.select({clientId:c.id,clientName:c.name}).from(c).leftJoin(schema.serviceTypes,sql`0`).where(and(guard,financeScope(actor,c.id,sql`NULL`))).orderBy(asc(c.id)).limit(26).offset((page-1)*25),
  db.select({clientId:sql`${c.id}`.as("clientId"),clientName:sql`${c.name}`.as("clientName"),serviceEngagementId:sql`${s.id}`.as("serviceEngagementId"),serviceName:sql`${schema.serviceTypes.name}`.as("serviceName"),packageName:s.packageName}).from(s).innerJoin(c,and(eq(c.id,s.clientId),eq(c.workspaceId,s.workspaceId))).innerJoin(schema.serviceTypes,and(eq(schema.serviceTypes.id,s.serviceTypeId),eq(schema.serviceTypes.workspaceId,s.workspaceId)))
  .where(and(guard,eq(s.workspaceId,actor.workspaceId),financeScope(actor,c.id,s.id))).orderBy(asc(s.id)).limit(26).offset((page-1)*25),
 ]);
 return {items:[...clients.slice(0,25).map(v=>({...v,serviceEngagementId:null})),...services.slice(0,25)],page,more:clients.length>25||services.length>25};
}
export async function saveFinanceRecord(db,actor,recordId,input){
 if(!keys(input,['workspaceId','userId','requestId','expectedRevision','clientId','serviceEngagementId','kind','record'])||input.workspaceId!==actor?.workspaceId||input.userId!==actor?.userId||!id(input.clientId)||input.serviceEngagementId!==null&&!id(input.serviceEngagementId)||recordId!==null&&!id(recordId))return missing();
 if(!await financePermission(db,actor)||!await financePermission(db,actor,'finance.edit'))return missing();
 const old=recordId?await getFinanceRecord(db,actor,recordId):null;if(recordId&&!old)return missing();
 if(old&&(old.clientId!==input.clientId||old.serviceEngagementId!==input.serviceEngagementId||old.kind!==input.kind))return {ok:false,reason:'invalid',error:'The record type and Client/Service association cannot change.'};
 if(recordId===null&&!REQUEST_ID.test(input.requestId||'')||recordId!==null&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1))return {ok:false,reason:'invalid',error:'Invalid request or saved revision.'};
 // Existing precision is authoritative while the currency is unchanged.
 const normalized=financeInput(input.record,input.kind,old?.currency===input.record?.currency?old.currencyDigits:null);
 if(!normalized.value)return {ok:false,reason:'invalid',error:normalized.error};const v=normalized.value;
 const intent=JSON.stringify([input.clientId,input.serviceEngagementId,input.kind,v.title,v.amountMinor,v.currency,v.currencyDigits,v.status,v.dueDate,v.paidDate,v.renewalDate,v.provider,v.reference,v.notes,v.archived]);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(intent))),b=>b.toString(16).padStart(2,'0')).join('');
 const retry=async()=>{const [row]=await db.select({id:r.id,hash:r.creationHash}).from(r).where(and(access(actor,{edit:true}),eq(r.creatorUserId,actor.userId),eq(r.requestId,input.requestId))).limit(1);return row?row.hash===hash?{ok:true,id:row.id}:conflict():null;};
 if(recordId===null){const prior=await retry();if(prior)return prior;}
 const relation=and(sql`EXISTS (SELECT 1 FROM bloomops_clients WHERE id=${input.clientId} AND workspace_id=${actor.workspaceId})`,input.serviceEngagementId?sql`EXISTS (SELECT 1 FROM service_engagements WHERE id=${input.serviceEngagementId} AND workspace_id=${actor.workspaceId} AND client_id=${input.clientId})`:sql`1`);
 const fresh=and(financeCapability(actor),financeCapability(actor,'finance.edit'),financeScope(actor,input.clientId,input.serviceEngagementId),relation);
 const now=new Date().toISOString(),recordIdValue=recordId||crypto.randomUUID(),values={...v,updatedAt:now,updaterMembershipId:actor.membershipId};
 const rows=recordId===null?await insertSelected(db,r,{...values,id:recordIdValue,workspaceId:actor.workspaceId,clientId:input.clientId,serviceEngagementId:input.serviceEngagementId,kind:input.kind,revision:1,requestId:input.requestId,creationHash:hash,creatorUserId:actor.userId,creatorMembershipId:actor.membershipId,createdAt:now},w,and(eq(w.id,actor.workspaceId),fresh)).onConflictDoNothing().returning({id:r.id}):
 await db.update(r).set({...values,revision:input.expectedRevision+1}).where(and(access(actor,{edit:true}),eq(r.id,recordId),eq(r.revision,input.expectedRevision),fresh)).returning({id:r.id});
 if(rows.length)return {ok:true,id:recordIdValue};
 if(recordId===null)return await retry()||missing();
 return await getFinanceRecord(db,actor,recordId)&&await financePermission(db,actor,'finance.edit')?conflict():missing();
}

export async function financeAccessMembers(db,actor,page=1){
 if(!Number.isSafeInteger(page)||page<1||page>10000||!await financePermission(db,actor,'capabilities.manage'))return null;
 const rows=await db.select({id:m.id,userId:m.userId,role:m.role,status:m.status,name:schema.user.name,
  view:sql`EXISTS(SELECT 1 FROM member_capabilities WHERE workspace_id=${m.workspaceId} AND membership_id=${m.id} AND capability='finance.view')`,
  edit:sql`EXISTS(SELECT 1 FROM member_capabilities WHERE workspace_id=${m.workspaceId} AND membership_id=${m.id} AND capability='finance.edit')`,
 }).from(m).innerJoin(schema.user,eq(schema.user.id,m.userId)).where(and(eq(m.workspaceId,actor.workspaceId),eq(m.status,'active'),sql`${m.role} IN ('owner','admin','project_manager','team_member')`,financeCapability(actor,'capabilities.manage'))).orderBy(asc(m.id)).limit(26).offset((page-1)*25);
 return {items:rows.slice(0,25).map(row=>({...row,mode:row.role==='owner'?'edit':row.view?row.edit?'edit':'view':'none'})),page,more:rows.length>25};
}
export async function setFinanceAccess(db,actor,membershipId,input){
 if(!keys(input,['workspaceId','userId','targetUserId','mode'])||input.workspaceId!==actor?.workspaceId||input.userId!==actor?.userId||!id(membershipId)||!id(input.targetUserId)||!['none','view','edit'].includes(input.mode)||!await financePermission(db,actor,'capabilities.manage'))return missing();
 const guard=and(eq(m.id,membershipId),eq(m.workspaceId,actor.workspaceId),eq(m.userId,input.targetUserId),eq(m.status,'active'),sql`${m.role} IN ('admin','project_manager','team_member')`,financeCapability(actor,'capabilities.manage'));
 const exists=sql`EXISTS(SELECT 1 FROM workspace_memberships WHERE ${guard})`;
 const keysToGrant=input.mode==='edit'?['finance.view','finance.edit']:input.mode==='view'?['finance.view']:[];
 const now=new Date().toISOString();
 const result=await db.batch([
  db.select({id:m.id}).from(m).where(guard).limit(1),
  db.delete(cap).where(and(eq(cap.workspaceId,actor.workspaceId),eq(cap.membershipId,membershipId),sql`${cap.capability} IN ('finance.view','finance.edit')`,exists)),
  ...keysToGrant.map(capability=>insertSelected(db,cap,{id:crypto.randomUUID(),workspaceId:actor.workspaceId,membershipId,capability,grantedByMembershipId:actor.membershipId,createdAt:now},m,guard)),
 ]);
 return result[0].length?{ok:true}:missing();
}
