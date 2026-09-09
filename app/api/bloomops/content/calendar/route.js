import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json,requireAuthorized } from '@/lib/bloomops/access.mjs';
import { workQueryAccess } from '@/lib/bloomops/work-api-input.mjs';
import { contentResponse } from '@/lib/bloomops/content-api.mjs';
import { contentCalendar,CONTENT_CALENDAR_QUERY_FIELDS } from '@/lib/bloomops/content-calendar.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
  const {access,response}=await workQueryAccess(req,requireAuthorized(req,{action:'content.calendar'}),CONTENT_CALENDAR_QUERY_FIELDS);if(response)return response;
  const result=await contentCalendar(access.db,access.actor,Object.fromEntries(new URL(req.url).searchParams));
  return result.ok?json(result):contentResponse(result);
});
