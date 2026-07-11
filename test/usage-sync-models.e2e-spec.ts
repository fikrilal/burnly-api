import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  describeAuthE2eSuite,
  getBodyData,
  getObjectField,
  getStringField,
  uniqueEmail,
  type AuthE2eHarness,
} from './auth/auth-e2e.harness';
import { UNKNOWN_MODEL_IDENTITY_KEY } from '../libs/features/usage-sync/app/model-identity';

function factForDate(params: {
  sourceKey: string;
  date: string;
  totalTokens: number;
  models: Array<{ rawModelId: string | null; totalTokens: number }>;
}) {
  return {
    identityKey: `${params.sourceKey}:daily:v1:UTC:${params.date}`,
    identityVersion: 1,
    sourceKey: params.sourceKey,
    usageDate: params.date,
    aggregationTimezone: 'UTC',
    inputTokens: Math.floor(params.totalTokens * 0.6),
    outputTokens: Math.floor(params.totalTokens * 0.4),
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: params.totalTokens,
    unclassifiedTokens: 0,
    cost: { status: 'unavailable', kind: 'unknown' },
    dataQuality: 'complete',
    recordState: 'active',
    firstSeenAt: `${params.date}T10:00:00.000Z`,
    lastSeenAt: `${params.date}T12:00:00.000Z`,
    removedAt: null,
    models: params.models.map((m) => ({
      rawModelId: m.rawModelId,
      totalTokens: m.totalTokens,
      inputTokens: Math.floor(m.totalTokens * 0.6),
      outputTokens: Math.floor(m.totalTokens * 0.4),
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cost: { status: 'unavailable' },
    })),
  };
}

describeAuthE2eSuite('Usage Models (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = harness.baseUrl();
  });

  async function registerAndDevice(clientDeviceId = `dev-${randomUUID()}`): Promise<{
    accessToken: string;
    clientDeviceId: string;
  }> {
    const email = uniqueEmail('usgmod');
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
    clientDeviceId: string,
    facts: Record<string, unknown>[],
    clientRevision: number,
  ) {
    const dates = facts.map((f) => String(f.usageDate)).sort();
    return request(baseUrl)
      .post('/v1/sync/daily-usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        contractVersion: 1,
        clientDeviceId,
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
        clientRevision,
        window: {
          startDate: dates[0],
          endDate: dates[dates.length - 1],
          scope: 'incremental',
        },
        facts,
      });
  }

  it('returns empty models for empty range', async () => {
    const { accessToken } = await registerAndDevice();

    const res = await request(baseUrl)
      .get('/v1/usage/models')
      .query({ from: '2026-07-01', to: '2026-07-03', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = getBodyData(res.body);
    expect(getObjectField(data, 'parentTotals')).toEqual({ totalTokens: 0, factCount: 0 });
    expect(data.models).toEqual([]);
    expect(getObjectField(data, 'attribution')).toEqual({
      modelsSumTokens: 0,
      parentTotalTokens: 0,
      unattributedTokens: 0,
    });
  });

  it('aggregates models across devices with unattributed remainder and source filter', async () => {
    const { accessToken, clientDeviceId: devA } = await registerAndDevice();
    const devB = `dev-${randomUUID()}`;

    await request(baseUrl)
      .put(`/v1/sync/devices/${devB}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        displayName: 'studio',
        platform: 'macos',
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
      })
      .expect(200);

    await push(
      accessToken,
      devA,
      [
        factForDate({
          sourceKey: 'claude-code',
          date: '2026-07-02',
          totalTokens: 2100,
          models: [
            { rawModelId: 'claude-sonnet-4', totalTokens: 2000 },
            { rawModelId: null, totalTokens: 0 },
          ],
        }),
        factForDate({
          sourceKey: 'codex',
          date: '2026-07-02',
          totalTokens: 500,
          models: [{ rawModelId: 'gpt-5', totalTokens: 500 }],
        }),
      ],
      1,
    ).expect(200);

    await push(
      accessToken,
      devB,
      [
        factForDate({
          sourceKey: 'claude-code',
          date: '2026-07-03',
          totalTokens: 900,
          models: [{ rawModelId: 'claude-sonnet-4', totalTokens: 900 }],
        }),
      ],
      1,
    ).expect(200);

    const all = await request(baseUrl)
      .get('/v1/usage/models')
      .query({ from: '2026-07-01', to: '2026-07-03', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = getBodyData(all.body);
    expect(getObjectField(data, 'parentTotals')).toEqual({ totalTokens: 3500, factCount: 3 });

    const models = data.models as Array<Record<string, unknown>>;
    const sonnet = models.find((m) => m.modelIdentityKey === 'claude-sonnet-4');
    expect(sonnet?.totalTokens).toBe(2900);

    const unknown = models.find((m) => m.modelIdentityKey === UNKNOWN_MODEL_IDENTITY_KEY);
    expect(unknown?.rawModelId).toBeNull();

    // parent 3500, models sum = 2000+0+500+900 = 3400, unattributed 100
    expect(getObjectField(data, 'attribution')).toEqual({
      modelsSumTokens: 3400,
      parentTotalTokens: 3500,
      unattributedTokens: 100,
    });

    const filtered = await request(baseUrl)
      .get('/v1/usage/models')
      .query({
        from: '2026-07-01',
        to: '2026-07-03',
        timezone: 'UTC',
        sourceKey: 'claude-code',
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const filteredData = getBodyData(filtered.body);
    expect(filteredData.sourceFilter).toBe('claude-code');
    expect(getObjectField(filteredData, 'parentTotals').totalTokens).toBe(3000);
    const filteredModels = filteredData.models as Array<Record<string, unknown>>;
    expect(filteredModels.some((m) => m.modelIdentityKey === 'gpt-5')).toBe(false);
    expect(getObjectField(filteredData, 'attribution').parentTotalTokens).toBe(3000);

    const deviceOnly = await request(baseUrl)
      .get('/v1/usage/models')
      .query({
        from: '2026-07-01',
        to: '2026-07-03',
        timezone: 'UTC',
        deviceId: devA,
      })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(getObjectField(getBodyData(deviceOnly.body), 'parentTotals').totalTokens).toBe(2600);
  });

  it('rejects invalid range, missing device, unauthorized', async () => {
    const { accessToken } = await registerAndDevice();

    await request(baseUrl)
      .get('/v1/usage/models')
      .query({ from: '2026-07-09', to: '2026-07-01', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_FAILED');
      });

    await request(baseUrl)
      .get('/v1/usage/models')
      .query({ from: '2026-07-01', to: '2026-07-01', timezone: 'UTC', deviceId: 'nope' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('SYNC_DEVICE_NOT_FOUND');
      });

    await request(baseUrl)
      .get('/v1/usage/models')
      .query({ from: '2026-07-01', to: '2026-07-01', timezone: 'UTC' })
      .expect(401);
  });
});
