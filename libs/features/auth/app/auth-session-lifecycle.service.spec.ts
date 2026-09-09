import { AuthSessionLifecycleService } from './auth-session-lifecycle.service';
import { AuthErrorCode } from './auth.error-codes';
import { AuthError } from './auth.errors';
import type { AccessTokenIssuer } from './ports/access-token-issuer';
import type {
  AuthRepository,
  CreateSessionInput,
  RefreshRotationResult,
  RefreshTokenRecord,
  RefreshTokenWithSession,
  SessionRecord,
  SessionSeenMetadata,
} from './ports/auth.repository';
import type { AuthConfig } from './auth.config';
import type { AuthUserRecord } from './auth.types';
import type { Clock } from './time';
import { hashRefreshToken } from './refresh-token';

function unimplemented(): never {
  throw new Error('unimplemented');
}

function makeUser(overrides: Partial<AuthUserRecord> = {}): AuthUserRecord {
  return {
    id: 'user-1',
    email: 'test@example.com',
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'ACTIVE',
    ...overrides,
  };
}

const defaultConfig: AuthConfig = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 60 * 60 * 24 * 30, // 30 days = 2,592,000s
  passwordMinLength: 10,
  desktopHandoffTtlSeconds: 60,
};

const defaultAccessTokens: AccessTokenIssuer = {
  signAccessToken: async () => 'mock-access-token',
  getPublicJwks: async () => ({}),
};

function makeRepo(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    createUserWithPassword: async () => unimplemented(),
    findUserIdByEmail: async () => null,
    findUserForLogin: async () => unimplemented(),
    findUserById: async () => makeUser(),
    getAuthMethods: async () => ['PASSWORD'],
    findUserByExternalIdentity: async () => null,
    createUserWithExternalIdentity: async () => unimplemented(),
    linkExternalIdentityToUser: async () => unimplemented(),
    listUserSessions: async () => unimplemented(),
    revokeSessionById: async () => unimplemented(),
    upsertSessionPushToken: async () => unimplemented(),
    revokeSessionPushToken: async () => undefined,
    findPasswordCredential: async () => unimplemented(),
    verifyEmailByTokenHash: async () => unimplemented(),
    resetPasswordByTokenHash: async () => unimplemented(),
    changePasswordAndRevokeOtherSessions: async () => unimplemented(),
    findRefreshTokenWithSession: async () => unimplemented(),
    revokeActiveSessionForDevice: async () => undefined,
    createSession: async (input: CreateSessionInput): Promise<SessionRecord> => ({
      id: 'session-1',
      expiresAt: input.sessionExpiresAt,
    }),
    createRefreshToken: async (
      sessionId: string,
      tokenHash: string,
      expiresAt: Date,
    ): Promise<RefreshTokenRecord> => ({
      id: 'rt-1',
      tokenHash,
      expiresAt,
      revokedAt: null,
      sessionId,
      replacedById: null,
    }),
    rotateRefreshToken: async () => unimplemented(),
    revokeSessionByRefreshTokenHash: async () => true,
    ...overrides,
  };
}

describe('AuthSessionLifecycleService', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');
  const clock: Clock = { now: () => now };

  describe('refresh (sliding window expiration)', () => {
    it('extends session and refresh token expiresAt by refreshTokenTtlSeconds on successful refresh', async () => {
      const rawToken = 'current-refresh-token';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      // Existing session was created almost 30 days ago, expiring in 1 hour
      const oldExpiresAt = new Date(now.getTime() + 3600_000);
      const existingRecord: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: oldExpiresAt,
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: oldExpiresAt,
          revokedAt: null,
        },
        user,
      };

      const state: {
        rotateCallParams?: {
          tokenHash: string;
          newTokenHash: string;
          now: Date;
          newExpiresAt: Date;
          session?: SessionSeenMetadata;
        };
      } = {};

      const repo = makeRepo({
        findRefreshTokenWithSession: async (hash) => {
          return hash === currentHash ? existingRecord : null;
        },
        rotateRefreshToken: async (tokenHash, newTokenHash, callNow, newExpiresAt, session) => {
          state.rotateCallParams = {
            tokenHash,
            newTokenHash,
            now: callNow,
            newExpiresAt,
            session,
          };
          return {
            kind: 'ok',
            sessionId: 'session-1',
            user,
            sessionExpiresAt: newExpiresAt,
          };
        },
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      const result = await svc.refresh({
        refreshToken: rawToken,
        ip: '192.168.1.1',
        userAgent: 'Burnly/1.0',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.refreshToken).not.toBe(rawToken);
      expect(result.user.id).toBe(user.id);

      // Verify that newExpiresAt is calculated as now + 30 days (sliding window)
      const expectedNewExpiresAt = new Date(
        now.getTime() + defaultConfig.refreshTokenTtlSeconds * 1000,
      );
      if (!state.rotateCallParams) {
        throw new Error('Expected rotateCallParams to be set');
      }
      expect(state.rotateCallParams.tokenHash).toBe(currentHash);
      expect(state.rotateCallParams.now).toEqual(now);
      expect(state.rotateCallParams.newExpiresAt).toEqual(expectedNewExpiresAt);
      expect(state.rotateCallParams.session).toEqual({
        ip: '192.168.1.1',
        userAgent: 'Burnly/1.0',
      });
    });

    it('rejects if refresh token is expired (token.expiresAt <= now)', async () => {
      const rawToken = 'expired-refresh-token';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      const expiredRecord: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() - 1000), // Expired 1 second ago
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
        },
        user,
      };

      const repo = makeRepo({
        findRefreshTokenWithSession: async () => expiredRecord,
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
      });
    });

    it('rejects if parent session is expired (session.expiresAt <= now)', async () => {
      const rawToken = 'valid-token-expired-session';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      const record: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() - 1000), // Session expired
          revokedAt: null,
        },
        user,
      };

      const repo = makeRepo({
        findRefreshTokenWithSession: async () => record,
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
      });
    });

    it('rejects and revokes session if refresh token was already revoked (reuse detection)', async () => {
      const rawToken = 'reused-token';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      const revokedRecord: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: new Date(now.getTime() - 5000),
          sessionId: 'session-1',
          replacedById: 'rt-2',
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
        },
        user,
      };

      let revokedByHash: string | null = null;
      const repo = makeRepo({
        findRefreshTokenWithSession: async () => revokedRecord,
        revokeSessionByRefreshTokenHash: async (hash) => {
          revokedByHash = hash;
          return true;
        },
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
      });
      expect(revokedByHash).toBe(currentHash);
    });

    it('rejects if session is revoked', async () => {
      const rawToken = 'token-with-revoked-session';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      const record: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: new Date(now.getTime() - 1000),
        },
        user,
      };

      const repo = makeRepo({
        findRefreshTokenWithSession: async () => record,
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 401,
        code: AuthErrorCode.AUTH_SESSION_REVOKED,
      });
    });

    it('rejects if user is suspended', async () => {
      const rawToken = 'suspended-user-token';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser({ status: 'SUSPENDED' });

      const record: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
        },
        user,
      };

      const repo = makeRepo({
        findRefreshTokenWithSession: async () => record,
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 403,
        code: AuthErrorCode.AUTH_USER_SUSPENDED,
      });
    });

    it('handles rotateRefreshToken returning expired kind', async () => {
      const rawToken = 'token-to-rotate';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      const record: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
        },
        user,
      };

      const repo = makeRepo({
        findRefreshTokenWithSession: async () => record,
        rotateRefreshToken: async (): Promise<RefreshRotationResult> => ({
          kind: 'expired',
          sessionId: 'session-1',
          userId: user.id,
        }),
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_EXPIRED,
      });
    });

    it('handles rotateRefreshToken returning revoked_or_reused kind', async () => {
      const rawToken = 'token-to-rotate';
      const currentHash = hashRefreshToken(rawToken);
      const user = makeUser();

      const record: RefreshTokenWithSession = {
        token: {
          id: 'rt-1',
          tokenHash: currentHash,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
          sessionId: 'session-1',
          replacedById: null,
        },
        session: {
          id: 'session-1',
          userId: user.id,
          expiresAt: new Date(now.getTime() + 3600_000),
          revokedAt: null,
        },
        user,
      };

      const repo = makeRepo({
        findRefreshTokenWithSession: async () => record,
        rotateRefreshToken: async (): Promise<RefreshRotationResult> => ({
          kind: 'revoked_or_reused',
          sessionId: 'session-1',
          userId: user.id,
        }),
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.refresh({ refreshToken: rawToken })).rejects.toMatchObject({
        status: 401,
        code: AuthErrorCode.AUTH_REFRESH_TOKEN_REUSED,
      });
    });
  });

  describe('issueTokensForNewSession', () => {
    it('creates a session with sessionExpiresAt derived from refreshTokenTtlSeconds', async () => {
      const state: {
        createdSessionInput?: CreateSessionInput;
        createdTokenInput?: { sessionId: string; tokenHash: string; expiresAt: Date };
      } = {};
      const user = makeUser();

      const repo = makeRepo({
        createSession: async (input) => {
          state.createdSessionInput = input;
          return { id: 'session-new', expiresAt: input.sessionExpiresAt };
        },
        createRefreshToken: async (sessionId, tokenHash, expiresAt) => {
          state.createdTokenInput = { sessionId, tokenHash, expiresAt };
          return {
            id: 'rt-new',
            tokenHash,
            expiresAt,
            revokedAt: null,
            sessionId,
            replacedById: null,
          };
        },
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      const result = await svc.issueTokensForNewSession(user, ['PASSWORD'], {
        deviceId: 'device-1',
        deviceName: 'MacBook Pro',
        ip: '10.0.0.1',
        userAgent: 'Burnly/1.0',
        now,
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user.id).toBe(user.id);

      const expectedExpiresAt = new Date(
        now.getTime() + defaultConfig.refreshTokenTtlSeconds * 1000,
      );
      if (!state.createdSessionInput || !state.createdTokenInput) {
        throw new Error('Expected createdSessionInput and createdTokenInput to be set');
      }
      expect(state.createdSessionInput.sessionExpiresAt).toEqual(expectedExpiresAt);
      expect(state.createdSessionInput.deviceId).toBe('device-1');
      expect(state.createdSessionInput.deviceName).toBe('MacBook Pro');
      expect(state.createdTokenInput.expiresAt).toEqual(expectedExpiresAt);
    });
  });

  describe('logout', () => {
    it('revokes session by refresh token hash', async () => {
      const rawToken = 'logout-refresh-token';
      const expectedHash = hashRefreshToken(rawToken);
      let revokedHash: string | null = null;

      const repo = makeRepo({
        revokeSessionByRefreshTokenHash: async (hash, callNow) => {
          revokedHash = hash;
          expect(callNow).toEqual(now);
          return true;
        },
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await svc.logout({ refreshToken: rawToken });
      expect(revokedHash).toBe(expectedHash);
    });

    it('throws AUTH_REFRESH_TOKEN_INVALID when token to revoke is not found', async () => {
      const repo = makeRepo({
        revokeSessionByRefreshTokenHash: async () => false,
      });

      const svc = new AuthSessionLifecycleService(repo, defaultAccessTokens, clock, defaultConfig);

      await expect(svc.logout({ refreshToken: 'unknown-token' })).rejects.toBeInstanceOf(AuthError);
    });
  });
});
