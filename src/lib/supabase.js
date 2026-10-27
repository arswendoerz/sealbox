import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY belum diisi (lihat .env.example).');

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    experimental: { recoveryCodes: true }, // MFA recovery codes; lib/mfa.js copes if the server lacks them
  },
});
