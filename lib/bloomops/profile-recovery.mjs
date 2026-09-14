import {evaluate} from './authorization.mjs';
import {and,eq} from 'drizzle-orm';
import {schema} from './db.mjs';
import {getProspect,prospectCondition} from './prospects.mjs';
// Read only. Stored values remain in the browser until this bound authority
// check has returned the currently authorized canonical record.
export async function readProfileRecovery(db,actor,id,input){
 if(!actor||!input||input.userId!==actor.userId||input.workspaceId!==actor.workspaceId||!evaluate(actor,{action:'prospecting.manage'}).allowed)return {status:403};
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['userId','workspaceId'].includes(k)))return {status:400};
 const current=await getProspect(db,actor,id);if(!current)return {status:404};
 const stillAllowed=await db.select({id:schema.prospects.id}).from(schema.prospects).where(and(eq(schema.prospects.id,String(id)),prospectCondition(actor))).limit(1);
 return stillAllowed.length?{status:200,userId:actor.userId,workspaceId:actor.workspaceId,...current}:{status:404};
}
