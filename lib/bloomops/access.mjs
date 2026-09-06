// Request-level access for BloomOps: identity, then membership, on every
// protected request.
//
//   const { access, response } = await requireAccess(req);
//   if (response) return response;         // 401 or 403, already built
//   access.user, access.workspace, access.membership
//
// Order of checks, matching docs/DOMAIN_MODEL.md: authenticated identity,
// then an ACTIVE membership in an ACTIVE workspace. Everything else (roles,
// assignments, visibility, capabilities) is A4's engine; A3 exposes only the
// one coarse permission it needs, managing members.
//
// Nothing is cached between requests. A suspended or removed membership is
// refused on the very next request, whatever the state of the identity
// cookie, and an identity with no membership is refused the same way.

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { bloomOpsDb } from './db.mjs';
import { getAuth, getIdentity } from './auth.mjs';
import { isAuthConfigurationError, isLoopbackHost, resolveAppUrl, trustedOrigins } from './auth-config.mjs';
import { canManageMembers, resolveWorkspaceAccess } from './membership.mjs';

// A plain Response, which Next.js route handlers accept as-is. Keeping
// next/server out of this module lets the tests import it without Next.
export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function currentEnv() {
  try {
    const { env } = getCloudflareContext();
    if (env) return env;
  } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

// Accepts a Request, a Headers, or Next's read-only headers() object. The
// last is not a Headers instance (it is an adapter with get/forEach), so it
// is copied entry by entry; passing it to `new Headers()` yields nothing.
function headersOf(source) {
  if (!source) return new Headers();
  const raw = source instanceof Headers ? source : (source.headers ?? source);
  if (raw instanceof Headers) return raw;
  if (raw && typeof raw.get === 'function') {
    const copy = new Headers();
    if (typeof raw.forEach === 'function') {
      raw.forEach((value, key) => copy.append(key, value));
    } else {
      for (const key of ['cookie', 'host', 'x-forwarded-proto', 'origin']) {
        const value = raw.get(key);
        if (value) copy.set(key, value);
      }
    }
    return copy;
  }
  return new Headers(raw);
}

// Server components hand over headers, not a request. The host header only
// matters in local development, where the loopback origin picks the Better
// Auth base URL; deployed environments ignore it (see resolveAppUrl).
function urlFromHeaders(headers) {
  const host = headers.get('host');
  if (!host) return null;
  // A loopback host is served over plain http locally, whatever
  // x-forwarded-proto says on the server-component path (it says https
  // there); trusting it would pick the __Secure- cookie name and miss the
  // session that the verify request set under the plain name.
  const hostname = host.replace(/:\d+$/, '');
  const proto = isLoopbackHost(hostname) ? 'http' : headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}/`;
}

// Everything a request may act as. `membership` and `workspace` are null
// for an identity that has no active membership anywhere.
export async function getAccess(source, { env = null, url = null } = {}) {
  const environment = env || currentEnv();
  const headers = headersOf(source);
  const requestUrl = url || source?.url || urlFromHeaders(headers);
  const auth = getAuth({ env: environment, requestUrl });
  const identity = await getIdentity(auth, headers);
  if (!identity) return null;
  const db = bloomOpsDb(environment.DB);
  const resolved = await resolveWorkspaceAccess(db, identity.user.id);
  return {
    user: identity.user,
    session: identity.session,
    workspace: resolved?.workspace || null,
    membership: resolved?.membership || null,
    env: environment,
    db,
  };
}

export function unauthenticated() {
  return json({ error: 'Sign in to continue.' }, 401);
}

export function noWorkspace() {
  return json({ error: 'This account has no active workspace access.' }, 403);
}

export function forbidden(message = 'You do not have permission to do that.') {
  return json({ error: message }, 403);
}

export const NOT_CONFIGURED_MESSAGE = 'Authentication is not configured on this deployment.';

export function notConfigured() {
  return json({ error: NOT_CONFIGURED_MESSAGE }, 503);
}

// For server components: the access, or `{ configured: false }` when the
// deployment cannot authenticate anybody yet. Every other error propagates.
export async function getAccessOrProblem(source, options = {}) {
  try {
    return { access: await getAccess(source, options), configured: true };
  } catch (err) {
    if (isAuthConfigurationError(err)) return { access: null, configured: false };
    throw err;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Same-site protection for BloomOps' own state-changing routes: when a
// browser sends an Origin header it must be one of ours. The session cookie
// is SameSite=Lax, so this is a second fence, not the only one.
export function originAllowed(req, env) {
  if (!req || SAFE_METHODS.has(String(req.method || 'GET').toUpperCase())) return true;
  const origin = req.headers?.get?.('origin');
  if (!origin) return true;
  try {
    const appUrl = resolveAppUrl(env, req.url);
    return trustedOrigins(env, appUrl).includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

// Identity is enough: used only where a signed-in person is acting on
// their own standing, such as accepting an invitation.
export async function requireIdentity(req, { env = null } = {}) {
  const { access, configured } = await getAccessOrProblem(req, { env });
  if (!configured) return { response: notConfigured() };
  if (!access) return { response: unauthenticated() };
  if (!originAllowed(req, access.env)) return { response: forbidden('Cross-site request refused.') };
  return { access };
}

// Identity plus an active workspace membership. `manageMembers` adds the
// one A3 permission on top.
export async function requireAccess(req, { manageMembers = false, env = null } = {}) {
  const { access, configured } = await getAccessOrProblem(req, { env });
  if (!configured) return { response: notConfigured() };
  if (!access) return { response: unauthenticated() };
  if (!access.membership || !access.workspace) return { response: noWorkspace() };
  if (!originAllowed(req, access.env)) return { response: forbidden('Cross-site request refused.') };
  if (manageMembers && !canManageMembers(access.membership)) return { response: forbidden('Only an Owner or Admin can manage members.') };
  return { access };
}
