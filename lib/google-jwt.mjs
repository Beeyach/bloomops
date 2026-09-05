// Verifying that a push notification really came from Google.
//
// Pub/Sub signs each push with an OIDC token in the Authorization header. The
// token is checked properly here — signature against Google's published keys,
// then issuer, audience, service account and expiry — rather than by calling
// Google's tokeninfo endpoint, which is a debugging aid and adds a network hop
// to every notification.
//
// Worth stating plainly what this is and is not protecting. The notification
// payload is only ever a wake signal: the sync resumes from the cursor WE
// stored, never from a number in the request. So a forged notification that
// somehow got past this could cause a redundant read of the mailbox we already
// had permission to read, and nothing else. The verification is here because
// an unauthenticated public endpoint that triggers work is still a way to
// waste somebody's money.

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const SKEW_SECONDS = 60;

let cache = { keys: null, at: 0 };

async function googleKeys() {
  // Google rotates these slowly. An hour of caching turns one fetch per
  // notification into one an hour, and a miss just re-fetches.
  if (cache.keys && Date.now() - cache.at < 3600_000) return cache.keys;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google signing keys (${res.status})`);
  const data = await res.json();
  cache = { keys: data.keys || [], at: Date.now() };
  return cache.keys;
}

function unb64url(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Anything unreadable is just "not a token". Letting a decoder's own error
// escape hands a caller the internals of the parser they are poking at, and
// there is nothing useful in it for a legitimate one.
function jsonPart(s, which) {
  try {
    return JSON.parse(new TextDecoder().decode(unb64url(s)));
  } catch {
    throw new Error(`Unreadable ${which}.`);
  }
}

// Returns the claims, or throws. Never returns a partial result: a token that
// is not fully valid is not a token.
export async function verifyGoogleToken(token, { audience, serviceAccountEmail = null, now = Date.now() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Not a JWT.');

  const header = jsonPart(parts[0], "token header");
  const claims = jsonPart(parts[1], "token body");
  if (header.alg !== 'RS256') throw new Error(`Unexpected signing algorithm ${header.alg}.`);

  const keys = await googleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Signed with a key Google does not publish.');

  const key = await crypto.subtle.importKey(
    'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5', key,
    unb64url(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error('Signature does not verify.');

  const nowSec = Math.floor(now / 1000);
  if (!ISSUERS.has(claims.iss)) throw new Error(`Unexpected issuer ${claims.iss}.`);
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_SECONDS < nowSec) throw new Error('Token has expired.');
  if (typeof claims.iat === 'number' && claims.iat - SKEW_SECONDS > nowSec) throw new Error('Token is from the future.');
  if (audience && claims.aud !== audience) throw new Error('Token was issued for a different audience.');
  // The identity Pub/Sub was told to sign as. Without this check any Google
  // account could mint a token for this audience.
  if (serviceAccountEmail && claims.email !== serviceAccountEmail) {
    throw new Error('Token belongs to a different service account.');
  }
  if (serviceAccountEmail && claims.email_verified !== true) throw new Error('Service account email is not verified.');

  return claims;
}
