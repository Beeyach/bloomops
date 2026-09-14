import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspectOutreach,saveProspectOutreach} from '@/lib/bloomops/prospect-outreach.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const url=new URL(req.url),result=await getProspectOutreach(access.db,access.actor,url.searchParams.get('prospectId'));
 return result===null?notFound():json(result,result.conflict?409:200);
});
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await saveProspectOutreach(access.db,access.actor,await readStructuredBody(req,{maxBytes:128*1024}));
 return result===null?notFound():json(result,result.invalid?400:result.conflict?409:200);
});
