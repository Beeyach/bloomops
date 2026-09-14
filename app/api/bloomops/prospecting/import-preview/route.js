import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {IMPORT_FILE_LIMIT} from '@/lib/bloomops/prospect-import-values.mjs';
import {previewProspectImport} from '@/lib/bloomops/prospect-import-preview.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;
 const result=await previewProspectImport(access.db,access.actor,await readStructuredBody(req,{maxBytes:IMPORT_FILE_LIMIT}));
 return result===null?notFound():json(result,result.invalid?400:result.unavailable?503:200);
});
