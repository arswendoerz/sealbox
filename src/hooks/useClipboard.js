import { useCallback, useEffect, useRef, useState } from 'react';

// Clearing lives outside React, so locking the vault (which unmounts the page) doesn't cancel it.
// Browsers refuse clipboard writes from a tab without focus, so a failed clear is retried as
// soon as the tab is focused again. Only text Sealbox copied is ever cleared.
let ours = false;
let clearTimer = null;

export async function clearClipboard() {
  if (!ours) return;
  clearTimeout(clearTimer);
  try {
    await navigator.clipboard.writeText('');
    ours = false;
  } catch { /* not focused: retried on focus */ }
}

addEventListener('focus', () => { if (ours) clearClipboard(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ours) clearClipboard();
});

// Copies text and clears the clipboard after `seconds`.
export function useClipboard(seconds = 30) {
  const [message, setMessage] = useState('');
  const toast = useRef(null);

  useEffect(() => () => clearTimeout(toast.current), []);

  const copy = useCallback(async (text, label = 'Teks') => {
    await navigator.clipboard.writeText(text);
    ours = true;
    clearTimeout(clearTimer);
    clearTimer = setTimeout(clearClipboard, seconds * 1000);
    setMessage(`${label} disalin, clipboard dihapus dalam ${seconds} detik`);
    clearTimeout(toast.current);
    toast.current = setTimeout(() => setMessage(''), 3000);
  }, [seconds]);

  return { copy, message };
}
