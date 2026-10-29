import { describe, it, expect, beforeAll } from 'vitest';
import { deriveAccountKeys } from '../src/crypto/kdf.js';
import { encryptJSON } from '../src/crypto/aes.js';
import { generateVaultKey, wrapVaultKey, generateRecoveryKey, recoveryWrappingKey } from '../src/crypto/keys.js';
import { makeBackup, parseBackup, openBackup, planImport } from '../src/lib/backup.js';

const ITERATIONS = 100_000; // the lowest count a backup may declare

async function account(email, password, plain = [{ name: 'Gmail', password: 'p1' }, { name: 'GitHub', password: 'p2' }]) {
  const key = await generateVaultKey();
  const rk = generateRecoveryKey();
  const { masterKey } = await deriveAccountKeys(email, password, ITERATIONS);
  const profile = {
    kdf_version: 1,
    kdf_iterations: ITERATIONS,
    wrapped_key: await wrapVaultKey(key, masterKey),
    recovery_wrapped_key: await wrapVaultKey(key, await recoveryWrappingKey(rk)),
  };
  const records = await Promise.all(plain.map(async (p, i) => ({
    id: crypto.randomUUID(),
    updated_at: new Date(Date.now() - i * 1000).toISOString(),
    ...(await encryptJSON(p, key)),
  })));
  return { email, key, rk, profile, records };
}

const fileOf = (acc) => JSON.stringify(makeBackup(acc.email, acc.profile, acc.records));
const parseError = (text) => {
  try {
    parseBackup(text);
  } catch (e) {
    return e;
  }
  return null;
};

let a, b, file, backup;
beforeAll(async () => {
  [a, b] = await Promise.all([account('a@x.com', 'pw-a'), account('b@x.com', 'pw-b')]);
  file = fileOf(a);
  backup = parseBackup(file);
});

describe('backup file', () => {
  it('holds no plaintext', () => {
    expect(file).not.toContain('"password"');
    expect(file).not.toContain('Gmail');
    expect(file).not.toContain('GitHub');
  });

  it('opens directly with the vault key it was made with', async () => {
    const r = await openBackup(backup, a.key);
    expect(r.sameVault).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items).toContainEqual(expect.objectContaining({ name: 'Gmail', password: 'p1' }));
    expect(r.items.every((i) => Number.isFinite(i.updatedAt))).toBe(true);
  });

  it('from another vault asks for a secret', async () => {
    await expect(openBackup(backup, b.key)).rejects.toMatchObject({ code: 'locked' });
  });

  it('from another vault opens with its master password', async () => {
    const r = await openBackup(backup, b.key, 'pw-a');
    expect(r.sameVault).toBe(false);
    expect(r.items).toHaveLength(2);
  });

  it('from another vault opens with its recovery key, loosely typed', async () => {
    const r = await openBackup(backup, b.key, a.rk.toLowerCase().replaceAll('-', ' '));
    expect(r.items).toHaveLength(2);
  });

  it('rejects a wrong secret with a clear message', async () => {
    const err = await openBackup(backup, b.key, 'wrong').catch((e) => e);
    expect(err.code).toBeUndefined();
    expect(err.message).toMatch(/tidak cocok/);
  });

  it('with no items opens to nothing', async () => {
    const empty = parseBackup(JSON.stringify(makeBackup('a@x.com', a.profile, [])));
    expect((await openBackup(empty, b.key)).items).toEqual([]);
  });
});

describe('parseBackup', () => {
  it.each([
    ['garbage', 'not json'],
    ['another format', '{"format":"x"}'],
  ])('rejects %s', (_, text) => {
    expect(parseError(text)).toBeInstanceOf(Error);
  });

  it('rejects a future version', () => {
    expect(parseError(JSON.stringify({ ...JSON.parse(file), version: 2 }))?.message).toMatch(/Versi/);
  });

  it.each([2_000_000_000, 10, 1.5, '600000'])('rejects iteration count %s', (iterations) => {
    const crafted = JSON.parse(file);
    crafted.kdf.iterations = iterations;
    expect(parseError(JSON.stringify(crafted))).toBeInstanceOf(Error);
  });
});

describe('importing untrusted items', () => {
  it('does not decrypt a tampered item', async () => {
    const tampered = JSON.parse(file);
    tampered.items[0].data = tampered.items[0].data.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
    await expect(openBackup(parseBackup(JSON.stringify(tampered)), a.key)).rejects.toMatchObject({ code: 'locked' });
  });

  it('keeps only known fields with the right types', async () => {
    const evil = await account('e@x.com', 'pw-e', [{ name: 42, password: { x: 1 }, favorite: 'yes', extra: 1 }]);
    const [item] = (await openBackup(parseBackup(fileOf(evil)), evil.key)).items;
    expect(item).toMatchObject({ name: 'Tanpa nama', password: '', favorite: false, exactHost: false });
    expect(item).not.toHaveProperty('extra');
  });

  it('keeps folder rows as folders, and refuses one without a name', async () => {
    const acc = await account('h@x.com', 'pw-h', [{ kind: 'folder', name: '  Kampus  ', extra: 1 }]);
    const [folder] = (await openBackup(parseBackup(fileOf(acc)), acc.key)).items;
    expect(folder).toEqual({ id: acc.records[0].id, kind: 'folder', name: 'Kampus', updatedAt: expect.any(Number) });
    const bad = await account('i@x.com', 'pw-i', [{ kind: 'folder', name: '   ' }]);
    await expect(openBackup(parseBackup(fileOf(bad)), bad.key)).rejects.toMatchObject({ code: 'locked' });
  });

  it('refuses item ids that are not UUIDs', async () => {
    const bad = await account('f@x.com', 'pw-f', [{ name: 'x' }]);
    bad.records[0].id = 'not-a-uuid';
    await expect(openBackup(parseBackup(fileOf(bad)), bad.key)).rejects.toMatchObject({ code: 'locked' });
  });
});

describe('planImport', () => {
  const item = (id, updatedAt, name = id) => ({ id, updatedAt, name });
  const current = [item('a', 100), item('b', 100)];
  const ids = (plan) => plan.changed.map((i) => i.id);

  it('restores missing and older items of the same vault, keeping their ids', () => {
    const plan = planImport([item('a', 50), item('b', 200), item('c', 10)], true, current);
    expect(ids(plan)).toEqual(['b', 'c']);
    expect(plan).toMatchObject({ added: 1, updated: 1, skipped: 1, olderKey: false });
  });

  it('adds every item of another vault under a new id', () => {
    const plan = planImport([item('x', 1), item('y', 1)], false, current);
    expect(plan).toMatchObject({ added: 2, updated: 0, skipped: 0, olderKey: false });
    expect(ids(plan)).not.toContain('x');
  });

  it('for this vault from before its key was replaced, adds only missing items and overwrites nothing', () => {
    // Newer timestamps in the file must not replace what is in the vault now.
    const plan = planImport([item('a', 999, 'changed'), item('b', 999), item('gone', 1)], false, current);
    expect(plan).toMatchObject({ added: 1, updated: 0, skipped: 2, olderKey: true });
    expect(plan.changed).toEqual([expect.objectContaining({ name: 'gone' })]);
    expect(ids(plan)).not.toContain('gone');
  });

  it('keeps exactHost from the file', async () => {
    const acc = await account('g@x.com', 'pw-g', [{ name: 'x', exactHost: true }]);
    const [restored] = (await openBackup(parseBackup(fileOf(acc)), acc.key)).items;
    expect(restored.exactHost).toBe(true);
  });
});
