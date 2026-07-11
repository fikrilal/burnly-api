import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  describeAuthE2eSuite,
  getBodyData,
  getBodyMeta,
  getObjectArrayField,
  getStringField,
  uniqueEmail,
  type AuthE2eHarness,
} from './auth/auth-e2e.harness';

function factForDate(params: {
  sourceKey: string;
  date: string;
  totalTokens: number;
  recordState?: 'active' | 'removed';
  aggregationTimezone?: string;
}) {
  const tz = params.aggregationTimezone ?? 'UTC';
  const recordState = params.recordState ?? 'active';
  return {
    identityKey: `${params.sourceKey}:daily:v1:${tz}:${params.date}`,
    identityVersion: 1,
    sourceKey: params.sourceKey,
    usageDate: params.date,
    aggregationTimezone: tz,
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
    models: [],
  };
}

describeAuthE2eSuite('Usage Calendar (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = harness.baseUrl();
  });

  async function registerAndDevice(clientDeviceId = `dev-${randomUUID()}`): Promise<{
    accessToken: string;
    clientDeviceId: string;
  }> {
    // Avoid long local-parts that fail class-validator IsEmail (e.g. "usage-calendar+…").
    const email = uniqueEmail('usgcal');
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

  it('returns dense zeros for empty range', async () => {
    const { accessToken } = await registerAndDevice();

    const res = await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-01', to: '2026-07-03', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getBodyMeta(res.body).dayCount).toBe(3);

    const data = getBodyData(res.body);
    expect(data.from).toBe('2026-07-01');
    expect(data.to).toBe('2026-07-03');
    expect(Array.isArray(data.days)).toBe(true);
    expect(data.days).toHaveLength(3);
    expect(data.days).toEqual([
      { date: '2026-07-01', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-02', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-03', totalTokens: 0, factCount: 0, active: false },
    ]);
  });

  it('sums multi-device cells, excludes removed, supports device filter', async () => {
    const { accessToken, clientDeviceId: devA } = await registerAndDevice();
    const devB = `dev-${randomUUID()}`;

    await request(baseUrl)
      .put(`/v1/sync/devices/${devB}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        displayName: 'second',
        platform: 'macos',
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
      })
      .expect(200);

    await push(
      accessToken,
      devA,
      [
        factForDate({ sourceKey: 'claude-code', date: '2026-07-02', totalTokens: 100 }),
        factForDate({
          sourceKey: 'codex',
          date: '2026-07-02',
          totalTokens: 999,
          recordState: 'removed',
        }),
        factForDate({ sourceKey: 'claude-code', date: '2026-07-03', totalTokens: 25 }),
      ],
      1,
    ).expect(200);

    await push(
      accessToken,
      devB,
      [factForDate({ sourceKey: 'claude-code', date: '2026-07-02', totalTokens: 50 })],
      1,
    ).expect(200);

    const res = await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-01', to: '2026-07-03', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = getBodyData(res.body);
    const days = getObjectArrayField(data, 'days');
    expect(days).toEqual([
      { date: '2026-07-01', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-02', totalTokens: 150, factCount: 2, active: true },
      { date: '2026-07-03', totalTokens: 25, factCount: 1, active: true },
    ]);

    const filtered = await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-01', to: '2026-07-03', timezone: 'UTC', deviceId: devA })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const filteredData = getBodyData(filtered.body);
    expect(filteredData.deviceFilter).toBe(devA);
    expect(filteredData.days).toEqual([
      { date: '2026-07-01', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-02', totalTokens: 100, factCount: 1, active: true },
      { date: '2026-07-03', totalTokens: 25, factCount: 1, active: true },
    ]);

    // Other timezone → all zeros for these facts
    const otherTz = await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-01', to: '2026-07-03', timezone: 'Asia/Jakarta' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const otherData = getBodyData(otherTz.body);
    expect(otherData.days).toEqual([
      { date: '2026-07-01', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-02', totalTokens: 0, factCount: 0, active: false },
      { date: '2026-07-03', totalTokens: 0, factCount: 0, active: false },
    ]);
  });

  it('rejects invalid range, missing device, and unauthorized', async () => {
    const { accessToken } = await registerAndDevice();

    await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-09', to: '2026-07-01', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_FAILED');
      });

    await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2024-01-01', to: '2025-01-01', timezone: 'UTC' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);

    await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-01', to: '2026-07-01', timezone: 'UTC', deviceId: 'nope' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('SYNC_DEVICE_NOT_FOUND');
      });

    await request(baseUrl)
      .get('/v1/usage/calendar')
      .query({ from: '2026-07-01', to: '2026-07-01', timezone: 'UTC' })
      .expect(401);
  });
});
