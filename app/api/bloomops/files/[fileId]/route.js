import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { deliverableBody } from '@/lib/bloomops/deliverable-api.mjs';
import { fileAccess, fileResponse } from '@/lib/bloomops/file-api.mjs';
import { changeFile, getFile } from '@/lib/bloomops/files.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { fileId } = await context.params;
  const { access, response } = await fileAccess(req, fileId);
  if (response) return response;
  const file = await getFile(access.db, access.actor, fileId);
  return file ? json({ file }) : json({ error: 'Not found.' }, 404);
});
export const PATCH = withApiErrors(async (req, context) => {
  const { fileId } = await context.params;
  const { access, response } = await fileAccess(req, fileId, 'file.manage');
  if (response) return response;
  const parsed = await deliverableBody(req, ['operation', 'visibility', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  if (parsed.body.operation === 'archive' && Object.hasOwn(parsed.body, 'visibility')) return json({ error: 'Choose one change at a time.' }, 400);
  return fileResponse(await changeFile(access.db, { bucket: access.env.FILES, actor: access.actor, fileId, ...parsed.body }));
});
