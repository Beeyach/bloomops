import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
export async function prospectAccess(req,action){const result=await requireAuthorized(req,{action});return result.response?result:result.access.workspace.purpose==='prospecting'?result:{response:notFound()};}
export function prospectProblem(result){
 if(result.reason==='not_found')return notFound();
 return json({error:result.reason==='conflict'?'This profile changed. Reload it before saving again.':'Check the highlighted fields.',errors:result.errors||{}},result.reason==='conflict'?409:400);
}
