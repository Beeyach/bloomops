import { requireAuthorized, json, notFound } from '@/lib/bloomops/access.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { readStructuredBody } from '@/lib/bloomops/structured-body.mjs';
import { readClientCreationRecovery } from '@/lib/bloomops/client-creation.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async req => {
  const { access, response } = await requireAuthorized(req, { action: 'client.create' });
  if (response) return response;
  const result = await readClientCreationRecovery(access.db, access.actor, await readStructuredBody(req, { maxBytes: 3000 }));
  if (result.status === 404) return notFound();
  return result.status === 200 ? json(result) : json({ error: result.status === 403
    ? 'Your account or workspace changed. Reload this page.' : 'This recovery request could not be checked.' }, result.status);
});
