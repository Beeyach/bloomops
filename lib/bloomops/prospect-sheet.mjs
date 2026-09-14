import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {prospectCondition} from './prospects.mjs';
import {evaluate} from './authorization.mjs';
import {recipientUnrestricted} from './prospect-recipient-protection.mjs';
import {sheetQuery} from './prospect-sheet-values.mjs';
const p=schema.prospects;
const imported=sql`(SELECT min(imported_at) FROM (SELECT ir.created_at imported_at FROM prospect_import_rows rr JOIN prospect_import_receipts ir ON ir.workspace_id=rr.workspace_id AND ir.id=rr.receipt_id WHERE rr.workspace_id=${p.workspaceId} AND rr.prospect_id=${p.id} AND ir.sealed=1 UNION ALL SELECT cb.created_at FROM prospect_csv_rows cr JOIN prospect_csv_batches cb ON cb.workspace_id=cr.workspace_id AND cb.id=cr.batch_id WHERE cr.workspace_id=${p.workspaceId} AND cr.prospect_id=${p.id}))`;
const contact=sql`(SELECT max(at) FROM (SELECT accepted_at at FROM prospect_deliveries d WHERE d.workspace_id=${p.workspaceId} AND d.prospect_id=${p.id} AND d.state='accepted' UNION ALL SELECT e.occurred_at FROM activity_events e WHERE e.workspace_id=${p.workspaceId} AND e.subject_type='prospect' AND e.subject_id=${p.id} AND e.event_type='PROSPECT_MANUAL_CONTACT'))`;
const interest=sql`EXISTS(SELECT 1 FROM activity_events e WHERE e.workspace_id=${p.workspaceId} AND e.subject_type='prospect' AND e.subject_id=${p.id} AND e.event_type='PROSPECT_INTEREST_RECORDED')`;
const needsReply=sql`EXISTS(SELECT 1 FROM prospect_reply_observations r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND r.kind='reply_unreviewed' AND r.match='reply_chain' AND r.received_at>coalesce((SELECT max(e.occurred_at) FROM activity_events e WHERE e.workspace_id=${p.workspaceId} AND e.subject_type='prospect' AND e.subject_id=${p.id} AND e.event_type='PROSPECT_REPLY_RESOLVED'),'') )`;
const converted=sql`EXISTS(SELECT 1 FROM prospect_conversions c WHERE c.workspace_id=${p.workspaceId} AND c.prospect_id=${p.id})`;
const won=sql`EXISTS(SELECT 1 FROM prospect_conversions c JOIN bloomops_clients cl ON cl.workspace_id=c.workspace_id AND cl.id=c.client_id WHERE c.workspace_id=${p.workspaceId} AND c.prospect_id=${p.id} AND (cl.relationship_status IN ('active','onboarding') OR EXISTS(SELECT 1 FROM client_activations ca WHERE ca.workspace_id=c.workspace_id AND ca.client_id=c.client_id)))`;
const closed=sql`EXISTS(SELECT 1 FROM prospect_reply_states r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND r.hold_state='stopped')`;
const lastReply=sql`(SELECT max(r.received_at) FROM prospect_reply_observations r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND r.kind='reply_unreviewed' AND r.match='reply_chain')`;
const lastResolved=sql`(SELECT max(e.occurred_at) FROM activity_events e WHERE e.workspace_id=${p.workspaceId} AND e.subject_type='prospect' AND e.subject_id=${p.id} AND e.event_type='PROSPECT_REPLY_RESOLVED')`;
const reply=sql`EXISTS(SELECT 1 FROM prospect_reply_observations r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND r.kind='reply_unreviewed' AND r.match='reply_chain')`;
const audit=sql`EXISTS(SELECT 1 FROM prospect_skill_results r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND r.skill_id='audit')`;
const checked=sql`EXISTS(SELECT 1 FROM prospect_field_sources f WHERE f.workspace_id=${p.workspaceId} AND f.prospect_id=${p.id} AND f.field_key='fit' AND f.verification='checked')`;
const clear=sql`NOT EXISTS(SELECT 1 FROM prospect_reply_states r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND (r.hold_state!='clear' OR r.check_status IN ('checking','unresolved')))`;
const stage=sql`CASE WHEN ${won} THEN 'Won' WHEN ${closed} THEN 'Closed' WHEN ${interest} THEN 'Interested' WHEN ${reply} THEN 'Replied' WHEN ${contact} IS NOT NULL THEN 'Contacted' ELSE 'Not contacted' END`;
const columns={id:p.id,revision:p.revision,businessName:p.businessName,website:p.website,platform:p.platform,personName:p.personName,fit:p.fit,publicEmail:p.publicEmail,location:p.location,timeZone:p.timeZone,proposedWork:p.proposedWork,evidenceDate:p.evidenceDate,createdAt:p.createdAt,importedAt:imported,lastContacted:contact,outreach:stage,
 closedReason:sql`(SELECT stop_note FROM prospect_reply_states r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} AND r.hold_state='stopped')`,
 nextAction:sql`CASE WHEN ${won} THEN 'Open client' WHEN ${converted} THEN 'Finish client setup' WHEN ${closed} THEN 'Closed' WHEN ${reply} THEN 'Read reply' WHEN ${contact} IS NOT NULL THEN 'Review conversation' WHEN NOT ${audit} AND ${p.evidenceDate} IS NULL THEN 'Audit website' WHEN ${p.publicEmail} IS NULL THEN 'Find contact' WHEN ${p.fit}='strong' THEN 'Review draft' ELSE 'Review audit' END`,
 source:sql`coalesce((SELECT cb.file_name FROM prospect_csv_rows cr JOIN prospect_csv_batches cb ON cb.id=cr.batch_id AND cb.workspace_id=cr.workspace_id WHERE cr.workspace_id=${p.workspaceId} AND cr.prospect_id=${p.id} LIMIT 1),(SELECT r.source_label FROM prospect_import_rows r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} LIMIT 1),'Manual')`,
 importBatch:sql`coalesce((SELECT batch_id FROM prospect_csv_rows r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} LIMIT 1),(SELECT receipt_id FROM prospect_import_rows r WHERE r.workspace_id=${p.workspaceId} AND r.prospect_id=${p.id} LIMIT 1))`};
export function sheetScope(actor,input={}){const q=sheetQuery(input);if(!q)return null;
 const like=(col,value)=>sql`${col} LIKE ${'%'+value.replace(/[!%_]/g,c=>'!'+c)+'%'} ESCAPE '!'`;
 const views={all:undefined,audit:sql`NOT ${audit} AND ${p.evidenceDate} IS NULL`,ready:and(eq(p.fit,'strong'),checked,sql`${p.publicEmail} IS NOT NULL AND ${contact} IS NULL AND NOT ${converted}`,clear,recipientUnrestricted(actor.workspaceId,p.publicEmail,p.id)),waiting:sql`${contact} IS NOT NULL AND ${contact}>coalesce(${lastReply},'') AND ${contact}>coalesce(${lastResolved},'') AND NOT ${closed} AND NOT ${converted} AND ${clear}`,reply:sql`${needsReply} AND NOT ${closed} AND NOT ${converted}`,closed};
 const where=and(prospectCondition(actor),views[q.view],q.q?sql`(${like(p.businessName,q.q)} OR ${like(p.personName,q.q)} OR ${like(p.website,q.q)} OR ${like(p.publicEmail,q.q)})`:undefined,q.fit?eq(p.fit,q.fit):undefined,q.region?like(p.location,q.region):undefined,q.platform?like(p.platform,q.platform):undefined,q.batch?sql`${columns.importBatch}=${q.batch}`:undefined,q.never?sql`${contact} IS NULL`:undefined);
 const order={createdAt:p.createdAt,importedAt:imported,lastContacted:contact,evidenceDate:p.evidenceDate}[q.sort];
 return {query:q,where,order};}
export async function listProspectSheet(db,actor,input={}){
 if(!actor||!evaluate(actor,{action:'prospecting.view'}).allowed)return null;
 const scope=sheetScope(actor,input);if(!scope)return {invalid:true,error:'Choose supported sheet filters.'};const {query:q,where,order}=scope;
 // Same predicate for counts and bounded rows; one D1 read transaction.
 const queries=[db.select({total:sql`count(*)`}).from(p).where(where),db.select(columns).from(p).innerJoin(schema.workspaces,eq(schema.workspaces.id,p.workspaceId)).where(where).orderBy(sql`${order} IS NULL`,sql`${order} ${sql.raw(q.direction)}`,sql`${p.id} ${sql.raw(q.direction)}`).limit(q.size).offset((q.page-1)*q.size)];
 const [counts,rows]=await db.batch(queries);return {query:q,total:Number(counts[0].total),rows};
}

export async function getProspectSheetFacts(db,actor,id){if(!actor||!evaluate(actor,{action:'prospecting.view'}).allowed)return null;const [row]=await db.select(columns).from(p).innerJoin(schema.workspaces,eq(schema.workspaces.id,p.workspaceId)).where(and(prospectCondition(actor),eq(p.id,id))).limit(1);return row||null;}
