import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';

export function VerifyMfa() {
  const { user, completeMfa, signOut } = useVault();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await completeMfa(code);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <i className="ti ti-device-mobile-check" style={{ fontSize: 44, color: 'var(--brand)' }} />
        <h3>Verifikasi 2FA</h3>
        <p className="sub">{user?.email}</p>
        <form onSubmit={submit}>
          {useRecovery ? (
            <>
              <label className="f">Recovery code 2FA</label>
              <input className="mono" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" autoComplete="off" />
              <p className="hint">Tiap recovery code hanya bisa dipakai sekali.</p>
            </>
          ) : (
            <>
              <label className="f">Kode 6 digit dari aplikasi authenticator</label>
              <input className="mono" autoFocus required inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" style={{ fontSize: 20, letterSpacing: 4, textAlign: 'center' }} />
            </>
          )}
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy || !code.trim()}><i className="ti ti-lock-open" /> {busy ? 'Memeriksa…' : 'Verifikasi'}</button>
        </form>
        <p style={{ margin: '16px 0 6px' }}>
          <button className="link" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>
            {useRecovery ? 'Pakai kode authenticator' : 'HP hilang? Pakai recovery code'}
          </button>
        </p>
        <p style={{ margin: 0 }}><button className="link" style={{ color: 'var(--muted)' }} onClick={signOut}>Keluar dari akun</button></p>
      </div>
    </div>
  );
}
