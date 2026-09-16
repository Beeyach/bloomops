import {and,eq,desc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {liveProjectActor} from './project-access.mjs';
import {insertSelected,REQUEST_ID} from './workspaces.mjs';
import {getClientReport,reportClientCondition,canEditReports} from './client-reports.mjs';
import {reportTemplate,reportId,exactKeys,CLIENT_NARRATIVE_FIELDS} from './client-report-values.mjs';
const p=schema.clientReportPublications,r=schema.clientReportDrafts;
const absent=()=>({ok:false,reason:'not_found'});
const conflict=()=>({ok:false,reason:'conflict',error:'The saved draft or published version changed. Reload the publication review before continuing.'});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const latestCondition=()=>sql`NOT EXISTS (SELECT 1 FROM client_report_publications newer WHERE newer.workspace_id=${p.workspaceId} AND newer.report_id=${p.reportId} AND newer.sequence>${p.sequence})`;
const recipientCondition=()=>sql`EXISTS (SELECT 1 FROM client_contacts cc JOIN workspace_memberships cm ON cm.workspace_id=cc.workspace_id AND cm.user_id=cc.user_id AND cm.role='client' AND cm.status='active' WHERE cc.workspace_id=${r.workspaceId} AND cc.client_id=${r.clientId})`;
export function publishedReportCondition(actor,{portal=false}={}){
 if(portal){
  if(!actor?.scope||actor.preview||actor.role!=='client')return sql`0`;
  return and(eq(r.workspaceId,actor.workspaceId),sql`${r.archivedAt} IS NULL`,sql`${p.sequence}>${r.publicationFloor}`,liveProjectActor(actor),sql`EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.workspace_id=${r.workspaceId} AND cc.client_id=${r.clientId} AND cc.user_id=${actor.userId})`);
 }
 return and(eq(r.workspaceId,actor?.workspaceId||''),reportClientCondition(actor,r.clientId));
}
const joinReport=()=>and(eq(p.workspaceId,r.workspaceId),eq(p.reportId,r.id));
const publicEntry=row=>({id:row.id,reportId:row.reportId,version:row.sequence,publishedAt:row.createdAt,snapshotHash:row.snapshotHash,snapshot:JSON.parse(row.snapshotJson)});
// Explicit allowlist: internal commentary, source notes/URLs, import IDs and
// actor identities are never serialized into a client-visible snapshot.
export function reportPublicationSnapshot(report){
 const template=reportTemplate(report.templateId,report.templateVersion);
 return {formatVersion:1,title:report.title,clientName:report.clientName,serviceName:report.serviceName,packageName:report.packageName,
  templateId:template.id,templateVersion:template.version,templateLabel:template.label,
  periodStart:report.periodStart,periodEnd:report.periodEnd,timezone:report.timezone,channel:report.channel,accountLabel:report.accountLabel,scopeLabel:report.scopeLabel,
  ...Object.fromEntries(CLIENT_NARRATIVE_FIELDS.map(key=>[key,report[key]||''])),
  metrics:template.metrics.map(m=>({key:m.key,label:m.label,definition:m.definition,unit:m.unit,state:report.metrics[m.key].state,value:report.metrics[m.key].value,origin:report.metrics[m.key].sourceKind==='csv'?'Reviewed CSV — unverified':'Manually entered — unverified'})),
  calculations:report.calculations.map(c=>({key:c.key,label:c.label,definition:c.definition,display:c.display})),
  verification:'Values are entered or reviewed from CSV and remain unverified. Calculations use those unverified inputs.'};
}
export async function reportPublicationReview(db,actor,clientId,id){
 const report=await getClientReport(db,actor,clientId,id);if(!report)return null;
 const [current]=await db.select({id:p.id,sequence:p.sequence,kind:p.kind,draftRevision:p.draftRevision,createdAt:p.createdAt}).from(p).innerJoin(r,joinReport()).where(and(eq(r.id,id),eq(r.clientId,clientId),publishedReportCondition(actor),latestCondition())).limit(1);
 const [eligible]=await db.select({id:r.id}).from(r).where(and(eq(r.id,id),publishedReportCondition(actor),recipientCondition())).limit(1);
 return {snapshot:reportPublicationSnapshot(report),draftRevision:report.revision,current:current||null,archived:!!report.archivedAt,hiddenByArchive:!!current&&current.sequence<=report.publicationFloor,canEdit:report.canEdit,hasPortalRecipient:!!eligible};
}
export async function changeReportPublication(db,actor,clientId,id,input){
 if(!reportId(clientId)||!reportId(id)||!actor?.scope||!canEditReports(actor)||!exactKeys(input,['workspaceId','userId','requestId','expectedRevision','expectedSequence','kind','acknowledgeUnverified'])||input.workspaceId!==actor.workspaceId||input.userId!==actor.userId)return absent();
 if(!REQUEST_ID.test(input.requestId||'')||!['publish','withdraw'].includes(input.kind)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1||!Number.isSafeInteger(input.expectedSequence)||input.expectedSequence<0||input.kind==='publish'&&input.acknowledgeUnverified!==true)return {ok:false,reason:'invalid',error:'Review the saved version and explicitly acknowledge unverified inputs before publishing.'};
 const intentHash=await digest(JSON.stringify([clientId,id,input.kind,input.expectedRevision,input.expectedSequence,input.acknowledgeUnverified===true]));
 const retry=async()=>{const [found]=await db.select({id:p.id,intentHash:p.intentHash}).from(p).innerJoin(r,joinReport()).where(and(eq(p.requestId,input.requestId),eq(p.actorUserId,actor.userId),eq(r.id,id),eq(r.clientId,clientId),publishedReportCondition(actor),reportClientCondition(actor,r.clientId,{edit:true}))).limit(1);return found?(found.intentHash===intentHash?{ok:true,id:found.id}:conflict()):null;};
 const old=await retry();if(old)return old;
 const report=await getClientReport(db,actor,clientId,id);if(!report)return absent();if(report.archivedAt)return {ok:false,reason:'invalid',error:'Restore this archived report before changing publication.'};
 const [current]=await db.select().from(p).where(and(eq(p.workspaceId,actor.workspaceId),eq(p.reportId,id))).orderBy(desc(p.sequence)).limit(1);
 if(report.revision!==input.expectedRevision||(current?.sequence||0)!==input.expectedSequence)return conflict();
 if(input.kind==='withdraw'&&current?.kind!=='publish')return {ok:true,id:current?.id||null,unchanged:true};
 if(input.kind==='publish'&&(!report.accountLabel||!report.scopeLabel||!report.clientSummary))return {ok:false,reason:'invalid',error:'Save an account, scope and client summary before publication. Unknown metrics may remain missing.'};
 if(input.kind==='publish'&&current?.kind==='publish'&&current.draftRevision===report.revision&&current.sequence>report.publicationFloor)return {ok:true,id:current.id,unchanged:true};
 const snapshotJson=input.kind==='publish'?JSON.stringify(reportPublicationSnapshot(report)):null;
 const snapshotHash=snapshotJson?await digest(snapshotJson):null,newId=crypto.randomUUID();
 const condition=and(eq(r.id,id),eq(r.clientId,clientId),publishedReportCondition(actor),reportClientCondition(actor,r.clientId,{edit:true}),eq(r.revision,input.expectedRevision),sql`${r.archivedAt} IS NULL`,
  sql`coalesce((SELECT max(cp.sequence) FROM client_report_publications cp WHERE cp.workspace_id=${r.workspaceId} AND cp.report_id=${r.id}),0)=${input.expectedSequence}`,
  input.kind==='publish'?recipientCondition():sql`1`);
 const rows=await insertSelected(db,p,{id:newId,workspaceId:actor.workspaceId,reportId:id,sequence:input.expectedSequence+1,kind:input.kind,draftRevision:report.revision,snapshotJson,snapshotHash,actorMembershipId:actor.membershipId,actorUserId:actor.userId,requestId:input.requestId,intentHash,createdAt:new Date().toISOString()},r,condition).onConflictDoNothing().returning({id:p.id});
 if(rows.length)return {ok:true,id:newId};
 const retried=await retry();if(retried)return retried;
 const review=await reportPublicationReview(db,actor,clientId,id);if(!review)return absent();
 return input.kind==='publish'&&!review.hasPortalRecipient?{ok:false,reason:'invalid',error:'Complete Client activation and portal invitation acceptance before publishing.'}:conflict();
}
export async function getPublishedReport(db,actor,id,{portal=false}={}){
 if(!reportId(id))return null;
 const [row]=await db.select({entry:p}).from(p).innerJoin(r,joinReport()).where(and(eq(p.id,id),eq(p.kind,'publish'),publishedReportCondition(actor,{portal}),portal?latestCondition():sql`1`)).limit(1);
 return row?publicEntry(row.entry):null;
}
export async function listPublishedReports(db,actor,{portal=false,clientId=null,reportId:id=null,page=1}={}){
 if(!Number.isSafeInteger(page)||page<1||page>10000||clientId&&!reportId(clientId)||id&&!reportId(id))return null;
 const rows=await db.select({entry:p}).from(p).innerJoin(r,joinReport()).where(and(publishedReportCondition(actor,{portal}),clientId?eq(r.clientId,clientId):sql`1`,id?eq(r.id,id):sql`1`,portal?and(eq(p.kind,'publish'),latestCondition()):sql`1`)).orderBy(desc(p.createdAt),desc(p.id)).limit(21).offset((page-1)*20);
 return {items:rows.slice(0,20).map(({entry})=>entry.kind==='publish'?{...publicEntry(entry),kind:'publish'}:{id:entry.id,reportId:entry.reportId,version:entry.sequence,kind:'withdraw',createdAt:entry.createdAt}),more:rows.length>20,page};
}
export async function hasPublishedReports(db,actor){return (await db.select({id:p.id}).from(p).innerJoin(r,joinReport()).where(and(publishedReportCondition(actor,{portal:true}),eq(p.kind,'publish'),latestCondition())).limit(1)).length>0;}
