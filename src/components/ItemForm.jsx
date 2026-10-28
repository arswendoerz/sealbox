import { useEffect, useMemo, useState } from 'react';
import { StrengthMeter } from './StrengthMeter.jsx';
import { PasswordGenerator } from './PasswordGenerator.jsx';
import { parseRules, checkRules, describeRules, knownRulesFor, RULE_PRESETS } from '../lib/passwordRules.js';

const EMPTY = { name: '', url: '', username: '', password: '', folder: '', notes: '', favorite: false, exactHost: false, rules: '' };

export function ItemForm({ item, folders, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY, ...item });
  const [showGen, setShowGen] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showRules, setShowRules] = useState(!!item?.rules);
  const [known, setKnown] = useState(null); // { domain, rules } from Apple's dataset for this URL
  const rules = useMemo(() => parseRules(form.rules), [form.rules]);
  const violations = checkRules(form.password, rules);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => knownRulesFor(form.url).then((k) => live && setKnown(k)), 300);
    return () => { live = false; clearTimeout(t); };
  }, [form.url]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave({ ...form, name: form.name.trim() || form.url.trim() || 'Tanpa nama' });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card modal" onSubmit={submit}>
        <h3>{item?.id ? 'Edit item' : 'Tambah item'}<button type="button" className="btn icon" onClick={onClose} aria-label="Tutup"><i className="ti ti-x" /></button></h3>
        <label className="f">Nama</label>
        <input value={form.name} onChange={set('name')} placeholder="Gmail" autoFocus />
        <label className="f">URL</label>
        <input value={form.url} onChange={set('url')} placeholder="https://mail.google.com" />
        <label className="check" style={{ marginTop: -6 }} title="Tanpa ini, ekstensi juga menawarkan login di subdomain lain dari situs yang sama.">
          <input type="checkbox" checked={form.exactHost} onChange={set('exactHost')} />Isi otomatis hanya di alamat ini persis (bukan subdomain lain)
        </label>
        <label className="f">Username / email</label>
        <input value={form.username} onChange={set('username')} autoComplete="off" />
        <label className="f">Password</label>
        <div className="pwrow">
          <input className="mono" type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete="new-password" />
          <button type="button" className="btn icon" onClick={() => setShowPw(!showPw)} title="Lihat"><i className={`ti ti-eye${showPw ? '-off' : ''}`} /></button>
          <button type="button" className="btn icon" onClick={() => setShowGen(!showGen)} title="Generator"><i className="ti ti-wand" /></button>
        </div>
        <StrengthMeter password={form.password} />
        {violations.length > 0 && <p className="err" style={{ marginTop: -6 }}>Tidak sesuai aturan situs: {violations.join(', ')}.</p>}
        {showGen && (
          <div className="card gen" style={{ marginBottom: 12, boxShadow: 'none' }}>
            <PasswordGenerator key={form.rules} rules={rules} onUse={(pw) => { setForm({ ...form, password: pw }); setShowGen(false); setShowPw(true); }} />
          </div>
        )}
        {showRules ? (
          <>
            <label className="f">Aturan password situs</label>
            <div className="opt" style={{ margin: '0 0 8px', gap: 6 }}>
              {known && <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setForm({ ...form, rules: known.rules })}><i className="ti ti-database" />Dari database: {known.domain}</button>}
              {RULE_PRESETS.map((p) => (
                <button key={p.label} type="button" className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setForm({ ...form, rules: p.rules })}>{p.label}</button>
              ))}
            </div>
            <input className="mono" value={form.rules} onChange={set('rules')} placeholder="minlength: 8; maxlength: 16; required: digit;" style={{ fontSize: 12 }} />
            <p className="hint" style={{ marginTop: -6 }}>
              {rules ? describeRules(rules) || 'Tidak ada batasan yang dikenali.' : 'Kosong = tanpa aturan. Format: Apple passwordrules.'}
            </p>
          </>
        ) : (
          <p className="hint" style={{ marginTop: -4 }}>
            <button type="button" className="link" onClick={() => setShowRules(true)}>Situs ini punya aturan password?</button>
            {known && ` Aturan untuk ${known.domain} tersedia.`}
          </p>
        )}
        <div className="grid2">
          <div>
            <label className="f">Folder</label>
            <input value={form.folder} onChange={set('folder')} list="folders" placeholder="Sosial" />
            <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
          </div>
          <label className="check" style={{ marginTop: 22 }}><input type="checkbox" checked={form.favorite} onChange={set('favorite')} />Favorit</label>
        </div>
        <label className="f">Catatan</label>
        <textarea rows="3" value={form.notes} onChange={set('notes')} />
        {error && <p className="err">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', margin: 0 }}>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn pri" disabled={busy}>Simpan</button>
        </div>
      </form>
    </div>
  );
}
