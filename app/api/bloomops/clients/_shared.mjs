// What every A6 client route needs: the internal-visibility resource
// loader, one place that turns a domain refusal into an HTTP answer, and a
// body reader that never trusts what it is given.
import { NextResponse } from 'next/server';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { loadInternalClientResource, loadInternalServiceResource } from '@/lib/bloomops/authorization.mjs';
import { getClient } from '@/lib/bloomops/clients.mjs';
import { findServiceEngagement } from '@/lib/bloomops/services.mjs';

// Authorise one action against one client, seen as an internal record.
//
// The internal descriptor is what keeps a Client membership out of these
// routes. A Client may legitimately be shown a projection of their own
// client in the portal, so the generic descriptor is client-visible; the
// internal Clients area is health, the owner, the contact directory,
// operational history, and the controls over all of it, so A6 asks about
// an `internal` record and the engine refuses a Client on visibility. It
// answers 404, the same answer another workspace's client and a client
// that does not exist both get.
export async function requireClient(req, id, action = 'client.manage') {
  const { access, response } = await requireAuthorized(req, {
    action,
    resource: (a) => loadInternalClientResource(a.db, a.workspace.id, id),
  });
  if (response) return { response };
  const client = await getClient(access.db, access.actor, String(id));
  // The engine already said this actor reaches the record; a null here
  // would mean it vanished between the two reads. Answer as absent.
  if (!client) return { response: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  return { access, client };
}

// Authorise one action against one service engagement of one client, seen
// as an internal record (A7).
//
// The route names both ids, and both are part of the lookup rather than a
// comparison afterwards, so an engagement that belongs to a different
// client of the same workspace answers exactly as one in another workspace
// and one that never existed: 404, with the same body.
//
// The descriptor is internal for the same reason the client one is. A
// portal contact may one day be shown a projection of a service their own
// client bought, so the generic descriptor is client-visible; the package,
// the scope notes, the lifecycle, and the internal team are not that, so
// these routes ask about an `internal` record and the engine refuses a
// Client on visibility.
export async function requireService(req, clientId, serviceId, action = 'service.manage') {
  const { access, response } = await requireAuthorized(req, {
    action,
    resource: (a) => loadInternalServiceResource(a.db, a.workspace.id, serviceId, { clientId: String(clientId) }),
  });
  if (response) return { response };
  const service = await findServiceEngagement(access.db, access.workspace.id, String(clientId), String(serviceId));
  if (!service) return { response: NextResponse.json({ error: 'Not found.' }, { status: 404 }) };
  return { access, service };
}

// A JSON object body, or null. An array, a string, or a number is not a
// body this API accepts.
export async function readBody(req) {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// Only the keys a route names are read from a body, so nothing a caller
// invents reaches the domain layer: not workspaceId, not a client id when
// the route already names one, not an actor id, and above all not
// client_contacts.user_id, whose lifecycle is A9/A10's.
export function pick(body, keys) {
  const out = {};
  if (!body) return out;
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

const STATUS_BY_REASON = {
  invited_contact: 409,
  invalid: 400,
  status_not_editable: 400,
  service_type_not_editable: 400,
  duplicate_email: 409,
  duplicate_service: 409,
  slug_conflict: 409,
  conflict: 409,
  linked: 409,
};

const MESSAGE_BY_REASON = {
  invited_contact: 'This contact is part of client activation and cannot be removed here.',
  invalid: 'Some of what you entered needs a change.',
  status_not_editable: 'The client’s status is set by activation, not by editing.',
  service_type_not_editable: 'A service engagement keeps the service it was bought for.',
  duplicate_email: 'Another contact for this client already uses that address.',
  // Never the database's own words. The per-field message that comes with
  // this names the service and says what to do about it.
  duplicate_service: 'That service is already running for this client.',
  // A write that lost a race twice over. Nothing was written; the caller is
  // told to try again rather than shown a constraint message.
  conflict: 'That could not be saved just now. Try again.',
  slug_conflict: 'That could not be saved just now. Try again.',
  linked: 'This contact can sign in to the client portal, so they cannot be removed here.',
};

// A domain refusal as a response. `errors` is per field, for the form that
// sent it; nothing about the engine's reasoning, another workspace, or the
// database goes out.
//
// A domain not-found answers with exactly the body the engine's own 404
// carries, down to the absent `reason`. A contact id that belongs to
// another client and a client the caller may not see must be one answer,
// or the difference between them is the leak.
export function domainProblem(result) {
  if (result.reason === 'not_found') return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const status = STATUS_BY_REASON[result.reason] || 400;
  return NextResponse.json(
    { error: MESSAGE_BY_REASON[result.reason] || 'That could not be saved.', reason: result.reason, errors: result.errors || undefined },
    { status },
  );
}
