import { json, notFound } from '@/lib/bloomops/access.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { portalContentAccess } from '@/lib/bloomops/portal-content-api.mjs';
import { getPortalContent } from '@/lib/bloomops/portal-content.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, { params }) => {
  const { contentId } = await params, { access, response } = await portalContentAccess(req, contentId);
  if (response) return response;
  const item = await getPortalContent(access.db, access.actor, contentId);
  return item ? json({ item }) : notFound();
});
