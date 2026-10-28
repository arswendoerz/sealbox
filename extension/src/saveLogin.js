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
  // Without a username we can't tell which login changed, so never overwrite one: save only when
  // the site has no login yet (the user can still edit the right item by hand).
  return forSite.length === 0 ? { kind: 'save' } : null;
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
