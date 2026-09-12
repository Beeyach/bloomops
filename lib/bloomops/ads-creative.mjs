import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { adsContentReadCondition, adsParentCondition, adsProjectVisibilityCondition, adsWorkflowCondition, ADS_STAGES } from './content-internal-access.mjs';
import { CONTENT_DETAIL_FIELDS, CONTENT_TYPES } from './content-values.mjs';
import { platformFilterKey } from './content-platform-values.mjs';
import { contentPlatformSelection, contentPlatformCondition } from './content-platform-read.mjs';
import { contentFileActivityRows } from './content-file-activity.mjs';

const c=schema.contentItems,p=schema.projects,cl=schema.clients,se=schema.serviceEngagements,st=schema.serviceTypes,m=schema.workspaceMemberships,u=schema.user;
export const ADS_CREATIVE_QUERY_FIELDS=['clientId','serviceEngagementId','projectId','type','ownerMembershipId','stage','platform','page'];
const invalid=()=>({ok:false,reason:'invalid',errors:{form:'Choose only the available creative filters.'}});
const validId=id=>typeof id==='string' && id.length<=100 && !/[\x00-\x20\x7f]/.test(id);
export function adsCreativeFilters(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!ADS_CREATIVE_QUERY_FIELDS.includes(k)) || Object.values(input).some(v=>typeof v!=='string'))return invalid();
  const f=Object.fromEntries(ADS_CREATIVE_QUERY_FIELDS.map(k=>[k,input[k]||'']));
  if(['clientId','serviceEngagementId','projectId','ownerMembershipId'].some(k=>!validId(f[k])))return invalid();
  if(f.type&&!CONTENT_TYPES.includes(f.type) || f.stage&&!ADS_STAGES.includes(f.stage))return invalid();
  if(f.platform){const key=platformFilterKey(f.platform);if(!key)return invalid();f.platform=key;}
  const page=input.page??'1';if(!/^[1-9]\d{0,4}$/.test(page)||Number(page)>10000)return invalid();
  return {ok:true,filters:{...f,page:Number(page)}};
}
const context={projectId:p.id,projectName:p.name,clientName:cl.name,serviceName:st.name,packageName:se.packageName,ownerName:u.name};
function rows(db,selected,{distinct=false}={}) {
  return (distinct?db.selectDistinct(selected):db.select(selected)).from(c)
    .innerJoin(p,and(eq(p.id,c.adsProjectId),eq(p.workspaceId,c.workspaceId)))
    .innerJoin(cl,and(eq(cl.id,c.clientId),eq(cl.workspaceId,c.workspaceId)))
    .innerJoin(se,and(eq(se.id,c.serviceEngagementId),eq(se.workspaceId,c.workspaceId)))
    .innerJoin(st,and(eq(st.id,se.serviceTypeId),eq(st.workspaceId,se.workspaceId)))
    .leftJoin(m,and(eq(m.id,c.ownerMembershipId),eq(m.workspaceId,c.workspaceId))).leftJoin(u,eq(u.id,m.userId));
}
export async function getAdsContent(db,actor,contentId) {
  const fields=Object.fromEntries(['id','clientId','serviceEngagementId','productionArea','adsProjectId',...CONTENT_DETAIL_FIELDS,'stage','stageContext','publishedAt','revision','createdAt','updatedAt'].map(k=>[k,c[k]]));
  const [row]=await rows(db,{...fields,...context,platforms:contentPlatformSelection(),editable:adsWorkflowCondition()})
    .where(and(adsContentReadCondition(actor),eq(c.id,String(contentId)))).limit(1);
  return row?{...row,editable:Boolean(row.editable)}:null;
}
export async function listAdsCreative(db,actor,input={}) {
  if(!evaluate(actor,{action:'content.list'}).allowed)return {ok:false,reason:'forbidden'};
  const parsed=adsCreativeFilters(input);if(!parsed.ok)return parsed;
  const f=parsed.filters,condition=[adsContentReadCondition(actor)];
  for(const key of ADS_CREATIVE_QUERY_FIELDS.filter(k=>!['page','platform'].includes(k)))if(f[key])condition.push(eq(key==='projectId'?c.adsProjectId:c[key],f[key]));
  if(f.platform)condition.push(contentPlatformCondition(f.platform));
  const items=await rows(db,{id:c.id,title:c.title,type:c.type,stage:c.stage,visibility:c.visibility,targetPublishDate:c.targetPublishDate,...context,platforms:contentPlatformSelection()})
    .where(and(...condition)).orderBy(desc(c.createdAt),desc(c.id)).limit(51).offset((f.page-1)*50);
  return {ok:true,items:items.slice(0,50),hasMore:items.length>50,page:f.page,filters:f};
}
export async function adsCreativeFacets(db,actor) {
  const choices=[['clientId',c.clientId,cl.name],['serviceEngagementId',c.serviceEngagementId,st.name],['projectId',p.id,p.name],['ownerMembershipId',c.ownerMembershipId,u.name]];
  const entries=await Promise.all(choices.map(async([key,id,name])=>{
    const values=await rows(db,{id,name},{distinct:true}).where(and(adsContentReadCondition(actor),sql`${id} IS NOT NULL`)).orderBy(asc(name),asc(id)).limit(201);
    return [key,{items:values.slice(0,200),hasMore:values.length>200}];
  }));
  const cp=schema.contentPlatforms;
  const platforms=await db.select({id:cp.platformKey,name:sql`min(${cp.label})`}).from(c).innerJoin(cp,and(eq(cp.contentId,c.id),eq(cp.workspaceId,c.workspaceId)))
    .where(adsContentReadCondition(actor)).groupBy(cp.platformKey).orderBy(sql`min(${cp.label})`,asc(cp.platformKey)).limit(201);
  return {...Object.fromEntries(entries),platform:{items:platforms.slice(0,200),hasMore:platforms.length>200}};
}
export async function adsCreativeOptions(db,actor,{q='',projectId=''}={}) {
  if(!evaluate(actor,{action:'content.list'}).allowed || typeof q!=='string' || q.length>120 || !validId(projectId))return null;
  const search=q.trim().toLowerCase();
  const query=extra=>db.select({projectId:p.id,projectName:p.name,clientId:p.clientId,clientName:cl.name,serviceEngagementId:p.serviceEngagementId,serviceName:st.name,
    canRestrict:adsProjectVisibilityCondition(actor,'restricted')}).from(p)
    .innerJoin(cl,and(eq(cl.id,p.clientId),eq(cl.workspaceId,p.workspaceId)))
    .innerJoin(se,and(eq(se.id,p.serviceEngagementId),eq(se.workspaceId,p.workspaceId)))
    .innerJoin(st,and(eq(st.id,se.serviceTypeId),eq(st.workspaceId,se.workspaceId)))
    .where(and(adsParentCondition(actor),extra)).orderBy(asc(p.name),asc(p.id));
  const found=await query(sql`(instr(lower(${p.name}),${search})>0 OR instr(lower(${cl.name}),${search})>0 OR instr(lower(${st.name}),${search})>0)`).limit(201);
  const parents=found.slice(0,200);
  if(projectId && !parents.some(row=>row.projectId===projectId)) {const [selected]=await query(eq(p.id,projectId)).limit(1);if(!selected)return null;parents.push(selected);}
  const members=await db.select({membershipId:m.id,name:u.name}).from(m).innerJoin(u,eq(u.id,m.userId))
    .where(and(eq(m.workspaceId,actor.workspaceId),eq(m.status,'active'),sql`${m.role} IN ('owner','admin','project_manager','team_member')`,sql`EXISTS ${query().limit(1)}`))
    .orderBy(asc(u.name),asc(m.id)).limit(201);
  return {parents:parents.map(row=>({...row,canRestrict:Boolean(row.canRestrict)})),members:members.slice(0,200),parentsOverflow:found.length>200,membersOverflow:members.length>200,selectedProjectId:projectId};
}
export async function adsCreativeHistory(db,actor,contentId) {
  if (!await getAdsContent(db,actor,contentId)) return {items:[],hasMore:false};
  const a=schema.activityEvents;
  const [events,files]=await Promise.all([
    db.select({id:a.id,eventType:a.eventType,metadataJson:a.metadataJson,occurredAt:a.occurredAt,actorName:u.name}).from(a)
      .innerJoin(c,and(eq(c.workspaceId,a.workspaceId),eq(c.id,a.subjectId),eq(a.subjectType,'content')))
      .leftJoin(m,and(eq(m.id,a.actorMembershipId),eq(m.workspaceId,a.workspaceId))).leftJoin(u,eq(u.id,m.userId))
      .where(and(eq(c.id,String(contentId)),adsContentReadCondition(actor),sql`${a.eventType} IN ('CONTENT_CREATED','CONTENT_DETAILS_UPDATED','CONTENT_PLATFORMS_CHANGED','CONTENT_STAGE_CHANGED')`))
      .orderBy(desc(a.occurredAt),desc(a.id)).limit(61),
    contentFileActivityRows(db,actor,{contentId,limit:61,orderById:true}),
  ]);
  const ordered=[...events,...files].sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||(String(a.id)<String(b.id)?1:String(a.id)>String(b.id)?-1:0));
  return {items:ordered.slice(0,60),hasMore:ordered.length>60};
}
