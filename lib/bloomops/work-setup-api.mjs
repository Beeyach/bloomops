import {getActor,requireAccess,json,notFound} from './access.mjs';
import {projectOptions} from './projects.mjs';
export async function workSetupAccess(req){const result=await requireAccess(req);if(result.response)return result;return {...result,actor:await getActor(result.access)};}
export function workSetupResponse(actor,result){
 if(!result||['not_found','forbidden'].includes(result.reason))return notFound();
 const scope={workspaceId:actor.workspaceId,userId:actor.userId};
 return result.ok?json({...result,scope}):json({error:result.error||Object.values(result.errors||{}).join(' ')||(result.reason==='conflict'?'The saved setup changed. Your unsaved input is preserved. Reopen the saved version before trying again.':'Check the setup fields.'),reason:result.reason,scope},result.reason==='conflict'?409:400);
}
export async function workSetupOptions(db,actor){const options=await projectOptions(db,actor);return options?{clients:options.clients,services:options.services}:null;}
