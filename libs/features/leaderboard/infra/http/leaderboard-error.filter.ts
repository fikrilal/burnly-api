import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import {
  applyRetryAfterHeader,
  mapFeatureErrorToProblem,
} from '../../../../platform/http/filters/feature-error.mapper';
import { ProblemDetailsFilter } from '../../../../platform/http/filters/problem-details.filter';
import { LeaderboardError } from '../../app/leaderboard.errors';

@Catch(LeaderboardError)
export class LeaderboardErrorFilter implements ExceptionFilter {
  private readonly problemDetailsFilter = new ProblemDetailsFilter();

  catch(exception: LeaderboardError, host: ArgumentsHost): void {
    applyRetryAfterHeader(host, exception.retryAfterSeconds);

    const mapped = mapFeatureErrorToProblem({
      status: exception.status,
      code: exception.code,
      detail: exception.message,
      issues: exception.issues,
      titleStrategy: 'status-default',
    });
    this.problemDetailsFilter.catch(mapped, host);
  }
}
