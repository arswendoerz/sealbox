import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { deriveAccountKeys, deriveMasterKey, normalizeEmail, KDF_ITERATIONS, KDF_VERSION } from '../crypto/kdf.js';
import { encryptJSON, decryptJSON } from '../crypto/aes.js';
import { generateVaultKey, wrapVaultKey, unwrapVaultKey, generateRecoveryKey, recoveryWrappingKey } from '../crypto/keys.js';
import { fromBase64 } from '../crypto/encoding.js';
import { supabase } from '../lib/supabase.js';
import * as db from '../lib/db.js';

const VaultContext = createContext(null);
export const useVault = () => useContext(VaultContext);

const byName = (a, b) => a.name.localeCompare(b.name);

// Fetches profile + encrypted items, falling back to the offline cache.
async function pull(userId) {
  const [p, i] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('vault_items').select('id, iv, data, updated_at'),
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

async function decryptRecords(records, key) {
  const items = await Promise.all(records.map(async (r) => ({ ...(await decryptJSON(r, key)), id: r.id, updatedAt: Date.parse(r.updated_at) })));
  return items.sort(byName);
}

// Moves a Phase 1 local vault into the online account if the email and password match it.
async function migrateLegacy(userId, email, password, key) {
  const legacy = await db.getLegacyVault();
  if (!legacy || normalizeEmail(legacy.account.email) !== email) return [];
  let legacyKey;
  try {
    const mk = await deriveMasterKey(password, fromBase64(legacy.account.salt), legacy.account.iterations);
    legacyKey = await unwrapVaultKey(legacy.account.wrappedKey, mk);
  } catch {
    return []; // different password: leave the local vault alone
  }
  const rows = await Promise.all(legacy.items.map(async (r) => ({
    id: r.id,
    user_id: userId,
    updated_at: new Date(r.updatedAt).toISOString(),
    ...(await encryptJSON(await decryptJSON(r, legacyKey), key)),
  })));
  if (rows.length) {
    const { error } = await supabase.from('vault_items').upsert(rows);
    if (error) throw new Error(`Gagal memindahkan vault lokal: ${error.message}`);
  }
  await db.deleteLegacyVault();
  return rows;
}

// status: 'loading' | 'signedOut' | 'locked' | 'unlocked' | 'recovering'
export function VaultProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null); // { id, email }
  const [items, setItems] = useState([]);
  const [offline, setOffline] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(null); // email of a Phase 1 local vault, if any
  const keyRef = useRef(null); // vault key: memory only, never persisted
  const authFlow = useRef(false); // true while register/login drive the state themselves

  useEffect(() => {
    db.getLegacyVault().then((l) => setHasLegacy(l?.account.email ?? null));
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser({ id: session.user.id, email: session.user.email });
      setStatus((s) => (s === 'loading' ? (session ? 'locked' : 'signedOut') : s));
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setUser({ id: session.user.id, email: session.user.email });
        setStatus('recovering');
      } else if (event === 'SIGNED_OUT') {
        keyRef.current = null;
        setItems([]);
        setUser(null);
        setStatus('signedOut');
      } else if (event === 'SIGNED_IN' && session && !authFlow.current) {
        setUser({ id: session.user.id, email: session.user.email });
        setStatus((s) => (s === 'signedOut' || s === 'loading' ? 'locked' : s));
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const enter = useCallback(async (u, key, password, pulled) => {
    const { records, offline: off } = pulled ?? (await pull(u.id));
    const moved = off ? [] : await migrateLegacy(u.id, u.email, password, key);
    if (moved.length) setHasLegacy(null);
    keyRef.current = key;
    setItems(await decryptRecords([...records.filter((r) => !moved.some((m) => m.id === r.id)), ...moved], key));
    setOffline(off);
    setUser(u);
    setStatus('unlocked');
  }, []);

  const unlockWith = useCallback(async (u, masterKey, password) => {
    const pulled = await pull(u.id);
    let key;
    try {
      key = await unwrapVaultKey(pulled.profile.wrapped_key, masterKey);
    } catch {
      throw new Error('Master password salah.');
    }
    await enter(u, key, password, pulled);
  }, [enter]);

  // Returns the recovery key so the UI can show it exactly once.
  const register = useCallback(async (emailInput, password) => {
    const email = normalizeEmail(emailInput);
    const { masterKey, authHash } = await deriveAccountKeys(email, password);
    const key = await generateVaultKey();
    const recoveryKey = generateRecoveryKey();
    authFlow.current = true; // stay on the recovery-key screen even if signUp returns a session
    const { data, error } = await supabase.auth.signUp({
      email,
      password: authHash,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          kdf_version: KDF_VERSION,
          kdf_iterations: KDF_ITERATIONS,
          wrapped_key: await wrapVaultKey(key, masterKey),
          recovery_wrapped_key: await wrapVaultKey(key, await recoveryWrappingKey(recoveryKey)),
        },
      },
    });
    const exists = error ? /registered/i.test(error.message) : data.user?.identities?.length === 0; // 2nd case: confirmation on
    if (error || exists) {
      authFlow.current = false;
      throw new Error(exists ? 'Email sudah terdaftar.' : error.message);
    }
    const session = data.session;
    return {
      recoveryKey,
      needsConfirmation: !session,
      finish: async () => {
        try {
          if (session) await enter({ id: session.user.id, email }, key, password);
          else setStatus('signedOut');
        } finally {
          authFlow.current = false;
        }
      },
    };
  }, [enter]);

  const login = useCallback(async (emailInput, password) => {
    const email = normalizeEmail(emailInput);
    const { masterKey, authHash } = await deriveAccountKeys(email, password);
    authFlow.current = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: authHash });
      if (error) {
        if (/confirm/i.test(error.message)) throw new Error('Email belum dikonfirmasi. Cek kotak masuk Anda.');
        if (/invalid/i.test(error.message)) throw new Error('Email atau master password salah.');
        throw new Error(error.message);
      }
      const u = { id: data.user.id, email };
      setUser(u);
      try {
        await unlockWith(u, masterKey, password);
      } catch (err) {
        setStatus('locked'); // signed in but the vault couldn't open: show the unlock screen
        throw err;
      }
    } finally {
      authFlow.current = false;
    }
  }, [unlockWith]);

  const unlock = useCallback(async (password) => {
    const { masterKey } = await deriveAccountKeys(user.email, password);
    await unlockWith(user, masterKey, password);
  }, [user, unlockWith]);

  const lock = useCallback(() => {
    keyRef.current = null;
    setItems([]);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, []);

  const signOut = useCallback(async () => {
    keyRef.current = null;
    await db.clearCache();
    await supabase.auth.signOut();
  }, []);

  const requestRecovery = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: window.location.origin });
    if (error) throw new Error(error.message);
  }, []);

  // Needs a session (from the reset email link). Re-wraps the vault key under a new master password.
  const completeRecovery = useCallback(async (recoveryKey, newPassword) => {
    const pulled = await pull(user.id);
    if (pulled.offline) throw new Error('Pemulihan butuh koneksi internet.');
    let key;
    try {
      key = await unwrapVaultKey(pulled.profile.recovery_wrapped_key, await recoveryWrappingKey(recoveryKey), true);
    } catch {
      throw new Error('Recovery key tidak cocok.');
    }
    const { masterKey, authHash } = await deriveAccountKeys(user.email, newPassword);
    const wrapped = await wrapVaultKey(key, masterKey);
    const pw = await supabase.auth.updateUser({ password: authHash });
    if (pw.error) throw new Error(pw.error.message);
    const up = await supabase.from('profiles').update({ wrapped_key: wrapped }).eq('id', user.id);
    if (up.error) throw new Error(up.error.message);
    await unlockWith(user, masterKey, newPassword);
  }, [user, unlockWith]);

  const updateCache = useCallback(async (fn) => {
    const cached = await db.getCache(user.id);
    if (cached) await db.setCache(user.id, { ...cached, records: fn(cached.records) });
  }, [user]);

  const saveItem = useCallback(async (item) => {
    const id = item.id ?? crypto.randomUUID();
    const { id: _, updatedAt: __, ...plain } = item;
    const row = { id, user_id: user.id, updated_at: new Date().toISOString(), ...(await encryptJSON(plain, keyRef.current)) };
    const { error } = await supabase.from('vault_items').upsert(row);
    if (error) throw new Error(`Gagal menyimpan: ${error.message}`);
    await updateCache((rs) => [...rs.filter((r) => r.id !== id), row]);
    setItems((prev) => [...prev.filter((i) => i.id !== id), { ...plain, id, updatedAt: Date.parse(row.updated_at) }].sort(byName));
    return id;
  }, [user, updateCache]);

  const deleteItem = useCallback(async (id) => {
    const { error } = await supabase.from('vault_items').delete().eq('id', id);
    if (error) throw new Error(`Gagal menghapus: ${error.message}`);
    await updateCache((rs) => rs.filter((r) => r.id !== id));
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [updateCache]);

  // Pick up changes made on other devices when the tab regains focus.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const onFocus = async () => {
      if (document.visibilityState !== 'visible' || !keyRef.current) return;
      try {
        const { records, offline: off } = await pull(user.id);
        setItems(await decryptRecords(records, keyRef.current));
        setOffline(off);
      } catch { /* keep what we have */ }
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [status, user]);

  const discardLegacy = useCallback(async () => {
    await db.deleteLegacyVault();
    setHasLegacy(null);
  }, []);

  const value = {
    status, user, items, offline, hasLegacy,
    register, login, unlock, lock, signOut, requestRecovery, completeRecovery, saveItem, deleteItem, discardLegacy,
  };
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
