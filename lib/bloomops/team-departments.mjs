// Team department views project existing Work records; they grant no access.
import {and,asc,eq,inArray,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {INTERNAL_ROLES} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {listActions,openActionCondition} from './actions.mjs';
import {listProjectSummaries} from './work-projections.mjs';
import {readTogether} from './read-batch.mjs';
export const TEAM_DEPARTMENTS=['social','ads','systems','operations'];
export function normalizeDepartmentQuery(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['department','tab','page','state'].includes(k))||Object.values(input).some(v=>typeof v!=='string'))return null;
  const {department='social',tab='projects',page='1',state='open'}=input;
  if(!TEAM_DEPARTMENTS.includes(department)||!['projects','actions'].includes(tab)||!['open','all'].includes(state)||!/^\d+$/.test(page)||Number(page)<1||Number(page)>10000)return null;
  return {department,tab,page:Number(page),state};
}
// Match Work's effective department: the Service Type takes precedence over
// Project metadata. A Project without a Service can use its own department.
// No reliance on names, member departments, or another workspace's catalogue.
export function teamDepartmentCondition(slug) {
  const p=schema.projects;
  if(!TEAM_DEPARTMENTS.includes(slug))return sql`0`;
  return sql`EXISTS (SELECT 1 FROM departments td
    LEFT JOIN service_engagements se ON se.id=${p.serviceEngagementId} AND se.workspace_id=${p.workspaceId} AND se.client_id=${p.clientId}
    LEFT JOIN service_types st ON st.id=se.service_type_id AND st.workspace_id=se.workspace_id
    WHERE td.workspace_id=${p.workspaceId} AND td.id=coalesce(st.department_id,${p.departmentId}) AND td.slug=${slug})`;
}
export async function teamDepartmentWork(db,actor,input={}, {now=new Date()}={}) {
  const query=normalizeDepartmentQuery(input);
  if(!query)return {ok:false,reason:'invalid'};
  if(actor?.status!=='active'||!INTERNAL_ROLES.includes(actor.role)||actor.preview||!['workspace','assigned'].includes(actor.scope?.kind))return {ok:false,reason:'forbidden'};
  return readTogether(db,async db=>{
    const d=schema.departments,condition=teamDepartmentCondition(query.department);
    const [departments,records]=await Promise.all([
      db.select({slug:d.slug,name:d.name,active:d.active}).from(d).where(and(eq(d.workspaceId,actor.workspaceId),inArray(d.slug,TEAM_DEPARTMENTS),liveProjectActor(actor))).orderBy(asc(d.position),asc(d.slug)),
      query.tab==='actions'?listActions(db,actor,{view:'all',page:query.page},{now,limit:50,scopeCondition:and(condition,query.state==='open'?openActionCondition():undefined)}):
        listProjectSummaries(db,actor,{now,page:query.page,limit:50,attentionFirst:true,condition:and(condition,query.state==='open'?sql`${schema.projects.status} NOT IN ('completed','cancelled','archived')`:undefined)}),
    ]);
    const department=departments.find(d=>d.slug===query.department);
    if(!department||records.ok===false)return {ok:false,reason:'not_found'};
    return {ok:true,query,department,departments,records};
  });
}
