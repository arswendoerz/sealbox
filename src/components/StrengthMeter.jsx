import { estimateBits, strength } from '../crypto/generator.js';

export function StrengthMeter({ password, bits }) {
  const b = bits ?? estimateBits(password);
  if (!password && bits == null) return null;
  const s = strength(b);
  return (
    <>
      <div className="meter"><i className={`lv${s.level}`} style={{ width: `${Math.min(100, (b / 90) * 100)}%` }} /></div>
      <p className="hint">{s.label} · sekitar {Math.round(b)} bit</p>
    </>
  );
}
