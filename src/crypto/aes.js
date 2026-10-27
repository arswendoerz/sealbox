import { utf8, utf8Decode, toBase64, fromBase64, randomBytes } from './encoding.js';

// Encrypts any JSON-serialisable value with the vault key (AES-256-GCM).
export async function encryptJSON(value, key) {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8.encode(JSON.stringify(value)));
  return { iv: toBase64(iv), data: toBase64(data) };
}

// Throws if the key is wrong or the ciphertext was tampered with.
export async function decryptJSON({ iv, data }, key) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(data));
  return JSON.parse(utf8Decode.decode(plain));
}
