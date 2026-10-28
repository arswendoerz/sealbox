import { describe, it, expect } from 'vitest';
import { siteOf, itemMatches } from '../extension/src/site.js';
import { decide, newItem } from '../extension/src/saveLogin.js';

describe('siteOf', () => {
  it.each([
    ['https://accounts.google.com/signin', 'google.com', true],
    ['https://www.bank.co.id/login', 'bank.co.id', true],
    ['http://example.com', 'example.com', false],
    ['example.com/login', 'example.com', true], // item URLs typed without a scheme
    ['localhost:3000', 'localhost', true],
    ['http://localhost:5173', 'localhost', true],
    ['http://192.168.1.1/admin', '192.168.1.1', false],
  ])('%s -> %s', (url, site, secure) => {
    expect(siteOf(url)).toMatchObject({ site, secure });
  });

  it('keeps private suffixes apart (github.io, pages.dev)', () => {
    expect(siteOf('https://alice.github.io').site).toBe('alice.github.io');
    expect(siteOf('https://bob.github.io').site).not.toBe(siteOf('https://alice.github.io').site);
    expect(siteOf('https://a.pages.dev').site).not.toBe(siteOf('https://b.pages.dev').site);
  });

  it.each(['', null, 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'http://'])('rejects %s', (url) => {
    expect(siteOf(url)).toBeNull();
  });
});

describe('itemMatches', () => {
  const page = (url) => siteOf(url);

  it('matches the same site across subdomains', () => {
    expect(itemMatches('https://google.com', page('https://accounts.google.com/x'))).toBe(true);
  });

  it('never matches a lookalike or another site', () => {
    expect(itemMatches('https://google.com', page('https://google.com.evil.io'))).toBe(false);
    expect(itemMatches('https://google.com', page('https://googie.com'))).toBe(false);
  });

  it('never offers an https login on a plain-http page', () => {
    expect(itemMatches('https://example.com', page('http://example.com'))).toBe(false);
    expect(itemMatches('http://example.com', page('https://example.com'))).toBe(true);
  });

  it('with exactHost, matches only the same host and port', () => {
    const url = 'https://login.shared.co.id';
    expect(itemMatches(url, page('https://login.shared.co.id/x'), true)).toBe(true);
    expect(itemMatches(url, page('https://www.login.shared.co.id'), true)).toBe(true);
    expect(itemMatches(url, page('https://evil.shared.co.id'), true)).toBe(false);
    expect(itemMatches(url, page('https://shared.co.id'), true)).toBe(false);
    expect(itemMatches(url, page('https://login.shared.co.id:8443'), true)).toBe(false);
    expect(itemMatches(url, page('https://evil.shared.co.id'))).toBe(true); // default: whole site
    expect(itemMatches('localhost:3000', page('http://localhost:3000'), true)).toBe(true);
    expect(itemMatches('localhost:3000', page('http://localhost:5173'), true)).toBe(false);
  });

  it('ignores items without a usable URL', () => {
    expect(itemMatches('', page('https://example.com'))).toBe(false);
    expect(itemMatches('javascript:x', page('https://example.com'))).toBe(false);
  });
});

describe('decide (offer to save a login)', () => {
  const url = 'https://app.example.com/login';
  const saved = { id: '1', url: 'https://example.com', username: 'Alice@x.com', password: 'old' };

  it('offers to save a new login', () => {
    expect(decide({ url, username: 'bob', password: 'pw' }, [saved])).toEqual({ kind: 'save' });
  });

  it('offers to update when the password changed (username case-insensitive)', () => {
    expect(decide({ url, username: ' alice@x.com', password: 'new' }, [saved])).toEqual({ kind: 'update', item: saved });
  });

  it('stays quiet when the login is already saved', () => {
    expect(decide({ url, username: 'alice@x.com', password: 'old' }, [saved])).toBeNull();
  });

  it('without a username, saves only when the site has no login yet', () => {
    expect(decide({ url, username: '', password: 'new' }, [saved])).toBeNull();
    expect(decide({ url, username: '', password: 'new' }, [])).toEqual({ kind: 'save' });
  });

  it('ignores other sites, insecure pages for https items, and empty passwords', () => {
    expect(decide({ url: 'https://other.com', username: 'alice@x.com', password: 'new' }, [saved])).toEqual({ kind: 'save' });
    expect(decide({ url, username: 'alice@x.com', password: '' }, [saved])).toBeNull();
    expect(decide({ url: 'javascript:x', username: 'a', password: 'b' }, [])).toBeNull();
  });

  it('treats an exactHost login on another subdomain as a different login', () => {
    const exact = { ...saved, exactHost: true, url: 'https://app.example.com' };
    expect(decide({ url: 'https://app.example.com/login', username: 'alice@x.com', password: 'new' }, [exact])).toEqual({ kind: 'update', item: exact });
    expect(decide({ url: 'https://other.example.com/login', username: 'alice@x.com', password: 'new' }, [exact])).toEqual({ kind: 'save' });
  });

  it('builds a new item from the page origin', () => {
    expect(newItem({ url: 'https://www.example.com/login?next=/', username: 'a', password: 'b' }, 5)).toMatchObject({
      name: 'example.com', url: 'https://www.example.com', username: 'a', password: 'b', passwordChangedAt: 5,
    });
  });
});
