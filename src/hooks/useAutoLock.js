import { useEffect } from 'react';

const EVENTS = ['mousemove', 'keydown', 'pointerdown', 'scroll'];
const HIDDEN_MS = 60_000;

// Calls onLock after `minutes` without user activity, and (if onHidden) 1 minute after the tab
// is hidden.
export function useAutoLock(active, onLock, minutes = 5, onHidden = false) {
  useEffect(() => {
    if (!active) return;
    let timer;
    let hiddenTimer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onLock, minutes * 60_000);
    };
    const visibility = () => {
      clearTimeout(hiddenTimer);
      if (onHidden && document.visibilityState === 'hidden') hiddenTimer = setTimeout(onLock, HIDDEN_MS);
    };
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', visibility);
    reset();
    return () => {
      clearTimeout(timer);
      clearTimeout(hiddenTimer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, onLock, minutes, onHidden]);
}
