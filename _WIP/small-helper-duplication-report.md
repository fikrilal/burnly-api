# Duplication Report (small-helpers)

Generated: 2026-07-09T14:24:02.168Z
Raw report: .tmp/jscpd-small-helpers/jscpd-report.json
Allowlist: tools/small-helper-duplication-allowlist.json

## Summary

- Raw duplicates: 264
- Self-file filtered out: 115
- Cross-file duplicates: 149
- Categorized duplicates: 102
- Uncategorized filtered out: 47
- Reviewed acceptable groups: 0
- Actionable duplicate groups: 76
- Unused allowlist entries: 0

## Actionable Category Breakdown

- Cursor/filter/sort helper: 16
- Date/time parsing or normalization helper: 12
- DTO/view mapper: 8
- Error/problem mapping: 4
- Prisma query builder: 8
- Queue job envelope/idempotency helper: 13
- Rate limiter helper: 7
- Request trace fallback: 6
- Transaction retry helper: 2

## Actionable Groups

- [Cursor/filter/sort helper] libs/platform/http/list-query/api-list-query.decorator.ts:42 <> libs/shared/list-query/sort.ts:19
  occurrences=1, maxLines=11, maxTokens=0
- [Cursor/filter/sort helper] libs/shared/list-query/filter.ts:20 <> libs/shared/list-query/sort.ts:19
  occurrences=1, maxLines=11, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/http/list-query/list-query.pipe.ts:16 <> libs/shared/list-query/list-query.ts:15
  occurrences=1, maxLines=9, maxTokens=0
- [Cursor/filter/sort helper] libs/shared/list-query/cursor.ts:26 <> libs/shared/list-query/sort.ts:22
  occurrences=1, maxLines=8, maxTokens=0
- [Cursor/filter/sort helper] libs/features/auth/infra/persistence/prisma-auth.repository.prisma-errors.ts:1 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/features/users/infra/http/dtos/me.dto.ts:20 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/config/env.validation.ts:12 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/http/fastify-adapter.ts:20 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/http/idempotency/idempotency.core.ts:34 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/push/fcm-push.service.ts:18 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/storage/object-storage.service.ts:18 <> libs/platform/http/list-query/list-query.pipe.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/http/fastify-adapter.ts:38 <> libs/shared/list-query/scalars.ts:10
  occurrences=1, maxLines=6, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/auth/auth.utils.ts:7 <> libs/shared/list-query/object.ts:1
  occurrences=1, maxLines=5, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/email/email.service.ts:23 <> libs/platform/http/list-query/list-query.pipe.ts:24
  occurrences=1, maxLines=5, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/http/list-query/api-list-query.decorator.ts:41 <> libs/shared/list-query/filter.ts:6
  occurrences=1, maxLines=5, maxTokens=0
- [Cursor/filter/sort helper] libs/platform/http/list-query/api-list-query.decorator.ts:11 <> libs/shared/list-query/list-query.ts:15
  occurrences=1, maxLines=5, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/app/auth-password-auth.service.ts:64 <> libs/features/auth/app/auth.service.ts:26
  occurrences=1, maxLines=13, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/infra/persistence/prisma-auth.repository.credentials.ts:52 <> libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:171
  occurrences=2, maxLines=13, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts:201 <> libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:184
  occurrences=2, maxLines=11, maxTokens=0
- [Date/time parsing or normalization helper] libs/platform/config/env.transforms.ts:3 <> libs/platform/http/fastify-adapter.ts:33
  occurrences=1, maxLines=10, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/users/app/ports/profile-image.repository.ts:5 <> libs/features/users/infra/persistence/prisma-profile-image.repository.ts:19
  occurrences=2, maxLines=9, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/app/ports/auth.repository.ts:119 <> libs/features/auth/infra/persistence/prisma-auth.repository.ts:83
  occurrences=5, maxLines=7, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/infra/persistence/prisma-auth.repository.credentials.ts:79 <> libs/features/auth/infra/persistence/prisma-auth.repository.ts:153
  occurrences=1, maxLines=7, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:206 <> libs/features/auth/infra/persistence/prisma-auth.repository.ts:113
  occurrences=1, maxLines=7, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/infra/persistence/prisma-auth.repository.ts:83 <> libs/features/auth/infra/persistence/prisma-auth.repository.users.ts:133
  occurrences=2, maxLines=7, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts:82 <> libs/features/auth/infra/persistence/prisma-auth.repository.ts:184
  occurrences=1, maxLines=6, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/usage-sync/infra/persistence/prisma-daily-usage-facts.repository.ts:209 <> libs/features/usage-sync/infra/persistence/prisma-sync-devices.repository.ts:79
  occurrences=1, maxLines=6, maxTokens=0
- [Date/time parsing or normalization helper] libs/features/usage-sync/app/ports/sync-devices.repository.ts:11 <> libs/features/usage-sync/infra/persistence/prisma-sync-devices.repository.ts:73
  occurrences=1, maxLines=5, maxTokens=0
- [DTO/view mapper] libs/features/auth/infra/http/auth.controller.ts:5 <> libs/features/auth/infra/http/me-sessions.controller.ts:6
  occurrences=1, maxLines=13, maxTokens=0
- [DTO/view mapper] libs/features/auth/infra/http/dtos/auth.dto.ts:9 <> libs/features/users/infra/http/dtos/me.dto.ts:94
  occurrences=2, maxLines=13, maxTokens=0
- [DTO/view mapper] libs/features/auth/infra/http/me-sessions.controller.ts:7 <> libs/features/users/infra/http/profile-image.controller.ts:9
  occurrences=1, maxLines=12, maxTokens=0
- [DTO/view mapper] libs/features/auth/infra/persistence/prisma-auth.repository.mappers.ts:12 <> libs/features/users/infra/persistence/prisma-users.repository.ts:78
  occurrences=1, maxLines=12, maxTokens=0
- [DTO/view mapper] libs/features/auth/app/auth-oidc-auth.service.ts:28 <> libs/features/auth/app/auth.service.ts:38
  occurrences=2, maxLines=11, maxTokens=0
- [DTO/view mapper] libs/features/usage-sync/infra/http/dtos/push-daily-usage.dto.ts:52 <> libs/features/usage-sync/infra/http/dtos/sync-device.dto.ts:22
  occurrences=1, maxLines=7, maxTokens=0
- [DTO/view mapper] libs/platform/health/health.controller.ts:1 <> libs/platform/health/ready.controller.ts:1
  occurrences=1, maxLines=7, maxTokens=0
- [DTO/view mapper] libs/features/auth/infra/http/dtos/me-push-token.dto.ts:22 <> libs/features/users/infra/http/dtos/profile-image.dto.ts:14
  occurrences=1, maxLines=5, maxTokens=0
- [Error/problem mapping] libs/features/usage-sync/infra/http/usage-sync-error.filter.ts:14 <> libs/features/users/infra/http/users-error.filter.ts:26
  occurrences=1, maxLines=12, maxTokens=0
- [Error/problem mapping] libs/features/auth/infra/http/auth-error.filter.ts:1 <> libs/features/usage-sync/infra/http/usage-sync-error.filter.ts:1
  occurrences=2, maxLines=9, maxTokens=0
- [Error/problem mapping] libs/features/users/infra/http/profile-image.controller.ts:45 <> libs/features/users/infra/http/user-account-deletion.controller.ts:13
  occurrences=1, maxLines=8, maxTokens=0
- [Error/problem mapping] libs/platform/http/filters/problem-details.filter.ts:16 <> libs/platform/http/list-query/list-query.pipe.ts:21
  occurrences=1, maxLines=8, maxTokens=0
- [Prisma query builder] libs/platform/db/prisma.service.ts:37 <> libs/platform/redis/redis.service.ts:120
  occurrences=2, maxLines=8, maxTokens=0
- [Prisma query builder] apps/worker/src/jobs/system-smoke.worker.ts:30 <> apps/worker/src/jobs/users-account-deletion.worker.ts:40
  occurrences=1, maxLines=7, maxTokens=0
- [Prisma query builder] libs/features/users/infra/persistence/prisma-users.repository.ts:165 <> apps/worker/src/jobs/users-account-deletion.handlers.ts:28
  occurrences=1, maxLines=7, maxTokens=0
- [Prisma query builder] libs/features/auth/infra/persistence/prisma-auth.repository.users.ts:82 <> apps/worker/src/jobs/emails.handlers.ts:37
  occurrences=1, maxLines=6, maxTokens=0
- [Prisma query builder] libs/features/users/infra/persistence/prisma-profile-image.repository.ts:52 <> libs/features/users/infra/persistence/prisma-users.repository.ts:109
  occurrences=2, maxLines=6, maxTokens=0
- [Prisma query builder] apps/worker/src/jobs/push.worker.ts:2 <> apps/worker/src/jobs/users-account-deletion.worker.ts:2
  occurrences=1, maxLines=5, maxTokens=0
- [Prisma query builder] libs/features/auth/infra/persistence/prisma-auth.repository.credentials.ts:26 <> libs/features/auth/infra/persistence/prisma-auth.repository.users.ts:283
  occurrences=2, maxLines=5, maxTokens=0
- [Prisma query builder] libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts:196 <> libs/features/auth/infra/persistence/prisma-auth.repository.sessions.ts:291
  occurrences=1, maxLines=5, maxTokens=0
- [Queue job envelope/idempotency helper] libs/platform/queue/queue.producer.ts:15 <> libs/platform/queue/queue.worker.ts:13
  occurrences=4, maxLines=12, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/usage-sync/infra/http/daily-usage.controller.ts:12 <> libs/features/users/infra/http/user-account-deletion.controller.ts:3
  occurrences=1, maxLines=9, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/users/infra/http/me.controller.ts:3 <> libs/features/users/infra/http/user-account-deletion.controller.ts:3
  occurrences=1, maxLines=9, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/auth/infra/jobs/auth-email-verification.jobs.ts:14 <> libs/features/users/infra/jobs/user-account-deletion-email.jobs.ts:23
  occurrences=1, maxLines=8, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/usage-sync/infra/persistence/wipe-usage-sync-for-user.ts:26 <> apps/worker/src/jobs/users-account-deletion.contracts.ts:44
  occurrences=1, maxLines=8, maxTokens=0
- [Queue job envelope/idempotency helper] apps/worker/src/jobs/emails.worker.ts:42 <> apps/worker/src/jobs/push.worker.ts:51
  occurrences=1, maxLines=7, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/users/infra/persistence/prisma-profile-image.repository.ts:197 <> apps/worker/src/jobs/users-account-deletion.handlers.ts:172
  occurrences=2, maxLines=7, maxTokens=0
- [Queue job envelope/idempotency helper] libs/platform/auth/access-token.guard.ts:12 <> libs/platform/http/idempotency/idempotency.core.ts:101
  occurrences=1, maxLines=7, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/auth/infra/http/auth.controller.ts:27 <> libs/features/users/infra/http/profile-image.controller.ts:29
  occurrences=1, maxLines=6, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/auth/infra/jobs/auth-email-verification.jobs.ts:21 <> libs/features/auth/infra/jobs/auth-password-reset.jobs.ts:28
  occurrences=2, maxLines=6, maxTokens=0
- [Queue job envelope/idempotency helper] libs/features/users/infra/http/profile-image.controller.ts:30 <> libs/features/users/infra/http/user-account-deletion.controller.ts:7
  occurrences=1, maxLines=5, maxTokens=0
- [Queue job envelope/idempotency helper] libs/platform/auth/access-token-verifier.service.ts:87 <> libs/platform/http/idempotency/idempotency.core.ts:40
  occurrences=1, maxLines=5, maxTokens=0
- [Queue job envelope/idempotency helper] libs/platform/http/idempotency/idempotency.core.ts:27 <> libs/platform/http/idempotency/idempotency.interceptor.ts:49
  occurrences=1, maxLines=5, maxTokens=0
- [Rate limiter helper] libs/features/usage-sync/infra/rate-limit/redis-daily-usage-push-rate-limiter.ts:17 <> libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter.ts:18
  occurrences=2, maxLines=15, maxTokens=0
- [Rate limiter helper] libs/features/auth/infra/rate-limit/redis-email-verification-rate-limiter.ts:2 <> libs/features/auth/infra/rate-limit/redis-password-reset-rate-limiter.ts:3
  occurrences=5, maxLines=10, maxTokens=0
- [Rate limiter helper] libs/features/auth/infra/rate-limit/redis-login-rate-limiter.ts:3 <> libs/features/auth/infra/rate-limit/redis-password-reset-rate-limiter.ts:3
  occurrences=2, maxLines=7, maxTokens=0
- [Rate limiter helper] libs/features/auth/infra/rate-limit/rate-limit.utils.ts:15 <> libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter.ts:14
  occurrences=2, maxLines=6, maxTokens=0
- [Rate limiter helper] libs/features/auth/infra/rate-limit/redis-email-verification-rate-limiter.ts:48 <> libs/platform/http/idempotency/idempotency.service.ts:239
  occurrences=1, maxLines=6, maxTokens=0
- [Rate limiter helper] libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter.ts:55 <> libs/platform/http/idempotency/idempotency.service.ts:239
  occurrences=1, maxLines=6, maxTokens=0
- [Rate limiter helper] libs/features/auth/infra/rate-limit/redis-login-rate-limiter.ts:30 <> libs/platform/http/idempotency/idempotency.service.ts:239
  occurrences=1, maxLines=5, maxTokens=0
- [Request trace fallback] libs/features/users/app/ports/profile-image.repository.ts:30 <> libs/features/users/infra/persistence/prisma-profile-image.repository.ts:43
  occurrences=1, maxLines=10, maxTokens=0
- [Request trace fallback] libs/features/users/app/ports/users.repository.ts:17 <> libs/features/users/infra/persistence/prisma-users.repository.ts:158
  occurrences=1, maxLines=7, maxTokens=0
- [Request trace fallback] libs/features/users/infra/persistence/prisma-profile-image.repository.ts:70 <> libs/features/users/infra/persistence/prisma-users.repository.ts:197
  occurrences=1, maxLines=7, maxTokens=0
- [Request trace fallback] libs/platform/http/request-context.decorator.ts:16 <> libs/platform/http/request-id.ts:15
  occurrences=1, maxLines=6, maxTokens=0
- [Request trace fallback] libs/features/users/infra/http/profile-image.controller.ts:168 <> libs/features/users/infra/http/user-account-deletion.controller.ts:48
  occurrences=1, maxLines=5, maxTokens=0
- [Request trace fallback] libs/platform/auth/access-token.guard.ts:31 <> libs/platform/http/fastify-hooks.ts:7
  occurrences=1, maxLines=5, maxTokens=0
- [Transaction retry helper] libs/features/auth/app/auth.errors.ts:18 <> libs/features/users/app/users.errors.ts:24
  occurrences=1, maxLines=10, maxTokens=0
- [Transaction retry helper] libs/features/usage-sync/app/usage-sync.errors.ts:18 <> libs/features/users/app/users.errors.ts:24
  occurrences=1, maxLines=10, maxTokens=0

## Interpretation

Actionable means the duplicate matched a backend category and has not been reviewed as acceptable.
It does not automatically mean extract immediately; it means review the pattern before adding more parallel code.
Reviewed acceptable duplicates must stay explicit in the allowlist with rationale.
