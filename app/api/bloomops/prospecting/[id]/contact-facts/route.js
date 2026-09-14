import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {recordProspectContactFact} from '@/lib/bloomops/prospect-contact-facts.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const POST=withApiErrors(async(req,{params})=>{const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;const r=await recordProspectContactFact(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:4096}));return r?json(r,r.invalid?400:r.conflict?409:200):notFound();});
