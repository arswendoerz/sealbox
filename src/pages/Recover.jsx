import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { StrengthMeter } from '../components/StrengthMeter.jsx';
import { estimateBits } from '../crypto/generator.js';

export function Recover({ onBack }) {
  const { recover } = useVault();
  const [key, setKey] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 12 || estimateBits(pw) < 50) return setError('Master password baru terlalu lemah.');
    if (pw !== pw2) return setError('Kedua master password tidak sama.');
    setBusy(true);
    try {
      await recover(key, pw);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <i className="ti ti-lifebuoy" style={{ fontSize: 44, color: 'var(--brand)' }} />
        <h3>Pulihkan akses</h3>
        <p className="sub">Masukkan recovery key, lalu buat master password baru</p>
        <form onSubmit={submit}>
          <label className="f">Recovery key</label>
          <input className="mono" required value={key} onChange={(e) => { setKey(e.target.value); setError(''); }} placeholder="XXXX-XXXX-XXXX-..." />
          <label className="f">Master password baru</label>
          <input type="password" required value={pw} onChange={(e) => { setPw(e.target.value); setError(''); }} autoComplete="new-password" />
          <StrengthMeter password={pw} />
          <label className="f">Ulangi master password baru</label>
          <input type="password" required value={pw2} onChange={(e) => { setPw2(e.target.value); setError(''); }} autoComplete="new-password" />
          <div className="note ok"><i className="ti ti-shield-check" />Semua item Anda tetap utuh.</div>
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy}>{busy ? 'Memulihkan…' : 'Pulihkan vault'}</button>
        </form>
        <p style={{ margin: '16px 0 0' }}><button className="link" onClick={onBack}>Kembali</button></p>
      </div>
    </div>
  );
}
