const KEYS = [
  ['Cari', ['/']], ['Palet perintah', ['Ctrl', 'K']],
  ['Pindah item', ['↑', '↓']], ['Item baru', ['N']],
  ['Salin password', ['Ctrl', 'C']], ['Salin username', ['Ctrl', 'B']],
  ['Edit item', ['E']], ['Hapus item', ['Del']],
  ['Generator', ['G']], ['Kunci vault', ['L']],
  ['Daftar shortcut', ['?']], ['Tutup / batal', ['Esc']],
];

export function KeyboardHelp({ onClose }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card modal" style={{ maxWidth: 560 }}>
        <h3><i className="ti ti-keyboard" style={{ color: 'var(--brand)', marginRight: 8 }} />Shortcut keyboard<button className="btn icon" onClick={onClose} aria-label="Tutup"><i className="ti ti-x" /></button></h3>
        <div className="keys">
          {KEYS.map(([label, keys]) => <div key={label}>{label}<span>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</span></div>)}
        </div>
        <p className="hint" style={{ margin: '12px 0 0' }}>Di Mac, pakai <kbd>⌘</kbd> sebagai pengganti <kbd>Ctrl</kbd>.</p>
      </div>
    </div>
  );
}
