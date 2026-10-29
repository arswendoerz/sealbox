import { describe, it, expect } from 'vitest';
import { encryptJSON } from '../src/crypto/aes.js';
import { generateVaultKey, wrapVaultKey, generateRecoveryKey, recoveryWrappingKey } from '../src/crypto/keys.js';
import { deriveAccountKeys } from '../src/crypto/kdf.js';
import { makeBackup, parseBackup, openBackup } from '../src/lib/backup.js';
import { typeOf, subtitle, cardBrand, last4, searchText } from '../src/lib/itemTypes.js';

describe('item types', () => {
  it('treat items without a type as logins', () => {
    expect(typeOf({ name: 'x' })).toBe('login');
    expect(typeOf({ type: 'card' })).toBe('card');
    expect(typeOf({ type: 'bogus' })).toBe('login');
  });

  it('describe each kind in lists', () => {
    expect(subtitle({ username: 'a', url: 'https://www.github.com/x' })).toBe('a · www.github.com');
    expect(subtitle({ type: 'card', cardNumber: '4111 1111 1111 4821' })).toBe('Kartu · •••• 4821');
    expect(subtitle({ type: 'note' })).toBe('Catatan aman');
    expect(subtitle({ type: 'identity', email: 'a@x.com' })).toBe('a@x.com');
  });

  it('recognise card brands and the last four digits', () => {
    expect(cardBrand('4111 1111 1111 1111')).toBe('visa');
    expect(cardBrand('5500 0000 0000 0004')).toBe('mastercard');
    expect(cardBrand('3782 822463 10005')).toBe('amex');
    expect(cardBrand('9999')).toBeNull();
    expect(last4('5500 0000 0000 0004')).toBe('0004');
  });

  it('search names, usernames, folders and identity fields', () => {
    expect(searchText({ name: 'KTP', fullName: 'Arswendo', folder: 'Pribadi' })).toContain('arswendo');
  });

  it('survive a backup round trip, unknown fields and types dropped', async () => {
    const key = await generateVaultKey();
    const { masterKey } = await deriveAccountKeys('a@x.com', 'pw', 100_000);
    const profile = { kdf_version: 1, kdf_iterations: 100_000, wrapped_key: await wrapVaultKey(key, masterKey), recovery_wrapped_key: await wrapVaultKey(key, await recoveryWrappingKey(generateRecoveryKey())) };
    const plains = [
      { type: 'card', name: 'BCA', cardNumber: '4111', cardCvv: '123', cardExpiry: '08/29', cardholder: 'A', evil: 1 },
      { name: 'Gmail', totp: 'JBSWY3DPEHPK3PXP', password: 'p' },
      { type: 'weird', name: 'X' },
    ];
    const records = await Promise.all(plains.map(async (p) => ({ id: crypto.randomUUID(), updated_at: new Date().toISOString(), ...(await encryptJSON(p, key)) })));
    const { items } = await openBackup(parseBackup(JSON.stringify(makeBackup('a@x.com', profile, records))), key);
    const [card, login, weird] = items;
    expect(card).toMatchObject({ type: 'card', cardNumber: '4111', cardCvv: '123', cardExpiry: '08/29', cardholder: 'A' });
    expect(card).not.toHaveProperty('evil');
    expect(login.totp).toBe('JBSWY3DPEHPK3PXP');
    expect(login).not.toHaveProperty('type');
    expect(weird).not.toHaveProperty('type');
  });
});
