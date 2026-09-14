import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { getActor, json, requireAccess } from '@/lib/bloomops/access.mjs';
import { createClientPreview } from '@/lib/bloomops/client-preview.mjs';
import { downloadFile } from '@/lib/bloomops/files.mjs';
import { downloadContentFile } from '@/lib/bloomops/content-files.mjs';
import { fileDisposition } from '@/lib/bloomops/file-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { access, response } = await requireAccess(req);if(response)return response;
  const { clientId, contactId, path=[] } = await context.params;
  if(path.length && (path.length!==2 || path[0]!=='files'))return json({error:'Not found.'},404);
  const preview = await createClientPreview(access.db,await getActor(access),clientId,contactId);
  if(!preview)return json({error:'Not found.'},404);
  if(!path.length)return json({ok:true});
  const options={bucket:access.env.FILES,actor:preview.actor,fileId:path[1]};
  const file=await downloadFile(access.db,options)||await downloadContentFile(access.db,options);
  if(!file)return json({error:'Not found.'},404);
  return new Response(file.body,{headers:{'content-type':file.mimeType,'content-length':String(file.byteSize),'content-disposition':fileDisposition(file.filename),
    'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'cross-origin-resource-policy':'same-origin'}});
});
