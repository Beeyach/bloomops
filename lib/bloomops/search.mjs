import {and,asc,eq,or,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {INTERNAL_ROLES} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {prospectCondition} from './prospects.mjs';
import {readableAction} from './action-access.mjs';
import {pageReadCondition} from './page-access.mjs';
import {fileReadCondition} from './file-access.mjs';
import {contentFileReadCondition} from './content-file-access.mjs';
import {searchInput,searchTypes} from './search-values.mjs';

// Search reads identity fields from canonical records, never document bodies,
// audit notes, contact directories, storage keys or a secondary search index.
export async function searchRecords(db,actor,input) {
  if(!actor||actor.status!=='active'||!actor.scope||![...INTERNAL_ROLES,'client'].includes(actor.role)||input?.userId!==actor.userId||input?.workspaceId!==actor.workspaceId)return {status:403};
  const query=searchInput(input),portal=actor.role==='client',available=searchTypes(portal);
  if(!query||query.type!=='all'&&!available.includes(query.type))return {status:400};
  const types=query.type==='all'?available:[query.type],limit=query.type==='all'?5:20;
  const pattern='%'+query.q.replace(/[!%_]/g,c=>'!'+c)+'%';
  const match=(...columns)=>or(...columns.map(c=>sql`${c} LIKE ${pattern} ESCAPE '!'`));
  const live=liveProjectActor(actor),empty=sql`NULL`;
  const c=schema.clients,p=schema.prospects,a=schema.actions,pg=schema.workspacePages,f=schema.assets;
  // Match A4's client scope using current assignments, not the actor's cached ID set.
  const clientScope=actor.role==='team_member'?sql`EXISTS(SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${c.workspaceId} AND ca.client_id=${c.id} AND ca.membership_id=${actor.membershipId})`:sql`1`;
  const specs={
    prospects:{table:p,title:p.businessName,website:p.website,condition:and(prospectCondition(actor),match(p.businessName,p.personName,p.website))},
    clients:{table:c,title:c.name,detail:c.company,condition:and(eq(c.workspaceId,actor.workspaceId),clientScope,match(c.name,c.company))},
    tasks:{table:a,title:a.title,condition:and(readableAction(actor),match(a.title))},
    pages:{table:pg,title:pg.title,condition:and(eq(pg.workspaceId,actor.workspaceId),pageReadCondition(actor,pg.id),match(pg.title))},
    files:{table:f,title:f.filename,condition:and(eq(f.status,'ready'),or(fileReadCondition(actor,{portal,ready:true}),contentFileReadCondition(actor,{portal,ready:true})),match(f.filename))},
  };
  const queries=types.map(type=>{const s=specs[type];return db.select({id:s.table.id,title:s.title,detail:s.detail||empty,website:s.website||empty}).from(s.table)
    .where(and(live,s.condition)).orderBy(asc(s.title),asc(s.table.id)).limit(limit+1).offset((query.page-1)*limit);});
  // A single read-only transaction gives the groups one authority snapshot.
  // Every source repeats live role/membership and its own resource predicates.
  const [authority,...groups]=await db.batch([
    db.select({id:schema.workspaceMemberships.id}).from(schema.workspaceMemberships).where(and(eq(schema.workspaceMemberships.id,actor.membershipId),live)).limit(1),...queries,
  ]);
  if(!authority.length)return {status:403};
  const href=(type,id)=>type==='files'?'/api/bloomops/files/'+encodeURIComponent(id)+'/download':
    type==='tasks'?'/work/actions/'+encodeURIComponent(id):
    (portal?'/portal':'')+'/'+(type==='prospects'?'prospecting':type)+'/'+encodeURIComponent(id);
  return {status:200,userId:actor.userId,workspaceId:actor.workspaceId,...query,groups:types.map((type,i)=>({type,more:groups[i].length>limit,rows:groups[i].slice(0,limit).map(row=>({...row,href:href(type,row.id)}))}))};
}
