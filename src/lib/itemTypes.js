import { parseUrl } from './url.js';

// Item kinds. Items saved before types existed have none and are logins.
export const TYPES = {
  login: { label: 'Login', icon: 'key' },
  card: { label: 'Kartu', icon: 'credit-card' },
  note: { label: 'Catatan', icon: 'note' },
  identity: { label: 'Identitas', icon: 'id' },
};

export const typeOf = (item) => (TYPES[item?.type] ? item.type : 'login');

// Text fields each kind uses (besides name, folder, notes, favorite).
export const TYPE_FIELDS = {
  login: ['url', 'username', 'password', 'totp', 'rules'],
  card: ['cardholder', 'cardNumber', 'cardExpiry', 'cardCvv'],
  note: [],
  identity: ['fullName', 'email', 'phone', 'address', 'idNumber'],
};

export const ALL_TEXT_FIELDS = ['name', 'folder', 'notes', ...new Set(Object.values(TYPE_FIELDS).flat())];

export const last4 = (n) => (n ?? '').replace(/\D/g, '').slice(-4);

export function cardBrand(number) {
  const n = (number ?? '').replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^35/.test(n)) return 'jcb';
  return null;
}

// Second line in lists.
export function subtitle(item) {
  switch (typeOf(item)) {
    case 'card': return `Kartu${last4(item.cardNumber) ? ` · •••• ${last4(item.cardNumber)}` : ''}`;
    case 'note': return 'Catatan aman';
    case 'identity': return item.fullName || item.email || 'Identitas';
    default: return [item.username || '—', parseUrl(item.url)?.hostname].filter(Boolean).join(' · ');
  }
}

// Strings searched by the list filter and the command palette.
export const searchText = (i) => [i.name, i.username, i.url, i.fullName, i.email, i.cardholder, i.folder].filter(Boolean).join(' ').toLowerCase();
