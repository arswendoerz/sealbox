// The only extension context that touches the vault key or Supabase. The popup talks to it by message.
import { supabase } from '../../src/lib/supabase.js';
import { deriveAccountKeys, normalizeEmail } from '../../src/crypto/kdf.js';
import { unwrapVaultKey } from '../../src/crypto/keys.js';
import { toBase64, fromBase64 } from '../../src/crypto/encoding.js';
import { pull, decryptRecords } from '../../src/lib/vaultData.js';
import { mfaPending, verifySecondFactor } from '../../src/lib/mfa.js';
import { clearCache } from '../../src/lib/db.js';

const AUTO_LOCK_MINUTES = 5;
const CLIPBOARD_SECONDS = 30;

// The service worker is stopped after ~30 s idle, so the vault key can't live in a variable.
// storage.session is memory-only, gone when the browser closes, and hidden from content scripts.
async function getKey() {
  const { vaultKey } = await chrome.storage.session.get('vaultKey');
  return vaultKey && crypto.subtle.importKey('raw', fromBase64(vaultKey), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function setKey(key) {
  await chrome.storage.session.set({ vaultKey: toBase64(await crypto.subtle.exportKey('raw', key)) });
  touch();
}

const touch = () => chrome.alarms.create('autolock', { delayInMinutes: AUTO_LOCK_MINUTES });

async function lock() {
  await chrome.storage.session.remove('vaultKey');
  await chrome.alarms.clear('autolock');
  return {};
}

async function session() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function state() {
  const s = await session();
  if (!s) return { status: 'signedOut' };
  const unlocked = !!(await chrome.storage.session.get('vaultKey')).vaultKey;
  if (unlocked) touch();
  return { status: unlocked ? 'unlocked' : 'locked', email: s.user.email };
}

// Sign in (if needed) and unlock. Returns { mfa: true } when a 2FA code is still required;
// the popup then sends the same request again with `code`.
async function open({ email, password, code }) {
  let s = await session();
  const mail = normalizeEmail(email || s?.user.email || '');
  const { masterKey, authHash } = await deriveAccountKeys(mail, password);
  if (!s || normalizeEmail(s.user.email) !== mail) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: mail, password: authHash });
    if (error) {
      if (/confirm/i.test(error.message)) throw new Error('Email belum dikonfirmasi. Cek kotak masuk Anda.');
      if (/invalid/i.test(error.message)) throw new Error('Email atau master password salah.');
      throw new Error(error.message);
    }
    s = data.session;
  }
  if (await mfaPending()) {
    if (!code) return { mfa: true };
    await verifySecondFactor(code);
  }
  const { profile } = await pull(s.user.id);
  let key;
  try {
    key = await unwrapVaultKey(profile.wrapped_key, masterKey, true); // extractable so it fits in storage.session
  } catch {
    throw new Error('Master password salah.');
  }
  await setKey(key);
  return {};
}

async function items() {
  const key = await getKey();
  if (!key) throw new Error('Vault terkunci.');
  touch();
  const { records, offline } = await pull((await session()).user.id);
  return { items: await decryptRecords(records, key), offline };
}

async function signOut() {
  await lock();
  await clearCache();
  await supabase.auth.signOut();
  return {};
}

async function clearClipboardLater() {
  await chrome.alarms.create('clipboard', { delayInMinutes: CLIPBOARD_SECONDS / 60 });
  return {};
}

async function clearClipboard() {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD'], justification: 'Menghapus password yang disalin dari clipboard.' });
  }
  await chrome.runtime.sendMessage({ target: 'offscreen', type: 'clearClipboard' });
  await chrome.offscreen.closeDocument();
}

const handlers = { state, open, items, lock, signOut, clearClipboardLater };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only the extension's own pages (popup). Content scripts (sender.tab) get nothing in M1.
  if (sender.id !== chrome.runtime.id || sender.tab || !handlers[msg?.type]) return false;
  handlers[msg.type](msg).then((r) => reply({ ok: true, ...r }), (err) => reply({ ok: false, error: err.message }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autolock') lock();
  if (alarm.name === 'clipboard') clearClipboard().catch(() => {});
});
