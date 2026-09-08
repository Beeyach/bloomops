import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { fileResponse, readFileUpload } from '@/lib/bloomops/file-api.mjs';
import { listFiles, uploadFile } from '@/lib/bloomops/files.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'file.view');
  return response || json(await listFiles(access.db, access.actor, id));
});
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'file.manage');
  if (response) return response;
  const parsed = await readFileUpload(req);
  if (parsed.response) return parsed.response;
  return fileResponse(await uploadFile(access.db, { bucket: access.env.FILES, actor: access.actor, projectId: id, ...parsed }), 201);
});
