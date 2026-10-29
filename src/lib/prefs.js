import { useSyncExternalStore } from 'react';

// Per-device preferences. Nothing secret: timings, display choices and checklist ticks.
const KEY = 'sealbox-prefs';
export const DEFAULT_PREFS = {
  autoLockMin: 5, // lock after this many idle minutes
  lockOnHidden: false, // also lock 1 minute after the tab is hidden
  clipboardSec: 30, // clear a copied secret after this many seconds
  sort: 'name', // 'name' | 'updated'
  siteIcons: false, // load favicons from each site (tells those sites you have an account)
  recoveryKeySaved: false, // ticked by the user: Sealbox can't know
  extensionInstalled: false, // ticked by the user: the extension doesn't run on Sealbox's own pages
  lastBackupAt: null,
  checklistHidden: false,
};

function read() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let prefs = read();
const listeners = new Set();

export function setPrefs(patch) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* storage blocked: keep for this session */ }
  listeners.forEach((l) => l());
}

export const getPrefs = () => prefs;

export function usePrefs() {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), getPrefs);
}
