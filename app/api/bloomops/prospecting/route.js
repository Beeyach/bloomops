import {json} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {listProspects,createProspect} from '@/lib/bloomops/prospects.mjs';
import {prospectAccess,prospectProblem} from './_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;const params=new URL(req.url).searchParams;const result=await listProspects(access.db,access.actor,Object.fromEntries(params));return json(result,result?.invalid?400:200);});
export const POST=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const result=await createProspect(access.db,{actor:access.actor,input:await readStructuredBody(req)});return result.ok?json(result,result.unchanged?200:201):prospectProblem(result);});
