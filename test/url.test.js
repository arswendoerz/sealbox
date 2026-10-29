import { describe, it, expect } from 'vitest';
import { parseUrl } from '../src/lib/url.js';

describe('parseUrl', () => {
  it.each([
    ['https://mail.google.com/x', 'mail.google.com'],
    ['github.com', 'github.com'],
    ['localhost:3000', 'localhost'],
  ])('%s -> %s', (url, host) => {
    expect(parseUrl(url).hostname).toBe(host);
  });

  it.each(['', undefined, 'javascript:alert(1)', 'data:text/html,x', 'http://'])('rejects %s', (url) => {
    expect(parseUrl(url)).toBeNull();
  });
});
