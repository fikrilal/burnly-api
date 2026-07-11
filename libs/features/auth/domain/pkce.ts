/**
 * PKCE (RFC 7636) helpers — pure domain (no Nest/Redis).
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 7636 unreserved: ALPHA / DIGIT / "-" / "." / "_" / "~" */
const PKCE_UNRESERVED_RE = /^[A-Za-z0-9\-._~]+$/;

/** RFC 7636: code_verifier 43–128 chars from the unreserved set. */
export function isValidPkceVerifier(verifier: string): boolean {
  if (verifier.length < 43 || verifier.length > 128) return false;
  return PKCE_UNRESERVED_RE.test(verifier);
}

/** S256 code_challenge is base64url(SHA256(verifier)); typically 43 chars. */
export function isValidPkceChallenge(challenge: string): boolean {
  if (challenge.length < 43 || challenge.length > 128) return false;
  // Challenges are base64url output of SHA-256 (no '.' or '~' in practice),
  // but accept the same unreserved alphabet for symmetry.
  return PKCE_UNRESERVED_RE.test(challenge);
}

export function pkceS256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'utf8').digest('base64url');
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!isValidPkceVerifier(verifier) || !isValidPkceChallenge(challenge)) return false;
  const expected = pkceS256Challenge(verifier);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(challenge, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateDesktopHandoffCode(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDesktopHandoffCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}
