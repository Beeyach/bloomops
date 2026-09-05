// Access-code sessions. An access code IS the account: it maps to a
// workspace and a role. We never store a password db — codes live in an
// encrypted Cloudflare secret (LTB_ACCESS_CODES), out of the repo and
// unreadable from the code. A valid code mints an HMAC-signed cookie
// carrying { workspace, role } so we don't re-check the code every request.
//
// Env (set in the Cloudflare dashboard, NOT in the repo):
//   LTB_ACCESS_CODES  JSON: {"honeypetalbee":{"workspace":"ary","role":"admin"},
//                            "some-random-code":{"workspace":"ellen","role":"user"}}
//   LTB_SESSION_SECRET random string used to sign session cookies
//
// Local dev falls back to a single known code so `next dev` is usable.

export const SESSION_COOKIE = 'ltb_session';
const SESSION_TTL_DAYS = 30;

const DEV_CODES = {
  honeypetalbee: { workspace: 'ary', role: 'admin' },
  // A second local code so isolation can be exercised in dev. Prod uses the
  // encrypted LTB_ACCESS_CODES secret and never sees these.
  testbee: { workspace: 'testworkspace', role: 'user' },
};
const DEV_SECRET = 'dev-only-session-secret-not-for-prod';

// In production, a missing/garbled code config fails CLOSED (nobody gets
// in) so a misconfigured deploy is locked, never open with the dev code.
// Local dev falls back to the known dev code for convenience.
function isProd() {
  try {
    return typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}

export function loadCodes(env) {
  const raw = env && env.LTB_ACCESS_CODES;
  const fallback = isProd() ? {} : DEV_CODES;
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// Like loadCodes above, a missing secret fails CLOSED in production: no
// sessions can be minted or verified until LTB_SESSION_SECRET is set. The
// old behavior silently fell back to DEV_SECRET — a string sitting in this
// repo — which would have let anyone forge an admin cookie on a deploy
// that lost the env var.
function sessionSecret(env) {
  const secret = env && env.LTB_SESSION_SECRET;
  if (secret) return secret;
  return isProd() ? null : DEV_SECRET;
}

// Normalize a typed code: trim, lowercase, strip anything but a-z0-9.
export function normalizeCode(input) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Resolve a code to its { workspace, role } or null. Codes in the map are
// matched after the same normalization, so config stays forgiving.
export function resolveCode(env, input) {
  const code = normalizeCode(input);
  if (!code) return null;
  const codes = loadCodes(env);
  for (const [k, v] of Object.entries(codes)) {
    if (normalizeCode(k) === code && v && v.workspace) {
      return { workspace: String(v.workspace), role: v.role === 'admin' ? 'admin' : 'user' };
    }
  }
  return null;
}

function b64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeToStr(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return bin;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

// Constant-time-ish string compare (both are our own base64url, fixed len).
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Tokens minted before real expiry existed carry iat: 0. They stay valid
// through this grace window (so nobody is logged out mid-day by the
// deploy), then die. After 2026-08-22, a copied legacy cookie is dead.
const LEGACY_IAT_DEADLINE_MS = Date.UTC(2026, 7, 22); // Aug 22, 2026

// Sign { workspace, role } into a token: payload.signature
export async function signSession(env, { workspace, role }, now = Date.now()) {
  const secret = sessionSecret(env);
  if (!secret) {
    // Same spirit as the access-codes 503: a misconfigured deploy says so
    // instead of minting forgeable sessions.
    throw new Error('LTB_SESSION_SECRET is not configured on this deployment.');
  }
  const payloadObj = { w: workspace, r: role, iat: Math.floor(now / 1000) };
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

// Verify a token; returns { workspace, role } or null. Expiry is enforced
// HERE, server-side — the cookie's Max-Age only tells the browser when to
// stop sending it, which a copied cookie value ignores.
export async function verifySession(env, token, now = Date.now()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const secret = sessionSecret(env);
  if (!secret) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await hmac(secret, payload);
  if (!safeEqual(sig, expected)) return null;
  try {
    const obj = JSON.parse(b64urlDecodeToStr(payload));
    if (!obj || !obj.w) return null;
    const iat = Number(obj.iat) || 0;
    if (iat === 0) {
      // Legacy token from before server-side expiry. Honored only during
      // the grace window.
      if (now >= LEGACY_IAT_DEADLINE_MS) return null;
    } else if (now / 1000 - iat > SESSION_TTL_DAYS * 24 * 60 * 60) {
      return null;
    }
    return { workspace: String(obj.w), role: obj.r === 'admin' ? 'admin' : 'user' };
  } catch {
    return null;
  }
}

// Secure: the cookie never rides plain HTTP. Browsers still allow Secure
// cookies on localhost, so `next dev` keeps working.
export function sessionCookie(token) {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
