import { openDB } from 'idb';

// Phase 1: everything lives in this browser. Only ciphertext and KDF params are stored.
const dbPromise = openDB('sealbox', 1, {
  upgrade(db) {
    db.createObjectStore('meta');
    db.createObjectStore('items', { keyPath: 'id' });
  },
});

export async function getAccount() {
  return (await dbPromise).get('meta', 'account');
}

export async function saveAccount(account) {
  return (await dbPromise).put('meta', account, 'account');
}

export async function getEncryptedItems() {
  return (await dbPromise).getAll('items');
}

export async function putEncryptedItem(record) {
  return (await dbPromise).put('items', record);
}

export async function deleteEncryptedItem(id) {
  return (await dbPromise).delete('items', id);
}

export async function wipeAll() {
  const db = await dbPromise;
  await db.clear('items');
  await db.clear('meta');
}
