import { describe, it, expect, vi } from 'vitest';
import { encryptJSON } from '../src/crypto/aes.js';
import { generateVaultKey } from '../src/crypto/keys.js';
import { folderNames, isFolder } from '../src/lib/folders.js';
import { planImport } from '../src/lib/backup.js';

vi.mock('../src/lib/supabase.js', () => ({ supabase: {} }));
vi.mock('../src/lib/db.js', () => ({}));
const { decryptVault, decryptRecords } = await import('../src/lib/vaultData.js');

async function records(key, plains) {
  return Promise.all(plains.map(async (p) => ({ id: crypto.randomUUID(), updated_at: new Date().toISOString(), ...(await encryptJSON(p, key)) })));
}

describe('folder rows', () => {
  it('are split from the items', async () => {
    const key = await generateVaultKey();
    const rs = await records(key, [{ name: 'Gmail', folder: 'Kerja' }, { kind: 'folder', name: 'Kampus' }, { name: 'Bank' }]);
    const { items, folders } = await decryptVault(rs, key);
    expect(items.map((i) => i.name)).toEqual(['Bank', 'Gmail']);
    expect(folders).toEqual([expect.objectContaining({ name: 'Kampus' })]);
    expect(folders[0]).not.toHaveProperty('kind');
  });

  it('never reach the extension (decryptRecords returns items only)', async () => {
    const key = await generateVaultKey();
    const rs = await records(key, [{ kind: 'folder', name: 'Kampus' }, { name: 'Gmail', url: 'https://mail.google.com' }]);
    expect((await decryptRecords(rs, key)).map((i) => i.name)).toEqual(['Gmail']);
  });

  it('give folder names together with the items', () => {
    expect(folderNames([{ folder: 'Kerja' }, { folder: '' }, { folder: 'Belanja' }], [{ name: 'Kampus' }, { name: 'Kerja' }]))
      .toEqual(['Belanja', 'Kampus', 'Kerja']);
  });

  it('from another vault are skipped when the name already exists', () => {
    const current = [{ id: 'a', kind: 'folder', name: 'Kampus', updatedAt: 1 }];
    const incoming = [{ id: 'x', kind: 'folder', name: 'Kampus', updatedAt: 2 }, { id: 'y', kind: 'folder', name: 'Hobi', updatedAt: 2 }];
    const plan = planImport(incoming, false, current);
    expect(plan.changed.map((f) => f.name)).toEqual(['Hobi']);
    expect(plan.changed.every(isFolder)).toBe(true);
    expect(plan).toMatchObject({ added: 1, skipped: 1 });
  });
});
