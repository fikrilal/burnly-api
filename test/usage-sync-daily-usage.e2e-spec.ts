import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  describeAuthE2eSuite,
  getBodyData,
  getStringField,
  uniqueEmail,
  type AuthE2eHarness,
} from './auth/auth-e2e.harness';
import { MAX_FACTS_PER_BATCH } from '../libs/features/usage-sync/app/usage-sync.limits';

function canonicalFixture(clientDeviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 1,
    clientDeviceId,
    appVersion: '0.1.20',
    reportingTimezone: 'UTC',
    clientRevision: 1,
    window: {
      startDate: '2026-07-08',
      endDate: '2026-07-08',
      scope: 'rolling',
    },
    facts: [
      {
        identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
        identityVersion: 1,
        sourceKey: 'claude-code',
        usageDate: '2026-07-08',
        aggregationTimezone: 'UTC',
        inputTokens: 100,
        outputTokens: 50,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 150,
        unclassifiedTokens: 0,
        cost: {
          status: 'unavailable',
          kind: 'unknown',
        },
        dataQuality: 'complete',
        recordState: 'active',
        firstSeenAt: '2026-07-08T10:00:00.000Z',
        lastSeenAt: '2026-07-08T12:00:00.000Z',
        removedAt: null,
        models: [
          {
            rawModelId: 'claude-sonnet-4',
            totalTokens: 150,
            inputTokens: 100,
            outputTokens: 50,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            cost: { status: 'unavailable' },
          },
        ],
      },
    ],
    ...overrides,
  };
}

describeAuthE2eSuite('Usage Sync Daily Usage Push (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';
  let prisma: ReturnType<AuthE2eHarness['prisma']>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    prisma = harness.prisma();
  });

  async function registerAndDevice(): Promise<{ accessToken: string; clientDeviceId: string }> {
    const clientDeviceId = `dev-${randomUUID()}`;
    const email = uniqueEmail('sync-push');
    const res = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({
        email,
        password: 'correct-horse-battery-staple',
        deviceId: clientDeviceId,
        deviceName: 'Test Device',
      })
      .expect(200);
    const accessToken = getStringField(getBodyData(res.body), 'accessToken');

    await request(baseUrl)
      .put(`/v1/sync/devices/${clientDeviceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        displayName: 'test-laptop',
        platform: 'linux',
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
      })
      .expect(200);

    return { accessToken, clientDeviceId };
  }

  function push(
    accessToken: string,
    body: Record<string, unknown>,
    options?: { idempotencyKey?: string | null },
  ) {
    const req = request(baseUrl)
      .post('/v1/sync/daily-usage')
      .set('Authorization', `Bearer ${accessToken}`);
    if (options?.idempotencyKey !== null) {
      req.set('Idempotency-Key', options?.idempotencyKey ?? randomUUID());
    }
    return req.send(body);
  }

  it('accepts canonical fixture after device registration', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();

    const res = await push(accessToken, canonicalFixture(clientDeviceId)).expect(200);

    const data = getBodyData(res.body);
    expect(data.clientDeviceId).toBe(clientDeviceId);
    expect(data.counts).toMatchObject({
      received: 1,
      upserted: 1,
      removed: 0,
      unchanged: 0,
      rejected: 0,
    });
    expect(typeof data.acceptedAt).toBe('string');

    const device = await prisma.syncDevice.findFirstOrThrow({
      where: { clientDeviceId },
    });
    const facts = await prisma.dailyUsageFact.findMany({
      where: { deviceId: device.id, identityKey: 'claude-code:daily:v1:UTC:2026-07-08' },
      include: { models: true },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.totalTokens).toBe(150n);
    expect(facts[0]?.models).toHaveLength(1);
    expect(device.lastSyncAt).not.toBeNull();
  });

  it('requires Idempotency-Key', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();

    const res = await push(accessToken, canonicalFixture(clientDeviceId), {
      idempotencyKey: null,
    }).expect(400);

    expect(res.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
    expect(JSON.stringify(res.body.errors ?? [])).toContain('Idempotency-Key');
  });

  it('replays identical Idempotency-Key without growing facts', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();
    const key = randomUUID();
    const body = canonicalFixture(clientDeviceId);

    const first = await push(accessToken, body, { idempotencyKey: key }).expect(200);
    const second = await push(accessToken, body, { idempotencyKey: key }).expect(200);

    expect(second.headers['idempotency-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);

    const device = await prisma.syncDevice.findFirstOrThrow({
      where: { clientDeviceId },
    });
    const count = await prisma.dailyUsageFact.count({ where: { deviceId: device.id } });
    expect(count).toBe(1);
  });

  it('rejects over-limit facts with SYNC_PAYLOAD_TOO_LARGE', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();
    const sampleFacts = canonicalFixture(clientDeviceId).facts;
    const baseFact = sampleFacts[0];
    if (baseFact === undefined) {
      throw new Error('expected canonical fixture to include a fact');
    }
    const facts = Array.from({ length: MAX_FACTS_PER_BATCH + 1 }, (_, i) => ({
      ...baseFact,
      identityKey: `claude-code:daily:v1:UTC:2026-07-08`,
      sourceKey: 'claude-code',
      usageDate: '2026-07-08',
      totalTokens: i + 1,
    }));

    const res = await push(accessToken, canonicalFixture(clientDeviceId, { facts })).expect(400);

    expect(res.body.code).toBe('SYNC_PAYLOAD_TOO_LARGE');

    const device = await prisma.syncDevice.findFirstOrThrow({
      where: { clientDeviceId },
    });
    expect(await prisma.dailyUsageFact.count({ where: { deviceId: device.id } })).toBe(0);
  });

  it('rejects invalid identityKey without writing', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();

    const fixture = canonicalFixture(clientDeviceId, {
      facts: [
        {
          ...canonicalFixture(clientDeviceId).facts[0],
          identityKey: 'wrong-key',
        },
      ],
    });

    const res = await push(accessToken, fixture).expect(400);

    expect(res.body.code).toBe('SYNC_IDENTITY_INVALID');

    const device = await prisma.syncDevice.findFirstOrThrow({
      where: { clientDeviceId },
    });
    const count = await prisma.dailyUsageFact.count({ where: { deviceId: device.id } });
    expect(count).toBe(0);
  });

  it('returns SYNC_DEVICE_NOT_FOUND when device missing', async () => {
    const { accessToken } = await registerAndDevice();

    const res = await push(accessToken, canonicalFixture(`missing-${randomUUID()}`)).expect(404);

    expect(res.body.code).toBe('SYNC_DEVICE_NOT_FOUND');
  });

  it('rejects unauthenticated push', async () => {
    await request(baseUrl)
      .post('/v1/sync/daily-usage')
      .set('Idempotency-Key', randomUUID())
      .send(canonicalFixture('no-auth'))
      .expect(401);
  });

  it('higher revision updates totals; lower revision is ignored (unchanged)', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();
    const baseFact = canonicalFixture(clientDeviceId).facts[0];
    if (baseFact === undefined) {
      throw new Error('expected canonical fixture to include a fact');
    }

    await push(accessToken, canonicalFixture(clientDeviceId, { clientRevision: 1 })).expect(200);

    const up = await push(
      accessToken,
      canonicalFixture(clientDeviceId, {
        clientRevision: 2,
        facts: [
          {
            ...baseFact,
            totalTokens: 999,
            lastSeenAt: '2026-07-08T13:00:00.000Z',
            models: [
              {
                rawModelId: 'claude-sonnet-4',
                totalTokens: 999,
                cost: { status: 'unavailable' },
              },
            ],
          },
        ],
      }),
    ).expect(200);

    expect(getBodyData(up.body).counts).toMatchObject({ upserted: 1 });

    const stale = await push(
      accessToken,
      canonicalFixture(clientDeviceId, {
        clientRevision: 1,
        facts: [
          {
            ...baseFact,
            totalTokens: 1,
            lastSeenAt: '2026-07-08T14:00:00.000Z',
          },
        ],
      }),
    ).expect(200);

    expect(getBodyData(stale.body).counts).toMatchObject({ unchanged: 1, upserted: 0 });

    const device = await prisma.syncDevice.findFirstOrThrow({
      where: { clientDeviceId },
    });
    const fact = await prisma.dailyUsageFact.findFirst({
      where: { deviceId: device.id, identityKey: 'claude-code:daily:v1:UTC:2026-07-08' },
    });
    expect(fact?.totalTokens).toBe(999n);
  });

  it('empty facts heartbeat updates lastSyncAt', async () => {
    const { accessToken, clientDeviceId } = await registerAndDevice();

    const res = await push(
      accessToken,
      canonicalFixture(clientDeviceId, { facts: [], clientRevision: 3 }),
    ).expect(200);

    expect(getBodyData(res.body).counts).toMatchObject({
      received: 0,
      upserted: 0,
      rejected: 0,
    });

    const device = await prisma.syncDevice.findFirstOrThrow({
      where: { clientDeviceId },
    });
    expect(device.lastSyncAt).not.toBeNull();
    expect(device.lastClientRevision).toBe(3n);
  });
});
