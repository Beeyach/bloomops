import {activePageMember,pageReadCondition,pageEditCondition} from './page-access.mjs';
import {and,eq,asc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {canMoveUnder,depthOf,MAX_PAGE_DEPTH} from '../page-tree.mjs';
const p=schema.workspacePages,l=schema.workspacePageLocations,t=schema.workspacePageTrees,w=schema.workspaces;
const allowed=actor=>Boolean(actor&&evaluate(actor,{action:'pages.manage'}).allowed);
const scope=actor=>and(eq(p.workspaceId,actor.workspaceId),administratorCondition(actor));
const missing=()=>({ok:false,reason:'not_found'});
const invalid=()=>({ok:false,reason:'invalid',error:'Choose a valid page location within five levels.'});
const conflict=()=>({ok:false,reason:'conflict',error:'The page tree changed. Refresh it and try again.'});
const exact=(input,keys)=>input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k));
const uuid=value=>typeof value==='string'&&REQUEST_ID.test(value);
const epoch=(actor,revision)=>sql`COALESCE((SELECT revision FROM bloomops_page_trees WHERE workspace_id=${actor.workspaceId}),0)=${revision}`;
const ensureTree=(db,actor)=>insertSelected(db,t,{workspaceId:actor.workspaceId,revision:0},w,and(eq(w.id,actor.workspaceId),administratorCondition(actor),sql`NOT EXISTS(SELECT 1 FROM bloomops_page_trees WHERE workspace_id=${actor.workspaceId})`));
const bump=(db,actor,revision)=>db.update(t).set({revision:sql`${t.revision}+1`}).where(and(eq(t.workspaceId,actor.workspaceId),eq(t.revision,revision),administratorCondition(actor))).returning({revision:t.revision});
const event=(actor,id,type)=>({workspaceId:actor.workspaceId,eventType:type,subjectType:'page',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:new Date().toISOString()});

// Both selects share a D1 transaction so the revision describes exactly these rows.
export async function getWorkspacePageTree(db,actor){
 if(!actor||actor.status!=='active')return null;
 actor={...actor};
 const [workspaces,rows]=await db.batch([
  db.select({revision:sql`COALESCE(${t.revision},0)`,canManage:administratorCondition(actor).as('canManage'),hasSharing:sql`EXISTS(SELECT 1 FROM bloomops_page_grants WHERE workspace_id=${actor.workspaceId} AND permission!='none')`}).from(w).leftJoin(t,eq(t.workspaceId,w.id)).where(and(eq(w.id,actor.workspaceId),activePageMember(actor))),
  db.select({id:p.id,title:p.title,parent_id:l.parentId,position:sql`COALESCE(${l.position},0)`,icon:sql`COALESCE((SELECT icon FROM bloomops_page_settings WHERE page_id=${p.id}),'file')`,canEdit:pageEditCondition(actor,p.id).as('canEdit')}).from(p).leftJoin(l,and(eq(l.workspaceId,p.workspaceId),eq(l.pageId,p.id))).where(and(eq(p.workspaceId,actor.workspaceId),pageReadCondition(actor,p.id))).orderBy(asc(l.position),asc(p.id)),
 ]);
 if(!workspaces[0]||!workspaces[0].canManage&&!rows.length)return null;
 const visible=new Set(rows.map(row=>row.id));return {revision:workspaces[0].revision,canManage:Boolean(workspaces[0].canManage),hasSharing:Boolean(workspaces[0].canManage&&workspaces[0].hasSharing),rows:rows.map(row=>({...row,parent_id:visible.has(row.parent_id)?row.parent_id:null}))};
}
export async function createTreePage(db,actor,input){
 if(!allowed(actor))return missing();
 const nested=Object.hasOwn(input||{},'parentId');
 if(!exact(input,nested?['workspaceId','requestId','parentId','expectedTreeRevision']:['workspaceId','requestId'])||input.workspaceId!==actor.workspaceId||!uuid(input.requestId)||nested&&(!(input.parentId===null||uuid(input.parentId))||!Number.isSafeInteger(input.expectedTreeRevision)||input.expectedTreeRevision<0))return invalid();
 actor={...actor};input={...input};
 // A retry uses the existing page even when the tree has since moved.
 const existing=async()=> (await db.select({id:p.id}).from(p).where(and(scope(actor),eq(p.creationRequestId,input.requestId))).limit(1))[0];
 for(let attempt=0;attempt<3;attempt++){
  const replay=await existing();if(replay)return {ok:true,id:replay.id};
  const tree=await getWorkspacePageTree(db,actor);if(!tree)return missing();
  if(nested&&tree.revision!==input.expectedTreeRevision)return conflict();
  const parentId=nested?input.parentId:null;
  if(parentId&&(!tree.rows.some(r=>r.id===parentId)||depthOf(parentId,tree.rows)+1>=MAX_PAGE_DEPTH))return invalid();
  const id=crypto.randomUUID(),iso=new Date().toISOString(),position=Math.max(-1,...tree.rows.filter(r=>r.parent_id===parentId).map(r=>r.position))+1;
  const condition=and(eq(w.id,actor.workspaceId),administratorCondition(actor),epoch(actor,tree.revision),sql`NOT EXISTS(SELECT 1 FROM bloomops_pages WHERE workspace_id=${actor.workspaceId} AND creation_request_id=${input.requestId})`);
  await db.batch([
   ensureTree(db,actor),
   insertSelected(db,p,{id,workspaceId:actor.workspaceId,creationRequestId:input.requestId,title:'Untitled',body:'',revision:1,createdAt:iso,updatedAt:iso},w,condition),
   insertSelected(db,schema.workspacePageSettings,{pageId:id,workspaceId:actor.workspaceId,icon:'file',inheritAccess:1},p,and(scope(actor),eq(p.id,id))),
   insertSelected(db,l,{pageId:id,workspaceId:actor.workspaceId,parentId,position},p,and(scope(actor),eq(p.id,id))),
   activityForMutation(db,p,and(scope(actor),eq(p.id,id)),event(actor,id,'PAGE_CREATED')),
   db.update(t).set({revision:sql`${t.revision}+1`}).where(and(eq(t.workspaceId,actor.workspaceId),eq(t.revision,tree.revision),administratorCondition(actor),sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE id=${id} AND workspace_id=${actor.workspaceId})`)),
  ]);
  const made=await existing();if(made)return {ok:true,id:made.id};
  if(nested)break;
 }
 return await getWorkspacePageTree(db,actor)?conflict():missing();
}
export async function moveWorkspacePage(db,actor,id,input){
 if(!allowed(actor))return missing();
 if(!uuid(id)||!exact(input,Object.hasOwn(input||{},'acknowledgeSharingChange')?['workspaceId','parentId','beforeId','expectedTreeRevision','acknowledgeSharingChange']:['workspaceId','parentId','beforeId','expectedTreeRevision'])||Object.hasOwn(input||{},'acknowledgeSharingChange')&&input.acknowledgeSharingChange!==true||input.workspaceId!==actor.workspaceId||!(input.parentId===null||uuid(input.parentId))||!(input.beforeId===null||uuid(input.beforeId))||!Number.isSafeInteger(input.expectedTreeRevision)||input.expectedTreeRevision<0)return invalid();
 actor={...actor};input={...input};const tree=await getWorkspacePageTree(db,actor);if(!tree||!tree.rows.some(r=>r.id===id))return missing();
 if(tree.revision!==input.expectedTreeRevision)return conflict();
 if(input.parentId&&!tree.rows.some(r=>r.id===input.parentId)||!canMoveUnder(id,input.parentId,tree.rows))return invalid();
 if(tree.hasSharing&&tree.rows.find(r=>r.id===id).parent_id!==input.parentId&&!input.acknowledgeSharingChange)return {ok:false,reason:'invalid',error:'Moving changes inherited access for this page and its subpages. Confirm the sharing change.'};
 const siblings=tree.rows.filter(r=>r.parent_id===input.parentId&&r.id!==id),index=input.beforeId===null?siblings.length:siblings.findIndex(r=>r.id===input.beforeId);
 if(index<0)return invalid();siblings.splice(index,0,{id});
 const condition=and(administratorCondition(actor),epoch(actor,tree.revision));
 const result=await db.batch([
  activityForMutation(db,p,and(scope(actor),eq(p.id,id),epoch(actor,tree.revision)),event(actor,id,'PAGE_MOVED')),
  ...siblings.map((row,position)=>db.update(l).set({parentId:input.parentId,position}).where(and(eq(l.workspaceId,actor.workspaceId),eq(l.pageId,row.id),condition))),
  bump(db,actor,tree.revision),
 ]);
 return result.at(-1)[0]?{ok:true,revision:result.at(-1)[0].revision}:await getWorkspacePageTree(db,actor)?conflict():missing();
}
