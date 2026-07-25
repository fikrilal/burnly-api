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

function utcToday(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function factForDate(params: {
  sourceKey: string;
  date: string;
  totalTokens: number;
  models?: Array<{ rawModelId: string | null; totalTokens: number }>;
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

describeAuthE2eSuite('Leaderboard (e2e)', (harness: AuthE2eHarness) => {
  let baseUrl = '';

  beforeEach(() => {
    baseUrl = harness.baseUrl();
  });

  async function registerUser(prefix: string): Promise<{
    accessToken: string;
    userId: string;
    clientDeviceId: string;
  }> {
    const clientDeviceId = `dev-${randomUUID()}`;
    const res = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({
        email: uniqueEmail(prefix),
        password: 'correct-horse-battery-staple',
        deviceId: clientDeviceId,
        deviceName: 'Test Device',
      })
      .expect(200);

    const data = getBodyData(res.body);
    const accessToken = getStringField(data, 'accessToken');
    const user = getObjectField(data, 'user');
    const userId = getStringField(user, 'id');

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

    return { accessToken, userId, clientDeviceId };
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

  it('GET /v1/leaderboard is public and returns empty board', async () => {
    const res = await request(baseUrl).get('/v1/leaderboard').query({ window: '7d' }).expect(200);

    const data = getBodyData(res.body);
    expect(data.window).toBe('7d');
    expect(data.metric).toBe('tokens');
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.viewer).toBeUndefined();
  });

  it('rejects invalid window', async () => {
    const res = await request(baseUrl).get('/v1/leaderboard').query({ window: '1d' }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
  });

  it('me defaults leaderboard off; opt-in toggle works', async () => {
    const { accessToken } = await registerUser('lbme');

    const me1 = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getObjectField(getBodyData(me1.body), 'leaderboard')).toEqual({
      optIn: false,
      optedInAt: null,
    });

    const me2 = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ leaderboard: { optIn: true } })
      .expect(200);

    const lb = getObjectField(getBodyData(me2.body), 'leaderboard');
    expect(lb.optIn).toBe(true);
    expect(typeof lb.optedInAt).toBe('string');

    const me3 = await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ leaderboard: { optIn: false } })
      .expect(200);

    expect(getObjectField(getBodyData(me3.body), 'leaderboard')).toEqual({
      optIn: false,
      optedInAt: null,
    });
  });

  it('lists only opted-in users with score; opt-out removes; viewer statuses', async () => {
    const today = utcToday();
    const a = await registerUser('lba');
    const b = await registerUser('lbb');
    const c = await registerUser('lbc');

    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({
        profile: {
          displayName: 'Alice',
          githubUrl: 'alice',
          websiteUrl: 'alice.example.com',
        },
        leaderboard: { optIn: true },
      })
      .expect(200);

    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ profile: { displayName: 'Bob' }, leaderboard: { optIn: true } })
      .expect(200);

    // C opted out (default) with high usage — must not appear
    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${c.accessToken}`)
      .send({ profile: { displayName: 'Carol' } })
      .expect(200);

    await push(
      a.accessToken,
      a.clientDeviceId,
      [
        factForDate({
          sourceKey: 'claude-code',
          date: today,
          totalTokens: 100_000_000,
          models: [{ rawModelId: 'sonnet', totalTokens: 100_000_000 }],
        }),
      ],
      1,
    ).expect(200);

    await push(
      b.accessToken,
      b.clientDeviceId,
      [
        factForDate({
          sourceKey: 'codex',
          date: today,
          totalTokens: 90_000_000,
          models: [{ rawModelId: 'gpt', totalTokens: 90_000_000 }],
        }),
      ],
      1,
    ).expect(200);

    await push(
      c.accessToken,
      c.clientDeviceId,
      [factForDate({ sourceKey: 'claude-code', date: today, totalTokens: 999_999_999 })],
      1,
    ).expect(200);

    const anon = await request(baseUrl).get('/v1/leaderboard').query({ window: '7d' }).expect(200);

    const entries = getObjectArrayField(getBodyData(anon.body), 'entries');
    const ids = entries.map((e) => getStringField(e, 'userId'));
    expect(ids).toContain(a.userId);
    expect(ids).toContain(b.userId);
    expect(ids).not.toContain(c.userId);

    const aliceEntry = entries.find((e) => getStringField(e, 'userId') === a.userId);
    expect(aliceEntry).toBeDefined();
    expect(getStringField(aliceEntry ?? {}, 'displayName')).toBe('Alice');
    expect(getStringField(aliceEntry ?? {}, 'githubUrl')).toBe('https://github.com/alice');
    expect(getStringField(aliceEntry ?? {}, 'websiteUrl')).toBe('https://alice.example.com');

    const bobEntry = entries.find((e) => getStringField(e, 'userId') === b.userId);
    expect(bobEntry).toBeDefined();
    expect(getStringField(bobEntry ?? {}, 'displayName')).toBe('Bob');
    expect(bobEntry?.githubUrl).toBeNull();
    expect(bobEntry?.websiteUrl).toBeNull();

    // No email field on entries
    for (const e of entries) {
      expect(Object.prototype.hasOwnProperty.call(e, 'email')).toBe(false);
    }

    // Viewer ranked for Alice
    const withViewer = await request(baseUrl)
      .get('/v1/leaderboard')
      .query({ window: '7d' })
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    const viewer = getObjectField(getBodyData(withViewer.body), 'viewer');
    expect(viewer.status).toBe('ranked');
    const viewerEntry = getObjectField(viewer, 'entry');
    expect(viewerEntry.rank).toBe(1);
    expect(getStringField(viewerEntry, 'githubUrl')).toBe('https://github.com/alice');
    expect(getStringField(viewerEntry, 'websiteUrl')).toBe('https://alice.example.com');

    // Invalid token still 200, no viewer
    const badToken = await request(baseUrl)
      .get('/v1/leaderboard')
      .query({ window: '7d' })
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(200);
    expect(getBodyData(badToken.body).viewer).toBeUndefined();

    // Opt-out Alice
    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ leaderboard: { optIn: false } })
      .expect(200);

    const afterOptOut = await request(baseUrl)
      .get('/v1/leaderboard')
      .query({ window: '7d' })
      .expect(200);

    const afterIds = getObjectArrayField(getBodyData(afterOptOut.body), 'entries').map((e) =>
      getStringField(e, 'userId'),
    );
    expect(afterIds).not.toContain(a.userId);
    expect(afterIds).toContain(b.userId);

    const viewerOut = await request(baseUrl)
      .get('/v1/leaderboard')
      .query({ window: '7d' })
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);
    expect(getObjectField(getBodyData(viewerOut.body), 'viewer')).toEqual({
      status: 'opted_out',
    });
  });

  it('viewer no_activity when opted in with zero score', async () => {
    const { accessToken } = await registerUser('lbzero');
    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ leaderboard: { optIn: true } })
      .expect(200);

    const res = await request(baseUrl)
      .get('/v1/leaderboard')
      .query({ window: 'all' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getObjectField(getBodyData(res.body), 'viewer')).toEqual({
      status: 'no_activity',
    });
  });
});
