import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

// Registers the service worker. A new version waits for the user, since reloading locks the vault.
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update(), HOUR); // tabs stay open for a long time
    },
  });
  const [reloading, setReloading] = useState(false);
  if (!needRefresh) return null;

  function reload() {
    setReloading(true);
    updateServiceWorker(true);
  }

  return (
    <div className="update" role="status" aria-live="polite">
      <span className="update-icon"><i className="ti ti-sparkles" /></span>
      <div className="update-text">
        <b>Versi baru Sealbox tersedia</b>
        <span>Muat ulang untuk memakai pembaruan. Vault akan terkunci, lalu buka lagi dengan master password.</span>
        <div className="update-actions">
          <button className="btn pri" onClick={reload} disabled={reloading}>
            <i className={`ti ti-refresh${reloading ? ' spin' : ''}`} />{reloading ? 'Memuat…' : 'Muat ulang'}
          </button>
          <button className="btn" onClick={() => setNeedRefresh(false)} disabled={reloading}>Nanti</button>
        </div>
      </div>
      <button className="update-close" onClick={() => setNeedRefresh(false)} aria-label="Tutup" disabled={reloading}><i className="ti ti-x" /></button>
    </div>
  );
}
