// Time-based one-time passwords (RFC 6238 / RFC 4226) with Web Crypto. No dependencies, so the
// extension's service worker can use it too.

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ALGS = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

export function base32Decode(input) {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!clean || /[^A-Z2-7]/.test(clean)) throw new Error('Secret 2FA tidak valid (harus base32: huruf A–Z dan angka 2–7).');
  const out = [];
  let bits = 0;
  let value = 0;
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// Accepts a bare base32 secret or an otpauth://totp/... URI (as in the QR code).
// Returns { secret, digits, period, algorithm, issuer?, account? }.
export function parseTotp(input) {
  const text = input.trim();
  if (/^otpauth:/i.test(text)) {
    const u = new URL(text);
    if (u.host.toLowerCase() !== 'totp') throw new Error('Hanya kode berbasis waktu (TOTP) yang didukung.');
    const p = u.searchParams;
    const label = decodeURIComponent(u.pathname.slice(1));
    const [issuer, account] = label.includes(':') ? label.split(':', 2) : [p.get('issuer'), label];
    const cfg = {
      secret: (p.get('secret') ?? '').toUpperCase().replace(/\s/g, ''),
      digits: Number(p.get('digits') ?? 6),
      period: Number(p.get('period') ?? 30),
      algorithm: (p.get('algorithm') ?? 'SHA1').toUpperCase(),
      issuer: p.get('issuer') ?? issuer ?? undefined,
      account: account || undefined,
    };
    validate(cfg);
    return cfg;
  }
  const cfg = { secret: text.toUpperCase().replace(/[\s-]/g, ''), digits: 6, period: 30, algorithm: 'SHA1' };
  validate(cfg);
  return cfg;
}

function validate(cfg) {
  base32Decode(cfg.secret);
  if (![6, 7, 8].includes(cfg.digits)) throw new Error('Jumlah digit 2FA tidak didukung.');
  if (!(cfg.period >= 10 && cfg.period <= 120)) throw new Error('Periode 2FA tidak didukung.');
  if (!ALGS[cfg.algorithm]) throw new Error('Algoritma 2FA tidak didukung.');
}

// { code, remaining (seconds), period } for the stored value (secret or otpauth URI).
export async function totpCode(stored, now = Date.now()) {
  const cfg = parseTotp(stored);
  const counter = Math.floor(now / 1000 / cfg.period);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const key = await crypto.subtle.importKey('raw', base32Decode(cfg.secret), { name: 'HMAC', hash: ALGS[cfg.algorithm] }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  const code = String(bin % 10 ** cfg.digits).padStart(cfg.digits, '0');
  const remaining = cfg.period - (Math.floor(now / 1000) % cfg.period);
  return { code, remaining, period: cfg.period };
}

export const formatCode = (code) => (code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code);
