import { utf8, toBase64, fromBase64, randomBytes } from './encoding.js';

const AES = { name: 'AES-GCM', length: 256 };
const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1

// The vault key encrypts every item. Extractable only so it can be wrapped.
export function generateVaultKey() {
  return crypto.subtle.generateKey(AES, true, ['encrypt', 'decrypt']);
}

export async function wrapVaultKey(vaultKey, wrappingKey) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.wrapKey('raw', vaultKey, wrappingKey, { name: 'AES-GCM', iv });
  return { iv: toBase64(iv), data: toBase64(data) };
}

// extractable=false for normal use; true only when the key must be re-wrapped.
export function unwrapVaultKey({ iv, data }, wrappingKey, extractable = false) {
  return crypto.subtle.unwrapKey(
    'raw', fromBase64(data), wrappingKey,
    { name: 'AES-GCM', iv: fromBase64(iv) },
    AES, extractable, ['encrypt', 'decrypt'],
  );
}

// 160-bit recovery key shown to the user, e.g. K7QF-2MZP-9XWA-LT4R-B8NE-VC3H-Y6UD-J5SG.
export function generateRecoveryKey() {
  const chars = Array.from(randomBytes(32), (b) => BASE32[b % 32]).join('');
  return chars.match(/.{4}/g).join('-');
}

export function normalizeRecoveryKey(input) {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// The recovery key is already high-entropy, so a plain hash is enough to make a key.
export async function recoveryWrappingKey(recoveryKey) {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(normalizeRecoveryKey(recoveryKey)));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['wrapKey', 'unwrapKey']);
}
