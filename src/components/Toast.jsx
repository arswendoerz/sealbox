import { useEffect, useState } from 'react';

// toast: { id, icon, text, action?: { label, run }, until?, total? } (until/total in ms: countdown bar)
export function Toast({ toast, onDone }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!toast) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    const end = setTimeout(onDone, toast.ttl ?? 4000);
    return () => { clearInterval(t); clearTimeout(end); };
  }, [toast, onDone]);

  if (!toast) return null;
  const left = toast.until ? Math.max(0, toast.until - now) : null;
  const text = typeof toast.text === 'function' ? toast.text(Math.ceil((left ?? 0) / 1000)) : toast.text;
  return (
    <div className="toast" role="status" key={toast.id}>
      <i className={`ti ti-${toast.icon ?? 'check'}`} />{text}
      {toast.action && <button onClick={() => { toast.action.run(); onDone(); }}>{toast.action.label}</button>}
      {left != null && <span className="bar" style={{ width: `${(left / toast.total) * 100}%` }} />}
    </div>
  );
}
