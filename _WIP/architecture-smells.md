# Architecture Smell Scan Report

Generated: 2026-07-09T14:23:54.425Z
Mode: CI
Baseline: tools/architecture-smells.baseline.json (not found)

## Summary

- High: 0
- Medium: 8
- Low: 0
- Total: 8
- New vs baseline: 8

## Medium

### oversized_orchestration_file (1)

- libs/features/usage-sync/app/push-daily-usage.service.ts:1 [new]
  - File has 500 LOC (threshold 350)
  - Snippet: `import type { Clock } from '../../../shared/time';`
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
