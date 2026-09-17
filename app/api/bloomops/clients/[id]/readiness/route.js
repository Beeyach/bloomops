import {requireClient} from '../../_shared.mjs';
import {activationReadiness} from '@/lib/bloomops/client-activation.mjs';
import {activationMessages} from '../../_activation.mjs';
import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
 const {id}=await params;
 const {access,response}=await requireClient(req,id,'client.activate');if(response)return response;
 const result=await activationReadiness(access.db,access.actor,id);
 return result.ok?json({...result,message:result.reason?activationMessages[result.reason]||'Review the client and onboarding setup, then check again.':null}):notFound();
});
