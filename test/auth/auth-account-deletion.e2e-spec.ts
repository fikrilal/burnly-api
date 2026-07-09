import request from 'supertest';

import {
  USERS_SEND_ACCOUNT_DELETION_REMINDER_EMAIL_JOB,
  USERS_SEND_ACCOUNT_DELETION_REQUESTED_EMAIL_JOB,
} from '../../libs/features/users/infra/jobs/user-account-deletion-email.job';
import {
  describeAuthE2eSuite,
  getBodyData,
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
});
