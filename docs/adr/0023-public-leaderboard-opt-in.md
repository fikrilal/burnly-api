# 0023. Public Leaderboard (Opt-In, UTC Windows, Token Metric)

- Status: Accepted
- Date: 2026-07-23
- Decision makers: Burnly API maintainers

## Context

Burnly already stores **account-scoped daily usage facts** (ADR 0020 / 0021) for
authenticated private reports (`GET /v1/usage/*`). Product wants a **public
global leaderboard** so people can compare burn (tokens) over fixed windows.

ADR 0020 deferred public leaderboard metrics and required **separate consent**
if anything becomes public. Product decisions for v1 are recorded in
`docs/planning/leaderboard-api-handoff.md`. This ADR freezes backend rules so
implementation does not invent privacy or ranking semantics.

## Decision

### Separate consent (non-negotiable)

Public leaderboard participation is **opt-in**, default **on** (`leaderboardOptIn = true`), independent of:

- desktop daily usage push,
- private usage report APIs.

| Rule      | Detail                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------- |
| Default   | `leaderboardOptIn = true` (Public by default for new accounts)                                 |
| Opt-in    | Explicit authenticated settings write                                                          |
| Opt-out   | Immediate: subsequent public ranks must not include the user                                   |
| Messaging | Settings copy must state name, avatar, aggregated tokens, top tools/models may appear publicly |

Account + desktop sync alone must **not** place a user on the board.

### Board shape (v1)

| Decision         | Choice                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scope            | **Global** (not friends / org)                                                                                       |
| Metric           | **`tokens`** only                                                                                                    |
| Score            | `sum(DailyUsageFact.totalTokens)` for the user over the window, **all devices**, `recordState = active` only         |
| Parent authority | Do **not** sum model children for score (same as usage reports / ADR 0021)                                           |
| Windows          | `7d`, `30d`, `all` — edges in **UTC calendar dates** ending “today UTC”                                              |
| Visibility       | List is **public** (no auth required)                                                                                |
| Zero scores      | Opted-in users with score `0` are **excluded** from the list                                                         |
| Row identity     | `displayName` (never email), optional `avatarUrl`, stable public user id                                             |
| Row flavor       | Top **5** tools (`sourceKey`) + top **5** models by token sum in window                                              |
| Ranking          | **Unique ordinal** after stable sort: `totalTokens DESC`, then `userId ASC`; `rank` = position in sorted list (1..N) |
| Pagination       | Cursor-based; default `limit=50`, max `100`                                                                          |
| Empty board      | `200` with `entries: []` (not 404)                                                                                   |

### Window definitions (UTC)

| `window` | Inclusive range                                |
| -------- | ---------------------------------------------- |
| `7d`     | Last 7 UTC calendar days ending **today UTC**  |
| `30d`    | Last 30 UTC calendar days ending **today UTC** |
| `all`    | All projected daily facts stored for the user  |

“Today UTC” is the server calendar date in UTC at request time (or at
materialized rank generation time if a cache job is introduced later).

**Do not** use each user’s reporting / aggregation timezone for board edges.
Private dashboards may disagree with leaderboard windows; document that board
is UTC.

For `all`, `windowStartDate` is the earliest contributing fact date among listed
users (or `null` if empty); `windowEndDate` is today UTC.

### Public fields vs forbidden

**May appear when opted in:**

- display name (fallback policy below; never email),
- avatar URL if a **public** URL strategy exists for that user,
- total tokens for the window,
- top tool `sourceKey`s and top model labels / identity keys with token sums,
- opaque/public user id used for ranking stability and web highlight.

**Must never appear on leaderboard responses:**

- email,
- device ids / client device names,
- project paths, prompts, sessions, or any ADR 0020 forbidden fields,
- raw cost micros in v1 (cost metric deferred).

### Display name fallback

1. `UserProfile.displayName` if non-empty after trim
2. else join `givenName` + `familyName` if either present
3. else stable public handle derived from user id (e.g. `user_` + first 8 hex
   chars of UUID without hyphens) — **never email**

### Public user id (v1)

v1 returns the existing internal user UUID as `userId` in leaderboard rows.
Internal UUIDs are already used as account ids in authenticated APIs; they are
not secrets. A separate opaque `publicUserId` may be introduced later without
changing ranking logic (map id at the edge).

### Avatar (v1)

Profile image URLs today are **authenticated short-lived presigned** URLs
(`GET /v1/me/profile-image/url`). v1 leaderboard may:

- set `avatarUrl: null` for all rows, **or**
- only set `avatarUrl` when a public-readable strategy is implemented.

Shipping name-only rows is acceptable. Do not leak private storage object keys
or require anonymous clients to call authenticated image endpoints.

### Opt-in storage and settings surface

- Persist on `UserProfile` (or equivalent user-owned row):  
  `leaderboardOptIn Boolean @default(false)`  
  `leaderboardOptedInAt DateTime?` (set when transitioning to true; clear or
  leave historical — prefer set on true, clear on false for simplicity)
- **Preferred API:** extend `GET /v1/me` and `PATCH /v1/me` with:

```json
"leaderboard": { "optIn": false, "optedInAt": null }
```

`PATCH` accepts partial `{ "leaderboard": { "optIn": true } }` (alongside or
instead of existing `profile` patch fields as needed by DTO design).

### Public list API

```http
GET /v1/leaderboard?window=7d|30d|all&metric=tokens&limit=50&cursor=
```

- Auth: none required (`@Public()`).
- Optional Bearer: if valid access token present, include `data.viewer`:
  - opted in + score > 0 → row + rank (same shape as entries),
  - opted out → `{ "status": "opted_out" }`,
  - opted in + zero score → `{ "status": "no_activity" }`,
  - invalid token → treat as anonymous (omit viewer; do not 401 the list).
- `metric` other than `tokens` → `VALIDATION_FAILED` until a later ADR.
- Rate limit **stricter** than authenticated usage reads (IP-based Redis limiter).

### Computation strategy

v1 may **compute on read** from `DailyUsageFact` / `DailyModelUsageFact` with
tight aggregates + optional short response cache.

Materialized periodic ranks are allowed later for traffic; they must still honor
**current** `leaderboardOptIn` on serve (or delete on opt-out write).

### Account deletion

Existing account deletion / wipe must remove opt-in state (cascade with
profile) and any future materialized leaderboard rows. Deleted users disappear
from the board.

### Feature placement

- New vertical slice `libs/features/leaderboard/` for public list domain/app/infra
  **or** colocated read path under a dedicated feature module that depends on
  usage-sync **ports** / Prisma read adapters without breaking layer rules.
- Opt-in fields and me/settings remain in `libs/features/users/`.
- Platform must not depend on features; leaderboard may use usage facts via
  app ports or shared Prisma infra patterns consistent with boundary rules.

### Deferred (explicit non-goals)

- Friends / follows / org boards
- Cost or streak metrics (reserve `metric` query for later)
- Public profile pages beyond leaderboard row
- Real-time websockets
- Device-level ranking
- burnly-web UI (consumer; blocked until OpenAPI ships)

## Rationale

- Separate consent matches ADR 0020 privacy promise and marketing/social use of
  a public surface.
- UTC windows keep global “7d” comparable; reporting TZ would make the same
  query mean different intervals per user.
- Parent `totalTokens` authority reuses usage-report invariants and avoids
  double-count via model children.
- Unique ordinal ranking simplifies clients vs competition ranking ties.
- On-read aggregation avoids premature jobs while traffic is low.
- Name-only avatars avoid inventing a public object ACL in the first PR.

## Consequences

Positive:

- Clear privacy gate before any public aggregate ships.
- burnly-web can build against a stable contract.
- Reuses existing daily facts; desktop unchanged.

Negative / costs:

- Public unauthenticated endpoint needs abuse rate limiting and careful field
  allowlists.
- On-read aggregates may need indexes/cache as the opted-in population grows.
- Leaderboard totals can disagree with private dashboard windows (UTC vs
  reporting timezone) — product/docs must say so.
- Optional viewer requires soft-auth path (invalid token must not fail list).

## Alternatives Considered

| Alternative                      | Why not                                              |
| -------------------------------- | ---------------------------------------------------- |
| Implicit opt-in via account/sync | Violates ADR 0020 separate-consent requirement       |
| Friends-only board first         | Product wants global marketing/social v1             |
| Reporting-timezone windows       | Unfair / incomparable global ranks                   |
| Competition ranking (1,2,2,4)    | Harder clients; unique ordinal is enough for v1      |
| Opaque public id only            | Extra identity system before need; UUID ok for v1    |
| Require public avatars at launch | Blocks on storage ACL redesign                       |
| Materialized ranks only          | Premature ops complexity for empty/low traffic board |

## Links / References

- Related ADRs: `0020-daily-usage-cloud-projection.md`, `0021-usage-sync-identity-and-devices.md`, `0004-api-envelope-and-problem-details.md`
- Product handoff: `docs/planning/leaderboard-api-handoff.md`
- Exec plan: `docs/exec-plans/completed/2026-07-23_public-leaderboard.md`
- Standards: `docs/standards/api-response-standard.md`, `docs/standards/error-codes.md`, `docs/standards/pagination-filtering-sorting.md`
