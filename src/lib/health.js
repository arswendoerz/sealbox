import { estimateBits, strength } from '../crypto/generator.js';
import { utf8 } from '../crypto/encoding.js';

const DAY = 24 * 60 * 60 * 1000;
export const OLD_AFTER_DAYS = 365;

// Per item with a password: { item, weak, reusedWith (other item count), ageDays }.
export function analyze(items, now = Date.now()) {
  const withPw = items.filter((i) => i.password);
  const byPassword = new Map();
  for (const i of withPw) byPassword.set(i.password, (byPassword.get(i.password) ?? 0) + 1);
  return withPw.map((item) => ({
    item,
    weak: strength(estimateBits(item.password)).level <= 2,
    reusedWith: byPassword.get(item.password) - 1,
    ageDays: Math.floor((now - (item.passwordChangedAt ?? item.updatedAt)) / DAY),
  }));
}

async function sha1Hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', utf8.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Have I Been Pwned range API (k-anonymity): only the first 5 hex chars of the SHA-1 leave the
// browser, and padding hides how many real matches the response holds. Returns times seen in breaches.
export async function pwnedCount(password) {
  const hash = await sha1Hex(password);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
  if (!res.ok) throw new Error(`Layanan cek kebocoran sedang bermasalah (${res.status}).`);
  const suffix = hash.slice(5);
  for (const line of (await res.text()).split('\n')) {
    const [s, count] = line.trim().split(':');
    if (s === suffix) return Number(count); // padding rows have count 0
  }
  return 0;
}

// Checks each distinct password once, a few at a time. Returns Map(password -> count).
export async function checkBreaches(passwords, onProgress) {
  const unique = [...new Set(passwords)];
  const result = new Map();
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const pw = unique[next++];
      result.set(pw, await pwnedCount(pw));
      onProgress?.(result.size, unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, worker));
  return result;
}
