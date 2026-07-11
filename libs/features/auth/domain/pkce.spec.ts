import {
  generateDesktopHandoffCode,
  hashDesktopHandoffCode,
  isValidPkceChallenge,
  isValidPkceVerifier,
  pkceS256Challenge,
  verifyPkceS256,
} from './pkce';

describe('pkce', () => {
  it('round-trips S256 challenge verification', () => {
    const verifier = 'a'.repeat(43);
    const challenge = pkceS256Challenge(verifier);
    expect(isValidPkceVerifier(verifier)).toBe(true);
    expect(isValidPkceChallenge(challenge)).toBe(true);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256('b'.repeat(43), challenge)).toBe(false);
  });

  it('rejects short verifiers', () => {
    expect(isValidPkceVerifier('short')).toBe(false);
    expect(verifyPkceS256('short', pkceS256Challenge('a'.repeat(43)))).toBe(false);
  });

  it('accepts RFC 7636 unreserved characters in verifier', () => {
    const verifier = `${'a'.repeat(40)}.~_`;
    expect(verifier.length).toBe(43);
    expect(isValidPkceVerifier(verifier)).toBe(true);
    const challenge = pkceS256Challenge(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it('generates unique handoff codes', () => {
    const a = generateDesktopHandoffCode();
    const b = generateDesktopHandoffCode();
    expect(a).not.toEqual(b);
    expect(hashDesktopHandoffCode(a)).not.toEqual(hashDesktopHandoffCode(b));
    expect(hashDesktopHandoffCode(a)).toEqual(hashDesktopHandoffCode(a));
  });
});
