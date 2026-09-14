import {and,asc,eq,inArray,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition} from './workspaces.mjs';
import {classifyProspectEligibility} from './prospect-eligibility.mjs';
const w=schema.workspaces,m=schema.workspaceMemberships;
const allowed=actor=>actor&&evaluate(actor,{action:'prospecting.view'}).allowed;
function sourceQuery(db,actor,id){
 return db.select({id:w.id,name:w.name,slug:w.slug}).from(w).innerJoin(m,eq(m.workspaceId,w.id)).where(and(
  administratorCondition(actor,{purpose:'prospecting'}),eq(w.purpose,'operations'),eq(w.status,'active'),eq(m.userId,actor.userId),eq(m.status,'active'),inArray(m.role,['owner','admin']),id?eq(w.id,id):undefined));
}
export async function listProspectSources(db,actor){
 if(!allowed(actor))return null;
 const rows=await sourceQuery(db,actor).orderBy(asc(w.name),asc(w.id)).limit(101);
 return {rows:rows.slice(0,100).map(({id,name})=>({id,name})),more:rows.length>100};
}
export function sourcePreviewInput(input={}){
 if(Object.keys(input).some(k=>!['source','after'].includes(k)))return null;
 const source=input.source||'',after=String(input.after||'0');
 return typeof source==='string'&&source.length<=128&&/^\d{1,16}$/.test(after)&&Number.isSafeInteger(Number(after))?{source,after:Number(after)}:null;
}
// These identifiers are a fixed inventory of inherited source evidence, never
// request input. Keep payloads out of the DTO: only existence/presence is read.
const contactText=['last_contact_date','last_contact_at','reply_date','reply_at','reply_type','replied_at_email','video_sent_at','video_sent_email','playbook_sent_email','first_client_at','offer_accepted_at','offer_accepted_step','next_action_date','deferred_until','deferral_reason','deferral_promise','deferral_context','deferral_source'];
const workText=['rating','email_sequence','audit_notes','claude_chat_link','pdf_filename','review_url','video_url','video_tier','video_score','video_reasons','own_findings','site_intel','site_intel_at','site_intel_source','signals','pending_draft','pending_draft_at','pending_draft_meta','pending_draft_dismissed_at','must_haves','revenue_score','qualification','contact_searched_at','contact_search_result','contact_search_pages','contact_refresh_after','primary_contact_reason','verification_state_at','band_at'];
const stateText=['contact_state','contact_state_at','contact_state_reason','verification_state','verification_reason','priority_band','gmail_labels'];
const column=name=>sql`p.${sql.identifier(name)}`;
const presence=names=>sql.join(names.map(name=>sql`length(trim(coalesce(cast(${column(name)} AS TEXT),'')))>0`),sql` OR `);
const positive=names=>sql.join(names.map(name=>sql`(typeof(${column(name)}) IN ('integer','real') AND ${column(name)}>0)`),sql` OR `);
const malformed=names=>sql.join(names.map(name=>sql`(${column(name)} IS NOT NULL AND (typeof(${column(name)}) NOT IN ('integer','real') OR ${column(name)}<0 OR ${column(name)}!=cast(${column(name)} AS INTEGER)))`),sql` OR `);
const evidence=tables=>sql.join(tables.map(table=>sql`EXISTS(SELECT 1 FROM ${sql.identifier(table)} e WHERE e.workspace=p.workspace AND e.prospect_id=p.id)`),sql` OR `);
// Both page reads and exports use this exact evidence query. Callers validate
// bounded cursors/selections before reaching it; all authority remains live SQL.
function sourceRowsSql(db,actor,source,filters){return sql`SELECT p.id,substr(p.business_name,1,181) business_name,substr(p.name,1,121) name,substr(p.email,1,255) email,
   substr(p.domain,1,2049) domain,substr(p.niche,1,181) niche,substr(p.country,1,181) country,substr(p.source,1,181) source,substr(p.stage,1,120) stage,
   (length(p.business_name)>180 OR length(p.name)>120 OR length(p.email)>254 OR length(p.domain)>2048 OR length(p.niche)>180 OR length(p.country)>180 OR length(p.source)>180) AS raw_invalid,
   p.deleted_at IS NOT NULL AS deleted,
   (${presence(contactText)} OR ${positive(['emails_sent','replied','legacy_message_count','do_not_contact','unsubscribed','call_booked','proposal_sent'])}
    OR ${evidence(['send_events','reply_events','legacy_messages','gmail_messages','relationship_events','outcome_events','send_attempts','clients'])}) AS contact,
   (${presence(workText)} OR ${positive(['pending_draft_stale','band_was_provisional'])}
    OR ${evidence(['outreach_packages','qualification_snapshots','jobs','contact_candidates','visual_artifacts','scanner_run_items','credit_events','send_shadow_log'])} OR EXISTS(SELECT 1 FROM leads e WHERE e.workspace=p.workspace AND e.promoted_prospect_id=p.id)) AS work,
   (${presence(stateText)}) AS state,
   (${presence(['info','activity_log'])} OR ${malformed(['emails_sent','replied','legacy_message_count','do_not_contact','unsubscribed','call_booked','proposal_sent','pending_draft_stale','band_was_provisional'])}) AS unclear,
   (p.created_at IS NULL OR p.updated_at IS NULL OR julianday(p.created_at) IS NULL OR julianday(p.updated_at) IS NULL OR julianday(p.updated_at)!=julianday(p.created_at)) AS changed,
   EXISTS(SELECT 1 FROM prospects d WHERE d.workspace=p.workspace AND d.id!=p.id AND length(trim(coalesce(p.email,'')))>0 AND lower(trim(d.email))=lower(trim(p.email))) AS duplicate,
   EXISTS(SELECT 1 FROM unmatched_replies r WHERE r.workspace=p.workspace AND (r.resolved_prospect_id=p.id OR (length(trim(coalesce(p.email,'')))>0 AND lower(trim(r.from_address))=lower(trim(p.email))))) AS unmatched
   FROM prospects p WHERE p.workspace=${source.slug} AND ${filters.ids?sql`p.id IN (${sql.join(filters.ids.map(id=>sql`${id}`),sql`,`)})`:sql`p.id>${filters.after}`} AND EXISTS ${sourceQuery(db,actor,source.id)}
   ORDER BY p.id ASC LIMIT 51`;}
async function readProspectSource(db,actor,filters){
 const [source]=await sourceQuery(db,actor,filters.source).limit(1);if(!source)return null;
 let rows;
 try{
  rows=await db.all(sourceRowsSql(db,actor,source,filters));
 }catch{
  // Missing/incomplete evidence tables and read failures are uncertainty, never
  // an empty history. No source row contents or database diagnostics escape.
  return (await sourceQuery(db,actor,source.id).limit(1)).length?{unavailable:true}:null;
 }
 if(!(await sourceQuery(db,actor,source.id).limit(1)).length)return null;
 return {source,rows};
}
export async function previewProspectSource(db,actor,input={},now=new Date()){
 if(!allowed(actor))return null;
 const filters=sourcePreviewInput(input);if(!filters)return {invalid:true};
 if(!filters.source)return {selectionRequired:true};
 const read=await readProspectSource(db,actor,filters);if(!read||read.unavailable)return read;
 const {source,rows}=read;
 const result=rows.slice(0,50).map(row=>({id:row.id,businessName:row.business_name,personName:row.name,website:row.domain,publicEmail:row.email,niche:row.niche,country:row.country,source:row.source,...classifyProspectEligibility(row)}));
 const counts={ready:0,worked:0,review:0};for(const row of result)counts[row.status]++;
 return {source:{id:source.id,name:source.name},asOf:now.toISOString(),rows:result,counts,more:rows.length>50,after:filters.after,nextAfter:rows.length>50?result.at(-1).id:null};
}

export function sourceExportInput(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['source','ids'].includes(k)))return null;
 if(typeof input.source!=='string'||!input.source.trim()||input.source.length>128||!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>50)return null;
 if(input.ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(input.ids).size!==input.ids.length)return null;
 return {source:input.source,ids:[...input.ids].sort((a,b)=>a-b)};
}
export async function canReadProspectSource(db,actor,id){
 return !!(allowed(actor)&&(await sourceQuery(db,actor,id).limit(1)).length);
}
export async function reviewProspectSourceSelection(db,actor,input){
 if(!allowed(actor))return null;
 const filters=sourceExportInput(input);if(!filters)return {invalid:true};
 const read=await readProspectSource(db,actor,filters);if(!read||read.unavailable)return read;
 return {source:{id:read.source.id},rows:read.rows.map(row=>({id:row.id,...classifyProspectEligibility(row),fields:{businessName:row.business_name,personName:row.name,website:row.domain,publicEmail:row.email,niche:row.niche,country:row.country,source:row.source}}))};
}
export async function exportProspectSource(db,actor,input,now=new Date()){
 if(!allowed(actor))return null;
 const filters=sourceExportInput(input);if(!filters)return {invalid:true};
 const read=await reviewProspectSourceSelection(db,actor,filters);if(!read||read.unavailable)return read;
 const byId=new Map(read.rows.map(row=>[row.id,row])),rejections=[];
 for(const id of filters.ids){
  const row=byId.get(id),eligibility=row||null;
  if(!eligibility||eligibility.status!=='ready')rejections.push({id,reasons:eligibility?.reasons||['unavailable']});
 }
 const counts={selected:filters.ids.length,eligible:filters.ids.length-rejections.length,blocked:rejections.length,exported:0};
 // All-or-nothing: never silently drop a selected record or export stale browser
 // fields. A file is a dated raw-data snapshot, not a receipt or permission grant.
 if(rejections.length)return {conflict:true,counts,rejections};
 return {format:'bloomops.raw-prospects',version:1,exportedAt:now.toISOString(),counts:{...counts,exported:counts.selected},records:read.rows.map(row=>({
  provenance:{sourceWorkspaceId:read.source.id,sourceRecordId:row.id},
  fields:row.fields,
 }))};
}

// Reusable write-time predicates over the same source evidence as preview.
// Exact raw field equality ties SQL authorization/eligibility to validated values.
export async function sourceImportGuards(db,actor,input){
 const filters=sourceExportInput(input);if(!filters)return null;
 const read=await readProspectSource(db,actor,filters);if(!read||read.unavailable)return read;
 return read.rows.map(row=>({id:row.id,...classifyProspectEligibility(row),fields:{businessName:row.business_name,personName:row.name,website:row.domain,publicEmail:row.email,niche:row.niche,country:row.country,source:row.source},
  condition:sql`EXISTS(SELECT 1 FROM (${sourceRowsSql(db,actor,read.source,{ids:[row.id]})}) fresh WHERE lower(trim(coalesce(fresh.stage,'')))='new'
   AND ${sql.join(['deleted','contact','work','state','unclear','changed','duplicate','unmatched','raw_invalid'].map(key=>sql`coalesce(fresh.${sql.identifier(key)},0)=0`),sql` AND `)}
   AND ${sql.join(['business_name','name','email','domain','niche','country','source'].map(key=>sql`fresh.${sql.identifier(key)} IS ${row[key]}`),sql` AND `)})`}));
}
