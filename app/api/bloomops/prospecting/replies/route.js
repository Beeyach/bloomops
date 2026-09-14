import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspectReplies,checkProspectReplies,stopProspectOutreach} from '@/lib/bloomops/prospect-replies.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await getProspectReplies(access.db,access.actor,access.env,new URL(req.url).searchParams.get('prospectId'));
 return result===null?notFound():json(result);
});
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const body=await readStructuredBody(req,{maxBytes:8192});if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Choose a reply review action.'},400);
 const {action,...input}=body;
 const result=action==='check'?await checkProspectReplies(access.db,access.actor,access.env,access.session.id,input):action==='stop'?await stopProspectOutreach(access.db,access.actor,access.session.id,input):{invalid:true,error:'Choose a reply review action.'};
 return result===null?notFound():json(result,result.invalid?400:result.unavailable?503:result.conflict?409:200);
});
