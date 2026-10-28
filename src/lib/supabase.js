import { createClient } from '@supabase/supabase-js';
import { getAuth, setAuth, removeAuth } from './db.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY belum diisi (lihat .env.example).');

// The extension's service worker has no localStorage. Its session lives in the extension's own
// IndexedDB, which content scripts can't read (chrome.storage.local would be readable by them).
const inExtension = !!globalThis.chrome?.runtime?.id && !!globalThis.chrome.storage?.local;
const extensionStorage = {
  async getItem(k) {
    const v = await getAuth(k);
    if (v !== undefined) return v;
    // One-time move of a session stored by earlier versions in chrome.storage.local.
    const old = (await chrome.storage.local.get(k))[k];
    if (old === undefined) return null;
    await setAuth(k, old);
    await chrome.storage.local.remove(k);
    return old;
  },
  setItem: (k, v) => setAuth(k, v),
  removeItem: async (k) => {
    await removeAuth(k);
    await chrome.storage.local.remove(k);
  },
};

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: !inExtension,
    ...(inExtension && { storage: extensionStorage }),
    experimental: { recoveryCodes: true }, // MFA recovery codes; lib/mfa.js copes if the server lacks them
  },
});
