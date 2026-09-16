import {and,eq,desc,sql,exists} from 'drizzle-orm';
import {alias} from 'drizzle-orm/sqlite-core';
import {schema} from './db.mjs';
import {reportClientCondition} from './client-reports.mjs';
import {comparableReportSnapshot,reportComparison} from './client-report-comparison-values.mjs';
const r=alias(schema.clientReportDrafts,'comparison_report'),p=alias(schema.clientReportPublications,'comparison_publication');
const field=key=>sql`json_extract(${p.snapshotJson}, ${'$.'+key})`;
// SQL filters authority/context/period before paging. Snapshot fields, not the
// mutable source draft, describe what was actually published.
export function comparisonQuery(db,actor,report,id=null){
 const start=field('periodStart'),end=field('periodEnd');
 return db.select({id:p.id,sequence:p.sequence,snapshotHash:p.snapshotHash,snapshotJson:p.snapshotJson}).from(p).innerJoin(r,and(eq(p.workspaceId,r.workspaceId),eq(p.reportId,r.id))).where(and(
  eq(r.workspaceId,actor.workspaceId),eq(r.clientId,report.clientId),eq(r.serviceEngagementId,report.serviceEngagementId),reportClientCondition(actor,r.clientId),
  sql`${r.id}<>${report.id||''}`,sql`${r.archivedAt} IS NULL`,eq(p.kind,'publish'),sql`${p.sequence}>${r.publicationFloor}`,
  sql`NOT EXISTS (SELECT 1 FROM client_report_publications newer WHERE newer.workspace_id=${p.workspaceId} AND newer.report_id=${p.reportId} AND newer.sequence>${p.sequence})`,
  ...['templateId','templateVersion','channel','accountLabel','scopeLabel','timezone'].map(key=>sql`${field(key)}=${report[key]}`),
  sql`${end}<${report.periodStart}`,
  sql`((substr(${report.periodStart},9,2)='01' AND date(${report.periodStart},'start of month','+1 month','-1 day')=${report.periodEnd} AND substr(${start},9,2)='01' AND date(${start},'start of month','+1 month','-1 day')=${end}) OR (julianday(${end})-julianday(${start})=julianday(${report.periodEnd})-julianday(${report.periodStart})))`,
  id?eq(p.id,id):sql`1`));
}
export const comparisonWriteGuard=(db,actor,report,id)=>id?exists(comparisonQuery(db,actor,report,id)):sql`1`;
export async function comparisonSource(db,actor,report,id){
 if(!id)return null;const [row]=await comparisonQuery(db,actor,report,id).limit(1);if(!row)return null;
 const snapshot=JSON.parse(row.snapshotJson);return comparableReportSnapshot(report,snapshot)?{...row,snapshot}:null;
}
export async function comparisonOptions(db,actor,report,page=1){
 if(!Number.isSafeInteger(page)||page<1||page>10000)return null;
 const rows=await comparisonQuery(db,actor,report).orderBy(desc(p.createdAt),desc(p.id)).limit(21).offset((page-1)*20);
 return {items:rows.slice(0,20).flatMap(row=>{const snapshot=JSON.parse(row.snapshotJson);return comparableReportSnapshot(report,snapshot)?[{id:row.id,version:row.sequence,title:snapshot.title,periodStart:snapshot.periodStart,periodEnd:snapshot.periodEnd}]:[];}),more:rows.length>20,page};
}
export async function savedReportComparison(db,actor,report,selectedPublication=undefined){
 const t=schema.clientReportComparisons,d=schema.clientReportDrafts;
 const selection=selectedPublication===undefined?(await db.select({id:t.publicationId}).from(t).innerJoin(d,and(eq(d.workspaceId,t.workspaceId),eq(d.id,t.reportId))).where(and(eq(d.id,report.id),eq(d.workspaceId,actor.workspaceId),eq(d.revision,report.revision),reportClientCondition(actor,d.clientId))).limit(1))[0]:selectedPublication?{id:selectedPublication}:null;
 if(!selection)return {comparisonPublicationId:null,comparison:null};
 const source=await comparisonSource(db,actor,report,selection.id);
 return {comparisonPublicationId:selection.id,comparison:source?reportComparison(report,source):null,comparisonUnavailable:!source};
}
