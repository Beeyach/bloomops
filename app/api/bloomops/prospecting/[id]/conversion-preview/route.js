import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getConversionOptions,previewProspectConversion} from '@/lib/bloomops/prospect-conversion-preview.mjs';
export const dynamic='force-dynamic';
const response=result=>result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
export const GET=withApiErrors(async(req,{params})=>{const {access,response:denied}=await requireAuthorized(req,{action:'prospecting.manage'});if(denied)return denied;const q=new URL(req.url).searchParams;if([...q.keys()].some(k=>q.getAll(k).length!==1))return json({error:'Check the search.'},400);return response(await getConversionOptions(access.db,access.actor,(await params).id,Object.fromEntries(q)));});
export const POST=withApiErrors(async(req,{params})=>{const {access,response:denied}=await requireAuthorized(req,{action:'prospecting.manage'});if(denied)return denied;return response(await previewProspectConversion(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:12000})));});
