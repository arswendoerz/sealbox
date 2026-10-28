import { useRef, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { parseBackup } from '../lib/backup.js';

function summary({ added, updated, skipped, olderKey }) {
  const parts = [added && `${added} item baru`, updated && `${updated} diperbarui`, skipped && `${skipped} sudah ada`].filter(Boolean);
  const text = parts.length ? `Impor selesai: ${parts.join(', ')}.` : 'Backup ini kosong.';
  // Items that still exist are left as they are; changes since then are in Riwayat (30 days).
  return olderKey ? `${text} Backup ini dibuat sebelum kunci vault diganti, jadi item yang masih ada tidak ditimpa.` : text;
}

export function BackupDialog({ onClose }) {
  const { exportBackup, importBackup, offline, user } = useVault();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(''); // '' | 'export' | 'import'
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [pending, setPending] = useState(null); // backup from another vault, waiting for its secret
  const [secret, setSecret] = useState('');

  async function run(kind, fn) {
    setBusy(kind);
    setError('');
    setResult('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const download = () => run('export', async () => {
    const backup = await exportBackup();
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `sealbox-backup-${backup.exportedAt.slice(0, 10)}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setResult(`${backup.items.length} item diekspor.`);
  });

  async function importFrom(backup, pw) {
    try {
      setResult(summary(await importBackup(backup, pw)));
      setPending(null);
      setSecret('');
    } catch (err) {
      if (err.code !== 'locked') throw err;
      setPending(backup);
    }
  }

  function pick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) run('import', async () => importFrom(parseBackup(await file.text())));
  }

  function unlockPending(e) {
    e.preventDefault();
    run('import', () => importFrom(pending, secret));
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="card modal">
        <h3>Backup vault<button type="button" className="btn icon" onClick={onClose} disabled={!!busy} aria-label="Tutup"><i className="ti ti-x" /></button></h3>

        <label className="f">Ekspor</label>
        <p className="hint">Semua item tetap terenkripsi di dalam file. File bisa dibuka dengan master password saat ini atau recovery key. Email dan jumlah item terlihat tanpa password.</p>
        <button className="btn full" onClick={download} disabled={!!busy}><i className="ti ti-download" /> {busy === 'export' ? 'Menyiapkan…' : 'Unduh backup'}</button>

        <div className="sep" />

        <label className="f">Impor</label>
        <p className="hint">Item baru ditambahkan, item yang sama diganti hanya jika versi di backup lebih baru. Tidak ada item yang dihapus.</p>
        {pending ? (
          <form onSubmit={unlockPending}>
            <div className="note warn"><i className="ti ti-key" />
              {pending.email === user?.email
                ? 'Backup ini dari akun ini, tetapi dibuat sebelum kunci vault diganti (misalnya setelah pemulihan). Masukkan recovery key, atau master password yang berlaku saat backup dibuat.'
                : `Backup ini dari vault lain (${pending.email}). Masukkan master password atau recovery key-nya.`}
            </div>
            <input type="password" autoFocus value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Master password atau recovery key" autoComplete="off" />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => { setPending(null); setSecret(''); setError(''); }} disabled={!!busy}>Batal</button>
              <button className="btn pri" disabled={!!busy || !secret}>{busy === 'import' ? 'Membuka…' : 'Buka dan impor'}</button>
            </div>
          </form>
        ) : (
          <>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={pick} />
            <button className="btn full" onClick={() => fileRef.current.click()} disabled={!!busy || offline} style={{ marginBottom: 12 }}>
              <i className="ti ti-upload" /> {busy === 'import' ? 'Mengimpor…' : 'Pilih file backup'}
            </button>
            {offline && <div className="note warn"><i className="ti ti-cloud-off" />Impor butuh koneksi internet.</div>}
          </>
        )}

        {error && <p className="err">{error}</p>}
        {result && <div className="note ok" style={{ margin: 0 }}><i className="ti ti-check" />{result}</div>}
      </div>
    </div>
  );
}
