import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { onboardingResponse } from '@/lib/bloomops/onboarding-api.mjs';
export const dynamic = 'force-dynamic';
async function handleGET(req, { params }) { return onboardingResponse(req, params); }

export const GET = withApiErrors(handleGET);
