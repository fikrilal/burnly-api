# Public Leaderboard API Handoff

## Status

**Draft handoff** for `burnly-api` (and later `burnly-web`).

| Layer                  | Status                                                                       |
| ---------------------- | ---------------------------------------------------------------------------- |
| Product decisions (v1) | Agreed in burnly-web planning conversation (2026-07-23)                      |
| ADR                    | **Accepted** — `docs/adr/0023-public-leaderboard-opt-in.md`                  |
| Exec plan              | **Completed** — `docs/exec-plans/completed/2026-07-23_public-leaderboard.md` |
| burnly-api             | **Shipped v1** — opt-in on me + public `GET /v1/leaderboard`                 |
| burnly-web             | Can consume OpenAPI; fill ranks when ready                                   |
| Desktop                | No change required for v1 (uses existing daily usage push)                   |

This document is **product + API contract input**. Implementation follows ADR
0023 + the completed exec plan.

Date: 2026-07-23  
Primary implementer repo: **burnly-api**  
Consumer repo: **burnly-web** (`/leaderboard`)  
Related:

- ADR 0023: `docs/adr/0023-public-leaderboard-opt-in.md` (consent, UTC, ranking)
- ADR 0020: `docs/adr/0020-daily-usage-cloud-projection.md` (public metrics =
  separate consent)
- Exec plan: `docs/exec-plans/completed/2026-07-23_public-leaderboard.md`
- Usage read contracts (web): burnly-web
  `docs/engineering/usage-report-api-contracts.md`
- Cloud sync handoff: `docs/planning/cloud-sync-backend-handoff.md`
- Users / profile image: `libs/features/users/`

## Why this exists

Burnly already projects **daily usage facts** (tokens, tools, models) into the
cloud for authenticated reports. Product wants a **public global leaderboard**
so people can compare burn (tokens) over fixed windows.

Reports APIs (`GET /v1/usage/*`) are **private to the signed-in user**. A
leaderboard is a different surface:

- **read is public** (marketing + social),
- **participation is opt-in** (privacy),
- rows are **aggregates**, not full private day dumps.

## Product decisions (v1)

| Decision            | Choice                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Scope               | **Global** ranking (not friends / org)                            |
| Primary metric      | **Total tokens** (sum of daily parent `totalTokens`)              |
| Later metrics       | Cost, streak — same skeleton, not in v1 API surface until defined |
| Windows             | **`7d`**, **`30d`**, **`all`** (all-time)                         |
| Visibility of board | **Public** — unauthenticated clients may list ranks               |
| Who appears         | Only users with **leaderboard opt-in = on** (default **off**)     |
| Row identity        | Avatar, display name                                              |
| Row metric          | Total tokens for the selected window                              |
| Row flavor          | Coding tools used + models used (top-N, capped)                   |

### Explicit non-goals (v1)

- Friends / follows / invite-only boards
- Cost or streak ranking
- Public profile pages beyond the leaderboard row
- Editing other users’ rows
- Real-time websocket updates
- Device-level ranking (account-level only)
- Project paths, prompts, session detail, or any ADR 0020 forbidden fields

## Privacy and consent (non-negotiable)

ADR 0020: cloud usage projection is **account-driven**; **public leaderboard
metrics require separate consent**.

| Rule                        | Detail                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Default                     | Leaderboard participation **off**                                                                                                               |
| Opt-in                      | Explicit authenticated setting; user must turn it on                                                                                            |
| Opt-out                     | Immediate removal from public ranks (next read must not include them)                                                                           |
| Public fields when opted in | Display name, avatar URL (if any), total tokens in window, top tool keys, top model labels                                                      |
| Never public                | Email, device ids, client device names, raw cost micros unless metric = cost later with its own rules, project paths, anything ADR 0020 forbids |

Messaging (web/desktop settings copy, later):

> Leaderboard is optional. When enabled, Burnly may show your display name,
> avatar, and aggregated token totals (and top tools/models) on the public
> leaderboard. Turn it off anytime.

Account + desktop sync alone must **not** put someone on the board.

## Ranking rules

### Metric (v1)

```text
score = sum(daily_usage_parent.totalTokens)
  over window
  for userId
  across all of that user's devices
```

- Parent daily totals are authoritative (same rule as usage reports).
- Do **not** sum model children for the score.
- Users with score `0` in the window should be **excluded** from the list
  (even if opted in).

### Windows

| `window` | Definition                                                 |
| -------- | ---------------------------------------------------------- |
| `7d`     | Inclusive last 7 calendar days ending **today UTC**        |
| `30d`    | Inclusive last 30 calendar days ending **today UTC**       |
| `all`    | All projected daily facts for the user (all-time on cloud) |

**Window timezone: UTC** for global fairness. Do not use each user’s reporting
timezone for board edges (that would make “7d” mean different intervals).

Notes:

- “Today UTC” is server calendar date in UTC when the request is handled (or
  when a materialized rank job ran — see caching).
- All-time is “all days stored in the projection,” not desktop install age.

### Ordering and ties

1. Order by `totalTokens` **DESC**.
2. Ties: stable secondary key `userId` **ASC** (deterministic).
3. Ranks are dense or competition-style — pick one and document in OpenAPI.
   Recommendation: **competition ranking** (1, 2, 2, 4) **or** unique rank by
   sort order (1..N). Prefer **unique ordinal after stable sort** for simpler
   clients: position in sorted list = `rank`.

### Caps on tools / models per row

Do not return unbounded arrays.

| Field    | Cap (v1)  | Rule                                                     |
| -------- | --------- | -------------------------------------------------------- |
| `tools`  | top **5** | By token sum within window; `sourceKey` strings          |
| `models` | top **5** | By token sum within window; display label + identity key |

Optional: `toolsTotal`, `modelsTotal` counts if more exist, so UI can show `+N`.

## Identity fields

| Field         | Source                 | Notes                                                                                                    |
| ------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `displayName` | User profile           | Fallback: given/family, then a safe public handle policy (e.g. truncated id) — **never email**           |
| `avatarUrl`   | Profile image (if set) | Nullable; public-readable URL or signed GET that does not require auth                                   |
| `userId`      | Internal               | Prefer **opaque public id** if user ids are sensitive; otherwise existing public user id if already safe |

If profile image is private today, leaderboard must either:

- serve a **public** avatar route for opted-in users, or
- omit avatar until that exists (name-only rows).

## API proposal

Base prefix: product `/v1` (same as existing controllers).

### 1) Public list

```http
GET /v1/leaderboard
  ?window=7d|30d|all
  &metric=tokens
  &limit=50
  &cursor=<opaque>
```

| Query    | Required | Rules                                                                                                     |
| -------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `window` | yes      | `7d` \| `30d` \| `all`                                                                                    |
| `metric` | no       | Default `tokens`. v1 only accepts `tokens`; reject others with `VALIDATION_FAILED` until cost/streak ship |
| `limit`  | no       | Default 50, max 100                                                                                       |
| `cursor` | no       | Opaque pagination; omit for first page                                                                    |

**Auth:** none required.

**Success:** standard envelope `{ "data": …, "meta"?: … }` per API response
standard.

#### Response shape (illustrative)

```json
{
  "data": {
    "window": "7d",
    "metric": "tokens",
    "windowStartDate": "2026-07-17",
    "windowEndDate": "2026-07-23",
    "generatedAt": "2026-07-23T13:00:00.000Z",
    "entries": [
      {
        "rank": 1,
        "userId": "usr_…",
        "displayName": "Ahmad Fikril",
        "avatarUrl": "https://…/profile-images/…",
        "totalTokens": "128400000",
        "tools": [
          { "sourceKey": "claude-code", "totalTokens": "90000000" },
          { "sourceKey": "codex", "totalTokens": "38400000" }
        ],
        "models": [
          {
            "modelIdentityKey": "claude-sonnet-4",
            "displayName": "Claude Sonnet 4",
            "totalTokens": "80000000"
          }
        ],
        "toolsOmitted": 0,
        "modelsOmitted": 1
      }
    ]
  },
  "meta": {
    "nextCursor": null
  }
}
```

Notes:

- Token fields may be `number | string` (bigint-safe), same as usage DTOs.
- `windowStartDate` / `windowEndDate` are UTC calendar dates; for `all`,
  `windowStartDate` may be null or earliest data date — pick one and document.
- Empty board: `entries: []` with **200** (not 404).

#### Errors

| Code                | When                               |
| ------------------- | ---------------------------------- |
| `VALIDATION_FAILED` | Bad window/metric/limit/cursor     |
| `RATE_LIMITED`      | Abuse protection (public endpoint) |
| `INTERNAL`          | Server failure                     |

### 2) Viewer context (optional but recommended)

Same list endpoint may accept optional Bearer token:

| If authenticated + opted in + has score | Include `data.viewer` with rank + same row shape |
| If authenticated + not opted in | `viewer: { status: "opted_out" }` |
| If authenticated + opted in + zero score | `viewer: { status: "no_activity" }` |
| If anonymous | omit `viewer` |

Keeps burnly-web from guessing rank client-side.

### 3) Opt-in preference (authenticated)

Prefer attaching to existing me/settings surface rather than a one-off domain
name, but either is fine if OpenAPI is clear.

**Option A — me patch (preferred if me already supports profile patches):**

```http
GET  /v1/me
PATCH /v1/me
```

Extend me payload:

```json
{
  "leaderboard": {
    "optIn": false,
    "optedInAt": null
  }
}
```

`PATCH` body (partial):

```json
{ "leaderboard": { "optIn": true } }
```

**Option B — dedicated settings resource:**

```http
GET  /v1/me/leaderboard-settings
PUT  /v1/me/leaderboard-settings
```

```json
{ "optIn": true }
```

**Auth:** Bearer required.  
**Default:** `optIn: false`.  
**Side effect:** `optIn: false` removes user from public ranks immediately
(materialized view/job must honor current flag on read or delete on write).

### 4) Future metrics (do not implement now)

Reserve query `metric`:

| Value    | Status | Notes                                                              |
| -------- | ------ | ------------------------------------------------------------------ |
| `tokens` | v1     | Sum of daily parent tokens                                         |
| `cost`   | later  | Needs cost completeness rules; may exclude partial costs           |
| `streak` | later  | Needs streak definition (UTC vs reporting TZ days with tokens > 0) |

## Data / implementation notes for burnly-api

### Inputs already available

| Need                | Source                                 |
| ------------------- | -------------------------------------- |
| Daily parent tokens | usage-sync daily facts                 |
| Tools               | parent `sourceKey` (or sources rollup) |
| Models              | daily model children                   |
| Display name        | users profile                          |
| Avatar              | users profile image pipeline           |

### Suggested approach

1. **Persist opt-in** on user/profile (boolean + `optedInAt`).
2. **Compute ranks** either:
   - **on read** with tight SQL/aggregates + cache (OK early), or
   - **materialized** periodic job per window (better when traffic grows).
3. Index for aggregates: `(userId, date)` on daily facts; filter users with
   `leaderboardOptIn = true`.
4. Cap tool/model fan-out in SQL (`ORDER BY tokens DESC LIMIT 5`) or post-process.
5. Public rate limit stricter than authenticated usage reads.

### Consistency

- Leaderboard totals for a user over `7d`/`30d` need not match that user’s
  private dashboard if dashboard uses **reporting timezone** windows — document
  that board is **UTC**.
- Multi-device: sum all devices for the account (same as default private reads
  without `deviceId`).

### Account deletion

Existing wipe rules must remove:

- opt-in flag / settings row,
- any materialized leaderboard rows,
- profile fields already wiped.

Opted-in users who delete accounts disappear from the board.

## burnly-web consumption (for implementers later)

Do **not** start filled UI until OpenAPI + this handoff are accepted.

When ready:

| Web surface                                  | API                                                               |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `GET /leaderboard` (public marketing or app) | `GET /v1/leaderboard?window=…`                                    |
| Settings toggle                              | me/settings opt-in endpoints                                      |
| App nav entry                                | only after public list works; optional “You” highlight via viewer |

Empty states:

- no entries → “No public ranks yet”
- signed-in, opted out → CTA to enable in settings
- signed-in, opted in, no activity → “Sync desktop usage to appear”

## Acceptance criteria (backend slice)

- [ ] Opt-in default off; authenticated toggle on/off
- [ ] Public `GET /v1/leaderboard` returns only opted-in users with score > 0
- [ ] Windows `7d` / `30d` / `all` use UTC edges as specified
- [ ] Metric `tokens` only; stable ordering + ranks
- [ ] Row includes name, optional avatar, totalTokens, top tools/models (capped)
- [ ] No email or forbidden privacy fields in response
- [ ] Opt-out removes user from subsequent public reads
- [ ] OpenAPI + contract tests + rate limit story
- [ ] Account deletion wipes participation

## Open questions (resolved in ADR 0023)

| #   | Question                         | Decision                                                        |
| --- | -------------------------------- | --------------------------------------------------------------- |
| 1   | Public id                        | Internal user UUID as `userId` for v1; opaque id later optional |
| 2   | Avatar                           | Name-only OK (`avatarUrl` null) until public URL strategy       |
| 3   | Rank style                       | Unique ordinal after stable sort (1..N)                         |
| 4   | Pagination                       | Cursor; default 50, max 100                                     |
| 5   | Cache / jobs                     | On-read v1; materialize later if needed                         |
| 6   | Display name empty               | displayName → given+family → `user_`+id prefix; never email     |
| 7   | Tool/model token splits for anon | Include capped totals (same row shape); not keys-only           |

## Recommendation (short)

| Decision      | Choice                                            |
| ------------- | ------------------------------------------------- |
| Board         | Public global list                                |
| Metric v1     | Tokens                                            |
| Windows       | 7d, 30d, all-time (UTC)                           |
| Participation | Explicit opt-in, default off                      |
| Row           | Avatar, name, total tokens, top tools, top models |
| Auth          | List public; settings authenticated               |
| Later         | Cost + streak as new `metric` values              |

Ship order:

```text
1. ADR (consent + UTC windows + ranking)
2. Schema: opt-in flag
3. Settings GET/PATCH
4. GET /v1/leaderboard (+ tests, OpenAPI, rate limit)
5. burnly-web page + toggle
```
