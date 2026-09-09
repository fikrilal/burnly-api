import { PrismaService } from '../../../../platform/db/prisma.service';
import { rotateRefreshToken } from './prisma-auth.repository.refresh-tokens';
import { createPrototypeStub } from '../../../../../test/support/stubs';

type ExistingRefreshTokenRow = Readonly<{
  id: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  sessionId: string;
  replacedById: string | null;
  session: Readonly<{
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    activeKey: string | null;
    user: Readonly<{
      id: string;
      email: string;
      emailVerifiedAt: Date | null;
      status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    }>;
  }>;
}>;

type RefreshTokenCreateArgs = {
  data: {
    tokenHash: string;
    expiresAt: Date;
    sessionId: string;
  };
  select?: { id?: boolean };
};

type RefreshTokenUpdateManyArgs = {
  where: {
    id?: string;
    sessionId?: string;
    revokedAt?: null;
    replacedById?: null;
  };
  data: {
    revokedAt?: Date;
    replacedById?: string;
  };
};

type SessionUpdateArgs = {
  where: { id: string };
  data: {
    lastSeenAt?: Date;
    expiresAt?: Date;
    ip?: string;
    userAgent?: string;
  };
  select?: { id?: boolean };
};

type SessionUpdateManyArgs = {
  where: { id: string; revokedAt?: null };
  data: {
    activeKey?: null;
    pushPlatform?: null;
    pushToken?: null;
    pushTokenUpdatedAt?: Date;
    pushTokenRevokedAt?: Date;
    revokedAt?: Date;
  };
};

function createPrismaStub(params: {
  existingToken: ExistingRefreshTokenRow | null;
  updateManyCount?: number;
}) {
  const state: {
    refreshTokenCreateCalls: RefreshTokenCreateArgs[];
    refreshTokenUpdateManyCalls: RefreshTokenUpdateManyArgs[];
    sessionUpdateCalls: SessionUpdateArgs[];
    sessionUpdateManyCalls: SessionUpdateManyArgs[];
  } = {
    refreshTokenCreateCalls: [],
    refreshTokenUpdateManyCalls: [],
    sessionUpdateCalls: [],
    sessionUpdateManyCalls: [],
  };

  const txClient = {
    refreshToken: {
      create: async (args: RefreshTokenCreateArgs) => {
        state.refreshTokenCreateCalls.push(args);
        return { id: 'new-token-id' };
      },
      updateMany: async (args: RefreshTokenUpdateManyArgs) => {
        state.refreshTokenUpdateManyCalls.push(args);
        return { count: params.updateManyCount ?? 1 };
      },
    },
    session: {
      update: async (args: SessionUpdateArgs) => {
        state.sessionUpdateCalls.push(args);
        return { id: args.where.id };
      },
      updateMany: async (args: SessionUpdateManyArgs) => {
        state.sessionUpdateManyCalls.push(args);
        return { count: 1 };
      },
    },
  };

  const client = {
    refreshToken: {
      findUnique: async () => params.existingToken,
    },
  };

  const prisma = createPrototypeStub(PrismaService, {
    getClient: () => client,
    transaction: async <T>(fn: (tx: typeof txClient) => Promise<T>): Promise<T> => {
      return await fn(txClient);
    },
  });

  return { prisma, state };
}

function makeExistingToken(
  overrides: Partial<ExistingRefreshTokenRow> = {},
): ExistingRefreshTokenRow {
  return {
    id: 'rt-1',
    tokenHash: 'old-hash',
    expiresAt: new Date('2026-09-08T13:00:00.000Z'),
    revokedAt: null,
    sessionId: 'session-1',
    replacedById: null,
    session: {
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date('2026-09-08T13:00:00.000Z'),
      revokedAt: null,
      activeKey: 'user-1:device-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
      },
    },
    ...overrides,
  };
}

describe('rotateRefreshToken (prisma persistence unit)', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');
  const newExpiresAt = new Date('2026-10-08T12:00:00.000Z'); // 30 days later

  it('rotates token and extends expiresAt on both new RefreshToken and Session (sliding window)', async () => {
    const existing = makeExistingToken();
    const { prisma, state } = createPrismaStub({ existingToken: existing });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt, {
      ip: '192.168.1.100',
      userAgent: 'Burnly-Desktop/1.0',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') {
      throw new Error('Expected result.kind to be ok');
    }

    expect(result.sessionId).toBe('session-1');
    expect(result.sessionExpiresAt).toEqual(newExpiresAt);
    expect(result.user.id).toBe('user-1');

    // Verify replacement RefreshToken record created with newExpiresAt
    expect(state.refreshTokenCreateCalls).toHaveLength(1);
    const createdToken = state.refreshTokenCreateCalls[0];
    if (!createdToken) throw new Error('Expected createdToken to exist');
    expect(createdToken.data).toEqual({
      tokenHash: 'new-hash',
      expiresAt: newExpiresAt,
      sessionId: 'session-1',
    });

    // Verify old RefreshToken marked revoked and replaced
    expect(state.refreshTokenUpdateManyCalls).toHaveLength(1);
    const updatedOldToken = state.refreshTokenUpdateManyCalls[0];
    if (!updatedOldToken) throw new Error('Expected updatedOldToken to exist');
    expect(updatedOldToken.where).toEqual({
      id: 'rt-1',
      revokedAt: null,
      replacedById: null,
    });
    expect(updatedOldToken.data).toEqual({
      revokedAt: now,
      replacedById: 'new-token-id',
    });

    // Verify Session updated with lastSeenAt and newExpiresAt
    expect(state.sessionUpdateCalls).toHaveLength(1);
    const updatedSession = state.sessionUpdateCalls[0];
    if (!updatedSession) throw new Error('Expected updatedSession to exist');
    expect(updatedSession.where).toEqual({ id: 'session-1' });
    expect(updatedSession.data).toEqual({
      lastSeenAt: now,
      expiresAt: newExpiresAt,
      ip: '192.168.1.100',
      userAgent: 'Burnly-Desktop/1.0',
    });
  });

  it('returns not_found when refresh token hash does not match any record', async () => {
    const { prisma } = createPrismaStub({ existingToken: null });

    const result = await rotateRefreshToken(prisma, 'missing-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({ kind: 'not_found' });
  });

  it('returns session_revoked when parent session is already revoked', async () => {
    const existing = makeExistingToken({
      session: {
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date('2026-09-08T13:00:00.000Z'),
        revokedAt: new Date('2026-09-08T11:00:00.000Z'),
        activeKey: null,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          emailVerifiedAt: null,
          status: 'ACTIVE',
        },
      },
    });
    const { prisma } = createPrismaStub({ existingToken: existing });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({
      kind: 'session_revoked',
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });

  it('returns expired when token expiresAt <= now', async () => {
    const existing = makeExistingToken({
      expiresAt: new Date(now.getTime() - 1000),
    });
    const { prisma } = createPrismaStub({ existingToken: existing });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({
      kind: 'expired',
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });

  it('returns expired when session expiresAt <= now', async () => {
    const existing = makeExistingToken({
      session: {
        id: 'session-1',
        userId: 'user-1',
        expiresAt: new Date(now.getTime() - 1000),
        revokedAt: null,
        activeKey: null,
        user: {
          id: 'user-1',
          email: 'user@example.com',
          emailVerifiedAt: null,
          status: 'ACTIVE',
        },
      },
    });
    const { prisma } = createPrismaStub({ existingToken: existing });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({
      kind: 'expired',
      sessionId: 'session-1',
      userId: 'user-1',
    });
  });

  it('revokes session and returns revoked_or_reused when token was already revoked', async () => {
    const existing = makeExistingToken({
      revokedAt: new Date(now.getTime() - 5000),
    });
    const { prisma, state } = createPrismaStub({ existingToken: existing });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({
      kind: 'revoked_or_reused',
      sessionId: 'session-1',
      userId: 'user-1',
    });
    // Session and refresh tokens should be invalidated
    expect(state.sessionUpdateManyCalls.length).toBeGreaterThan(0);
    expect(state.refreshTokenUpdateManyCalls.length).toBeGreaterThan(0);
  });

  it('revokes session and returns revoked_or_reused when token was already replaced', async () => {
    const existing = makeExistingToken({
      replacedById: 'prior-replacement-id',
    });
    const { prisma, state } = createPrismaStub({ existingToken: existing });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({
      kind: 'revoked_or_reused',
      sessionId: 'session-1',
      userId: 'user-1',
    });
    expect(state.sessionUpdateManyCalls.length).toBeGreaterThan(0);
  });

  it('revokes session and returns revoked_or_reused if updateMany count !== 1 (lost race)', async () => {
    const existing = makeExistingToken();
    // Simulate optimistic lock failure: updateMany returns count 0
    const { prisma, state } = createPrismaStub({ existingToken: existing, updateManyCount: 0 });

    const result = await rotateRefreshToken(prisma, 'old-hash', 'new-hash', now, newExpiresAt);

    expect(result).toEqual({
      kind: 'revoked_or_reused',
      sessionId: 'session-1',
      userId: 'user-1',
    });
    expect(state.sessionUpdateManyCalls.length).toBeGreaterThan(0);
  });
});
