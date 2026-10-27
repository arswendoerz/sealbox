import { useEffect } from 'react';

const EVENTS = ['mousemove', 'keydown', 'pointerdown', 'scroll'];

// Calls onLock after `minutes` without user activity.
export function useAutoLock(active, onLock, minutes = 5) {
  useEffect(() => {
    if (!active) return;
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onLock, minutes * 60_000);
    };
    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active, onLock, minutes]);
}
