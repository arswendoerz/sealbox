import { useMemo, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { useClipboard } from '../hooks/useClipboard.js';
import { Avatar } from '../components/Avatar.jsx';
import { ItemForm } from '../components/ItemForm.jsx';
import { ItemDetail } from '../components/ItemDetail.jsx';
import { PasswordGenerator } from '../components/PasswordGenerator.jsx';
import { BackupDialog } from '../components/BackupDialog.jsx';
import { TwoFactorDialog } from '../components/TwoFactorDialog.jsx';

// view: 'all' | 'fav' | 'gen' | `folder:${name}`
export function Vault() {
  const { items, saveItem, deleteItem, lock, signOut, offline } = useVault();
  const { copy, message } = useClipboard(30);
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | item
  const [backingUp, setBackingUp] = useState(false);
  const [settingMfa, setSettingMfa] = useState(false);

  const folders = useMemo(() => [...new Set(items.map((i) => i.folder).filter(Boolean))].sort(), [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (view === 'fav' && !i.favorite) return false;
      if (view.startsWith('folder:') && i.folder !== view.slice(7)) return false;
      return !q || [i.name, i.username, i.url].some((v) => v?.toLowerCase().includes(q));
    });
  }, [items, view, query]);

  const selected = items.find((i) => i.id === selectedId);

  async function remove(item) {
    if (!confirm(`Hapus "${item.name}"?`)) return;
    try {
      await deleteItem(item.id);
      setSelectedId(null);
    } catch (err) {
      alert(err.message);
    }
  }

  const nav = (id, icon, label, count) => (
    <button className={`nav${view === id ? ' on' : ''}`} onClick={() => { setView(id); setSelectedId(null); }}>
      <i className={`ti ti-${icon}`} />{label}{count != null && <b>{count}</b>}
    </button>
  );

  return (
    <div className={`app${selected || view === 'gen' ? ' has-detail' : ''}`}>
      <aside className="side">
        <div className="brand"><img src="/logo.svg" alt="" />Sealbox</div>
        {nav('all', 'key', 'Semua item', items.length)}
        {nav('fav', 'star', 'Favorit', items.filter((i) => i.favorite).length)}
        <div className="sep" />
        {folders.map((f) => <span key={f}>{nav(`folder:${f}`, 'folder', f)}</span>)}
        {folders.length > 0 && <div className="sep" />}
        {nav('gen', 'wand', 'Generator')}
        {offline && <div className="note warn" style={{ margin: '8px 0' }}><i className="ti ti-cloud-off" />Offline: hanya bisa dibaca</div>}
        <button className="nav" style={{ marginTop: 'auto' }} onClick={() => setBackingUp(true)}><i className="ti ti-database-export" />Backup</button>
        <button className="nav" onClick={() => setSettingMfa(true)}><i className="ti ti-shield-lock" />2FA</button>
        <button className="nav" onClick={lock}><i className="ti ti-lock" />Kunci vault</button>
        <button className="nav" onClick={signOut}><i className="ti ti-logout" />Keluar</button>
      </aside>

      {view !== 'gen' && (
        <div className="list">
          <div className="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari item…" />
            <button className="btn pri icon" onClick={() => setEditing({ folder: view.startsWith('folder:') ? view.slice(7) : '', favorite: view === 'fav' })} aria-label="Tambah item"><i className="ti ti-plus" /></button>
          </div>
          <div className="items">
            {visible.map((i) => (
              <button key={i.id} className={`item${i.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(i.id)}>
                <Avatar name={i.name} />
                <div style={{ minWidth: 0 }}>{i.name}<small>{i.username || '—'}</small></div>
                {i.favorite && <i className="ti ti-star" />}
              </button>
            ))}
            {items.length > 0 && visible.length === 0 && <p className="sub" style={{ padding: 16 }}>Tidak ada item yang cocok.</p>}
          </div>
        </div>
      )}

      <main className="main">
        {view === 'gen' ? (
          <div className="detail">
            <button className="btn back" onClick={() => setView('all')} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
            <div className="card gen">
              <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><i className="ti ti-sparkles" style={{ color: 'var(--seal)' }} />Generator</h3>
              <PasswordGenerator onCopy={(v) => copy(v, 'Password')} />
            </div>
          </div>
        ) : selected ? (
          <ItemDetail key={selected.id} item={selected} copy={copy} onBack={() => setSelectedId(null)} onEdit={() => setEditing(selected)} onDelete={() => remove(selected)} />
        ) : items.length === 0 ? (
          <div className="empty">
            <span className="big"><i className="ti ti-box" /></span>
            <h3>Vault Anda masih kosong</h3>
            <p className="sub">Tambahkan password pertama Anda. Semuanya dienkripsi di perangkat ini.</p>
            <button className="btn pri" onClick={() => setEditing({})}><i className="ti ti-plus" /> Tambah item</button>
          </div>
        ) : (
          <div className="empty"><p className="sub">Pilih item untuk melihat detailnya.</p></div>
        )}
      </main>

      {editing && (
        <ItemForm
          item={editing}
          folders={folders}
          onClose={() => setEditing(null)}
          onSave={async (data) => setSelectedId(await saveItem(data))}
        />
      )}
      {backingUp && <BackupDialog onClose={() => setBackingUp(false)} />}
      {settingMfa && <TwoFactorDialog copy={copy} onClose={() => setSettingMfa(false)} />}
      {message && <div className="toast"><i className="ti ti-check" />{message}</div>}
    </div>
  );
}
