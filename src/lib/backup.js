import { deriveAccountKeys } from '../crypto/kdf.js';
import { decryptJSON } from '../crypto/aes.js';
import { unwrapVaultKey, recoveryWrappingKey } from '../crypto/keys.js';

const FORMAT = 'sealbox-backup';
const VERSION = 1;

// Same ciphertext the server holds, plus both wrapped copies of the vault key, so the file opens
// with the master password at export time or the recovery key. Email and item count stay visible.
export function makeBackup(email, profile, records) {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    email,
    kdf: { version: profile.kdf_version, iterations: profile.kdf_iterations },
    wrappedKey: profile.wrapped_key,
    recoveryWrappedKey: profile.recovery_wrapped_key,
    items: records.map((r) => ({ id: r.id, iv: r.iv, data: r.data, updatedAt: r.updated_at })),
  };
}

export function parseBackup(text) {
  let b;
  try {
    b = JSON.parse(text);
  } catch {
    b = null;
  }
  if (b?.format !== FORMAT || !Array.isArray(b.items) || !b.wrappedKey || !b.recoveryWrappedKey || !b.email) {
    throw new Error('File ini bukan backup Sealbox.');
  }
  if (b.version !== VERSION) throw new Error('Versi backup ini belum didukung.');
  return b;
}

async function decryptAll(items, key) {
  try {
    return await Promise.all(items.map(async (r) => ({ ...(await decryptJSON(r, key)), id: r.id, updatedAt: Date.parse(r.updatedAt) })));
  } catch {
    return null;
  }
}

// The secret may be the backup's master password or its recovery key.
async function keyFromSecret(backup, secret) {
  try {
    const { masterKey } = await deriveAccountKeys(backup.email, secret, backup.kdf?.iterations);
    return await unwrapVaultKey(backup.wrappedKey, masterKey);
  } catch { /* not the master password */ }
  try {
    return await unwrapVaultKey(backup.recoveryWrappedKey, await recoveryWrappingKey(secret));
  } catch {
    return null;
  }
}

// Returns { items, sameVault }. A backup of the open vault decrypts with its key directly;
// any other backup needs a secret, and throws { code: 'locked' } when none is given.
export async function openBackup(backup, currentKey, secret) {
  const own = await decryptAll(backup.items, currentKey);
  if (own) return { items: own, sameVault: true };
  if (!secret) throw Object.assign(new Error('Backup ini dari vault lain.'), { code: 'locked' });
  const key = await keyFromSecret(backup, secret);
  const items = key && (await decryptAll(backup.items, key));
  if (!items) throw new Error('Master password atau recovery key tidak cocok dengan backup ini.');
  return { items, sameVault: false };
}
