import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { deriveAccountKeys } from '../src/crypto/kdf.js';
import { encryptJSON, decryptJSON } from '../src/crypto/aes.js';
import {
  generateVaultKey, wrapVaultKey, unwrapVaultKey, nonExtractable, keyProof, sha256Hex,
  generateRecoveryKey, normalizeRecoveryKey, recoveryWrappingKey,
} from '../src/crypto/keys.js';
import { fromBase64 } from '../src/crypto/encoding.js';

const ITER = 1_000; // the real 600k only slows the tests down; the maths is the same

describe('account keys', () => {
  it('are deterministic for the same email and password', async () => {
    const a = await deriveAccountKeys('User@Example.com ', 'hunter2', ITER);
    const b = await deriveAccountKeys('user@example.com', 'hunter2', ITER);
    expect(a.authHash).toBe(b.authHash);
  });

  it('change with the password or the email', async () => {
    const base = await deriveAccountKeys('a@x.com', 'pw', ITER);
    expect((await deriveAccountKeys('a@x.com', 'pw2', ITER)).authHash).not.toBe(base.authHash);
    expect((await deriveAccountKeys('b@x.com', 'pw', ITER)).authHash).not.toBe(base.authHash);
  });

  it('keep the master key inside the browser', async () => {
    const { masterKey, authHash } = await deriveAccountKeys('a@x.com', 'pw', ITER);
    expect(masterKey.extractable).toBe(false);
    expect(fromBase64(authHash)).toHaveLength(32);
  });
});

describe('vault key', () => {
  it('round-trips items with AES-GCM', async () => {
    const key = await generateVaultKey();
    const enc = await encryptJSON({ name: 'Gmail', password: 'p1' }, key);
    expect(enc.data).not.toContain('Gmail');
    expect(await decryptJSON(enc, key)).toEqual({ name: 'Gmail', password: 'p1' });
  });

  it('rejects tampered ciphertext and the wrong key', async () => {
    const key = await generateVaultKey();
    const enc = await encryptJSON({ a: 1 }, key);
    const bytes = fromBase64(enc.data);
    bytes[0] ^= 1;
    const tampered = { iv: enc.iv, data: btoa(String.fromCharCode(...bytes)) };
    await expect(decryptJSON(tampered, key)).rejects.toThrow();
    await expect(decryptJSON(enc, await generateVaultKey())).rejects.toThrow();
  });

  it('unwraps with the master password and with the recovery key', async () => {
    const key = await generateVaultKey();
    const { masterKey } = await deriveAccountKeys('a@x.com', 'pw', ITER);
    const rk = generateRecoveryKey();
    const wrapped = await wrapVaultKey(key, masterKey);
    const recoveryWrapped = await wrapVaultKey(key, await recoveryWrappingKey(rk));
    const enc = await encryptJSON('secret', key);

    expect(await decryptJSON(enc, await unwrapVaultKey(wrapped, masterKey))).toBe('secret');
    // The recovery key may be typed in lower case, with spaces instead of dashes.
    const typed = rk.toLowerCase().replaceAll('-', ' ');
    expect(await decryptJSON(enc, await unwrapVaultKey(recoveryWrapped, await recoveryWrappingKey(typed)))).toBe('secret');

    const { masterKey: wrong } = await deriveAccountKeys('a@x.com', 'not-pw', ITER);
    await expect(unwrapVaultKey(wrapped, wrong)).rejects.toThrow();
  });

  it('is non-extractable after unlock unless asked otherwise', async () => {
    const key = await generateVaultKey();
    const { masterKey } = await deriveAccountKeys('a@x.com', 'pw', ITER);
    const wrapped = await wrapVaultKey(key, masterKey);
    expect((await unwrapVaultKey(wrapped, masterKey)).extractable).toBe(false);
    expect((await unwrapVaultKey(wrapped, masterKey, true)).extractable).toBe(true);

    const locked = await nonExtractable(key);
    expect(locked.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', locked)).rejects.toThrow();
    expect(await decryptJSON(await encryptJSON(1, key), locked)).toBe(1);
  });
});

describe('recovery key', () => {
  it('has 160 bits in 8 groups of an unambiguous alphabet', () => {
    const rk = generateRecoveryKey();
    expect(rk).toMatch(/^([A-HJ-NP-Z2-9]{4}-){7}[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeRecoveryKey(rk)).toHaveLength(32);
    expect(generateRecoveryKey()).not.toBe(rk);
  });
});

describe('key proof', () => {
  it('is stable per key and differs between keys', async () => {
    const key = await generateVaultKey();
    expect(await keyProof(key)).toBe(await keyProof(key));
    expect(await keyProof(await generateVaultKey())).not.toBe(await keyProof(key));
  });

  it('does not reveal the key', async () => {
    const key = await generateVaultKey();
    const raw = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('raw', key))));
    expect(await keyProof(key)).not.toBe(raw);
  });

  it('hashes the way the server does: encode(digest(proof, sha256), hex)', async () => {
    const proof = await keyProof(await generateVaultKey());
    expect(await sha256Hex(proof)).toBe(createHash('sha256').update(proof, 'utf8').digest('hex'));
  });
});
