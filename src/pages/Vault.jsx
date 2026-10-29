import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVault } from '../context/VaultContext.jsx';
import { useClipboard } from '../hooks/useClipboard.js';
import { useMfaEnabled } from '../hooks/useMfaEnabled.js';
import { Avatar } from '../components/Avatar.jsx';
import { ItemForm } from '../components/ItemForm.jsx';
import { ItemDetail } from '../components/ItemDetail.jsx';
import { PasswordGenerator } from '../components/PasswordGenerator.jsx';
import { BackupDialog } from '../components/BackupDialog.jsx';
import { TwoFactorDialog } from '../components/TwoFactorDialog.jsx';
import { HealthView } from '../components/HealthView.jsx';
import { HistoryDialog } from '../components/HistoryDialog.jsx';
import { SettingsView } from '../components/SettingsView.jsx';
import { ChecklistCard } from '../components/SecurityChecklist.jsx';
import { CommandPalette } from '../components/CommandPalette.jsx';
import { KeyboardHelp } from '../components/KeyboardHelp.jsx';
import { Toast } from '../components/Toast.jsx';
import { folderNames, folderStyle, MAX_FOLDER_NAME, FOLDER_COLORS, FOLDER_ICONS } from '../lib/folders.js';
import { TYPES, typeOf, subtitle, searchText } from '../lib/itemTypes.js';
import { analyze } from '../lib/health.js';
import { totpCode } from '../lib/totp.js';
import { usePrefs, setPrefs } from '../lib/prefs.js';
import { confirmDialog, alertDialog } from '../lib/dialogs.js';

const UNDO_MS = 8000;
const FULL_PAGES = ['gen', 'health', 'settings']; // views without the item list
const isTyping = (el) => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

// view: 'all' | 'fav' | 'gen' | 'health' | 'settings' | `folder:${name}`
export function Vault() {
  const { user, items, folders: folderRows, saveItem, deleteItem, createFolder, updateFolder, deleteFolder, lock, signOut, offline } = useVault();
  const prefs = usePrefs();
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all'); // type filter: 'all' | type | 'weak'
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | item
  const [dialog, setDialog] = useState(null); // 'backup' | 'history' | 'mfa' | 'palette' | 'keys'
  const [sheet, setSheet] = useState(null); // phone: 'folders' | 'more'
  const [toast, setToast] = useState(null);
  const [naming, setNaming] = useState(null); // null | name being typed for a new folder
  const [folderMenu, setFolderMenu] = useState(null); // { name, x, y, mode: 'menu' | 'rename' | 'style', value? }
  const [dropTarget, setDropTarget] = useState(null);
  const [mfaCheck, setMfaCheck] = useState(0);
  const searchRef = useRef(null);
  const mfaEnabled = useMfaEnabled(mfaCheck);

  const notify = useCallback((t) => setToast({ id: Date.now(), ...t }), []);
  const hideToast = useCallback(() => setToast(null), []);
  const onCopied = useCallback((label, until, total) => notify({
    icon: 'check', until, total, ttl: 4000,
    text: (s) => `${label} disalin · clipboard dihapus dalam ${s} dtk`,
  }), [notify]);
  const copy = useClipboard(prefs.clipboardSec, onCopied);
  const fail = (err) => alertDialog('Tidak berhasil', err.message);

  // ---- folders ----
  const folders = useMemo(() => folderNames(items, folderRows), [items, folderRows]);
  const folderCount = useMemo(() => {
    const m = new Map();
    for (const i of items) if (i.folder) m.set(i.folder, (m.get(i.folder) ?? 0) + 1);
    return m;
  }, [items]);
  const styleOf = (name) => folderStyle(folderRows.find((f) => f.name === name));
  const openFolder = view.startsWith('folder:') ? view.slice(7) : null;

  async function newFolder(e) {
    e.preventDefault();
    if (naming === null) return; // blur from the input being removed after Enter
    const input = naming;
    setNaming(null);
    if (!input.trim()) return;
    try {
      const name = await createFolder(input);
      go(`folder:${name}`);
    } catch (err) { fail(err); }
  }

  async function removeFolder(name) {
    const n = folderCount.get(name) ?? 0;
    const ok = await confirmDialog({
      title: `Hapus folder "${name}"?`,
      body: n ? `${n} item di dalamnya tidak dihapus; item itu menjadi tanpa folder.` : 'Folder ini kosong.',
      confirmLabel: 'Hapus', danger: true,
    });
    if (!ok) return;
    try {
      for (const i of items.filter((x) => x.folder === name)) await saveItem({ ...i, folder: '' });
      await deleteFolder(name);
      if (openFolder === name) go('all');
    } catch (err) { fail(err); }
  }

  async function submitFolderMenu(e) {
    e.preventDefault();
    const { name, value } = folderMenu;
    setFolderMenu(null);
    try {
      const target = await updateFolder(name, { newName: value });
      if (openFolder === name) setView(`folder:${target}`);
    } catch (err) { fail(err); }
  }

  async function styleFolder(name, look) {
    try {
      await updateFolder(name, look);
    } catch (err) { fail(err); }
  }

  async function moveToFolder(itemId, name) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.folder === name) return;
    try {
      await saveItem({ ...item, folder: name });
      notify({ icon: 'folder', text: `"${item.name}" dipindah ke ${name}` });
    } catch (err) { fail(err); }
  }

  // A folder made from the item form is saved too, so it stays when its items move out.
  async function save(data) {
    const isNew = data.folder && !folders.includes(data.folder);
    setSelectedId(await saveItem(data));
    if (isNew) createFolder(data.folder).catch(() => {});
  }

  // ---- list ----
  const report = useMemo(() => analyze(items), [items]);
  const reused = useMemo(() => new Map(report.map((r) => [r.item.id, r.reusedWith])), [report]);
  const weak = useMemo(() => new Set(report.filter((r) => r.weak).map((r) => r.item.id)), [report]);
  const problems = useMemo(() => new Set(report.filter((r) => r.weak || r.reusedWith > 0).map((r) => r.item.id)).size, [report]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (view === 'fav' && !i.favorite) return false;
      if (openFolder && i.folder !== openFolder) return false;
      if (kind === 'weak' ? !weak.has(i.id) : kind !== 'all' && typeOf(i) !== kind) return false;
      return !q || searchText(i).includes(q);
    });
    return prefs.sort === 'updated' ? [...list].sort((a, b) => b.updatedAt - a.updatedAt) : list;
  }, [items, view, openFolder, kind, weak, query, prefs.sort]);

  const selected = items.find((i) => i.id === selectedId);
  const fullPage = FULL_PAGES.includes(view);

  function go(v) {
    setView(v);
    setSelectedId(null);
    setSheet(null);
  }

  async function remove(item) {
    const ok = await confirmDialog({ title: `Hapus "${item.name}"?`, body: 'Item bisa dipulihkan dari Riwayat selama 30 hari.', confirmLabel: 'Hapus', danger: true });
    if (!ok) return;
    try {
      await deleteItem(item.id);
      setSelectedId(null);
      notify({
        icon: 'trash', ttl: UNDO_MS, until: Date.now() + UNDO_MS, total: UNDO_MS,
        text: `"${item.name}" dihapus`,
        action: { label: 'Urungkan', run: () => saveItem(item).then((id) => setSelectedId(id), fail) },
      });
    } catch (err) { fail(err); }
  }

  const copyField = useCallback(async (item, field) => {
    try {
      if (field === 'totp') return copy((await totpCode(item.totp)).code, 'Kode 2FA');
      if (field === 'username') return item.username && copy(item.username, 'Username');
      return item.password && copy(item.password, 'Password');
    } catch (err) { fail(err); }
  }, [copy]);

  const newItem = () => setEditing({ folder: openFolder ?? '', favorite: view === 'fav', type: kind in TYPES ? kind : undefined });

  // ---- keyboard ----
  const commands = useMemo(() => [
    { id: 'new', icon: 'plus', label: 'Item baru', key: 'N', run: newItem },
    { id: 'gen', icon: 'wand', label: 'Buat password', key: 'G', run: () => go('gen') },
    { id: 'health', icon: 'heartbeat', label: 'Kesehatan password', run: () => go('health') },
    { id: 'settings', icon: 'settings', label: 'Pengaturan', run: () => go('settings') },
    { id: 'backup', icon: 'database-export', label: 'Backup', run: () => setDialog('backup') },
    { id: 'keys', icon: 'keyboard', label: 'Daftar shortcut', key: '?', run: () => setDialog('keys') },
    { id: 'lock', icon: 'lock', label: 'Kunci vault', key: 'L', run: lock },
  ], [lock, openFolder, view, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setDialog('palette'); return; }
      if (dialog || editing || folderMenu || document.querySelector('.overlay')) return; // a dialog handles its own keys
      if (isTyping(document.activeElement)) {
        if (e.key === 'Escape') document.activeElement.blur();
        if (e.key === 'ArrowDown' && document.activeElement === searchRef.current && visible[0]) { e.preventDefault(); searchRef.current.blur(); setSelectedId(visible[0].id); }
        return;
      }
      const at = visible.findIndex((i) => i.id === selectedId);
      if (e.key === '/' ) { e.preventDefault(); if (fullPage) go('all'); setTimeout(() => searchRef.current?.focus()); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!visible.length || fullPage) return;
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? Math.min(at + 1, visible.length - 1) : Math.max(at - 1, 0);
        setSelectedId(visible[next].id);
        document.getElementById(`item-${visible[next].id}`)?.scrollIntoView({ block: 'nearest' });
      } else if (mod && e.key.toLowerCase() === 'c' && selected && !getSelection()?.toString()) { e.preventDefault(); copyField(selected, 'password'); }
      else if (mod && e.key.toLowerCase() === 'b' && selected) { e.preventDefault(); copyField(selected, 'username'); }
      else if (mod || e.altKey) return;
      else if (e.key === 'n') { e.preventDefault(); newItem(); }
      else if (e.key === 'e' && selected) { e.preventDefault(); setEditing(selected); }
      else if (e.key === 'Delete' && selected) remove(selected);
      else if (e.key === 'g') go('gen');
      else if (e.key === 'l') lock();
      else if (e.key === '?') setDialog('keys');
      else if (e.key === 'Escape') { if (selected) setSelectedId(null); else if (fullPage) go('all'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bound every render so it always sees the current state

  // ---- pieces ----
  const nav = (id, icon, label, count, extra = {}) => (
    <button className={`nav${view === id ? ' on' : ''}`} onClick={() => go(id)} {...extra}>
      <i className={`ti ti-${icon}`} />{label}{count != null && <b>{count}</b>}
    </button>
  );

  const folderNav = (f) => {
    const look = styleOf(f);
    const on = view === `folder:${f}`;
    return (
      <div key={f} className="fnav">
        <button
          className={`nav${on ? ' on' : ''}${dropTarget === f ? ' dropzone' : ''}`}
          onClick={() => go(`folder:${f}`)}
          onContextMenu={(e) => { e.preventDefault(); setFolderMenu({ name: f, x: e.clientX, y: e.clientY, mode: 'menu' }); }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/sealbox-item')) { e.preventDefault(); setDropTarget(f); } }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => { e.preventDefault(); setDropTarget(null); moveToFolder(e.dataTransfer.getData('text/sealbox-item'), f); }}
        >
          <i className={`ti ti-${look.icon}`} style={look.color && !on ? { color: `var(--${look.color})` } : undefined} />
          <span className="fname">{f}</span><span className="cnt">{folderCount.get(f) ?? 0}</span>
        </button>
        <button className="fmore" aria-label={`Menu folder ${f}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setFolderMenu({ name: f, x: r.right, y: r.bottom, mode: 'menu' }); }}><i className="ti ti-dots" /></button>
      </div>
    );
  };

  const newFolderRow = naming === null ? (
    <button className="nav" onClick={() => setNaming('')}><i className="ti ti-folder-plus" />Folder baru</button>
  ) : (
    <form className="new-folder" onSubmit={newFolder}>
      <i className="ti ti-folder-plus" />
      <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Nama folder" maxLength={MAX_FOLDER_NAME}
        onKeyDown={(e) => e.key === 'Escape' && setNaming(null)} onBlur={newFolder} />
    </form>
  );

  const heading = view === 'fav' ? 'Favorit' : openFolder ?? 'Semua item';

  return (
    <div className={`app${selected || fullPage ? ' has-detail' : ''}${fullPage ? ' no-list' : ''}`}>
      <aside className="side">
        <div className="brand"><img src="/logo.svg" alt="" />Sealbox</div>
        {nav('all', 'key', 'Semua item', items.length)}
        {nav('fav', 'star', 'Favorit', items.filter((i) => i.favorite).length)}
        <div className="sep" />
        {folders.map(folderNav)}
        {newFolderRow}
        <div className="sep" />
        {nav('gen', 'wand', 'Generator')}
        <button className={`nav${view === 'health' ? ' on' : ''}`} onClick={() => go('health')}>
          <i className="ti ti-heartbeat" />Kesehatan{problems > 0 && <b className="badge-bad">{problems}</b>}
        </button>
        {offline && <div className="note warn" style={{ margin: '8px 0' }}><i className="ti ti-cloud-off" />Offline: hanya bisa dibaca</div>}
        <div style={{ marginTop: 'auto' }} />
        <ChecklistCard mfaEnabled={mfaEnabled} onAction={(a) => setDialog(a)} />
        {nav('settings', 'settings', 'Pengaturan')}
        <button className="nav" onClick={lock}><i className="ti ti-lock" />Kunci vault<kbd style={{ marginLeft: 'auto' }}>L</kbd></button>
      </aside>

      {!fullPage && (
        <div className="list">
          <div className="list-title"><h3>{heading}</h3><button className="btn icon" onClick={lock} aria-label="Kunci vault"><i className="ti ti-lock" /></button></div>
          <div className="search">
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari item…   ( / )" />
            <button className="btn pri icon" onClick={newItem} title="Item baru (N)" aria-label="Tambah item"><i className="ti ti-plus" /></button>
          </div>
          <div className="listbar">
            <select value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value })} aria-label="Urutan">
              <option value="name">Urut: Nama</option>
              <option value="updated">Terakhir diubah</option>
            </select>
            {[['all', 'Semua'], ...Object.entries(TYPES).map(([k, t]) => [k, t.label]), ['weak', 'Lemah']].map(([k, label]) => (
              <button key={k} className={`chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
                {k === 'weak' && <i className="ti ti-alert-triangle" style={{ color: 'var(--warn)' }} />}{label}
              </button>
            ))}
          </div>
          <div className="phone-folders">
            {[['all', 'Semua'], ['fav', 'Favorit'], ...folders.map((f) => [`folder:${f}`, f])].map(([v, label]) => (
              <button key={v} className={`chip${view === v ? ' on' : ''}`} onClick={() => go(v)}>{label}</button>
            ))}
          </div>
          <div className="items">
            {visible.map((i) => (
              <div
                key={i.id} id={`item-${i.id}`} role="button" tabIndex={0}
                className={`item${i.id === selectedId ? ' on' : ''}`}
                onClick={() => setSelectedId(i.id)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedId(i.id)}
                draggable onDragStart={(e) => { e.dataTransfer.setData('text/sealbox-item', i.id); e.dataTransfer.effectAllowed = 'move'; }}
              >
                <Avatar item={i} />
                <div style={{ minWidth: 0 }}>{i.name}<small>{subtitle(i)}</small></div>
                <span className="qc" onClick={(e) => e.stopPropagation()}>
                  {i.username && <button title="Salin username" onClick={() => copyField(i, 'username')}><i className="ti ti-user" /></button>}
                  {i.password && <button title="Salin password" onClick={() => copyField(i, 'password')}><i className="ti ti-key" /></button>}
                  {i.totp && <button title="Salin kode 2FA" onClick={() => copyField(i, 'totp')}><i className="ti ti-clock-shield" /></button>}
                </span>
                {i.favorite && <i className="ti ti-star" />}
              </div>
            ))}
            {visible.length === 0 && (query.trim() || kind !== 'all' || !openFolder
              ? items.length > 0 && <p className="sub" style={{ padding: 16 }}>Tidak ada item yang cocok.</p>
              : (
                <div style={{ padding: 16 }}>
                  <p className="sub" style={{ margin: '0 0 12px' }}>Folder ini masih kosong. Tambahkan item dengan tombol +, atau seret item ke folder ini.</p>
                  {folderRows.some((f) => f.name === openFolder) && (
                    <button className="btn danger" onClick={() => removeFolder(openFolder)} disabled={offline}><i className="ti ti-trash" /> Hapus folder</button>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <main className="main">
        {view === 'settings' ? (
          <SettingsView email={user?.email} mfaEnabled={mfaEnabled} offline={offline} onAction={setDialog} onSignOut={signOut} onBack={() => go('all')} />
        ) : view === 'health' ? (
          <HealthView items={items} offline={offline} onOpen={(id) => { setView('all'); setSelectedId(id); }} onBack={() => go('all')} />
        ) : view === 'gen' ? (
          <div className="detail">
            <button className="btn back" onClick={() => go('all')} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
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
          <ItemDetail key={selected.id} item={selected} reusedWith={reused.get(selected.id) ?? 0} offline={offline} copy={copy} copyField={copyField}
            onBack={() => setSelectedId(null)} onEdit={() => setEditing(selected)} onDelete={() => remove(selected)} />
        ) : items.length === 0 ? (
          <div className="empty">
            <span className="big"><i className="ti ti-box" /></span>
            <h3>Vault Anda masih kosong</h3>
            <p className="sub">Tambahkan password pertama Anda. Semuanya dienkripsi di perangkat ini.</p>
            <button className="btn pri" onClick={() => setEditing({})}><i className="ti ti-plus" /> Tambah item</button>
          </div>
        ) : (
          <div className="empty">
            <p className="sub">Pilih item untuk melihat detailnya.</p>
            <p className="hint"><kbd>Ctrl</kbd> <kbd>K</kbd> palet perintah · <kbd>?</kbd> daftar shortcut</p>
          </div>
        )}
      </main>

      {/* phone: bottom navigation, add button and sheets */}
      {!selected && !fullPage && <button className="fab" onClick={newItem} aria-label="Tambah item"><i className="ti ti-plus" /></button>}
      <nav className="bnav">
        <button className={!fullPage && !sheet ? 'on' : ''} onClick={() => go('all')}><i className="ti ti-key" />Item</button>
        <button className={sheet === 'folders' ? 'on' : ''} onClick={() => setSheet('folders')}><i className="ti ti-folder" />Folder</button>
        <button className={view === 'gen' ? 'on' : ''} onClick={() => go('gen')}><i className="ti ti-wand" />Generator</button>
        <button className={view === 'health' ? 'on' : ''} onClick={() => go('health')}><i className="ti ti-heartbeat" />Kesehatan</button>
        <button className={sheet === 'more' || view === 'settings' ? 'on' : ''} onClick={() => setSheet('more')}><i className="ti ti-dots" />Lainnya</button>
      </nav>
      {sheet && (
        <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet">
            {sheet === 'folders' ? (
              <>
                {nav('all', 'key', 'Semua item', items.length)}
                {nav('fav', 'star', 'Favorit', items.filter((i) => i.favorite).length)}
                <div className="sep" />
                {folders.map(folderNav)}
                {newFolderRow}
              </>
            ) : (
              <>
                {nav('settings', 'settings', 'Pengaturan')}
                <button className="nav" onClick={() => { setSheet(null); setDialog('backup'); }}><i className="ti ti-database-export" />Backup</button>
                <button className="nav" onClick={() => { setSheet(null); setDialog('history'); }}><i className="ti ti-history" />Riwayat</button>
                <button className="nav" onClick={() => { setSheet(null); setDialog('mfa'); }}><i className="ti ti-shield-lock" />2FA</button>
                <div className="sep" />
                <button className="nav" onClick={lock}><i className="ti ti-lock" />Kunci vault</button>
                <button className="nav" style={{ color: 'var(--bad)' }} onClick={signOut}><i className="ti ti-logout" />Keluar</button>
              </>
            )}
          </div>
        </div>
      )}

      {folderMenu && (
        <div className="menu-wrap" onMouseDown={(e) => e.target === e.currentTarget && setFolderMenu(null)}>
          <div className="menu" style={{ left: Math.min(folderMenu.x, innerWidth - 230), top: Math.min(folderMenu.y, innerHeight - 260) }}>
            {folderMenu.mode === 'rename' ? (
              <form onSubmit={submitFolderMenu} style={{ padding: 6 }}>
                <input autoFocus value={folderMenu.value} maxLength={MAX_FOLDER_NAME} onChange={(e) => setFolderMenu({ ...folderMenu, value: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setFolderMenu(null)} />
                <button className="btn pri full" disabled={!folderMenu.value.trim() || offline}>Simpan nama</button>
              </form>
            ) : folderMenu.mode === 'style' ? (
              <div style={{ padding: 6 }}>
                <label className="f">Warna</label>
                <div className="swatches">
                  <button className={!styleOf(folderMenu.name).color ? 'on' : ''} onClick={() => styleFolder(folderMenu.name, { color: null })} aria-label="Tanpa warna"><i className="ti ti-ban" /></button>
                  {FOLDER_COLORS.map((c) => <button key={c} className={styleOf(folderMenu.name).color === c ? 'on' : ''} style={{ background: `var(--${c})` }} onClick={() => styleFolder(folderMenu.name, { color: c })} aria-label={c} />)}
                </div>
                <label className="f">Ikon</label>
                <div className="swatches">
                  {FOLDER_ICONS.map((ic) => <button key={ic} className={styleOf(folderMenu.name).icon === ic ? 'on' : ''} onClick={() => styleFolder(folderMenu.name, { icon: ic })} aria-label={ic}><i className={`ti ti-${ic}`} /></button>)}
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => setFolderMenu({ ...folderMenu, mode: 'rename', value: folderMenu.name })} disabled={offline}><i className="ti ti-pencil" />Ganti nama</button>
                <button onClick={() => setFolderMenu({ ...folderMenu, mode: 'style' })} disabled={offline}><i className="ti ti-palette" />Warna &amp; ikon</button>
                <button className="danger" onClick={() => { const n = folderMenu.name; setFolderMenu(null); removeFolder(n); }} disabled={offline}><i className="ti ti-trash" />Hapus folder</button>
              </>
            )}
          </div>
        </div>
      )}

      {editing && <ItemForm item={editing} folders={folders} onClose={() => setEditing(null)} onSave={save} />}
      {dialog === 'backup' && <BackupDialog onClose={() => setDialog(null)} />}
      {dialog === 'history' && <HistoryDialog onClose={() => setDialog(null)} />}
      {dialog === 'mfa' && <TwoFactorDialog copy={copy} onClose={() => { setDialog(null); setMfaCheck((n) => n + 1); }} />}
      {dialog === 'keys' && <KeyboardHelp onClose={() => setDialog(null)} />}
      {dialog === 'palette' && (
        <CommandPalette items={items} commands={commands} onClose={() => setDialog(null)} onCopy={copyField}
          onOpen={(item) => { setView('all'); setSelectedId(item.id); }} />
      )}
      <Toast toast={toast} onDone={hideToast} />
    </div>
  );
}
