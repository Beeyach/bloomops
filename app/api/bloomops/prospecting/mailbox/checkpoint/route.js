import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {saveProspectMonitoringCheckpoint} from '@/lib/bloomops/prospect-mailbox-review.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const input=await readStructuredBody(req,{maxBytes:4096});const result=await saveProspectMonitoringCheckpoint(access.db,access.actor,access.env,access.session.id,input);return result===null?notFound():json(result,result.conflict?409:result.unavailable?503:200);});
