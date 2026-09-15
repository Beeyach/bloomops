import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {onboardingSetup,installOnboardingDefaults} from '@/lib/bloomops/onboarding-setup.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await requireAccess(req);if(response)return response;if(new URL(req.url).search)return json({error:'Unsupported query.'},400);const result=await onboardingSetup(access.db,await getActor(access));return result.ok?json(result):notFound();});
export const POST=withApiErrors(async req=>{const {access,response}=await requireAccess(req);if(response)return response;const result=await installOnboardingDefaults(access.db,await getActor(access),await readStructuredBody(req));return result.reason==='not_found'?notFound():json(result,result.ok?200:400);});
