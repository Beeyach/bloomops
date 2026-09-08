import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { onboardingResponse } from '@/lib/bloomops/onboarding-api.mjs';
export const dynamic = 'force-dynamic';
async function handlePOST(req, { params }) { return onboardingResponse(req, params, { portal: true, mutate: true }); }

export const POST = withApiErrors(handlePOST);
