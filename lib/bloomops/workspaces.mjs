import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { activityForMutation } from './activity.mjs';
import { DEFAULT_DEPARTMENTS, DEFAULT_SERVICE_TYPES } from './service-catalog.mjs';
const w=schema.workspaces,m=schema.workspaceMemberships,r=schema.workspaceCreations;
export const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function insertSelected(db,table,values,source,condition) {
  const selected=Object.fromEntries(Object.keys(getTableColumns(table)).map(k=>[k,sql`${values[k]??null}`.as(k)]));
  return db.insert(table).select(db.select(selected).from(source).where(condition));
}
export function administratorCondition(actor, { purpose=null }={}) {
  if(!actor||actor.status!=='active'||!['owner','admin'].includes(actor.role))return sql`0`;
  return sql`EXISTS (SELECT 1 FROM workspace_memberships wm JOIN workspaces ws ON ws.id=wm.workspace_id
    WHERE wm.id=${actor.membershipId} AND wm.user_id=${actor.userId} AND wm.workspace_id=${actor.workspaceId}
    AND wm.status='active' AND wm.role IN ('owner','admin') AND ws.status='active' ${purpose?sql`AND ws.purpose=${purpose}`:sql``})`;
}
export async function listMyWorkspaces(db,userId,{page=1}={}) {
  if(!Number.isInteger(page)||page<1||page>10000)return [];
  return db.select({id:w.id,name:w.name,purpose:w.purpose,role:m.role}).from(m).innerJoin(w,eq(w.id,m.workspaceId))
    .where(and(eq(m.userId,userId),eq(m.status,'active'),eq(w.status,'active'))).orderBy(asc(w.name),asc(w.id)).limit(101).offset((page-1)*100);
}
export async function createProspectingWorkspace(db,{actor,input,now=new Date()}) {
  if(!actor||!evaluate(actor,{action:'workspace.create'}).allowed)return {ok:false,reason:'not_found'};
  if(!input||Object.keys(input).some(k=>!['name','requestId','sourceWorkspaceId'].includes(k))||typeof input.name!=='string'
    ||!REQUEST_ID.test(input.requestId||'')||input.sourceWorkspaceId!==actor.workspaceId)return {ok:false,reason:'invalid'};
  const name=input.name.trim();if(!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name))return {ok:false,reason:'invalid'};
  const receipt=()=>db.select({workspaceId:r.workspaceId,name:r.initialName}).from(r).innerJoin(w,eq(w.id,r.workspaceId))
    .innerJoin(m,and(eq(m.workspaceId,w.id),eq(m.userId,actor.userId),eq(m.status,'active')))
    .where(and(eq(r.userId,actor.userId),eq(r.requestId,input.requestId),eq(w.status,'active'),eq(w.purpose,'prospecting'),administratorCondition(actor))).limit(1);
  const previous=(await receipt())[0];if(previous)return previous.name===name?{ok:true,workspaceId:previous.workspaceId,unchanged:true}:{ok:false,reason:'conflict'};
  const workspaceId=crypto.randomUUID(),membershipId=crypto.randomUUID(),iso=now.toISOString();
  const fresh=and(eq(m.id,actor.membershipId),administratorCondition(actor),sql`NOT EXISTS(SELECT 1 FROM workspace_creations WHERE user_id=${actor.userId} AND request_id=${input.requestId})`);
  const own=eq(w.id,workspaceId);
  const departments=DEFAULT_DEPARTMENTS.map(d=>({...d,id:crypto.randomUUID()}));
  const departmentIds=new Map(departments.map(d=>[d.slug,d.id]));
  await db.batch([
    insertSelected(db,w,{id:workspaceId,name,slug:`p-${workspaceId}`,status:'active',purpose:'prospecting',createdAt:iso,updatedAt:iso},m,fresh),
    insertSelected(db,m,{id:membershipId,workspaceId,userId:actor.userId,role:'owner',status:'active',joinedAt:iso,createdAt:iso,updatedAt:iso},w,own),
    insertSelected(db,r,{userId:actor.userId,requestId:input.requestId,workspaceId,initialName:name,createdAt:iso},w,own),
    // Catalogue configuration belongs to the new workspace and commits with its creation.
    // Receipt retries return above, preserving later renames and deactivations.
    ...departments.map(d=>insertSelected(db,schema.departments,{id:d.id,workspaceId,name:d.name,slug:d.slug,position:d.position,active:1,createdAt:iso,updatedAt:iso},w,own)),
    ...DEFAULT_SERVICE_TYPES.map(t=>insertSelected(db,schema.serviceTypes,{id:crypto.randomUUID(),workspaceId,name:t.name,slug:t.slug,departmentId:departmentIds.get(t.department),description:null,active:1,createdAt:iso,updatedAt:iso},w,own)),
    activityForMutation(db,w,own,{workspaceId,eventType:'WORKSPACE_CREATED',subjectType:'workspace',subjectId:workspaceId,
      actorMembershipId:membershipId,actorUserId:actor.userId,metadata:{source:'fresh_prospecting_workspace'},occurredAt:iso}),
  ]);
  const saved=(await receipt())[0];return saved&&saved.name===name?{ok:true,workspaceId:saved.workspaceId}:{ok:false,reason:'conflict'};
}
