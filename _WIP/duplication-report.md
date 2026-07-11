# Duplication Report (core)

Generated: 2026-07-09T14:23:58.291Z
Raw report: .tmp/jscpd-core/jscpd-report.json
Allowlist: tools/duplication-allowlist.json

## Summary

- Raw duplicates: 16
- Self-file filtered out: 13
- Cross-file duplicates: 3
- Categorized duplicates: 1
- Uncategorized filtered out: 2
- Reviewed acceptable groups: 0
- Actionable duplicate groups: 1
- Unused allowlist entries: 0

## Actionable Category Breakdown

- Rate limiter helper: 1

## Actionable Groups

- [Rate limiter helper] libs/features/usage-sync/infra/rate-limit/redis-daily-usage-push-rate-limiter.ts:17 <> libs/features/users/infra/rate-limit/redis-profile-image-upload-rate-limiter.ts:18
  occurrences=1, maxLines=15, maxTokens=0

## Interpretation

Actionable means the duplicate matched a backend category and has not been reviewed as acceptable.
It does not automatically mean extract immediately; it means review the pattern before adding more parallel code.
Reviewed acceptable duplicates must stay explicit in the allowlist with rationale.
