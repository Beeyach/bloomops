import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { fileAccess, fileResponse, readFileUpload } from '@/lib/bloomops/file-api.mjs';
import { retryFile } from '@/lib/bloomops/files.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { fileId } = await context.params;
  const { access, response } = await fileAccess(req, fileId, 'file.manage');
  if (response) return response;
  const parsed = await readFileUpload(req, { retry: true });
  if (parsed.response) return parsed.response;
  return fileResponse(await retryFile(access.db, { bucket: access.env.FILES, actor: access.actor, fileId, ...parsed }));
});
