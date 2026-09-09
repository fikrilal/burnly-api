# Auth Session Sliding Window Expiration on Refresh

Date: 2026-09-08  
Owner: Antigravity  
Status: complete  
Risk class: high  
Related issue/PR: \_WIP/auth-session-sliding-expiry-handoff.md

## Objective

Convert refresh token rotation in `POST /v1/auth/refresh` from an absolute 30-day window to a sliding session expiration window. When a client successfully refreshes their session, both the newly issued `RefreshToken.expiresAt` and the parent `Session.expiresAt` are extended by `refreshTokenTtlSeconds` (30 days from the refresh timestamp). Inactive sessions (no refresh for 30 consecutive days) continue to expire naturally.

## Constraints

- Architecture constraints: Enforce layering rules (`infra` -> `app` -> `domain`). No circular dependencies or shortcut imports.
- Type safety: Strict TypeScript, no `any` / `as any`, no type silencing with `as`.
- Time hygiene: Time calculations must use `Clock` (`libs/shared/time.ts` / `sessionExpiresAtFrom`). No ad-hoc `Date.now()` or `new Date()`.
- Security invariants: Single-use token rotation and reuse detection (which invalidates the entire session) must remain fully intact. Access token lifetime (15 min) unchanged.
- DB schema: No migrations or schema changes needed as `Session.expiresAt` and `RefreshToken.expiresAt` already exist in `prisma/schema.prisma`.
- Out of scope: Changes to desktop handoff code exchange TTL or password login policies.

## Impact Areas

- API/OpenAPI: no (HTTP endpoint response schemas unchanged)
- DB/Prisma/migrations: no (fields already present)
- Auth/session: yes (high risk)
- Queue/jobs: no
- Env/config/secrets: no
- Observability/logging/tracing: no
- External integrations: no
- CI/release/harness: no

## Acceptance Criteria

1. `AuthRepository.rotateRefreshToken` port signature accepts `newExpiresAt: Date`.
2. In `AuthSessionLifecycleService.refresh(input)`, `newExpiresAt` is calculated using `sessionExpiresAtFrom(now, this.config.refreshTokenTtlSeconds)` and passed to `rotateRefreshToken`.
3. In `prisma-auth.repository.refresh-tokens.ts`: `rotateRefreshToken` sets `expiresAt: newExpiresAt` on the replacement token, updates `session.expiresAt: newExpiresAt` and `session.lastSeenAt: now`, and returns `{ kind: 'ok', sessionId, user, sessionExpiresAt: newExpiresAt }`.
4. Inactivity expiration is preserved: if `now >= existing.expiresAt` or `now >= existing.session.expiresAt`, refresh fails with `AUTH_REFRESH_TOKEN_EXPIRED`.
5. Mock implementations in unit tests (`auth.service.deleted-user.spec.ts`, `auth.service.oidc.spec.ts`, `auth-desktop-handoff.service.spec.ts`) are updated to match new signature.
6. Dedicated unit test suite added for `AuthSessionLifecycleService` (`libs/features/auth/app/auth-session-lifecycle.service.spec.ts`) asserting sliding expiration calculation and lifecycle behaviors.
7. Dedicated repository unit test suite added (`libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.spec.ts`) verifying Prisma transaction updates for sliding window.
8. Standards documentation (`docs/standards/authentication.md`, `docs/adr/0010-refresh-tokens-opaque-rotation.md`) updated to document sliding window expiration.
9. Mechanical quality gates (`npm run typecheck`, `npm run lint`, `npm run deps:check`, `npm test`, `npm run verify`) pass.

## Implementation Checklist

- [x] Update `AuthRepository` port interface (`libs/features/auth/app/ports/auth.repository.ts`).
- [x] Update `PrismaAuthRepository` wrapper (`libs/features/auth/infra/persistence/prisma-auth.repository.ts`).
- [x] Update `AuthSessionLifecycleService.refresh` to compute and pass `newExpiresAt` (`libs/features/auth/app/auth-session-lifecycle.service.ts`).
- [x] Update `rotateRefreshToken` in `libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts`.
- [x] Update mock repos in specs (`auth.service.deleted-user.spec.ts`, `auth.service.oidc.spec.ts`, `auth-desktop-handoff.service.spec.ts`).
- [x] Add unit tests in `libs/features/auth/app/auth-session-lifecycle.service.spec.ts`.
- [x] Add unit tests in `libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.spec.ts`.
- [x] Add e2e test case in `test/auth/auth-core.e2e-spec.ts`.
- [x] Update documentation (`docs/standards/authentication.md`, `docs/adr/0010-refresh-tokens-opaque-rotation.md`).
- [x] Run full mechanical verification suite.

## Decision Log

- 2026-09-08: Adopt sliding expiration on refresh (`newExpiresAt = now + refreshTokenTtlSeconds`). Extends both replacement `RefreshToken` and parent `Session` to prevent active users from hitting abrupt 30-day expirations.

## Verification

```bash
# Typecheck
npm run typecheck (pass)

# Linting
npm run lint (pass)

# Architecture & dependency boundaries
npm run deps:check (pass: 369 modules, 893 dependencies cruised, 0 violations)

# Unit & integration test suites
npm test (pass: 76 passed, 76 total, 382 tests passed)

# Full local gate
npm run verify (pass: format:check, lint, typecheck, verify:env, deps:check, test, openapi:check, openapi:lint)
```

## Risks And Mitigations

- Risk: Refresh token reuse detection or racing could be affected.
  - Mitigation: Transaction structure and optimistic concurrency check (`updated.count !== 1` throwing `RefreshTokenAlreadyUsedError`) remain unchanged, with race handling intact.
- Risk: Session expiry drifting out of sync with refresh token expiry.
  - Mitigation: Both `RefreshToken.expiresAt` and `Session.expiresAt` are updated atomically in the same database transaction.

## Completion Notes

Successfully migrated session refresh to a sliding expiration window. Both `Session.expiresAt` and replacement `RefreshToken.expiresAt` are extended by `refreshTokenTtlSeconds` (30 days) on each successful `POST /v1/auth/refresh`. Inactivity expiration (30 days without refresh), reuse detection, single-use token rotation, and 15-minute access tokens remain strictly enforced. 19 new unit tests and 1 e2e test added; all 76 test suites (382 tests) and full verification gate pass cleanly.

## Follow-Ups

- None.
