import { useCallback, useEffect, useState } from 'react';
import { randomPassword, passphrase, strength, crackTime } from '../crypto/generator.js';
import { StrengthMeter } from './StrengthMeter.jsx';
import { checkRules, describeRules, generateWithRules } from '../lib/passwordRules.js';

// onUse: optional callback that receives the generated password.
// rules: optional parsed site rules (lib/passwordRules.js) that the result must satisfy.
export function PasswordGenerator({ onUse, onCopy, rules }) {
  const [mode, setMode] = useState(rules ? 'acak' : 'ingat');
  const [length, setLength] = useState(20);
  const [chars, setChars] = useState({ upper: true, digits: true, symbols: true });
  const [phrase, setPhrase] = useState({ words: 6, capitalize: true, number: true, separator: '-', lang: 'en' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const minLen = rules?.minLength ?? 8;
  const maxLen = rules?.maxLength ?? 64;
  const len = Math.min(Math.max(length, minLen), maxLen);

  const generate = useCallback(() => {
    setError('');
    try {
      if (mode === 'ingat') setResult(passphrase(phrase));
      else setResult(rules ? generateWithRules(rules, len) : randomPassword({ length: len, ...chars }));
    } catch (err) {
      setError(err.message);
      setResult(null);
    }
  }, [mode, len, chars, phrase, rules]);

  useEffect(generate, [generate]);
  if (error) return <p className="err">{error}</p>;
  if (!result) return null;
  const violations = checkRules(result.value, rules);

  return (
    <div>
      <div className="tabs">
        <button type="button" className={mode === 'acak' ? 'on' : ''} onClick={() => setMode('acak')}>Acak</button>
        <button type="button" className={mode === 'ingat' ? 'on' : ''} onClick={() => setMode('ingat')}>Mudah diingat</button>
      </div>
      <div className="out mono">
        <span>{result.value}</span>
        <button type="button" title="Buat ulang" onClick={generate}><i className="ti ti-refresh" /></button>
        {onCopy && <button type="button" title="Salin" onClick={() => onCopy(result.value)}><i className="ti ti-copy" /></button>}
      </div>

      {mode === 'acak' ? (
        <>
          <label className="f">Panjang: <b>{len}</b></label>
          {minLen < maxLen && <input type="range" min={minLen} max={maxLen} value={len} onChange={(e) => setLength(+e.target.value)} />}
          {rules ? (
            <div className="note ok"><i className="ti ti-list-check" />Mengikuti aturan situs: {describeRules(rules) || 'bebas'}</div>
          ) : (
            <div className="opt">
              {[['upper', 'A-Z'], ['digits', '0-9'], ['symbols', '!@#$']].map(([k, label]) => (
                <label key={k}><input type="checkbox" checked={chars[k]} onChange={(e) => setChars({ ...chars, [k]: e.target.checked })} />{label}</label>
              ))}
            </div>
          )}
          <p className="hint">Cocok untuk akun yang cukup disalin dari Sealbox. Tidak perlu dihafal.</p>
        </>
      ) : (
        <>
          <div className="note ok"><i className="ti ti-bulb" />{result.hint}</div>
          <label className="f">Jumlah kata: <b>{phrase.words}</b></label>
          <input type="range" min="3" max="7" value={phrase.words} onChange={(e) => setPhrase({ ...phrase, words: +e.target.value })} />
          <div className="opt">
            <label>Bahasa
              <select value={phrase.lang} onChange={(e) => setPhrase({ ...phrase, lang: e.target.value })}>
                <option value="en">Inggris (7.776 kata)</option><option value="id">Indonesia (248 kata)</option>
              </select>
            </label>
            <label><input type="checkbox" checked={phrase.capitalize} onChange={(e) => setPhrase({ ...phrase, capitalize: e.target.checked })} />Kapital di awal</label>
            <label><input type="checkbox" checked={phrase.number} onChange={(e) => setPhrase({ ...phrase, number: e.target.checked })} />Angka di akhir</label>
            <label>Pemisah
              <select value={phrase.separator} onChange={(e) => setPhrase({ ...phrase, separator: e.target.value })}>
                <option value="-">-</option><option value=".">.</option><option value="_">_</option><option value=" ">spasi</option>
              </select>
            </label>
          </div>
        </>
      )}

      {violations.length > 0 && (
        <div className="note warn"><i className="ti ti-alert-triangle" />Tidak sesuai aturan situs: {violations.join(', ')}. Pakai mode Acak.</div>
      )}
      <StrengthMeter bits={result.bits} />
      <p className="hint">{strength(result.bits).label}. Perkiraan waktu tebak offline: {crackTime(result.bits)}.</p>
      {onUse && <button type="button" className="btn pri full" disabled={violations.length > 0} onClick={() => onUse(result.value)}><i className="ti ti-check" /> Pakai password ini</button>}
    </div>
  );
}
