import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../../../src/components/Avatar.jsx';
import { siteOf, itemMatches } from '../site.js';

const WEB_APP = 'https://sealbox-bet.pages.dev';
const CLIPBOARD_SECONDS = 30;

async function send(type, payload) {
  const r = await chrome.runtime.sendMessage({ type, ...payload });
  if (!r?.ok) throw new Error(r?.error ?? 'Ekstensi tidak merespons.');
  return r;
}

export function Popup() {
  const [state, setState] = useState(null); // { status, email }
  const [error, setError] = useState('');

  const refresh = () => send('state').then(setState, (err) => setError(err.message));
  useEffect(() => { refresh(); }, []);

  if (!state) return <div className="pop">{error && <p className="err" style={{ padding: 16 }}>{error}</p>}</div>;
  if (state.status === 'unlocked') return <VaultList onLocked={refresh} />;
  return <Unlock state={state} onOpen={refresh} />;
}

function Unlock({ state, onOpen }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(null); // null until 2FA is required
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const signedOut = state.status === 'signedOut';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await send('open', { email: signedOut ? email : state.email, password, code: code || undefined });
      if (r.mfa) setCode('');
      else onOpen();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await send('signOut');
    onOpen();
  }

  return (
    <div className="pop">
      <div className="card auth">
        <img className="logo" src="/icons/icon-128.png" alt="" />
        <h3>{signedOut ? 'Masuk ke Sealbox' : 'Vault terkunci'}</h3>
        <p className="sub">{signedOut ? 'Pakai akun yang sama dengan aplikasi web.' : state.email}</p>
        <form onSubmit={submit}>
          {signedOut && (
            <>
              <label className="f">Email</label>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </>
          )}
          <label className="f">Master password</label>
          <input type="password" required autoFocus={!signedOut} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={code !== null} />
          {code !== null && (
            <>
              <label className="f">Kode 2FA (atau recovery code)</label>
              <input className="mono" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" />
            </>
          )}
          {error && <p className="err">{error}</p>}
          <button className="btn pri full" disabled={busy}>
            <i className="ti ti-lock-open" /> {busy ? 'Membuka…' : code !== null ? 'Verifikasi' : signedOut ? 'Masuk' : 'Buka vault'}
          </button>
        </form>
        <p style={{ margin: '16px 0 0' }}>
          {signedOut
            ? <a className="link" href={WEB_APP} target="_blank" rel="noreferrer">Belum punya akun? Daftar di aplikasi web</a>
            : <button className="link" style={{ color: 'var(--muted)' }} onClick={signOut}>Keluar dari akun</button>}
        </p>
      </div>
    </div>
  );
}

function VaultList({ onLocked }) {
  const [items, setItems] = useState(null);
  const [offline, setOffline] = useState(false);
  const [page, setPage] = useState(null); // siteOf(active tab)
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const timer = useRef(null);

  const [offer, setOffer] = useState(null); // a login submitted in this tab, waiting to be saved

  const load = () => send('items').then((r) => { setItems(r.items); setOffline(r.offline); }, (err) => setError(err.message));

  async function answer(choice) {
    try {
      await send('respondForActiveTab', { choice });
      setOffer(null);
      if (choice === 'save') {
        setMessage('Login tersimpan di Sealbox');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setMessage(''), 2500);
        load();
      }
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    send('pendingForActiveTab').then((r) => setOffer(r.offer?.kind ? r.offer : null), () => {});
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setPage(siteOf(tab?.url)));
    return () => clearTimeout(timer.current);
  }, []);

  const { here, rest } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (items ?? []).filter((i) => !q || [i.name, i.username, i.url].some((v) => v?.toLowerCase().includes(q)));
    const isHere = (i) => itemMatches(i.url, page);
    return { here: shown.filter(isHere), rest: shown.filter((i) => !isHere(i)) };
  }, [items, page, query]);

  async function fill(item) {
    try {
      await send('fillActiveTab', { id: item.id });
      window.close();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy(text, label) {
    await navigator.clipboard.writeText(text);
    await send('clearClipboardLater');
    setMessage(`${label} disalin, dihapus dari clipboard dalam ${CLIPBOARD_SECONDS} detik`);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2500);
  }

  async function lock() {
    await send('lock');
    onLocked();
  }

  const row = (i, canFill) => (
    <div key={i.id} className="item">
      <Avatar name={i.name} />
      <div style={{ minWidth: 0, overflow: 'hidden' }}>{i.name}<small>{i.username || '—'}</small></div>
      <div className="acts">
        {canFill && <button title="Isi di halaman ini" onClick={() => fill(i)}><i className="ti ti-login-2" /></button>}
        {i.username && <button title="Salin username" onClick={() => copy(i.username, 'Username')}><i className="ti ti-user" /></button>}
        {i.password && <button title="Salin password" onClick={() => copy(i.password, 'Password')}><i className="ti ti-key" /></button>}
      </div>
    </div>
  );

  return (
    <div className="pop">
      <div className="pop-head">
        <img src="/icons/icon-48.png" alt="" /><b>Sealbox</b>
        <a className="btn" href={WEB_APP} target="_blank" rel="noreferrer" title="Buka aplikasi web"><i className="ti ti-external-link" /></a>
        <button className="btn" onClick={lock} title="Kunci vault"><i className="ti ti-lock" /></button>
      </div>
      <div className="search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari item…" autoFocus /></div>
      {offer && (
        <div className="card" style={{ margin: '0 12px 8px', padding: 12 }}>
          <b>{offer.kind === 'update' ? `Perbarui password "${offer.itemName}"?` : offer.generated ? `Simpan password baru untuk ${offer.host}?` : `Simpan login untuk ${offer.host}?`}</b>
          {offer.generated && <p className="hint" style={{ margin: '2px 0 0' }}>Password ini dibuat Sealbox dan belum tersimpan.</p>}
          <p className="hint" style={{ margin: '2px 0 10px', wordBreak: 'break-all' }}>{offer.username || '(tanpa username)'} · {offer.host}</p>
          <div className="row" style={{ margin: 0 }}>
            <button className="btn pri" onClick={() => answer('save')}>{offer.kind === 'update' ? 'Perbarui' : 'Simpan'}</button>
            <button className="btn" onClick={() => answer('dismiss')}>Nanti</button>
            {offer.kind === 'save' && <button className="link" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }} onClick={() => answer('never')}>Jangan untuk situs ini</button>}
          </div>
        </div>
      )}
      {offline && <div className="note warn" style={{ margin: '0 12px 6px' }}><i className="ti ti-cloud-off" />Offline: data dari cache</div>}
      {error && <p className="err" style={{ padding: '0 14px' }}>{error}</p>}
      {items === null && !error && <p className="sub" style={{ padding: 14 }}>Memuat…</p>}
      {here.length > 0 && (<><div className="sec">Untuk {page.site}</div>{here.map((i) => row(i, true))}</>)}
      {rest.length > 0 && (<><div className="sec">{here.length ? 'Item lain' : 'Semua item'}</div>{rest.map((i) => row(i, false))}</>)}
      {items?.length === 0 && <p className="sub" style={{ padding: 14 }}>Vault masih kosong. Tambahkan item di aplikasi web.</p>}
      {items?.length > 0 && !here.length && !rest.length && <p className="sub" style={{ padding: 14 }}>Tidak ada item yang cocok.</p>}
      {message && <div className="toast"><i className="ti ti-check" />{message}</div>}
    </div>
  );
}
