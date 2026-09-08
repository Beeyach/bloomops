import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { activationResponse } from '../../_activation.mjs';
export const dynamic = 'force-dynamic';
async function handlePOST(req, { params }) {
  return activationResponse(req, params, true);
}

export const POST = withApiErrors(handlePOST);
