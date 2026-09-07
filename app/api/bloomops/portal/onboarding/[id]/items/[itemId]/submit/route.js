import { onboardingResponse } from '@/lib/bloomops/onboarding-api.mjs';
export const dynamic = 'force-dynamic';
export async function POST(req, { params }) { return onboardingResponse(req, params, { portal: true, mutate: true }); }
