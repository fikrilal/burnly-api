import type { AuthRepository } from './ports/auth.repository';
import type { DesktopHandoffStore } from './ports/desktop-handoff.store';
import type { DesktopHandoffRateLimiter } from './ports/desktop-handoff-rate-limiter';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import { AuthDesktopHandoffService } from './auth-desktop-handoff.service';
import { AuthSessionLifecycleService } from './auth-session-lifecycle.service';
import { AuthErrorCode } from './auth.error-codes';
import { ErrorCode } from '../../../shared/error-codes';
import { pkceS256Challenge } from '../domain/pkce';
import type { AuthConfig } from './auth.config';
import type { Clock } from './time';
import type { AuthUserRecord } from './auth.types';
import { normalizeEmail } from '../domain/email';

function unimplemented(): never {
  throw new Error('Not implemented');
}

function makeUser(partial?: Partial<AuthUserRecord>): AuthUserRecord {
  return {
    id: 'user-1',
    email: normalizeEmail('u@example.com'),
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    ...partial,
  };
}

function makeRepo(overrides: Partial<AuthRepository>): AuthRepository {
  return {
    createUserWithPassword: async () => unimplemented(),
    findUserIdByEmail: async () => unimplemented(),
    findUserForLogin: async () => unimplemented(),
    findUserById: async () => makeUser(),
    getAuthMethods: async () => ['GOOGLE'],
    findUserByExternalIdentity: async () => unimplemented(),
    createUserWithExternalIdentity: async () => unimplemented(),
    linkExternalIdentityToUser: async () => unimplemented(),
    listUserSessions: async () => unimplemented(),
    revokeSessionById: async () => unimplemented(),
    upsertSessionPushToken: async () => unimplemented(),
    revokeSessionPushToken: async () => unimplemented(),
    findPasswordCredential: async () => unimplemented(),
    verifyEmailByTokenHash: async () => unimplemented(),
    resetPasswordByTokenHash: async () => unimplemented(),
    changePasswordAndRevokeOtherSessions: async () => unimplemented(),
    findRefreshTokenWithSession: async () => unimplemented(),
    revokeActiveSessionForDevice: async () => undefined,
    createSession: async () => ({
      id: 'session-1',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    }),
    createRefreshToken: async (sessionId, tokenHash, expiresAt) => ({
      id: 'rt-1',
      tokenHash,
      expiresAt,
      revokedAt: null,
      sessionId,
      replacedById: null,
    }),
    rotateRefreshToken: async () => unimplemented(),
    revokeSessionByRefreshTokenHash: async () => unimplemented(),
    ...overrides,
  };
}

describe('AuthDesktopHandoffService', () => {
  const now = new Date('2026-07-10T12:00:00.000Z');
  const clock: Clock = { now: () => now };
  const config: AuthConfig = {
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 2592000,
    passwordMinLength: 10,
    desktopRedirectUrisRaw: 'burnly://auth/callback',
    desktopHandoffTtlSeconds: 60,
  };

  const verifier = 'a'.repeat(43);
  const challenge = pkceS256Challenge(verifier);

  const accessTokens: AccessTokenIssuer = {
    signAccessToken: async () => 'access-token',
    getPublicJwks: async () => ({}),
  };

  const noopRateLimiter: DesktopHandoffRateLimiter = {
    assertAllowed: async () => undefined,
  };

  function makeService(params: {
    store?: DesktopHandoffStore;
    repo?: AuthRepository;
    rateLimiter?: DesktopHandoffRateLimiter;
  }): AuthDesktopHandoffService {
    const store: DesktopHandoffStore = params.store ?? {
      save: async () => true,
      consume: async () => null,
    };
    const repo = params.repo ?? makeRepo({});
    const sessions = new AuthSessionLifecycleService(repo, accessTokens, clock, config);
    return new AuthDesktopHandoffService(
      repo,
      store,
      params.rateLimiter ?? noopRateLimiter,
      sessions,
      clock,
      config,
    );
  }

  it('creates a handoff code when redirect is allowlisted', async () => {
    let savedChallenge: string | undefined;
    const store: DesktopHandoffStore = {
      save: async (_hash, record) => {
        savedChallenge = record.codeChallenge;
        return true;
      },
      consume: async () => null,
    };
    const svc = makeService({ store });

    const result = await svc.createHandoff({
      userId: 'user-1',
      redirectUri: 'burnly://auth/callback',
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state: 'state-value-1',
      client: 'desktop',
    });

    expect(result.code.length).toBeGreaterThan(16);
    expect(result.expiresIn).toBe(60);
    expect(result.state).toBe('state-value-1');
    expect(savedChallenge).toBe(challenge);
  });

  it('rejects disallowed redirect_uri on create', async () => {
    const svc = makeService({});
    await expect(
      svc.createHandoff({
        userId: 'user-1',
        redirectUri: 'https://evil.example/cb',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: 'state-value-1',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_DESKTOP_REDIRECT_URI_INVALID });
  });

  it('rejects DELETED users on create', async () => {
    const svc = makeService({
      repo: makeRepo({ findUserById: async () => makeUser({ status: 'DELETED' }) }),
    });
    await expect(
      svc.createHandoff({
        userId: 'user-1',
        redirectUri: 'burnly://auth/callback',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: 'state-value-1',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });

  it('rejects SUSPENDED users on create', async () => {
    const svc = makeService({
      repo: makeRepo({ findUserById: async () => makeUser({ status: 'SUSPENDED' }) }),
    });
    await expect(
      svc.createHandoff({
        userId: 'user-1',
        redirectUri: 'burnly://auth/callback',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: 'state-value-1',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_USER_SUSPENDED });
  });

  it('returns UNAVAILABLE when store cannot save', async () => {
    const store: DesktopHandoffStore = {
      save: async () => false,
      consume: async () => null,
    };
    const svc = makeService({ store });
    await expect(
      svc.createHandoff({
        userId: 'user-1',
        redirectUri: 'burnly://auth/callback',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: 'state-value-1',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_UNAVAILABLE });
  });

  it('exchanges a valid code for a new session', async () => {
    const store: DesktopHandoffStore = {
      save: async () => true,
      consume: async () => ({
        userId: 'user-1',
        codeChallenge: challenge,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
        createdAtMs: now.getTime(),
      }),
    };
    const svc = makeService({ store });

    const result = await svc.exchangeToken({
      code: 'handoff-code-value-ok',
      codeVerifier: verifier,
      redirectUri: 'burnly://auth/callback',
      client: 'desktop',
      deviceId: 'desktop-1',
      deviceName: 'Laptop',
    });

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken.length).toBeGreaterThan(10);
    expect(result.user.id).toBe('user-1');
  });

  it('rejects wrong PKCE verifier', async () => {
    const store: DesktopHandoffStore = {
      save: async () => true,
      consume: async () => ({
        userId: 'user-1',
        codeChallenge: challenge,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
        createdAtMs: now.getTime(),
      }),
    };
    const svc = makeService({ store });

    await expect(
      svc.exchangeToken({
        code: 'handoff-code-value-ok',
        codeVerifier: 'b'.repeat(43),
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID });
  });

  it('rejects redirectUri mismatch on exchange', async () => {
    const store: DesktopHandoffStore = {
      save: async () => true,
      consume: async () => ({
        userId: 'user-1',
        codeChallenge: challenge,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
        createdAtMs: now.getTime(),
      }),
    };
    const svc = makeService({ store });

    await expect(
      svc.exchangeToken({
        code: 'handoff-code-value-ok',
        codeVerifier: verifier,
        redirectUri: 'http://127.0.0.1:39201/callback',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID });
  });

  it('rejects DELETED users on exchange without leaking account state', async () => {
    const store: DesktopHandoffStore = {
      save: async () => true,
      consume: async () => ({
        userId: 'user-1',
        codeChallenge: challenge,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
        createdAtMs: now.getTime(),
      }),
    };
    const svc = makeService({
      store,
      repo: makeRepo({ findUserById: async () => makeUser({ status: 'DELETED' }) }),
    });

    await expect(
      svc.exchangeToken({
        code: 'handoff-code-value-ok',
        codeVerifier: verifier,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID });
  });

  it('rejects SUSPENDED users on exchange', async () => {
    const store: DesktopHandoffStore = {
      save: async () => true,
      consume: async () => ({
        userId: 'user-1',
        codeChallenge: challenge,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
        createdAtMs: now.getTime(),
      }),
    };
    const svc = makeService({
      store,
      repo: makeRepo({ findUserById: async () => makeUser({ status: 'SUSPENDED' }) }),
    });

    await expect(
      svc.exchangeToken({
        code: 'handoff-code-value-ok',
        codeVerifier: verifier,
        redirectUri: 'burnly://auth/callback',
        client: 'desktop',
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.AUTH_USER_SUSPENDED });
  });
});
