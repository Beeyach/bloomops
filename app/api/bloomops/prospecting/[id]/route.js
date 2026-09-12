import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspect,updateProspect} from '@/lib/bloomops/prospects.mjs';
import {prospectAccess,prospectProblem} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;const {id}=await params;const result=await getProspect(access.db,access.actor,id,{activityPage:Number(new URL(req.url).searchParams.get('activityPage')||1)});return result?json(result):notFound();});
export const PATCH=withApiErrors(async(req,{params})=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const {id}=await params;const result=await updateProspect(access.db,{actor:access.actor,id,input:await readStructuredBody(req)});return result.ok?json(result):prospectProblem(result);});
