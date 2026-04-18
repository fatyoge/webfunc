import { describe, it, expect, vi } from 'vitest';
import { CookieStore } from '../../src/core/cookie-store';

describe('CookieStore', () => {
  it('returns formatted cookie string for a URL', async () => {
    const mockCookies = [
      { name: 'session', value: 'abc123', domain: '.example.com', path: '/' },
      { name: 'token', value: 'xyz789', domain: '.example.com', path: '/' },
    ];

    const mockContext = {
      cookies: vi.fn().mockResolvedValue(mockCookies),
    };

    const store = new CookieStore(mockContext as any);
    const cookieString = await store.getCookiesForUrl('https://example.com/api');

    expect(mockContext.cookies).toHaveBeenCalledWith('https://example.com/api');
    expect(cookieString).toBe('session=abc123; token=xyz789');
  });

  it('returns empty string when no cookies', async () => {
    const mockContext = {
      cookies: vi.fn().mockResolvedValue([]),
    };

    const store = new CookieStore(mockContext as any);
    const result = await store.getCookiesForUrl('https://example.com/api');
    expect(result).toBe('');
  });
});
