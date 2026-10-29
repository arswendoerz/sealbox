import { decryptJSON } from '../crypto/aes.js';
import { isFolder } from './folders.js';
import { supabase } from './supabase.js';
import * as db from './db.js';

// Shared by the web app and the browser extension.

// Tolerates malformed items (e.g. from an imported backup) instead of breaking every unlock.
export const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''));

const PAGE = 1000; // Supabase returns at most this many rows per request

// Every row of a table, page by page, so large vaults (and their backups) are never cut short.
export async function allRows(table, columns, orderBy) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1);
    if (error) return { error };
    rows.push(...data);
    if (data.length < PAGE) return { data: rows };
  }
}

const allItems = () => allRows('vault_items', 'id, iv, data, updated_at', 'id');

// The schema from migration 0004 on: items carry the vault key version they were encrypted with.
export const hasKeyVersions = (profile) => profile != null && 'key_version' in profile;

// Turns a failed write into a readable error; `stale` is true when another device rotated the key.
export function writeError(error, action = 'menyimpan') {
  const stale = error?.hint === 'sealbox:stale_key';
  const message = stale
    ? 'Kunci vault diganti di perangkat lain. Kunci lalu buka ulang vault, kemudian coba lagi.'
    : `Gagal ${action}: ${error?.message}`;
  return Object.assign(new Error(message), { stale });
}

// Fetches profile + encrypted items, falling back to the offline cache.
export async function pull(userId) {
  const [p, i] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    allItems(),
  ]);
  if (!p.error && !i.error) {
    const fresh = { profile: p.data, records: i.data };
    await db.setCache(userId, fresh);
    return { ...fresh, offline: false };
  }
  const cached = await db.getCache(userId);
  if (!cached) throw new Error(`Tidak bisa terhubung ke server: ${(p.error ?? i.error).message}`);
  return { ...cached, offline: true };
}

// { items, folders }: folder rows (see folders.js) apart from the items.
export async function decryptVault(records, key) {
  const all = await Promise.all(records.map(async (r) => ({ ...(await decryptJSON(r, key)), id: r.id, updatedAt: Date.parse(r.updated_at) })));
  return {
    items: all.filter((i) => !isFolder(i)).sort(byName),
    folders: all.filter(isFolder).map(({ id, name, updatedAt }) => ({ id, name, updatedAt })),
  };
}

// Items only. The extension uses this, so folder rows never reach autofill.
export async function decryptRecords(records, key) {
  return (await decryptVault(records, key)).items;
}
