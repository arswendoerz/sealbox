import { useState } from 'react';

const KEY = 'sealbox-theme'; // also read by public/theme.js before the app loads

// 'system' | 'light' | 'dark'. Stored per device; it says nothing about the vault.
export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? 'system';
    } catch {
      return 'system';
    }
  });

  function setTheme(t) {
    setThemeState(t);
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try {
      if (t === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch { /* storage blocked: the choice lasts until reload */ }
  }

  return [theme, setTheme];
}
