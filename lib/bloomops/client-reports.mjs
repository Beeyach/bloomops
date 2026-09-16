import {and,eq,desc,asc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {ACTIONS,evaluate,loadInternalClientResource,loadInternalServiceResource} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {reportTemplate,reportInput,reportId,exactKeys,reportCalculations,CLIENT_NARRATIVE_FIELDS} from './client-report-values.mjs';
const r=schema.clientReportDrafts,m=schema.clientReportMetrics,c=schema.clients,s=schema.serviceEngagements,w=schema.workspaces;
const missing=()=>({ok:false,reason:'not_found'});
const conflict=()=>({ok:false,reason:'conflict',error:'The saved draft changed. Your input is still here. Reopen the saved draft before editing again.'});
export const canEditReports=actor=>!actor?.preview&&ACTIONS['client.manage'].roles.includes(actor?.role)&&ACTIONS['service.manage'].roles.includes(actor?.role);
// Require BOTH internal Client and Service scope. Client-wide assignment implies
// service read in A4; Service-only assignment cannot enter the internal Client.
export function reportClientCondition(actor,clientId,{edit=false}={}){
 if(!actor?.scope||actor.preview||!['owner','admin','project_manager','team_member'].includes(actor.role)||edit&&!canEditReports(actor))return sql`0`;
 const assigned=actor.role==='team_member'?sql`EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${actor.workspaceId} AND ca.client_id=${clientId} AND ca.membership_id=${actor.membershipId})`:sql`1`;
 return and(liveProjectActor(actor),assigned,sql`EXISTS (SELECT 1 FROM bloomops_clients rc WHERE rc.id=${clientId} AND rc.workspace_id=${actor.workspaceId})`);
}
const reportCondition=(actor,clientId,id)=>and(eq(r.workspaceId,actor?.workspaceId||''),eq(r.clientId,clientId),id?eq(r.id,id):sql`1`,reportClientCondition(actor,r.clientId));
export async function reportClient(db,actor,clientId){
 if(!reportId(clientId))return null;
 const resource=await loadInternalClientResource(db,actor?.workspaceId,clientId);
 if(!evaluate(actor,{action:'client.view',resource}).allowed)return null;
 return (await db.select({id:c.id,name:c.name}).from(c).where(and(eq(c.id,clientId),reportClientCondition(actor,c.id))).limit(1))[0]||null;
}
export async function reportServices(db,actor,clientId,{search='',page=1}={}){
 if(typeof search!=='string'||search.length>100||!Number.isSafeInteger(page)||page<1||page>10000||!await reportClient(db,actor,clientId))return null;
 const rows=await db.select({id:s.id,name:schema.serviceTypes.name,packageName:s.packageName,status:s.status,startDate:s.startDate}).from(s)
 .innerJoin(schema.serviceTypes,and(eq(s.serviceTypeId,schema.serviceTypes.id),eq(s.workspaceId,schema.serviceTypes.workspaceId)))
 .where(and(eq(s.workspaceId,actor.workspaceId),eq(s.clientId,clientId),reportClientCondition(actor,s.clientId),sql`instr(lower(${schema.serviceTypes.name} || ' ' || coalesce(${s.packageName},'')), lower(${search}))>0`))
 .orderBy(asc(s.id)).limit(21).offset((page-1)*20);
 return {items:rows.slice(0,20),more:rows.length>20,page};
}
export async function listClientReports(db,actor,clientId,{page=1,archived=false}={}){
 if(typeof archived!=='boolean'||!Number.isSafeInteger(page)||page<1||page>10000)return null;
 const client=await reportClient(db,actor,clientId);if(!client)return null;
 const rows=await db.select({id:r.id,title:r.title,templateId:r.templateId,templateVersion:r.templateVersion,periodStart:r.periodStart,periodEnd:r.periodEnd,updatedAt:r.updatedAt}).from(r)
 .where(and(reportCondition(actor,clientId),archived?sql`${r.archivedAt} IS NOT NULL`:sql`${r.archivedAt} IS NULL`)).orderBy(desc(r.createdAt),asc(r.id)).limit(21).offset((page-1)*20);
 return {client,items:rows.slice(0,20),more:rows.length>20,page,archived,canEdit:canEditReports(actor)};
}
export async function getClientReport(db,actor,clientId,id){
 if(!reportId(clientId)||!reportId(id))return null;
 const rows=await db.select({report:r,clientName:c.name,serviceName:schema.serviceTypes.name,packageName:s.packageName}).from(r)
 .innerJoin(c,and(eq(c.workspaceId,r.workspaceId),eq(c.id,r.clientId)))
 .innerJoin(s,and(eq(s.workspaceId,r.workspaceId),eq(s.clientId,r.clientId),eq(s.id,r.serviceEngagementId)))
 .innerJoin(schema.serviceTypes,and(eq(schema.serviceTypes.workspaceId,s.workspaceId),eq(schema.serviceTypes.id,s.serviceTypeId)))
 .where(reportCondition(actor,clientId,id)).limit(1);
 if(!rows[0])return null;
 const {report,...names}=rows[0],template=reportTemplate(report.templateId,report.templateVersion);if(!template) return null;
 const metrics=await db.select({key:m.metricKey,state:m.state,value:m.value,sourceNote:m.sourceNote,collectedAt:m.collectedAt,sourceKind:m.sourceKind,importId:m.importId}).from(m)
 .where(and(eq(m.workspaceId,report.workspaceId),eq(m.reportId,id),sql`EXISTS (SELECT 1 FROM client_report_drafts WHERE ${reportCondition(actor,clientId,id)} AND ${r.revision}=${report.revision})`)).orderBy(asc(m.metricKey));
 // An intervening save/revocation cannot return a partially assembled report.
 if(metrics.length!==template.metrics.length)return null;
 const data={...report,...names,metrics:Object.fromEntries(metrics.map(({key,...v})=>[key,v]))};
 delete data.creationHash;delete data.mutationId;delete data.archiveRequestId;delete data.archiveIntentHash;
 return {...data,canEdit:canEditReports(actor)&&!data.archivedAt,canManageArchive:canEditReports(actor),calculations:reportCalculations(data)};
}
// Reuse setup, never prior results. Authorization is current and the new save
// still goes through the canonical creation writer with a fresh request UUID.
export async function newPeriodReportSetup(db,actor,clientId,id){
 if(!canEditReports(actor))return null;
 const report=await getClientReport(db,actor,clientId,id);if(!report)return null;
 const template=reportTemplate(report.templateId,report.templateVersion);
 return {sourceId:report.id,serviceEngagementId:report.serviceEngagementId,serviceName:report.serviceName,packageName:report.packageName,
  templateId:template.id,templateVersion:template.version,title:template.label,
  periodStart:'',periodEnd:'',timezone:report.timezone,channel:report.channel,
  accountLabel:report.accountLabel,scopeLabel:report.scopeLabel,commentary:'',metrics:{},
  ...Object.fromEntries(CLIENT_NARRATIVE_FIELDS.map(key=>[key,'']))};
}
export async function saveClientReport(db,actor,clientId,id,input){
 if(!reportId(clientId)||id!==null&&!reportId(id)||!actor?.scope||!exactKeys(input,['workspaceId','userId','requestId','expectedRevision','serviceEngagementId','templateId','templateVersion','draft'])||input.workspaceId!==actor.workspaceId||input.userId!==actor.userId)return missing();
 if(!canEditReports(actor))return missing();
 const template=reportTemplate(input.templateId,input.templateVersion),validated=reportInput(input.draft,template);
 if(!validated.value)return {ok:false,reason:'invalid',error:validated.error};
 if(!reportId(input.serviceEngagementId)||id===null&&(typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId))||id!==null&&(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1))return {ok:false,reason:'invalid',error:'Invalid report identity or revision.'};
 const client=await loadInternalClientResource(db,actor.workspaceId,clientId),service=await loadInternalServiceResource(db,actor.workspaceId,input.serviceEngagementId,{clientId});
 if(!evaluate(actor,{action:'client.manage',resource:client}).allowed||!evaluate(actor,{action:'service.manage',resource:service}).allowed)return missing();
 const {metrics,...draft}=validated.value;
 // Only normalized scalar values and fixed-order arrays define creation intent.
 // JSON object insertion order is not meaningful; the pinned catalogue orders metrics.
 const intent=[clientId,input.serviceEngagementId,template.id,template.version,
  draft.title,draft.periodStart,draft.periodEnd,draft.timezone,draft.channel,
  draft.accountLabel,draft.scopeLabel,draft.commentary,
  template.metrics.map(({key})=>{const v=metrics[key];return [key,v.state,v.value,v.sourceNote,v.collectedAt];})];
 // Keep existing manual creation hashes stable across this additive migration.
 if(template.metrics.some(({key})=>metrics[key].sourceKind!=='manual'||metrics[key].importId!==null))intent.push(template.metrics.map(({key})=>[key,metrics[key].sourceKind,metrics[key].importId]));
 if(CLIENT_NARRATIVE_FIELDS.some(key=>draft[key]))intent.push(['clientNarrative',...CLIENT_NARRATIVE_FIELDS.map(key=>draft[key])]);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(intent)));
 const creationHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const retry=async()=>{
  const [saved]=await db.select({id:r.id,hash:r.creationHash}).from(r).where(and(reportCondition(actor,clientId),eq(r.creatorUserId,actor.userId),eq(r.requestId,input.requestId))).limit(1);
  return saved?saved.hash===creationHash?{ok:true,id:saved.id}:conflict():null;
 };
 if(id===null){const saved=await retry();if(saved)return saved;}
 const reportIdValue=id||crypto.randomUUID(),mutationId=crypto.randomUUID(),now=new Date().toISOString();
 const serviceGuard=sql`EXISTS (SELECT 1 FROM service_engagements WHERE workspace_id=${actor.workspaceId} AND client_id=${clientId} AND id=${input.serviceEngagementId})`;
 const fresh=and(eq(w.id,actor.workspaceId),reportClientCondition(actor,clientId,{edit:true}),serviceGuard);
 const values={...draft,updaterMembershipId:actor.membershipId,updaterUserId:actor.userId,updatedAt:now,mutationId};
 const header=id===null?insertSelected(db,r,{...values,id:reportIdValue,workspaceId:actor.workspaceId,clientId,serviceEngagementId:input.serviceEngagementId,templateId:template.id,templateVersion:template.version,creatorMembershipId:actor.membershipId,creatorUserId:actor.userId,requestId:input.requestId,creationHash,publicationFloor:0,revision:1,createdAt:now},w,fresh).onConflictDoNothing().returning({id:r.id}):
 db.update(r).set({...values,revision:input.expectedRevision+1}).where(and(reportCondition(actor,clientId,id),reportClientCondition(actor,clientId,{edit:true}),serviceGuard,eq(r.serviceEngagementId,input.serviceEngagementId),eq(r.templateId,template.id),eq(r.templateVersion,template.version),eq(r.revision,input.expectedRevision),sql`${r.archivedAt} IS NULL`)).returning({id:r.id});
 const written=and(eq(r.id,reportIdValue),eq(r.workspaceId,actor.workspaceId),eq(r.mutationId,mutationId));
 const results=await db.batch([header,db.delete(m).where(and(eq(m.workspaceId,actor.workspaceId),eq(m.reportId,reportIdValue),sql`EXISTS (SELECT 1 FROM client_report_drafts WHERE ${written})`)),
 ...Object.entries(metrics).map(([metricKey,v])=>insertSelected(db,m,{workspaceId:actor.workspaceId,reportId:reportIdValue,metricKey,...v},r,written))]);
 if(results[0].length)return {ok:true,id:reportIdValue};
 if(!await reportClient(db,actor,clientId))return missing();
 return id===null?(await retry()||conflict()):conflict();
}

// One guarded header statement records lifecycle, retry identity and the release
// floor. Restore cannot make any pre-archive snapshot client-visible again.
export async function changeReportArchive(db,actor,clientId,id,input){
 if(!reportId(clientId)||!reportId(id)||!actor?.scope||!canEditReports(actor)||!exactKeys(input,['workspaceId','userId','requestId','expectedRevision','archived'])||input.workspaceId!==actor.workspaceId||input.userId!==actor.userId)return missing();
 if(!REQUEST_ID.test(input.requestId||'')||typeof input.archived!=='boolean'||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)return {ok:false,reason:'invalid',error:'Invalid archive action or saved revision.'};
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actor.userId,clientId,id,input.expectedRevision,input.archived])));
 const intentHash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const read=async()=> (await db.select({id:r.id,revision:r.revision,archivedAt:r.archivedAt,requestId:r.archiveRequestId,intentHash:r.archiveIntentHash}).from(r).where(and(reportCondition(actor,clientId,id),reportClientCondition(actor,r.clientId,{edit:true}))).limit(1))[0];
 const retry=row=>row?.requestId===input.requestId?row.intentHash===intentHash?{ok:true,id,revision:row.revision}:conflict():null;
 const old=await read();if(!old)return missing();const repeated=retry(old);if(repeated)return repeated;
 if(old.revision!==input.expectedRevision)return conflict();
 if(!!old.archivedAt===input.archived)return {ok:true,id,revision:old.revision,unchanged:true};
 const now=new Date().toISOString();
 const rows=await db.update(r).set({archivedAt:input.archived?now:null,
  ...(input.archived?{publicationFloor:sql`coalesce((SELECT max(cp.sequence) FROM client_report_publications cp WHERE cp.workspace_id=${r.workspaceId} AND cp.report_id=${r.id}),0)`}:{}),
  revision:input.expectedRevision+1,archiveRequestId:input.requestId,archiveIntentHash:intentHash,mutationId:crypto.randomUUID(),updaterMembershipId:actor.membershipId,updaterUserId:actor.userId,updatedAt:now})
 .where(and(reportCondition(actor,clientId,id),reportClientCondition(actor,r.clientId,{edit:true}),eq(r.revision,input.expectedRevision),input.archived?sql`${r.archivedAt} IS NULL`:sql`${r.archivedAt} IS NOT NULL`)).returning({id:r.id,revision:r.revision});
 if(rows.length)return {ok:true,...rows[0]};const current=await read();return current?(retry(current)||conflict()):missing();
}
