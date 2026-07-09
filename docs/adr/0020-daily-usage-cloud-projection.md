# 0020. Daily Usage Cloud Projection (Account-Driven)

- Status: Accepted
- Date: 2026-07-09
- Decision makers: Burnly API maintainers

## Context

Burnly desktop is local-first: collectors write to on-device SQLite and the tray
answers “how much today / this week / this month?” without an account.

Product wants web history and reports later (`burnly-web` / `app.burnly.dev`).
Desktop handoff docs describe what may leave the device and which HTTP collect
APIs the desktop will call. We need a backend decision on:

- what cloud stores,
- when data is allowed to leave the device (product framing),
- privacy defaults,
- how this relates to existing auth.

## Decision

### Cloud role

Cloud is an **opt-in-via-account projection of desktop daily usage facts**, not
a mirror of the full local SQLite database.

- **Source of truth for usage collection and reconciliation:** desktop (coding-tool
  logs → collectors → local SQLite).
- **Cloud role:** durable, queryable store for authenticated web reports and
  future aggregates (streaks/leaderboard later, separate consent if public).
- **v1 grain:** daily usage parents + daily model breakdown children only.
- **Sync direction v1:** desktop **push** after local work; server never pulls
  from the machine.

### Account is the cloud choice

There is **no** separate server-side `syncEnabled` product flag for v1.

- No account → no cloud usage storage for that user (local tracker still works).
- User creates/signs into a Burnly account when they want full reports on the web.
- Desktop may push daily aggregates while the user has a valid session.
- Desktop-local UX (last sync time, retry queue) is allowed; it is not a second
  consent layer beyond account.

Messaging to users (desktop/web) should explain that **account + signed-in
desktop** uploads **daily token totals by tool and model** for the reporting
timezone — not that a separate “enable sync” toggle is required.

### Privacy boundary (must enforce in API and storage)

**May store (v1, for signed-in users):**

- daily totals and model breakdown token fields
- cost fields when valid under desktop cost invariants
- product `sourceKey` and model identifiers
- aggregation / reporting timezone
- device metadata (client device id, platform, app version, display name)

**Must not store (v1 / never by default):**

| Data                                      | Rule       |
| ----------------------------------------- | ---------- |
| Project paths                             | Never      |
| Path fingerprints                         | Never (v1) |
| Source session ids / session rows         | Not in v1  |
| Collector raw JSON / protobuf             | Never      |
| Prompts / responses / source code / files | Never      |
| Credentials / API keys                    | Never      |
| Local SQLite integer PKs as identities    | Never      |
| Local diagnostics payloads                | No         |

Server validation must reject payloads that include forbidden free-text privacy
fields if clients send them by mistake (exact reject rules in collect DTO design).

### Feature placement

Implement as a vertical slice (name: `usage-sync` or `sync`) under
`libs/features/*` with domain/app/infra layering. Reuse existing first-party
auth, sessions, idempotency middleware, problem details, and OpenAPI gates.

### Collect contract authority

- Field names and collect endpoint shapes:
  `docs/planning/desktop-collect-api-requirements.md`
- Storage/privacy/multi-device background:
  `docs/planning/cloud-sync-backend-handoff.md`
- Identity and rolling-window rules: ADR `0021`

### Deferred

- Web read/report APIs (`GET /v1/usage/*`)
- Session explorer / hashed session sync
- Project display-name sync
- Public leaderboard metrics
- Cloud retention policy beyond “wipe on account deletion”

## Rationale

- Matches product: local-first utility, web for history after account.
- Avoids re-collecting from coding tools in the cloud.
- Daily grain matches tray authority and keeps payloads aggregate.
- Account as the gate is simpler than dual consent (account + sync toggle).
- Hard privacy exclusions protect the brand and match desktop guarantees.

## Consequences

Positive:

- Clear Phase B schema scope (devices + daily facts + models + batches).
- Auth stack already sufficient for collect authn.
- Web can later sum stored facts without desktop online.

Negative / costs:

- Desktop must implement push client later; backend alone does not show reports.
- Multi-device reporting semantics must be defined carefully (ADR 0021).
- Account deletion must wipe usage data (implementation in later phase).

## Alternatives Considered

1. **Full SQLite mirror** — rejected (privacy, size, useless session/path noise).
2. **Server-side re-collection from tools** — rejected (no credentials, not
   local-first, fragile).
3. **Separate syncEnabled server flag** — rejected for v1; account is enough.
4. **Session-level sync in v1** — deferred (identity + privacy complexity).

## Links / References

- Related ADRs: `0021-usage-sync-identity-and-devices.md`
- Related docs:
  - `docs/planning/desktop-collect-implementation-plan.md`
  - `docs/planning/desktop-collect-api-requirements.md`
  - `docs/planning/cloud-sync-backend-handoff.md`
  - `docs/core/project-profile.md`
