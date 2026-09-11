import { contentPlatformSelection, contentPlatformCondition } from './content-platform-read.mjs';
import { noRequestedApproval } from './content-approval-access.mjs';
import { REVIEW_FROZEN_FIELDS } from './content-approval-values.mjs';
import { normalizePlatforms, platformFilterKey, samePlatforms } from './content-platform-values.mjs';
import { and, asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { activityForMutation } from './activity.mjs';
import { newId, validateDate } from './clients.mjs';
import { contentAssignmentCondition, contentParentCondition, contentReadCondition, loadContentParentResource, loadContentResource } from './content-access.mjs';
import { liveProjectActor } from './project-access.mjs';
import { CONTENT_DETAIL_FIELDS, CONTENT_FLAG_DEFAULTS, CONTENT_PAGE_SIZE, CONTENT_QUERY_FIELDS, CONTENT_TEXT_LIMITS, CONTENT_TYPES, CONTENT_STAGES } from './content-values.mjs';

const c = schema.contentItems, a = schema.activityEvents;
const invalid = errors => ({ ok: false, reason: 'invalid', errors });
const missing = () => ({ ok: false, reason: 'not_found' });
const conflict = () => ({ ok: false, reason: 'conflict' });
const success = (contentId, unchanged = false) => ({ ok: true, contentId, ...(unchanged ? { unchanged: true } : {}) });
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const has = (x, k) => Object.prototype.hasOwnProperty.call(x, k);
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const ownerValid = (actor, ownerId) => ownerId == null ? sql`1` : sql`EXISTS (SELECT 1 FROM workspace_memberships om
  WHERE om.workspace_id=${actor.workspaceId} AND om.id=${ownerId} AND om.status='active' AND om.role IN ('owner','admin','project_manager','team_member'))`;
const fields = Object.fromEntries(['id','clientId','serviceEngagementId',...CONTENT_DETAIL_FIELDS,'stage','stageContext','publishedAt','revision','createdAt','updatedAt'].map(k => [k,c[k]]));
const contextFields = { clientName: schema.clients.name, serviceName: schema.serviceTypes.name, packageName: schema.serviceEngagements.packageName, ownerName: schema.user.name };
const joined = (db, selected) => db.select(selected).from(c)
  .innerJoin(schema.clients, and(eq(schema.clients.workspaceId,c.workspaceId),eq(schema.clients.id,c.clientId)))
  .leftJoin(schema.serviceEngagements, and(eq(schema.serviceEngagements.workspaceId,c.workspaceId),eq(schema.serviceEngagements.id,c.serviceEngagementId)))
  .leftJoin(schema.serviceTypes, and(eq(schema.serviceTypes.workspaceId,c.workspaceId),eq(schema.serviceTypes.id,schema.serviceEngagements.serviceTypeId)))
  .leftJoin(schema.workspaceMemberships,and(eq(schema.workspaceMemberships.workspaceId,c.workspaceId),eq(schema.workspaceMemberships.id,c.ownerMembershipId)))
  .leftJoin(schema.user,eq(schema.user.id,schema.workspaceMemberships.userId));

export async function getContent(db, actor, contentId) {
  const [row] = await joined(db,{...fields,...contextFields,platforms:contentPlatformSelection()}).where(and(contentReadCondition(actor),eq(c.id,String(contentId)))).limit(1);
  return row || null;
}

export function normalizeContent(input, current = null) {
  if (!object(input) || Object.keys(input).some(k=>!CONTENT_DETAIL_FIELDS.includes(k))) return invalid({form:'Only Content details can be changed here.'});
  const errors={},patch={};
  for (const [key,max] of Object.entries(CONTENT_TEXT_LIMITS)) if (!current || has(input,key)) {
    const value=input[key];
    if (value != null && typeof value !== 'string') { errors[key]='Enter text.'; continue; }
    const text=value?.normalize('NFC').replace(/\r\n?/g,'\n').trim() || null;
    const controls=['title','pillar'].includes(key) ? /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/ : /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/;
    if (key==='title' && !text) errors[key]='Enter a Content title.';
    else if (text && (text.length>max || controls.test(text) || !text.isWellFormed())) errors[key]=`Use ${max} characters or fewer, without control characters.`;
    else patch[key]=text;
  }
  if (!current || has(input,'type')) { if (!CONTENT_TYPES.includes(input.type)) errors.type='Choose a Content type.'; else patch.type=input.type; }
  for (const [key,fallback] of Object.entries(CONTENT_FLAG_DEFAULTS)) if (!current || has(input,key)) {
    const value=has(input,key)?input[key]:fallback;
    if (typeof value!=='boolean') errors[key]='Choose yes or no.'; else patch[key]=value;
  }
  if (!current || has(input,'visibility')) { const value=has(input,'visibility')?input.visibility:'internal'; if (!schema.VISIBILITIES.includes(value)) errors.visibility='Choose a visibility.'; else patch.visibility=value; }
  if (!current || has(input,'ownerMembershipId')) {
    const value=input.ownerMembershipId;
    if (value!=null && (typeof value!=='string' || value.length>100 || /[\x00-\x20\x7f]/.test(value))) errors.ownerMembershipId='Choose an owner from the list.';
    else patch.ownerMembershipId=value || null;
  }
  if (!current || has(input,'targetPublishDate')) {
    const v=input.targetPublishDate, checked=v==null || typeof v==='string' ? validateDate(v,'the target publish date') : {ok:false,message:'Choose a valid date.'};
    if (!checked.ok) errors.targetPublishDate=checked.message; else patch.targetPublishDate=checked.value;
  }
  return Object.keys(errors).length?invalid(errors):{ok:true,patch};
}

function event(actor,row,type,metadata,now) {
  return { workspaceId:actor.workspaceId,actorMembershipId:actor.membershipId,actorUserId:actor.userId,clientId:row.clientId,
    serviceEngagementId:row.serviceEngagementId,subjectType:'content',subjectId:row.id,eventType:type,
    metadata:{contentTitle:row.title,...metadata},occurredAt:now.toISOString() };
}

export async function createContent(db,{actor,clientId,serviceEngagementId=null,input,requestId,now=new Date()}) {
  const resource=await loadContentParentResource(db,actor,clientId,serviceEngagementId);
  if (!resource) return missing();
  const decision=evaluate(actor,{action:'content.create',resource});
  if (!decision.allowed) return {ok:false,reason:decision.outcome};
  if (!uuid(requestId)) return invalid({form:'Refresh the form before creating Content.'});
  requestId=requestId.toLowerCase();
  if (!object(input)) return invalid({form:'Enter Content details.'});
  const {platforms:rawPlatforms=[],...details}=input;
  const checkedPlatforms=normalizePlatforms(rawPlatforms);if(!checkedPlatforms.ok)return checkedPlatforms;
  const platforms=checkedPlatforms.platforms;
  const normalized=normalizeContent(details); if (!normalized.ok) return normalized;
  const {patch}=normalized;
  const retry=async()=>{
    const [row]=await db.select({id:c.id,metadata:a.metadataJson}).from(c).innerJoin(a,and(eq(a.workspaceId,c.workspaceId),eq(a.subjectId,c.id),eq(a.subjectType,'content'),eq(a.eventType,'CONTENT_CREATED')))
      .where(and(contentReadCondition(actor),eq(c.clientId,String(clientId)),eq(c.creationRequestId,requestId))).limit(1);
    if (!row) return null;
    const initial=JSON.parse(row.metadata);
    return initial.serviceEngagementId===serviceEngagementId && CONTENT_DETAIL_FIELDS.every(k=>initial.details[k]===patch[k]) && samePlatforms(initial.platforms||[],platforms)?success(row.id,true):conflict();
  };
  const previous=await retry(); if (previous) return previous;
  const [eligible]=await db.select({id:schema.clients.id}).from(schema.clients).where(and(eq(schema.clients.id,String(clientId)),contentParentCondition(actor,String(clientId),serviceEngagementId,patch.visibility),ownerValid(actor,patch.ownerMembershipId))).limit(1);
  if (!eligible) return invalid({form:'Choose an available parent, owner and visibility.'});
  const id=newId(),iso=now.toISOString(), values={id,workspaceId:actor.workspaceId,clientId:String(clientId),serviceEngagementId,creationRequestId:requestId,...patch,stage:'idea',stageContext:null,publishedAt:null,revision:1,createdAt:iso,updatedAt:iso};
  const selected=Object.fromEntries(Object.keys(getTableColumns(c)).map(k=>[k,sql`${typeof values[k]==='boolean'?Number(values[k]):values[k]}`.as(k)]));
  const results=await db.batch([
    db.insert(c).select(db.select(selected).from(schema.clients).where(and(eq(schema.clients.id,String(clientId)),contentParentCondition(actor,String(clientId),serviceEngagementId,patch.visibility),ownerValid(actor,patch.ownerMembershipId))))
      .onConflictDoNothing({target:[c.workspaceId,c.clientId,c.creationRequestId]}).returning({id:c.id}),
    ...platforms.map(platform=>db.insert(schema.contentPlatforms).select(db.select({workspaceId:sql`${actor.workspaceId}`.as('workspaceId'),contentId:sql`${id}`.as('contentId'),platformKey:sql`${platform.key}`.as('platformKey'),label:sql`${platform.label}`.as('label')}).from(c).where(eq(c.id,id)))),
    activityForMutation(db,c,eq(c.id,id),event(actor,values,'CONTENT_CREATED',{details:patch,serviceEngagementId,platforms},now)),
  ]);
  return results[0].length?success(id):(await retry())||conflict();
}

export async function updateContent(db,{actor,contentId,input,expectedRevision,now=new Date()}) {
  const resource=await loadContentResource(db,actor,contentId); if (!resource) return missing();
  const decision=evaluate(actor,{action:'content.manage',resource}); if (!decision.allowed) return {ok:false,reason:decision.outcome};
  const current=await getContent(db,actor,contentId); if (!current) return missing();
  if (!Number.isSafeInteger(expectedRevision)||expectedRevision<1) return invalid({form:'Refresh this Content before saving.'});
  const normalized=normalizeContent(input,current); if (!normalized.ok) return normalized;
  // C1 edits are strict CAS, including a stale request with identical values.
  if (current.revision!==expectedRevision) return conflict();
  const patch=Object.fromEntries(Object.entries(normalized.patch).filter(([k,v])=>current[k]!==v));
  if (!Object.keys(patch).length) return success(contentId,true);
  const ownerGuard=has(patch,'ownerMembershipId')?ownerValid(actor,patch.ownerMembershipId):sql`1`;
  const desired=contentParentCondition(actor,c.clientId,c.serviceEngagementId,patch.visibility||current.visibility);
  const reviewGuard=Object.keys(patch).some(k=>REVIEW_FROZEN_FIELDS.includes(k))?noRequestedApproval():sql`1`;
  const condition=and(contentReadCondition(actor),eq(c.id,String(contentId)),eq(c.revision,expectedRevision),desired,ownerGuard,reviewGuard);
  const [eligible]=await db.select({id:c.id}).from(c).where(condition).limit(1);
  if (!eligible) {
    // A transition can consume this revision between the detail read and this
    // eligibility query. Preserve strict CAS conflict semantics for that loser.
    const live=await getContent(db,actor,contentId);
    if (!live || live.revision!==expectedRevision) return conflict();
    if(Object.keys(patch).some(k=>REVIEW_FROZEN_FIELDS.includes(k))){
      const [editable]=await db.select({id:c.id}).from(c).where(and(contentReadCondition(actor),eq(c.id,String(contentId)),noRequestedApproval())).limit(1);
      if(!editable)return conflict();
    }
    return invalid({form:'Choose an available owner and visibility.'});
  }
  const results=await db.batch([
    activityForMutation(db,c,condition,event(actor,current,'CONTENT_DETAILS_UPDATED',{fields:Object.keys(patch)},now)),
    db.update(c).set({...patch,revision:sql`${c.revision}+1`,updatedAt:now.toISOString()}).where(condition).returning({id:c.id}),
  ]);
  return results[1].length?success(contentId):conflict();
}

export function contentFilters(query={}) {
  if (!object(query)||Object.keys(query).some(k=>!CONTENT_QUERY_FIELDS.includes(k))) return invalid({form:'Choose only the available filters.'});
  const filters={};
  for (const k of CONTENT_QUERY_FIELDS.filter(k=>k!=='page')) {
    if (query[k]!=null && (typeof query[k]!=='string'||query[k].length>(k==='platform'?120:100)||/[\x00-\x1f\x7f]/.test(query[k]))) return invalid({form:'Choose a valid filter.'});
    filters[k]=query[k]||null;
  }
  if (filters.type&&!CONTENT_TYPES.includes(filters.type)) return invalid({form:'Choose a Content type.'});
  if (filters.platform) {const platform=platformFilterKey(filters.platform);if(!platform)return invalid({form:'Choose a valid platform.'});filters.platform=platform;}
  if (filters.stage&&!CONTENT_STAGES.includes(filters.stage)) return invalid({form:'Choose a Content stage.'});
  const page=query.page??'1';
  if (typeof page!=='string'||!/^\d{1,7}$/.test(page)||Number(page)<1) return invalid({form:'Choose a valid page.'});
  return {ok:true,filters:{...filters,page:Number(page)}};
}

export async function listContent(db,actor,query={}) {
  if (!evaluate(actor,{action:'content.list'}).allowed) return {ok:false,reason:'forbidden'};
  const parsed=contentFilters(query); if (!parsed.ok) return parsed;
  const f=parsed.filters;
  const where=[contentReadCondition(actor)];
  for (const k of CONTENT_QUERY_FIELDS.filter(k=>!['page','platform'].includes(k))) if(f[k])where.push(eq(c[k],f[k]));
  if(f.platform)where.push(contentPlatformCondition(f.platform));
  const selected={platforms:contentPlatformSelection(),id:c.id,title:c.title,type:c.type,pillar:c.pillar,stage:c.stage,targetPublishDate:c.targetPublishDate,visibility:c.visibility,clientId:c.clientId,serviceEngagementId:c.serviceEngagementId,ownerMembershipId:c.ownerMembershipId,...contextFields};
  const rows=await joined(db,selected).where(and(...where)).orderBy(desc(c.createdAt),desc(c.id)).limit(CONTENT_PAGE_SIZE+1).offset((f.page-1)*CONTENT_PAGE_SIZE);
  return {ok:true,items:rows.slice(0,CONTENT_PAGE_SIZE),hasMore:rows.length>CONTENT_PAGE_SIZE,page:f.page};
}

// Bounded parent choices include service-only Team context without granting
// Client detail access. Search lets old/large workspaces reach later choices.
export async function contentOptions(db,actor,{query=''}={}) {
  if (!evaluate(actor,{action:'content.list'}).allowed) return null;
  if (typeof query!=='string'||query.length>120) return null;
  const cl=schema.clients,se=schema.serviceEngagements,st=schema.serviceTypes;
  const search=query.trim().toLowerCase(), match=sql`instr(lower(${cl.name}),${search})>0`;
  const clientChoices=db.select({clientId:cl.id,clientName:cl.name,canRestrict:contentAssignmentCondition(actor,cl.id,null)}).from(cl)
      .where(and(contentParentCondition(actor,cl.id,null),match)).orderBy(asc(cl.name),asc(cl.id)).limit(CONTENT_PAGE_SIZE+1);
  const serviceChoices=db.select({clientId:cl.id,clientName:cl.name,serviceEngagementId:se.id,serviceName:st.name,packageName:se.packageName,canRestrict:contentAssignmentCondition(actor,cl.id,se.id)}).from(se)
    .innerJoin(cl,and(eq(cl.workspaceId,se.workspaceId),eq(cl.id,se.clientId))).innerJoin(st,and(eq(st.workspaceId,se.workspaceId),eq(st.id,se.serviceTypeId)))
    .where(and(contentParentCondition(actor,cl.id,se.id),match)).orderBy(asc(cl.name),asc(se.id)).limit(CONTENT_PAGE_SIZE+1);
  const m=schema.workspaceMemberships;
  // Preserve the exact no-readable-parent => no-directory rule in SQL. The
  // three independent reads can now share a D1 invocation, without selecting
  // directory rows first and deciding whether to hide them afterwards.
  const [clients,services,members]=await Promise.all([clientChoices,serviceChoices,
    db.select({membershipId:m.id,name:schema.user.name}).from(m).innerJoin(schema.user,eq(schema.user.id,m.userId))
      .where(and(eq(m.workspaceId,actor.workspaceId),eq(m.status,'active'),sql`${m.role} IN ('owner','admin','project_manager','team_member')`,liveProjectActor(actor),
        sql`(EXISTS ${clientChoices} OR EXISTS ${serviceChoices})`))
      .orderBy(asc(schema.user.name),asc(m.id)).limit(CONTENT_PAGE_SIZE+1),
  ]);
  const broad=['owner','admin'].includes(actor.role);
  return {parents:[...clients.slice(0,CONTENT_PAGE_SIZE).map(row=>({...row,serviceEngagementId:null})),...services.slice(0,CONTENT_PAGE_SIZE)].map(row=>({...row,canRestrict:broad||Boolean(row.canRestrict)})),members:members.slice(0,CONTENT_PAGE_SIZE),parentsOverflow:clients.length>CONTENT_PAGE_SIZE||services.length>CONTENT_PAGE_SIZE,membersOverflow:members.length>CONTENT_PAGE_SIZE};
}
