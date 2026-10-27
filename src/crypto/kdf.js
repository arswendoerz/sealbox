import { utf8, toBase64, randomBytes } from './encoding.js';

// OWASP 2023 recommendation for PBKDF2-HMAC-SHA256.
export const KDF_ITERATIONS = 600_000;
export const KDF_VERSION = 1;

const AES = { name: 'AES-GCM', length: 256 };

export function generateSalt() {
  return randomBytes(16);
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

async function passwordKey(password) {
  return crypto.subtle.importKey('raw', utf8.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey', 'deriveBits']);
}

// Phase 1 (local-only) derivation with a random salt. Kept to migrate old local vaults.
export async function deriveMasterKey(password, salt, iterations = KDF_ITERATIONS) {
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    await passwordKey(password),
    AES, false, ['wrapKey', 'unwrapKey'],
  );
}

// Online accounts: one PBKDF2 run, then HKDF splits it into two independent keys.
//   masterKey -> wraps the vault key, never leaves the browser
//   authHash  -> sent to Supabase as the login password; reveals nothing about masterKey
// The salt comes from the email so it can be computed before the user is signed in.
export async function deriveAccountKeys(email, password, iterations = KDF_ITERATIONS) {
  const salt = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(`sealbox:v${KDF_VERSION}:${normalizeEmail(email)}`)));
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, await passwordKey(password), 256);
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const params = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: utf8.encode(info) });
  const masterKey = await crypto.subtle.deriveKey(params('sealbox-enc'), hkdf, AES, false, ['wrapKey', 'unwrapKey']);
  const authHash = toBase64(await crypto.subtle.deriveBits(params('sealbox-auth'), hkdf, 256));
  return { masterKey, authHash };
}
