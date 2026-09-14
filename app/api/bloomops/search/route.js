import {getActor,json,requireAccess} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {searchRecords} from '@/lib/bloomops/search.mjs';
export const dynamic='force-dynamic';
// Read-only POST keeps search terms out of URLs, history and URL-based caches.
export const POST=withApiErrors(async req=>{
  const {access,response}=await requireAccess(req);if(response)return response;
  const result=await searchRecords(access.db,await getActor(access),await readStructuredBody(req,{maxBytes:3000}));
  return result.status===200?json(result):json({error:result.status===400?'Enter 2–120 characters and choose a supported record type.':'Your account or workspace access changed. Reload to continue.'},result.status);
});
