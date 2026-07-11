# ADR: Desktop auth via web handoff codes

- Status: Accepted
- Date: 2026-07-10
- Decision makers: Burnly API maintainers

## Context

Desktop must not host product login UI. Users sign in on burnly-web (Google now, GitHub later). Desktop needs first-party access + refresh tokens for collect APIs.

Putting refresh tokens in deep-link URLs is unsafe. Password login is not the desktop product path.

## Decision

burnly-api supports a **first-party desktop handoff**:

1. Authenticated web client creates a short-lived one-time code:  
   `POST /v1/auth/desktop/handoff` (Bearer)
2. Desktop exchanges the code with PKCE:  
   `POST /v1/auth/desktop/token` (public)
3. Exchange mints a **new Session** (separate refresh family from the browser)
4. Codes stored hashed in **Redis** with TTL (default 60s)
5. `redirectUri` must match a configured allowlist (`AUTH_DESKTOP_REDIRECT_URIS`)
6. PKCE S256 is required

## Rationale

- Matches WakaTime-style UX without sharing browser cookies with desktop
- Reuses existing session/token machinery
- Ephemeral codes fit Redis better than Postgres migrations

## Consequences

- Redis required for handoff in any environment that uses desktop login
- Web and desktop must implement create/exchange; API alone is insufficient UX
- New Auth error codes for invalid redirect / handoff / PKCE

## Alternatives Considered

- Tokens in deep link: rejected (leakage)
- Desktop GIS + `oidc/exchange` only: rejected as primary product path
- Postgres handoff table: deferred; Redis is enough for 60s TTL

## Links / References

- `docs/planning/desktop-auth-via-web.md`
- ADR 0005 first-party tokens, 0010 refresh rotation
