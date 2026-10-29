// Countdown ring for a TOTP code.
export function TotpRing({ remaining, period }) {
  const c = 2 * Math.PI * 15;
  return (
    <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle
        cx="18" cy="18" r="15" fill="none" stroke={remaining <= 5 ? 'var(--bad)' : 'var(--brand)'} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - remaining / period)} transform="rotate(-90 18 18)"
      />
    </svg>
  );
}
