import { NextResponse } from 'next/server';
import { requireClient } from './_shared.mjs';
import { activateClient } from '@/lib/bloomops/client-activation.mjs';
import { createMailer } from '@/lib/bloomops/mail.mjs';
import { resolveAppUrl } from '@/lib/bloomops/auth-config.mjs';

const messages = {
  not_draft: 'Only a draft client can be activated for the first time.',
  primary_contact_required: 'Choose a primary contact on the Overview tab.',
  primary_email_required: 'Add a valid email address for the primary contact.',
  services_required: 'Add the client’s purchased services before activating.',
  too_many_services: 'This client has more services than activation currently supports.',
  missing_published_template:
    'An onboarding template is missing. Ask an administrator to check the published templates.',
  invalid_definition:
    'An onboarding template needs attention before activation. Ask an administrator to check it.',
  definition_conflict:
    'The selected onboarding templates contain conflicting requirements. Ask an administrator to check them.',
  existing_open_instance:
    'This client already has onboarding that was created separately. Ask an administrator to review it.',
  not_activated: 'Activate the client before retrying their invitation.',
};
export async function activationResponse(req, params, retryOnly = false) {
  const { id } = await params;
  const { access, response } = await requireClient(req, id, 'client.activate');
  if (response) return response;
  try {
    // Defer transport setup until send: a missing mail configuration must
    // produce a recoverable delivery warning after the core commits.
    const mailer = { send: (message) => createMailer(access.env).send(message) };
    const result = await activateClient(access.db, {
      actor: access.actor,
      clientId: String(id),
      retryOnly,
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
            messages[result.reason] ||
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
