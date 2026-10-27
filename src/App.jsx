import { useEffect, useState } from 'react';
import { useVault } from './context/VaultContext.jsx';
import { useAutoLock } from './hooks/useAutoLock.js';
import { Register } from './pages/Register.jsx';
import { Unlock } from './pages/Unlock.jsx';
import { Recover } from './pages/Recover.jsx';
import { Vault } from './pages/Vault.jsx';

export default function App() {
  const { status, lock } = useVault();
  const [recovering, setRecovering] = useState(false);
  useAutoLock(status === 'unlocked', lock, 5);
  useEffect(() => { if (status === 'unlocked') setRecovering(false); }, [status]);

  if (status === 'loading') return null;
  if (status === 'new') return <Register />;
  if (status === 'locked') {
    return recovering ? <Recover onBack={() => setRecovering(false)} /> : <Unlock onRecover={() => setRecovering(true)} />;
  }
  return <Vault />;
}
