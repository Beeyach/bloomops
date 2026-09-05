// Encrypts per-workspace secrets (AI keys, Apify tokens) at rest with
// AES-256-GCM via Web Crypto (works on the edge and in Node 18+). The
// encryption key is derived from LTB_SESSION_SECRET, so no extra setup —
// with the documented tradeoff that rotating the session secret makes
// saved keys undecryptable (users just paste their key again).
//
// Stored format: "enc:v1:<iv b64url>:<ciphertext b64url>"
// Legacy plaintext values (no prefix) pass through decrypt unchanged and
// get encrypted on the next save.

const PREFIX = 'enc:v1:';
const DEV_SECRET = 'dev-only-session-secret-not-for-prod';

function b64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(env) {
  const secret = (env && env.LTB_SESSION_SECRET) || DEV_SECRET;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ltb-secret-box:' + secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

// '' stays '' (means "no secret saved").
export async function sealSecret(env, plaintext) {
  const value = String(plaintext || '');
  if (!value) return '';
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return PREFIX + b64url(iv) + ':' + b64url(new Uint8Array(ct));
}

// Returns the plaintext. Legacy plaintext passes through; an undecryptable
// value (rotated secret) returns '' so callers treat it as "no key saved".
export async function openSecret(env, stored) {
  const value = String(stored || '');
  if (!value) return '';
  if (!isEncrypted(value)) return value; // legacy plaintext
  try {
    const [ivPart, ctPart] = value.slice(PREFIX.length).split(':');
    const key = await deriveKey(env);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64url(ivPart) },
      key,
      unb64url(ctPart)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return '';
  }
}
