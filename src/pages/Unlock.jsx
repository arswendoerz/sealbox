import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';

export function Unlock({ onRecover }) {
  const { user, unlock, signOut } = useVault();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
        <p className="sub">{user?.email}</p>
        <form onSubmit={submit}>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Master password" autoComplete="current-password" />
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy || !pw}><i className="ti ti-lock-open" /> {busy ? 'Membuka…' : 'Buka vault'}</button>
        </form>
        <p style={{ margin: '16px 0 6px' }}><button className="link" onClick={onRecover}>Lupa master password?</button></p>
        <p style={{ margin: 0 }}><button className="link" style={{ color: 'var(--muted)' }} onClick={signOut}>Keluar dari akun</button></p>
      </div>
    </div>
  );
}
