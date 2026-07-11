import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  describeAuthE2eSuite,
  getBodyData,
  getObjectArrayField,
  getObjectField,
  getStringField,
  uniqueEmail,
  type AuthE2eHarness,
} from './auth/auth-e2e.harness';

function factForDate(params: {
  sourceKey: string;
  date: string;
  totalTokens: number;
  models?: Array<{ rawModelId: string | null; totalTokens: number }>;
  recordState?: 'active' | 'removed';
}) {
  const recordState = params.recordState ?? 'active';
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
    recordState,
    firstSeenAt: `${params.date}T10:00:00.000Z`,
    lastSeenAt: `${params.date}T12:00:00.000Z`,
    removedAt: recordState === 'removed' ? `${params.date}T13:00:00.000Z` : null,
    models: (params.models ?? []).map((m) => ({
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

describeAuthE2eSuite('Usage Day Detail (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = harness.baseUrl();
  });

  async function registerAndDevice(clientDeviceId = `dev-${randomUUID()}`): Promise<{
    accessToken: string;
    clientDeviceId: string;
  }> {
    const email = uniqueEmail('usgday');
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

  it('returns empty day with zeros', async () => {
    const { accessToken } = await registerAndDevice();

    const res = await request(baseUrl)
      .get('/v1/usage/days/2026-07-08')
      .query({ timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = getBodyData(res.body);
    expect(data.date).toBe('2026-07-08');
    expect(data.facts).toEqual([]);
    expect(getObjectField(data, 'totals').totalTokens).toBe(0);
    expect(data.bySource).toEqual([]);
  });

  it('returns multi-device facts, attribution, excludes removed; matches calendar cell', async () => {
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

    const day = '2026-07-08';

    await push(
      accessToken,
      devA,
      [
        factForDate({
          sourceKey: 'claude-code',
          date: day,
          totalTokens: 2100,
          models: [{ rawModelId: 'claude-sonnet-4', totalTokens: 2000 }],
        }),
        factForDate({
          sourceKey: 'codex',
          date: day,
          totalTokens: 999,
          recordState: 'removed',
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
          date: day,
          totalTokens: 900,
          models: [{ rawModelId: 'claude-sonnet-4', totalTokens: 900 }],
        }),
      ],
      1,
    ).expect(200);

    const dayRes = await request(baseUrl)
      .get(`/v1/usage/days/${day}`)
      .query({ timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = getBodyData(dayRes.body);
    expect(getObjectField(data, 'totals').totalTokens).toBe(3000);
    expect(data.facts).toHaveLength(2);

    const facts = getObjectArrayField(data, 'facts');
    const withPartial = facts.find((f) => f.totalTokens === 2100);
    expect(withPartial).toBeDefined();
    expect(getObjectField(withPartial!, 'modelAttribution')).toMatchObject({
      modelsTotalTokens: 2000,
      parentTotalTokens: 2100,
      unattributedTokens: 100,
    });

    const bySource = getObjectArrayField(data, 'bySource');
    expect(bySource).toEqual([{ sourceKey: 'claude-code', totalTokens: 3000 }]);

    const calendar = await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: day, to: day, timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const calData = getBodyData(calendar.body);
    const days = getObjectArrayField(calData, 'days');
    expect(days[0]?.totalTokens).toBe(3000);
    expect(days[0]?.factCount).toBe(2);

    const filtered = await request(baseUrl)
      .get(`/v1/usage/days/${day}`)
      .query({ timezone: 'UTC', deviceId: devA })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const filteredData = getBodyData(filtered.body);
    expect(filteredData.deviceFilter).toBe(devA);
    expect(getObjectField(filteredData, 'totals').totalTokens).toBe(2100);
    expect(filteredData.facts).toHaveLength(1);
  });

  it('rejects invalid date, missing device, unauthorized', async () => {
    const { accessToken } = await registerAndDevice();

    await request(baseUrl)
      .get('/v1/usage/days/2026-02-30')
      .query({ timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_FAILED');
      });

    await request(baseUrl)
      .get('/v1/usage/days/2026-07-08')
      .query({ timezone: 'UTC', deviceId: 'nope' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('SYNC_DEVICE_NOT_FOUND');
      });

    await request(baseUrl).get('/v1/usage/days/2026-07-08').query({ timezone: 'UTC' }).expect(401);
  });
});
