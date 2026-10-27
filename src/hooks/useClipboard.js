import { useCallback, useEffect, useRef, useState } from 'react';

// Copies text and clears the clipboard after `seconds`.
export function useClipboard(seconds = 30) {
  const [message, setMessage] = useState('');
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const copy = useCallback(async (text, label = 'Teks') => {
    await navigator.clipboard.writeText(text);
    timers.current.forEach(clearTimeout);
    setMessage(`${label} disalin, clipboard dihapus dalam ${seconds} detik`);
    timers.current = [
      setTimeout(() => setMessage(''), 3000),
      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), seconds * 1000),
    ];
  }, [seconds]);

  return { copy, message };
}
