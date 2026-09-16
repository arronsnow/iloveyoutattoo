/* ─────────────────────────────────────────
   Password hashing and session tokens.

   Runs on the Workers runtime, so everything here uses WebCrypto
   rather than a Node crypto module or an npm dependency.

   Passwords: PBKDF2-SHA256, 210k iterations, 16-byte random salt.
   Sessions:  HMAC-SHA256 signed token, short lived, verified with a
              constant-time compare.
   ───────────────────────────────────────── */

const ITERATIONS = 210000;
const KEY_BITS = 256;

const enc = new TextEncoder();

function b64u(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Comparison whose duration does not depend on where the first
   difference is, so a wrong signature leaks nothing by timing. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    KEY_BITS
  );
  return { hash: b64u(bits), salt: b64u(salt) };
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.hash || !stored.salt) return false;
  const { hash } = await hashPassword(password, stored.salt);
  return timingSafeEqual(hash, stored.hash);
}

/* ── session tokens ── */

async function signingKey(secret) {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
}

export async function issueToken(payload, secret, ttlSeconds = 8 * 3600) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const data = b64u(enc.encode(JSON.stringify(body)));
  const key = await signingKey(secret);
  const sig = b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return `${data}.${sig}`;
}

export async function readToken(token, secret) {
  if (typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const key = await signingKey(secret);
  const expected = b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  if (!timingSafeEqual(sig, expected)) return null;

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(unb64u(data)));
  } catch (e) {
    return null;
  }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}
