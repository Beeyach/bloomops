import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { deliverableBody } from '@/lib/bloomops/deliverable-api.mjs';
import { contentFilesAccess } from '@/lib/bloomops/content-file-api.mjs';
import { fileResponse } from '@/lib/bloomops/file-api.mjs';
import { changeContentFile } from '@/lib/bloomops/content-files.mjs';
export const dynamic = 'force-dynamic';
export const PATCH = withApiErrors(async (req, context) => {
  const { contentId, fileId } = await context.params;
  const { access, response } = await contentFilesAccess(req, contentId, { fileId });
  if (response) return response;
  const parsed = await deliverableBody(req, ['operation', 'visibility', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  if (parsed.body.operation === 'archive' && Object.hasOwn(parsed.body, 'visibility')) return json({ error: 'Choose one change at a time.' }, 400);
  return fileResponse(await changeContentFile(access.db, { actor: access.actor, bucket: access.env.FILES, contentId, fileId, ...parsed.body }));
});
