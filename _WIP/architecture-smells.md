# Architecture Smell Scan Report

Generated: 2026-09-09T13:22:53.973Z
Mode: CI
Baseline: tools/architecture-smells.baseline.json (not found)

## Summary

- High: 0
- Medium: 12
- Low: 0
- Total: 12
- New vs baseline: 12

## Medium

### oversized_orchestration_file (5)

- libs/features/leaderboard/app/get-leaderboard.service.ts:1 [new]
  - File has 360 LOC (threshold 350)
  - Snippet: `import type { Clock } from '../../../shared/time';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/usage-sync/app/get-usage-day.service.ts:1 [new]
  - File has 355 LOC (threshold 350)
  - Snippet: `import { ErrorCode } from '../../../shared/error-codes';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/usage-sync/app/push-daily-usage.service.ts:1 [new]
  - File has 518 LOC (threshold 350)
  - Snippet: `import type { Clock } from '../../../shared/time';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/usage-sync/infra/persistence/prisma-usage-read.repository.ts:1 [new]
  - File has 415 LOC (threshold 350)
  - Snippet: `import { Injectable } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`
- libs/features/users/infra/persistence/prisma-users.repository.ts:1 [new]
  - File has 420 LOC (threshold 350)
  - Snippet: `import { Inject, Injectable } from '@nestjs/common';`
  - Docs: `docs/standards/code-quality.md`

### worker_wall_clock_usage (7)

- apps/worker/src/jobs/emails.handlers.ts:33 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/emails.handlers.ts:110 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/emails.handlers.ts:237 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/push.worker.ts:62 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:80 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:126 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
- apps/worker/src/jobs/users-account-deletion.worker.ts:133 [new]
  - Worker/job code uses wall-clock time; review whether Clock injection or explicit now parameter is needed
  - Snippet: `const now = new Date();`
  - Docs: `docs/standards/code-quality.md`
