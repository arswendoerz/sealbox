import { useEffect, useState } from 'react';
import { useVault } from './context/VaultContext.jsx';
import { useAutoLock } from './hooks/useAutoLock.js';
import { Login } from './pages/Login.jsx';
import { Register } from './pages/Register.jsx';
import { Unlock } from './pages/Unlock.jsx';
import { Recover } from './pages/Recover.jsx';
import { Vault } from './pages/Vault.jsx';

export default function App() {
  const { status, lock, hasLegacy } = useVault();
  const [page, setPage] = useState(null); // signed-out sub-page: 'login' | 'register' | 'recover'
  const [recovering, setRecovering] = useState(false);
  useAutoLock(status === 'unlocked', lock, 5);
  useEffect(() => { if (status === 'unlocked') setRecovering(false); }, [status]);

  if (status === 'loading') return null;
  if (status === 'recovering') return <Recover />;
  if (status === 'signedOut') {
    const p = page ?? (hasLegacy ? 'register' : 'login');
    if (p === 'register') return <Register onLogin={() => setPage('login')} />;
    if (p === 'recover') return <Recover onBack={() => setPage('login')} />;
    return <Login onRegister={() => setPage('register')} onRecover={() => setPage('recover')} />;
  }
  if (status === 'locked') {
    return recovering ? <Recover onBack={() => setRecovering(false)} /> : <Unlock onRecover={() => setRecovering(true)} />;
  }
  return <Vault />;
}
