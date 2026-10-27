import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { StrengthMeter } from '../components/StrengthMeter.jsx';
import { estimateBits } from '../crypto/generator.js';

// Signed out: send a reset link. With a session (from that link, or while locked): recovery key + new password.
export function Recover({ onBack }) {
  const { user } = useVault();
  return user ? <SetNewPassword onBack={onBack} /> : <RequestLink onBack={onBack} />;
}

function RequestLink({ onBack }) {
  const { requestRecovery } = useVault();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await requestRecovery(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <i className="ti ti-lifebuoy" style={{ fontSize: 44, color: 'var(--brand)' }} />
        <h3>Pulihkan akses</h3>
        {sent ? (
          <p className="sub">Jika email terdaftar, tautan pemulihan sudah dikirim. Buka tautan itu di browser ini, lalu masukkan recovery key Anda.</p>
        ) : (
          <>
            <p className="sub">Kami kirim tautan ke email Anda. Setelah itu Anda perlu recovery key untuk membuka vault.</p>
            <form onSubmit={submit}>
              <label className="f">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
              {error && <p className="err">{error}</p>}
              <button className="btn pri full" disabled={busy}>{busy ? 'Mengirim…' : 'Kirim tautan'}</button>
            </form>
          </>
        )}
        <p style={{ margin: '16px 0 0' }}><button className="link" onClick={onBack}>Kembali</button></p>
      </div>
    </div>
  );
}

function SetNewPassword({ onBack }) {
  const { user, completeRecovery, signOut } = useVault();
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
      await completeRecovery(key, pw);
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
        <p className="sub">{user.email}: masukkan recovery key, lalu buat master password baru</p>
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
        <p style={{ margin: '16px 0 0' }}>
          {onBack ? <button className="link" onClick={onBack}>Kembali</button> : <button className="link" onClick={signOut}>Batal dan keluar</button>}
        </p>
      </div>
    </div>
  );
}
