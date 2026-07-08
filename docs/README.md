# Burnly API — Documentation

This repository is the production backend for Burnly (account, optional sync, and web product surfaces). It follows the shared backend template architecture and keeps docs as the source of truth for standards and workflows.

Code should follow these docs; if code and docs diverge, fix the mismatch.

## Navigation

- Core
  - `docs/core/project-overview.md`
  - `docs/core/project-profile.md`
  - `docs/core/project-stack.md`
  - `docs/core/project-architecture.md`
- Standards (normative)
  - `docs/standards/api-response-standard.md`
  - `docs/standards/security.md`
  - `docs/standards/code-quality.md`
  - `docs/standards/error-codes.md`
  - `docs/standards/pagination-filtering-sorting.md`
  - `docs/standards/authentication.md`
  - `docs/standards/configuration.md`
  - `docs/standards/database.md`
  - `docs/standards/queues-jobs.md`
  - `docs/standards/observability.md`
  - `docs/standards/reliability.md`
  - `docs/standards/testing-strategy.md`
  - `docs/standards/ci-cd.md`
- Archived standards (template-only, not active in Burnly)
  - `docs/standards/authorization-rbac.md`
- Guides (how-to)
  - `docs/contributing/commit-conventions.md`
  - `docs/guide/personalizing-a-project.md`
  - `docs/guide/getting-started.md`
  - `docs/guide/development-workflow.md`
  - `docs/guide/adding-a-feature.md`
  - `docs/guide/adding-an-endpoint.md`
  - `docs/guide/adding-a-job.md`
- Engineering (implementation notes)
  - `docs/engineering/README.md`
  - `docs/engineering/agent-pr-loop.md`
  - `docs/engineering/backend-runtime-evidence.md`
  - `docs/engineering/guardrails.md`
  - `docs/engineering/parallel-agent-workflow.md`
  - `docs/engineering/duplication-harness.md`
- Planning / desktop handoff
  - `docs/planning/cloud-sync-backend-handoff.md` — desktop schema, privacy, storage sketch
  - `docs/planning/desktop-collect-api-requirements.md` — APIs desktop will call (auth + push)
  - `docs/planning/desktop-collect-implementation-plan.md` — high-level end-to-end collect roadmap
  - ADRs for collect: `docs/adr/0020-daily-usage-cloud-projection.md`, `docs/adr/0021-usage-sync-identity-and-devices.md`
  - Phase C collect write path done: `docs/exec-plans/completed/2026-07-09_usage-sync-02-device-api.md`, `docs/exec-plans/completed/2026-07-09_usage-sync-03-daily-usage-push.md`
  - Phase D hardening done: `docs/exec-plans/completed/2026-07-09_usage-sync-04-idempotency-and-limits.md`, `docs/exec-plans/completed/2026-07-09_usage-sync-05-account-deletion-wipe.md`
  - Collect limits: `docs/engineering/usage-sync/collect-limits.md`
  - Phase D proposal: `docs/planning/usage-sync-phase-d-hardening-proposal.md`
- Execution plans
  - `docs/exec-plans/README.md`
  - `docs/exec-plans/_template.md`
  - `docs/exec-plans/tech-debt-tracker.md`
- ADRs (decision log)
  - `docs/adr/README.md`
  - `docs/adr/template.md`
- OpenAPI (generated)
  - `docs/openapi/README.md`

## Doc Conventions

- “**Standards**” are normative. If you want to deviate, add an ADR and document the exception.
- Prefer small, composable standards. Avoid one-off patterns that do not scale as the product grows.
- Keep docs implementation-aware (file paths, config keys, behaviors), but not code-dump heavy.
