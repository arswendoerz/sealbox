import { openDB } from 'idb';

// Only ciphertext and wrapped keys are stored here.
//   meta/account + items -> Phase 1 local vault (kept only until it's migrated online)
//   cache/<userId>       -> offline copy of the online profile and encrypted items
//   auth/<key>           -> extension only: the Supabase session. The extension's IndexedDB
//                           can't be read by content scripts, unlike chrome.storage.local.
const dbPromise = openDB('sealbox', 3, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('meta');
      db.createObjectStore('items', { keyPath: 'id' });
    }
    if (oldVersion < 2) db.createObjectStore('cache');
    if (oldVersion < 3) db.createObjectStore('auth');
  },
});

export async function getAuth(key) {
  return (await dbPromise).get('auth', key);
}

export async function setAuth(key, value) {
  return (await dbPromise).put('auth', value, key);
}

export async function removeAuth(key) {
  return (await dbPromise).delete('auth', key);
}

export async function getLegacyVault() {
  const db = await dbPromise;
  const account = await db.get('meta', 'account');
  return account ? { account, items: await db.getAll('items') } : null;
}

export async function deleteLegacyVault() {
  const db = await dbPromise;
  await db.clear('items');
  await db.delete('meta', 'account');
}

export async function getCache(userId) {
  return (await dbPromise).get('cache', userId);
}

export async function setCache(userId, value) {
  return (await dbPromise).put('cache', value, userId);
}

export async function clearCache() {
  return (await dbPromise).clear('cache');
}
