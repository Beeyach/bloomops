import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspectDelivery,prepareProspectDelivery,cancelProspectDelivery,sendProspectIntroduction,reconcileProspectDelivery} from '@/lib/bloomops/prospect-delivery.mjs';
import {activateProspectFollowups,runProspectFollowup,reconcileProspectFollowup} from '@/lib/bloomops/prospect-followups.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await getProspectDelivery(access.db,access.actor,access.env,new URL(req.url).searchParams.get('prospectId'));
 return result===null?notFound():json(result,result.conflict?409:200);
});
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const body=await readStructuredBody(req,{maxBytes:4096});if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Choose a delivery action.'},400);
 const {action,...input}=body;let result;
 if(action==='prepare')result=await prepareProspectDelivery(access.db,access.actor,input);
 else if(action==='cancel')result=await cancelProspectDelivery(access.db,access.actor,input);
 else if(action==='send')result=await sendProspectIntroduction(access.db,access.actor,access.env,access.session.id,input);
 else if(action==='reconcile')result=await reconcileProspectDelivery(access.db,access.actor,access.env,access.session.id,input);
 else if(action==='activate-followups')result=await activateProspectFollowups(access.db,access.actor,access.session.id,input);
 else if(action==='run-followup')result=await runProspectFollowup(access.db,access.actor,access.env,access.session.id,input);
 else if(action==='reconcile-followup')result=await reconcileProspectFollowup(access.db,access.actor,access.env,access.session.id,input);
 else return json({error:'Choose a delivery action.'},400);
 return result===null?notFound():json(result,result.unavailable?503:result.conflict?409:200);
});
