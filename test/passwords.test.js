import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseRules, checkRules, describeRules, generateWithRules, rulesForHost, knownRulesFor, DEFAULT_RULES, RULE_PRESETS,
} from '../src/lib/passwordRules.js';
import { randomPassword, passphrase, estimateBits, strength, WORDLISTS } from '../src/crypto/generator.js';
import { randomInt } from '../src/crypto/encoding.js';
import { analyze, pwnedCount } from '../src/lib/health.js';

describe('password rules', () => {
  it('parses Apple passwordrules syntax', () => {
    const r = parseRules('minlength: 8; maxlength: 12; required: lower, upper; required: digit; allowed: [-!]; max-consecutive: 2;');
    expect(r).toMatchObject({ minLength: 8, maxLength: 12, maxConsecutive: 2 });
    expect(r.required).toHaveLength(2);
    expect(r.pool).toContain('!');
    expect(r.pool).not.toContain('#');
  });

  it('handles ";" and "]" inside a character set', () => {
    const r = parseRules('required: [;]]; minlength: 4;');
    expect(r.required[0].chars).toBe(';]');
    expect(r.minLength).toBe(4);
  });

  it('returns null for empty rules', () => {
    expect(parseRules('')).toBeNull();
    expect(parseRules('   ')).toBeNull();
  });

  it('reports every broken rule', () => {
    const r = parseRules('minlength: 6; maxlength: 6; required: digit;');
    expect(checkRules('123456', r)).toEqual([]);
    expect(checkRules('12a', r)).toEqual(expect.arrayContaining([expect.stringMatching(/Minimal 6/), expect.stringMatching(/tidak diizinkan/)]));
    expect(checkRules('1111112', parseRules('max-consecutive: 3;'))).toEqual([expect.stringMatching(/berturut/)]);
  });

  it('describes rules in Indonesian', () => {
    expect(describeRules(parseRules('minlength: 6; maxlength: 6; required: digit;'))).toBe('6 karakter · wajib: angka');
  });

  it.each([DEFAULT_RULES, ...RULE_PRESETS.map((p) => p.rules), 'minlength: 10; required: [ab]; allowed: digit; max-consecutive: 1;'])(
    'generates passwords that satisfy %s',
    (text) => {
      const rules = parseRules(text);
      for (let n = 0; n < 200; n++) expect(checkRules(generateWithRules(rules).value, rules)).toEqual([]);
    },
  );

  it('gives up on rules that cannot be met', () => {
    expect(() => generateWithRules(parseRules('minlength: 5; allowed: [a]; max-consecutive: 1;'))).toThrow();
  });

  it('finds rules for a host or its parent domain', () => {
    const db = { 'example.com': 'minlength: 8;' };
    expect(rulesForHost('www.login.example.com', db)).toEqual({ domain: 'example.com', rules: 'minlength: 8;' });
    expect(rulesForHost('example.org', db)).toBeNull();
  });

  it("knows sites from Apple's database", async () => {
    const known = await knownRulesFor('https://www.example.com');
    expect(known).toBeNull();
    const db = (await import('../src/data/apple-password-rules.json')).default;
    const [domain] = Object.keys(db);
    expect((await knownRulesFor(`https://${domain}/login`)).domain).toBe(domain);
    expect(await knownRulesFor('not a url')).toBeNull();
  });
});

describe('generator', () => {
  it('builds random passwords from the chosen classes', () => {
    const { value, bits } = randomPassword({ length: 32, upper: false, digits: false, symbols: false });
    expect(value).toMatch(/^[a-z]{32}$/);
    expect(bits).toBeGreaterThan(140);
  });

  it('builds passphrases from the EFF list', () => {
    expect(WORDLISTS.en).toHaveLength(7776);
    expect(new Set(WORDLISTS.en).size).toBe(7776);
    const p = passphrase({ words: 5, number: false, capitalize: false, separator: ' ' });
    expect(p.value.split(' ')).toHaveLength(5);
    expect(p.value.split(' ').every((w) => WORDLISTS.en.includes(w))).toBe(true);
    expect(p.bits).toBeCloseTo(5 * Math.log2(7776));
  });

  it('draws random integers without bias', () => {
    const counts = [0, 0, 0];
    for (let n = 0; n < 30_000; n++) counts[randomInt(3)]++;
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(600);
  });

  it('rates strength', () => {
    expect(strength(estimateBits('abc')).level).toBe(1);
    expect(strength(estimateBits('Tr0ub4dor&3-correct-horse')).level).toBe(4);
  });
});

describe('health', () => {
  it('flags weak, reused and old passwords', () => {
    const now = Date.UTC(2026, 0, 1);
    const day = 86_400_000;
    const items = [
      { id: 1, password: 'abc', updatedAt: now },
      { id: 2, password: 'Same-Strong-Password-42!', passwordChangedAt: now - 400 * day },
      { id: 3, password: 'Same-Strong-Password-42!', updatedAt: now },
      { id: 4, password: '' },
    ];
    const [weak, old, reused] = analyze(items, now);
    expect(analyze(items, now)).toHaveLength(3);
    expect(weak).toMatchObject({ weak: true, reusedWith: 0 });
    expect(old).toMatchObject({ weak: false, reusedWith: 1, ageDays: 400 });
    expect(reused.reusedWith).toBe(1);
  });
});

describe('Have I Been Pwned check', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends only a 5-character hash prefix, with padding, and reads the count', async () => {
    // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
    const fetch = vi.fn(async () => new Response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824\r\nAAAA:0\r\n'));
    vi.stubGlobal('fetch', fetch);
    expect(await pwnedCount('password')).toBe(9545824);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(init.headers['Add-Padding']).toBe('true');
  });

  it('returns 0 when the password is not listed and fails loudly on errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ABC:1\r\n')));
    expect(await pwnedCount('password')).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(pwnedCount('password')).rejects.toThrow(/503/);
  });
});
