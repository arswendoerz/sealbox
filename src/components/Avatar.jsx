import { useState } from 'react';
import { usePrefs } from '../lib/prefs.js';
import { parseUrl } from '../lib/url.js';
import { TYPES, typeOf } from '../lib/itemTypes.js';

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// First letter on a colour from the name. With "Ikon situs" on, a login shows its site's
// favicon instead, fetched straight from that site (never a third-party icon service).
export function Avatar({ name = '?', url, item, small }) {
  const { siteIcons } = usePrefs();
  const [failed, setFailed] = useState(null); // host whose icon failed
  const kind = item ? typeOf(item) : 'login';
  const host = siteIcons && kind === 'login' ? parseUrl(url ?? item?.url)?.hostname : null;
  const label = item?.name ?? name;
  const cls = `av c${hash(label) % 5}${small ? ' sm' : ''}`;

  if (kind !== 'login') return <div className={cls}><i className={`ti ti-${TYPES[kind].icon}`} /></div>;
  if (host && failed !== host) {
    return (
      <div className={`${cls} fav`}>
        <img src={`https://${host}/favicon.ico`} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(host)} />
      </div>
    );
  }
  return <div className={cls}>{label.trim()[0] ?? '?'}</div>;
}
