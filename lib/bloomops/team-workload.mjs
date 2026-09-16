import {and, asc, eq, isNull, sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {actionReadCondition, dependencyBlockedCondition} from './action-access.mjs';
import {listActions, openActionCondition, readableActionToday} from './actions.mjs';
import {readTogether} from './read-batch.mjs';

export const WORKLOAD_GROUP_LIMIT = 25;
export const WORKLOAD_ACTION_LIMIT = 50;
const a=schema.actions, p=schema.projects, c=schema.clients;
const m=schema.workspaceMemberships, u=schema.user;
const invalid=()=>({ok:false,reason:'invalid'});

export function normalizeWorkloadQuery(input={}) {
  if(!input || typeof input!=='object' || Array.isArray(input)
    || Object.keys(input).some(key=>!['page','assignee','actionPage'].includes(key))) return invalid();
  const {page='1',assignee='',actionPage='1'}=input;
  if(![page,actionPage].every(value=>typeof value==='string' && /^[1-9]\d{0,3}$/.test(value))
    || typeof assignee!=='string' || assignee.length>120 || /[\x00-\x20\x7f]/.test(assignee)) return invalid();
  return {ok:true,page:Number(page),assignee,actionPage:Number(actionPage)};
}
const joined=(db,fields)=>db.select(fields).from(a)
  .innerJoin(p,and(eq(p.workspaceId,a.workspaceId),eq(p.id,a.projectId)))
  .innerJoin(c,and(eq(c.workspaceId,p.workspaceId),eq(c.id,p.clientId)))
  .leftJoin(m,and(eq(m.workspaceId,a.workspaceId),eq(m.id,a.assigneeMembershipId)))
  .leftJoin(u,eq(u.id,m.userId));
const assigneeCondition=id=>id==='none'?isNull(a.assigneeMembershipId):eq(a.assigneeMembershipId,id);

export async function teamActionWorkload(db,actor,input={}, {now=new Date()}={}) {
  const normalized=normalizeWorkloadQuery(input);
  if(!normalized.ok)return normalized;
  const {ok:_valid,...query}=normalized;
  if(actor?.preview || !evaluate(actor,{action:'action.list'}).allowed)return {ok:false,reason:'forbidden'};
  const today=await readableActionToday(db,actor,now);
  const condition=and(actionReadCondition(actor),openActionCondition());
  const blocked=dependencyBlockedCondition();
  const fields={membershipId:a.assigneeMembershipId,name:u.name,
    active:sql`${m.status}='active' AND ${m.role} IN ('owner','admin','project_manager','team_member')`,
    open:sql`count(*)`,overdue:sql`sum(CASE WHEN ${a.dueDate}<${today} AND NOT ${blocked} THEN 1 ELSE 0 END)`,
    waiting:sql`sum(CASE WHEN ${a.status}='waiting' THEN 1 ELSE 0 END)`,
    review:sql`sum(CASE WHEN ${a.status}='review' THEN 1 ELSE 0 END)`,
    blocked:sql`sum(CASE WHEN ${blocked} THEN 1 ELSE 0 END)`,
    undated:sql`sum(CASE WHEN ${a.dueDate} IS NULL THEN 1 ELSE 0 END)`,
    nextDueDate:sql`min(CASE WHEN ${a.dueDate}>=${today} THEN ${a.dueDate} ELSE NULL END)`};
  const [rows,selected,actions]=await readTogether(db,read=>Promise.all([
    // Build the query with the composed read session, not the outer db.
    joined(read,fields).where(condition).groupBy(a.assigneeMembershipId,u.name,m.status,m.role)
      .orderBy(sql`${a.assigneeMembershipId} IS NOT NULL`,asc(u.name),asc(a.assigneeMembershipId))
      .limit(WORKLOAD_GROUP_LIMIT+1).offset((query.page-1)*WORKLOAD_GROUP_LIMIT),
    query.assignee?joined(read,fields).where(and(condition,assigneeCondition(query.assignee)))
      .groupBy(a.assigneeMembershipId,u.name,m.status,m.role).limit(1):[],
    query.assignee?listActions(read,actor,{view:'all',page:query.actionPage},{now,limit:WORKLOAD_ACTION_LIMIT,
      scopeCondition:and(openActionCondition(),assigneeCondition(query.assignee))}):null,
  ]));
  if(query.assignee&&!selected.length)return {ok:false,reason:'not_found'};
  const dto=row=>({...row,active:Boolean(row.active)});
  return {ok:true,query,items:rows.slice(0,WORKLOAD_GROUP_LIMIT).map(dto),hasMore:rows.length>WORKLOAD_GROUP_LIMIT,
    selected:selected[0]?dto(selected[0]):null,actions};
}
