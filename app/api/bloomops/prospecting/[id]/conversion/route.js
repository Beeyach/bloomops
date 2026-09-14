import {json,notFound} from '@/lib/bloomops/access.mjs';
import {prospectAccess} from '../../_shared.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspectConversion,convertProspect} from '@/lib/bloomops/prospect-conversions.mjs';
export const dynamic='force-dynamic';
const response=result=>result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
export const GET=withApiErrors(async(req,{params})=>{const {access,response:denied}=await prospectAccess(req,'prospecting.manage');if(denied)return denied;if(new URL(req.url).search)return json({error:'Remove the query parameters.'},400);return response(await getProspectConversion(access.db,access.actor,(await params).id));});
export const POST=withApiErrors(async(req,{params})=>{const {access,response:denied}=await prospectAccess(req,'prospecting.manage');if(denied)return denied;return response(await convertProspect(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:12000})));});
