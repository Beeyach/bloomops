import { NextResponse } from 'next/server';
import { requireClient, readBody } from './_shared.mjs';
import { activateClient } from '@/lib/bloomops/client-activation.mjs';
import { createMailer } from '@/lib/bloomops/mail.mjs';
import { resolveAppUrl } from '@/lib/bloomops/auth-config.mjs';

export const activationMessages = {
  not_draft: 'Only a draft client can be activated for the first time.',
  primary_contact_required: 'Choose a primary contact on the Overview tab.',
  primary_email_required: 'Add a valid email address for the primary contact.',
  services_required: 'Add the client’s purchased services before activating.',
  too_many_services: 'This client has more services than activation currently supports.',
  missing_published_template:
    'Required onboarding instructions are not published yet. Review onboarding setup before activation.',
  invalid_definition:
    'The published onboarding instructions need repair before activation.',
  definition_conflict:
    'The selected onboarding templates contain conflicting requirements. Review their instructions before activation.',
  existing_open_instance:
    'This client already has onboarding that was created separately. Ask an administrator to review it.',
  not_activated: 'Activate the client before retrying their invitation.',
};
export async function activationResponse(req, params, retryOnly = false) {
  const { id } = await params;
  const { access, response } = await requireClient(req, id, 'client.activate');
  if (response) return response;
  try {
    const input = req.headers.get('content-type')?.includes('application/json') ? await readBody(req) : {};
    // Legacy callers have always derived all scope on the server and ignored
    // body identity. A reviewed UI confirmation additionally binds its scope.
    if (input.reviewHash!==undefined && (typeof input.reviewHash!=='string'||!/^[a-f0-9]{64}$/.test(input.reviewHash)||input.workspaceId!==access.actor.workspaceId||input.userId!==access.actor.userId))
      return NextResponse.json({error:'The activation scope changed. Reload and review it again.'},{status:409});
    // Defer transport setup until send: a missing mail configuration must
    // produce a recoverable delivery warning after the core commits.
    const mailer = { send: (message) => createMailer(access.env).send(message) };
    const result = await activateClient(access.db, {
      actor: access.actor,
      clientId: String(id),
      retryOnly,
      expectedReadinessHash: input.reviewHash || null,
      mailer,
      appUrl: resolveAppUrl(access.env, req.url),
      workspaceName: access.workspace.name,
      inviterName: access.user.name,
    });
    if (!result.ok) {
      if (result.reason === 'not_found') return NextResponse.json({ error: 'Not found.' }, { status: 404 });
      if (result.reason === 'forbidden') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      return NextResponse.json(
        {
          error:
            activationMessages[result.reason] ||
            'The client changed while activation was being prepared. Reload and try again.',
          reason: result.reason,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      {
        error:
          'Activation could not be confirmed. Reload and try again; any completed activation will be preserved.',
      },
      { status: 503 },
    );
  }
}
