// An item's URL as a URL object, or null. Only http(s), so a stored "javascript:" URL is never
// rendered as a link. "localhost:3000" has no scheme even though it contains a colon.
export function parseUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
    return ['http:', 'https:'].includes(u.protocol) ? u : null;
  } catch {
    return null;
  }
}
