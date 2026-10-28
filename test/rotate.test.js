import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveAccountKeys } from '../src/crypto/kdf.js';
import { encryptJSON, decryptJSON } from '../src/crypto/aes.js';
import {
  generateVaultKey, wrapVaultKey, unwrapVaultKey, keyProof, generateRecoveryKey, recoveryWrappingKey,
} from '../src/crypto/keys.js';

// A small stand-in for the Supabase project: the tables rotate.js reads (paged like PostgREST,
// at most 1000 rows per request) and the two RPCs from migration 0004, with the same checks.
const server = vi.hoisted(() => ({ profile: null, items: [], versions: [], calls: [] }));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    from: (table) => ({
      select: () => ({
        order: (col) => ({
          range: async (from, to) => {
            const rows = { vault_items: server.items, vault_item_versions: server.versions }[table];
            const sorted = [...rows].sort((x, y) => (x[col] < y[col] ? -1 : 1));
            return { data: sorted.slice(from, Math.min(to + 1, from + 1000)), error: null };
          },
        }),
      }),
    }),
    rpc: async (name, args) => {
      server.calls.push(name);
      const p = server.profile;
      if (name === 'set_key_proof') {
        p.key_proof_hash ??= args.p_proof_hash;
        return { data: null, error: null };
      }
      if (name === 'rotate_vault_key') {
        if (!p.key_proof_hash || p.key_proof_hash !== sha256(args.p_proof)) {
          return { data: null, error: { message: 'key proof mismatch', hint: 'sealbox:bad_proof' } };
        }
        if (args.p_items.length !== server.items.length) {
          return { data: null, error: { message: 'items changed', hint: 'sealbox:items_changed' } };
        }
        p.key_version += 1;
        Object.assign(p, { wrapped_key: args.p_wrapped_key, recovery_wrapped_key: args.p_recovery_wrapped_key, key_proof_hash: args.p_new_proof_hash });
        for (const x of args.p_items) Object.assign(server.items.find((i) => i.id === x.id), { iv: x.iv, data: x.data });
        for (const x of args.p_versions) Object.assign(server.versions.find((v) => v.version_id === x.version_id), { iv: x.iv, data: x.data });
        return { data: p.key_version, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  },
}));
vi.mock('../src/lib/db.js', () => ({})); // IndexedDB isn't used by rotation and doesn't exist in Node

const { rotateVaultKey } = await import('../src/lib/rotate.js');

const ITER = 1_000;
let oldKey, masterKey, rk;

async function setup({ items = 3, versions = 2, legacy = false } = {}) {
  oldKey = await generateVaultKey();
  ({ masterKey } = await deriveAccountKeys('a@x.com', 'pw', ITER));
  rk = generateRecoveryKey();
  server.calls = [];
  server.profile = {
    key_version: 1,
    key_proof_hash: legacy ? null : sha256(await keyProof(oldKey)),
    wrapped_key: await wrapVaultKey(oldKey, masterKey),
    recovery_wrapped_key: await wrapVaultKey(oldKey, await recoveryWrappingKey(rk)),
  };
  server.items = await Promise.all(Array.from({ length: items }, async (_, n) => ({
    id: crypto.randomUUID(), ...(await encryptJSON({ name: `item ${n}` }, oldKey)),
  })));
  server.versions = await Promise.all(Array.from({ length: versions }, async (_, n) => ({
    version_id: n + 1, ...(await encryptJSON({ name: `old ${n}` }, oldKey)),
  })));
}

const rotate = async () => rotateVaultKey({
  oldKey, profile: { ...server.profile }, masterKey, recoveryWrapKey: await recoveryWrappingKey(rk),
});

describe('rotateVaultKey', () => {
  beforeEach(() => setup());

  it('re-encrypts every item and version with a new key', async () => {
    const before = server.items.map((i) => i.data);
    const { key, keyVersion } = await rotate();

    expect(keyVersion).toBe(2);
    expect(server.items.map((i) => i.data)).not.toEqual(expect.arrayContaining(before));
    for (const [n, i] of server.items.entries()) expect(await decryptJSON(i, key)).toEqual({ name: `item ${n}` });
    for (const [n, v] of server.versions.entries()) expect(await decryptJSON(v, key)).toEqual({ name: `old ${n}` });
  });

  it('leaves the old key unable to open anything', async () => {
    await rotate();
    for (const row of [...server.items, ...server.versions]) await expect(decryptJSON(row, oldKey)).rejects.toThrow();
  });

  it('wraps the new key for the master password and the recovery key', async () => {
    const { key } = await rotate();
    const sample = await encryptJSON('x', key);
    const byPassword = await unwrapVaultKey(server.profile.wrapped_key, masterKey);
    const byRecovery = await unwrapVaultKey(server.profile.recovery_wrapped_key, await recoveryWrappingKey(rk));
    expect(await decryptJSON(sample, byPassword)).toBe('x');
    expect(await decryptJSON(sample, byRecovery)).toBe('x');
  });

  it('stores the proof of the new key, so the next rotation is accepted', async () => {
    await rotate();
    oldKey = await unwrapVaultKey(server.profile.wrapped_key, masterKey, true);
    expect(server.profile.key_proof_hash).toBe(sha256(await keyProof(oldKey)));
    expect((await rotate()).keyVersion).toBe(3);
  });

  it('returns a key that cannot be exported', async () => {
    const { key } = await rotate();
    expect(key.extractable).toBe(false);
  });

  it('pages through large vaults (more than 1000 rows)', async () => {
    await setup({ items: 1205, versions: 0 });
    const { key } = await rotate();
    const readable = await Promise.all(server.items.map((i) => decryptJSON(i, key).then(() => true, () => false)));
    expect(readable.filter(Boolean)).toHaveLength(1205);
  });

  it('sends the key proof first for accounts from before migration 0004', async () => {
    await setup({ legacy: true });
    await rotate();
    expect(server.calls).toEqual(['set_key_proof', 'rotate_vault_key']);
  });

  it('keeps unreadable rows as they are instead of failing', async () => {
    server.items[0].data = server.items[1].data; // wrong iv/data pair: can't decrypt
    const broken = { ...server.items[0] };
    server.versions[0].data = server.versions[1].data;
    const { key } = await rotate();
    expect(server.items[0]).toEqual(broken);
    expect(await decryptJSON(server.items[1], key)).toEqual({ name: 'item 1' });
  });

  it('is refused without proof of the current key', async () => {
    server.profile.key_proof_hash = sha256('someone else');
    await expect(rotate()).rejects.toThrow(/bukti kunci tidak cocok/);
    expect(server.profile.key_version).toBe(1);
  });
});
