import {requireAuthorized, json, notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {getPageWork} from '@/lib/bloomops/page-work.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, {params}) => {
  const {access, response} = await requireAuthorized(req, {action: 'pages.shared'});
  if (response) return response;
  const query = new URL(req.url).searchParams;
  if ([...query.keys()].some(key => query.getAll(key).length !== 1)) return json({error: 'Choose a valid Work view.'}, 400);
  const result = await getPageWork(access.db, access.actor, (await params).id, Object.fromEntries(query));
  return result.reason === 'not_found' ? notFound() : json(result, result.ok ? 200 : 400);
});
