import { useState } from 'react';
import { usePrefs, setPrefs } from '../lib/prefs.js';
import { useChecklist } from './SecurityChecklist.jsx';
import { ThemeSwitch } from './ThemeSwitch.jsx';

function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`sw${on ? ' on' : ''}`} onClick={() => onChange(!on)} />;
}

function Row({ title, hint, children }) {
  return (
    <div className="srow">
      <div>{title}{hint && <small>{hint}</small>}</div>
      {children}
    </div>
  );
}

const when = (t) => new Date(t).toLocaleDateString('id', { day: 'numeric', month: 'long', year: 'numeric' });

// onAction: 'backup' | 'history' | 'mfa'
export function SettingsView({ email, mfaEnabled, offline, onAction, onSignOut, onBack }) {
  const prefs = usePrefs();
  const { steps, done } = useChecklist(mfaEnabled);
  const [rkHelp, setRkHelp] = useState(false);
  const num = (k) => (e) => setPrefs({ [k]: Number(e.target.value) });

  return (
    <div className="detail settings">
      <button className="btn back" onClick={onBack} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
      <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}><i className="ti ti-settings" style={{ color: 'var(--brand)' }} />Pengaturan</h3>

      <div className="card panel" style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <div className={`score lv${done === 4 ? 4 : done === 3 ? 3 : done === 2 ? 2 : 1}`}>{done}/{steps.length}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{done === steps.length ? 'Semua langkah keamanan selesai' : `Keamanan akun: ${done} dari ${steps.length} langkah selesai`}</b>
          <div className="prog"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {steps.map((s) => (
              <span key={s.key} className="pill" style={s.done ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : { background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                <i className={`ti ti-${s.done ? 'check' : 'alert-circle'}`} />{s.done ? s.label : s.todo}
              </span>
            ))}
          </div>
          {prefs.checklistHidden && done < steps.length && (
            <button className="link" style={{ fontSize: 12, marginTop: 8 }} onClick={() => setPrefs({ checklistHidden: false })}>Tampilkan lagi di sidebar</button>
          )}
        </div>
      </div>

      <div className="sgrid">
        <div>
          <div className="card panel">
            <h4><i className="ti ti-lock" />Kunci otomatis</h4>
            <Row title="Kunci setelah tidak dipakai" hint="Vault dikunci dan isinya dihapus dari memori">
              <select value={prefs.autoLockMin} onChange={num('autoLockMin')}>
                {[1, 5, 15, 30, 60].map((m) => <option key={m} value={m}>{m < 60 ? `${m} menit` : '1 jam'}</option>)}
              </select>
            </Row>
            <Row title="Kunci saat tab disembunyikan" hint="Setelah 1 menit di tab atau aplikasi lain">
              <Switch on={prefs.lockOnHidden} onChange={(v) => setPrefs({ lockOnHidden: v })} label="Kunci saat tab disembunyikan" />
            </Row>
            <Row title="Hapus clipboard setelah" hint="Untuk password dan kode yang disalin">
              <select value={prefs.clipboardSec} onChange={num('clipboardSec')}>
                {[15, 30, 60, 120].map((s) => <option key={s} value={s}>{s < 60 ? `${s} detik` : `${s / 60} menit`}</option>)}
              </select>
            </Row>
          </div>

          <div className="card panel">
            <h4><i className="ti ti-palette" />Tampilan</h4>
            <Row title="Tema"><ThemeSwitch className="inline-theme" /></Row>
            <Row title="Ikon situs" hint="Mengambil ikon dari setiap situs. Situs itu jadi tahu Anda menyimpan akun di sana.">
              <Switch on={prefs.siteIcons} onChange={(v) => setPrefs({ siteIcons: v })} label="Ikon situs" />
            </Row>
            <Row title="Urutan daftar">
              <select value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value })}>
                <option value="name">Nama</option>
                <option value="updated">Terakhir diubah</option>
              </select>
            </Row>
          </div>
        </div>

        <div>
          <div className="card panel">
            <h4><i className="ti ti-database" />Data</h4>
            <Row title="Backup terenkripsi" hint={prefs.lastBackupAt ? `Terakhir di perangkat ini: ${when(prefs.lastBackupAt)}` : 'Belum pernah dibuat di perangkat ini'}>
              <button className="btn" onClick={() => onAction('backup')}><i className="ti ti-database-export" />Backup</button>
            </Row>
            <Row title="Riwayat item" hint="Versi lama disimpan 30 hari">
              <button className="btn" onClick={() => onAction('history')} disabled={offline}><i className="ti ti-history" />Buka</button>
            </Row>
          </div>

          <div className="card panel">
            <h4><i className="ti ti-user-shield" />Akun</h4>
            <Row title="Email" hint={email} />
            <Row title="Verifikasi 2 langkah" hint={mfaEnabled == null ? 'Status tidak diketahui (offline?)' : mfaEnabled ? 'Aktif · aplikasi autentikator' : 'Belum aktif'}>
              <button className="btn" onClick={() => onAction('mfa')} disabled={offline}>Kelola</button>
            </Row>
            <Row title="Recovery key" hint={rkHelp ? 'Dipakai lewat "Lupa master password?" di layar masuk. Simpan di tempat terpisah dari perangkat ini (kertas, brankas). Sealbox tidak bisa menampilkannya lagi.' : 'Hanya ditampilkan sekali saat daftar'}>
              <button className="btn" onClick={() => setRkHelp(!rkHelp)}>{rkHelp ? 'Tutup' : 'Cara memakai'}</button>
            </Row>
            <Row title="Recovery key sudah saya simpan">
              <Switch on={prefs.recoveryKeySaved} onChange={(v) => setPrefs({ recoveryKeySaved: v })} label="Recovery key sudah disimpan" />
            </Row>
            <Row title="Ekstensi browser sudah dipasang">
              <Switch on={prefs.extensionInstalled} onChange={(v) => setPrefs({ extensionInstalled: v })} label="Ekstensi sudah dipasang" />
            </Row>
            <Row title="Keluar dari perangkat ini" hint="Cache vault di perangkat ini juga dihapus">
              <button className="btn danger" onClick={onSignOut}><i className="ti ti-logout" />Keluar</button>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}
