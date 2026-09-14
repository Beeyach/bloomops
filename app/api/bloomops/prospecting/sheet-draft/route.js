import {json} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {readSheetDraftRecords} from '@/lib/bloomops/sheet-draft-access.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
// Read-only validation; no draft contents are sent to or stored by this endpoint.
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;
 const result=await readSheetDraftRecords(access.db,access.actor,await readStructuredBody(req));
 return result.status===200?json(result):json({error:result.status===400?'Choose a supported draft.':'This draft cannot be opened with the current record access.'},result.status);
});
