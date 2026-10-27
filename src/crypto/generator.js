import { randomInt } from './encoding.js';
import { WORDS } from './wordlist.js';

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+?';

export function randomPassword({ length = 20, upper = true, digits = true, symbols = true } = {}) {
  const pool = LOWER + (upper ? UPPER : '') + (digits ? DIGITS : '') + (symbols ? SYMBOLS : '');
  const value = Array.from({ length }, () => pool[randomInt(pool.length)]).join('');
  return { value, bits: length * Math.log2(pool.length) };
}

export function passphrase({ words = 4, capitalize = true, number = true, separator = '-' } = {}) {
  const picked = Array.from({ length: words }, () => WORDS[randomInt(WORDS.length)]);
  const parts = picked.map((w) => (capitalize ? w[0].toUpperCase() + w.slice(1) : w));
  const n = number ? String(randomInt(90) + 10) : '';
  if (number) parts.push(n);
  const hint = `Bayangkan: ${picked.join(', ')}${number ? `, nomor ${n}` : ''}.`;
  const bits = words * Math.log2(WORDS.length) + (number ? Math.log2(90) : 0);
  return { value: parts.join(separator), bits, hint };
}

// Rough entropy estimate for a password the user typed (upper bound, not a guarantee).
export function estimateBits(pw) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  return pw.length * Math.log2(pool);
}

export function strength(bits) {
  if (bits < 40) return { label: 'Lemah', level: 1 };
  if (bits < 60) return { label: 'Sedang', level: 2 };
  if (bits < 80) return { label: 'Kuat', level: 3 };
  return { label: 'Sangat kuat', level: 4 };
}

// Offline guessing at 1e10 guesses/second, half the keyspace on average.
export function crackTime(bits) {
  const years = 2 ** (bits - 1) / 1e10 / 31_536_000;
  if (years < 1) return 'kurang dari 1 tahun';
  if (years < 1e6) return `${Math.round(years).toLocaleString('id')} tahun`;
  return 'lebih dari 1 juta tahun';
}
