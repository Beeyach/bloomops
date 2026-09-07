import { activationResponse } from '../../_activation.mjs';
export const dynamic = 'force-dynamic';
export async function POST(req, { params }) {
  return activationResponse(req, params, true);
}
