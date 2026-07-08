import request from 'supertest';
import {
  describeAuthE2eSuite,
  getBodyData,
  getStringField,
  uniqueEmail,
  type AuthE2eHarness,
} from './auth/auth-e2e.harness';

describeAuthE2eSuite('Usage Sync Devices (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = harness.baseUrl();
  });

  async function registerAndGetAccessToken(): Promise<string> {
    const email = uniqueEmail('sync-device');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({
        email,
        password,
        deviceId: 'auth-device-1',
        deviceName: 'Auth Device',
      })
      .expect(200);

    const data = getBodyData(registerRes.body);
    return getStringField(data, 'accessToken');
  }

  it('PUT then GET device; second PUT updates metadata', async () => {
    const accessToken = await registerAndGetAccessToken();
    const clientDeviceId = 'sync-client-dev-1';

    const putRes = await request(baseUrl)
      .put(`/v1/sync/devices/${clientDeviceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        displayName: 'fikri-laptop',
        platform: 'linux',
        appVersion: '0.1.20',
        reportingTimezone: 'Asia/Jakarta',
      })
      .expect(200);

    const created = getBodyData(putRes.body);
    expect(getStringField(created, 'clientDeviceId')).toBe(clientDeviceId);
    expect(created.displayName).toBe('fikri-laptop');
    expect(created.platform).toBe('linux');
    expect(created.appVersion).toBe('0.1.20');
    expect(created.reportingTimezone).toBe('Asia/Jakarta');
    expect(created.lastSyncAt).toBeNull();
    expect(typeof created.createdAt).toBe('string');
    expect(typeof created.updatedAt).toBe('string');

    const getRes = await request(baseUrl)
      .get(`/v1/sync/devices/${clientDeviceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const fetched = getBodyData(getRes.body);
    expect(fetched).toMatchObject({
      clientDeviceId,
      displayName: 'fikri-laptop',
      platform: 'linux',
      appVersion: '0.1.20',
      reportingTimezone: 'Asia/Jakarta',
      lastSyncAt: null,
    });

    const put2 = await request(baseUrl)
      .put(`/v1/sync/devices/${clientDeviceId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        displayName: 'fikri-laptop-2',
        platform: 'linux',
        appVersion: '0.1.21',
        reportingTimezone: 'UTC',
      })
      .expect(200);

    const updated = getBodyData(put2.body);
    expect(updated.displayName).toBe('fikri-laptop-2');
    expect(updated.appVersion).toBe('0.1.21');
    expect(updated.reportingTimezone).toBe('UTC');
  });

  it('GET missing device returns SYNC_DEVICE_NOT_FOUND', async () => {
    const accessToken = await registerAndGetAccessToken();

    const res = await request(baseUrl)
      .get('/v1/sync/devices/does-not-exist')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      status: 404,
      code: 'SYNC_DEVICE_NOT_FOUND',
    });
  });

  it('rejects unauthenticated requests', async () => {
    await request(baseUrl)
      .put('/v1/sync/devices/dev-1')
      .send({
        platform: 'linux',
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
      })
      .expect(401);

    await request(baseUrl).get('/v1/sync/devices/dev-1').expect(401);
  });

  it('rejects invalid body with VALIDATION_FAILED', async () => {
    const accessToken = await registerAndGetAccessToken();

    const res = await request(baseUrl)
      .put('/v1/sync/devices/dev-1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        platform: 'beos',
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
      })
      .expect(400);

    expect(res.body).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
  });
});
