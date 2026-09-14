import {and,eq} from 'drizzle-orm';
import {schema} from './db.mjs';
import {evaluate} from './authorization.mjs';
import {administratorCondition,REQUEST_ID} from './workspaces.mjs';
// One guarded read distinguishes an unsubmitted draft from its original creation
// receipt. Request identity is retained in the browser; no record is created here.
export async function readProspectCreation(db,actor,input){
 if(!actor||!input||input.userId!==actor.userId||input.workspaceId!==actor.workspaceId||!evaluate(actor,{action:'prospecting.manage'}).allowed)return {status:403};
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['userId','workspaceId','requestId'].includes(k))||typeof input.requestId!=='string'||!REQUEST_ID.test(input.requestId))return {status:400};
 const w=schema.workspaces,p=schema.prospects;
 const [row]=await db.select({workspaceId:w.id,prospectId:p.id,businessName:p.businessName,createdByMembershipId:p.createdByMembershipId}).from(w)
  .leftJoin(p,and(eq(p.workspaceId,w.id),eq(p.creationRequestId,input.requestId)))
  .where(and(eq(w.id,actor.workspaceId),administratorCondition(actor,{purpose:'prospecting'}))).limit(1);
 if(!row)return {status:403};
 if(row.prospectId&&row.createdByMembershipId!==actor.membershipId)return {status:409};
 return {status:200,userId:actor.userId,workspaceId:actor.workspaceId,requestId:input.requestId,state:row.prospectId?'created':'ready',prospect:row.prospectId?{id:row.prospectId,businessName:row.businessName}:null};
}
