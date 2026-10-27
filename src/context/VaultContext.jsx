import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { deriveMasterKey, generateSalt, KDF_ITERATIONS } from '../crypto/kdf.js';
import { encryptJSON, decryptJSON } from '../crypto/aes.js';
import { generateVaultKey, wrapVaultKey, unwrapVaultKey, generateRecoveryKey, recoveryWrappingKey } from '../crypto/keys.js';
import { toBase64, fromBase64 } from '../crypto/encoding.js';
import * as db from '../lib/db.js';

const VaultContext = createContext(null);
export const useVault = () => useContext(VaultContext);

// status: 'loading' | 'new' (no account) | 'locked' | 'unlocked'
export function VaultProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [account, setAccount] = useState(null);
  const [vaultKey, setVaultKey] = useState(null); // memory only, never persisted
  const [items, setItems] = useState([]);

  useEffect(() => {
    db.getAccount().then((acc) => {
      setAccount(acc ?? null);
      setStatus(acc ? 'locked' : 'new');
    });
  }, []);

  const loadItems = useCallback(async (key) => {
    const records = await db.getEncryptedItems();
    const decrypted = await Promise.all(records.map(async (r) => ({ id: r.id, updatedAt: r.updatedAt, ...(await decryptJSON(r, key)) })));
    setItems(decrypted.sort((a, b) => a.name.localeCompare(b.name)));
  }, []);

  // Returns the recovery key so the UI can show it exactly once.
  const register = useCallback(async (email, password) => {
    const salt = generateSalt();
    const masterKey = await deriveMasterKey(password, salt);
    const key = await generateVaultKey();
    const recoveryKey = generateRecoveryKey();
    const acc = {
      email,
      salt: toBase64(salt),
      iterations: KDF_ITERATIONS,
      wrappedKey: await wrapVaultKey(key, masterKey),
      recoveryWrappedKey: await wrapVaultKey(key, await recoveryWrappingKey(recoveryKey)),
      createdAt: Date.now(),
    };
    await db.saveAccount(acc);
    setAccount(acc);
    return { recoveryKey, finish: () => { setVaultKey(key); setItems([]); setStatus('unlocked'); } };
  }, []);

  const unlock = useCallback(async (password) => {
    const masterKey = await deriveMasterKey(password, fromBase64(account.salt), account.iterations);
    let key;
    try {
      key = await unwrapVaultKey(account.wrappedKey, masterKey);
    } catch {
      throw new Error('Master password salah.');
    }
    await loadItems(key);
    setVaultKey(key);
    setStatus('unlocked');
  }, [account, loadItems]);

  const lock = useCallback(() => {
    setVaultKey(null);
    setItems([]);
    setStatus(account ? 'locked' : 'new');
  }, [account]);

  // Opens the vault with the recovery key and re-wraps it under a new master password.
  const recover = useCallback(async (recoveryKey, newPassword) => {
    let key;
    try {
      key = await unwrapVaultKey(account.recoveryWrappedKey, await recoveryWrappingKey(recoveryKey), true);
    } catch {
      throw new Error('Recovery key tidak cocok.');
    }
    const salt = generateSalt();
    const masterKey = await deriveMasterKey(newPassword, salt);
    const acc = { ...account, salt: toBase64(salt), iterations: KDF_ITERATIONS, wrappedKey: await wrapVaultKey(key, masterKey) };
    await db.saveAccount(acc);
    setAccount(acc);
    await loadItems(key);
    setVaultKey(key);
    setStatus('unlocked');
  }, [account, loadItems]);

  const saveItem = useCallback(async (item) => {
    const id = item.id ?? crypto.randomUUID();
    const { id: _, updatedAt: __, ...plain } = item;
    const updatedAt = Date.now();
    await db.putEncryptedItem({ id, updatedAt, ...(await encryptJSON(plain, vaultKey)) });
    setItems((prev) => [...prev.filter((i) => i.id !== id), { ...plain, id, updatedAt }].sort((a, b) => a.name.localeCompare(b.name)));
    return id;
  }, [vaultKey]);

  const deleteItem = useCallback(async (id) => {
    await db.deleteEncryptedItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const resetAll = useCallback(async () => {
    await db.wipeAll();
    setAccount(null);
    setVaultKey(null);
    setItems([]);
    setStatus('new');
  }, []);

  const value = { status, account, items, register, unlock, lock, recover, saveItem, deleteItem, resetAll };
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
