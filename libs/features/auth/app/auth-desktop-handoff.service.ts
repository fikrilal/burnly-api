import { AuthErrorCode } from './auth.error-codes';
import { AuthError } from './auth.errors';
import type { AuthRepository } from './ports/auth.repository';
import type { DesktopHandoffStore } from './ports/desktop-handoff.store';
import type { DesktopHandoffRateLimiter } from './ports/desktop-handoff-rate-limiter';
import type { AuthSessionLifecycleService } from './auth-session-lifecycle.service';
import type { AuthResult, AuthUserRecord } from './auth.types';
import type { Clock } from './time';
import type { AuthConfig } from './auth.config';
import {
  generateDesktopHandoffCode,
  hashDesktopHandoffCode,
  isValidPkceChallenge,
  isValidPkceVerifier,
  verifyPkceS256,
} from '../domain/pkce';
import {
  isAllowedDesktopRedirectUri,
  parseDesktopRedirectUriAllowlist,
} from '../domain/desktop-redirect-uri';
import { assertUserIsNotSuspended, requireExistingNonDeletedUser } from './auth.service.helpers';

export type CreateDesktopHandoffResult = Readonly<{
  code: string;
  expiresIn: number;
  redirectUri: string;
  state: string;
}>;

function rejectInvalidHandoff(): never {
  throw new AuthError({
    status: 401,
    code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID,
    message: 'Invalid handoff',
  });
}

/**
 * Ensures the user may receive a desktop session.
 * DELETED is treated like a failed handoff (no account-state leak on public exchange).
 * SUSPENDED keeps AUTH_USER_SUSPENDED for product messaging on create (Bearer path).
 */
function assertUserMayReceiveDesktopSession(
  user: AuthUserRecord,
  mode: 'create' | 'exchange',
): void {
  if (user.status === 'DELETED') {
    if (mode === 'create') {
      throw new AuthError({
        status: 401,
        code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID,
        message: 'Invalid handoff',
      });
    }
    rejectInvalidHandoff();
  }
  assertUserIsNotSuspended(user);
}

export class AuthDesktopHandoffService {
  private readonly redirectAllowlist: ReadonlyArray<string>;

  constructor(
    private readonly repo: AuthRepository,
    private readonly handoffStore: DesktopHandoffStore,
    private readonly rateLimiter: DesktopHandoffRateLimiter,
    private readonly sessions: AuthSessionLifecycleService,
    private readonly clock: Clock,
    private readonly config: AuthConfig,
  ) {
    this.redirectAllowlist = parseDesktopRedirectUriAllowlist(this.config.desktopRedirectUrisRaw);
  }

  /**
   * Web (Bearer) creates a one-time code after browser login.
   */
  async createHandoff(input: {
    userId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
    state: string;
    client: 'desktop';
    ip?: string;
  }): Promise<CreateDesktopHandoffResult> {
    await this.rateLimiter.assertAllowed({ userId: input.userId, ip: input.ip });

    if (input.codeChallengeMethod !== 'S256') {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID,
        message: 'Only S256 PKCE is supported',
      });
    }

    if (!isValidPkceChallenge(input.codeChallenge)) {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID,
        message: 'Invalid code_challenge',
        issues: [{ field: 'codeChallenge', message: 'invalid PKCE S256 challenge' }],
      });
    }

    if (input.state.length < 8 || input.state.length > 256) {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID,
        message: 'Invalid state',
        issues: [{ field: 'state', message: 'must be 8-256 characters' }],
      });
    }

    if (!isAllowedDesktopRedirectUri(input.redirectUri, this.redirectAllowlist)) {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_DESKTOP_REDIRECT_URI_INVALID,
        message: 'redirect_uri is not allowed',
        issues: [{ field: 'redirectUri', message: 'not on allowlist' }],
      });
    }

    const user = await requireExistingNonDeletedUser(this.repo, input.userId);
    assertUserIsNotSuspended(user);

    const code = generateDesktopHandoffCode();
    const codeHash = hashDesktopHandoffCode(code);
    const ttlSeconds = this.config.desktopHandoffTtlSeconds;
    const now = this.clock.now();

    const saved = await this.handoffStore.save(
      codeHash,
      {
        userId: user.id,
        codeChallenge: input.codeChallenge,
        redirectUri: input.redirectUri,
        client: 'desktop',
        createdAtMs: now.getTime(),
      },
      ttlSeconds,
    );

    if (!saved) {
      throw new AuthError({
        status: 503,
        code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_UNAVAILABLE,
        message: 'Desktop handoff store unavailable',
      });
    }

    return {
      code,
      expiresIn: ttlSeconds,
      redirectUri: input.redirectUri,
      state: input.state,
    };
  }

  /**
   * Desktop exchanges code + PKCE verifier for a new first-party session.
   *
   * Note: the handoff code is consumed (GETDEL) before session minting so concurrent
   * exchanges cannot mint twice. If minting fails after a successful PKCE verify,
   * the client must restart the browser login flow (code cannot be replayed).
   */
  async exchangeToken(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
    client: 'desktop';
    deviceId?: string;
    deviceName?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<AuthResult> {
    await this.rateLimiter.assertAllowed({ ip: input.ip });

    if (input.client !== 'desktop') {
      throw new AuthError({
        status: 400,
        code: AuthErrorCode.AUTH_DESKTOP_HANDOFF_INVALID,
        message: 'Invalid client',
      });
    }

    if (!isValidPkceVerifier(input.codeVerifier)) {
      rejectInvalidHandoff();
    }

    if (!isAllowedDesktopRedirectUri(input.redirectUri, this.redirectAllowlist)) {
      rejectInvalidHandoff();
    }

    if (input.code.length < 16 || input.code.length > 256) {
      rejectInvalidHandoff();
    }

    const codeHash = hashDesktopHandoffCode(input.code);
    const record = await this.handoffStore.consume(codeHash);
    if (!record) {
      rejectInvalidHandoff();
    }

    if (record.redirectUri !== input.redirectUri) {
      rejectInvalidHandoff();
    }

    if (!verifyPkceS256(input.codeVerifier, record.codeChallenge)) {
      rejectInvalidHandoff();
    }

    const user = await this.repo.findUserById(record.userId);
    if (!user) {
      rejectInvalidHandoff();
    }
    assertUserMayReceiveDesktopSession(user, 'exchange');

    const authMethods = await this.repo.getAuthMethods(user.id);
    const now = this.clock.now();

    return await this.sessions.issueTokensForNewSession(user, authMethods, {
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      ip: input.ip,
      userAgent: input.userAgent,
      now,
    });
  }
}
