import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { workQueryAccess } from '@/lib/bloomops/work-api-input.mjs';
import { loadAdsParentResource } from '@/lib/bloomops/content-internal-access.mjs';
import { contentBody, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { createAdsContent } from '@/lib/bloomops/content.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async(req,context)=>{
  const {id}=await context.params;
  const {access,response}=await workQueryAccess(req,requireAuthorized(req,{action:'content.create',resource:a=>loadAdsParentResource(a.db,a.actor,id)}));if(response)return response;
  const parsed=await contentBody(req,true);if(parsed.response)return parsed.response;
  const {requestId,...input}=parsed.body;
  return contentResponse(await createAdsContent(access.db,{actor:access.actor,projectId:id,input,requestId}),201);
});
