// Applies the saved theme before the app renders, so a dark choice doesn't flash light.
// A separate file because the CSP blocks inline scripts.
try {
  const t = localStorage.getItem('sealbox-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage blocked: follow the system */ }
