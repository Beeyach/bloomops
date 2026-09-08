import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { fileAccess } from '@/lib/bloomops/file-api.mjs';
import { getFile } from '@/lib/bloomops/files.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { fileId } = await context.params;
  const { access, response } = await fileAccess(req, fileId, 'file.view', { portal: true });
  if (response) return response;
  const file = await getFile(access.db, access.actor, fileId, { portal: true });
  return file ? json({ file }) : json({ error: 'Not found.' }, 404);
});
