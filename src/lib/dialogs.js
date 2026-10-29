import { useSyncExternalStore } from 'react';

// Promise-based replacements for confirm()/alert(), rendered by <DialogHost />.
let current = null; // { title, body, confirmLabel, cancelLabel, danger, icon, resolve }
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function confirmDialog({ title, body = '', confirmLabel = 'Lanjutkan', cancelLabel = 'Batal', danger = false, icon }) {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { title, body, confirmLabel, cancelLabel, danger, icon, resolve };
    emit();
  });
}

export function alertDialog(title, body = '') {
  return confirmDialog({ title, body, confirmLabel: 'OK', cancelLabel: null, icon: 'alert-circle' });
}

export function closeDialog(result) {
  const d = current;
  current = null;
  emit();
  d?.resolve(result);
}

export function useDialog() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);
}
