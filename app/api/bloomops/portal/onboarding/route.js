import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { portalOnboardingResponse } from '@/lib/bloomops/onboarding-api.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(portalOnboardingResponse);
