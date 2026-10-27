import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY belum diisi (lihat .env.example).');

// The extension's service worker has no localStorage, so its session lives in chrome.storage.local.
const inExtension = !!globalThis.chrome?.runtime?.id && !!globalThis.chrome.storage?.local;
const chromeStorage = {
  getItem: async (k) => (await chrome.storage.local.get(k))[k] ?? null,
  setItem: (k, v) => chrome.storage.local.set({ [k]: v }),
  removeItem: (k) => chrome.storage.local.remove(k),
};

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: !inExtension,
    ...(inExtension && { storage: chromeStorage }),
    experimental: { recoveryCodes: true }, // MFA recovery codes; lib/mfa.js copes if the server lacks them
  },
});
