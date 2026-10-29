import { useTheme } from '../hooks/useTheme.js';

const OPTIONS = [
  ['system', 'device-desktop', 'Ikuti sistem'],
  ['light', 'sun', 'Terang'],
  ['dark', 'moon', 'Gelap'],
];

export function ThemeSwitch({ className = '' }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={`theme ${className}`} role="radiogroup" aria-label="Tema">
      {OPTIONS.map(([value, icon, label]) => (
        <button key={value} type="button" role="radio" aria-checked={theme === value} className={theme === value ? 'on' : ''} onClick={() => setTheme(value)} title={label}>
          <i className={`ti ti-${icon}`} />
        </button>
      ))}
    </div>
  );
}
