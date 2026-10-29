import { setPrefs, usePrefs } from '../lib/prefs.js';

const BACKUP_STALE_DAYS = 90;

// The steps that keep an account recoverable and safe. Two are ticked by the user, since
// Sealbox can't see where the recovery key is kept or whether the extension is installed.
export function useChecklist(mfaEnabled) {
  const prefs = usePrefs();
  const backupFresh = prefs.lastBackupAt && Date.now() - prefs.lastBackupAt < BACKUP_STALE_DAYS * 86_400_000;
  const steps = [
    { key: 'rk', done: prefs.recoveryKeySaved, label: 'Recovery key disimpan', todo: 'Tandai recovery key sudah disimpan', tick: () => setPrefs({ recoveryKeySaved: true }) },
    { key: 'mfa', done: mfaEnabled === true, label: '2FA aktif', todo: 'Aktifkan 2FA', action: 'mfa' },
    { key: 'ext', done: prefs.extensionInstalled, label: 'Ekstensi terpasang', todo: 'Tandai ekstensi sudah dipasang', tick: () => setPrefs({ extensionInstalled: true }) },
    { key: 'backup', done: !!backupFresh, label: 'Backup terbaru', todo: prefs.lastBackupAt ? 'Backup lebih dari 90 hari lalu' : 'Buat backup pertama', action: 'backup' },
  ];
  return { steps, done: steps.filter((s) => s.done).length };
}

// Compact card for the sidebar; hidden once complete or dismissed.
export function ChecklistCard({ mfaEnabled, onAction }) {
  const prefs = usePrefs();
  const { steps, done } = useChecklist(mfaEnabled);
  if (prefs.checklistHidden || done === steps.length) return null;
  return (
    <div className="check-card">
      <b>Keamanan akun <span style={{ color: 'var(--brand)' }}>{done}/{steps.length}</span>
        <button className="link" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)', textDecoration: 'none' }} onClick={() => setPrefs({ checklistHidden: true })} title="Sembunyikan (tetap ada di Pengaturan)"><i className="ti ti-x" /></button>
      </b>
      <div className="prog" style={{ margin: '6px 0 8px' }}><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      {steps.map((s) => (
        <div key={s.key} className={`ck${s.done ? ' done' : ''}`}>
          <i className={`ti ti-${s.done ? 'circle-check-filled' : 'circle'}`} />
          {s.done ? s.label : <button className="link" style={{ fontSize: 12 }} onClick={() => (s.tick ? s.tick() : onAction(s.action))}>{s.todo}</button>}
        </div>
      ))}
    </div>
  );
}
