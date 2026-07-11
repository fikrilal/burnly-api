import {
  isAllowedDesktopRedirectUri,
  parseDesktopRedirectUriAllowlist,
} from './desktop-redirect-uri';

describe('desktop-redirect-uri', () => {
  it('defaults allowlist to burnly custom scheme', () => {
    expect(parseDesktopRedirectUriAllowlist(undefined)).toEqual(['burnly://auth/callback']);
    expect(parseDesktopRedirectUriAllowlist('')).toEqual(['burnly://auth/callback']);
  });

  it('parses comma-separated allowlist', () => {
    expect(
      parseDesktopRedirectUriAllowlist('burnly://auth/callback, http://127.0.0.1:39201/callback '),
    ).toEqual(['burnly://auth/callback', 'http://127.0.0.1:39201/callback']);
  });

  it('exact-matches only', () => {
    const allow = ['burnly://auth/callback'];
    expect(isAllowedDesktopRedirectUri('burnly://auth/callback', allow)).toBe(true);
    expect(isAllowedDesktopRedirectUri('burnly://auth/callback/', allow)).toBe(false);
    expect(isAllowedDesktopRedirectUri('https://evil.example/cb', allow)).toBe(false);
  });
});
