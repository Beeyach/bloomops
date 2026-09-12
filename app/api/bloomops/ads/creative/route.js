import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { requireAuthorized, json } from '@/lib/bloomops/access.mjs';
import { workQueryAccess } from '@/lib/bloomops/work-api-input.mjs';
import { listAdsCreative, ADS_CREATIVE_QUERY_FIELDS } from '@/lib/bloomops/ads-creative.mjs';
import { contentResponse } from '@/lib/bloomops/content-api.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
  const {access,response}=await workQueryAccess(req,requireAuthorized(req,{action:'content.list'}),ADS_CREATIVE_QUERY_FIELDS);if(response)return response;
  const result=await listAdsCreative(access.db,access.actor,Object.fromEntries(new URL(req.url).searchParams));
  return result.ok?json(result):contentResponse(result);
});
