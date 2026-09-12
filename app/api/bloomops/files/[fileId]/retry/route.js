import { adsFileRetryAccess } from '@/lib/bloomops/content-file-api.mjs';
import { retryContentFile } from '@/lib/bloomops/content-files.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { fileAccess, fileResponse, readFileUpload } from '@/lib/bloomops/file-api.mjs';
import { retryFile } from '@/lib/bloomops/files.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { fileId } = await context.params;
  let resolved = await fileAccess(req, fileId, 'file.manage');
  if (resolved.response?.status === 404) resolved = await adsFileRetryAccess(req,fileId);
  const {access,response}=resolved;
  if (response) return response;
  const parsed = await readFileUpload(req, { retry: true });
  if (parsed.response) return parsed.response;
  const options={bucket:access.env.FILES,actor:access.actor,fileId,...parsed};
  return fileResponse(await (access.resource.type==='ads_content'?retryContentFile(access.db,{...options,contentId:access.resource.id}):retryFile(access.db,options)));
});
