import { useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { StrengthMeter } from '../components/StrengthMeter.jsx';
import { estimateBits } from '../crypto/generator.js';

export function Register() {
  const { register } = useVault();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { recoveryKey, finish }

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 12) return setError('Master password minimal 12 karakter.');
    if (estimateBits(pw) < 50) return setError('Master password terlalu lemah. Coba passphrase beberapa kata.');
    if (pw !== pw2) return setError('Kedua master password tidak sama.');
    setBusy(true);
    setPending(await register(email.trim(), pw));
  }

  if (pending) return <RecoveryKeyStep {...pending} />;

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <img className="logo" src="/logo.svg" alt="" />
        <h3>Buat vault</h3>
        <p className="sub">Satu master password untuk semua password Anda</p>
        <form onSubmit={submit}>
          <label className="f">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@email.com" />
          <label className="f">Master password</label>
          <input type="password" required value={pw} onChange={(e) => { setPw(e.target.value); setError(''); }} autoComplete="new-password" />
          <StrengthMeter password={pw} />
          <p className="hint">Gunakan passphrase, misalnya beberapa kata acak yang mudah Anda ingat.</p>
          <label className="f">Ulangi master password</label>
          <input type="password" required value={pw2} onChange={(e) => { setPw2(e.target.value); setError(''); }} autoComplete="new-password" />
          <div className="note warn"><i className="ti ti-alert-triangle" />Master password tidak bisa direset oleh siapa pun. Simpan baik-baik.</div>
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy}>{busy ? 'Membuat kunci…' : 'Buat vault'}</button>
        </form>
      </div>
    </div>
  );
}

function RecoveryKeyStep({ recoveryKey, finish }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([`Sealbox recovery key\n\n${recoveryKey}\n\nSimpan file ini di tempat aman, terpisah dari perangkat Anda.\n`], { type: 'text/plain' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'sealbox-recovery-key.txt' });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="auth-wrap">
      <div className="card auth">
        <i className="ti ti-key" style={{ fontSize: 44, color: 'var(--seal)' }} />
        <h3>Simpan recovery key</h3>
        <p className="sub">Satu-satunya cara membuka vault jika Anda lupa master password. Key ini hanya ditampilkan sekali.</p>
        <div className="rkey mono">{recoveryKey}</div>
        <div className="row">
          <button className="btn full" onClick={() => navigator.clipboard.writeText(recoveryKey).then(() => setCopied(true))}><i className="ti ti-copy" /> {copied ? 'Disalin' : 'Salin'}</button>
          <button className="btn full" onClick={download}><i className="ti ti-download" /> Unduh</button>
          <button className="btn full" onClick={() => window.print()}><i className="ti ti-printer" /> Cetak</button>
        </div>
        <label className="check left"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />Saya sudah menyimpan recovery key di tempat aman</label>
        <button className="btn pri full" disabled={!saved} onClick={finish}>Lanjut ke vault</button>
      </div>
    </div>
  );
}
