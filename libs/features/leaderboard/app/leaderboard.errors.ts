import type { ErrorCode } from '../../../shared/error-codes';

export type LeaderboardIssue = Readonly<{ field?: string; message: string }>;

export class LeaderboardError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly issues?: ReadonlyArray<LeaderboardIssue>;
  readonly retryAfterSeconds?: number;

  constructor(params: {
    status: number;
    code: ErrorCode;
    message?: string;
    issues?: ReadonlyArray<LeaderboardIssue>;
    retryAfterSeconds?: number;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}
