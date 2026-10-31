import { useEffect, useMemo, useState } from 'react';
import { StrengthMeter } from './StrengthMeter.jsx';
import { PasswordGenerator } from './PasswordGenerator.jsx';
import { parseRules, checkRules, describeRules, knownRulesFor, RULE_PRESETS } from '../lib/passwordRules.js';
import { MAX_FOLDER_NAME } from '../lib/folders.js';
import { TYPES, TYPE_FIELDS, typeOf, cardBrand } from '../lib/itemTypes.js';
import { parseTotp, formatCode } from '../lib/totp.js';
import { useTotp } from '../hooks/useTotp.js';

const NEW_FOLDER = ' new'; // folder names are trimmed, so none starts with a space
const EMPTY = {
  name: '', url: '', username: '', password: '', totp: '', folder: '', notes: '', favorite: false, exactHost: false, rules: '',
  cardholder: '', cardNumber: '', cardExpiry: '', cardCvv: '', fullName: '', email: '', phone: '', address: '', idNumber: '',
};
const PLACEHOLDER = { login: 'Gmail', card: 'Kartu BCA', note: 'WiFi rumah', identity: 'KTP' };

// Only the fields of the chosen kind are saved, so switching kinds while adding leaves nothing behind.
function toItem(form, kind) {
  const keep = ['id', 'name', 'folder', 'notes', 'favorite', 'passwordChangedAt', ...TYPE_FIELDS[kind], ...(kind === 'login' ? ['exactHost'] : [])];
  const out = Object.fromEntries(Object.entries(form).filter(([k, v]) => keep.includes(k) && v !== undefined && v !== ''));
  if (kind !== 'login') out.type = kind;
  return { ...out, favorite: !!form.favorite };
}

function TotpPreview({ value }) {
  const t = useTotp(value);
  if (!t || t.error) return null;
  return <p className="hint" style={{ marginTop: -6 }}>Kode sekarang: <b className="mono">{formatCode(t.code)}</b> · disimpan terenkripsi seperti password.</p>;
}

// inline: drawn in place of the item's details (editing) instead of as a dialog (adding).
export function ItemForm({ item, folders, onSave, onClose, inline = false }) {
  const [kind, setKind] = useState(typeOf(item));
  const [form, setForm] = useState({ ...EMPTY, ...item });
  const [showGen, setShowGen] = useState(false);
  const [typingFolder, setTypingFolder] = useState(false);
  const folderOptions = [...new Set([...folders, form.folder].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [showPw, setShowPw] = useState(false);
  const [showRules, setShowRules] = useState(!!item?.rules);
  const [known, setKnown] = useState(null); // { domain, rules } from Apple's dataset for this URL
  const rules = useMemo(() => parseRules(form.rules), [form.rules]);
  const violations = checkRules(form.password, rules);
  const totpError = useMemo(() => {
    if (!form.totp.trim()) return '';
    try { parseTotp(form.totp); return ''; } catch (err) { return err.message; }
  }, [form.totp]);

  useEffect(() => {
    if (kind !== 'login') return;
    let live = true;
    const t = setTimeout(() => knownRulesFor(form.url).then((k) => live && setKnown(k)), 300);
    return () => { live = false; clearTimeout(t); };
  }, [form.url, kind]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (kind === 'login' && totpError) return setError(totpError);
    setBusy(true);
    setError('');
    try {
      const totp = form.totp.trim();
      const name = form.name.trim() || (kind === 'login' && form.url.trim()) || 'Tanpa nama';
      // A bare secret is stored without spaces; an otpauth:// URI is kept whole (digits, period).
      const clean = { ...form, name, folder: form.folder.trim(), totp: totp && !/^otpauth:/i.test(totp) ? parseTotp(totp).secret : totp };
      await onSave(toItem(clean, kind));
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const body = (
      <form className={`card ${inline ? 'dmain iform' : 'modal'}`} onSubmit={submit} onKeyDown={inline ? (e) => e.key === 'Escape' && onClose() : undefined}>
        <h3>{item?.id ? `Edit ${TYPES[kind].label.toLowerCase()}` : 'Tambah item'}<button type="button" className="btn icon" onClick={onClose} aria-label="Tutup"><i className="ti ti-x" /></button></h3>
        {!item?.id && (
          <div className="tabs" role="tablist">
            {Object.entries(TYPES).map(([k, t]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><i className={`ti ti-${t.icon}`} /> {t.label}</button>
            ))}
          </div>
        )}
        <label className="f">Nama</label>
        <input value={form.name} onChange={set('name')} placeholder={PLACEHOLDER[kind]} autoFocus />

        {kind === 'login' && (<>
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
          <label className="f">Secret 2FA (opsional)</label>
          <input className="mono" value={form.totp} onChange={set('totp')} placeholder="JBSW Y3DP EHPK 3PXP atau otpauth://…" autoComplete="off" spellCheck={false} />
          {totpError ? <p className="err" style={{ marginTop: -6 }}>{totpError}</p>
            : form.totp.trim() ? <TotpPreview value={form.totp.trim()} />
              : <p className="hint" style={{ marginTop: -6 }}>Saat mengaktifkan 2FA di situs, pilih "tidak bisa memindai?" lalu tempel kodenya di sini.</p>}
        </>)}

        {kind === 'card' && (<>
          <label className="f">Nama di kartu</label>
          <input value={form.cardholder} onChange={set('cardholder')} autoComplete="off" />
          <label className="f">Nomor kartu {cardBrand(form.cardNumber) && <i className={`ti ti-brand-${cardBrand(form.cardNumber)}`} />}</label>
          <input className="mono" inputMode="numeric" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} autoComplete="off" />
          <div className="grid2">
            <div><label className="f">Berlaku (BB/TT)</label><input className="mono" value={form.cardExpiry} onChange={set('cardExpiry')} placeholder="08/29" maxLength={7} autoComplete="off" /></div>
            <div><label className="f">CVV</label><input className="mono" type="password" inputMode="numeric" value={form.cardCvv} onChange={(e) => setForm({ ...form, cardCvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} autoComplete="off" /></div>
          </div>
        </>)}

        {kind === 'identity' && (<>
          <label className="f">Nama lengkap</label>
          <input value={form.fullName} onChange={set('fullName')} autoComplete="off" />
          <div className="grid2">
            <div><label className="f">Email</label><input value={form.email} onChange={set('email')} autoComplete="off" /></div>
            <div><label className="f">Telepon</label><input value={form.phone} onChange={set('phone')} autoComplete="off" /></div>
          </div>
          <label className="f">Nomor identitas (KTP, paspor)</label>
          <input className="mono" value={form.idNumber} onChange={set('idNumber')} autoComplete="off" />
          <label className="f">Alamat</label>
          <textarea rows="2" value={form.address} onChange={set('address')} />
        </>)}

        <div className="grid2">
          <div>
            <label className="f">Folder</label>
            {typingFolder ? (
              <div className="pwrow">
                <input autoFocus value={form.folder} onChange={set('folder')} placeholder="Nama folder baru" maxLength={MAX_FOLDER_NAME} />
                <button type="button" className="btn icon" title="Pilih folder yang ada" onClick={() => { setTypingFolder(false); setForm({ ...form, folder: '' }); }}><i className="ti ti-list" /></button>
              </div>
            ) : (
              <select value={form.folder} onChange={(e) => {
                const folder = e.target.value;
                if (folder === NEW_FOLDER) setTypingFolder(true);
                setForm({ ...form, folder: folder === NEW_FOLDER ? '' : folder });
              }}>
                <option value="">Tanpa folder</option>
                {folderOptions.map((f) => <option key={f} value={f}>{f}</option>)}
                <option value={NEW_FOLDER}>+ Folder baru…</option>
              </select>
            )}
          </div>
          <label className="check" style={{ marginTop: 22 }}><input type="checkbox" checked={form.favorite} onChange={set('favorite')} />Favorit</label>
        </div>
        <label className="f">{kind === 'note' ? 'Isi catatan' : 'Catatan'}</label>
        <textarea rows={kind === 'note' ? 8 : 3} value={form.notes} onChange={set('notes')} />
        {error && <p className="err">{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', margin: 0 }}>
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className="btn pri" disabled={busy}>Simpan</button>
        </div>
      </form>
  );
  if (inline) return body;
  return <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>{body}</div>;
}
