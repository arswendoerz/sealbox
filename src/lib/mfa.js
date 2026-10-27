import { supabase } from './supabase.js';

const mfa = supabase.auth.mfa;

function fail(error) {
  const messages = {
    mfa_verification_failed: 'Kode salah atau sudah kedaluwarsa.',
    mfa_challenge_expired: 'Kode sudah kedaluwarsa. Coba lagi.',
    mfa_recovery_codes_locked: 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.',
    mfa_totp_enroll_not_enabled: '2FA belum diaktifkan di server Supabase.',
  };
  throw new Error(messages[error.code] ?? error.message);
}

const recoveryCodeLike = (code) => code.replace(/[\s-]/g, '').length > 6;

// True when the account has 2FA but this session hasn't passed it yet (RLS hides the vault until then).
export async function mfaPending() {
  const { data } = await mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

// Upgrades the session to aal2 with a 6-digit TOTP code or a one-time recovery code.
export async function verifySecondFactor(code) {
  if (recoveryCodeLike(code)) {
    const { error } = await mfa.recoveryCodes.verify({ code });
    if (error) fail(error);
    return;
  }
  const { data, error } = await mfa.listFactors();
  if (error) fail(error);
  const factor = data.totp[0];
  if (!factor) throw new Error('Akun ini tidak memakai 2FA.');
  const res = await mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
  if (res.error) fail(res.error);
}

export async function mfaStatus() {
  const { data, error } = await mfa.listFactors();
  if (error) fail(error);
  const factor = data.totp[0];
  if (!factor) return { enabled: false };
  const rc = await mfa.recoveryCodes.getStatus();
  return { enabled: true, factorId: factor.id, recovery: rc.error ? null : rc.data };
}

// Returns the QR code (SVG data URI) and secret for the authenticator app.
export async function startEnroll() {
  const { data: list } = await mfa.listFactors();
  for (const f of list?.all ?? []) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await mfa.unenroll({ factorId: f.id }); // abandoned attempts
  }
  const { data, error } = await mfa.enroll({ factorType: 'totp', friendlyName: 'Sealbox', issuer: 'Sealbox' });
  if (error) fail(error);
  // supabase-js prefixes the raw SVG without URL-encoding it; a `#` (e.g. in fill="#000") would cut it off.
  const svg = data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, '');
  const qr = svg.startsWith('<') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : data.totp.qr_code;
  return { factorId: data.id, qr, secret: data.totp.secret };
}

// Verifies the first code, then tries to create recovery codes (null if the server doesn't support them).
export async function confirmEnroll(factorId, code) {
  const res = await mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (res.error) fail(res.error);
  const rc = await mfa.recoveryCodes.generate({ friendlyName: 'Sealbox recovery codes' });
  return rc.error ? null : rc.data.codes;
}

export async function regenerateRecoveryCodes() {
  const { data, error } = await mfa.recoveryCodes.regenerate();
  if (error) {
    if (error.code !== 'mfa_factor_not_found') fail(error);
    const rc = await mfa.recoveryCodes.generate({ friendlyName: 'Sealbox recovery codes' });
    if (rc.error) fail(rc.error);
    return rc.data.codes;
  }
  return data.codes;
}

// Asks for a current code even though the session is already aal2, so an unattended unlocked
// vault can't have 2FA switched off.
export async function disableMfa(factorId, code) {
  const res = await mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (res.error) fail(res.error);
  const rc = await mfa.recoveryCodes.unenroll(); // must go first: recovery codes can't be the only factor
  if (rc.error && rc.error.code !== 'mfa_factor_not_found') fail(rc.error);
  const { error } = await mfa.unenroll({ factorId });
  if (error) fail(error);
}

export const formatRecoveryCode = (code) => code.match(/.{1,4}/g).join('-');
