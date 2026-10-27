import { useEffect, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { mfaStatus, startEnroll, confirmEnroll, regenerateRecoveryCodes, disableMfa, formatRecoveryCode } from '../lib/mfa.js';

// step: 'loading' | 'off' | 'enroll' | 'codes' | 'on'
export function TwoFactorDialog({ copy, onClose }) {
  const { user, offline } = useVault();
  const [step, setStep] = useState('loading');
  const [status, setStatus] = useState(null);
  const [enroll, setEnroll] = useState(null); // { factorId, qr, secret }
  const [codes, setCodes] = useState(null); // recovery codes, shown once; [] = server has none
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const s = await mfaStatus();
    setStatus(s);
    setStep(s.enabled ? 'on' : 'off');
  };

  useEffect(() => {
    refresh().catch((err) => { setError(err.message); setStep('off'); });
  }, []);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const begin = () => run(async () => {
    setEnroll(await startEnroll());
    setCode('');
    setStep('enroll');
  });

  const finishEnroll = (e) => {
    e.preventDefault();
    run(async () => {
      setCodes((await confirmEnroll(enroll.factorId, code)) ?? []);
      setEnroll(null);
      setCode('');
      setStep('codes');
    });
  };

  const regenerate = () => {
    if (!window.confirm('Recovery code lama akan langsung tidak berlaku. Lanjutkan?')) return;
    run(async () => {
      setCodes(await regenerateRecoveryCodes());
      setStep('codes');
    });
  };

  const disable = (e) => {
    e.preventDefault();
    run(async () => {
      await disableMfa(status.factorId, code);
      setCode('');
      await refresh();
    });
  };

  function downloadCodes() {
    const text = `Sealbox: recovery code 2FA untuk ${user.email}\nTiap kode hanya bisa dipakai sekali.\n\n${codes.map(formatRecoveryCode).join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    Object.assign(document.createElement('a'), { href: url, download: 'sealbox-2fa-recovery-codes.txt' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const codeInput = (
    <input className="mono" required inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} placeholder="123456" autoComplete="one-time-code" style={{ letterSpacing: 3 }} />
  );

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && step !== 'codes' && onClose()}>
      <div className="card modal">
        <h3>Verifikasi dua langkah (2FA)
          {step !== 'codes' && <button type="button" className="btn icon" onClick={onClose} disabled={busy} aria-label="Tutup"><i className="ti ti-x" /></button>}
        </h3>

        {offline && step !== 'codes' && <div className="note warn"><i className="ti ti-cloud-off" />Pengaturan 2FA butuh koneksi internet.</div>}
        {step === 'loading' && <p className="sub">Memuat…</p>}

        {step === 'off' && (
          <>
            <p className="hint">Setelah aktif, masuk di perangkat baru butuh master password <b>dan</b> kode 6 digit dari aplikasi authenticator (Google Authenticator, Aegis, 2FAS, 1Password, dll). Server tidak akan memberikan data vault tanpa kode itu.</p>
            <button className="btn pri full" onClick={begin} disabled={busy || offline}><i className="ti ti-shield-lock" /> {busy ? 'Menyiapkan…' : 'Aktifkan 2FA'}</button>
          </>
        )}

        {step === 'enroll' && enroll && (
          <form onSubmit={finishEnroll}>
            <p className="hint">1. Pindai kode QR ini dengan aplikasi authenticator.</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <img src={enroll.qr} alt="Kode QR 2FA" width="180" height="180" style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
            </div>
            <p className="hint" style={{ marginBottom: 4 }}>Tidak bisa memindai? Masukkan kunci ini secara manual:</p>
            <div className="val"><span className="mono">{enroll.secret}</span><button type="button" title="Salin" onClick={() => copy(enroll.secret, 'Kunci 2FA')}><i className="ti ti-copy" /></button></div>
            <label className="f">2. Masukkan kode 6 digit yang muncul</label>
            {codeInput}
            {error && <p className="err">{error}</p>}
            <div className="row" style={{ justifyContent: 'flex-end', margin: 0 }}>
              <button type="button" className="btn" onClick={() => { setStep('off'); setError(''); }} disabled={busy}>Batal</button>
              <button className="btn pri" disabled={busy || !code.trim()}>{busy ? 'Memeriksa…' : 'Aktifkan'}</button>
            </div>
          </form>
        )}

        {step === 'codes' && (
          <>
            <div className="note ok"><i className="ti ti-shield-check" />2FA aktif.</div>
            {codes?.length ? (
              <>
                <p className="hint">Simpan recovery code ini di tempat aman, terpisah dari HP Anda. Kalau HP hilang, satu kode bisa menggantikan kode authenticator satu kali. Kode ini <b>hanya ditampilkan sekarang</b>.</p>
                <div className="grid2 mono" style={{ gap: 6, marginBottom: 12, padding: 12, background: 'var(--soft)', borderRadius: 8 }}>
                  {codes.map((c) => <span key={c}>{formatRecoveryCode(c)}</span>)}
                </div>
                <div className="row">
                  <button className="btn" style={{ flex: 1 }} onClick={() => copy(codes.map(formatRecoveryCode).join('\n'), 'Recovery code')}><i className="ti ti-copy" /> Salin</button>
                  <button className="btn" style={{ flex: 1 }} onClick={downloadCodes}><i className="ti ti-download" /> Unduh .txt</button>
                </div>
              </>
            ) : (
              <div className="note warn"><i className="ti ti-alert-triangle" />Server belum mendukung recovery code 2FA. Kalau HP authenticator hilang, Anda tidak bisa masuk lagi ke akun ini. Simpan juga kunci manualnya, dan buat file backup vault secara rutin.</div>
            )}
            <button className="btn pri full" onClick={() => { setCodes(null); refresh().catch((err) => setError(err.message)); }}>Sudah saya simpan</button>
          </>
        )}

        {step === 'on' && status && (
          <>
            <div className="note ok"><i className="ti ti-shield-check" />2FA aktif untuk akun ini.</div>
            <label className="f">Recovery code</label>
            <p className="hint">
              {status.recovery ? `${status.recovery.remaining} dari ${status.recovery.total} kode masih bisa dipakai.` : 'Belum ada recovery code.'}
            </p>
            <button className="btn full" onClick={regenerate} disabled={busy || offline} style={{ marginBottom: 12 }}><i className="ti ti-refresh" /> Buat recovery code baru</button>
            <div className="sep" />
            <form onSubmit={disable}>
              <label className="f">Matikan 2FA: masukkan kode authenticator saat ini</label>
              {codeInput}
              {error && <p className="err">{error}</p>}
              <button className="btn danger full" disabled={busy || offline || !code.trim()}><i className="ti ti-shield-off" /> {busy ? 'Memproses…' : 'Matikan 2FA'}</button>
            </form>
          </>
        )}

        {step !== 'enroll' && step !== 'on' && error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}
      </div>
    </div>
  );
}
