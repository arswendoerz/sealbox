import { openDB } from 'idb';

// Only ciphertext and wrapped keys are stored here.
//   meta/account + items -> Phase 1 local vault (kept only until it's migrated online)
//   cache/<userId>       -> offline copy of the online profile and encrypted items
const dbPromise = openDB('sealbox', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('meta');
      db.createObjectStore('items', { keyPath: 'id' });
    }
    if (oldVersion < 2) db.createObjectStore('cache');
  },
});

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
