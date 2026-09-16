import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {generateWorkSetup} from '@/lib/bloomops/work-setup-generation.mjs';
import {workSetupAccess,workSetupResponse} from '@/lib/bloomops/work-setup-api.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{const {access,actor,response}=await workSetupAccess(req);if(response)return response;return workSetupResponse(actor,await generateWorkSetup(access.db,actor,await readStructuredBody(req)));});
