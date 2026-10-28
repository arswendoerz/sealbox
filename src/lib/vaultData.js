import { decryptJSON } from '../crypto/aes.js';
import { supabase } from './supabase.js';
import * as db from './db.js';

// Shared by the web app and the browser extension.

// Tolerates malformed items (e.g. from an imported backup) instead of breaking every unlock.
export const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''));

const PAGE = 1000; // Supabase returns at most this many rows per request

// All encrypted items, page by page, so large vaults (and their backups) are never cut short.
async function allItems() {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('vault_items').select('id, iv, data, updated_at').order('id').range(from, from + PAGE - 1);
    if (error) return { error };
    rows.push(...data);
    if (data.length < PAGE) return { data: rows };
  }
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

export async function decryptRecords(records, key) {
  const items = await Promise.all(records.map(async (r) => ({ ...(await decryptJSON(r, key)), id: r.id, updatedAt: Date.parse(r.updated_at) })));
  return items.sort(byName);
}
