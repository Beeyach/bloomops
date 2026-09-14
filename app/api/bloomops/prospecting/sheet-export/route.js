import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {exportSheetSelection} from '@/lib/bloomops/prospect-sheet-export.mjs';
import {prospectAccess} from '../_shared.mjs';
export const POST=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;const r=await exportSheetSelection(access.db,access.actor,await readStructuredBody(req));return r?json(r,r.invalid?400:r.conflict?409:200):notFound();});
