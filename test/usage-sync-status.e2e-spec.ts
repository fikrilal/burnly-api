import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  describeAuthE2eSuite,
  getBodyData,
  getStringField,
  uniqueEmail,
  type AuthE2eHarness,
} from './auth/auth-e2e.harness';

describeAuthE2eSuite('Sync Status (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = harness.baseUrl();
  });

  async function register(clientDeviceId = `dev-${randomUUID()}`): Promise<{
    accessToken: string;
    clientDeviceId: string;
  }> {
    const email = uniqueEmail('syncstat');
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
    return { accessToken, clientDeviceId };
  }

  async function registerDevice(
    accessToken: string,
    clientDeviceId: string,
    body: Record<string, unknown>,
  ) {
    await request(baseUrl)
      .put(`/v1/sync/devices/${clientDeviceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body)
      .expect(200);
  }

  it('returns empty status for user with no sync devices', async () => {
    const { accessToken } = await register();

    const res = await request(baseUrl)
      .get('/v1/sync/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const data = getBodyData(res.body);
    expect(data).toEqual({
      lastSyncAt: null,
      deviceCount: 0,
      devices: [],
    });
  });

  it('lists devices, null lastSync until push, then updates after push', async () => {
    const { accessToken, clientDeviceId: devA } = await register();
    const devB = `dev-${randomUUID()}`;

    await registerDevice(accessToken, devA, {
      displayName: 'laptop',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'UTC',
    });
    await registerDevice(accessToken, devB, {
      displayName: 'studio',
      platform: 'macos',
      appVersion: '0.1.18',
      reportingTimezone: 'America/Los_Angeles',
    });

    const before = await request(baseUrl)
      .get('/v1/sync/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const beforeData = getBodyData(before.body);
    expect(beforeData.deviceCount).toBe(2);
    expect(beforeData.lastSyncAt).toBeNull();
    const devicesBefore = beforeData.devices as Array<Record<string, unknown>>;
    expect(devicesBefore).toHaveLength(2);
    expect(devicesBefore.every((d) => d.lastSyncAt === null)).toBe(true);
    expect(devicesBefore.every((d) => d.lastClientRevision === null)).toBe(true);
    // Public identity is clientDeviceId only (no server UUID field).
    expect(devicesBefore.every((d) => !('id' in d))).toBe(true);

    await request(baseUrl)
      .post('/v1/sync/daily-usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        contractVersion: 1,
        clientDeviceId: devA,
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
        clientRevision: 7,
        window: {
          startDate: '2026-07-08',
          endDate: '2026-07-08',
          scope: 'incremental',
        },
        facts: [
          {
            identityKey: 'claude-code:daily:v1:UTC:2026-07-08',
            identityVersion: 1,
            sourceKey: 'claude-code',
            usageDate: '2026-07-08',
            aggregationTimezone: 'UTC',
            totalTokens: 100,
            cost: { status: 'unavailable', kind: 'unknown' },
            dataQuality: 'complete',
            recordState: 'active',
            firstSeenAt: '2026-07-08T10:00:00.000Z',
            lastSeenAt: '2026-07-08T12:00:00.000Z',
            removedAt: null,
            models: [],
          },
        ],
      })
      .expect(200);

    const after = await request(baseUrl)
      .get('/v1/sync/status')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const afterData = getBodyData(after.body);
    expect(typeof afterData.lastSyncAt).toBe('string');
    expect(afterData.lastSyncAt).not.toBeNull();

    const devicesAfter = afterData.devices as Array<Record<string, unknown>>;
    const pushed = devicesAfter.find((d) => d.clientDeviceId === devA);
    const never = devicesAfter.find((d) => d.clientDeviceId === devB);
    expect(pushed?.lastSyncAt).toBe(afterData.lastSyncAt);
    expect(pushed?.lastClientRevision).toBe(7);
    expect(never?.lastSyncAt).toBeNull();
    expect(never?.lastClientRevision).toBeNull();

    // Newer activity first when one has lastSyncAt
    expect(devicesAfter[0]?.clientDeviceId).toBe(devA);
  });

  it('requires authentication', async () => {
    await request(baseUrl).get('/v1/sync/status').expect(401);
  });
});
