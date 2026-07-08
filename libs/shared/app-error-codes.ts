import { AuthErrorCode } from './auth/auth-error-codes';
import { ErrorCode } from './error-codes';
import { SyncErrorCode } from './sync/sync-error-codes';
import { UsersErrorCode } from './users/users-error-codes';

export type AppErrorCode = ErrorCode | AuthErrorCode | UsersErrorCode | SyncErrorCode;

export const APP_ERROR_CODE_VALUES = [
  ...Object.values(ErrorCode),
  ...Object.values(AuthErrorCode),
  ...Object.values(UsersErrorCode),
  ...Object.values(SyncErrorCode),
] as const;

const APP_ERROR_CODE_SET = new Set<string>(APP_ERROR_CODE_VALUES);

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && APP_ERROR_CODE_SET.has(value);
}
