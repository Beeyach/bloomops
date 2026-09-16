import {and,eq,sql} from 'drizzle-orm';
import {schema} from './db.mjs';
import {ACTIONS} from './authorization.mjs';
import {liveProjectActor} from './project-access.mjs';
import {getClient,updateClient} from './clients.mjs';
import {CLIENT_EDIT_FIELDS,clientEditSnapshot,validClientSnapshot,sameClientSnapshot} from './client-edit-values.mjs';
const c=schema.clients;
const missing=()=>({ok:false,reason:'not_found'});
const conflict=()=>({ok:false,reason:'conflict'});
const id=v=>typeof v==='string'&&v.length>0&&v.length<=100;
export function clientEditAuthority(actor){
 return !actor?.scope||actor.preview||!ACTIONS['client.manage'].roles.includes(actor.role)?sql`0`:liveProjectActor(actor);
}
export async function readClientEdit(db,actor,clientId){
 if(!id(clientId))return null;
 const [row]=await db.select(Object.fromEntries(CLIENT_EDIT_FIELDS.map(k=>[k,c[k]]))).from(c)
  .where(and(eq(c.workspaceId,actor?.workspaceId||''),eq(c.id,clientId),clientEditAuthority(actor))).limit(1);
 return row?clientEditSnapshot(row):null;
}
export async function saveClientEdit(db,actor,clientId,input){
 if(!id(clientId)||!input||input.editorScope?.userId!==actor?.userId||input.editorScope?.workspaceId!==actor?.workspaceId)return missing();
 const current=await readClientEdit(db,actor,clientId);if(!current)return missing();
 if(!validClientSnapshot(input.expected))return {ok:false,reason:'invalid',errors:{expected:'Reopen the saved Client before editing.'}};
 if(!sameClientSnapshot(current,input.expected))return conflict();
 const client=await getClient(db,actor,clientId);
 if(!client||!sameClientSnapshot(clientEditSnapshot(client),input.expected))return conflict();
 const {editorScope,expected,...patch}=input;
 let eligibleOwner=sql`1`;
 if(Object.hasOwn(patch,'ownerMembershipId')&&typeof patch.ownerMembershipId==='string'&&patch.ownerMembershipId.trim()){
  const owner=patch.ownerMembershipId.trim();
  // Keeping the historical owner is permitted. A new choice must still be eligible
  // at the actual mutation, including an assigned Team member's current assignment.
  eligibleOwner=sql`(${c.ownerMembershipId} IS ${owner} OR EXISTS (SELECT 1 FROM workspace_memberships om
   WHERE om.workspace_id=${actor.workspaceId} AND om.id=${owner} AND om.status='active'
   AND (om.role IN ('owner','admin','project_manager') OR (om.role='team_member' AND EXISTS
    (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=om.workspace_id AND ca.membership_id=om.id AND ca.client_id=${clientId})))))`;
 }
 const result=await updateClient(db,{workspaceId:actor.workspaceId,client,input:patch,actorMembershipId:actor.membershipId,actorUserId:actor.userId,
  conditionGuard:and(clientEditAuthority(actor),eligibleOwner)});
 if(result.ok&&result.unchanged&&!await readClientEdit(db,actor,clientId))return missing();
 return result;
}
