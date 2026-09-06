// Better Auth for BloomOps: identity, sessions, and magic-link mechanics.
//
// Better Auth owns three things here: the `user` row, the `session` row and
// its signed cookie, and the one-time magic-link token in `verification`.
// It owns nothing about what a person may do. Workspace membership, role,
// state, and scope live in BloomOps tables and are checked on every request
// by lib/bloomops/access.mjs, so a valid identity session never bypasses
// membership.
//
// Two BloomOps rules are enforced inside Better Auth itself, with the
// mechanisms it documents for the purpose:
//
// 1. Requesting a magic link never reveals whether an address is known.
//    Better Auth answers `{ status: true }` for every well-formed address.
//    The `sendMagicLink` callback below only delivers the email when the
//    address belongs to an existing identity or a pending invitation;
//    otherwise it does nothing, and the caller cannot tell the difference.
//    A token for an unknown address is therefore never delivered anywhere.
//
// 2. Nobody gains an identity by asking for a link. Sign-up stays enabled
//    on the plugin so an invited person can create their identity on first
//    click, and the `user.create.before` database hook refuses to create a
//    user unless a pending, unexpired invitation exists for that address.
//    The plugin turns that refusal into an error redirect, never a session.
//
// Tokens are stored hashed (`storeToken: "hashed"`), consumed atomically on
// first verification, and expire after MAGIC_LINK_TTL_SECONDS. No token or
// link is ever logged from here.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { magicLink } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { bloomOpsDb, schema } from './db.mjs';
import {
  AUTH_BASE_PATH,
  AUTH_COOKIE_PREFIX,
  MAGIC_LINK_TTL_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  authSecret,
  resolveAppUrl,
  trustedOrigins,
} from './auth-config.mjs';
import { createMailer, magicLinkEmail } from './mail.mjs';
import { findUserByEmail, normalizeEmail } from './membership.mjs';
import { findPendingInvitationForEmail } from './invitations.mjs';

export const NOT_INVITED_CODE = 'NOT_INVITED';

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || '';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'New member';
}

// Build one Better Auth instance for one environment and app origin.
//   env     the Worker environment (bindings, vars, secrets)
//   db      Drizzle over that environment's D1 (defaults to env.DB)
//   mailer  lib/bloomops/mail.mjs mailer (defaults to createMailer(env))
//   now     clock, injectable for tests
export function createAuth({ env, db = null, mailer = null, requestUrl = null, now = () => new Date() }) {
  const appUrl = resolveAppUrl(env, requestUrl);
  const database = db || bloomOpsDb(env.DB);
  const mail = mailer || createMailer(env);
  const secure = appUrl.startsWith('https://');

  return betterAuth({
    appName: 'BloomOps',
    baseURL: appUrl,
    basePath: AUTH_BASE_PATH,
    secret: authSecret(env),
    trustedOrigins: trustedOrigins(env, appUrl),
    database: drizzleAdapter(database, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    // Identity is email-only in Release A: no passwords, no social sign-in.
    emailAndPassword: { enabled: false },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      // No cookie cache: every request reads the session row, so a revoked
      // session or a suspended membership stops working immediately.
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: secure,
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
    },
    telemetry: { enabled: false },
    logger: { level: 'warn' },
    onAPIError: { errorURL: `${appUrl}/sign-in` },
    hooks: {
      // A deployment without a way to send mail says so before touching any
      // email-dependent logic, so the answer cannot depend on the address.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-in/magic-link' && !mail.ready) {
          throw new APIError('SERVICE_UNAVAILABLE', { message: 'Sign-in email is not configured on this deployment.' });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const email = normalizeEmail(user.email);
            const invitation = email ? await findPendingInvitationForEmail(database, email, now()) : null;
            if (!invitation) {
              throw new APIError('FORBIDDEN', {
                code: NOT_INVITED_CODE,
                message: 'This email address has not been invited to a BloomOps workspace.',
              });
            }
            return { data: { ...user, email, name: user.name || invitation.inviteeName || nameFromEmail(email) } };
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_SECONDS,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          const normalized = normalizeEmail(email);
          if (!normalized) return;
          const known = (await findUserByEmail(database, normalized)) || (await findPendingInvitationForEmail(database, normalized, now()));
          if (!known) return;
          try {
            await mail.send({ to: normalized, ...magicLinkEmail({ url, expiresMinutes: Math.round(MAGIC_LINK_TTL_SECONDS / 60) }) });
          } catch (err) {
            // The outward response stays the same either way. Operators see
            // the failure here; the recipient, the token, and the link do not
            // appear in it.
            console.error('[bloomops-auth] magic link email failed', { transport: mail.transport, status: err?.status || 0, error: err?.errorName || err?.name || 'error' });
          }
        },
      }),
    ],
  });
}

// One instance per environment object and app origin. The environment
// object is stable for the life of a Worker isolate; the origin only varies
// in local development, where the loopback host decides it.
const instances = new WeakMap();

export function getAuth({ env = null, requestUrl = null } = {}) {
  const environment = env || getCloudflareContext().env;
  const appUrl = resolveAppUrl(environment, requestUrl);
  let byOrigin = instances.get(environment);
  if (!byOrigin) {
    byOrigin = new Map();
    instances.set(environment, byOrigin);
  }
  let auth = byOrigin.get(appUrl);
  if (!auth) {
    auth = createAuth({ env: environment, requestUrl });
    byOrigin.set(appUrl, auth);
  }
  return auth;
}

// Identity only: the Better Auth session behind a request's cookie, or null.
// Callers that need workspace authority use lib/bloomops/access.mjs.
export async function getIdentity(auth, headers) {
  const result = await auth.api.getSession({ headers });
  if (!result || !result.user || !result.session) return null;
  return result;
}
