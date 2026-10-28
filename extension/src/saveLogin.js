import { siteOf, itemMatches } from './site.js';

// What to offer for a login the user just submitted ({ url, username, password }), given the
// decrypted vault items: { kind: 'save' } | { kind: 'update', item } | null (nothing to do).
export function decide(captured, items) {
  const page = siteOf(captured.url);
  if (!page || !captured.password) return null;
  const forSite = items.filter((i) => itemMatches(i.url, page));
  const user = captured.username.trim().toLowerCase();
  const sameUser = user ? forSite.filter((i) => (i.username ?? '').trim().toLowerCase() === user) : forSite;
  if (sameUser.some((i) => i.password === captured.password)) return null; // already saved
  if (user) return sameUser.length ? { kind: 'update', item: sameUser[0] } : { kind: 'save' };
  // No username (e.g. a change-password form): only safe when the site has at most one login.
  if (forSite.length === 0) return { kind: 'save' };
  return forSite.length === 1 ? { kind: 'update', item: forSite[0] } : null;
}

export function newItem({ url, username, password }, now = Date.now()) {
  const u = new URL(url);
  return {
    id: crypto.randomUUID(),
    name: u.hostname.replace(/^www\./, ''),
    url: u.origin,
    username,
    password,
    folder: '',
    notes: '',
    favorite: false,
    passwordChangedAt: now,
  };
}
