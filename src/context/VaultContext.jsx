import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { deriveAccountKeys, deriveMasterKey, normalizeEmail, KDF_ITERATIONS, KDF_VERSION } from '../crypto/kdf.js';
import { encryptJSON, decryptJSON } from '../crypto/aes.js';
import { generateVaultKey, wrapVaultKey, unwrapVaultKey, generateRecoveryKey, recoveryWrappingKey, nonExtractable, keyProof, sha256Hex } from '../crypto/keys.js';
import { fromBase64 } from '../crypto/encoding.js';
import { supabase } from '../lib/supabase.js';
import * as db from '../lib/db.js';
import { makeBackup, openBackup } from '../lib/backup.js';
import { mfaPending, verifySecondFactor } from '../lib/mfa.js';
import { byName, pull, decryptRecords, hasKeyVersions, writeError } from '../lib/vaultData.js';
import { rotateVaultKey } from '../lib/rotate.js';

const MFA_STEP_MS = 5 * 60 * 1000; // the 2FA screen holds the master key; give up after this
import { clearClipboard } from '../hooks/useClipboard.js';

const VaultContext = createContext(null);
export const useVault = () => useContext(VaultContext);

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

// status: 'loading' | 'signedOut' | 'locked' | 'mfa' | 'unlocked' | 'recovering'
export function VaultProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null); // { id, email }
  const [items, setItems] = useState([]);
  const [offline, setOffline] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(null); // email of a Phase 1 local vault, if any
  const keyRef = useRef(null); // vault key: memory only, never persisted
  const authFlow = useRef(false); // true while register/login drive the state themselves
  const mfaRef = useRef(null); // { u, masterKey, password } held while status is 'mfa'
  const mfaTimer = useRef(null);
  const keyVersionRef = useRef(null); // profile.key_version the items are written with (null before migration 0004)

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
    const { profile, records, offline: off } = pulled ?? (await pull(u.id));
    keyVersionRef.current = profile?.key_version ?? null;
    const moved = off ? [] : await migrateLegacy(u.id, u.email, password, key);
    if (moved.length) setHasLegacy(null);
    keyRef.current = key;
    setItems(await decryptRecords([...records.filter((r) => !moved.some((m) => m.id === r.id)), ...moved], key));
    setOffline(off);
    setUser(u);
    setStatus('unlocked');
  }, []);

  const unlockWith = useCallback(async (u, masterKey, password) => {
    if (await mfaPending()) {
      mfaRef.current = { u, masterKey, password };
      clearTimeout(mfaTimer.current);
      mfaTimer.current = setTimeout(() => {
        mfaRef.current = null;
        setStatus((s) => (s === 'mfa' ? 'locked' : s));
      }, MFA_STEP_MS);
      setUser(u);
      setStatus('mfa');
      return;
    }
    const pulled = await pull(u.id);
    let key;
    try {
      key = await unwrapVaultKey(pulled.profile.wrapped_key, masterKey, true); // extractable only for the proof below
    } catch {
      throw new Error('Master password salah.');
    }
    // Accounts from before migration 0004 get their key proof now, so recovery can rotate the key later.
    if (hasKeyVersions(pulled.profile) && !pulled.profile.key_proof_hash && !pulled.offline) {
      await supabase.rpc('set_key_proof', { p_proof_hash: await sha256Hex(await keyProof(key)) });
    }
    await enter(u, await nonExtractable(key), password, pulled);
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
          key_proof_hash: await sha256Hex(await keyProof(key)), // moved into profiles and removed by the server
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
          if (session) await enter({ id: session.user.id, email }, await nonExtractable(key), password);
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
    const { masterKey, authHash } = await deriveAccountKeys(user.email, password);
    if (await mfaPending()) {
      // RLS hides the profile until 2FA, so the password can't be checked locally yet: ask the server.
      authFlow.current = true;
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: authHash });
        if (error) throw new Error(/invalid/i.test(error.message) ? 'Master password salah.' : error.message);
      } finally {
        authFlow.current = false;
      }
    }
    await unlockWith(user, masterKey, password);
  }, [user, unlockWith]);

  // Second step of login/unlock for accounts with 2FA.
  const completeMfa = useCallback(async (code) => {
    if (!mfaRef.current) throw new Error('Waktu habis. Masukkan master password lagi.');
    await verifySecondFactor(code);
    const { u, masterKey, password } = mfaRef.current;
    mfaRef.current = null;
    clearTimeout(mfaTimer.current);
    await unlockWith(u, masterKey, password);
  }, [unlockWith]);

  const lock = useCallback(() => {
    keyRef.current = null;
    clearClipboard();
    setItems([]);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, []);

  const signOut = useCallback(async () => {
    keyRef.current = null;
    mfaRef.current = null;
    clearTimeout(mfaTimer.current);
    clearClipboard();
    await db.clearCache();
    await supabase.auth.signOut();
  }, []);

  const requestRecovery = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: window.location.origin });
    if (error) throw new Error(error.message);
  }, []);

  // Needs a session (from the reset email link). Sets a new master password and, from migration
  // 0004 on, a brand-new vault key (all items re-encrypted), so whoever knew the old master
  // password or holds an old copy of the wrapped key can't open the vault any more.
  // With 2FA, the reset-link session must pass it first (mfaCode), or this throws { code: 'mfa' }.
  const completeRecovery = useCallback(async (recoveryKey, newPassword, mfaCode) => {
    if (await mfaPending()) {
      if (!mfaCode) throw Object.assign(new Error('Akun ini memakai 2FA. Masukkan kodenya.'), { code: 'mfa' });
      await verifySecondFactor(mfaCode);
    }
    const pulled = await pull(user.id);
    if (pulled.offline) throw new Error('Pemulihan butuh koneksi internet.');
    const recoveryWrapKey = await recoveryWrappingKey(recoveryKey);
    let key;
    try {
      key = await unwrapVaultKey(pulled.profile.recovery_wrapped_key, recoveryWrapKey, true);
    } catch {
      throw new Error('Recovery key tidak cocok.');
    }
    const { masterKey, authHash } = await deriveAccountKeys(user.email, newPassword);
    // Vault first, account password second: if the second step fails, the same recovery key
    // still opens the (already rotated) vault, so running recovery again finishes the job.
    if (hasKeyVersions(pulled.profile)) {
      await rotateVaultKey({ oldKey: key, profile: pulled.profile, masterKey, recoveryWrapKey });
    } else {
      const up = await supabase.from('profiles').update({ wrapped_key: await wrapVaultKey(key, masterKey) }).eq('id', user.id);
      if (up.error) throw new Error(up.error.message);
    }
    const pw = await supabase.auth.updateUser({ password: authHash });
    if (pw.error) throw new Error(`Vault sudah diperbarui, tapi password akun gagal diganti (${pw.error.message}). Ulangi pemulihan dengan recovery key yang sama.`);
    await unlockWith(user, masterKey, newPassword);
  }, [user, unlockWith]);

  const updateCache = useCallback(async (fn) => {
    const cached = await db.getCache(user.id);
    if (cached) await db.setCache(user.id, { ...cached, records: fn(cached.records) });
  }, [user]);

  // Item rows carry the key version so the server can refuse writes made with a replaced key.
  const toRow = useCallback(async (id, plain, updatedAt = new Date().toISOString()) => ({
    id, user_id: user.id, updated_at: updatedAt,
    ...(keyVersionRef.current != null && { key_version: keyVersionRef.current }),
    ...(await encryptJSON(plain, keyRef.current)),
  }), [user]);

  const failWrite = useCallback((error, action) => {
    const err = writeError(error, action);
    if (err.stale) lock(); // this device holds an old vault key
    return err;
  }, [lock]);

  const saveItem = useCallback(async (item) => {
    const id = item.id ?? crypto.randomUUID();
    const { id: _, updatedAt: __, ...plain } = item;
    const prev = items.find((i) => i.id === id);
    plain.passwordChangedAt = !prev || prev.password !== plain.password ? Date.now() : prev.passwordChangedAt ?? prev.updatedAt;
    const row = await toRow(id, plain);
    const { error } = await supabase.from('vault_items').upsert(row);
    if (error) throw failWrite(error, 'menyimpan');
    await updateCache((rs) => [...rs.filter((r) => r.id !== id), row]);
    setItems((prev) => [...prev.filter((i) => i.id !== id), { ...plain, id, updatedAt: Date.parse(row.updated_at) }].sort(byName));
    return id;
  }, [items, toRow, failWrite, updateCache]);

  const deleteItem = useCallback(async (id) => {
    const { error } = await supabase.from('vault_items').delete().eq('id', id);
    if (error) throw new Error(`Gagal menghapus: ${error.message}`);
    await updateCache((rs) => rs.filter((r) => r.id !== id));
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, [updateCache]);

  // Previous versions of items (kept 30 days by the database on every change or delete).
  const loadHistory = useCallback(async () => {
    if (offline) throw new Error('Riwayat butuh koneksi internet.');
    const { data, error } = await supabase.from('vault_item_versions')
      .select('version_id, item_id, iv, data, item_updated_at, change, saved_at')
      .order('saved_at', { ascending: false }).limit(300);
    if (error) throw new Error(/does not exist|schema cache/i.test(error.message)
      ? 'Riwayat belum aktif: jalankan supabase/migrations/0003_protect_vault.sql di Supabase.' : error.message);
    return Promise.all(data.map(async (v) => {
      try {
        return { ...v, item: await decryptJSON(v, keyRef.current) };
      } catch {
        return { ...v, item: null }; // not encrypted with this vault key (tampered)
      }
    }));
  }, [offline]);

  const restoreVersion = useCallback(async (version) => {
    if (!version.item) throw new Error('Versi ini tidak bisa dibuka.');
    return saveItem({ ...version.item, id: version.item_id });
  }, [saveItem]);

  const exportBackup = useCallback(async () => {
    const { profile, records } = await pull(user.id);
    return makeBackup(user.email, profile, records);
  }, [user]);

  // Adds new items and replaces older ones; never deletes. Items from another vault get fresh ids
  // because ids are unique across all accounts.
  const importBackup = useCallback(async (backup, secret) => {
    if (offline) throw new Error('Impor butuh koneksi internet.');
    const { items: incoming, sameVault } = await openBackup(backup, keyRef.current, secret);
    const current = new Map(items.map((i) => [i.id, i]));
    const changed = sameVault
      ? incoming.filter((i) => !(current.get(i.id)?.updatedAt >= i.updatedAt))
      : incoming.map((i) => ({ ...i, id: crypto.randomUUID() }));
    const rows = await Promise.all(changed.map(({ id, updatedAt, ...plain }) => toRow(id, plain, new Date(updatedAt).toISOString())));
    if (rows.length) {
      const { error } = await supabase.from('vault_items').upsert(rows);
      if (error) throw failWrite(error, 'mengimpor');
      const ids = new Set(rows.map((r) => r.id));
      await updateCache((rs) => [...rs.filter((r) => !ids.has(r.id)), ...rows]);
      setItems((prev) => [...prev.filter((i) => !ids.has(i.id)), ...changed].sort(byName));
    }
    const added = changed.filter((i) => !current.has(i.id)).length;
    return { added, updated: changed.length - added, skipped: incoming.length - changed.length };
  }, [items, offline, toRow, failWrite, updateCache]);

  // Pick up changes made on other devices when the tab regains focus.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const onFocus = async () => {
      const key = keyRef.current;
      if (document.visibilityState !== 'visible' || !key) return;
      try {
        const { profile, records, offline: off } = await pull(user.id);
        if (keyRef.current !== key) return; // locked meanwhile: don't bring plaintext back
        if (keyVersionRef.current != null && profile?.key_version !== keyVersionRef.current) return lock(); // key rotated elsewhere
        const decrypted = await decryptRecords(records, key);
        if (keyRef.current !== key) return;
        setItems(decrypted);
        setOffline(off);
      } catch { /* keep what we have */ }
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [status, user, lock]);

  const discardLegacy = useCallback(async () => {
    await db.deleteLegacyVault();
    setHasLegacy(null);
  }, []);

  const value = {
    status, user, items, offline, hasLegacy,
    register, login, unlock, completeMfa, lock, signOut, requestRecovery, completeRecovery, saveItem, deleteItem, discardLegacy,
    exportBackup, importBackup, loadHistory, restoreVersion,
  };
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
