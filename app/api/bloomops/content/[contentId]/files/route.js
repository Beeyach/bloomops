import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { contentFilesAccess, readContentFileUpload } from '@/lib/bloomops/content-file-api.mjs';
import { fileResponse } from '@/lib/bloomops/file-api.mjs';
import { listContentFiles, uploadContentFile } from '@/lib/bloomops/content-files.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { contentId } = await context.params;
  const { access, response } = await contentFilesAccess(req, contentId);
  return response || json(await listContentFiles(access.db, access.actor, contentId));
});
export const POST = withApiErrors(async (req, context) => {
  const { contentId } = await context.params;
  const { access, response } = await contentFilesAccess(req, contentId, { upload: true });
  if (response) return response;
  const parsed = await readContentFileUpload(req);
  if (parsed.response) return parsed.response;
  return fileResponse(await uploadContentFile(access.db, { actor: access.actor, bucket: access.env.FILES, contentId, ...parsed }), 201);
});
