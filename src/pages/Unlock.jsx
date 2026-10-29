import { useEffect, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { Avatar } from '../components/Avatar.jsx';

function ago(t) {
  const min = Math.round((Date.now() - t) / 60_000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} menit lalu`;
  return `${Math.round(min / 60)} jam lalu`;
}

export function Unlock({ onRecover }) {
  const { user, unlock, signOut, lockedAt } = useVault();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await unlock(pw);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <img className="logo" src="/logo.svg" alt="" />
        <h3>Vault terkunci</h3>
        <p className="sub">Masukkan master password untuk membuka.</p>
        <div className="who">
          <Avatar name={user?.email ?? '?'} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>{user?.email}</b>
            <small>{lockedAt ? `Dikunci ${ago(lockedAt)}` : 'Sesi tersimpan di perangkat ini'}</small>
          </div>
        </div>
        <form onSubmit={submit}>
          <label className="f">Master password</label>
          <PasswordInput autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" aria-label="Master password" />
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy || !pw}><i className="ti ti-lock-open" /> {busy ? 'Membuka…' : 'Buka vault'}</button>
        </form>
        <p className="sub" style={{ margin: '16px 0 0' }}>
          <button className="link" onClick={onRecover}>Lupa master password?</button>
          {' · '}
          <button className="link" style={{ color: 'var(--muted)' }} onClick={signOut}>Bukan Anda? Keluar</button>
        </p>
      </div>
    </div>
  );
}
