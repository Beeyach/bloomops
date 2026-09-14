import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {previewProspectSource} from '@/lib/bloomops/prospect-source-preview.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;
 const result=await previewProspectSource(access.db,access.actor,Object.fromEntries(new URL(req.url).searchParams));
 return result===null?notFound():json(result,result.invalid?400:result.unavailable?503:200);
});
