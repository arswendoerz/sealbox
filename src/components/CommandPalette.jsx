import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { subtitle, searchText } from '../lib/itemTypes.js';

// Ctrl+K: find an item and copy from it, or run a command. commands: [{ id, icon, label, key?, run }]
export function CommandPalette({ items, commands, onCopy, onOpen, onClose }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const list = useRef(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const found = (s ? items.filter((i) => searchText(i).includes(s)) : items).slice(0, 8).map((item) => ({ kind: 'item', item }));
    const cmds = commands.filter((c) => !s || c.label.toLowerCase().includes(s)).map((c) => ({ kind: 'cmd', cmd: c }));
    return [...found, ...cmds];
  }, [q, items, commands]);

  useEffect(() => setAt(0), [q]);
  useEffect(() => { list.current?.querySelector('.r.on')?.scrollIntoView({ block: 'nearest' }); }, [at]);

  function run(r, shift) {
    if (!r) return;
    onClose();
    if (r.kind === 'cmd') r.cmd.run();
    else if (shift) onCopy(r.item, 'username');
    else if (r.item.password) onCopy(r.item, 'password');
    else onOpen(r.item);
  }

  function key(e) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[at], e.shiftKey); }
  }

  const firstCmd = results.findIndex((r) => r.kind === 'cmd');
  return (
    <div className="overlay palette-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card palette" role="dialog" aria-label="Palet perintah">
        <div className="q"><i className="ti ti-search" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Cari item atau perintah…" /><kbd>Esc</kbd></div>
        <div className="palette-list" ref={list}>
          {results.length === 0 && <p className="sub" style={{ padding: '14px 16px', margin: 0 }}>Tidak ada yang cocok.</p>}
          {results.map((r, k) => (
            <div key={r.kind === 'item' ? r.item.id : r.cmd.id}>
              {k === 0 && r.kind === 'item' && <div className="grp">Item</div>}
              {k === firstCmd && <div className="grp">Perintah</div>}
              <div className={`r${k === at ? ' on' : ''}`} onMouseEnter={() => setAt(k)} onClick={(e) => run(r, e.shiftKey)}>
                {r.kind === 'item' ? (
                  <><Avatar name={r.item.name} url={r.item.url} small /><span>{r.item.name}</span><small>{subtitle(r.item)}</small>
                    {k === at && <span className="k"><kbd>↵</kbd> {r.item.password ? 'salin password' : 'buka'}</span>}</>
                ) : (
                  <><i className={`ti ti-${r.cmd.icon}`} /><span>{r.cmd.label}</span>{r.cmd.key && <span className="k"><kbd>{r.cmd.key}</kbd></span>}</>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> pilih</span><span><kbd>↵</kbd> salin password</span><span><kbd>Shift</kbd> <kbd>↵</kbd> salin username</span></div>
      </div>
    </div>
  );
}
