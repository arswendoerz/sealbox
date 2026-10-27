import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';

export function Unlock({ onRecover }) {
  const { account, unlock, resetAll } = useVault();
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

  async function reset() {
    if (confirm('Hapus vault dari perangkat ini? Semua item akan hilang permanen dan tidak bisa dipulihkan.')) await resetAll();
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <img className="logo" src="/logo.svg" alt="" />
        <h3>Vault terkunci</h3>
        <p className="sub">{account.email}</p>
        <form onSubmit={submit}>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Master password" autoComplete="current-password" />
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy || !pw}><i className="ti ti-lock-open" /> {busy ? 'Membuka…' : 'Buka vault'}</button>
        </form>
        <p style={{ margin: '16px 0 6px' }}><button className="link" onClick={onRecover}>Lupa master password?</button></p>
        <p style={{ margin: 0 }}><button className="link" style={{ color: 'var(--muted)' }} onClick={reset}>Hapus vault di perangkat ini</button></p>
      </div>
    </div>
  );
}
