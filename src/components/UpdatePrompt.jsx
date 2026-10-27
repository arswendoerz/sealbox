import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

// Registers the service worker. A new version waits for the user, since reloading locks the vault.
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update(), HOUR); // tabs stay open for a long time
    },
  });
  if (!needRefresh) return null;

  return (
    <div className="toast" style={{ top: 16, bottom: 'auto' }}>
      <i className="ti ti-refresh" />Versi baru Sealbox tersedia.
      <button className="link" style={{ color: 'inherit', fontWeight: 600 }} onClick={() => updateServiceWorker(true)}>Muat ulang</button>
      <button className="link" style={{ color: 'inherit', opacity: 0.7 }} onClick={() => setNeedRefresh(false)}>Nanti</button>
    </div>
  );
}
