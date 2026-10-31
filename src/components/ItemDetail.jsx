import { useEffect, useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { useVault } from '../context/VaultContext.jsx';
import { estimateBits, strength } from '../crypto/generator.js';
import { pwnedCount, OLD_AFTER_DAYS } from '../lib/health.js';
import { parseRules, describeRules, knownRulesFor } from '../lib/passwordRules.js';
import { parseUrl } from '../lib/url.js';
import { TYPES, typeOf, cardBrand, last4 } from '../lib/itemTypes.js';
import { useTotp } from '../hooks/useTotp.js';
import { formatCode } from '../lib/totp.js';
import { TotpRing } from './TotpRing.jsx';

const DAY = 24 * 60 * 60 * 1000;
const shortDate = (t) => new Date(t).toLocaleDateString('id', { day: 'numeric', month: 'short', year: 'numeric' });
const FIELDS = [['password', 'Password'], ['username', 'Username'], ['url', 'URL'], ['name', 'Nama'], ['notes', 'Catatan'], ['rules', 'Aturan password'],
  ['totp', 'Kode 2FA'], ['cardNumber', 'Nomor kartu'], ['cardExpiry', 'Masa berlaku'], ['cardCvv', 'CVV'], ['cardholder', 'Nama di kartu'],
  ['fullName', 'Nama lengkap'], ['email', 'Email'], ['phone', 'Telepon'], ['address', 'Alamat'], ['idNumber', 'Nomor identitas'], ['folder', 'Folder']];

// "Password diubah", "Username, URL diubah", ... by comparing a version with the state after it.
function changeLabel(before, after) {
  if (!before) return 'Versi tidak bisa dibuka';
  const changed = FIELDS.filter(([k]) => (before[k] ?? '') !== (after?.[k] ?? '')).map(([, label]) => label);
  if (!changed.length) return 'Diubah';
  return `${changed.slice(0, 2).join(', ')}${changed.length > 2 ? ' dll.' : ''} diubah`;
}

function SecurityPanel({ item, reusedWith, offline }) {
  const bits = estimateBits(item.password);
  const s = strength(bits);
  const age = Math.floor((Date.now() - (item.passwordChangedAt ?? item.updatedAt)) / DAY);
  const [breach, setBreach] = useState(null); // null | 'checking' | number | Error

  async function check() {
    setBreach('checking');
    try {
      setBreach(await pwnedCount(item.password));
    } catch (err) {
      setBreach(err);
    }
  }

  return (
    <div className="card panel">
      <h4><i className={`ti ti-shield-${s.level >= 3 ? 'check' : 'exclamation'}`} />Keamanan</h4>
      <div className="meter" style={{ margin: '0 0 8px' }}><i className={`lv${s.level}`} style={{ width: `${s.level * 25}%` }} /></div>
      <div className="kv"><span>Kekuatan</span><span>{s.label} · {Math.round(bits)} bit</span></div>
      <div className="kv"><span>Dipakai ulang</span><span style={reusedWith ? { color: 'var(--bad)' } : undefined}>{reusedWith ? `Ya, di ${reusedWith} item lain` : 'Tidak'}</span></div>
      <div className="kv"><span>Umur password</span><span style={age > OLD_AFTER_DAYS ? { color: 'var(--warn)' } : undefined}>{age} hari</span></div>
      <div className="kv">
        <span>Kebocoran</span>
        {breach === null || breach instanceof Error ? (
          <span>
            {breach && <span className="err" style={{ margin: '0 6px 0 0' }}>Gagal.</span>}
            <button className="link" onClick={check} disabled={offline} title="Hanya 5 karakter awal hash yang dikirim ke Have I Been Pwned">{offline ? 'Butuh internet' : 'Cek sekarang'}</button>
          </span>
        ) : breach === 'checking' ? <span>Memeriksa…</span>
          : breach > 0 ? <span style={{ color: 'var(--bad)' }}>Bocor {breach.toLocaleString('id')}×, ganti segera</span>
            : <span style={{ color: 'var(--ok)' }}>Tidak ditemukan</span>}
      </div>
    </div>
  );
}

function SitePanel({ item, url }) {
  const [site, setSite] = useState(null);
  const [known, setKnown] = useState(null);

  const hostname = url?.hostname;
  useEffect(() => {
    let live = true;
    if (hostname) import('tldts').then(({ getDomain }) => live && setSite(getDomain(hostname, { allowPrivateDomains: true }) ?? hostname));
    if (!item.rules && item.url) knownRulesFor(item.url).then((k) => live && setKnown(k));
    return () => { live = false; };
  }, [item.url, item.rules, hostname]); // url is a new object every render

  const own = item.rules && parseRules(item.rules);
  return (
    <div className="card panel">
      <h4><i className="ti ti-world" />Situs dan isi otomatis</h4>
      <div className="kv">
        <span>Diisi di</span>
        <span>{!url ? 'Tidak ada URL' : item.exactHost ? `Hanya ${url.host.replace(/^www\./, '')}` : `${site ?? url.hostname} (semua subdomain)`}</span>
      </div>
      <div className="kv">
        <span>Aturan password</span>
        <span>{own ? describeRules(own) || 'Khusus item ini' : known ? `Dari database: ${known.domain}` : 'Standar (20 karakter)'}</span>
      </div>
    </div>
  );
}

function HistoryPanel({ item, offline }) {
  const { loadHistory } = useVault();
  const [versions, setVersions] = useState(null);

  useEffect(() => {
    let live = true;
    if (!offline) loadHistory(item.id).then((v) => live && setVersions(v), () => live && setVersions([]));
    return () => { live = false; };
  }, [item.id, item.updatedAt, offline, loadHistory]);

  return (
    <div className="card panel">
      <h4><i className="ti ti-history" />Riwayat item</h4>
      {offline ? <p className="hint" style={{ margin: 0 }}>Butuh koneksi internet.</p>
        : !versions ? <p className="hint" style={{ margin: 0 }}>Memuat…</p>
          : (
            <>
              {versions.slice(0, 5).map((v, k) => (
                <div key={v.version_id} className="hist">
                  <i className="ti ti-pencil" />{changeLabel(v.item, k === 0 ? item : versions[k - 1].item)}<small>{shortDate(v.saved_at)}</small>
                </div>
              ))}
              {versions.length === 0 && <p className="hint" style={{ margin: 0 }}>Belum pernah diubah (riwayat disimpan 30 hari).</p>}
              {versions.length > 0 && <p className="hint" style={{ margin: '8px 0 0' }}>Pulihkan versi lama lewat menu Riwayat.</p>}
            </>
          )}
    </div>
  );
}

// One copyable field. secret: masked until revealed.
function Field({ label, value, copy, secret, wide, mono, children }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  return (
    <div className={wide ? 'wide' : undefined}>
      <label className="f">{label}</label>
      <div className="val">
        <span className={mono || secret ? 'mono' : undefined}>{secret && !show ? '•'.repeat(Math.min(value.length, 16)) : value}</span>
        {children}
        {secret && <button onClick={() => setShow(!show)} title="Lihat"><i className={`ti ti-eye${show ? '-off' : ''}`} /></button>}
        {copy && <button onClick={() => copy(value, label)} title="Salin"><i className="ti ti-copy" /></button>}
      </div>
    </div>
  );
}

function TotpField({ item, copyField }) {
  const t = useTotp(item.totp);
  if (!t) return null;
  return (
    <div className="wide">
      <label className="f">Kode 2FA (TOTP)</label>
      {t.error ? <div className="val"><span className="err" style={{ margin: 0 }}>{t.error}</span></div> : (
        <div className="val totp">
          <TotpRing remaining={t.remaining} period={t.period} />
          <span className="code">{formatCode(t.code)}</span>
          <small>berganti dalam {t.remaining} dtk</small>
          <button onClick={() => copyField(item, 'totp')} title="Salin"><i className="ti ti-copy" /></button>
        </div>
      )}
    </div>
  );
}

function CardFace({ item }) {
  const brand = cardBrand(item.cardNumber);
  return (
    <div className="cardface">
      <div className="cf-top"><b>{item.name}</b>{brand && <i className={`ti ti-brand-${brand}`} />}</div>
      <div className="mono cf-num">•••• •••• •••• {last4(item.cardNumber) || '••••'}</div>
      <div className="cf-bottom"><span>{(item.cardholder || '').toUpperCase()}</span><span>{item.cardExpiry}</span></div>
    </div>
  );
}

// editor: the edit form, shown in place of the fields while the item is being edited.
export function ItemDetail({ item, reusedWith = 0, offline, editor, onEdit, onDelete, onBack, copy, copyField }) {
  const kind = typeOf(item);
  const url = kind === 'login' ? parseUrl(item.url) : null;

  return (
    <div className="detail">
      <button className="btn back" onClick={onBack} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
      <div className="dh">
        <Avatar item={item} />
        <div style={{ minWidth: 0 }}>
          <h3>{item.name}</h3>
          {url ? <a className="link" href={url.href} target="_blank" rel="noreferrer noopener">{url.hostname}</a> : <span className="sub" style={{ margin: 0 }}>{TYPES[kind].label}</span>}
        </div>
        {!editor && <div className="act">
          <button className="btn" onClick={onEdit} title="Edit (E)"><i className="ti ti-edit" /> Edit</button>
          <button className="btn icon danger" onClick={onDelete} aria-label="Hapus" title="Hapus (Del)"><i className="ti ti-trash" /></button>
        </div>}
      </div>

      {!editor && kind === 'login' && (item.username || item.password) && (
        <div className="mobile-actions">
          {item.username && <button className="btn" onClick={() => copyField(item, 'username')}><i className="ti ti-user" />Salin username</button>}
          {item.password && <button className="btn pri" onClick={() => copyField(item, 'password')}><i className="ti ti-key" />Salin password</button>}
        </div>
      )}

      <div className="dgrid">
        {editor || <div className="card dmain">
          {kind === 'card' && <CardFace item={item} />}
          <div className="fields">
            {kind === 'login' && (<>
              <Field label="Username" value={item.username} copy={copy} />
              <Field label="Password" value={item.password} copy={copy} secret />
              <TotpField item={item} copyField={copyField} />
              {url && (
                <Field label="URL" value={item.url} copy={() => copy(url.href, 'URL')} wide>
                  <a href={url.href} target="_blank" rel="noreferrer noopener" title="Buka" style={{ color: 'var(--muted)', fontSize: 16 }}><i className="ti ti-external-link" /></a>
                </Field>
              )}
            </>)}
            {kind === 'card' && (<>
              <Field label="Nama di kartu" value={item.cardholder} copy={copy} />
              <Field label="Nomor kartu" value={item.cardNumber} copy={copy} secret />
              <Field label="Berlaku sampai" value={item.cardExpiry} copy={copy} mono />
              <Field label="CVV" value={item.cardCvv} copy={copy} secret />
            </>)}
            {kind === 'identity' && (<>
              <Field label="Nama lengkap" value={item.fullName} copy={copy} />
              <Field label="Email" value={item.email} copy={copy} />
              <Field label="Telepon" value={item.phone} copy={copy} />
              <Field label="Nomor identitas" value={item.idNumber} copy={copy} secret />
              <Field label="Alamat" value={item.address} copy={copy} wide />
            </>)}
            <Field label="Catatan" value={item.notes} copy={kind === 'note' ? copy : undefined} wide />
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {item.folder && <span className="pill" style={{ background: 'var(--soft)', color: 'var(--muted)' }}><i className="ti ti-folder" />{item.folder}</span>}
            {item.favorite && <span className="pill" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}><i className="ti ti-star" />Favorit</span>}
            <span className="pill" style={{ background: 'var(--soft)', color: 'var(--muted)' }}><i className="ti ti-clock" />Diubah {shortDate(item.updatedAt)}</span>
          </div>
        </div>}

        <div>
          {kind === 'login' && item.password && <SecurityPanel key={item.password} item={item} reusedWith={reusedWith} offline={offline} />}
          {kind === 'login' && <SitePanel item={item} url={url} />}
          <HistoryPanel item={item} offline={offline} />
        </div>
      </div>
    </div>
  );
}
