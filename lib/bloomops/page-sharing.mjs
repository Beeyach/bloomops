import {and,eq,asc,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {administratorCondition,insertSelected,REQUEST_ID} from './workspaces.mjs';
import {activityForMutation} from './activity.mjs';
import {PAGE_ICONS} from './page-access.mjs';
const p=schema.workspacePages,s=schema.workspacePageSettings,g=schema.workspacePageGrants,t=schema.workspacePageTrees,m=schema.workspaceMemberships,u=schema.user;
const admin=actor=>actor&&actor.status==='active'&&['owner','admin'].includes(actor.role);
const exact=(input,keys)=>input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).length===keys.length&&keys.every(k=>Object.hasOwn(input,k));
const missing=()=>({ok:false,reason:'not_found'});
const invalid=()=>({ok:false,reason:'invalid',error:'Choose a current workspace member and a valid permission.'});
const contactFor=sql`(SELECT cc.id FROM client_contacts cc WHERE cc.workspace_id=${m.workspaceId} AND cc.user_id=${m.userId} ORDER BY cc.id LIMIT 1)`;
function recipients(db,actor){return db.select({id:m.id,userId:m.userId,name:u.name,email:u.email,role:m.role,contactId:contactFor}).from(m).innerJoin(u,eq(u.id,m.userId)).where(and(eq(m.workspaceId,actor.workspaceId),eq(m.status,'active'),administratorCondition(actor),sql`(${m.role} IN ('team_member','project_manager') OR (${m.role}='client' AND ${contactFor} IS NOT NULL))`)).orderBy(asc(u.name),asc(m.id));}
export async function getPageSharing(db,actor,id){
 if(!admin(actor)||typeof id!=='string'||!REQUEST_ID.test(id))return null;
 actor={...actor};
 const [page,people,locations,grants]=await db.batch([
  db.select({id:p.id,title:p.title,icon:s.icon,inheritAccess:s.inheritAccess,revision:t.revision}).from(p).innerJoin(s,eq(s.pageId,p.id)).innerJoin(t,eq(t.workspaceId,p.workspaceId)).where(and(eq(p.id,id),eq(p.workspaceId,actor.workspaceId),administratorCondition(actor))),
  recipients(db,actor),
  db.select({id:p.id,title:p.title,parentId:schema.workspacePageLocations.parentId,inheritAccess:s.inheritAccess}).from(p).innerJoin(s,eq(s.pageId,p.id)).innerJoin(schema.workspacePageLocations,eq(schema.workspacePageLocations.pageId,p.id)).where(and(eq(p.workspaceId,actor.workspaceId),administratorCondition(actor))),
  db.select({pageId:g.pageId,membershipId:g.membershipId,recipientRole:g.recipientRole,contactId:g.contactId,permission:g.permission,contactValid:sql`EXISTS(SELECT 1 FROM client_contacts cc JOIN workspace_memberships wm ON wm.id=bloomops_page_grants.membership_id AND wm.workspace_id=cc.workspace_id WHERE cc.id=bloomops_page_grants.contact_id AND cc.workspace_id=bloomops_page_grants.workspace_id AND cc.user_id=wm.user_id)`}).from(g).where(and(eq(g.workspaceId,actor.workspaceId),administratorCondition(actor))),
 ]);
 if(!page[0])return null;
 const chain=[],seen=new Set();let current=locations.find(row=>row.id===id);
 while(current&&!seen.has(current.id)&&chain.length<5){seen.add(current.id);chain.push(current);if(!current.inheritAccess)break;current=locations.find(row=>row.id===current.parentId);}
 const access=people.map(person=>{let grant,source;for(const location of chain){grant=grants.find(row=>row.pageId===location.id&&row.membershipId===person.id&&row.recipientRole===person.role&&(person.role!=='client'||Boolean(row.contactValid)));if(grant){source=location;break;}}return {...person,permission:grant?.permission||'none',source:source?{id:source.id,title:source.title}:null};});
 return {...page[0],people:access};
}
export async function updatePageSharing(db,actor,id,input){
 if(!admin(actor))return missing();
 const keys=input?.kind==='grant'?['workspaceId','expectedTreeRevision','kind','membershipId','permission']:input?.kind==='inheritance'?['workspaceId','expectedTreeRevision','kind','inheritAccess']:['workspaceId','expectedTreeRevision','kind','icon'];
 if(typeof id!=='string'||!REQUEST_ID.test(id)||!exact(input,keys)||input.workspaceId!==actor.workspaceId||!Number.isSafeInteger(input.expectedTreeRevision)||input.expectedTreeRevision<0||!['grant','inheritance','icon'].includes(input.kind))return invalid();
 if(input.kind==='grant'&&(!/^[a-zA-Z0-9_-]{1,200}$/.test(input.membershipId||'')||!['view','comment','edit','none'].includes(input.permission))||input.kind==='inheritance'&&typeof input.inheritAccess!=='boolean'||input.kind==='icon'&&!PAGE_ICONS.includes(input.icon))return invalid();
 actor={...actor};input={...input};let target=null;
 if(input.kind==='grant'){target=(await recipients(db,actor)).find(row=>row.id===input.membershipId);if(!target)return invalid();}
 const targetCondition=target?sql`EXISTS(SELECT 1 FROM workspace_memberships recipient WHERE recipient.id=${target.id} AND recipient.workspace_id=${actor.workspaceId} AND recipient.status='active' AND recipient.role=${target.role} AND recipient.user_id=${target.userId} AND (${target.role}!='client' OR EXISTS(SELECT 1 FROM client_contacts cc WHERE cc.id=${target.contactId} AND cc.workspace_id=recipient.workspace_id AND cc.user_id=recipient.user_id)))`:sql`1`;
 const guard=and(administratorCondition(actor),targetCondition,sql`EXISTS(SELECT 1 FROM bloomops_page_trees WHERE workspace_id=${actor.workspaceId} AND revision=${input.expectedTreeRevision})`,sql`EXISTS(SELECT 1 FROM bloomops_pages WHERE id=${id} AND workspace_id=${actor.workspaceId})`);
 const mutation=input.kind==='grant'?insertSelected(db,g,{workspaceId:actor.workspaceId,pageId:id,membershipId:target.id,recipientRole:target.role,contactId:target.role==='client'?target.contactId:null,permission:input.permission},p,and(eq(p.id,id),guard)).onConflictDoUpdate({target:[g.pageId,g.membershipId],set:{recipientRole:target.role,contactId:target.role==='client'?target.contactId:null,permission:input.permission},setWhere:guard}):db.update(s).set(input.kind==='icon'?{icon:input.icon}:{inheritAccess:input.inheritAccess?1:0}).where(and(eq(s.pageId,id),eq(s.workspaceId,actor.workspaceId),guard));
 const results=await db.batch([
  activityForMutation(db,p,and(eq(p.id,id),guard),{workspaceId:actor.workspaceId,eventType:input.kind==='icon'?'PAGE_ICON_CHANGED':'PAGE_ACCESS_CHANGED',subjectType:'page',subjectId:id,actorMembershipId:actor.membershipId,actorUserId:actor.userId,occurredAt:new Date().toISOString()}),
  mutation,
  db.update(t).set({revision:sql`${t.revision}+1`}).where(and(eq(t.workspaceId,actor.workspaceId),guard)).returning({revision:t.revision}),
 ]);
 return results[2][0]?{ok:true,...results[2][0]}:await getPageSharing(db,actor,id)?{ok:false,reason:'conflict',error:'Page access or membership changed. Refresh and try again.'}:missing();
}
