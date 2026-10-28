import { getDomain } from 'tldts';

// Which "site" a URL belongs to, by registrable domain (public suffix list, incl. private suffixes
// such as github.io, so foo.github.io and bar.github.io stay apart). IPs and localhost use the host.
export function siteOf(url) {
  if (!url) return null;
  let u;
  try {
    // "localhost:3000" has no scheme even though it contains a colon; "javascript:..." then fails to parse.
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '');
  return {
    host,
    port: u.port, // '' for the scheme's default port
    site: getDomain(u.hostname, { allowPrivateDomains: true }) ?? host,
    secure: u.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname),
  };
}

// An item may be offered on a page when both are on the same site, and an https item is never
// offered on a plain-http page. Items marked `exactHost` also need the same host and port
// (www. aside), e.g. for a shared domain where other subdomains belong to someone else.
export function itemMatches(itemUrl, page, exactHost = false) {
  const item = siteOf(itemUrl);
  if (!item || !page || item.site !== page.site || (!page.secure && item.secure)) return false;
  return !exactHost || (item.host === page.host && item.port === page.port);
}
