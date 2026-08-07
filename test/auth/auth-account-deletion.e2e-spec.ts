import request from 'supertest';
import { randomUUID } from 'node:crypto';

import {
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
} from '../../libs/features/users/infra/jobs/user-account-deletion-email.job';
import {
  describeAuthE2eSuite,
  getBodyData,
  getObjectArrayField,
  getObjectField,
  getStringField,
  isObject,
  type AuthE2eHarness,
  uniqueEmail,
} from './auth-e2e.harness';

describeAuthE2eSuite('Auth Account Deletion (e2e)', (harness) => {
  let baseUrl = '';
  let emailQueue: ReturnType<AuthE2eHarness['emailQueue']>;

  beforeEach(() => {
    baseUrl = harness.baseUrl();
    emailQueue = harness.emailQueue();
  });
  it('request account deletion schedules deletion and cancel clears it', async () => {
    const email = uniqueEmail('auth');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);

    await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(204);

    const meAfterRequest = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(200);

    const meAfterRequestData = getBodyData(meAfterRequest.body);
    const userId = getStringField(meAfterRequestData, 'id');

    const emailJobsAfterRequest = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const deletionRequestedEmail = emailJobsAfterRequest.find(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );
    const deletionReminderEmail = emailJobsAfterRequest.find(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );

    expect(deletionRequestedEmail).toBeDefined();
    expect(deletionReminderEmail).toBeDefined();

    const accountDeletion = getObjectField(meAfterRequestData, 'accountDeletion');
    expect(accountDeletion).toBeDefined();
    expect(accountDeletion).toMatchObject({
      requestedAt: expect.any(String),
      scheduledFor: expect.any(String),
    });

    const requestedAt = new Date(getStringField(accountDeletion, 'requestedAt'));
    const scheduledFor = new Date(getStringField(accountDeletion, 'scheduledFor'));

    const msInDay = 24 * 60 * 60 * 1000;
    const deltaDays = (scheduledFor.getTime() - requestedAt.getTime()) / msInDay;
    expect(deltaDays).toBeGreaterThan(29.9);
    expect(deltaDays).toBeLessThan(30.1);

    await request(baseUrl)
      .post('/v1/me/account-deletion/cancel')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(204);

    const emailJobsAfterCancel = await emailQueue.getJobs(['waiting', 'delayed'], 0, -1);
    const reminderStillPresent = emailJobsAfterCancel.some(
      (job) =>
        job.name === USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB &&
        isObject(job.data) &&
        job.data.userId === userId,
    );
    expect(reminderStillPresent).toBe(false);

    const meAfterCancel = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${getStringField(reg, 'accessToken')}`)
      .expect(200);

    expect(getBodyData(meAfterCancel.body).accountDeletion).toBeNull();
  });

  it('pending-deletion user disappears from leaderboard and public profile until cancel', async () => {
    const email = uniqueEmail('pending-del');
    const password = 'correct-horse-battery-staple';

    const registerRes = await request(baseUrl)
      .post('/v1/auth/password/register')
      .send({ email, password })
      .expect(200);

    const reg = getBodyData(registerRes.body);
    const accessToken = getStringField(reg, 'accessToken');

    const meRes = await request(baseUrl)
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const meData = getBodyData(meRes.body);
    const userId = getStringField(meData, 'id');

    // Give the user a public username, leaderboard opt-in, and usage.
    const username = email
      .split('@')[0]
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 30);
    await request(baseUrl)
      .patch('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ profile: { username }, leaderboard: { optIn: true } })
      .expect(200);

    const clientDeviceId = `dev-${randomUUID()}`;
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

    const today = new Date().toISOString().slice(0, 10);
    await request(baseUrl)
      .post('/v1/sync/daily-usage')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        contractVersion: 1,
        clientDeviceId,
        appVersion: '0.1.20',
        reportingTimezone: 'UTC',
        clientRevision: 1,
        window: { startDate: today, endDate: today, scope: 'incremental' },
        facts: [
          {
            identityKey: `claude-code:daily:v1:UTC:${today}`,
            identityVersion: 1,
            sourceKey: 'claude-code',
            usageDate: today,
            aggregationTimezone: 'UTC',
            inputTokens: 6_000_000,
            outputTokens: 4_000_000,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 10_000_000,
            unclassifiedTokens: 0,
            cost: { status: 'unavailable', kind: 'unknown' },
            dataQuality: 'complete',
            recordState: 'active',
            firstSeenAt: `${today}T10:00:00.000Z`,
            lastSeenAt: `${today}T12:00:00.000Z`,
            removedAt: null,
            models: [],
          },
        ],
      })
      .expect(200);

    const assertPublicPresence = async (): Promise<void> => {
      const leaderboard = await request(baseUrl)
        .get('/v1/leaderboard')
        .query({ window: 'all' })
        .expect(200);
      const entries = getObjectArrayField(getBodyData(leaderboard.body), 'entries');
      expect(entries.some((e) => getStringField(e, 'userId') === userId)).toBe(true);

      await request(baseUrl).get(`/v1/users/by-username/${username}`).expect(200);
    };

    const assertPublicAbsence = async (): Promise<void> => {
      const leaderboard = await request(baseUrl)
        .get('/v1/leaderboard')
        .query({ window: 'all' })
        .expect(200);
      const entries = getObjectArrayField(getBodyData(leaderboard.body), 'entries');
      expect(entries.some((e) => getStringField(e, 'userId') === userId)).toBe(false);

      await request(baseUrl).get(`/v1/users/by-username/${username}`).expect(404);
    };

    // Baseline: publicly visible.
    await assertPublicPresence();

    // Request deletion: gone from both public surfaces.
    await request(baseUrl)
      .post('/v1/me/account-deletion/request')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await assertPublicAbsence();

    // Private access still works during the grace period.
    await request(baseUrl).get('/v1/me').set('Authorization', `Bearer ${accessToken}`).expect(200);

    // Cancel: public visibility restored.
    await request(baseUrl)
      .post('/v1/me/account-deletion/cancel')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);
    await assertPublicPresence();
  });
});
