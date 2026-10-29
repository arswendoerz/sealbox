import { useMemo, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { useClipboard } from '../hooks/useClipboard.js';
import { Avatar } from '../components/Avatar.jsx';
import { ItemForm } from '../components/ItemForm.jsx';
import { ItemDetail } from '../components/ItemDetail.jsx';
import { PasswordGenerator } from '../components/PasswordGenerator.jsx';
import { BackupDialog } from '../components/BackupDialog.jsx';
import { TwoFactorDialog } from '../components/TwoFactorDialog.jsx';
import { HealthView } from '../components/HealthView.jsx';
import { HistoryDialog } from '../components/HistoryDialog.jsx';
import { ThemeSwitch } from '../components/ThemeSwitch.jsx';
import { folderNames, MAX_FOLDER_NAME } from '../lib/folders.js';
import { parseUrl } from '../lib/url.js';
import { analyze } from '../lib/health.js';

// view: 'all' | 'fav' | 'gen' | 'health' | `folder:${name}`
export function Vault() {
  const { items, folders: folderRows, saveItem, deleteItem, createFolder, deleteFolder, lock, signOut, offline } = useVault();
  const { copy, message } = useClipboard(30);
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | item
  const [backingUp, setBackingUp] = useState(false);
  const [settingMfa, setSettingMfa] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Folder names come from items and from saved (possibly empty) folders.
  const [naming, setNaming] = useState(null); // null | name being typed for a new folder
  const folders = useMemo(() => folderNames(items, folderRows), [items, folderRows]);
  const openFolder = view.startsWith('folder:') ? view.slice(7) : null;

  async function newFolder(e) {
    e.preventDefault();
    if (naming === null) return; // blur from the input being removed after Enter
    const input = naming;
    setNaming(null);
    if (!input.trim()) return;
    try {
      const name = await createFolder(input);
      setView(`folder:${name}`);
      setSelectedId(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function removeFolder(name) {
    if (!confirm(`Hapus folder "${name}"?`)) return;
    try {
      await deleteFolder(name);
      setView('all');
    } catch (err) {
      alert(err.message);
    }
  }

  // A folder made from the item form is saved too, so it stays when its items move out.
  async function save(data) {
    const isNew = data.folder && !folders.includes(data.folder);
    setSelectedId(await saveItem(data));
    if (isNew) createFolder(data.folder).catch(() => {});
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (view === 'fav' && !i.favorite) return false;
      if (view.startsWith('folder:') && i.folder !== view.slice(7)) return false;
      return !q || [i.name, i.username, i.url].some((v) => v?.toLowerCase().includes(q));
    });
  }, [items, view, query]);

  const selected = items.find((i) => i.id === selectedId);
  const reused = useMemo(() => new Map(analyze(items).map((r) => [r.item.id, r.reusedWith])), [items]);
  const fullPage = view === 'gen' || view === 'health'; // views without the item list

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
    <div className={`app${selected || fullPage ? ' has-detail' : ''}${fullPage ? ' no-list' : ''}`}>
      <aside className="side">
        <div className="brand"><img src="/logo.svg" alt="" />Sealbox</div>
        {nav('all', 'key', 'Semua item', items.length)}
        {nav('fav', 'star', 'Favorit', items.filter((i) => i.favorite).length)}
        <div className="sep" />
        {folders.map((f) => <span key={f}>{nav(`folder:${f}`, 'folder', f)}</span>)}
        {naming === null ? (
          <button className="nav" onClick={() => setNaming('')}><i className="ti ti-folder-plus" />Folder baru</button>
        ) : (
          <form className="new-folder" onSubmit={newFolder}>
            <i className="ti ti-folder-plus" />
            <input
              autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Nama folder" maxLength={MAX_FOLDER_NAME}
              onKeyDown={(e) => e.key === 'Escape' && setNaming(null)} onBlur={(e) => newFolder(e)}
            />
          </form>
        )}
        <div className="sep" />
        {nav('gen', 'wand', 'Generator')}
        {nav('health', 'heartbeat', 'Kesehatan')}
        {offline && <div className="note warn" style={{ margin: '8px 0' }}><i className="ti ti-cloud-off" />Offline: hanya bisa dibaca</div>}
        <button className="nav" style={{ marginTop: 'auto' }} onClick={() => setBackingUp(true)}><i className="ti ti-database-export" />Backup</button>
        <button className="nav" onClick={() => setShowHistory(true)}><i className="ti ti-history" />Riwayat</button>
        <button className="nav" onClick={() => setSettingMfa(true)}><i className="ti ti-shield-lock" />2FA</button>
        <button className="nav" onClick={lock}><i className="ti ti-lock" />Kunci vault</button>
        <button className="nav" onClick={signOut}><i className="ti ti-logout" />Keluar</button>
        <ThemeSwitch className="side-theme" />
      </aside>

      {!fullPage && (
        <div className="list">
          <div className="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari item…" />
            <button className="btn pri icon" onClick={() => setEditing({ folder: view.startsWith('folder:') ? view.slice(7) : '', favorite: view === 'fav' })} aria-label="Tambah item"><i className="ti ti-plus" /></button>
          </div>
          <div className="items">
            {visible.map((i) => (
              <button key={i.id} className={`item${i.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(i.id)}>
                <Avatar name={i.name} />
                <div style={{ minWidth: 0 }}>{i.name}<small>{[i.username || '—', parseUrl(i.url)?.hostname].filter(Boolean).join(' · ')}</small></div>
                {i.favorite && <i className="ti ti-star" />}
              </button>
            ))}
            {visible.length === 0 && (query.trim() || !view.startsWith('folder:')
              ? items.length > 0 && <p className="sub" style={{ padding: 16 }}>Tidak ada item yang cocok.</p>
              : (
                <div style={{ padding: 16 }}>
                  <p className="sub" style={{ margin: '0 0 12px' }}>Folder ini masih kosong. Tambahkan item dengan tombol +, atau pindahkan item lewat Edit.</p>
                  {folderRows.some((f) => f.name === openFolder) && (
                    <button className="btn danger" onClick={() => removeFolder(openFolder)} disabled={offline}><i className="ti ti-trash" /> Hapus folder</button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <main className="main">
        {view === 'health' ? (
          <HealthView items={items} offline={offline} onOpen={(id) => { setView('all'); setSelectedId(id); }} onBack={() => setView('all')} />
        ) : view === 'gen' ? (
          <div className="detail">
            <button className="btn back" onClick={() => setView('all')} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
            <div className="gwrap">
              <div className="card gen">
                <h3 style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><i className="ti ti-sparkles" style={{ color: 'var(--seal)' }} />Generator</h3>
                <PasswordGenerator onCopy={(v) => copy(v, 'Password')} />
              </div>
              <div className="card panel">
                <h4><i className="ti ti-bulb" />Tips</h4>
                <p className="hint">Passphrase 5–6 kata cocok untuk master password: mudah diingat, sulit ditebak.</p>
                <p className="hint">Untuk situs lain, pakai password acak 20 karakter dan biarkan Sealbox yang mengingatnya. Aturan situs (panjang, simbol) bisa diatur per item.</p>
                <p className="hint" style={{ margin: 0 }}>Password yang dibuat di sini tidak disimpan. Salin lalu simpan ke item.</p>
              </div>
            </div>
          </div>
        ) : selected ? (
          <ItemDetail key={selected.id} item={selected} reusedWith={reused.get(selected.id) ?? 0} offline={offline} copy={copy} onBack={() => setSelectedId(null)} onEdit={() => setEditing(selected)} onDelete={() => remove(selected)} />
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
          onSave={save}
        />
      )}
      {backingUp && <BackupDialog onClose={() => setBackingUp(false)} />}
      {showHistory && <HistoryDialog onClose={() => setShowHistory(false)} />}
      {settingMfa && <TwoFactorDialog copy={copy} onClose={() => setSettingMfa(false)} />}
      {message && <div className="toast"><i className="ti ti-check" />{message}</div>}
    </div>
  );
}
