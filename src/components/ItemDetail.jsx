import { useState } from 'react';
import { Avatar } from './Avatar.jsx';
import { estimateBits, strength } from '../crypto/generator.js';

// Only http(s) links are rendered, so a stored "javascript:" URL can't run.
function parseUrl(url) {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
    return ['http:', 'https:'].includes(u.protocol) ? u : null;
  } catch {
    return null;
  }
}

export function ItemDetail({ item, onEdit, onDelete, onBack, copy }) {
  const [show, setShow] = useState(false);
  const s = strength(estimateBits(item.password));
  const url = item.url && parseUrl(item.url);

  return (
    <div className="detail">
      <button className="btn back" onClick={onBack} style={{ marginBottom: 16 }}><i className="ti ti-arrow-left" /> Kembali</button>
      <div className="dh">
        <Avatar name={item.name} />
        <div style={{ minWidth: 0 }}>
          <h3>{item.name}</h3>
          {url && <a className="link" href={url.href} target="_blank" rel="noreferrer noopener">{url.hostname}</a>}
        </div>
        <div className="act">
          <button className="btn" onClick={onEdit}><i className="ti ti-edit" /> Edit</button>
          <button className="btn icon danger" onClick={onDelete} aria-label="Hapus"><i className="ti ti-trash" /></button>
        </div>
      </div>

      {item.username && (<>
        <label className="f">Username</label>
        <div className="val"><span>{item.username}</span><button onClick={() => copy(item.username, 'Username')} title="Salin"><i className="ti ti-copy" /></button></div>
      </>)}
      {item.password && (<>
        <label className="f">Password</label>
        <div className="val">
          <span className="mono">{show ? item.password : '•'.repeat(Math.min(item.password.length, 16))}</span>
          <button onClick={() => setShow(!show)} title="Lihat"><i className={`ti ti-eye${show ? '-off' : ''}`} /></button>
          <button onClick={() => copy(item.password, 'Password')} title="Salin"><i className="ti ti-copy" /></button>
        </div>
      </>)}
      {item.notes && (<>
        <label className="f">Catatan</label>
        <div className="val"><span>{item.notes}</span></div>
      </>)}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        {item.password && (
          <span className="pill" style={s.level >= 3 ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : { background: 'var(--warn-soft)', color: 'var(--warn)' }}>
            <i className={`ti ti-shield-${s.level >= 3 ? 'check' : 'exclamation'}`} />Password {s.label.toLowerCase()}
          </span>
        )}
        {item.folder && <span className="pill" style={{ background: 'var(--soft)', color: 'var(--muted)' }}><i className="ti ti-folder" />{item.folder}</span>}
        <span className="pill" style={{ background: 'var(--soft)', color: 'var(--muted)' }}><i className="ti ti-clock" />Diubah {new Date(item.updatedAt).toLocaleDateString('id')}</span>
      </div>
    </div>
  );
}
