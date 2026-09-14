import {getWorkspacePage} from './pages.mjs';
// The canonical read checks direct/inherited edit grants and live membership
// in the same statement that returns the document. Recovery never writes.
export async function readPageRecovery(db,actor,id,input){
 if(!actor||!input||input.userId!==actor.userId||input.workspaceId!==actor.workspaceId)return {status:403};
 if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['userId','workspaceId'].includes(k)))return {status:400};
 const page=await getWorkspacePage(db,actor,id);
 return page?.canEdit?{status:200,userId:actor.userId,workspaceId:actor.workspaceId,page}:{status:404};
}
