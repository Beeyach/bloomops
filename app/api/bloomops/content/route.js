import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { contentListAccess, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { listContent } from '@/lib/bloomops/content.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async req => {
  const {access,response}=await contentListAccess(req); if(response)return response;
  return contentResponse(await listContent(access.db,access.actor,Object.fromEntries(new URL(req.url).searchParams)));
});
