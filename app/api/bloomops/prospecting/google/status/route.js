import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {getProspectGoogle} from '@/lib/bloomops/prospect-google.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const result=await getProspectGoogle(access.db,access.actor,access.env);if(!result)return notFound();const {memberUpdatedAt,...view}=result;return json(view);});
