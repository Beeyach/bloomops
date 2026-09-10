import { json } from '@/lib/bloomops/access.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { portalContentListAccess } from '@/lib/bloomops/portal-content-api.mjs';
import { portalContent } from '@/lib/bloomops/portal-content.mjs';
import { contentResponse } from '@/lib/bloomops/content-api.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async req => {
  const { access, response } = await portalContentListAccess(req);
  if (response) return response;
  const result = await portalContent(access.db, access.actor, Object.fromEntries(new URL(req.url).searchParams));
  return result.ok ? json(result) : contentResponse(result);
});
