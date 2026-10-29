import { useEffect, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { Avatar } from './Avatar.jsx';
import { isFolder } from '../lib/folders.js';
import { confirmDialog } from '../lib/dialogs.js';

const when = (iso) => new Date(iso).toLocaleString('id', { dateStyle: 'medium', timeStyle: 'short' });

// Versions saved by the database before each change or delete, for 30 days.
export function HistoryDialog({ onClose }) {
  const { items, loadHistory, restoreVersion } = useVault();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // version_id being restored
  const [done, setDone] = useState('');

  useEffect(() => {
    loadHistory().then(setVersions, (err) => setError(err.message));
  }, [loadHistory]);

  async function restore(v) {
    const current = items.find((i) => i.id === v.item_id);
    if (current && !(await confirmDialog({ title: `Ganti "${current.name}"?`, body: `Isinya diganti dengan versi dari ${when(v.item_updated_at)}. Versi sekarang tetap tersimpan di Riwayat.`, confirmLabel: 'Pulihkan', icon: 'restore' }))) return;
    setBusy(v.version_id);
    setError('');
    try {
      await restoreVersion(v);
      setDone(`"${v.item.name}" dipulihkan.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="card modal">
        <h3>Riwayat item<button type="button" className="btn icon" onClick={onClose} aria-label="Tutup"><i className="ti ti-x" /></button></h3>
        <p className="hint">Setiap kali item diubah atau dihapus, versi sebelumnya disimpan selama 30 hari (tetap terenkripsi). Pulihkan jika ada yang terhapus atau tertimpa.</p>
        {error && <p className="err">{error}</p>}
        {done && <div className="note ok"><i className="ti ti-check" />{done}</div>}
        {!versions && !error && <p className="sub">Memuat…</p>}
        {versions?.length === 0 && <p className="sub">Belum ada riwayat.</p>}
        {versions?.length > 0 && (
          <div className="card" style={{ overflow: 'hidden', boxShadow: 'none' }}>
            {versions.map((v) => (
              <div key={v.version_id} className="item" style={{ cursor: 'default' }}>
                <Avatar name={v.item?.name ?? '?'} />
                <div style={{ minWidth: 0 }}>
                  {v.item ? (isFolder(v.item) ? `Folder ${v.item.name}` : v.item.name) : <i>Tidak bisa dibuka</i>}
                  <small>
                    {v.change === 'delete' ? 'Dihapus' : 'Diubah'} {when(v.saved_at)}
                    {v.item?.username ? ` · ${v.item.username}` : ''}
                  </small>
                </div>
                {v.item && (
                  <button className="btn" style={{ marginLeft: 'auto', flexShrink: 0, padding: '6px 10px' }} onClick={() => restore(v)} disabled={!!busy}>
                    <i className="ti ti-restore" /> {busy === v.version_id ? '…' : 'Pulihkan'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
