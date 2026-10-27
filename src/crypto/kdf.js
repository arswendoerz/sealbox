import { utf8, randomBytes } from './encoding.js';

// OWASP 2023 recommendation for PBKDF2-HMAC-SHA256.
export const KDF_ITERATIONS = 600_000;

export function generateSalt() {
  return randomBytes(16);
}

// Master password -> Master Key. The key can only wrap/unwrap the vault key.
export async function deriveMasterKey(password, salt, iterations = KDF_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', utf8.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}
