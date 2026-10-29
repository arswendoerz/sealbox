import { useEffect, useRef } from 'react';
import { useDialog, closeDialog } from '../lib/dialogs.js';

export function DialogHost() {
  const d = useDialog();
  const ok = useRef(null);

  useEffect(() => {
    if (!d) return;
    ok.current?.focus();
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeDialog(false); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [d]);

  if (!d) return null;
  return (
    <div className="overlay" style={{ zIndex: 40 }} onMouseDown={(e) => e.target === e.currentTarget && closeDialog(false)}>
      <div className="card confirm" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title">
        <span className={`big${d.danger ? ' bad' : ''}`}><i className={`ti ti-${d.icon ?? (d.danger ? 'trash' : 'help-circle')}`} /></span>
        <h3 id="dlg-title">{d.title}</h3>
        {d.body && <p className="sub">{d.body}</p>}
        <div className="confirm-actions">
          {d.cancelLabel && <button className="btn" onClick={() => closeDialog(false)}>{d.cancelLabel} <kbd>Esc</kbd></button>}
          <button ref={ok} className={`btn ${d.danger ? 'solid-bad' : 'pri'}`} onClick={() => closeDialog(true)}>
            {d.danger && <i className="ti ti-trash" />}{d.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
