import { useEffect, useState } from 'react';
import { mfaStatus } from '../lib/mfa.js';

// true / false, or null while unknown (loading, offline). `refresh` changes re-check it.
export function useMfaEnabled(refresh) {
  const [enabled, setEnabled] = useState(null);
  useEffect(() => {
    let live = true;
    mfaStatus().then((s) => live && setEnabled(s.enabled), () => live && setEnabled(null));
    return () => { live = false; };
  }, [refresh]);
  return enabled;
}
