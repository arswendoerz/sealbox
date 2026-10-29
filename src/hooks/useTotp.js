import { useEffect, useState } from 'react';
import { totpCode } from '../lib/totp.js';

// The current code for a stored TOTP secret, refreshed every second. null when there is none.
export function useTotp(stored) {
  const [state, setState] = useState(null); // { code, remaining, period } | { error }
  useEffect(() => {
    if (!stored) { setState(null); return; }
    let live = true;
    const tick = () => totpCode(stored).then((r) => live && setState(r), (err) => live && setState({ error: err.message }));
    tick();
    const t = setInterval(tick, 1000);
    return () => { live = false; clearInterval(t); };
  }, [stored]);
  return state;
}
