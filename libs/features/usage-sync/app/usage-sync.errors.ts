import type { ErrorCode } from '../../../shared/error-codes';
import type { SyncErrorCode } from './usage-sync.error-codes';

export type UsageSyncIssue = Readonly<{ field?: string; message: string }>;

export type UsageSyncErrorCodeValue = SyncErrorCode | ErrorCode;

export class UsageSyncError extends Error {
  readonly status: number;
  readonly code: UsageSyncErrorCodeValue;
  readonly issues?: ReadonlyArray<UsageSyncIssue>;

  constructor(params: {
    status: number;
    code: UsageSyncErrorCodeValue;
    message?: string;
    issues?: ReadonlyArray<UsageSyncIssue>;
  }) {
    super(params.message ?? params.code);
    this.status = params.status;
    this.code = params.code;
    this.issues = params.issues;
  }
}
