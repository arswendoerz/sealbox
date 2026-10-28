// The only extension context that touches the vault key or Supabase. The popup talks to it by message.
import { supabase } from '../../src/lib/supabase.js';
import { deriveAccountKeys, normalizeEmail } from '../../src/crypto/kdf.js';
import { unwrapVaultKey } from '../../src/crypto/keys.js';
import { toBase64, fromBase64 } from '../../src/crypto/encoding.js';
import { pull, decryptRecords } from '../../src/lib/vaultData.js';
import { mfaPending, verifySecondFactor } from '../../src/lib/mfa.js';
import { encryptJSON } from '../../src/crypto/aes.js';
import { clearCache, getCache, setCache } from '../../src/lib/db.js';
import { siteOf, itemMatches } from './site.js';
import { decide, newItem } from './saveLogin.js';

const AUTO_LOCK_MINUTES = 5;
const CLIPBOARD_SECONDS = 30;
const PENDING_MS = 3 * 60 * 1000; // how long a submitted login waits for "Simpan"
const USERNAME_MS = 5 * 60 * 1000; // step 1 of a two-step login (email first, password next)

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

// Decrypted items for page requests: from the local cache, so focusing a field doesn't hit the network.
async function cachedItems() {
  const key = await getKey();
  if (!key) return null;
  const s = await session();
  const cached = s && (await getCache(s.user.id));
  const records = cached?.records ?? (await pull(s.user.id)).records;
  return decryptRecords(records, key);
}

// The page a content script runs in. A frame from another site than the tab gets nothing, so a
// page can't embed someone else's login form to have it filled.
function pageOf(sender) {
  const frame = siteOf(sender.url);
  const top = siteOf(sender.tab?.url);
  return frame && top && frame.site === top.site ? frame : null;
}

// Names and usernames only; passwords leave the background one at a time, on a click.
async function matches(_msg, sender) {
  const page = pageOf(sender);
  if (!page) return { blocked: true };
  const all = await cachedItems();
  if (!all) return { locked: true };
  touch();
  return { items: all.filter((i) => itemMatches(i.url, page)).map(({ id, name, username }) => ({ id, name, username })) };
}

async function credentialFor(id, page) {
  const item = (await cachedItems())?.find((i) => i.id === id);
  if (!item || !itemMatches(item.url, page)) throw new Error('Item ini bukan untuk situs ini.');
  touch();
  return { username: item.username ?? '', password: item.password ?? '' };
}

async function fill({ id }, sender) {
  const page = pageOf(sender);
  if (!page) throw new Error('Isi otomatis tidak tersedia di sini.');
  return credentialFor(id, page);
}

// From the popup: fill the active tab's top frame.
async function fillActiveTab({ id }) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const cred = await credentialFor(id, siteOf(tab?.url));
  const message = { type: 'sealbox:fill', ...cred };
  try {
    await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
  } catch {
    // Tab opened before the extension was installed: inject the content script, then retry.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 });
  }
  return {};
}

// ---- Saving logins ----
// A submitted login waits in storage.session (memory only, hidden from content scripts) per tab
// until the user answers the banner or the popup card.

const pendingKey = (tabId) => `pending:${tabId}`;
const userKey = (tabId) => `user:${tabId}`;

async function sessionValue(key) {
  return (await chrome.storage.session.get(key))[key];
}

async function putItem({ id, updatedAt: _, ...plain }) {
  const key = await getKey();
  if (!key) throw new Error('Vault terkunci.');
  const s = await session();
  const row = { id, user_id: s.user.id, updated_at: new Date().toISOString(), ...(await encryptJSON(plain, key)) };
  const { error } = await supabase.from('vault_items').upsert(row);
  if (error) throw new Error(`Gagal menyimpan: ${error.message}`);
  const cached = await getCache(s.user.id);
  if (cached) await setCache(s.user.id, { ...cached, records: [...cached.records.filter((r) => r.id !== id), row] });
}

async function rememberUsername({ username }, sender) {
  const page = pageOf(sender);
  if (page && username?.trim()) await chrome.storage.session.set({ [userKey(sender.tab.id)]: { site: page.site, username: username.trim(), at: Date.now() } });
  return {};
}

async function captured({ username = '', password }, sender) {
  const page = pageOf(sender);
  if (!page || !password) return {};
  const { neverSave = [] } = await chrome.storage.local.get('neverSave');
  if (neverSave.includes(page.site)) return {};
  const tabId = sender.tab.id;
  let user = username.trim();
  const step1 = await sessionValue(userKey(tabId));
  if (!user && step1?.site === page.site && Date.now() - step1.at < USERNAME_MS) user = step1.username;
  await chrome.storage.session.set({ [pendingKey(tabId)]: { url: sender.url, username: user, password, at: Date.now() } });
  // Single-page logins don't navigate: tell the top frame to ask once the page has settled.
  setTimeout(() => chrome.tabs.sendMessage(tabId, { type: 'sealbox:offer-ready' }, { frameId: 0 }).catch(() => {}), 1500);
  return {};
}

// What to show for a tab: {} (nothing), { offer: { locked, host } } or { offer: { kind, host, username } }.
async function offerFor(tabId, tabUrl) {
  const p = await sessionValue(pendingKey(tabId));
  if (!p) return {};
  if (Date.now() - p.at > PENDING_MS) {
    await chrome.storage.session.remove(pendingKey(tabId));
    return {};
  }
  const from = siteOf(p.url);
  const page = siteOf(tabUrl);
  if (!page || page.site !== from.site) return {}; // left the site (e.g. SSO): don't offer here
  const items = await cachedItems();
  if (!items) return { offer: { locked: true, host: from.host } };
  const d = decide(p, items);
  if (!d) {
    await chrome.storage.session.remove(pendingKey(tabId));
    return {};
  }
  return { offer: { kind: d.kind, host: from.host, username: p.username } };
}

// choice: 'save' (save or update), 'never' (this site) or 'dismiss'.
async function respondFor(tabId, tabUrl, choice) {
  const p = await sessionValue(pendingKey(tabId));
  if (!p) return {};
  const from = siteOf(p.url);
  if (choice === 'never') {
    const { neverSave = [] } = await chrome.storage.local.get('neverSave');
    await chrome.storage.local.set({ neverSave: [...new Set([...neverSave, from.site])] });
  }
  if (choice !== 'save') {
    await chrome.storage.session.remove(pendingKey(tabId));
    return {};
  }
  const page = siteOf(tabUrl);
  if (!page || page.site !== from.site) throw new Error('Halaman sudah berpindah ke situs lain.');
  const items = await cachedItems();
  if (!items) throw new Error('Vault terkunci.');
  const d = decide(p, items);
  if (d?.kind === 'update') await putItem({ ...d.item, password: p.password, passwordChangedAt: Date.now() });
  else if (d?.kind === 'save') await putItem(newItem(p));
  await chrome.storage.session.remove(pendingKey(tabId)); // kept until saved, so a failed save can be retried
  touch();
  return { saved: !!d };
}

const topFrameOnly = (sender) => {
  if (sender.frameId !== 0) throw new Error('Hanya untuk frame utama.');
};

async function pendingOffer(_msg, sender) {
  topFrameOnly(sender);
  return offerFor(sender.tab.id, sender.tab.url);
}

async function respond({ choice }, sender) {
  topFrameOnly(sender);
  return respondFor(sender.tab.id, sender.tab.url, choice);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pendingForActiveTab() {
  const tab = await activeTab();
  return tab?.url ? offerFor(tab.id, tab.url) : {};
}

async function respondForActiveTab({ choice }) {
  const tab = await activeTab();
  return respondFor(tab.id, tab.url, choice);
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove([pendingKey(tabId), userKey(tabId)]));

async function openPopup() {
  await chrome.action.openPopup();
  return {};
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

// Extension pages (popup) can do everything; content scripts (sender.tab set) only these.
const popupHandlers = { state, open, items, lock, signOut, clearClipboardLater, fillActiveTab, pendingForActiveTab, respondForActiveTab };
const pageHandlers = { matches, fill, openPopup, captured, rememberUsername, pendingOffer, respond };

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handler = (sender.tab ? pageHandlers : popupHandlers)[msg?.type];
  if (!handler) return false;
  handler(msg, sender).then((r) => reply({ ok: true, ...r }), (err) => reply({ ok: false, error: err.message }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autolock') lock();
  if (alarm.name === 'clipboard') clearClipboard().catch(() => {});
});
