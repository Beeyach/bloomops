import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {json} from '@/lib/bloomops/access.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getWorkSetup,setWorkSetupActive} from '@/lib/bloomops/work-setups.mjs';
import {workSetupAccess,workSetupResponse} from '@/lib/bloomops/work-setup-api.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,actor,response}=await workSetupAccess(req);if(response)return response;if(new URL(req.url).search)return json({error:'Unsupported query.'},400);const setup=await getWorkSetup(access.db,actor,(await params).id);return workSetupResponse(actor,setup?{ok:true,setup}:null);});
export const PATCH=withApiErrors(async(req,{params})=>{const {access,actor,response}=await workSetupAccess(req);if(response)return response;return workSetupResponse(actor,await setWorkSetupActive(access.db,actor,(await params).id,await readStructuredBody(req)));});
