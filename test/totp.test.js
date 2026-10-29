import { describe, it, expect } from 'vitest';
import { totpCode, parseTotp, base32Decode } from '../src/lib/totp.js';

// RFC 6238 appendix B: ASCII "12345678901234567890" for SHA-1, 8 digits.
const SECRET_SHA1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches the RFC 6238 vector at %s', async (t, code) => {
    const uri = `otpauth://totp/x?secret=${SECRET_SHA1}&digits=8`;
    expect((await totpCode(uri, t * 1000)).code).toBe(code);
  });

  it('reads a bare secret with spaces as 6 digits / 30 s', async () => {
    const r = await totpCode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq', 59_000);
    expect(r).toEqual({ code: '287082', remaining: 1, period: 30 });
  });

  it('parses otpauth URIs from QR codes', () => {
    expect(parseTotp('otpauth://totp/GitHub:arswendo?secret=JBSWY3DPEHPK3PXP&issuer=GitHub')).toMatchObject({
      secret: 'JBSWY3DPEHPK3PXP', digits: 6, period: 30, algorithm: 'SHA1', issuer: 'GitHub', account: 'arswendo',
    });
  });

  it.each(['', 'not base32!', 'otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP', 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&digits=4'])('rejects %s', (bad) => {
    expect(() => parseTotp(bad)).toThrow();
  });

  it('decodes base32', () => {
    expect([...base32Decode('MZXW6===')]).toEqual([...new TextEncoder().encode('foo')]);
  });
});
