// Authentication configuration for BloomOps, resolved from the environment.
//
// Everything Better Auth needs to know about where it runs comes from here:
// the public origin of the app, which origins may be redirected to, the
// signing secret, session and magic-link lifetimes, and how mail leaves the
// Worker. Nothing here reads a request Host header outside local
// development, so a deployed environment can only ever mint links to, and
// redirect to, the origin it was configured with.
//
// Environment variables (wrangler vars for public values, wrangler secrets
// for private ones, `.dev.vars` locally):
//   BLOOMOPS_ENV              development | staging | production
//   BLOOMOPS_APP_URL          public https origin of this deployment
//   BLOOMOPS_TRUSTED_ORIGINS  optional comma-separated extra origins
//   BLOOMOPS_AUTH_SECRET      secret, 32+ random characters
//   BLOOMOPS_RESEND_API_KEY   secret, Resend API key
//   BLOOMOPS_MAIL_FROM        sender, for example "BloomOps <team@example.com>"
//   BLOOMOPS_MAIL_TRANSPORT   resend (default when a key exists) | r2-dev | none

export const AUTH_COOKIE_PREFIX = 'bloomops';
export const AUTH_BASE_PATH = '/api/auth';
export const SESSION_COOKIE_NAMES = [`__Secure-${AUTH_COOKIE_PREFIX}.session_token`, `${AUTH_COOKIE_PREFIX}.session_token`];

// A session lives 30 days and is extended once a day while in use. Long
// enough that a client is not asked to sign in every week, short enough that
// a lost device stops working within a month.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

// Magic links expire after 15 minutes. Better Auth's default is 5, which is
// tight for a client opening mail on a phone; a link is single-use anyway.
export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export const DEFAULT_DEV_APP_URL = 'http://localhost:3000';

// Thrown when a deployed environment lacks what authentication needs. Pages
// and routes recognise it and answer "not configured" instead of failing.
export class AuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthConfigurationError';
  }
}

export function isAuthConfigurationError(err) {
  return Boolean(err) && (err instanceof AuthConfigurationError || err.name === 'AuthConfigurationError');
}
export const DEFAULT_MAIL_FROM = 'Bloomsi <onboarding@resend.dev>';
export const MAIL_TRANSPORTS = ['resend', 'r2-dev', 'none'];

// Only "development" is development. An unset BLOOMOPS_ENV is treated as a
// deployed environment so a missing var never relaxes anything.
export function environmentName(env = {}) {
  return String(env.BLOOMOPS_ENV || '').trim() || 'unknown';
}

export function isDevelopment(env = {}) {
  return environmentName(env) === 'development';
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname || '').toLowerCase());
}

function originOf(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

// The origin this deployment answers on, and therefore the only origin magic
// links point at. Deployed environments must configure it and must use
// https. In development the request's own loopback origin wins, so `next dev`
// on :3000 and `npm run preview` on :8787 both work without editing config;
// any non-loopback host in development still falls back to configuration.
export function resolveAppUrl(env = {}, requestUrl = null) {
  const configured = originOf(env.BLOOMOPS_APP_URL);
  if (isDevelopment(env)) {
    if (requestUrl) {
      try {
        const url = new URL(requestUrl);
        if (LOOPBACK_HOSTS.has(url.hostname)) return url.origin;
      } catch {}
    }
    return configured || DEFAULT_DEV_APP_URL;
  }
  if (!configured) {
    throw new AuthConfigurationError('BLOOMOPS_APP_URL is not configured for this environment. Authentication is disabled until it is.');
  }
  if (!configured.startsWith('https://')) {
    throw new AuthConfigurationError('BLOOMOPS_APP_URL must be an https origin outside development.');
  }
  return configured;
}

// Where Better Auth may redirect after sign-in: the app origin plus any
// explicitly listed extras. Relative paths are always allowed by Better Auth
// itself (it checks them for safety); nothing else is.
export function trustedOrigins(env = {}, appUrl) {
  const extras = String(env.BLOOMOPS_TRUSTED_ORIGINS || '')
    .split(',')
    .map((s) => originOf(s.trim()))
    .filter(Boolean);
  const origins = [appUrl, ...extras];
  // Locally, wrangler answers as localhost while a browser or script may
  // have typed 127.0.0.1 (or the other way round). Both are the same
  // machine, so in development the loopback siblings on the same port are
  // trusted too. Deployed environments never get this.
  if (isDevelopment(env)) {
    try {
      const url = new URL(appUrl);
      if (LOOPBACK_HOSTS.has(url.hostname)) {
        for (const host of ['localhost', '127.0.0.1', '[::1]']) origins.push(`${url.protocol}//${host}${url.port ? `:${url.port}` : ''}`);
      }
    } catch {}
  }
  return [...new Set(origins)];
}

const DEV_SECRET = 'bloomops-development-only-secret-do-not-deploy-0123456789';

// The Better Auth signing secret. Deployed environments fail closed without
// it: no cookie can be signed or verified, so nobody is signed in rather
// than everybody. Development falls back to a fixed value that a deployed
// environment can never use, because deployed environments never take it.
export function authSecret(env = {}) {
  const secret = String(env.BLOOMOPS_AUTH_SECRET || '').trim();
  if (secret === DEV_SECRET && !isDevelopment(env)) {
    throw new AuthConfigurationError('BLOOMOPS_AUTH_SECRET is the development fallback. Set a real secret for this environment.');
  }
  if (secret.length >= 32) return secret;
  if (secret) throw new AuthConfigurationError('BLOOMOPS_AUTH_SECRET must be at least 32 characters.');
  if (isDevelopment(env)) return DEV_SECRET;
  throw new AuthConfigurationError('BLOOMOPS_AUTH_SECRET is not configured for this environment. Authentication is disabled until it is.');
}

export function mailConfig(env = {}) {
  const apiKey = String(env.BLOOMOPS_RESEND_API_KEY || '').trim();
  let transport = String(env.BLOOMOPS_MAIL_TRANSPORT || '').trim();
  if (!transport) transport = apiKey ? 'resend' : 'none';
  if (!MAIL_TRANSPORTS.includes(transport)) {
    throw new Error(`BLOOMOPS_MAIL_TRANSPORT must be one of ${MAIL_TRANSPORTS.join(', ')}.`);
  }
  if (transport === 'r2-dev' && !isDevelopment(env)) {
    throw new Error('The r2-dev mail transport is only allowed when BLOOMOPS_ENV is development.');
  }
  const from = String(env.BLOOMOPS_MAIL_FROM || '').trim() || DEFAULT_MAIL_FROM;
  // Resend named but no key yet: the deployment is not ready to send, which
  // sign-in reports as 503 and the health probe as mail "none". A crash here
  // would take identity and sessions down with it, which is worse.
  if (transport === 'resend' && !apiKey) return { transport: 'none', apiKey: '', from, missingKey: true };
  return { transport, apiKey, from };
}

// Booleans and names only, for the public health probe. Never a value.
export function authStatus(env = {}) {
  const status = { configured: false, mail: 'none' };
  try {
    resolveAppUrl(env);
    authSecret(env);
    status.configured = true;
  } catch {}
  try {
    status.mail = mailConfig(env).transport;
  } catch {
    status.mail = 'invalid';
  }
  return status;
}
