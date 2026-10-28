import { randomInt } from '../crypto/encoding.js';

// Site password rules in Apple's `passwordrules` syntax, e.g.
//   "minlength: 8; maxlength: 20; required: lower, upper; required: digit; allowed: [-!@#];"
// https://developer.apple.com/password-rules/

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT = '0123456789';
const SPECIAL = '-~!@#$%^&*_+=`|(){}[:;"\'<>,.?]/\\'; // printable ASCII minus letters, digits and space

const CLASSES = {
  lower: [LOWER, 'huruf kecil'],
  upper: [UPPER, 'huruf besar'],
  digit: [DIGIT, 'angka'],
  special: [SPECIAL, 'simbol'],
  'ascii-printable': [LOWER + UPPER + DIGIT + SPECIAL, 'semua karakter'],
  unicode: [LOWER + UPPER + DIGIT + SPECIAL, 'semua karakter'],
};

const unique = (s) => [...new Set(s)].join('');

// "lower, upper, [-!@]" -> { chars, label }
function parseClasses(value) {
  const chars = [];
  const labels = [];
  let i = 0;
  while (i < value.length) {
    const c = value[i];
    if (c === ',' || c === ' ') { i++; continue; }
    if (c === '[') {
      // A literal "]" may only appear last, so "]]" closes the set after adding "]".
      let j = i + 1;
      let set = '';
      while (j < value.length && value[j] !== ']') set += value[j++];
      if (value[j + 1] === ']') { set += ']'; j++; }
      chars.push(set);
      labels.push(set);
      i = j + 1;
      continue;
    }
    const m = /^[a-z-]+/.exec(value.slice(i));
    if (!m) { i++; continue; }
    const cls = CLASSES[m[0]];
    if (cls) { chars.push(cls[0]); labels.push(cls[1]); }
    i += m[0].length;
  }
  return { chars: unique(chars.join('')), label: labels.join(' atau ') };
}

// Splits on ";" outside of [...] sets.
function splitRules(text) {
  const parts = [];
  let cur = '';
  let inSet = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '[' && !inSet) inSet = true;
    else if (c === ']' && inSet && text[i + 1] !== ']') inSet = false;
    if (c === ';' && !inSet) { parts.push(cur); cur = ''; } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

// Returns null for empty input. Unknown properties are ignored.
export function parseRules(text) {
  if (!text?.trim()) return null;
  const rules = { minLength: null, maxLength: null, maxConsecutive: null, required: [], allowed: '' };
  for (const part of splitRules(text)) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (name === 'minlength') rules.minLength = parseInt(value, 10) || null;
    else if (name === 'maxlength') rules.maxLength = parseInt(value, 10) || null;
    else if (name === 'max-consecutive') rules.maxConsecutive = parseInt(value, 10) || null;
    else if (name === 'required') { const g = parseClasses(value); if (g.chars) rules.required.push(g); }
    else if (name === 'allowed') rules.allowed += parseClasses(value).chars;
  }
  // Characters a password may use: allowed + every required set; nothing listed means all printable.
  const pool = unique(rules.allowed + rules.required.map((g) => g.chars).join(''));
  rules.pool = pool || CLASSES['ascii-printable'][0];
  return rules;
}

function longestRun(pw) {
  let best = 0;
  let run = 0;
  for (let i = 0; i < pw.length; i++) {
    run = i > 0 && pw[i] === pw[i - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

// Human-readable list of what `pw` breaks. Empty array = OK.
export function checkRules(pw, rules) {
  if (!rules || !pw) return [];
  const out = [];
  if (rules.minLength && pw.length < rules.minLength) out.push(`Minimal ${rules.minLength} karakter`);
  if (rules.maxLength && pw.length > rules.maxLength) out.push(`Maksimal ${rules.maxLength} karakter`);
  const bad = unique([...pw].filter((c) => !rules.pool.includes(c)).join(''));
  if (bad) out.push(`Karakter tidak diizinkan: ${[...bad].slice(0, 10).join(' ')}${bad.length > 10 ? ' …' : ''}`);
  for (const g of rules.required) {
    if (![...pw].some((c) => g.chars.includes(c))) out.push(`Wajib ada ${g.label}`);
  }
  if (rules.maxConsecutive && longestRun(pw) > rules.maxConsecutive) out.push(`Maksimal ${rules.maxConsecutive} karakter sama berturut-turut`);
  return out;
}

export function describeRules(rules) {
  if (!rules) return '';
  const parts = [];
  const { minLength: min, maxLength: max } = rules;
  if (min && max) parts.push(min === max ? `${min} karakter` : `${min}–${max} karakter`);
  else if (min) parts.push(`minimal ${min} karakter`);
  else if (max) parts.push(`maksimal ${max} karakter`);
  if (rules.required.length) parts.push(`wajib: ${rules.required.map((g) => g.label).join('; ')}`);
  if (rules.allowed && !rules.required.length) parts.push(`hanya: ${describePool(rules.pool)}`);
  if (rules.maxConsecutive) parts.push(`maks ${rules.maxConsecutive} karakter sama berturut-turut`);
  return parts.join(' · ');
}

function describePool(pool) {
  const names = Object.entries({ lower: LOWER, upper: UPPER, digit: DIGIT })
    .filter(([, set]) => [...set].every((c) => pool.includes(c)))
    .map(([k]) => CLASSES[k][1]);
  const rest = [...pool].filter((c) => !LOWER.includes(c) && !UPPER.includes(c) && !DIGIT.includes(c)).join('');
  return [...names, rest && `simbol ${rest}`].filter(Boolean).join(', ');
}

// Random password that satisfies the rules: one char from each required set, the rest from the
// pool, shuffled. Retries to honour max-consecutive. `length` is clamped to the rules.
export function generateWithRules(rules, length = 20) {
  const len = Math.max(rules.minLength ?? 1, rules.required.length, Math.min(length, rules.maxLength ?? 128));
  for (let attempt = 0; attempt < 100; attempt++) {
    const chars = rules.required.map((g) => g.chars[randomInt(g.chars.length)]);
    while (chars.length < len) chars.push(rules.pool[randomInt(rules.pool.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const value = chars.join('');
    if (!checkRules(value, rules).length) return { value, bits: len * Math.log2(rules.pool.length) };
  }
  throw new Error('Aturan ini tidak bisa dipenuhi.');
}

// { domain, rules } for a host or one of its parents in `db` (domain -> rules string), or null.
export function rulesForHost(host, db) {
  for (let h = host.replace(/^www\./, ''); h.includes('.'); h = h.slice(h.indexOf('.') + 1)) {
    if (db[h]) return { domain: h, rules: db[h] };
  }
  return null;
}

// Rules for a URL from Apple's password-manager-resources (MIT), loaded on demand.
export async function knownRulesFor(url) {
  let host;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
  const { default: db } = await import('../data/apple-password-rules.json');
  return rulesForHost(host, db);
}

// Used when a site has no known rules: 20 chars with every character class.
export const DEFAULT_RULES = 'minlength: 20; required: lower; required: upper; required: digit; required: [-~!@#$%^&*_+=?];';

export const RULE_PRESETS = [
  { label: 'PIN 6 digit', rules: 'minlength: 6; maxlength: 6; required: digit;' },
  { label: 'Tanpa simbol', rules: 'required: lower; required: upper; required: digit;' },
  { label: 'Maks 16 karakter', rules: 'minlength: 8; maxlength: 16; required: lower; required: upper; required: digit; required: special;' },
];
