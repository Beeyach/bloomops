import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { contentFilesAccess, readContentFileUpload } from '@/lib/bloomops/content-file-api.mjs';
import { fileResponse } from '@/lib/bloomops/file-api.mjs';
import { retryContentFile } from '@/lib/bloomops/content-files.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { contentId, fileId } = await context.params;
  const { access, response } = await contentFilesAccess(req, contentId, { fileId, portal: true, upload: true });
  if (response) return response;
  const parsed = await readContentFileUpload(req, { portal: true, retry: true });
  if (parsed.response) return parsed.response;
  return fileResponse(await retryContentFile(access.db, { actor: access.actor, bucket: access.env.FILES, contentId, fileId, portal: true, ...parsed }));
});
