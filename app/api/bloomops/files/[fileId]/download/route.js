import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { getActor, json, requireAccess } from '@/lib/bloomops/access.mjs';
import { downloadFile } from '@/lib/bloomops/files.mjs';
import { downloadContentFile } from '@/lib/bloomops/content-files.mjs';
import { fileDisposition } from '@/lib/bloomops/file-values.mjs';
import { workQueryAccess } from '@/lib/bloomops/work-api-input.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { access, response } = await requireAccess(req);
  if (response) return response;
  const options = { bucket: access.env.FILES, actor: await getActor(access), fileId: (await context.params).fileId };
  const file = await downloadFile(access.db, options) || await downloadContentFile(access.db, options);
  if (!file) return json({ error: 'Not found.' }, 404);
  const query = await workQueryAccess(req, { access });
  if (query.response) {
    try { await file.body.cancel(); } catch {}
    return query.response;
  }
  return new Response(file.body, { headers: { 'content-type': file.mimeType, 'content-length': String(file.byteSize),
    'content-disposition': fileDisposition(file.filename), 'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox", 'cross-origin-resource-policy': 'same-origin' } });
});
