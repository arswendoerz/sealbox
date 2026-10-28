import { supabase } from './supabase.js';
import { allRows } from './vaultData.js';
import { encryptJSON, decryptJSON } from '../crypto/aes.js';
import { generateVaultKey, wrapVaultKey, keyProof, sha256Hex, nonExtractable } from '../crypto/keys.js';

const ERRORS = {
  'sealbox:bad_proof': 'Server menolak penggantian kunci (bukti kunci tidak cocok).',
  'sealbox:items_changed': 'Ada item yang berubah di perangkat lain selama proses. Coba lagi.',
};

// Replaces the vault key, e.g. after a recovery: every item and readable history version is
// re-encrypted, so old copies of the wrapped key (caches, backups of the profile, dumps) no longer
// open anything. The server applies it in one transaction and only with proof of the old key.
//   oldKey: the current vault key, extractable (needed for the proof)
//   masterKey / recoveryWrapKey: wrap the new key for normal unlock and for recovery
// Returns the new key (non-extractable) and its version.
export async function rotateVaultKey({ oldKey, profile, masterKey, recoveryWrapKey }) {
  const oldProof = await keyProof(oldKey);
  if (!profile.key_proof_hash) {
    const { error } = await supabase.rpc('set_key_proof', { p_proof_hash: await sha256Hex(oldProof) });
    if (error) throw new Error(`Gagal menyiapkan penggantian kunci: ${error.message}`);
  }

  const items = await allRows('vault_items', 'id, iv, data', 'id');
  const versions = await allRows('vault_item_versions', 'version_id, iv, data', 'version_id');
  if (items.error || versions.error) throw new Error(`Gagal memuat vault: ${(items.error ?? versions.error).message}`);

  const newKey = await generateVaultKey();
  const reencrypt = async (row) => {
    try {
      return await encryptJSON(await decryptJSON(row, oldKey), newKey);
    } catch {
      return null; // not readable with the old key either (tampered): leave as it is
    }
  };
  const pItems = await Promise.all(items.data.map(async (r) => ({ id: r.id, ...((await reencrypt(r)) ?? { iv: r.iv, data: r.data }) })));
  const pVersions = (await Promise.all(versions.data.map(async (v) => {
    const enc = await reencrypt(v);
    return enc && { version_id: v.version_id, ...enc };
  }))).filter(Boolean);

  const { data: keyVersion, error } = await supabase.rpc('rotate_vault_key', {
    p_proof: oldProof,
    p_new_proof_hash: await sha256Hex(await keyProof(newKey)),
    p_wrapped_key: await wrapVaultKey(newKey, masterKey),
    p_recovery_wrapped_key: await wrapVaultKey(newKey, recoveryWrapKey),
    p_items: pItems,
    p_versions: pVersions,
  });
  if (error) throw new Error(ERRORS[error.hint] ?? `Gagal mengganti kunci vault: ${error.message}`);
  return { key: await nonExtractable(newKey), keyVersion };
}
