import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';

export function Login({ onRegister, onRecover }) {
  const { login, hasLegacy } = useVault();
  const [email, setEmail] = useState(hasLegacy ?? '');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, pw);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <img className="logo" src="/logo.svg" alt="" />
        <h3>Masuk</h3>
        <p className="sub">Selamat datang kembali</p>
        {hasLegacy && (
          <div className="note ok" style={{ textAlign: 'left', display: 'block' }}>
            <i className="ti ti-cloud-upload" /> Vault lokal untuk <b>{hasLegacy}</b> ditemukan, tapi itu belum akun online.{' '}
            <button className="link" onClick={onRegister}>Daftar akun online</button> dengan email dan master password yang sama, isinya akan ikut dipindahkan.
          </div>
        )}
        <form onSubmit={submit}>
          <label className="f">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" autoComplete="username" />
          <label className="f">Master password</label>
          <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          {error && <p className="err">{error}{hasLegacy && ' Belum daftar akun online? Klik Daftar di bawah.'}</p>}
          <button className="btn pri full" disabled={busy}>{busy ? 'Membuka vault…' : 'Masuk'}</button>
        </form>
        <p style={{ margin: '16px 0 6px' }}><button className="link" onClick={onRecover}>Lupa master password?</button></p>
        <p className="sub" style={{ margin: 0 }}>Belum punya akun? <button className="link" onClick={onRegister}>Daftar</button></p>
      </div>
    </div>
  );
}
