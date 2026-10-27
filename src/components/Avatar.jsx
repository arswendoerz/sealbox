function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function Avatar({ name = '?' }) {
  return <div className={`av c${hash(name) % 5}`}>{name.trim()[0] ?? '?'}</div>;
}
