import { useMemo, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { analyze, checkBreaches, OLD_AFTER_DAYS } from '../lib/health.js';
import { parseUrl } from '../lib/url.js';

// The site's own "change password" page, by the /.well-known/change-password standard; sites
// that don't support it usually redirect to their home or settings page.
const changeUrl = (item) => {
  const u = parseUrl(item.url);
  return u && `${u.origin}/.well-known/change-password`;
};

// Breach results live only in this component's state, so they're gone once the vault locks.
export function HealthView({ items, offline, onOpen, onBack }) {
  const report = useMemo(() => analyze(items), [items]);
  const [breaches, setBreaches] = useState(null); // Map(password -> count)
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const groups = [
    { key: 'pwned', icon: 'alert-octagon', title: 'Pernah bocor', hint: 'Muncul di data kebocoran publik. Ganti secepatnya.', bad: true,
      rows: breaches ? report.filter((r) => breaches.get(r.item.password) > 0) : null,
      note: (r) => `${breaches.get(r.item.password).toLocaleString('id')}× di kebocoran` },
    { key: 'reused', icon: 'copy', title: 'Dipakai ulang', hint: 'Jika satu situs bocor, akun lain ikut terancam.', bad: true,
      rows: report.filter((r) => r.reusedWith > 0), note: (r) => `sama dengan ${r.reusedWith} item lain` },
    { key: 'weak', icon: 'shield-exclamation', title: 'Lemah', hint: 'Mudah ditebak. Buat ulang dengan generator.',
      rows: report.filter((r) => r.weak), note: () => 'kekuatan rendah' },
    { key: 'old', icon: 'clock', title: 'Lama', hint: `Tidak diganti lebih dari ${OLD_AFTER_DAYS} hari.`,
      rows: report.filter((r) => r.ageDays > OLD_AFTER_DAYS), note: (r) => `${r.ageDays} hari` },
  ];

  const flagged = new Set(groups.flatMap((g) => g.rows ?? []).map((r) => r.item.id));
  const score = report.length ? Math.round(((report.length - flagged.size) / report.length) * 100) : 100;

  async function runCheck() {
    setError('');
    setProgress([0, 0]);
    try {
      setBreaches(await checkBreaches(report.map((r) => r.item.password), (done, total) => setProgress([done, total])));
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="detail">
      <button className="btn back" onClick={onBack} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
      <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><i className="ti ti-heartbeat" style={{ color: 'var(--seal)' }} />Kesehatan password</h3>

      <div className="card" style={{ padding: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 18 }}>
        <div className={`score lv${score >= 90 ? 4 : score >= 70 ? 3 : score >= 40 ? 2 : 1}`}>{score}</div>
        <div style={{ minWidth: 0 }}>
          <b>{flagged.size ? `${flagged.size} dari ${report.length} password perlu perhatian` : `Semua ${report.length} password aman`}</b>
          <p className="hint" style={{ margin: '4px 0 0' }}>Dihitung di perangkat ini. Tidak ada password yang dikirim ke server.</p>
        </div>
      </div>

      <div className="stats">
        {groups.map((g) => (
          <a key={g.key} href={`#h-${g.key}`} className={`stat${g.rows?.length ? (g.bad ? ' bad' : ' warn') : ''}`}>
            <b>{g.rows ? g.rows.length : '–'}</b>{g.title}
          </a>
        ))}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <p className="hint" style={{ marginBottom: 10 }}>
          Cek kebocoran memakai Have I Been Pwned. Hanya 5 karakter pertama hash SHA-1 tiap password yang dikirim, jadi password Anda tidak pernah keluar dari browser.
        </p>
        <button className="btn full" onClick={runCheck} disabled={!!progress || offline || !report.length}>
          <i className="ti ti-world-search" />
          {progress ? `Memeriksa… ${progress[0]}/${progress[1] || '…'}` : breaches ? 'Periksa ulang' : 'Periksa kebocoran'}
        </button>
        {offline && <p className="hint" style={{ margin: '8px 0 0' }}>Butuh koneksi internet.</p>}
        {error && <p className="err" style={{ margin: '8px 0 0' }}>{error}</p>}
      </div>

      <div className="hgrid">
      {groups.filter((g) => g.rows?.length).map((g) => (
        <section key={g.key} id={`h-${g.key}`} style={{ marginBottom: 18 }}>
          <label className="f" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i className={`ti ti-${g.icon}`} />{g.title} · {g.hint}</label>
          <div className="card" style={{ overflow: 'hidden' }}>
            {g.rows.map((r) => (
              <div key={r.item.id} className="item" role="button" tabIndex={0} onClick={() => onOpen(r.item.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(r.item.id)}>
                <Avatar item={r.item} />
                <div style={{ minWidth: 0 }}>{r.item.name}<small style={{ color: g.bad ? 'var(--bad)' : 'var(--warn)' }}>{g.note(r)}</small></div>
                {changeUrl(r.item) && (
                  <a className={`btn${g.bad ? ' pri' : ''} change-now`} href={changeUrl(r.item)} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}
                    title="Buka halaman ganti password situs ini. Ekstensi Sealbox menawarkan password baru dan menyimpannya.">
                    <i className="ti ti-external-link" />Ganti sekarang
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      </div>

      {!report.length && <p className="sub">Belum ada item dengan password.</p>}
    </div>
  );
}
