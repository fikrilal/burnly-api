# Backend Handoff: Sliding Session Expiration on Refresh

## Status

**Ready for Implementation** (Drafted 2026-09-08).

Target Repository: [`burnly-api`](file:///home/fikrilal/devs/personal/burnly-api)  
Originating Client Proposal: [`/home/fikrilal/devs/personal/burnly/docs/planning/_WIP/auth-session-sliding-expiry-and-desktop-recovery-proposal.md`](file:///home/fikrilal/devs/personal/burnly/docs/planning/_WIP/auth-session-sliding-expiry-and-desktop-recovery-proposal.md)

---

## 1. Context & Defect Summary

In the Burnly desktop app, active daily users encounter unexpected session expiration:

```text
Cloud upload: session refresh failed (AUTH_REFRESH_TOKEN_EXPIRED)
```

Even though users actively open and run the app daily (refreshed multiple times per day), after 30 calendar days from initial sign-in, the session is terminated.

### Root Cause in `burnly-api`

In [`prisma-auth.repository.refresh-tokens.ts`](file:///home/fikrilal/devs/personal/burnly-api/libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts#L137-L163):

1. When rotating a refresh token, `rotateRefreshToken` creates the new token with:
   ```typescript
   const next = await tx.refreshToken.create({
     data: {
       tokenHash: newTokenHash,
       expiresAt: existing.expiresAt, // <-- Inherits previous token's expiry!
       sessionId,
     },
     select: { id: true },
   });
   ```
2. In the same transaction, `tx.session.update` updates `lastSeenAt: now`, but **leaves `session.expiresAt` unchanged**.
3. Therefore, sessions in `burnly-api` currently have an **absolute 30-day lifetime** from initial sign-in, rather than a **sliding window based on activity**.

---

## 2. Requirements

Convert refresh token rotation to a **sliding session expiration window**:

1. **Extend Expiry on Refresh**: Every successful call to `POST /v1/auth/refresh` must extend both `session.expiresAt` and the replacement `refreshToken.expiresAt` by `this.config.refreshTokenTtlSeconds` (30 days from the refresh timestamp).
2. **Inactivity Expiration**: Sessions without any activity/refresh for 30 consecutive days must continue to expire naturally.
3. **Preserve Security Invariants**:
   - Single-use token rotation and reuse detection (which triggers whole-session revocation) must remain intact.
   - Access token lifetime remains 15 minutes (900 seconds).
   - Time handling must strictly use `Clock` (no ad-hoc `new Date()` or `Date.now()`).

---

## 3. Implementation Plan

### A. Port & Interface Updates

1. **`AuthRepository` Port** ([`libs/features/auth/app/ports/auth.repository.ts`](file:///home/fikrilal/devs/personal/burnly-api/libs/features/auth/app/ports/auth.repository.ts#L188-L193)):
   Update `rotateRefreshToken` to receive the new target expiration date:

   ```typescript
   rotateRefreshToken(
     tokenHash: string,
     newTokenHash: string,
     now: Date,
     newExpiresAt: Date,
     session?: SessionSeenMetadata,
   ): Promise<RefreshRotationResult>;
   ```

2. **`PrismaAuthRepository` Wrapper** ([`libs/features/auth/infra/persistence/prisma-auth.repository.ts`](file:///home/fikrilal/devs/personal/burnly-api/libs/features/auth/infra/persistence/prisma-auth.repository.ts#L183-L190)):
   Pass `newExpiresAt` through to `rotateRefreshTokenImpl`.

### B. Application Service Changes

1. **`AuthSessionLifecycleService.refreshSession`** ([`libs/features/auth/app/auth-session-lifecycle.service.ts`](file:///home/fikrilal/devs/personal/burnly-api/libs/features/auth/app/auth-session-lifecycle.service.ts#L95-L101)):
   Calculate `newExpiresAt` using the existing helper `sessionExpiresAtFrom` and `this.config.refreshTokenTtlSeconds`:

   ```typescript
   const newExpiresAt = sessionExpiresAtFrom(now, this.config.refreshTokenTtlSeconds);

   const rotation = await this.repo.rotateRefreshToken(currentHash, nextHash, now, newExpiresAt, {
     ip: input.ip,
     userAgent: input.userAgent,
   });
   ```

### C. Persistence Adapter Changes

1. **`rotateRefreshTokenImpl`** ([`libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts`](file:///home/fikrilal/devs/personal/burnly-api/libs/features/auth/infra/persistence/prisma-auth.repository.refresh-tokens.ts#L136-L164)):
   Update the transaction to persist `newExpiresAt` to both the new token and the parent session:

   ```typescript
   await prisma.transaction(async (tx) => {
     const next = await tx.refreshToken.create({
       data: {
         tokenHash: newTokenHash,
         expiresAt: newExpiresAt, // Sliding window extension
         sessionId,
       },
       select: { id: true },
     });

     const updated = await tx.refreshToken.updateMany({
       where: { id: existing.id, revokedAt: null, replacedById: null },
       data: { revokedAt: now, replacedById: next.id },
     });

     if (updated.count !== 1) {
       throw new RefreshTokenAlreadyUsedError();
     }

     await tx.session.update({
       where: { id: sessionId },
       data: {
         lastSeenAt: now,
         expiresAt: newExpiresAt, // Sliding window extension
         ...(session && session.ip !== undefined ? { ip: session.ip } : {}),
         ...(session && session.userAgent !== undefined ? { userAgent: session.userAgent } : {}),
       },
       select: { id: true },
     });
   });
   ```

### D. Test Updates

1. **Mock Repositories in Specs**:
   Update mock implementations of `rotateRefreshToken` in:
   - `libs/features/auth/app/auth.service.deleted-user.spec.ts`
   - `libs/features/auth/app/auth-desktop-handoff.service.spec.ts`
   - `libs/features/auth/app/auth.service.oidc.spec.ts`
2. **Behavioral Spec for Lifecycle Service**:
   Add a unit test in `libs/features/auth/app/auth-session-lifecycle.service.spec.ts` (or create if missing) asserting:
   - When `refreshSession` succeeds, `rotateRefreshToken` receives `newExpiresAt = now + refreshTokenTtlSeconds`.
3. **Repository Integration Tests**:
   Add / update tests in `prisma-auth.repository.*.spec.ts` to verify that after rotation:
   - The newly created `RefreshToken` record has `expiresAt === newExpiresAt`.
   - The associated `Session` record has `expiresAt === newExpiresAt` and `lastSeenAt === now`.

### E. Documentation & Standards

1. Update `docs/standards/authentication.md` (and ADR 0010 `docs/adr/0010-refresh-tokens-opaque-rotation.md` if necessary) to specify that refresh token rotation uses sliding window expiration (30 days from last activity).

---

## 4. Verification Checklist

Follow `burnly-api` conventions from `AGENTS.md`:

- [ ] TypeScript strict check passes (no `any`, no `as` silencing): `npm run typecheck`
- [ ] Boundary rules & lint pass: `npm run lint` && `npm run deps:check`
- [ ] Unit & integration tests pass: `npm test`
- [ ] Full local gate passes: `npm run verify`
